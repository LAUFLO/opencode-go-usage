# OpenCode Go Usage

A desktop plugin for [OpenCode](https://opencode.ai) that shows your **OpenCode Go** quota usage in real time — in the app window, not the TUI.

[中文说明](#中文说明)

## Features

- **Session header badge** — `Go 5h 2% · 周 2% · 月 1%` in every session title row.
- **Titlebar pill** — `Go 月 1%` in the window titlebar; click it to open the detail page.
- **Detail page** — three progress bars for the rolling 5-hour, weekly, and monthly windows, each with its reset time.
- **Command palette** — run `查看 OpenCode Go 用量` to jump to the detail page.
- **Live updates** — refreshes every 10 seconds; the server caches for 15 seconds and supports manual refresh.
- **No secrets in files** — the plugin reads the OpenCode Go credential already stored by OpenCode and never writes the API key anywhere.

## Requirements

- OpenCode Desktop **2.2.5 or newer** (V2 GUI plugin API).
- An **OpenCode Go** subscription, connected in OpenCode (`/connect` → OpenCode Go).
- Node.js 20+ and npm (only to install the plugin's server dependency).

## Install

Clone the repository into your global OpenCode plugins directory.

**macOS / Linux**

```bash
git clone https://github.com/LAUFLO/opencode-go-usage.git \
  ~/.config/opencode/plugins/opencode-go-usage
cd ~/.config/opencode/plugins/opencode-go-usage
npm install --omit=dev
```

**Windows (PowerShell)**

```powershell
git clone https://github.com/LAUFLO/opencode-go-usage.git "$env:USERPROFILE\.config\opencode\plugins\opencode-go-usage"
cd "$env:USERPROFILE\.config\opencode\plugins\opencode-go-usage"
npm install --omit=dev
```

The prebuilt `gui-experimental.cjs` is included, so you do not need to build the GUI just to use the plugin.

## Configure

Add the plugin to your **global** `opencode.jsonc` (usually `~/.config/opencode/opencode.jsonc`):

```jsonc
{
  "plugins": ["./plugins/opencode-go-usage"]
}
```

OpenCode Desktop reads plugins from `opencode.jsonc`, not `cli.json`. Save the file and reload the app window if the badge does not appear immediately.

## Usage

| Where | What you see |
| --- | --- |
| Session title row | `Go 5h 2% · 周 2% · 月 1%` |
| Window titlebar | `Go 月 1%`, click to open details |
| Settings / Command palette | Full progress bars, reset times, manual refresh |

Colors: green below 70%, amber from 70%, red from 90%. A window that reaches its limit is marked as rate-limited until it resets.

## How it works

The server part of the plugin resolves the active `opencode-go` integration through OpenCode's own integration API, then calls:

```text
GET https://opencode.ai/zen/go/v1/usage
```

The response contains percentage and reset time for three windows:

```json
{
  "usage": {
    "rolling": { "status": "ok", "percent": 2, "resetsAt": "2026-10-31T11:05:21.000Z" },
    "weekly": { "status": "ok", "percent": 2, "resetsAt": "2026-11-02T00:00:00.000Z" },
    "monthly": { "status": "ok", "percent": 1, "resetsAt": "2026-11-30T13:49:51.000Z" }
  }
}
```

The credential stays in the OpenCode server process. The GUI only receives percentages and timestamps through a plugin RPC method.

## Development

```bash
npm install
npm run build      # rebuilds gui-experimental.cjs
```

With `npm run build -- --watch`, OpenCode Desktop reloads the GUI in every window after each rebuild.

Project layout:

```text
index.ts                  Server part: credential, HTTP request, cache, RPC
src/rpc.ts                RPC contract shared by server and GUI
src/gui.tsx               Window part: titlebar, slot, settings page, command
src/gui/page.tsx          Detail page and badge components
vite.config.ts            Official @opencode/plugin/gui/vite preset
gui-experimental.cjs      Prebuilt GUI bundle loaded by Desktop
```

## Compatibility

Built and tested against OpenCode Desktop **2.2.5** on Windows. The GUI plugin API is marked experimental upstream, so a future Desktop release may require updating `@opencode/plugin` and rebuilding the bundle.

## License

MIT

---

## 中文说明

这是一个 **OpenCode Desktop 插件**，用来在桌面端实时显示 OpenCode Go 的额度使用情况，TUI 里看不到。

- **会话标题行**：显示 `Go 5h 2% · 周 2% · 月 1%`
- **窗口顶栏**：显示 `Go 月 1%`，点击打开详情页
- **详情页**：5 小时窗口、本周、本月三条进度条，带重置时间
- **命令面板**：搜索「查看 OpenCode Go 用量」
- **自动刷新**：每 10 秒一次，服务端缓存 15 秒，支持手动刷新
- **密钥安全**：直接复用 OpenCode 中已连接的 OpenCode Go 凭据，密钥不写入任何文件

安装：把仓库 clone 到 `~/.config/opencode/plugins/opencode-go-usage`（Windows 为 `%USERPROFILE%\.config\opencode\plugins\opencode-go-usage`），执行 `npm install --omit=dev`，然后在全局 `opencode.jsonc` 的 `plugins` 中加入 `"./plugins/opencode-go-usage"`。

前提是桌面端版本 ≥ 2.2.5，并且已经在 OpenCode 里连接了 OpenCode Go。
