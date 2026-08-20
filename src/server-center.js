#!/usr/bin/env node

"use strict";

const { spawn } = require("node:child_process");
const { writeSync } = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const REFRESH_INTERVAL_MS = 2_000;
const RUNTIMES = new Set(["node", "bun", "deno"]);
const PS_PATH = "/bin/ps";
const LSOF_PATH = "/usr/sbin/lsof";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

let requestSequence = 0;

function requestHerdr(method, params, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const socketPath = process.env.HERDR_SOCKET_PATH;
    if (!socketPath) {
      reject(new Error("Herdr socket is unavailable"));
      return;
    }

    const id = `server-center-${process.pid}-${Date.now()}-${requestSequence++}`;
    const socket = net.createConnection(socketPath);
    let buffer = "";
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error(`Herdr ${method} timed out`)), timeoutMs);

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ id, method, params })}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line) continue;

        let response;
        try {
          response = JSON.parse(line);
        } catch {
          continue;
        }
        if (response.id !== id) continue;
        if (response.error) {
          finish(new Error(response.error.message || response.error.code || `${method} failed`));
        } else {
          finish(null, response.result);
        }
        return;
      }
    });
    socket.on("error", (error) => finish(error));
    socket.on("end", () => {
      if (!settled) finish(new Error(`Herdr closed the ${method} request`));
    });
  });
}

function cleanText(value) {
  return value
    .replace(/\\0[0-7]{2}/g, " ")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function redactCommand(value, fallbackRuntime = null) {
  const tokens = cleanText(value).split(" ").filter(Boolean);
  if (tokens.length === 0) return "—";

  const runtimeIndex = tokens.findIndex((token) => {
    const name = path.basename(token).toLowerCase();
    return RUNTIMES.has(name);
  });
  const runtime = runtimeIndex >= 0
    ? path.basename(tokens[runtimeIndex]).toLowerCase()
    : fallbackRuntime || "runtime";
  const args = runtimeIndex >= 0 ? tokens.slice(runtimeIndex + 1) : [];

  // Never render raw argv values: dev commands may contain tokens or credentials.
  // Show only a conservative entrypoint summary that cannot include flag values.
  if (args[0] === "-e" || args[0] === "--eval" || args[0] === "-p" || args[0] === "--print") {
    return `${runtime} · inline script`;
  }

  const safeVerbs = new Set(["dev", "run", "serve", "start", "test", "watch"]);
  const entry = args.find((token) => !token.startsWith("-") && !token.includes("="));
  if (entry && safeVerbs.has(entry.toLowerCase())) return `${runtime} · ${entry.toLowerCase()}`;

  // Framework labels are fixed strings. Arbitrary argv content is never echoed.
  const normalized = args.join(" ").toLowerCase();
  const frameworks = [
    ["vue-cli-service", "Vue CLI"],
    ["vite", "Vite"],
    ["next", "Next.js"],
    ["nuxt", "Nuxt"],
    ["nest", "NestJS"],
    ["nodemon", "nodemon"],
    ["ts-node", "ts-node"],
    ["tsx", "tsx"],
  ];
  const framework = frameworks.find(([needle]) => normalized.includes(needle));
  return framework ? `${runtime} · ${framework[1]}` : `${runtime} process`;
}

function parsePs(output) {
  const processes = [];
  const pattern = /^\s*(\d+)\s+(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s+(.*)$/;

  for (const line of output.split("\n")) {
    const match = line.match(pattern);
    if (!match) continue;

    const runtime = match[4].toLowerCase();
    if (!RUNTIMES.has(runtime)) continue;

    const startedAt = Date.parse(match[3]);
    processes.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      runtime,
      startedAt: Number.isNaN(startedAt) ? null : startedAt,
      command: redactCommand(match[5], runtime),
      cwd: null,
      listeners: [],
    });
  }

  return processes;
}

function parseLsof(output) {
  const values = new Map();
  let currentPid = null;

  for (const line of output.split("\n")) {
    if (line.startsWith("p")) {
      const pid = Number(line.slice(1));
      currentPid = Number.isInteger(pid) ? pid : null;
      if (currentPid !== null && !values.has(currentPid)) values.set(currentPid, []);
    } else if (line.startsWith("n") && currentPid !== null) {
      values.get(currentPid).push(cleanText(line.slice(1)));
    }
  }

  return values;
}

async function collectLsof(pids, args) {
  const merged = new Map();
  const batchSize = 150;

  for (let index = 0; index < pids.length; index += batchSize) {
    const batch = pids.slice(index, index + batchSize);
    const result = await run(LSOF_PATH, [...args, "-p", batch.join(",")]);
    // lsof returns 1 when nothing matches; any parseable stdout is still useful.
    for (const [pid, values] of parseLsof(result.stdout)) {
      merged.set(pid, [...(merged.get(pid) || []), ...values]);
    }
  }

  return merged;
}

function findPaneIdForPid(pid, processInfos) {
  for (const info of processInfos) {
    if (info?.foreground_processes?.some((processInfo) => processInfo.pid === pid)) {
      return info.pane_id;
    }
  }
  return null;
}

async function findPaneForProcess(processInfo) {
  const paneList = await requestHerdr("pane.list", { workspace_id: null });
  const panes = paneList?.panes || [];
  const sameDirectory = [];
  const otherDirectories = [];

  for (const pane of panes) {
    const matchesDirectory = processInfo.cwd
      && (pane.foreground_cwd === processInfo.cwd || pane.cwd === processInfo.cwd);
    (matchesDirectory ? sameDirectory : otherDirectories).push(pane);
  }

  // Matching by cwd first keeps the common case fast. PID remains the authority.
  for (const candidates of [sameDirectory, otherDirectories]) {
    for (let index = 0; index < candidates.length; index += 8) {
      const batch = candidates.slice(index, index + 8);
      const results = await Promise.all(batch.map(async (pane) => {
        try {
          const result = await requestHerdr("pane.process_info", { pane_id: pane.pane_id });
          return result?.process_info || null;
        } catch {
          return null;
        }
      }));
      const paneId = findPaneIdForPid(processInfo.pid, results);
      if (paneId) return paneId;
    }
  }

  return null;
}

async function collectProcesses() {
  const ps = await run(PS_PATH, [
    "-A",
    "-o",
    "pid=",
    "-o",
    "ppid=",
    "-o",
    "lstart=",
    "-o",
    "ucomm=",
    "-o",
    "args=",
  ]);

  if (ps.code !== 0) {
    throw new Error(cleanText(ps.stderr) || `ps exited with status ${ps.code}`);
  }

  const processes = parsePs(ps.stdout);
  if (processes.length === 0) return processes;

  const pids = processes.map(({ pid }) => pid);
  const [cwdByPid, listenersByPid] = await Promise.all([
    collectLsof(pids, ["-a", "-d", "cwd", "-Fn"]),
    collectLsof(pids, ["-nP", "-a", "-iTCP", "-sTCP:LISTEN", "-Fn"]),
  ]);

  for (const item of processes) {
    item.cwd = cwdByPid.get(item.pid)?.[0] || null;
    item.listeners = [...new Set(listenersByPid.get(item.pid) || [])].sort();
  }

  return processes.sort((left, right) => {
    const listenerDifference = Number(right.listeners.length > 0) - Number(left.listeners.length > 0);
    return listenerDifference || left.runtime.localeCompare(right.runtime) || left.pid - right.pid;
  });
}

function formatAge(startedAt) {
  if (!startedAt) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h${String(minutes % 60).padStart(2, "0")}m`;
  return `${Math.floor(hours / 24)}d${hours % 24}h`;
}

function projectName(item) {
  if (item.cwd) return path.basename(item.cwd) || item.cwd;
  return "—";
}

function truncate(value, width) {
  if (width <= 0) return "";
  if (value.length <= width) return value.padEnd(width);
  if (width === 1) return "…";
  return `${value.slice(0, width - 1)}…`;
}

function formatTableRow(item, width) {
  const runtime = truncate(item.runtime, 7);
  const pid = String(item.pid).padStart(6);
  const ports = item.listeners.length > 0 ? item.listeners.join(",") : "—";
  const project = projectName(item);

  if (width < 78) {
    const portWidth = Math.max(12, width - 7 - 1 - 6 - 1 - 18 - 3);
    return `${runtime} ${pid} ${truncate(ports, portWidth)} ${truncate(project, 18)}`.slice(0, width);
  }

  if (width < 112) {
    const portWidth = 22;
    const projectWidth = 20;
    const commandWidth = Math.max(12, width - 7 - 1 - 6 - 1 - portWidth - 1 - projectWidth - 3);
    return `${runtime} ${pid} ${truncate(ports, portWidth)} ${truncate(project, projectWidth)} ${truncate(item.command, commandWidth)}`.slice(0, width);
  }

  const portWidth = Math.min(30, Math.floor(width * 0.22));
  const projectWidth = Math.min(26, Math.floor(width * 0.18));
  const commandWidth = Math.max(18, width - 7 - 1 - 6 - 1 - 9 - 1 - portWidth - 1 - projectWidth - 4);
  return `${runtime} ${pid} ${truncate(formatAge(item.startedAt), 9)} ${truncate(ports, portWidth)} ${truncate(project, projectWidth)} ${truncate(item.command, commandWidth)}`.slice(0, width);
}

function tableHeader(width) {
  const sample = {
    runtime: "RUNTIME",
    pid: "PID",
    startedAt: null,
    listeners: ["LISTEN"],
    cwd: "PROJECT",
    command: "COMMAND",
  };
  const row = formatTableRow(sample, width);
  return row
    .replace("     0", "   PID")
    .replace("LISTEN", "ADDRESS:PORT")
    .replace(formatAge(null), "UPTIME")
    .replace(path.basename(sample.cwd), "PROJECT");
}

function plainOutput(processes) {
  const services = processes.filter(({ listeners }) => listeners.length > 0);
  const rows = services.length > 0 ? services : processes;
  const width = Math.max(80, Math.min(160, process.stdout.columns || 120));
  console.log(`Server Center — ${services.length} listening / ${processes.length} runtime processes`);
  console.log(tableHeader(width));
  for (const item of rows) console.log(formatTableRow(item, width));
  if (rows.length === 0) console.log("No Node.js, Bun, or Deno processes found.");
}

async function runOnce() {
  const processes = await collectProcesses();
  plainOutput(processes);
}

function startTui() {
  const state = {
    processes: [],
    showAll: false,
    selected: 0,
    selectedPid: null,
    refreshing: false,
    activating: false,
    error: null,
    lastUpdated: null,
    durationMs: null,
    timer: null,
    closed: false,
    terminalActive: false,
  };

  const color = {
    reset: "\u001b[0m",
    bold: "\u001b[1m",
    dim: "\u001b[2m",
    cyan: "\u001b[36m",
    green: "\u001b[32m",
    red: "\u001b[31m",
    inverse: "\u001b[7m",
  };

  function visibleProcesses() {
    return state.showAll
      ? state.processes
      : state.processes.filter(({ listeners }) => listeners.length > 0);
  }

  function clampSelection(rows) {
    if (rows.length === 0) {
      state.selected = 0;
      state.selectedPid = null;
      return;
    }
    const matchingIndex = rows.findIndex(({ pid }) => pid === state.selectedPid);
    if (matchingIndex >= 0) state.selected = matchingIndex;
    state.selected = Math.max(0, Math.min(state.selected, rows.length - 1));
    state.selectedPid = rows[state.selected].pid;
  }

  function render() {
    if (state.closed) return;
    const width = Math.max(50, process.stdout.columns || 100);
    const height = Math.max(12, process.stdout.rows || 24);
    const rows = visibleProcesses();
    clampSelection(rows);

    const services = state.processes.filter(({ listeners }) => listeners.length > 0).length;
    const mode = state.showAll ? "all runtimes" : "listening only";
    const updated = state.lastUpdated
      ? `${state.lastUpdated.toLocaleTimeString()} · ${state.durationMs}ms`
      : "waiting";
    const lines = [
      `${color.bold}${color.cyan}Server Center${color.reset}  ${color.dim}Node.js · Bun · Deno${color.reset}`,
      `${color.green}${services} listening${color.reset} · ${state.processes.length} runtime processes · ${mode} · ${updated}`,
    ];

    if (state.error) {
      lines.push(`${color.red}${truncate(state.error, width).trimEnd()}${color.reset}`);
    } else if (state.activating) {
      lines.push(`${color.dim}Finding the service's Herdr pane…${color.reset}`);
    } else if (state.refreshing) {
      lines.push(`${color.dim}Refreshing…${color.reset}`);
    } else {
      lines.push("");
    }

    lines.push(`${color.bold}${tableHeader(width)}${color.reset}`);

    const tableHeight = Math.max(1, height - 8);
    let start = Math.max(0, state.selected - tableHeight + 1);
    if (rows.length <= tableHeight) start = 0;
    const page = rows.slice(start, start + tableHeight);

    if (page.length === 0) {
      const message = state.showAll
        ? "No Node.js, Bun, or Deno processes found."
        : "No listening services found. Press a to show every runtime process.";
      lines.push(`${color.dim}${message}${color.reset}`);
    } else {
      for (let index = 0; index < page.length; index += 1) {
        const absoluteIndex = start + index;
        const item = page[index];
        const row = formatTableRow(item, width);
        lines.push(absoluteIndex === state.selected ? `${color.inverse}${row}${color.reset}` : row);
      }
    }

    while (lines.length < height - 3) lines.push("");
    const selected = rows[state.selected];
    const location = selected?.cwd ? selected.cwd.replace(/^\/private\/tmp\//, "/tmp/") : "—";
    lines.push(`${color.dim}cwd: ${truncate(location, Math.max(1, width - 5)).trimEnd()}${color.reset}`);
    lines.push(`${color.dim}Enter open pane · ↑/↓ or j/k scroll · a toggle all · r refresh · q/Esc close${color.reset}`);

    process.stdout.write(`\u001b[H${lines.slice(0, height).join("\n")}\u001b[J`);
  }

  async function refresh() {
    if (state.refreshing || state.activating || state.closed) return;
    state.refreshing = true;
    state.error = null;
    render();
    const started = Date.now();
    try {
      state.processes = await collectProcesses();
      state.lastUpdated = new Date();
      state.durationMs = Date.now() - started;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      state.refreshing = false;
      render();
    }
  }

  async function activateSelectedProcess() {
    if (state.activating || state.closed) return;
    const selected = visibleProcesses()[state.selected];
    if (!selected) return;

    state.activating = true;
    state.error = null;
    render();
    try {
      const paneId = await findPaneForProcess(selected);
      if (!paneId) {
        state.error = "This service is not running in a Herdr pane.";
        return;
      }
      await requestHerdr("pane.focus", { pane_id: paneId });
      close();
    } catch (error) {
      state.error = `Unable to open pane: ${cleanText(error.message || String(error))}`;
    } finally {
      state.activating = false;
      render();
    }
  }

  function takeRestoreSequence() {
    if (!state.terminalActive) return null;
    state.terminalActive = false;
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    return "\u001b[?25h\u001b[0m\u001b[?1049l";
  }

  function restoreTerminalSync() {
    const sequence = takeRestoreSequence();
    if (!sequence) return;
    try {
      writeSync(1, sequence);
    } catch {
      // The host already closed the popup's terminal.
    }
  }

  function close(code = 0) {
    if (state.closed) return;
    state.closed = true;
    if (state.timer) clearInterval(state.timer);
    process.stdin.off("data", onInput);

    process.exitCode = code;
    process.stdin.pause();
    const sequence = takeRestoreSequence();
    if (sequence && !process.stdout.destroyed && process.stdout.writable) {
      process.stdout.write(sequence);
    }
  }

  function moveSelection(delta) {
    const rows = visibleProcesses();
    state.selected = Math.max(0, Math.min(state.selected + delta, rows.length - 1));
    state.selectedPid = rows[state.selected]?.pid ?? null;
    render();
  }

  function onInput(buffer) {
    const input = buffer.toString("utf8");
    if (input === "q" || input === "\u001b" || input === "\u0003") return close();
    if (state.activating) return;
    if (input === "\r" || input === "\n") return void activateSelectedProcess();
    if (input === "r") return void refresh();
    if (input === "a") {
      state.showAll = !state.showAll;
      state.selected = 0;
      state.selectedPid = null;
      return render();
    }
    if (input === "j" || input === "\u001b[B") return moveSelection(1);
    if (input === "k" || input === "\u001b[A") return moveSelection(-1);
    if (input === "g") {
      state.selected = 0;
      state.selectedPid = null;
      return render();
    }
    if (input === "G") {
      state.selected = Math.max(0, visibleProcesses().length - 1);
      state.selectedPid = visibleProcesses()[state.selected]?.pid ?? null;
      return render();
    }
  }

  process.stdout.write("\u001b[?1049h\u001b[?25l");
  state.terminalActive = true;
  process.stdin.setEncoding("utf8");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", onInput);
  process.stdin.on("end", () => close());
  process.stdout.on("resize", render);
  process.stdout.on("error", (error) => {
    if (error.code === "EPIPE") close();
    else close(1);
  });
  process.on("exit", restoreTerminalSync);
  process.on("uncaughtException", (error) => {
    restoreTerminalSync();
    console.error(`Server Center crashed: ${cleanText(error.message)}`);
    process.exit(1);
  });
  process.on("SIGINT", () => close(130));
  process.on("SIGTERM", () => close(143));
  process.on("SIGHUP", () => close(129));

  void refresh();
  state.timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
}

if (require.main === module) {
  if (process.argv.includes("--once") || !process.stdin.isTTY || !process.stdout.isTTY) {
    runOnce().catch((error) => {
      console.error(`Server Center failed: ${error.message}`);
      process.exit(1);
    });
  } else {
    startTui();
  }
}

module.exports = {
  cleanText,
  collectProcesses,
  findPaneIdForPid,
  findPaneForProcess,
  parseLsof,
  parsePs,
  redactCommand,
};
