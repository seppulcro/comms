<!-- GSD:project-start source:PROJECT.md -->
## Project

**Comms**

A P2P room you can join from any device, over any network. Everything Chromium can do,
but peer-to-peer and routed through rooms instead of URLs. Join a room — share voice,
text, GPS, files, media, services. Works over internet, WiFi Direct, or LoRa mesh.
No servers, no accounts. The room is the network.

Think: AirDrop meets Discord meets Tailscale, decentralized and works over radio.
A modern digital walkie-talkie for smartphones and everything they connect to.

**Core Value:** Any device, any network, same room. The room adapts to whatever transport is available —
voice over WiFi, text over LoRa, services over DataChannels. Nothing requires the
internet to exist. Nothing requires a server to run. Peers connect directly.

### Constraints

- **Runtime**: Electron for desktop (stays as-is), Capacitor for mobile (iOS/Android) — shared Preact client code
- **Transport**: Must support WebRTC (internet) + Reticulum (mesh) simultaneously
- **Attestation crypto**: @oqs/liboqs-js WASM bindings (ML-DSA-65/ML-KEM-768) — no native compilation needed
- **Compatibility**: LXMF protocol support for Sideband/MeshChat interop
- **Attestation parity**: Chain output must be byte-identical across all platforms
- **No cloud dependencies**: Everything runs locally or P2P
- **License**: AGPL-3.0
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript (ESNext target) - Used throughout: Electron main/preload, client UI, relay server, build scripts
- CSS (with CSS Layers: base, utils, components, responsive, app) - `client/style.css`
- HTML - `client/app.html`
## Runtime
- Bun 1.3.x (primary runtime for relay server, build tooling, test runner, package management)
- Node.js v25.x (Electron's Node backend at runtime)
- Electron 41.x (desktop shell wrapping Chromium + Node.js)
- Bun (lockfile: `bun.lock` present at root and `comms-relay/bun.lock`)
- No npm/yarn/pnpm used
## Frameworks
- Preact 10.x - UI framework (lightweight React alternative, ~3kB). JSX configured with `jsxImportSource: "preact"` in `tsconfig.json`. React compat aliases mapped via `paths` in tsconfig.
- Electron 41.x - Desktop application shell (Chromium renderer + Node.js main process)
- @webtui/css 0.1.x - Terminal-aesthetic CSS component library. Uses custom elements (`<row>`, `<column>`) and attribute-based styling (`box-="square"`, `variant-="green"`, `is-="badge"`)
- @webtui/theme-catppuccin 0.0.x - Catppuccin Mocha color theme
- @webtui/plugin-nf 0.1.x - Nerd Fonts icon support
- Bun's built-in test runner (`bun:test`) - Used for all tests
- Bun.build() - Custom bundler calls in `scripts/build.ts` and `scripts/dev.ts`
- electron-builder 26.x - Cross-platform packaging (AppImage/deb, DMG/zip, NSIS/portable)
- Custom Bun plugin for WebTUI JSX attribute transformation: `scripts/webtui-plugin.ts`
## Key Dependencies
- `preact` 10.x - All UI rendering. Imported as `preact` and `preact/hooks`. No React used.
- `marked` 15.x - Markdown-to-HTML rendering for chat messages (`client/src/components/Chat.tsx`)
- `dompurify` 3.3.x - HTML sanitization of rendered markdown to prevent XSS (`client/src/components/Chat.tsx`)
- `uiohook-napi` 1.5.x - Native global keyboard hook for push-to-talk (works across Wayland/X11/macOS/Windows). Listed in `trustedDependencies`. Unpacked from ASAR in `electron-builder.yml`. Gracefully degrades if unavailable.
- `electron` 41.x - Desktop runtime (devDependency used for build and development)
- `electron-builder` 26.x - Packaging and distribution
## Build System
- Builds both stages, then spawns Electron
- Watches `client/src/` for frontend changes (rebuilds JS)
- Watches `electron/` for main process changes (rebuilds + restarts Electron)
- Supports `--private` and `--devtools` CLI flags passed through to Electron
- App ID: `com.seppulcro.comms`
- ASAR packaging with `uiohook-napi` unpacked
- Linux: AppImage + deb
- macOS: DMG + zip
- Windows: NSIS installer + portable
## Configuration
- Target: ESNext, Module: ESNext, moduleResolution: bundler
- JSX: react-jsx with preact jsxImportSource
- Strict mode enabled
- Path alias: `react` → `preact/compat`, `react-dom` → `preact/compat`
- No `.env` files present
- Relay server reads `PORT` from environment (defaults to 4000). Set via `docker-compose.yml`.
- Default signaling URL hardcoded: `wss://comms.seppulcro.com` in `client/src/lib/store.ts`, configurable per-user via Settings UI (stored in localStorage)
- Electron identity persisted as JSON at `app.getPath('userData')/identity.json`
- `default-src 'self'`
- `connect-src 'self' wss: ws:` (allows WebSocket connections to any signaling server)
- `img-src 'self' data: blob:` (supports inline images)
- `font-src 'self' data: https://cdn.jsdelivr.net`
## Platform Requirements
- Bun 1.3+ installed
- Linux: system libraries for uiohook-napi (`libx11-dev`, `libxtst-dev`, `libxt-dev`, `libxinerama-dev`, `libxkbcommon-dev`, `libxrandr-dev`, `libxrender-dev`, `libxfixes-dev`, `libxi-dev`)
- `bun install` to install dependencies
- `bun run dev` to start development (builds + watches + launches Electron)
- `bun run build` to produce production bundles
- Electron desktop app distributed as AppImage/deb (Linux), DMG/zip (macOS), NSIS/portable (Windows)
- Cross-platform builds via GitHub Actions CI (`release.yml`)
- Docker container (`oven/bun:1.3-alpine` base image)
- Single `index.ts` file with zero npm dependencies
- Exposes port 4000
- Triggered on `v*` tags
- Builds on ubuntu-latest, windows-latest, macos-latest
- Uses `oven-sh/setup-bun@v2` + `bun install --frozen-lockfile`
- Publishes via `electron-builder --publish always` using `GH_TOKEN`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Use **kebab-case** for all source files: `store.ts`, `signaling.ts`, `webrtc.ts`, `chatdb.ts`
- Components use **PascalCase**: `Chat.tsx`, `Voice.tsx`, `Settings.tsx`, `Sidebar.tsx`, `ScreenShare.tsx`
- Test files are co-located with source and use `.test.ts` suffix: `store.test.ts`, `index.test.ts`
- Integration tests use `.integration.test.ts` suffix: `signaling.integration.test.ts`
- Type declaration files use `.d.ts`: `electron.d.ts`
- Use **camelCase** for all functions and methods: `saveSettings()`, `loadRooms()`, `encodeInvite()`, `decodeInvite()`
- React/Preact hooks follow `handle*` pattern for event handlers: `handleSend`, `handleKeyDown`, `handleJoin`, `handleHost`
- Boolean getters use `is*` prefix: `isActive()`, `isElectron`, `isValidRoomId()`
- Callbacks passed as props use `on*` prefix: `onSelectRoom`, `onHostRoom`, `onClose`, `onDisplayNameChange`
- Use **camelCase** for local variables and instance fields: `localAudioStream`, `reconnectDelay`, `pttKeyCode`
- Use **UPPER_SNAKE_CASE** for constants: `MAX_PEERS_PER_ROOM`, `DB_NAME`, `DB_VERSION`, `STORE_NAME`, `ICE_CONFIG`, `MSG_PAGE_SIZE`, `MSG_RATE_LIMIT`
- Boolean variables use descriptive names (no `is` prefix for state): `active`, `joined`, `dragging`, `recording`
- Use **PascalCase** for all types and interfaces: `User`, `Room`, `ChatMessage`, `Settings`, `PeerInfo`, `PeerData`
- Interfaces describe data shapes: `SignalingMessage`, `StoredMessage`, `QueuedSocket`
- Props interfaces use `*Props` suffix: `ChatProps`, `SidebarProps`, `SettingsProps`, `ScreenShareProps`
- Union types are named descriptively: `VoiceMode = 'ptt' | 'vad'`
## Code Style
- No dedicated formatter tool (no Prettier, ESLint, or Biome config detected)
- **2-space indentation** throughout all TypeScript files
- **No semicolons** in client-side code (`client/src/`)
- **Semicolons** used in Electron main process code (`electron/main.ts`, `electron/preload.ts`)
- Single quotes for strings consistently across all files
- Trailing commas in multi-line constructs
- No linter configured
- TypeScript `strict: true` in `tsconfig.json` provides type checking
- No enforced limit. Long lines appear naturally in JSX props and string literals
- Keep single-expression logic on one line when readable:
- `strict: true` enabled in `tsconfig.json`
- `esModuleInterop: true`, `skipLibCheck: true`
- Target: `ESNext`, Module: `ESNext`, Module resolution: `bundler`
- JSX configured for Preact: `"jsxImportSource": "preact"`
## Import Organization
- No path aliases (`@/` etc.) are used
- All imports use relative paths: `./lib/store`, `../lib/webrtc`, `../components/Chat`
- Preact aliased to React for compatibility in `tsconfig.json`:
## Module & Export Patterns
- Core services are exported as singleton instances at module bottom:
- Classes are also exported for typing purposes, but callers use the singleton
- No default exports anywhere in the codebase
- All exports are named: `export function`, `export class`, `export const`, `export interface`
- Components: `export function Chat(...)`, `export function Sidebar(...)`
- Store functions: `export function saveSettings(...)`, `export function loadRooms()`
- Not used. Import directly from specific files
- Used sparingly, only for `ipc`: `import * as ipc from './lib/ipc'`
## Component Patterns
- All components are functional (no class components)
- Use Preact hooks: `useState`, `useEffect`, `useCallback`, `useRef`
- Props are destructured in the function signature:
- Small inline helpers defined in the same file (not exported):
- Uses custom HTML elements: `<row>`, `<column>` as layout primitives
- Special attributes use `^`, `~`, `$` characters for alignment, transformed by Bun plugin (`scripts/webtui-plugin.ts`)
- Attributes written as JSX spread: `{...{"align-^": "center"}}` (auto-transformed from `align-^="center"`)
- WebTUI component attributes: `is-="input"`, `is-="badge"`, `variant-="green"`, `size-="small"`, `box-="square"`, `shear-="top"`, `gap-="1"`
- Used for one-off layout tweaks in JSX: `style="padding: 0.5lh 1ch"`
- CSS units use `lh` (line-height units) and `ch` (character width units) for terminal-like consistency
- Prefer CSS classes in `client/style.css` for reusable styling
- No external state library
- Local component state via `useState`
- Shared state via singleton modules (`store`, `signaling`, `rtc`)
- Settings persisted to `localStorage` via `client/src/lib/store.ts`
- Chat messages persisted to IndexedDB via `client/src/lib/chatdb.ts`
## Error Handling
- **Silent catch with empty block** — used for non-critical operations (common pattern):
- **Console.error for important failures** — used for user-impacting errors:
- **Graceful degradation** — feature availability checked before use:
- **Return null for invalid input** — pure functions return `null` on failure:
- **Server-side: silently drop invalid messages** — relay never crashes on bad input:
- Use `catch {}` (empty) for cleanup, optional features, and fire-and-forget operations
- Use `console.error('Context:', e)` for failures the developer needs to debug
- Use `console.warn(...)` for expected degradation (missing optional dependencies)
- Return `null` from pure parsing/validation functions
- Never throw from WebSocket message handlers or event callbacks
## Logging
- **Server-side** (`comms-relay/index.ts`): `console.log()` with bracket-prefix for categories:
- **Client-side**: `console.error()` for failures, `console.warn()` for degradation
- **Mock mode** (`client/src/mock.ts`): `console.log('[mock] electronAPI injected — browser test mode')`
- **Dev script** (`scripts/dev.ts`): `console.log('[dev] frontend rebuilt at ...')`
## Comments
- File-level comments describe purpose of modules:
- Inline comments explain non-obvious logic or edge cases:
- Section dividers use `// --- Section Name ---` (in `electron/main.ts`) or `{/* ── Section ── */}` (in JSX)
- Used sparingly, only for functions that benefit from description:
## Function Design
- Functions return explicit types (TypeScript enforces this with `strict: true`)
- Async functions return `Promise<T>` or `Promise<void>`
- Parsing functions return `T | null` to indicate failure
## CSS Conventions
- Single stylesheet at `client/style.css` using CSS `@layer` for specificity control
- Layer order: `base, utils, components, responsive, app`
- WebTUI framework provides core styling; custom styles in `@layer components`
- BEM-like with hyphens: `chat-msg`, `chat-input-area`, `voice-tile`, `voice-controls`, `screen-share-viewer`
- State classes are short adjectives: `speaking`, `muted`, `active`, `connected`, `collapsed`, `recording`
- Utility classes: `dim`, `truncate`, `sr-only`
- Use `lh` (line-height) for vertical spacing and `ch` (character width) for horizontal spacing
- This maintains the terminal/TUI aesthetic of the app
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Three-tier local architecture: Electron main process → preload bridge → Preact renderer
- Fully peer-to-peer data flow via WebRTC — actual voice/chat/screen data never touches a server
- Signaling relay (`comms-relay`) is a thin, self-hostable WebSocket router for SDP/ICE exchange only
- State management uses module-level singletons (no Redux/Zustand) — `signaling`, `rtc`, `ptt`, `store` are all global instances
- No backend API or database server — identity stored as JSON on disk, chat stored in IndexedDB
## Layers
- Purpose: Application lifecycle, window management, system tray, OS-level input hooks, identity persistence
- Location: `electron/main.ts`
- Contains: BrowserWindow creation, IPC handler registration, uiohook-napi global keyboard hook, identity read/write to disk, CSP-governed session permissions
- Depends on: Node.js/Electron APIs, `uiohook-napi` (optional native module)
- Used by: Preload bridge (via IPC)
- Purpose: Secure context bridge between main process and renderer — exposes a typed `electronAPI` on `window`
- Location: `electron/preload.ts`
- Contains: `contextBridge.exposeInMainWorld()` calls wrapping `ipcRenderer.invoke()` and `ipcRenderer.on()`
- Depends on: Electron `contextBridge`, `ipcRenderer`
- Used by: Renderer process via `window.electronAPI`
- Type definition: `electron/electron.d.ts` (main-side), `client/src/lib/electron.d.ts` (renderer-side)
- Purpose: UI rendering, P2P connection management, chat, voice, screen sharing
- Location: `client/src/`
- Contains: Preact components, WebRTC manager, signaling client, push-to-talk handler, local storage, IndexedDB chat persistence
- Depends on: Preact, marked, DOMPurify, Web Audio API, WebRTC APIs, `window.electronAPI`
- Used by: User directly (the visible application)
- Purpose: Reusable modules that encapsulate P2P, signaling, input, and storage logic
- Location: `client/src/lib/`
- Contains: Singleton service classes (`SignalingClient`, `WebRTCManager`, `PTTHandler`) plus pure functions for store/chatdb
- Depends on: Browser APIs (WebSocket, RTCPeerConnection, IndexedDB, localStorage, AudioContext)
- Used by: Components in `client/src/components/` and `client/src/app.tsx`
- Purpose: Lightweight WebSocket relay that routes SDP offers/answers and ICE candidates between peers — never sees actual data
- Location: `comms-relay/index.ts`
- Contains: Bun HTTP+WebSocket server, room management, peer tracking, rate limiting, kick/host logic, static landing page serving
- Depends on: Bun runtime (no external dependencies)
- Used by: Client via WebSocket from `client/src/lib/signaling.ts`
- Purpose: Compile TypeScript, bundle client+electron code, copy CSS assets
- Location: `scripts/`
- Contains: `dev.ts` (watch mode + auto-restart Electron), `build.ts` (production build), `webtui-plugin.ts` (Bun build plugin for WebTUI JSX attributes)
- Depends on: Bun.build API
- Used by: `bun run dev` and `bun run build` commands
## Data Flow
- **Global singletons:** `signaling` (`SignalingClient`), `rtc` (`WebRTCManager`), `ptt` (`PTTHandler`) — instantiated at module scope in `client/src/lib/`
- **Local storage:** Settings (PTT key, voice mode, threshold, audio devices, signaling URL) persisted via `localStorage` in `client/src/lib/store.ts`
- **IndexedDB:** Chat messages persisted per-room in `client/src/lib/chatdb.ts` (database `'comms'`, store `'messages'`, indexed by `roomInvite` + `timestamp`)
- **React state:** Component-level `useState` in `client/src/app.tsx` for rooms, current room, peers, connection status; in components for local UI state
- **No centralized state store:** State flows top-down from `App` component via props; singletons accessed directly by components that need them
## Key Abstractions
- Purpose: WebSocket connection to signaling relay with auto-reconnect, event emitter pattern
- Location: `client/src/lib/signaling.ts`
- Pattern: Singleton class with `.on(type, cb)` / `.off(type, cb)` event system, epoch-based stale connection guard
- API: `connect()`, `disconnect()`, `joinRoom()`, `signal()`, `leave()`, `kick()`, `waitForConnect()`
- Purpose: Manages all peer connections, data channels, audio/video tracks, speaking detection
- Location: `client/src/lib/webrtc.ts`
- Pattern: Singleton class with callback-based handlers (`setMessageHandler`, `setTrackHandler`, `setPeerChangeHandler`)
- Owns: `Map<string, PeerInfo>` of all connected peers, local audio/screen streams, AudioContext for speaking detection
- Purpose: Cross-platform push-to-talk with support for keyboard + mouse buttons, works both in-app (DOM events) and globally (uiohook via Electron IPC)
- Location: `client/src/lib/ptt.ts`
- Pattern: Singleton class that bridges DOM events and Electron IPC
- Purpose: Room identity encoded as invite codes for easy sharing
- Location: `client/src/lib/store.ts` (`encodeInvite()`, `decodeInvite()`)
- Pattern: UUID room ID + base64url-encoded room name → `comms-{hex32}-{base64name}` string format
- Purpose: IndexedDB wrapper for persistent chat history per room
- Location: `client/src/lib/chatdb.ts`
- Pattern: Promise-based CRUD functions over IndexedDB with compound index on `[roomInvite, timestamp]`
## Entry Points
- Location: `electron/main.ts` (compiled to `electron/main.js`)
- Triggers: `electron .` / `bun run start` / OS app launch
- Responsibilities: Load identity, register IPC handlers, start uiohook, create tray, create BrowserWindow loading `client/app.html`
- Location: `client/src/app.tsx` (compiled to `client/dist/app.js`)
- Triggers: Loaded by `client/app.html` as `<script type="module">`
- Responsibilities: Preact `render(<App />)` into `#app` div, initialize PTT/identity/RTC, manage room lifecycle
- Location: `comms-relay/index.ts`
- Triggers: `bun run index.ts` / Docker container / `bun run dev` (hot reload)
- Responsibilities: HTTP health endpoint, WebSocket upgrade, room/peer management, signal forwarding
- Location: `scripts/dev.ts`
- Triggers: `bun run dev`
- Responsibilities: Build frontend + electron, start Electron process, watch `client/src/` and `electron/` for changes, auto-rebuild + restart
- Location: `scripts/build.ts`
- Triggers: `bun run build`
- Responsibilities: Production build of frontend (with webtui plugin + minification) + electron (CJS format), copy CSS assets
- Location: `client/src/mock.ts` (compiled to `client/dist/mock.js`)
- Triggers: Opening `app.html?mock` in a regular browser
- Responsibilities: Stubs `window.electronAPI` so the app can run without Electron (for development/testing)
## Error Handling
- WebRTC failures: caught in `createPeerConnection` negotiation, logged to console
- Signaling WebSocket: auto-reconnect with exponential backoff (1s → 30s max) in `SignalingClient`
- Identity loading: fallback to generating new identity if file read fails (`electron/main.ts:52-58`)
- Optional native module: graceful degradation if `uiohook-napi` fails to load (`electron/main.ts:14-20`)
- Data channel messages: `try/catch` around `JSON.parse` with empty catch blocks (silent drop of invalid messages)
- Relay server: invalid JSON silently dropped, rate-limited connections closed with code 1008
## Cross-Cutting Concerns
- Relay validates room IDs as UUID format (`comms-relay/index.ts:48-49`)
- Relay enforces 50 peers per room limit (`comms-relay/index.ts:25`)
- Relay rate-limits connections per IP: 30 requests per 60s window (`comms-relay/index.ts:30`)
- Client rate-limits chat messages: 20 per second (`client/src/lib/webrtc.ts:45-46`)
- Chat content sanitized via DOMPurify with explicit allowlists (`client/src/components/Chat.tsx:37-41`)
- Markdown rendered with `marked` (GFM mode) then DOMPurify-sanitized before `dangerouslySetInnerHTML`
- Message size capped at 100KB in `sendChat()` (`client/src/lib/webrtc.ts:275-278`)
- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` in BrowserWindow
- CSP: restrictive Content-Security-Policy in `client/app.html` (no `unsafe-eval`, limited connect-src to `wss:` and `ws:`)
- Private mode: `--private` / `-p` flag creates ephemeral session partition, never persists identity
- Path traversal protection: relay resolves static file paths and checks they're within `public/` directory
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.github/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
