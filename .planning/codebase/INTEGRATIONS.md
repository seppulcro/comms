# External Integrations

**Analysis Date:** 2025-06-26

## Architecture: P2P with Minimal Server

Comms is a P2P voice/chat/screen-share application. The relay server is **only** used for WebRTC signaling (exchanging SDP offers/answers and ICE candidates). All actual voice, video, and chat data flows directly between peers via WebRTC (RTCPeerConnection + RTCDataChannel). The relay never sees user data.

## APIs & External Services

**WebRTC STUN Servers (ICE Candidate Discovery):**
- Google STUN: `stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`
- Cloudflare STUN: `stun:stun.cloudflare.com:3478`
- Metered STUN: `stun:stun.relay.metered.ca:80`
- Configuration: `client/src/lib/webrtc.ts` → `ICE_CONFIG` constant
- Auth: None required (public STUN servers)
- No TURN servers configured (P2P connections will fail if both peers are behind symmetric NAT)

**GitHub Releases API:**
- Used by electron-builder to publish release artifacts
- Auth: `GH_TOKEN` secret in GitHub Actions
- Configuration: `.github/workflows/release.yml`

**No other external APIs are used.** No analytics, no telemetry, no third-party services.

## Data Storage

**Client-side (Electron/Browser):**

| Storage | Purpose | Location / API |
|---------|---------|----------------|
| IndexedDB (`comms` database) | Chat message history with full-text + images | `client/src/lib/chatdb.ts` — store: `messages`, indexed by `room` and `[roomInvite, timestamp]` |
| localStorage | Settings (PTT key, voice mode, threshold, audio devices), rooms list, display name, signaling URL | `client/src/lib/store.ts` — keys: `ptt-key`, `voice-mode`, `voice-threshold`, `audio-input-device`, `audio-output-device`, `rooms`, `display-name`, `signaling-url` |
| File system (Electron userData) | Persistent peer identity (UUID + display name) | `electron/main.ts` → `identity.json` at `app.getPath('userData')` |

**Relay Server:**
- In-memory only: `Map<string, Map<string, Peer>>` for room→peers tracking
- No persistence — all state lost on restart
- Rate limiting tracked in-memory per IP: `Map<string, number[]>`

**SQLite files in `data/` directory:**
- `data/comms.db`, `data/comms.db-shm`, `data/comms.db-wal`, `data/comms.db.bak`
- These appear to be development/local data files. No code references SQLite — the app uses IndexedDB for chat storage.

**File Storage:**
- No external file storage
- Images are embedded inline as base64 data URLs in chat messages (compressed to JPEG 0.75 quality, max 1920px via `client/src/components/Chat.tsx` → `compressImage()`)

**Caching:**
- None (no external cache layer)

## Communication Protocols

**WebSocket (Signaling):**
- Client ↔ Relay: `client/src/lib/signaling.ts` → `SignalingClient` class
- Default server: `wss://comms.seppulcro.com` (configurable in Settings UI, stored in localStorage as `signaling-url`)
- Protocol: JSON messages over WebSocket
- Message types: `join`, `signal`, `leave`, `kick`, `peers`, `peer_joined`, `peer_left`, `kicked`, `error`
- Reconnection: exponential backoff (1s → 30s max), automatic on disconnect
- Rate limiting on server: 30 messages per 60 seconds per IP

**WebRTC (Peer-to-Peer):**
- Voice: `RTCPeerConnection` audio tracks with `getUserMedia()` — echo cancellation, noise suppression, auto gain control enabled
- Screen sharing: `getDisplayMedia()` video tracks — uses system picker on Linux/macOS, first screen fallback on Windows
- Chat: `RTCDataChannel` named `chat` — JSON messages for text chat, voice state sync, name changes, chat history sync
- Chat message types over DataChannel: `chat`, `chat-history`, `voice-state`, `name-change`
- Speaking detection: `AudioContext` + `AnalyserNode` FFT for both local and remote peers

## Authentication & Identity

**Auth Provider:** None — fully anonymous, self-sovereign identity

**Implementation:**
- Each peer generates a random UUID (`crypto.randomUUID()`) on first launch
- Identity persisted to `identity.json` in Electron's userData directory (`electron/main.ts`)
- Display name defaults to "Anonymous", changeable in Settings
- Private mode (`--private` flag): ephemeral in-memory identity, no persistence
- No server-side authentication — the relay accepts any WebSocket connection
- Room access controlled by invite codes (encoded room UUID + base64 name)
- Host privileges: first peer in a room is host, can kick others

## Monitoring & Observability

**Error Tracking:**
- None — no Sentry, no crash reporting

**Logs:**
- Relay server: `console.log` for join/signal events
- Electron main process: `console.error` for load failures, `console.warn` for uiohook unavailability
- Renderer: `console.error` for failures, forwarded to main process with `--verbose` flag

**Health Check:**
- Relay server: `GET /health` returns `200 ok` (`comms-relay/index.ts`)

## CI/CD & Deployment

**Desktop App Hosting:**
- GitHub Releases (auto-published on `v*` tags)
- Built on: ubuntu-latest (Linux), windows-latest (Windows), macos-latest (macOS)

**Relay Server Hosting:**
- Docker deployment via `comms-relay/Dockerfile` (oven/bun:1.3-alpine)
- Docker Compose: `comms-relay/docker-compose.yml`
- Production instance: `wss://comms.seppulcro.com`

**CI Pipeline (`.github/workflows/release.yml`):**
- Trigger: push tags matching `v*`
- 3 parallel jobs: build-linux, build-windows, build-macos
- Each: checkout → install Bun → `bun install --frozen-lockfile` → `bun run build` → `electron-builder --publish always`
- Secret: `GH_TOKEN` (GitHub-provided)

## Environment Configuration

**Required env vars:**
- `PORT` (relay server only, defaults to `4000`)
- `GH_TOKEN` (CI only, for publishing releases)

**No secrets required for development or runtime operation.**

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Electron IPC Bridge

**Main ↔ Renderer communication** (`electron/preload.ts` → `contextBridge.exposeInMainWorld`):

| IPC Channel | Direction | Purpose |
|-------------|-----------|---------|
| `get-identity` | Renderer → Main | Retrieve persistent peer ID + display name |
| `set-display-name` | Renderer → Main | Update persisted display name |
| `register-ptt-key` | Renderer → Main | Set PTT keycode for global uiohook listener |
| `ptt-down` / `ptt-up` | Main → Renderer | Global keyboard hook events (uiohook-napi) |
| `mic-state` | Renderer → Main | Update tray icon for mic activity |
| `check-for-updates` | Renderer → Main | Stub (no-op currently) |
| `copy-to-clipboard` | Renderer → Main | Write text to system clipboard |

**Security model:**
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Explicit permission grants for `media`, `display-capture`, `mediaKeySystem`
- CSP enforced in HTML

## WebRTC Room Model

**Room lifecycle:**
1. Host creates room → generates UUID → encodes invite code (`comms-{hex}-{base64name}`)
2. Host connects to signaling relay, sends `join` with room UUID
3. Joiner decodes invite → connects to relay → sends `join`
4. Relay sends `peers` list to joiner, `peer_joined` to existing peers
5. Peers exchange SDP offers/answers and ICE candidates via relay `signal` messages
6. Direct RTCPeerConnection established between each pair of peers
7. DataChannel opens → chat history synced (last 200 messages, <10KB each)
8. On disconnect: relay broadcasts `peer_left`, room auto-deleted when empty

**Limits:**
- Max 50 peers per room (enforced in relay: `MAX_PEERS_PER_ROOM`)
- Chat rate limit: 20 messages/second per client (enforced in `client/src/lib/webrtc.ts`)
- Message size limit: 100KB per chat message (enforced in `client/src/lib/webrtc.ts`)
- Relay rate limit: 30 WebSocket messages per 60s per IP (enforced in `comms-relay/index.ts`)

---

*Integration audit: 2025-06-26*
