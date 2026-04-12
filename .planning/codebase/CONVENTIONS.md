# Coding Conventions

**Analysis Date:** 2025-07-15

## Naming Patterns

**Files:**
- Use **kebab-case** for all source files: `store.ts`, `signaling.ts`, `webrtc.ts`, `chatdb.ts`
- Components use **PascalCase**: `Chat.tsx`, `Voice.tsx`, `Settings.tsx`, `Sidebar.tsx`, `ScreenShare.tsx`
- Test files are co-located with source and use `.test.ts` suffix: `store.test.ts`, `index.test.ts`
- Integration tests use `.integration.test.ts` suffix: `signaling.integration.test.ts`
- Type declaration files use `.d.ts`: `electron.d.ts`

**Functions:**
- Use **camelCase** for all functions and methods: `saveSettings()`, `loadRooms()`, `encodeInvite()`, `decodeInvite()`
- React/Preact hooks follow `handle*` pattern for event handlers: `handleSend`, `handleKeyDown`, `handleJoin`, `handleHost`
- Boolean getters use `is*` prefix: `isActive()`, `isElectron`, `isValidRoomId()`
- Callbacks passed as props use `on*` prefix: `onSelectRoom`, `onHostRoom`, `onClose`, `onDisplayNameChange`

**Variables:**
- Use **camelCase** for local variables and instance fields: `localAudioStream`, `reconnectDelay`, `pttKeyCode`
- Use **UPPER_SNAKE_CASE** for constants: `MAX_PEERS_PER_ROOM`, `DB_NAME`, `DB_VERSION`, `STORE_NAME`, `ICE_CONFIG`, `MSG_PAGE_SIZE`, `MSG_RATE_LIMIT`
- Boolean variables use descriptive names (no `is` prefix for state): `active`, `joined`, `dragging`, `recording`

**Types/Interfaces:**
- Use **PascalCase** for all types and interfaces: `User`, `Room`, `ChatMessage`, `Settings`, `PeerInfo`, `PeerData`
- Interfaces describe data shapes: `SignalingMessage`, `StoredMessage`, `QueuedSocket`
- Props interfaces use `*Props` suffix: `ChatProps`, `SidebarProps`, `SettingsProps`, `ScreenShareProps`
- Union types are named descriptively: `VoiceMode = 'ptt' | 'vad'`

## Code Style

**Formatting:**
- No dedicated formatter tool (no Prettier, ESLint, or Biome config detected)
- **2-space indentation** throughout all TypeScript files
- **No semicolons** in client-side code (`client/src/`)
- **Semicolons** used in Electron main process code (`electron/main.ts`, `electron/preload.ts`)
- Single quotes for strings consistently across all files
- Trailing commas in multi-line constructs

**Linting:**
- No linter configured
- TypeScript `strict: true` in `tsconfig.json` provides type checking

**Line Length:**
- No enforced limit. Long lines appear naturally in JSX props and string literals
- Keep single-expression logic on one line when readable:
  ```typescript
  export const isElectron = typeof window !== 'undefined' && 'electronAPI' in window
  ```

**TypeScript Strictness:**
- `strict: true` enabled in `tsconfig.json`
- `esModuleInterop: true`, `skipLibCheck: true`
- Target: `ESNext`, Module: `ESNext`, Module resolution: `bundler`
- JSX configured for Preact: `"jsxImportSource": "preact"`

## Import Organization

**Order:**
1. Framework imports (Preact hooks, Electron modules)
2. Third-party libraries (`marked`, `dompurify`)
3. Local library modules (`../lib/webrtc`, `../lib/store`)
4. Local component imports (`./components/Chat`)
5. Type-only imports last (using `import type`)

**Example from `client/src/app.tsx`:**
```typescript
import { render } from 'preact'
import { useState, useEffect, useCallback } from 'preact/hooks'
import { checkForUpdates } from './lib/updater'
import { ptt } from './lib/ptt'
import * as ipc from './lib/ipc'
import { signaling } from './lib/signaling'
import { rtc } from './lib/webrtc'
import { loadRooms, saveRooms, encodeInvite, decodeInvite, saveDisplayName, loadDisplayName, loadSignalingUrl } from './lib/store'
import { Sidebar } from './components/Sidebar'
import { Chat } from './components/Chat'
import { Voice } from './components/Voice'
import { Settings } from './components/Settings'
import type { User, Room } from './lib/store'
```

**Path Aliases:**
- No path aliases (`@/` etc.) are used
- All imports use relative paths: `./lib/store`, `../lib/webrtc`, `../components/Chat`
- Preact aliased to React for compatibility in `tsconfig.json`:
  ```json
  "paths": {
    "react": ["./node_modules/preact/compat"],
    "react-dom": ["./node_modules/preact/compat"]
  }
  ```

## Module & Export Patterns

**Singleton Pattern:**
- Core services are exported as singleton instances at module bottom:
  ```typescript
  // client/src/lib/signaling.ts
  export const signaling = new SignalingClient()
  
  // client/src/lib/webrtc.ts
  export const rtc = new WebRTCManager()
  
  // client/src/lib/ptt.ts
  export const ptt = new PTTHandler()
  ```
- Classes are also exported for typing purposes, but callers use the singleton

**Named Exports Only:**
- No default exports anywhere in the codebase
- All exports are named: `export function`, `export class`, `export const`, `export interface`
- Components: `export function Chat(...)`, `export function Sidebar(...)`
- Store functions: `export function saveSettings(...)`, `export function loadRooms()`

**Barrel Files:**
- Not used. Import directly from specific files

**Namespace Imports:**
- Used sparingly, only for `ipc`: `import * as ipc from './lib/ipc'`

## Component Patterns

**Preact Functional Components:**
- All components are functional (no class components)
- Use Preact hooks: `useState`, `useEffect`, `useCallback`, `useRef`
- Props are destructured in the function signature:
  ```typescript
  export function Chat({ room, user }: ChatProps) {
  ```

**Helper Components:**
- Small inline helpers defined in the same file (not exported):
  ```typescript
  // Defined in Chat.tsx, Sidebar.tsx, Voice.tsx, Settings.tsx
  function Nf({ i }: { i: string }) {
    return <span class="nf">{i}</span>
  }
  ```
  - Note: `Nf` is duplicated in 4 component files; extract to shared component for new code

**WebTUI CSS Framework:**
- Uses custom HTML elements: `<row>`, `<column>` as layout primitives
- Special attributes use `^`, `~`, `$` characters for alignment, transformed by Bun plugin (`scripts/webtui-plugin.ts`)
- Attributes written as JSX spread: `{...{"align-^": "center"}}` (auto-transformed from `align-^="center"`)
- WebTUI component attributes: `is-="input"`, `is-="badge"`, `variant-="green"`, `size-="small"`, `box-="square"`, `shear-="top"`, `gap-="1"`

**Inline Styles:**
- Used for one-off layout tweaks in JSX: `style="padding: 0.5lh 1ch"`
- CSS units use `lh` (line-height units) and `ch` (character width units) for terminal-like consistency
- Prefer CSS classes in `client/style.css` for reusable styling

**State Management:**
- No external state library
- Local component state via `useState`
- Shared state via singleton modules (`store`, `signaling`, `rtc`)
- Settings persisted to `localStorage` via `client/src/lib/store.ts`
- Chat messages persisted to IndexedDB via `client/src/lib/chatdb.ts`

## Error Handling

**Patterns:**
- **Silent catch with empty block** — used for non-critical operations (common pattern):
  ```typescript
  // client/src/lib/signaling.ts
  private emit(type: string, data: SignalingMessage) {
    this.listeners.get(type)?.forEach(cb => { try { cb(data) } catch {} })
  }
  ```
- **Console.error for important failures** — used for user-impacting errors:
  ```typescript
  // client/src/app.tsx
  } catch (e) {
    console.error('Failed to get identity:', e)
  }
  ```
- **Graceful degradation** — feature availability checked before use:
  ```typescript
  // electron/main.ts — uiohook-napi loading
  try {
    const mod = require("uiohook-napi");
    uIOhook = mod.uIOhook;
  } catch (e) {
    console.warn("uiohook-napi not available — global PTT disabled:", (e as Error).message);
  }
  ```
- **Return null for invalid input** — pure functions return `null` on failure:
  ```typescript
  // client/src/lib/store.ts
  export function decodeInvite(invite: string): { room: string; name?: string } | null {
    try { ... }
    catch { return null }
  }
  ```
- **Server-side: silently drop invalid messages** — relay never crashes on bad input:
  ```typescript
  // comms-relay/index.ts
  try { msg = JSON.parse(raw as string) }
  catch { return } // invalid JSON silently dropped
  ```

**When to use each pattern:**
- Use `catch {}` (empty) for cleanup, optional features, and fire-and-forget operations
- Use `console.error('Context:', e)` for failures the developer needs to debug
- Use `console.warn(...)` for expected degradation (missing optional dependencies)
- Return `null` from pure parsing/validation functions
- Never throw from WebSocket message handlers or event callbacks

## Logging

**Framework:** `console` (no logging library)

**Patterns:**
- **Server-side** (`comms-relay/index.ts`): `console.log()` with bracket-prefix for categories:
  ```typescript
  console.log(`[join] peer → room ${roomName} (${room.size + 1} peers)`)
  console.log(`[signal] relay in room ${roomName}`)
  ```
- **Client-side**: `console.error()` for failures, `console.warn()` for degradation
- **Mock mode** (`client/src/mock.ts`): `console.log('[mock] electronAPI injected — browser test mode')`
- **Dev script** (`scripts/dev.ts`): `console.log('[dev] frontend rebuilt at ...')`

**Convention:** Use `[category]` prefix for structured log messages on the server. Use plain `console.error('Context:', error)` on the client.

## Comments

**When to Comment:**
- File-level comments describe purpose of modules:
  ```typescript
  // comms-relay — lightweight WebRTC signaling server
  // Self-hostable. Routes SDP/ICE messages between peers. Never sees actual data.
  ```
  ```typescript
  // IndexedDB-backed chat storage — unlimited history, supports image blobs
  ```
  ```typescript
  // Minimalistic UI sounds using Web Audio API — no external files needed
  ```
- Inline comments explain non-obvious logic or edge cases:
  ```typescript
  // Add joiner to room AFTER broadcasting
  // For initiators, onnegotiationneeded fires from createDataChannel + addTrack
  ```
- Section dividers use `// --- Section Name ---` (in `electron/main.ts`) or `{/* ── Section ── */}` (in JSX)

**JSDoc:**
- Used sparingly, only for functions that benefit from description:
  ```typescript
  /** Two quick ascending notes — someone joined voice */
  export function playJoin() { ... }
  
  /** Resize + compress an image file to a base64 data URL (max 1920px, JPEG 0.75) */
  function compressImage(file: File | Blob): Promise<string> { ... }
  ```

## Function Design

**Size:** Functions are kept small (typically 5–30 lines). Larger functions exist for complex WebRTC setup (`createPeerConnection` ~80 lines in `client/src/lib/webrtc.ts`) but are structured with clear sub-sections.

**Parameters:** Prefer destructured objects for component props. Use positional params for library functions with 1–3 args:
```typescript
export function encodeInvite(room: string, name: string): string
export function saveMessage(roomInvite: string, msg: { ... }): Promise<void>
```

**Return Values:** 
- Functions return explicit types (TypeScript enforces this with `strict: true`)
- Async functions return `Promise<T>` or `Promise<void>`
- Parsing functions return `T | null` to indicate failure

## CSS Conventions

**CSS Architecture:**
- Single stylesheet at `client/style.css` using CSS `@layer` for specificity control
- Layer order: `base, utils, components, responsive, app`
- WebTUI framework provides core styling; custom styles in `@layer components`

**Class Naming:**
- BEM-like with hyphens: `chat-msg`, `chat-input-area`, `voice-tile`, `voice-controls`, `screen-share-viewer`
- State classes are short adjectives: `speaking`, `muted`, `active`, `connected`, `collapsed`, `recording`
- Utility classes: `dim`, `truncate`, `sr-only`

**Units:**
- Use `lh` (line-height) for vertical spacing and `ch` (character width) for horizontal spacing
- This maintains the terminal/TUI aesthetic of the app

---

*Convention analysis: 2025-07-15*
