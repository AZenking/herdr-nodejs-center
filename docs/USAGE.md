# Server Center 使用教程

本教程面向使用 Herdr 的开发者，介绍如何安装、配置并高效使用 Server Center 面板监控本地 Node.js / Bun / Deno 服务。

> 相关概览与定位说明见 [README](../README.md)。

---

## 1. 前置条件检查

在开始之前，请确认以下条件满足：

**Herdr 版本 ≥ 0.7.5**

```sh
herdr --version
```

**macOS**：插件依赖系统自带的 `/bin/ps` 与 `/usr/sbin/lsof`，仅支持 macOS。

**Node.js ≥ 18**：

```sh
node --version
```

> Herdr 会使用系统 `PATH` 中的 Node.js（≥ 18）启动 Server Center；插件本身零 npm 依赖，无需执行 `npm install`。

也可以进入插件源码根目录，快速验证插件是否健康：

```sh
cd <plugin-path>
npm run check
npm run snapshot
```

---

## 2. 安装 / 链接

### 2.1 从 GitHub 安装（推荐）

```sh
herdr plugin install AZenking/herdr-nodejs-center
```

Herdr 会展示插件来源和将要执行的命令；确认来源可信后继续安装。

### 2.2 本地开发链接

需要直接修改源码时，克隆仓库并使用 `link` 挂载工作目录：

```sh
git clone https://github.com/AZenking/herdr-nodejs-center.git
cd herdr-nodejs-center
herdr plugin link "$PWD"
```

也可以链接任意已有源码目录：

```sh
herdr plugin link <plugin-path>
```

确认安装成功：

```sh
herdr plugin list
```

应当能看到启用的 `server-center (Server Center)`。GitHub 安装会标记为 `github:...`，本地链接会标记为 `local:<plugin-path>`。

> 若本地源码目录移动过位置，请先 `herdr plugin unlink server-center`，再对新路径重新 `link`。

---

## 3. 配置快捷键

### 3.1 直接打开（无需快捷键）

不配置快捷键也可以随时打开面板：

```sh
herdr plugin action invoke open --plugin server-center
```

### 3.2 添加全局快捷键

编辑配置文件 `~/.config/herdr/config.toml`。

**重要**：`[[keys.command]]` 是**顶层数组表**，位于文件顶层，**不要**把它写进 `[keys]` 内部。在 `[keys]` 表结束之后（或任意顶层位置）追加：

```toml
[[keys.command]]
key = "prefix+shift+s"
type = "plugin_action"
command = "server-center.open"
description = "open Server Center"
```

各字段含义：

| 字段 | 说明 |
| --- | --- |
| `key` | 触发键。`prefix+shift+s` 表示“prefix 后按 Shift+S” |
| `type` | 固定为 `plugin_action` |
| `command` | 要调用的插件动作，格式为 `<plugin-id>.<action-id>`。本插件动作 ID 为 `open` |
| `description` | 该快捷键的说明文字 |

### 3.3 快捷键的实际按键

`key = "prefix+shift+s"` 中的 `prefix` 是你在 `[keys]` 中配置的 `prefix`。本机配置为：

```toml
[keys]
prefix = "ctrl+a"
```

因此实际按键序列是：

1. 按下 `Ctrl+A`（prefix）
2. 再按 `Shift+S`（大写 `S`）

即：**`Ctrl+A` → `Shift+S`**。

如果修改了 prefix（例如改为 `ctrl+b`），那么打开方式相应变为 `Ctrl+B → Shift+S`。如果你的终端不能区分 `s` 与 `Shift+S`，请改用其他未占用的组合键，避免与 `prefix+s` 等已有绑定冲突。

---

## 4. 重载配置

修改 `config.toml` 后，需要让运行中的 Herdr 重新加载配置：

```sh
herdr server reload-config
```

重载后即可立即使用新快捷键。

---

## 5. 启动服务并打开面板

1. 正常启动你要监控的服务（例如 `node server.js`、`bun run dev`、`deno serve main.ts`）。
2. 打开面板：

   - 快捷键方式：`Ctrl+A` → `Shift+S`
   - 命令行方式：`herdr plugin action invoke open --plugin server-center`

3. 面板打开后，默认只显示处于 **TCP LISTEN** 状态的 node / bun / deno 服务。启动但尚未监听的服务不会出现在默认列表里。

---

## 6. 筛选与跳转

| 操作 | 效果 |
| --- | --- |
| `a` | 在“仅监听”与“全部运行时进程”之间切换 |
| `j` / `↓` | 选中下一行 |
| `k` / `↑` | 选中上一行 |
| `g` | 跳到第一行 |
| `G` | 跳到最后一行 |
| `r` | 立即刷新（面板本身每 2 秒也会自动刷新） |
| `q` / `Esc` / `Ctrl+C` | 关闭弹窗，不切换 pane |

**聚焦到服务所在的 Herdr pane**：

1. 用 `j` / `k`（或方向键）选中目标服务。
2. 按 `Enter`。

效果：弹窗关闭，Herdr 聚焦到运行该服务的那个 pane。

- 如果该服务运行在某个 Herdr pane 的**前台进程组**中，会直接跳转过去。
- 如果找不到对应 pane（例如进程不是由 Herdr 启动的），面板顶部的状态行会以红字提示：
  `This service is not running in a Herdr pane.`

> 匹配逻辑：优先按进程工作目录（cwd）缩小候选 pane，再逐一比对 `foreground_processes` 的 PID，以 PID 为准。

---

## 7. 命令行方式（一次性快照）

面板运行在弹窗里，每 2 秒自动刷新。如果你只需要在终端里看一次当前状态，可以直接用快照模式：

```sh
npm run snapshot
# 等价于：
node src/server-center.js --once
```

输出类似：

```text
Server Center — 2 listening / 50 runtime processes
RUNTIME    PID UPTIME         ADDRESS:PORT                     PROJECT               COMMAND
node      2336 25m       127.0.0.1:7265             /                     node process
node     26667 18m       [::1]:5173                 03-octo               node · Vite
```

---

## 8. 常见问题（FAQ）

**Q：打开后一片空白 / “No listening services found.”**

- 确认是否有 node / bun / deno 进程正在监听 TCP 端口。
- 默认只显示监听中的服务；按 `a` 查看全部运行时进程。
- “全部运行时进程”通常至少会包含 Server Center 自身的 Node.js 进程；如果除它之外没有其他条目，说明当前没有其他 node / bun / deno 进程。

**Q：按 `Enter` 提示 “This service is not running in a Herdr pane.”**

- 该服务不是由 Herdr 的 pane 启动的（例如在外部终端启动）。
- 只有运行在 Herdr pane 前台进程组中的服务才能被聚焦跳转。

**Q：为什么命令列只显示 `node process` / `node · Vite`，看不到完整命令？**

- 出于安全考虑，插件刻意脱敏，不展示原始 argv，避免泄露令牌、密码等敏感内容。这是设计行为，不是 bug。

**Q：修改了 `config.toml` 但快捷键没生效？**

- 确认 `[[keys.command]]` 写在**顶层**，而不是 `[keys]` 内部。
- 确认执行过 `herdr server reload-config`。
- 确认 prefix 与你的实际按键一致（本机为 `ctrl+a`，即 `Ctrl+A → Shift+S`）。

**Q：为什么看不到 UDP 服务？**

- 插件只查询 TCP LISTEN 状态，不显示 UDP。这是设计范围。

**Q：会重启/停止我的服务吗？**

- 不会。插件是只读的，不发送任何信号，也不执行进程管理操作。

---

## 9. 排错命令

```sh
# 确认插件已安装且启用
herdr plugin list

# 手动打开面板，验证动作是否可用
herdr plugin action invoke open --plugin server-center

# 校验插件源码语法与单元测试
npm run check

# 非交互快照，验证数据采集是否正常
npm run snapshot

# 查看插件运行日志（若面板打不开）
herdr plugin log list --plugin server-center
```

---

## 10. 更新与卸载

**更新 GitHub 安装**：Herdr Plugin v1 没有独立的 `update` 命令；重新安装同一来源即可刷新托管副本：

```sh
herdr plugin install AZenking/herdr-nodejs-center
```

**更新本地链接**：修改 `src/` 下的运行时代码后，新打开的面板会直接使用最新文件；如果修改了 `herdr-plugin.toml` 或移动了插件目录，请重新执行：

```sh
herdr plugin unlink server-center
herdr plugin link <plugin-path>
```

**卸载 GitHub 安装**：

```sh
herdr plugin uninstall server-center
```

**移除本地链接**：

```sh
herdr plugin unlink server-center
```

如需彻底移除快捷键，删除 `~/.config/herdr/config.toml` 中对应的 `[[keys.command]]` 段，再执行：

```sh
herdr server reload-config
```

---

## 11. 安全与隐私

- **不展示原始 argv**：进程命令行中可能包含令牌或凭据。插件只显示“运行时 + 固定的命令摘要”（如 `node · Vite`、`bun · run`、`node process`），任何任意参数值都不会回显。
- **只读**：不向进程写数据、不发信号、不做进程管理。
- **本地数据**：所有信息来自本机 `ps` / `lsof`，不上传、不发送到任何外部服务。

---

## 12. 工作原理

1. **进程发现**：调用 `/bin/ps -A`，按 `ucomm` 精确匹配 `node` / `bun` / `deno`（避免 `powerd` 之类的误命中），解析 PID、PPID、启动时间、命令。
2. **信息补充**：对收集到的 PID 分批调用 `/usr/sbin/lsof`：
   - `-a -d cwd -Fn` 获取工作目录（cwd）；
   - `-nP -a -iTCP -sTCP:LISTEN -Fn` 获取监听中的 TCP 地址与端口。
3. **脱敏**：`redactCommand` 只输出固定摘要，绝不回显 argv 值。
4. **排序**：优先显示有监听的进程，其次按运行时、PID 排序。
5. **刷新**：TUI 模式下每 2 秒（`REFRESH_INTERVAL_MS = 2000`）重新采集一次；`--once` 模式只采集一次并打印文本表格。
6. **跳转 pane**：通过 Herdr 的 JSON-over-socket 协议（`HERDR_SOCKET_PATH`）调用 `pane.list` / `pane.process_info` / `pane.focus`，按 cwd 缩小范围、以 PID 为准定位前台进程组，找到后关闭弹窗并聚焦对应 pane。

---

## 参考

- 功能总览与快捷键速查：[README](../README.md)
