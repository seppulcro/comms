# Architecture

**Analysis Date:** 2025-07-15

## Pattern Overview

**Overall:** Desktop P2P application with Electron shell + Preact renderer + standalone WebSocket signaling relay

**Key Characteristics:**
- Three-tier local architecture: Electron main process → preload bridge → Preact renderer
- Fully peer-to-peer data flow via WebRTC — actual voice/chat/screen data never touches a server
- Signaling relay (`comms-relay`) is a thin, self-hostable WebSocket router for SDP/ICE exchange only
- State management uses module-level singletons (no Redux/Zustand) — `signaling`, `rtc`, `ptt`, `store` are all global instances
- No backend API or database server — identity stored as JSON on disk, chat stored in IndexedDB

## Layers

**Electron Main Process:**
- Purpose: Application lifecycle, window management, system tray, OS-level input hooks, identity persistence
- Location: `electron/main.ts`
- Contains: BrowserWindow creation, IPC handler registration, uiohook-napi global keyboard hook, identity read/write to disk, CSP-governed session permissions
- Depends on: Node.js/Electron APIs, `uiohook-napi` (optional native module)
- Used by: Preload bridge (via IPC)

**Preload Bridge:**
- Purpose: Secure context bridge between main process and renderer — exposes a typed `electronAPI` on `window`
- Location: `electron/preload.ts`
- Contains: `contextBridge.exposeInMainWorld()` calls wrapping `ipcRenderer.invoke()` and `ipcRenderer.on()`
- Depends on: Electron `contextBridge`, `ipcRenderer`
- Used by: Renderer process via `window.electronAPI`
- Type definition: `electron/electron.d.ts` (main-side), `client/src/lib/electron.d.ts` (renderer-side)

**Renderer / Client Application:**
- Purpose: UI rendering, P2P connection management, chat, voice, screen sharing
- Location: `client/src/`
- Contains: Preact components, WebRTC manager, signaling client, push-to-talk handler, local storage, IndexedDB chat persistence
- Depends on: Preact, marked, DOMPurify, Web Audio API, WebRTC APIs, `window.electronAPI`
- Used by: User directly (the visible application)

**Library / Core Logic Layer:**
- Purpose: Reusable modules that encapsulate P2P, signaling, input, and storage logic
- Location: `client/src/lib/`
- Contains: Singleton service classes (`SignalingClient`, `WebRTCManager`, `PTTHandler`) plus pure functions for store/chatdb
- Depends on: Browser APIs (WebSocket, RTCPeerConnection, IndexedDB, localStorage, AudioContext)
- Used by: Components in `client/src/components/` and `client/src/app.tsx`

**Signaling Relay Server:**
- Purpose: Lightweight WebSocket relay that routes SDP offers/answers and ICE candidates between peers — never sees actual data
- Location: `comms-relay/index.ts`
- Contains: Bun HTTP+WebSocket server, room management, peer tracking, rate limiting, kick/host logic, static landing page serving
- Depends on: Bun runtime (no external dependencies)
- Used by: Client via WebSocket from `client/src/lib/signaling.ts`

**Build System:**
- Purpose: Compile TypeScript, bundle client+electron code, copy CSS assets
- Location: `scripts/`
- Contains: `dev.ts` (watch mode + auto-restart Electron), `build.ts` (production build), `webtui-plugin.ts` (Bun build plugin for WebTUI JSX attributes)
- Depends on: Bun.build API
- Used by: `bun run dev` and `bun run build` commands

## Data Flow

**Voice Connection Flow:**

1. User clicks "Host" or "Join" in `client/src/app.tsx` → `connectAndJoin()` called
2. `SignalingClient.connect(url)` opens WebSocket to relay server (`client/src/lib/signaling.ts`)
3. `SignalingClient.joinRoom()` sends `{ type: 'join', room, peer_id, name }` to relay
4. Relay responds with `{ type: 'peers', peers: [...] }` — list of existing room members
5. `WebRTCManager` (listening via `signaling.on('peers')`) creates `RTCPeerConnection` for each existing peer (`client/src/lib/webrtc.ts`)
6. Initiator creates SDP offer → sent via `signaling.signal()` → relay forwards to target peer
7. Target sets remote description, creates answer → sent back through relay
8. ICE candidates exchanged through relay's signal forwarding
9. Once connected, WebRTC data channels (`'chat'`) and audio/video tracks flow peer-to-peer — relay is no longer involved

**Chat Message Flow:**

1. User types message → `handleSend()` in `client/src/components/Chat.tsx`
2. Message added to local React state and persisted to IndexedDB via `saveMessage()` in `client/src/lib/chatdb.ts`
3. `rtc.sendChat(msg)` broadcasts JSON over WebRTC data channels to all connected peers
4. Receiving peer's data channel `onmessage` handler fires → `onMessage` callback → state update + `saveMessage()` to local IndexedDB
5. On new peer connection, data channel `onopen` syncs chat history (last 200 messages < 10KB each) via `{ type: 'chat-history' }` message

**Push-to-Talk Flow:**

1. `PTTHandler` in `client/src/lib/ptt.ts` initializes with both DOM key listeners and Electron global hook
2. In Electron: `uiohook-napi` in main process (`electron/main.ts`) captures global key events → sends `'ptt-down'`/`'ptt-up'` IPC messages
3. Preload bridge forwards these to renderer via `window.electronAPI.onPttDown()/onPttUp()`
4. `PTTHandler` calls `rtc.setMicEnabled(true/false)` which enables/disables audio track
5. Tray icon updated via IPC `'mic-state'` message from renderer → main process

**Identity Flow:**

1. On app start, `electron/main.ts` `loadIdentity()` reads `identity.json` from Electron's `userData` directory
2. If file missing, generates UUID + "Anonymous" display name, writes to disk
3. If `--private` flag, generates ephemeral UUID (never persisted)
4. Renderer retrieves identity via `ipc.getIdentity()` → `window.electronAPI.getIdentity()`
5. Display name changes saved both to Electron's `identity.json` (via IPC) and localStorage (renderer-side)

**State Management:**

- **Global singletons:** `signaling` (`SignalingClient`), `rtc` (`WebRTCManager`), `ptt` (`PTTHandler`) — instantiated at module scope in `client/src/lib/`
- **Local storage:** Settings (PTT key, voice mode, threshold, audio devices, signaling URL) persisted via `localStorage` in `client/src/lib/store.ts`
- **IndexedDB:** Chat messages persisted per-room in `client/src/lib/chatdb.ts` (database `'comms'`, store `'messages'`, indexed by `roomInvite` + `timestamp`)
- **React state:** Component-level `useState` in `client/src/app.tsx` for rooms, current room, peers, connection status; in components for local UI state
- **No centralized state store:** State flows top-down from `App` component via props; singletons accessed directly by components that need them

## Key Abstractions

**SignalingClient:**
- Purpose: WebSocket connection to signaling relay with auto-reconnect, event emitter pattern
- Location: `client/src/lib/signaling.ts`
- Pattern: Singleton class with `.on(type, cb)` / `.off(type, cb)` event system, epoch-based stale connection guard
- API: `connect()`, `disconnect()`, `joinRoom()`, `signal()`, `leave()`, `kick()`, `waitForConnect()`

**WebRTCManager:**
- Purpose: Manages all peer connections, data channels, audio/video tracks, speaking detection
- Location: `client/src/lib/webrtc.ts`
- Pattern: Singleton class with callback-based handlers (`setMessageHandler`, `setTrackHandler`, `setPeerChangeHandler`)
- Owns: `Map<string, PeerInfo>` of all connected peers, local audio/screen streams, AudioContext for speaking detection

**PTTHandler:**
- Purpose: Cross-platform push-to-talk with support for keyboard + mouse buttons, works both in-app (DOM events) and globally (uiohook via Electron IPC)
- Location: `client/src/lib/ptt.ts`
- Pattern: Singleton class that bridges DOM events and Electron IPC

**Room / Invite System:**
- Purpose: Room identity encoded as invite codes for easy sharing
- Location: `client/src/lib/store.ts` (`encodeInvite()`, `decodeInvite()`)
- Pattern: UUID room ID + base64url-encoded room name → `comms-{hex32}-{base64name}` string format

**ChatDB:**
- Purpose: IndexedDB wrapper for persistent chat history per room
- Location: `client/src/lib/chatdb.ts`
- Pattern: Promise-based CRUD functions over IndexedDB with compound index on `[roomInvite, timestamp]`

## Entry Points

**Electron Main:**
- Location: `electron/main.ts` (compiled to `electron/main.js`)
- Triggers: `electron .` / `bun run start` / OS app launch
- Responsibilities: Load identity, register IPC handlers, start uiohook, create tray, create BrowserWindow loading `client/app.html`

**Client Renderer:**
- Location: `client/src/app.tsx` (compiled to `client/dist/app.js`)
- Triggers: Loaded by `client/app.html` as `<script type="module">`
- Responsibilities: Preact `render(<App />)` into `#app` div, initialize PTT/identity/RTC, manage room lifecycle

**Signaling Relay:**
- Location: `comms-relay/index.ts`
- Triggers: `bun run index.ts` / Docker container / `bun run dev` (hot reload)
- Responsibilities: HTTP health endpoint, WebSocket upgrade, room/peer management, signal forwarding

**Dev Script:**
- Location: `scripts/dev.ts`
- Triggers: `bun run dev`
- Responsibilities: Build frontend + electron, start Electron process, watch `client/src/` and `electron/` for changes, auto-rebuild + restart

**Build Script:**
- Location: `scripts/build.ts`
- Triggers: `bun run build`
- Responsibilities: Production build of frontend (with webtui plugin + minification) + electron (CJS format), copy CSS assets

**Mock / Browser Test Mode:**
- Location: `client/src/mock.ts` (compiled to `client/dist/mock.js`)
- Triggers: Opening `app.html?mock` in a regular browser
- Responsibilities: Stubs `window.electronAPI` so the app can run without Electron (for development/testing)

## Error Handling

**Strategy:** Minimal — mostly `try/catch` with `console.error` logging, no error boundaries or centralized error handling

**Patterns:**
- WebRTC failures: caught in `createPeerConnection` negotiation, logged to console
- Signaling WebSocket: auto-reconnect with exponential backoff (1s → 30s max) in `SignalingClient`
- Identity loading: fallback to generating new identity if file read fails (`electron/main.ts:52-58`)
- Optional native module: graceful degradation if `uiohook-napi` fails to load (`electron/main.ts:14-20`)
- Data channel messages: `try/catch` around `JSON.parse` with empty catch blocks (silent drop of invalid messages)
- Relay server: invalid JSON silently dropped, rate-limited connections closed with code 1008

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` / `console.warn` throughout — no structured logging framework. Relay uses `console.log` for join/signal events. Electron main process mirrors renderer console with `--verbose` flag.

**Validation:**
- Relay validates room IDs as UUID format (`comms-relay/index.ts:48-49`)
- Relay enforces 50 peers per room limit (`comms-relay/index.ts:25`)
- Relay rate-limits connections per IP: 30 requests per 60s window (`comms-relay/index.ts:30`)
- Client rate-limits chat messages: 20 per second (`client/src/lib/webrtc.ts:45-46`)
- Chat content sanitized via DOMPurify with explicit allowlists (`client/src/components/Chat.tsx:37-41`)
- Markdown rendered with `marked` (GFM mode) then DOMPurify-sanitized before `dangerouslySetInnerHTML`
- Message size capped at 100KB in `sendChat()` (`client/src/lib/webrtc.ts:275-278`)

**Authentication:** None — peer identity is a random UUID generated on first launch and stored in `identity.json`. The signaling relay has no authentication; anyone with a room UUID can join.

**Security:**
- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` in BrowserWindow
- CSP: restrictive Content-Security-Policy in `client/app.html` (no `unsafe-eval`, limited connect-src to `wss:` and `ws:`)
- Private mode: `--private` / `-p` flag creates ephemeral session partition, never persists identity
- Path traversal protection: relay resolves static file paths and checks they're within `public/` directory

---

*Architecture analysis: 2025-07-15*
