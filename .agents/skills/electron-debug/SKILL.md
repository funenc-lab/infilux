---
name: electron-debug
description: >
  Connect Playwright to the current Electron app through CDP (Chrome DevTools Protocol)
  to capture console output, evaluate JavaScript, take screenshots, and automate
  renderer debugging workflows.
---

# Electron CDP Debugging

Use Chrome DevTools Protocol to connect Playwright to a running Electron app in this repository.

## Prerequisites

- Playwright must be available in the environment where you run `cdp-connect.cjs`
- The CDP port must be free (default: `9222`)

## Workflow

### 1. Enable CDP in the Electron main entry

```bash
node .agents/skills/electron-debug/scripts/enable-cdp.cjs enable
```

Optional overrides:

```bash
node .agents/skills/electron-debug/scripts/enable-cdp.cjs enable --port 9223
node .agents/skills/electron-debug/scripts/enable-cdp.cjs enable --entry src/main/index.ts
```

The script inserts a marked `app.commandLine.appendSwitch('remote-debugging-port', '<port>')`
statement into the detected Electron main entry file so the change can be fully reverted later.

### 2. Start the app

For this repository, use:

```bash
pnpm dev
```

Wait until Electron prints a line similar to:

```text
DevTools listening on ws://127.0.0.1:9222/devtools/browser/<id>
```

### 3. Connect and inspect the renderer

Run the connector from any directory where `playwright` is installed:

```bash
node /absolute/path/to/project/.agents/skills/electron-debug/scripts/cdp-connect.cjs \
  --duration 5000 \
  --screenshot /tmp/infilux-electron.png \
  --eval "console.log('hello from Playwright')"
```

Parameters:

- `--port <N>`: CDP port, default `9222`
- `--duration <ms>`: how long to collect console messages, default `5000`
- `--screenshot <path>`: save a screenshot to the given path
- `--eval <code>`: evaluate JavaScript in the renderer page

### 4. Revert the CDP switch

```bash
node .agents/skills/electron-debug/scripts/enable-cdp.cjs disable
```

If you used a custom entry file, pass the same override during cleanup:

```bash
node .agents/skills/electron-debug/scripts/enable-cdp.cjs disable --entry src/main/index.ts
```

Always disable the CDP switch when you finish debugging so the change is not committed accidentally.

## Custom Playwright Scripts

For scenarios not covered by `cdp-connect.cjs`, use the same core pattern in a custom script:

```js
const { chromium } = require('playwright')

const res = await fetch('http://localhost:9222/json/version')
const { webSocketDebuggerUrl } = await res.json()
const browser = await chromium.connectOverCDP(webSocketDebuggerUrl)

const pages = browser.contexts()[0].pages()
const page = pages.find((candidate) => !candidate.url().startsWith('devtools://'))

// ... custom automation ...

browser.disconnect()
```

Use `browser.disconnect()` instead of `browser.close()` so Electron keeps running.
