# Electron CDP Notes

## Connection Mode

Playwright `connectOverCDP` must use the `ws://` WebSocket endpoint, not the `http://` endpoint directly.

Fetch the browser metadata first:

```text
GET http://localhost:9222/json/version
-> { "webSocketDebuggerUrl": "ws://localhost:9222/devtools/browser/<id>" }
```

Then connect with:

```js
const browser = await chromium.connectOverCDP(wsUrl)
```

## Enumerating Pages

After connecting, inspect pages through the browser contexts:

```js
const pages = browser.contexts().flatMap((context) => context.pages())
```

In a typical Electron development session you may see:

| Page | URL pattern | Notes |
|------|-------------|-------|
| Renderer window | `http://localhost:<port>/...` | Target app UI |
| DevTools | `devtools://...` | Skip unless you need the tools UI |

## Available Capabilities

Once connected through CDP, Playwright can:

- listen to console output with `page.on('console')`
- evaluate JavaScript with `page.evaluate(...)`
- capture screenshots with `page.screenshot()`
- interact with the DOM through locators, clicks, and keyboard input
- intercept network traffic with `page.route()`

## Port Conflicts

If port `9222` is already in use, switch both commands to the same custom port:

1. `enable-cdp.cjs enable --port <N>`
2. `cdp-connect.cjs --port <N>`

## Project-Specific Entry Detection

The helper in this project prefers `src/main/index.ts` and falls back to
`apps/electron/src/index.ts`. Pass `--entry <relative-path>` if your Electron
main entry lives somewhere else.
