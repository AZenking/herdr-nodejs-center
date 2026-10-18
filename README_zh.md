[English](README.md) | [简体中文](README_zh.md)

# Server Center

[![Herdr Plugin](https://img.shields.io/badge/Herdr-Plugin-7c3aed)](https://herdr.dev/zh-cn/docs/plugins/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![LINUX DO](https://img.shields.io/badge/LINUX-DO-FFB003)](https://linux.do/)

> Herdr 插件 · 在弹窗面板中实时监控本地 Node.js / Bun / Deno 服务

Server Center 是一个面向 macOS 的第三方 [Herdr](https://herdr.dev/) 面板插件。它用一个 90% × 80% 的终端弹窗，实时展示本机正在运行的 Node.js、Bun、Deno 服务，包括监听地址与端口、运行时、PID、运行时长、项目目录，以及脱敏后的命令摘要。默认只显示处于 TCP LISTEN 状态的服务，按 `a` 可切换到显示全部运行时进程。

Herdr Plugin v1 无法添加原生侧边栏，因此本插件使用最接近的承载面：会话级终端弹窗（popup）。它每 2 秒自动刷新一次，使用 macOS 自带的 `ps` 与 `lsof` 发现进程和监听端口，零 npm 依赖。

## 关于 Herdr

[Herdr](https://herdr.dev/) 是面向编码智能体的终端运行时与工作区管理工具。Herdr Plugin v1 不是受限 SDK：插件本质上是一个包含 `herdr-plugin.toml` 和可执行命令的目录，由 Herdr 负责安装、manifest 校验、按键绑定、终端窗格、调用上下文与 socket 访问。本插件使用官方声明式 action、popup pane 和本地 socket API 实现，不修改 Herdr 本体。

## 定位与限制

- **仅支持 macOS**：依赖系统自带 `/bin/ps` 与 `/usr/sbin/lsof`，不支持 Linux / Windows。
- **仅支持三种运行时**：node、bun、deno。
- **仅显示 TCP LISTEN**：默认只列出处于监听状态的服务，不显示 UDP。
- **无原生侧栏**：以弹窗呈现，这是 Herdr Plugin v1 能提供的最接近的表面。
- **只读**：不会启动、停止、重启服务，也不会向任何进程发送信号。
- **脱敏展示**：出于隐私考虑不展示原始命令行参数（argv），只给出保守固定的命令摘要，避免泄露令牌/密码。

## 界面示意

```
┌──────────────────────────────────────────────────────────────────┐
│ Server Center   Node.js · Bun · Deno                             │
│ 2 listening · 50 runtime processes · listening only · 14:30 · 95ms│
│ RUNTIME  PID    UPTIME  ADDRESS:PORT       PROJECT     COMMAND   │
│ node     2336   25m     127.0.0.1:7265     /           node proc │
│ node    26667   18m     [::1]:5173         03-octo     node · Vit│ ← 选中行反色
│                                                                  │
│ cwd: /Users/developer/Projects/example                           │
│ Enter open pane · j/k scroll · a toggle all · r refresh · q close│
└──────────────────────────────────────────────────────────────────┘
```

## 功能

- 展示监听地址/端口、运行时、PID、运行时长、项目目录与安全的命令摘要。
- 默认只列监听服务；按 `a` 切换“仅监听”/“全部运行时进程”。
- 每 2 秒自动刷新，也可按 `r` 立即刷新。
- 按 `Enter` 关闭弹窗，并聚焦运行所选服务的 Herdr pane；无法映射到 Herdr pane 时给出提示。
- 只读：绝不停止或影响服务进程。
- 零 npm 依赖，无需 `npm install`。

## 环境要求

- Herdr 0.7.5 或更高
- macOS
- Node.js 18 或更高

## 快速开始

从 GitHub 安装并打开面板：

```sh
herdr plugin install AZenking/herdr-nodejs-center
herdr plugin action invoke open --plugin server-center
```

本地开发时，可以改用 `link` 挂载源码目录：

```sh
git clone https://github.com/AZenking/herdr-nodejs-center.git
cd herdr-nodejs-center
herdr plugin link "$PWD"
```

### 配置快捷键（可选）

在 `~/.config/herdr/config.toml` **顶层**追加一个数组表（`[[keys.command]]` 是顶层数组表，不要放在 `[keys]` 内部），然后重载配置：

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

如果你的 `prefix` 为 `ctrl+a`，打开方式就是：按 `Ctrl+A`，随后按 `Shift+S`。如果终端无法区分 `s` 与 `Shift+S`，请把 `key` 改成未占用的组合键，避免与现有 `prefix+s` 绑定冲突。

## 快捷键

| 按键 | 动作 |
| --- | --- |
| `Enter` | 关闭弹窗，并聚焦运行所选服务的 Herdr pane |
| `j` / `↓` | 选择下一个进程 |
| `k` / `↑` | 选择上一个进程 |
| `a` | 切换“仅监听”/“全部运行时进程” |
| `r` | 立即刷新 |
| `g` | 跳到第一个 |
| `G` | 跳到最后一个 |
| `q` / `Esc` / `Ctrl+C` | 关闭弹窗 |

## 数据列说明

| 列 | 说明 |
| --- | --- |
| `RUNTIME` | 运行时：`node` / `bun` / `deno` |
| `PID` | 进程 ID |
| `UPTIME` | 已运行时长（如 `25m`、`2h15m`、`3d5h`；仅在较宽终端显示） |
| `ADDRESS:PORT` | 监听的 TCP 地址与端口，多个以逗号分隔；无监听时显示 `—` |
| `PROJECT` | 进程工作目录（cwd）的目录名；无法解析时显示 `—` |
| `COMMAND` | 脱敏后的命令摘要（如 `node · Vite`、`bun · run`、`node process`） |

窄窗口会自动裁剪列以适配宽度；底部状态栏会显示当前选中进程的完整 `cwd`。

## 文档与分发

- [使用教程](docs/USAGE.md) — 详细的安装、配置、操作与排错指南
- [Herdr 插件文档](https://herdr.dev/zh-cn/docs/plugins/) — 官方 manifest、安装、运行时与安全说明
- [Herdr 插件市场](https://herdr.dev/plugins/) — 社区插件自动索引

本仓库是公开仓库，根目录包含 `herdr-plugin.toml`，并已添加 GitHub topic `herdr-plugin`，现已被 [Herdr 插件市场](https://herdr.dev/plugins/) 自动索引。被收录仅表示可发现，不代表 Herdr 官方审核或背书。安装第三方插件前，请先检查 manifest 和源码。

## 开发与验证

无需安装依赖，在插件源码根目录运行校验与快照：

```sh
cd <plugin-path>
npm run check       # 语法检查 + 单元测试
npm run snapshot    # 以 --once 模式打印当前服务列表（非交互快照）
```

## 卸载

GitHub 安装使用 `uninstall`，本地链接使用 `unlink`：

```sh
herdr plugin uninstall server-center  # GitHub 安装
herdr plugin unlink server-center     # 本地 link
```

如需同时移除快捷键，请删除 `~/.config/herdr/config.toml` 中对应的 `[[keys.command]]` 配置，并执行 `herdr server reload-config`。

## 安全与隐私

- 不展示原始 argv：命令行中可能包含令牌或凭据，本插件只会显示运行时 + 固定的命令摘要（如 `node · Vite`、`node process`）。
- 只读：不会向服务进程写入、发信号或执行任何管理操作。
- 数据仅在本机通过 `ps` / `lsof` 收集，不对外发送。

## 社区

本项目认可并感谢 [LINUX DO](https://linux.do/) 社区。项目与 LINUX DO、Herdr 官方均无隶属或背书关系。

## 许可证

[MIT](LICENSE)
