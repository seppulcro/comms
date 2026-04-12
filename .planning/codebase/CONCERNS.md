# Codebase Concerns

**Analysis Date:** 2025-04-12

## Tech Debt

**Pervasive `any` types throughout the codebase:**
- Issue: Multiple modules use `any` for message payloads, event handlers, and uiohook bindings instead of typed interfaces. This defeats TypeScript's safety guarantees and makes it easy to introduce runtime type errors.
- Files: `client/src/lib/webrtc.ts` (lines 6, 314-315, 355, 448-449), `client/src/app.tsx` (lines 73-79), `electron/main.ts` (lines 12-13, 232, 237)
- Impact: Refactoring or adding message types risks silent breakage since there's no compile-time contract for signaling messages.
- Fix approach: Define discriminated union types for all signaling/data-channel message shapes (e.g., `ChatMessage | VoiceStateMessage | SignalMessage`) and replace `any` with those types. For uiohook, type the `e` parameter as the library's `UiohookKeyboardEvent`.

**Handler cleanup uses empty-function cast as `any`:**
- Issue: When tearing down message handlers and peer-change handlers, the code replaces them with `(() => {}) as any` instead of using a proper nullable pattern.
- Files: `client/src/components/Chat.tsx` (line 194), `client/src/components/Voice.tsx` (line 39)
- Impact: Fragile cleanup — the `as any` cast hides the fact that the handler type doesn't allow `null`. Any change to the handler signature will silently pass.
- Fix approach: Change `WebRTCManager.setMessageHandler` and `setPeerChangeHandler` to accept `MessageHandler | null`, then set to `null` on cleanup.

**Swallowed errors (empty catch blocks):**
- Issue: At least 10 empty `catch {}` or `.catch(() => {})` blocks silently discard errors.
- Files: `client/src/lib/signaling.ts` (lines 44, 120), `client/src/lib/webrtc.ts` (lines 193, 220, 315, 449, 471), `client/src/components/Settings.tsx` (line 32), `client/src/components/Sidebar.tsx` (line 60), `client/src/app.tsx` (line 62)
- Impact: Silent failures in signaling message parsing, audio device setup, and clipboard operations make debugging extremely difficult.
- Fix approach: Add `console.warn` to all catch blocks, or use a lightweight `logError()` helper for non-critical failures (e.g., `setSinkId` failures). For signaling message parse failures, at minimum log the raw data that failed to parse.

**Duplicate `Nf` icon component definition:**
- Issue: The `Nf` helper component (`<span class="nf">{i}</span>`) is re-defined identically in four component files instead of being shared.
- Files: `client/src/components/Chat.tsx` (line 9), `client/src/components/Voice.tsx` (line 7), `client/src/components/Settings.tsx` (line 6), `client/src/components/ScreenShare.tsx` (line 6)
- Impact: Minor DRY violation, but increases maintenance burden.
- Fix approach: Extract `Nf` to a shared file like `client/src/components/Nf.tsx` and import everywhere.

**Direct DOM manipulation in WebRTC manager:**
- Issue: `WebRTCManager` creates and manages `<audio>` elements by directly manipulating `document.body` — creating hidden `<audio>` elements, querying by attribute selectors, and removing them. This bypasses Preact's virtual DOM entirely.
- Files: `client/src/lib/webrtc.ts` (lines 239-244, 306-318, 389, 437, 446, 462-466)
- Impact: Preact cannot reconcile or track these elements. If components unmount/remount during voice calls, orphaned audio elements could persist. State management for audio playback is fragile and not testable.
- Fix approach: Move audio element lifecycle into a React/Preact-managed component (e.g., `<PeerAudio peerId={...} stream={...} />`), or at minimum consolidate all DOM audio operations into a dedicated `AudioPlaybackManager` class that can be tested independently.

**`checkForUpdates` IPC handler is a no-op:**
- Issue: The `check-for-updates` IPC handler in the main process is an empty function that does nothing.
- Files: `electron/main.ts` (line 220), `client/src/lib/updater.ts` (lines 1-9)
- Impact: Auto-update functionality is wired up end-to-end but does nothing. Users will never receive update notifications.
- Fix approach: Implement using `electron-updater` or remove the dead code path and settings references until an update mechanism is implemented.

**Data directory with SQLite DB committed to repo:**
- Issue: The `data/` directory containing `comms.db`, `comms.db-wal`, `comms.db-shm`, and `comms.db.bak` is present in the repository. Although `.gitignore` has `*.db` patterns, the `data/` directory itself is tracked.
- Files: `data/comms.db`, `data/comms.db.bak`, `data/comms.db-shm`, `data/comms.db-wal`
- Impact: Potentially leaks private data if the DB contains user information. Bloats the repo unnecessarily.
- Fix approach: Add `data/` to `.gitignore` and `git rm -r --cached data/` to remove from tracking.

**Store test reveals wrong default signaling URL:**
- Issue: `client/src/lib/store.test.ts` (line 73) asserts the default signaling URL is `ws://localhost:4000`, but the actual default in `client/src/lib/store.ts` (line 67) is `wss://comms.seppulcro.com`.
- Files: `client/src/lib/store.ts` (line 67), `client/src/lib/store.test.ts` (line 73)
- Impact: The test is wrong — it passes only because `store.ts` re-reads from localStorage (which in the test mock is empty, and the mock was set up before the dynamic import). This means the test is not actually testing the real default; it's testing the mock. Fragile and misleading.
- Fix approach: Fix the test to match the actual default or ensure the mock properly validates the real default URL.

## Security Considerations

**XSS surface via markdown rendering:**
- Risk: Chat messages are rendered via `marked` + `DOMPurify.sanitize()` with `dangerouslySetInnerHTML`. While DOMPurify is configured with an allowlist, the `ALLOWED_URI_REGEXP` permits `data:` URIs for `<img src>` and `<a href>`.
- Files: `client/src/components/Chat.tsx` (lines 33-41, 325)
- Current mitigation: DOMPurify with explicit tag/attribute allowlists and restricted URI schemes. CSP in `client/app.html` (line 5) restricts `img-src` to `'self' data: blob:` and `script-src` to `'self'` only.
- Recommendations: The DOMPurify config is reasonable. Consider adding `target="_blank" rel="noopener noreferrer"` to all rendered `<a>` tags via a DOMPurify hook. Monitor DOMPurify and marked for CVEs. Consider removing `data:` from `ALLOWED_URI_REGEXP` for `<a href>` while keeping it for `<img src>`.

**Signaling relay has no authentication:**
- Risk: Anyone who discovers the relay URL can connect, join rooms (as long as they have valid UUIDs), and relay signals. The relay trusts `peer_id` sent by the client — a malicious client can impersonate any peer ID.
- Files: `comms-relay/index.ts` (lines 127-177)
- Current mitigation: Per-IP rate limiting (30 req/min), room ID validation (must be UUID), and max 50 peers per room. The relay only forwards signaling; actual data flows P2P.
- Recommendations: Add optional token-based room authentication (e.g., HMAC-signed room tokens). Enforce server-generated peer IDs (assign on WebSocket open) instead of trusting client-provided IDs.

**Identity stored as plaintext JSON:**
- Risk: The user's peer ID and display name are stored as an unencrypted JSON file in `userData`.
- Files: `electron/main.ts` (lines 43-58)
- Current mitigation: None. The peer_id is a UUID, not a cryptographic key.
- Recommendations: Low priority for now since peer_id is not a secret. If attestation/cryptographic identity is added (per TODO.md milestones), keys must be stored in OS keychain or encrypted at rest.

**Host privilege based on join order, not authentication:**
- Risk: The first peer to join a room becomes "host" and can kick others. There's no cryptographic proof of room ownership.
- Files: `comms-relay/index.ts` (lines 175-176, 209-239)
- Current mitigation: Only the first peer gets `isHost: true`. Kick requests from non-hosts return an error.
- Recommendations: Acceptable for MVP. Future enhancement: tie room ownership to a signed token derived from room creation.

**CSP allows `ws:` in connect-src:**
- Risk: The CSP directive `connect-src 'self' wss: ws:` allows unencrypted WebSocket connections. A user could configure a `ws://` signaling URL, sending signaling data in cleartext.
- Files: `client/app.html` (line 5)
- Current mitigation: Default signaling URL uses `wss://`.
- Recommendations: Consider warning users when they configure non-TLS signaling URLs in settings. For production, consider restricting to `wss:` only.

## Performance Bottlenecks

**`requestAnimationFrame`-based speaking detection runs indefinitely:**
- Problem: Both `monitorSpeaking` (per remote peer) and `startSpeakingDetection` (local mic) use recursive `requestAnimationFrame` loops that run continuously at ~60fps while any voice connection is active, performing FFT analysis every frame.
- Files: `client/src/lib/webrtc.ts` (lines 321-358)
- Cause: `requestAnimationFrame` runs at display refresh rate. For speaking detection, 10-20Hz polling would be more than sufficient.
- Improvement path: Replace `requestAnimationFrame` with `setInterval` at 50-100ms intervals. This would reduce CPU usage by ~80% during voice calls with no perceptible difference in speaking indicator responsiveness. Also cancel the interval when the peer disconnects or voice is left (currently `monitorSpeaking` only stops when the peer is removed from the map, but the rAF continues until then).

**Chat history sync sends up to 200 messages on every peer connection:**
- Problem: When a data channel opens, the host sends up to 200 messages from IndexedDB to the new peer. With multiple peers joining a room, this means N × 200 messages are loaded and transmitted.
- Files: `client/src/lib/webrtc.ts` (lines 201-222)
- Cause: No incremental sync — always sends the full tail of history.
- Improvement path: Include a `lastTimestamp` in the sync request so peers only send messages newer than what the joiner already has. Also, debounce/batch the sync so it doesn't happen if the channel closes and reopens quickly.

**Full message list re-render on every new message:**
- Problem: `setMessages(prev => [...prev, msg])` creates a new array and triggers a full component re-render for the entire chat message list on every incoming message.
- Files: `client/src/components/Chat.tsx` (lines 172-175, 207)
- Cause: No virtualization or memoization. Each render calls `renderMarkdown()` and `DOMPurify.sanitize()` on all visible messages.
- Improvement path: Memoize `renderMarkdown` output per message ID (since messages are immutable). Consider virtualizing the message list for rooms with many messages.

## Fragile Areas

**WebRTC negotiation race conditions:**
- Files: `client/src/lib/webrtc.ts` (lines 68-91, 150-171)
- Why fragile: The `onnegotiationneeded` handler and the explicit `createOffer` call in `createPeerConnection` (line 166) can race. If `onnegotiationneeded` fires before the explicit offer's `setLocalDescription` completes, SDP negotiation can enter an invalid state. The signaling flow also doesn't handle "glare" (simultaneous offers from both sides).
- Safe modification: When modifying SDP negotiation, add a "perfect negotiation" pattern with a polite/impolite peer role. Test with two actual browser instances, not just the signaling relay.
- Test coverage: No WebRTC tests exist — only signaling relay tests. The integration test in `client/src/lib/signaling.integration.test.ts` tests message routing but not actual RTCPeerConnection behavior.

**Singleton module pattern for global state:**
- Files: `client/src/lib/webrtc.ts` (line 479: `export const rtc`), `client/src/lib/signaling.ts` (line 133: `export const signaling`), `client/src/lib/ptt.ts` (line 135: `export const ptt`), `client/src/lib/store.ts` (lines 31-38)
- Why fragile: All core state (WebRTC connections, signaling, PTT, settings) is in module-level singletons. This makes testing impossible without import-time side effects, prevents running multiple instances, and creates hidden coupling between modules (e.g., `ptt.ts` directly imports and calls `rtc.setMicEnabled`).
- Safe modification: When adding features, be aware that `rtc`, `signaling`, and `ptt` are all tightly coupled singletons. Modifying one often requires understanding the others. Don't call `init()` on any singleton more than once.
- Test coverage: Singletons can't be reset between tests. The store test works around this via dynamic import. No unit tests exist for `webrtc.ts`, `ptt.ts`, or `signaling.ts`.

**Screen share track cleanup:**
- Files: `client/src/lib/webrtc.ts` (lines 401-419)
- Why fragile: `startScreenShare` adds video tracks to all existing peer connections, but `stopScreenShare` only stops the local stream tracks — it doesn't remove the senders from peer connections. This means RTP senders for the screen share remain in the peer connections after stopping, potentially causing negotiation issues if screen sharing is started again.
- Safe modification: After stopping tracks, iterate peers and call `pc.removeTrack(sender)` for each screen share sender.
- Test coverage: None.

## Scaling Limits

**Relay server in-memory state:**
- Current capacity: All rooms and peer connections stored in `Map` objects in memory. Rate-limit timestamps also in memory.
- Limit: A single Bun process with in-memory maps. If the server restarts, all rooms are lost. Cannot horizontally scale to multiple relay instances.
- Scaling path: For multi-instance, add Redis or similar pub/sub for room state. For persistence, rooms are ephemeral by design (signaling only), so restarts just require peers to reconnect.
- Files: `comms-relay/index.ts` (lines 23-28)

**Full-mesh P2P topology:**
- Current capacity: Each peer connects to every other peer (N×(N-1)/2 connections). Practical limit is ~8-10 peers for voice before bandwidth and CPU become issues.
- Limit: 50 peers per room (relay limit), but WebRTC full-mesh will degrade well before that.
- Scaling path: For larger rooms, implement an SFU (Selective Forwarding Unit) or MCU. The TODO.md doesn't mention this, so current 50-peer limit is aspirational.
- Files: `comms-relay/index.ts` (line 25: `MAX_PEERS_PER_ROOM = 50`), `client/src/lib/webrtc.ts` (full-mesh in `createPeerConnection`)

**IndexedDB chat storage grows unbounded:**
- Current capacity: All messages for all rooms stored forever in IndexedDB with no cleanup.
- Limit: IndexedDB typically has a per-origin quota of 50-80% of available disk space, but with base64-encoded images embedded in messages, storage can grow rapidly.
- Scaling path: Add a retention policy (e.g., delete messages older than 30 days, or cap per-room storage). The `clearRoomMessages` function exists but is never called from the UI.
- Files: `client/src/lib/chatdb.ts` (lines 63-73 for load, 75-92 for clear — clear never used)

## Dependencies at Risk

**`uiohook-napi` — native dependency for global keyboard hook:**
- Risk: Native N-API module that requires platform-specific compilation. Build failures on CI are common (the release workflow installs X11 libs on Linux). The module is `require()`'d with a try/catch fallback.
- Impact: If the build fails on a platform, global PTT (push-to-talk when app is not focused) is silently disabled. Users may not realize PTT only works when the window is focused.
- Migration plan: Already noted in `TODO.md` — Capacitor migration would replace this with native plugins. Short-term, no alternative exists for global key hooks on Wayland.
- Files: `electron/main.ts` (lines 11-20), `package.json` (line 29)

## Missing Critical Features

**No TURN server configuration:**
- Problem: ICE configuration only includes STUN servers (Google, Cloudflare, Metered).
- Blocks: Peers behind symmetric NATs or restrictive firewalls cannot establish direct P2P connections. Voice, chat, and screen sharing will all fail in these scenarios.
- Files: `client/src/lib/webrtc.ts` (lines 10-17)
- Fix: Add configurable TURN server credentials in settings, or document self-hosting a TURN server.

**No reconnection logic for WebRTC peer connections:**
- Problem: When a peer connection enters `disconnected` or `failed` state, the peer is simply removed. There is no attempt to re-negotiate or re-establish the connection.
- Blocks: Transient network issues (Wi-Fi switch, brief packet loss) permanently disconnect peers instead of recovering.
- Files: `client/src/lib/webrtc.ts` (lines 144-148)
- Fix: Implement ICE restart on `disconnected` state before falling back to full removal on `failed`.

**No input validation on signaling relay messages:**
- Problem: The relay server does minimal validation on incoming messages. Fields like `peer_id`, `name`, and `data` are not length-checked or sanitized. A malicious client could send oversized payloads.
- Blocks: Potential for abuse — flooding with large signal payloads, excessively long names, etc.
- Files: `comms-relay/index.ts` (lines 121-252)
- Fix: Add max message size check (e.g., 64KB), max name length (e.g., 64 chars), and validate required fields exist on `join` messages.

## Test Coverage Gaps

**No tests for WebRTC manager:**
- What's not tested: The entire `WebRTCManager` class — connection setup, data channel management, audio/video track handling, speaking detection, screen sharing, muting.
- Files: `client/src/lib/webrtc.ts`
- Risk: The most complex module in the codebase (479 lines) has zero test coverage. Any refactoring is high-risk.
- Priority: High

**No tests for PTT handler:**
- What's not tested: Push-to-talk key binding, keyboard/mouse event handling, Electron IPC integration, voice mode switching.
- Files: `client/src/lib/ptt.ts`
- Risk: PTT is a core UX feature. Changes to key handling could silently break it.
- Priority: Medium

**No component tests:**
- What's not tested: All Preact components — `Chat.tsx`, `Voice.tsx`, `Settings.tsx`, `Sidebar.tsx`, `ScreenShare.tsx`. No rendering tests, no interaction tests.
- Files: `client/src/components/*.tsx`
- Risk: UI regressions go undetected. The chat markdown rendering pipeline (marked → DOMPurify → dangerouslySetInnerHTML) is particularly risk-prone.
- Priority: Medium

**No E2E tests:**
- What's not tested: Full user flows — hosting a room, joining via invite, sending messages, voice calls.
- Risk: Integration between signaling, WebRTC, and UI cannot be verified automatically. Manual testing is the only safety net.
- Priority: Low (appropriate for project stage, but important before v1.0)

---

*Concerns audit: 2025-04-12*
