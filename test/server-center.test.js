"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  cleanText,
  findPaneIdForPid,
  parseLsof,
  parsePs,
  redactCommand,
} = require("../src/server-center");

test("parsePs keeps exact runtimes and excludes substring false positives", () => {
  const fixture = [
    "  101    1 Wed Aug 19 16:00:00 2026     node             node /app/node_modules/vite/bin/vite.js --port 3000",
    "  102    1 Wed Aug 19 16:00:01 2026     bun              /Users/dev/.bun/bin/bun run dev",
    "  103    1 Wed Aug 19 16:00:02 2026     deno             deno serve main.ts",
    "  104    1 Wed Aug 19 16:00:03 2026     powerd           /System/Foo.bundle/powerd",
  ].join("\n");

  const processes = parsePs(fixture);
  assert.deepEqual(processes.map(({ pid, runtime }) => [pid, runtime]), [
    [101, "node"],
    [102, "bun"],
    [103, "deno"],
  ]);
  assert.equal(processes[0].command, "node · Vite");
  assert.equal(processes[1].command, "bun · run");
});

test("parseLsof groups names by pid and removes terminal escapes", () => {
  const parsed = parseLsof(
    "p101\nf22\nn127.0.0.1:3000\nf23\nn[::1]:3000\np102\nfcwd\nn/private/tmp/\u001b[31mapp\u001b[0m\n",
  );
  assert.deepEqual(parsed.get(101), ["127.0.0.1:3000", "[::1]:3000"]);
  assert.deepEqual(parsed.get(102), ["/private/tmp/app"]);
});

test("findPaneIdForPid matches a service in a pane foreground process group", () => {
  const paneId = findPaneIdForPid(303, [
    { pane_id: "w0:p1", foreground_processes: [{ pid: 101 }, { pid: 102 }] },
    { pane_id: "w1:p4", foreground_processes: [{ pid: 301 }, { pid: 303 }] },
  ]);
  assert.equal(paneId, "w1:p4");
  assert.equal(findPaneIdForPid(999, []), null);
});

test("redactCommand never echoes arbitrary argument values", () => {
  const command = redactCommand("node server.js --token super-secret-value API_KEY=another-secret");
  assert.equal(command, "node process");
  assert.equal(command.includes("super-secret-value"), false);
  assert.equal(command.includes("another-secret"), false);
  assert.equal(redactCommand("node -e console.log('private')"), "node · inline script");
});

test("cleanText removes escaped and literal control characters", () => {
  assert.equal(cleanText("node -e \\012const\nvalue\t= 1"), "node -e const value = 1");
});
