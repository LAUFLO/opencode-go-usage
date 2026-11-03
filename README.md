# OpenCode Go Usage

A desktop plugin for [OpenCode](https://opencode.ai) that shows your **OpenCode Go** quota usage in real time — in the app window, not the TUI.

[中文说明](#中文说明)

## Features

- **Session header badge** — `Go 5h 2% · 周 2% · 月 1%` in every session title row.
- **Quota dashboard** — three windows with used/remaining percentages, reset countdown, 90% warning marker, and a 24-hour sparkline per window.
- **Today overview** — steps, prompts, sessions, tokens, Go requests, estimated spend, cache reads, and tool calls, with a day-over-day token comparison.
- **Trends** — 7-day steps and token charts, plus a 30-day steps chart.
- **Model breakdown** — per-model steps, input/output/cache tokens, and estimated spend, with Go-only/all-model and week/month switches.
- **Tool and session health** — tool success rate, failures, active days, streak, sessions, and subagents.
- **Console budgets** — when the app is signed in to OpenCode Console, its workspace budgets appear as progress rows.
- **Command palette** — run `查看 OpenCode Go 用量` to jump to the dashboard.
- **Live updates** — refreshes every 10 seconds by default (10/30/60 seconds switchable); the server caches for 15 seconds and supports manual refresh.
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
| Session right sidebar | Dashboard with quota windows, trends, model breakdown, and health |
| Command palette / `+` menu | Open the dashboard panel |

Click the badge in the session title row, or run **View OpenCode Go usage** from the command palette, to open the panel on the right side of the session. The panel stays pinned there; close the side region to hide it without losing the tab.

The dashboard combines two sources: the official OpenCode Go usage API for the three allowance percentages, and local OpenCode session statistics for everything else. The local numbers cover only this machine; other devices and clients are not included.

Dollar amounts are estimates from the official model price table. They include peak-hour multipliers (for example DeepSeek doubles during weekday UTC peak windows) and long-context price tiers (for example Grok above 200K tokens), but they are not a substitute for the Console bill. Models priced at zero are marked **免费**.

Each quota card also projects when the window would reach 100% at the current pace, using the official percentage and reset time. If the projection lands after the reset, it shows that the window will not run out this period.

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
index.ts                  Server part: credential, usage cache, 24h sampling, model prices, RPC
src/rpc.ts                RPC contract shared by server and GUI
src/gui.tsx               Window part: polling, stores, slot, side panel, command
src/gui/page.tsx          Dashboard layout: status, quota cards, today overview
src/gui/sections.tsx      Trends, model breakdown, health, Console budgets, notes
src/gui/charts.tsx        Sparkline, bar chart, stat tile, section helpers
src/gui/model-table.tsx   Per-model table and estimated cost
src/gui/stats.ts          Local session statistics loading and day caching
src/gui/format.ts         Number, token, money, time, and percent formatting
src/gui/types.ts          Dashboard types
src/gui/badge.tsx         Session header badge
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
- **额度仪表盘**：三个窗口的已用/剩余百分比、重置倒计时、90% 警戒线、24 小时迷你趋势线
- **今日概览**：steps、prompts、会话、tokens、Go 请求、估算消耗、缓存读取、工具调用，并与昨日对比
- **使用趋势**：近 7 天 steps 和 tokens 柱状图、近 30 天 steps 柱状图
- **按模型用量**：每个模型的 steps、输入/输出/缓存 token、估算消耗，可切换 Go/全部模型和本周/本月
- **工具与会话**：工具成功率、失败/未完成、活跃天数、连续天数、会话/子代理
- **Console 预算**：登录 OpenCode Console 后，工作区预算会以进度条显示
- **命令面板**：搜索「查看 OpenCode Go 用量」
- **自动刷新**：默认 10 秒，可切换 10/30/60 秒；服务端缓存 15 秒，支持手动刷新
- **密钥安全**：直接复用 OpenCode 中已连接的 OpenCode Go 凭据，密钥不写入任何文件

安装：把仓库 clone 到 `~/.config/opencode/plugins/opencode-go-usage`（Windows 为 `%USERPROFILE%\.config\opencode\plugins\opencode-go-usage`），执行 `npm install --omit=dev`，然后在全局 `opencode.jsonc` 的 `plugins` 中加入 `"./plugins/opencode-go-usage"`。

前提是桌面端版本 ≥ 2.2.5，并且已经在 OpenCode 里连接了 OpenCode Go。
