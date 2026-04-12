# Technology Stack

**Analysis Date:** 2025-06-26

## Languages

**Primary:**
- TypeScript (ESNext target) - Used throughout: Electron main/preload, client UI, relay server, build scripts

**Secondary:**
- CSS (with CSS Layers: base, utils, components, responsive, app) - `client/style.css`
- HTML - `client/app.html`

## Runtime

**Environment:**
- Bun 1.3.x (primary runtime for relay server, build tooling, test runner, package management)
- Node.js v25.x (Electron's Node backend at runtime)
- Electron 41.x (desktop shell wrapping Chromium + Node.js)

**Package Manager:**
- Bun (lockfile: `bun.lock` present at root and `comms-relay/bun.lock`)
- No npm/yarn/pnpm used

## Frameworks

**Core:**
- Preact 10.x - UI framework (lightweight React alternative, ~3kB). JSX configured with `jsxImportSource: "preact"` in `tsconfig.json`. React compat aliases mapped via `paths` in tsconfig.
- Electron 41.x - Desktop application shell (Chromium renderer + Node.js main process)

**UI/Styling:**
- @webtui/css 0.1.x - Terminal-aesthetic CSS component library. Uses custom elements (`<row>`, `<column>`) and attribute-based styling (`box-="square"`, `variant-="green"`, `is-="badge"`)
- @webtui/theme-catppuccin 0.0.x - Catppuccin Mocha color theme
- @webtui/plugin-nf 0.1.x - Nerd Fonts icon support

**Testing:**
- Bun's built-in test runner (`bun:test`) - Used for all tests

**Build/Dev:**
- Bun.build() - Custom bundler calls in `scripts/build.ts` and `scripts/dev.ts`
- electron-builder 26.x - Cross-platform packaging (AppImage/deb, DMG/zip, NSIS/portable)
- Custom Bun plugin for WebTUI JSX attribute transformation: `scripts/webtui-plugin.ts`

## Key Dependencies

**Critical (Runtime):**
- `preact` 10.x - All UI rendering. Imported as `preact` and `preact/hooks`. No React used.
- `marked` 15.x - Markdown-to-HTML rendering for chat messages (`client/src/components/Chat.tsx`)
- `dompurify` 3.3.x - HTML sanitization of rendered markdown to prevent XSS (`client/src/components/Chat.tsx`)
- `uiohook-napi` 1.5.x - Native global keyboard hook for push-to-talk (works across Wayland/X11/macOS/Windows). Listed in `trustedDependencies`. Unpacked from ASAR in `electron-builder.yml`. Gracefully degrades if unavailable.
- `electron` 41.x - Desktop runtime (devDependency used for build and development)

**Infrastructure:**
- `electron-builder` 26.x - Packaging and distribution

**Zero server-side dependencies:** `comms-relay/package.json` has empty `dependencies` — it uses only Bun built-in APIs (`Bun.serve`, `ServerWebSocket`).

## Build System

**Two-stage build (`scripts/build.ts`):**

1. **Frontend bundle** (browser target):
   - Entry points: `client/src/app.tsx`, `client/src/mock.ts`
   - Output: `client/dist/` (app.js, mock.js)
   - Uses `webtuiPlugin` to transform WebTUI special-character attributes (`align-^`, `self-~`, `align-$`) into JSX spread syntax
   - CSS files copied from node_modules to `client/dist/` (webtui.css, catppuccin.css, nerdfonts.css)

2. **Electron bundle** (node target, CJS format):
   - Entry points: `electron/main.ts`, `electron/preload.ts`
   - Output: `electron/main.js`, `electron/preload.js`
   - Externals: `electron`, `uiohook-napi`

**Dev mode (`scripts/dev.ts`):**
- Builds both stages, then spawns Electron
- Watches `client/src/` for frontend changes (rebuilds JS)
- Watches `electron/` for main process changes (rebuilds + restarts Electron)
- Supports `--private` and `--devtools` CLI flags passed through to Electron

**Distribution (`electron-builder.yml`):**
- App ID: `com.seppulcro.comms`
- ASAR packaging with `uiohook-napi` unpacked
- Linux: AppImage + deb
- macOS: DMG + zip
- Windows: NSIS installer + portable

## Configuration

**TypeScript (`tsconfig.json`):**
- Target: ESNext, Module: ESNext, moduleResolution: bundler
- JSX: react-jsx with preact jsxImportSource
- Strict mode enabled
- Path alias: `react` → `preact/compat`, `react-dom` → `preact/compat`

**Environment:**
- No `.env` files present
- Relay server reads `PORT` from environment (defaults to 4000). Set via `docker-compose.yml`.
- Default signaling URL hardcoded: `wss://comms.seppulcro.com` in `client/src/lib/store.ts`, configurable per-user via Settings UI (stored in localStorage)
- Electron identity persisted as JSON at `app.getPath('userData')/identity.json`

**Content Security Policy (`client/app.html`):**
- `default-src 'self'`
- `connect-src 'self' wss: ws:` (allows WebSocket connections to any signaling server)
- `img-src 'self' data: blob:` (supports inline images)
- `font-src 'self' data: https://cdn.jsdelivr.net`

## Platform Requirements

**Development:**
- Bun 1.3+ installed
- Linux: system libraries for uiohook-napi (`libx11-dev`, `libxtst-dev`, `libxt-dev`, `libxinerama-dev`, `libxkbcommon-dev`, `libxrandr-dev`, `libxrender-dev`, `libxfixes-dev`, `libxi-dev`)
- `bun install` to install dependencies
- `bun run dev` to start development (builds + watches + launches Electron)
- `bun run build` to produce production bundles

**Production (Desktop):**
- Electron desktop app distributed as AppImage/deb (Linux), DMG/zip (macOS), NSIS/portable (Windows)
- Cross-platform builds via GitHub Actions CI (`release.yml`)

**Production (Relay Server):**
- Docker container (`oven/bun:1.3-alpine` base image)
- Single `index.ts` file with zero npm dependencies
- Exposes port 4000

**CI/CD (`.github/workflows/release.yml`):**
- Triggered on `v*` tags
- Builds on ubuntu-latest, windows-latest, macos-latest
- Uses `oven-sh/setup-bun@v2` + `bun install --frozen-lockfile`
- Publishes via `electron-builder --publish always` using `GH_TOKEN`

---

*Stack analysis: 2025-06-26*
