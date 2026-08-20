#!/usr/bin/env node

"use strict";

const { spawnSync } = require("node:child_process");

const herdr = process.env.HERDR_BIN_PATH || "herdr";
const result = spawnSync(
  herdr,
  [
    "plugin",
    "pane",
    "open",
    "--plugin",
    process.env.HERDR_PLUGIN_ID || "server-center",
    "--entrypoint",
    "dashboard",
    "--focus",
  ],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(`Unable to open Server Center: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
