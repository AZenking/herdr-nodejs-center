[English](README.md) | [简体中文](README_zh.md)

# Server Center

[![Herdr Plugin](https://img.shields.io/badge/Herdr-Plugin-7c3aed)](https://herdr.dev/docs/plugins/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![LINUX DO](https://img.shields.io/badge/LINUX-DO-FFB003)](https://linux.do/)

> Herdr Plugin · Real-time monitoring for local Node.js / Bun / Deno services in a popup panel

Server Center is a third-party [Herdr](https://herdr.dev/) panel plugin for macOS. It provides a 90% × 80% terminal popup to monitor running Node.js, Bun, and Deno services in real time, displaying listening addresses & ports, runtime, PID, uptime, project directory, and sanitized command summaries. By default, it only lists services in the TCP LISTEN state; press `a` to toggle between listening-only and all runtime processes.

Because Herdr Plugin v1 does not support native sidebar panes, this plugin utilizes the closest available surface: a session-level terminal popup. It auto-refreshes every 2 seconds, discovering processes and listening ports using macOS's built-in `ps` and `lsof`, with zero npm dependencies.

## About Herdr

[Herdr](https://herdr.dev/) is a terminal runtime and workspace management tool designed for coding agents. Herdr Plugin v1 is not a restrictive SDK: a plugin is simply a directory containing `herdr-plugin.toml` and executable commands. Herdr manages installation, manifest validation, keybindings, terminal panes, invocation context, and socket access. This plugin is built using official declarative actions, popup panes, and local socket APIs without modifying Herdr core.

## Scope and Limitations

- **macOS Only**: Relies on system `/bin/ps` and `/usr/sbin/lsof`; Linux and Windows are not supported.
- **Three Runtimes Only**: Supports `node`, `bun`, and `deno`.
- **TCP LISTEN Only**: Lists services in the listening state by default; UDP is not displayed.
- **No Native Sidebar**: Rendered in a popup pane, which is the closest surface supported by Herdr Plugin v1.
- **Read-Only**: Does not start, stop, or restart services, nor does it send any signals to processes.
- **Sanitized Display**: Does not expose raw command-line arguments (argv) for privacy and security, showing only conservative, fixed command summaries to prevent token/credential leaks.

## Interface Preview

```
┌──────────────────────────────────────────────────────────────────┐
│ Server Center   Node.js · Bun · Deno                             │
│ 2 listening · 50 runtime processes · listening only · 14:30 · 95ms│
│ RUNTIME  PID    UPTIME  ADDRESS:PORT       PROJECT     COMMAND   │
│ node     2336   25m     127.0.0.1:7265     /           node proc │
│ node    26667   18m     [::1]:5173         03-octo     node · Vit│ ← Highlighted selected row
│                                                                  │
│ cwd: /Users/developer/Projects/example                           │
│ Enter open pane · j/k scroll · a toggle all · r refresh · q close│
└──────────────────────────────────────────────────────────────────┘
```

## Features

- Displays listening address/port, runtime, PID, uptime, project directory, and safe command summaries.
- Defaults to listening services only; press `a` to toggle between "listening only" and "all runtime processes".
- Auto-refreshes every 2 seconds; press `r` to refresh immediately.
- Press `Enter` to close the popup and focus the Herdr pane running the selected service (displays a notice if the service cannot be mapped to a Herdr pane).
- Read-only: never terminates or disrupts service processes.
- Zero npm dependencies; no `npm install` required.

## Requirements

- Herdr 0.7.5 or higher
- macOS
- Node.js 18 or higher

## Quick Start

Install from GitHub and launch the panel:

```sh
herdr plugin install AZenking/herdr-nodejs-center
herdr plugin action invoke open --plugin server-center
```

For local development, use `link` to mount the source directory:

```sh
git clone https://github.com/AZenking/herdr-nodejs-center.git
cd herdr-nodejs-center
herdr plugin link "$PWD"
```

### Configure Keybinding (Optional)

Append an array of tables at the **top level** of `~/.config/herdr/config.toml` (`[[keys.command]]` is a top-level array of tables; do not place it under `[keys]`), then reload the configuration:

```toml
[[keys.command]]
key = "prefix+shift+s"
type = "plugin_action"
command = "server-center.open"
description = "open Server Center"
```

```sh
herdr server reload-config
```

If your `prefix` is `ctrl+a`, the shortcut sequence is: press `Ctrl+A`, followed by `Shift+S`. If your terminal cannot distinguish between `s` and `Shift+S`, change `key` to an available key combination to avoid conflicts with any existing `prefix+s` binding.

## Keybindings

| Key | Action |
| --- | --- |
| `Enter` | Close popup and focus the Herdr pane running the selected service |
| `j` / `↓` | Select next process |
| `k` / `↑` | Select previous process |
| `a` | Toggle "listening only" / "all runtime processes" |
| `r` | Refresh immediately |
| `g` | Jump to first |
| `G` | Jump to last |
| `q` / `Esc` / `Ctrl+C` | Close popup |

## Column Reference

| Column | Description |
| --- | --- |
| `RUNTIME` | Runtime: `node` / `bun` / `deno` |
| `PID` | Process ID |
| `UPTIME` | Elapsed runtime (e.g., `25m`, `2h15m`, `3d5h`; shown only on wider terminals) |
| `ADDRESS:PORT` | Listening TCP addresses and ports, comma-separated; shows `—` when not listening |
| `PROJECT` | Directory name of the process working directory (`cwd`); shows `—` if unresolved |
| `COMMAND` | Sanitized command summary (e.g., `node · Vite`, `bun · run`, `node process`) |

Columns are automatically trimmed to fit narrow terminal windows. The bottom status bar displays the full `cwd` of the currently selected process.

## Documentation & Distribution

- [Usage Guide](docs/USAGE.md) — Detailed installation, configuration, operation, and troubleshooting guide (in Chinese)
- [Herdr Plugin Documentation](https://herdr.dev/docs/plugins/) — Official manifest, installation, runtime, and security guide
- [Herdr Plugin Marketplace](https://herdr.dev/plugins/) — Community plugin registry

This repository is public, includes `herdr-plugin.toml` at the root, and has the GitHub topic `herdr-plugin`. It is automatically indexed by the [Herdr Plugin Marketplace](https://herdr.dev/plugins/). Indexing indicates discoverability only and does not imply official verification or endorsement by Herdr. Always inspect the manifest and source code before installing third-party plugins.

## Development & Verification

No dependencies needed. Run validation and snapshot tests from the plugin root:

```sh
cd <plugin-path>
npm run check       # Syntax checks + unit tests
npm run snapshot    # Print current service list in --once mode (non-interactive snapshot)
```

## Uninstallation

Use `uninstall` for GitHub installations, or `unlink` for local links:

```sh
herdr plugin uninstall server-center  # Installed via GitHub
herdr plugin unlink server-center     # Linked locally
```

To remove the keybinding as well, delete the corresponding `[[keys.command]]` entry from `~/.config/herdr/config.toml` and run `herdr server reload-config`.

## Security & Privacy

- **No Raw argv Display**: Command lines may contain tokens or secrets. The plugin only displays runtime + fixed command summaries (e.g., `node · Vite`, `node process`).
- **Read-Only**: Does not write to, send signals to, or perform any management actions on service processes.
- **Local Only**: Information is collected strictly on the local machine via `ps` and `lsof`, and is never transmitted externally.

## Community

This project acknowledges and thanks the [LINUX DO](https://linux.do/) community. This project has no official affiliation with or endorsement from LINUX DO or Herdr.

## License

[MIT](LICENSE)
