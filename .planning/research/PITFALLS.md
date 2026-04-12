# Pitfalls Research

**Domain:** P2P protocol-agnostic room runtime with mesh transport bridging
**Researched:** 2025-07-15
**Confidence:** HIGH (based on codebase analysis, known platform constraints, protocol specifications)

## Critical Pitfalls

### Pitfall 1: Capacitor-Community/Electron Is a Community Plugin — Not Officially Maintained

**What goes wrong:**
`@capacitor-community/electron` is maintained by community volunteers, not the Ionic team. It frequently lags behind Capacitor core releases, sometimes by months. Breaking changes in Capacitor 5→6 or future versions may leave the Electron plugin broken or incompatible. The plugin has had periods of near-abandonment before community members stepped in.

**Why it happens:**
Ionic's business model centers on mobile (iOS/Android). Desktop is a community afterthought. Developers assume "Capacitor supports Electron" without checking that it's a community-maintained bridge with no SLA.

**How to avoid:**
- Pin `@capacitor-community/electron` to a known-working version and test thoroughly before upgrading
- Keep the Electron-specific surface area minimal — isolate all Electron-specific code behind Capacitor plugin interfaces so the app can fall back to raw Electron if the community plugin breaks
- Maintain a thin native shell: the current `electron/main.ts` is only ~288 lines — keeping this small means a fallback to direct Electron is always viable
- Monitor the GitHub repo's issue tracker and commit frequency before each milestone

**Warning signs:**
- Community plugin hasn't had a release in >3 months when Capacitor core has moved ahead
- Open issues pile up without maintainer response
- Plugin's peer dependency on `@capacitor/core` falls behind the latest major version

**Phase to address:**
Milestone 1 (Capacitor Migration) — evaluate whether the community plugin meets needs, with a documented fallback plan to maintain a thin custom Electron wrapper alongside Capacitor mobile targets.

---

### Pitfall 2: Preload Bridge / contextBridge Pattern Has No Capacitor Equivalent

**What goes wrong:**
The entire renderer currently talks to native code through `window.electronAPI` exposed via Electron's `contextBridge` (9 methods in `preload.ts`). Capacitor uses a completely different mechanism: `registerPlugin()` + `@capacitor/core` bridge. Every call site that touches `window.electronAPI` must be refactored. Code that checks `isElectron` (`platform.ts:1`) to gate Electron-specific behavior becomes a multi-platform dispatch mess.

**Why it happens:**
Developers see Capacitor-community/electron wrapping Electron and assume the existing Electron IPC code will "just work." It won't — Capacitor's plugin system replaces the preload/contextBridge pattern entirely.

**How to avoid:**
- Create a platform abstraction layer BEFORE the Capacitor migration: `IPlatform` interface with methods like `getIdentity()`, `setMicState()`, `copyToClipboard()`, `onPttDown()` etc.
- Implement `ElectronPlatform` (wraps current `window.electronAPI`), `CapacitorPlatform` (wraps Capacitor plugins), and `WebPlatform` (existing mock behavior from `client/src/mock.ts`)
- All components consume `IPlatform` — never reference `window.electronAPI` or Capacitor directly
- Current `isElectron` check in `platform.ts` becomes `platform.type === 'electron' | 'capacitor' | 'web'`

**Warning signs:**
- Growing `if (isElectron) ... else if (isCapacitor) ... else ...` branches throughout components
- Features working on desktop but silently broken on mobile (no error, just no-op)
- Mock mode (`?mock` in browser) diverging from actual platform behavior

**Phase to address:**
Milestone 1 (Capacitor Migration) — the platform abstraction layer must be the FIRST thing built, before any Capacitor dependency is added.

---

### Pitfall 3: WebRTC Negotiation Glare Becomes Critical With Multi-Transport

**What goes wrong:**
The current WebRTC code in `webrtc.ts:150-171` has a known race condition: `onnegotiationneeded` and the explicit `createOffer` call at line 166 can fire simultaneously, producing two offers in flight. The codebase already documents this as a fragile area (CONCERNS.md). When transport abstraction adds a second signaling path (Reticulum alongside WebSocket), this race multiplies — offers may arrive via different transports at different times, creating irrecoverable negotiation failures.

**Why it happens:**
The "perfect negotiation" pattern (RFC 8829) requires designating polite/impolite peers and handling rollback. The current code doesn't implement this. Adding a second transport that introduces additional latency variance makes glare near-certain rather than merely possible.

**How to avoid:**
- Implement the "perfect negotiation" pattern BEFORE adding transport abstraction:
  - Designate roles: peer with lexicographically lower ID is "polite" (rolls back on glare)
  - Check `signalingState` before calling `setRemoteDescription` — if in `have-local-offer`, rollback first
  - Remove the explicit `createOffer` at line 166 — let `onnegotiationneeded` handle all offers
- Add ICE restart on `connectionState === 'disconnected'` (currently just removes the peer — line 145-148)
- This is prerequisite work that MUST happen before transport abstraction

**Warning signs:**
- Intermittent "Failed to set remote offer sdp: Called in wrong state" errors in console
- Connections that never establish (stuck in `connecting` state)
- Peer pairs where A connects to B but B doesn't see A

**Phase to address:**
Milestone 2 (Transport Abstraction) — but the WebRTC negotiation fix should be a pre-migration hardening task in Milestone 1.

---

### Pitfall 4: Reticulum IPC — Spawning Python From a Desktop/Mobile App Is Fragile

**What goes wrong:**
Reticulum is a Python application. The Comms app is TypeScript. The planned architecture requires the TypeScript app to communicate with a local Reticulum daemon. On desktop, this means spawning or connecting to a Python process. On mobile (Milestone 8), this means embedding Python via Chaquopy (Android) or PythonKit (iOS). Each approach has distinct failure modes:

- **Desktop subprocess**: Python not installed, wrong version, missing pip packages, orphaned zombie processes on crash, buffered stdout causing apparent hangs
- **Mobile embedded Python**: Chaquopy adds ~25MB to APK size, cold start 2-5 seconds, GIL contention with Reticulum's async code, PythonKit on iOS requires Python framework embedding which Apple has historically been hostile toward
- **Both**: Serialization overhead for every message, error propagation across language boundary (Python tracebacks don't become TypeScript errors), binary data encoding mismatches

**Why it happens:**
Cross-language IPC is consistently underestimated. "Just spawn a subprocess and talk over JSON" sounds simple. In practice, stream buffering, process lifecycle, error handling, and platform differences consume weeks.

**How to avoid:**
- **Desktop**: Don't spawn Reticulum — connect to an EXISTING Reticulum daemon via its TCP/IP interface. Reticulum already supports `TCPServerInterface` and `TCPClientInterface`. Require users to run `rnsd` (Reticulum Network Stack daemon) as a system service, then connect via TCP socket. This eliminates Python embedding entirely on desktop.
- **Mobile**: Use the Reticulum TCP interface to connect to a local or nearby Reticulum instance. For fully standalone mobile operation, Chaquopy (Android) is more mature than PythonKit (iOS) — start with Android-only Reticulum support.
- **IPC protocol**: Use a socket-based protocol (not stdin/stdout). Define a strict binary/MessagePack envelope rather than JSON for high-frequency messages (GPS beacons). Include a version field for protocol evolution.
- **Error contract**: Define explicit error message types in the IPC protocol. Never rely on parsing Python tracebacks from stderr.

**Warning signs:**
- "Works on my machine" — developer has Python 3.11 but target has 3.9 or none
- Reticulum daemon startup takes >5 seconds, blocking app launch
- Messages appear to hang — actually stuck in Python's stdout buffer (needs `flush()`)
- Mobile app review rejection citing embedded interpreter

**Phase to address:**
Milestone 2 (Transport Abstraction) — design the Reticulum interface as a socket client, not a subprocess manager. Milestone 8 (Mobile) for the embedded Python question.

---

### Pitfall 5: ML-DSA-65 Signatures Don't Fit in LoRa Packets

**What goes wrong:**
ML-DSA-65 (FIPS 204) produces 3293-byte signatures. ML-KEM-768 ciphertexts are 1088 bytes. Public keys are 1952 bytes. Over LoRa with Reticulum, single-packet capacity is ~174 bytes and Link packets max around ~500 bytes. A single ML-DSA-65 signature exceeds the maximum Reticulum link packet size by 6x. Attested GPS beacons (coordinates + timestamp + signature ≈ 3350+ bytes) require multi-packet fragmentation over LoRa, introducing latency and reliability issues.

**Why it happens:**
Post-quantum algorithms trade size for quantum resistance. Developers choose PQ algorithms for security properties without checking if the wire format fits their transport constraints. The PHANTOM repo was designed for desktop/server contexts where bandwidth is cheap.

**How to avoid:**
- **Attestation is WebRTC-transport-only by default.** Over LoRa/Reticulum, attestation is either disabled or uses a lightweight classical signature (Ed25519 — 64 bytes) with a PQ upgrade path when bandwidth allows
- **Separate attestation from transport.** Attest locally (sign + chain + store in SQLite) but transmit only the message payload + compact reference (hash of the attestation record). Peers verify attestation when they have bandwidth (sync full attestation chain over WebRTC later)
- **Consider SLH-DSA-128s** (SPHINCS+) if hash-based signatures are acceptable — or accept that PQ attestation is a non-LoRa feature
- **Document the constraint explicitly:** "Attestation requires broadband transport. LoRa peers receive messages but cannot verify attestation in real-time."

**Warning signs:**
- Reticulum link establishment fails when attested messages are sent (packet too large)
- GPS beacon rate drops from 1Hz to 0.1Hz over LoRa due to fragmentation
- Attestation "works in testing" (WebRTC only) but breaks in field deployment (LoRa)

**Phase to address:**
Milestone 3 (Attestation) — design the attestation protocol with transport-aware signing. Milestone 2 (Transport Abstraction) must expose transport bandwidth capabilities so attestation can adapt.

---

### Pitfall 6: Room State Splits When the Transport Bridge Fails

**What goes wrong:**
A room with peers on both WebRTC (internet) and Reticulum (mesh) requires a bridge peer — someone connected to both transports. If that bridge peer disconnects, the room splits into two isolated groups. Each group continues with its own chat history, host assignment, and member list. When the bridge reconnects, reconciling diverged state is a hard distributed systems problem — especially for host authority (currently based on join order, per `comms-relay/index.ts:175-176`).

**Why it happens:**
P2P systems without consensus protocols inevitably face split-brain scenarios. The current architecture uses a "first peer is host" model that works for single-transport rooms but breaks when multiple transports create parallel trust boundaries.

**How to avoid:**
- **Design for eventual consistency from the start.** Every message already has a unique ID and timestamp (see `chatdb.ts:27-35`). Use these for deduplication and merge:
  - Chat messages: merge by ID, sort by timestamp (CRDT-like LWW — Last Writer Wins with UUID tiebreakers)
  - Peer list: union of peers seen on any transport, with heartbeat-based liveness
  - Host authority: derive from a deterministic function of the room's member set (e.g., lowest peer_id hash), not join order
- **No single bridge peer.** Any peer on multiple transports is a bridge. Messages are gossiped — each peer forwards messages it receives on one transport to peers it knows on another.
- **Explicit split-brain detection.** Track transport-level connectivity per peer. When the UI shows peers on different transports, visually indicate bridge status. Warn if no bridge exists.

**Warning signs:**
- Same message appearing twice in chat (message from bridged peer echoes back)
- "Host" changing unexpectedly when a peer disconnects
- Peer counts disagreeing between different room members
- Chat history diverging — peer A has messages peer B doesn't, and vice versa

**Phase to address:**
Milestone 2 (Transport Abstraction) — the Transport interface must include message deduplication, and the room state model must be transport-agnostic. This is architectural and must be designed correctly upfront — retrofitting eventual consistency onto a single-transport design is extremely painful.

---

### Pitfall 7: iOS Kills Background P2P Connections After ~10 Seconds

**What goes wrong:**
iOS aggressively suspends apps when backgrounded. WebRTC peer connections, WebSocket signaling connections, and any in-progress file transfers are terminated within ~10 seconds of the app going to background. When the user returns, all connections are dead and must be re-established. Voice calls drop. File transfers fail. GPS sharing stops.

**Why it happens:**
iOS prioritizes battery life and resource management. The only sanctioned background modes are:
- **Audio** (requires active audio playback/recording — legitimate for voice calls)
- **Location** (requires active GPS use — legitimate for GPS sharing, but shows persistent blue bar)
- **VoIP** (deprecated for non-VoIP use, Apple rejects apps that abuse this)
- **Background Fetch** (periodic, unreliable, not suitable for real-time)

None of these maintain arbitrary P2P connections in background.

**How to avoid:**
- **Voice calls**: Use `UIBackgroundModes: audio` — legitimate since the app IS doing real-time audio. This keeps WebRTC audio connections alive in background.
- **GPS sharing**: Use `UIBackgroundModes: location` — legitimate. BUT: Apple requires visible indicator (blue bar) and may reject if location use isn't core to the app.
- **Everything else** (chat, file transfer, service bridging): Accept that these pause in background on iOS. Design for reconnection:
  - File transfer: implement chunk-level resumability with SHA-256 per-chunk hashes
  - Chat: rely on message sync on reconnection (the existing chat-history sync at `webrtc.ts:201-222`)
  - Service bridging: TCP proxy connections drop and must be re-established
- **Android**: Use a foreground service with persistent notification for background operation. This is well-supported but users must opt in.
- **Do NOT try to hack around iOS background limits** — Apple will reject the app

**Warning signs:**
- "Works on simulator" but fails on real device (simulator doesn't enforce background limits)
- App Store review rejection citing unauthorized background mode usage
- Users reporting dropped voice calls when switching apps briefly
- Battery drain complaints on iOS (background audio/location mode is power-hungry)

**Phase to address:**
Milestone 8 (Mobile) — but the file transfer resumability (Milestone 5) and reconnection logic must be designed with mobile background kills in mind from the start.

---

### Pitfall 8: TCP Proxy Service Bridging Creates an Open Relay

**What goes wrong:**
Service bridging proxies `localhost:port` through a DataChannel to peers. If the implementation accepts arbitrary port requests from peers, a malicious room member can:
1. Port-scan the host's localhost (enumerate running services)
2. Access unintended services (databases, admin panels, SSH)
3. Reach the host's LAN by requesting proxy to `192.168.x.x` addresses (SSRF)
4. Exhaust resources by opening many proxy connections

This turns Comms into an open relay — the Tailscale Funnel analogy breaks down because Tailscale has ACLs, audit logs, and central policy enforcement.

**Why it happens:**
"Proxy localhost:port to peers" sounds straightforward. The security model ("peers are trusted, they're in the room") underestimates the attack surface. Room membership may be permissive (currently anyone with the UUID can join), and even trusted peers' devices could be compromised.

**How to avoid:**
- **Explicit allowlist only.** The HOST decides which `host:port` pairs to share. Peers request from the advertised list, never by arbitrary port number.
- **No LAN access.** The proxy ONLY connects to `127.0.0.1` (or `::1`). Reject any target address that isn't loopback.
- **Connection limits.** Cap concurrent proxy connections per peer (e.g., 5) and total (e.g., 20). Timeout idle connections.
- **Bandwidth accounting.** Track bytes proxied per peer. Alert/throttle if a peer is pulling gigabytes through the proxy.
- **Audit logging.** Log every proxy connection with timestamp, peer ID, target port, bytes transferred. When attestation is enabled, attest proxy sessions.
- **User consent UX.** When a peer requests access to a shared service, show the host a clear prompt: "[Peer] wants to connect to [Service Name] on port [X]. Allow?"

**Warning signs:**
- During testing, discovering you can access services that weren't explicitly shared
- No logging — proxy connections happen silently
- Proxy accepts requests for ports the host didn't advertise

**Phase to address:**
Milestone 6 (Service Bridging) — security model must be designed before ANY proxy code is written. The allowlist + loopback-only constraints are non-negotiable.

---

### Pitfall 9: DataChannel File Transfer Hits Silent Memory Limits

**What goes wrong:**
WebRTC DataChannel's SCTP layer has a send buffer (typically 16MB in Chromium). When transferring large files, if the sender pushes chunks without checking `bufferedAmount`, the buffer fills up and `send()` either throws or silently drops data. On the receiver side, reassembling a large file in memory (concatenating ArrayBuffers) can cause OOM on mobile devices with limited RAM. A 500MB file transfer can crash the app tab.

**Why it happens:**
Developers test with small files (1-10MB) where buffering isn't an issue. The DataChannel `send()` API doesn't return a promise or indicate backpressure — it's fire-and-forget. `bufferedAmount` must be polled manually. The `bufferedamountlow` event exists but is poorly documented.

**How to avoid:**
- **Backpressure control**: Before each `send()`, check `dc.bufferedAmount`. If above threshold (e.g., 1MB), pause and wait for the `bufferedamountlow` event (set `bufferedAmountLowThreshold` to 256KB)
- **Streaming to disk**: On the receiver, write chunks directly to disk using the File System Access API (desktop) or Capacitor Filesystem plugin (mobile). Never accumulate the entire file in memory.
- **Chunk size**: 64KB chunks balance throughput and memory. Larger chunks (256KB) are fine on fast connections but must still respect `bufferedAmount`.
- **Separate DataChannel**: Use a dedicated DataChannel for file transfers (not the existing `'chat'` channel). DataChannels can be ordered or unordered independently. File transfer should be ordered + reliable (default SCTP mode).
- **Transfer metadata first**: Send a `file-offer` message on the chat channel with filename, size, SHA-256 hash, chunk count. Receiver accepts/rejects. Then send chunks on the file channel.
- **SHA-256 verification**: Hash each chunk and the final reassembled file. Compare against the sender's declared hash.

**Warning signs:**
- File transfers work for small files (<10MB) but fail silently for larger ones
- Browser memory usage spikes during transfer (visible in DevTools → Performance tab)
- `DataChannel.send()` throwing after rapid consecutive calls
- Receiver gets a corrupted file (truncated or with missing chunks)

**Phase to address:**
Milestone 5 (File Sharing & Media Streaming) — backpressure + streaming-to-disk are day-one requirements, not optimizations.

---

### Pitfall 10: Byte-Identical Attestation Output Requires Deterministic Serialization

**What goes wrong:**
The attestation system chains hashes: `hash(prev_hash || message_bytes)`. The constraint is that chain output must be byte-identical across all platforms (desktop, mobile, different OS). If the "message bytes" are derived from JSON serialization, key ordering differences between platforms produce different bytes, different hashes, and broken chains. JavaScript's `JSON.stringify()` does not guarantee key order (it happens to be insertion-order in V8, but this is implementation-defined). Python's `json.dumps()` has different default ordering. C++ has no native JSON with guaranteed ordering.

**Why it happens:**
Developers assume JSON is deterministic because it "looks the same." It isn't. Even with sorted keys, floating-point number serialization, Unicode normalization, and whitespace handling differ between implementations.

**How to avoid:**
- **Canonical serialization format.** Do NOT use JSON as the hash input. Use a deterministic binary format:
  - **Option A**: CBOR with deterministic encoding (RFC 8949, Core Deterministic Encoding) — has implementations in C++, TypeScript, and Python
  - **Option B**: Custom TLV (Type-Length-Value) encoding — simple, fully controlled, no parser ambiguity
  - **Option C**: Protocol Buffers with deterministic serialization (set `deterministic=True` in Python, use `serializeDeterministic` in JS)
- **The C++ crypto core (PHANTOM) should define the canonical byte format.** TypeScript and Python produce the same bytes by following the same spec, verified with cross-platform test vectors.
- **Test vectors are mandatory.** Create a suite of known inputs → expected hash outputs. Run these tests on every platform as CI gates.

**Warning signs:**
- Attestation chains verify locally but fail when verified by a peer on a different platform
- Hash values differ between desktop and mobile for the same message
- Adding a new field to attested messages breaks existing chain verification

**Phase to address:**
Milestone 3 (Attestation) — the canonical serialization format must be the FIRST design decision, before any signing code is written.

---

### Pitfall 11: LXMF Interop Requires Matching Reticulum's Cryptographic Identity Model

**What goes wrong:**
LXMF (Lightweight Extensible Message Format) and Reticulum use a specific identity system: Reticulum identities are X25519/Ed25519 keypairs, and destination addresses are truncated hashes of the public key. Comms currently uses random UUIDs as peer IDs (`randomUUID()` in `electron/main.ts:49`). These two identity systems are incompatible. A Comms peer can't be addressed by Sideband/MeshChat unless it has a valid Reticulum identity. Conversely, a Reticulum identity can't be directly used as a Comms peer ID.

**Why it happens:**
Identity is the hardest bridging problem. Each protocol has its own identity model and making them interoperate requires either: (a) a canonical identity that both protocols understand, or (b) an identity mapping layer. Neither is trivial.

**How to avoid:**
- **Dual identity model**: Each Comms peer maintains both a UUID (for WebRTC signaling) and a Reticulum identity (for mesh transport). The room state maps between them.
- **Reticulum identity as the authoritative identity when attestation is enabled.** The UUID becomes a session identifier, not a persistent identity. The Reticulum keypair (or the ML-DSA-65 keypair from attestation) becomes the long-term identity.
- **LXMF content mapping**: Define a clear mapping between Comms message types (chat, GPS beacon, voice state, etc.) and LXMF content types. Use LXMF "fields" (a key-value extension mechanism) for Comms-specific metadata that Sideband/MeshChat can gracefully ignore.
- **Test with actual Sideband/MeshChat**: Don't develop LXMF interop in isolation. Set up a test network with real Sideband clients early and verify message roundtrips.

**Warning signs:**
- Messages from Comms appear garbled or are dropped by Sideband
- Sideband messages arrive but show as "Unknown sender" in Comms
- Comms peer appears as multiple identities to Sideband (UUID vs Reticulum address)

**Phase to address:**
Milestone 2 (Transport Abstraction) — the identity model must accommodate Reticulum identities from the start. Retrofitting a second identity system onto a UUID-only model is a rewrite.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Singleton modules (`rtc`, `signaling`, `ptt`) | Simple, no DI framework needed | Untestable, prevents multiple rooms, hidden coupling (CONCERNS.md already flags this) | Never in a multi-transport app — must refactor to dependency injection before Milestone 2 |
| Direct DOM audio manipulation (`webrtc.ts:305-318`) | Works without React/Preact involvement | Orphaned elements, untestable, breaks if component tree changes | Only for Milestone 1 — must move to managed component before mobile |
| `any` types throughout signaling/WebRTC | Fast iteration, no type definitions needed | Silent runtime errors, impossible safe refactoring (CONCERNS.md catalogs 6+ locations) | Never — the transport abstraction will multiply message types; `any` becomes lethal |
| Empty catch blocks (10+ locations per CONCERNS.md) | No error UI to build | Silent failures make debugging cross-transport issues impossible | Never — at minimum `console.warn` everything; for IPC/transport errors, surface to UI |
| First-joiner-is-host | Simple, no crypto needed | Breaks with multi-transport rooms, enables host hijacking | Only until Milestone 7 (Gated Rooms) — then host must be cryptographically derived |
| Chat history full-sync on connect (`webrtc.ts:201-222`) | Simple, no incremental sync protocol | N×200 messages on every peer join; doesn't scale to large rooms or Reticulum (bandwidth) | Only until Milestone 2 — transport abstraction must include bandwidth-aware sync |

## Integration Gotchas

Common mistakes when connecting to external services/protocols.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Reticulum daemon | Spawning Python subprocess and managing lifecycle | Connect to `rnsd` via TCP interface — let the user/OS manage the daemon lifecycle |
| LXMF propagation nodes | Assuming real-time delivery (like WebRTC) | LXMF is store-and-forward; design for async delivery with unknown latency (minutes to hours over mesh) |
| liboqs N-API module | Building against system Node.js, deploying with Electron's Node.js | Build with `node-gyp` targeting the specific Electron version's ABI; use `electron-rebuild` or prebuild binaries per platform |
| Capacitor Geolocation | Requesting `enableHighAccuracy: true` always | On mobile, high accuracy drains battery 5-10x faster; use coarse location by default, high accuracy only when user explicitly enables "precision mode" |
| iOS WKWebView + WebRTC | Assuming full parity with desktop Chrome | WKWebView doesn't support `getDisplayMedia()` (no screen sharing from WebView on iOS); camera/mic work but require native permission prompts via Capacitor |
| Android Chaquopy (Python embedding) | Assuming all Python packages work | Chaquopy supports pure-Python packages and select native packages; Reticulum's dependencies (especially `cryptography`) require pre-built wheels for Android ARM |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-mesh WebRTC topology | CPU and bandwidth scale O(N²) | Consider SFU for rooms >8 peers; for text-only over Reticulum, gossip protocol scales better | >8 peers in voice, >20 peers in text-only |
| `requestAnimationFrame` speaking detection (`webrtc.ts:321-358`) | 60fps FFT analysis per peer — already flagged in CONCERNS.md | Replace with `setInterval` at 100ms (10Hz) — indistinguishable to users, 83% CPU reduction | >4 peers in voice on mobile |
| Accumulating GPS beacons in memory | Memory grows linearly with time × peers | Ring buffer per peer (keep last N positions), persist to IndexedDB only when needed for replay | 10+ peers sharing GPS for >1 hour (360K+ data points) |
| IndexedDB unbounded growth (CONCERNS.md: scaling limits) | Disk quota warnings, sluggish chat loading | Retention policy: delete messages >30 days or >10K per room; `clearRoomMessages` already exists but is never called | >50K messages per room or rooms with heavy image sharing |
| Attesting every GPS beacon at 1Hz | ML-DSA-65 sign is ~1ms desktop, potentially 10ms+ mobile; 10 peers × 1Hz = 10 signatures/sec | Batch attestation: attest every Nth beacon or attest a hash of the last N beacons as a group | Mobile with >5 peers sharing GPS simultaneously |
| JSON serialization for high-frequency messages | `JSON.stringify` + `JSON.parse` on every GPS beacon, every peer, every second | Use ArrayBuffer/MessagePack for GPS beacons (lat: f64, lon: f64, alt: f32, ts: u32 = 24 bytes vs ~100+ bytes JSON) | LoRa transport where every byte matters |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Service proxy accepting arbitrary ports | Host's entire localhost exposed to room peers; port scanning, DB access, SSH hijack | Explicit allowlist-only; proxy connects ONLY to `127.0.0.1`; host manually advertises each service |
| GPS coordinates at full precision broadcast over LoRa | Location pinpointed to <1 meter; Reticulum announcements may be public (unencrypted) | Configurable precision (default: ~100m accuracy = 3 decimal places); GPS beacons only over encrypted Reticulum Links, never Announcements |
| Attested location history as permanent record | Cryptographic proof of where a user was and when — adversary with the SQLite DB has an irrefutable tracking log | Attestation is OPT-IN with prominent warnings; attested GPS data auto-expires from SQLite unless explicitly preserved; users can destroy their own attestation chain |
| Room UUID as sole access control | Anyone who learns the UUID can join (CONCERNS.md: "signaling relay has no authentication") | Fine for open rooms; for gated rooms (Milestone 7), room join requires a signed token. UUID becomes a room identifier, not an access token. |
| No TURN server (CONCERNS.md: missing critical feature) | Peers behind symmetric NATs can't connect — voice/chat/everything fails silently | Self-hostable TURN server config in settings; or use Reticulum as fallback transport for NAT-blocked peers |
| Trusting client-provided peer_id (CONCERNS.md: signaling relay) | Peer ID impersonation — malicious client claims to be another peer | Server-assigned peer IDs on WebSocket connect; or sign peer_id with the peer's cryptographic identity once attestation is available |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silently falling back to degraded transport | User doesn't know voice is unavailable because they're on LoRa only — they try to talk and nothing happens | Explicit transport indicator in UI; grey out unavailable features with tooltip: "Voice requires WiFi/Internet — currently on LoRa mesh only" |
| Requiring Reticulum setup before app is useful | User installs Comms, can't do anything because Reticulum daemon isn't running | WebRTC works out of box with zero config. Reticulum is additive — app is fully functional without it. Show "Mesh transport available" when `rnsd` is detected, not "Mesh transport required" |
| GPS sharing defaults to "always on" | Users unknowingly broadcast location to all room members | GPS sharing requires explicit tap: "Share Location" button, with visible indicator when active, and auto-stop after configurable timeout (default: 30 min) |
| Attestation always on by default | Casual users confused by "attestation" terminology; performance overhead for features they don't need | Off by default. In settings: "Security Mode: Casual / Tactical" — one toggle that enables attestation, PQ crypto, and audit trails |
| File transfer with no progress indicator | User sends a 500MB file, sees nothing for 60 seconds, assumes it failed | Show progress bar with percentage, speed, ETA. Show progress to BOTH sender and receiver. Allow cancel on both sides. |
| Mobile app draining battery from P2P connections | User uninstalls after first day | Battery-aware mode: reduce GPS beacon rate when on battery, pause non-essential sync in background, show battery impact estimate in settings |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Capacitor migration "works":** Verify WebRTC voice call quality through Capacitor-electron shell — audio latency, echo cancellation, and speaking detection may behave differently through the additional WebView layer
- [ ] **Transport abstraction "works":** Test with a peer connected ONLY via Reticulum (no WebRTC) joining a room with WebRTC-only peers — verify messages bridge, presence updates, and feature greying
- [ ] **File transfer "works":** Test with 1GB+ file between two mobile devices on WiFi — verify memory stays flat (not accumulating in RAM), transfer survives brief app background/foreground cycle, and file hash matches
- [ ] **LXMF interop "works":** Send a message from Comms → Sideband → MeshChat → back to Comms — verify message content, sender identity, and timestamps survive the full roundtrip
- [ ] **Attestation "works":** Generate an attestation chain on desktop (x86_64), verify it on mobile (ARM64) — byte-identical chain hashes confirm cross-platform determinism
- [ ] **Service bridging "works":** Attempt to proxy a port that was NOT advertised by the host — verify it's rejected, not silently allowed
- [ ] **GPS sharing "works" on mobile:** Test with app backgrounded for 5 minutes on iOS — verify location updates resume (not stop) when app returns to foreground, and no location data was leaked during suspension
- [ ] **Mobile voice "works":** Test voice call with Bluetooth headphones connected, then disconnected mid-call — verify graceful fallback to speaker, not crash or silence
- [ ] **Reconnection "works":** Kill WiFi mid-voice-call, re-enable after 10 seconds — verify the peer reconnects automatically (currently it just removes the peer per `webrtc.ts:144-148`)
- [ ] **Multi-transport room "works":** Have 3 peers (WebRTC-only, Reticulum-only, both) in one room — verify all three see each other, messages from any peer reach all others, and peer list is consistent across all three views

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Capacitor-community/electron abandoned | MEDIUM | Fall back to maintaining a thin Electron wrapper (~288 lines) alongside Capacitor mobile targets; the web app core doesn't change |
| Room state split-brain | LOW if message IDs exist | Merge by message ID (already unique UUIDs); re-derive host from deterministic function; accept that some ordering may differ |
| Attestation chain divergence cross-platform | HIGH | Identify the serialization difference, fix canonical format, regenerate chain from raw messages — but peers who verified against the old chain have stale proofs |
| File transfer corruption | LOW | Re-transfer from last verified chunk (if resumability was implemented); re-transfer entirely if not |
| Service proxy security breach | HIGH | Immediately disable proxy feature; audit logs (if they exist) to determine what was accessed; rotate any credentials for exposed services |
| Python/Reticulum process crash on mobile | MEDIUM | Restart daemon, re-establish Reticulum links; messages sent during downtime are lost unless LXMF propagation nodes cached them |
| iOS app rejection for background mode abuse | HIGH | Remove offending background mode; redesign for foreground-only operation on iOS; re-submit (Apple review takes 1-7 days per attempt) |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Capacitor-community/electron reliability | M1 (Capacitor Migration) | Document fallback plan; test with pinned version; CI builds pass |
| Preload bridge → Capacitor plugin refactor | M1 (Capacitor Migration) | Zero references to `window.electronAPI` in components; all through `IPlatform` interface |
| WebRTC negotiation glare | M1 (pre-migration hardening) → M2 | Perfect negotiation pattern implemented; glare test (simultaneous offers) passes |
| Reticulum IPC fragility | M2 (Transport Abstraction) | Socket-based IPC to `rnsd`; no subprocess spawning; integration test with real Reticulum daemon |
| PQ signature size vs LoRa MTU | M3 (Attestation) | Attestation protocol spec explicitly defines behavior per transport bandwidth class |
| Room state divergence / split-brain | M2 (Transport Abstraction) | Multi-transport room test: 3 peers on different transports, message consistency verified |
| iOS background connection killing | M5 (File Sharing) + M8 (Mobile) | File transfer resumes after background/foreground cycle on real iOS device |
| TCP proxy as open relay | M6 (Service Bridging) | Penetration test: attempt unauthorized port access, verify rejection + logging |
| DataChannel memory limits | M5 (File Sharing) | 1GB file transfer on mobile; memory stays <50MB throughout |
| Byte-identical attestation serialization | M3 (Attestation) | Cross-platform test vectors: same input → same hash on x86_64, ARM64, WASM |
| LXMF identity/content mapping | M2 (Transport Abstraction) | Roundtrip message test: Comms → Sideband → Comms with content + identity preserved |
| GPS privacy leaks | M4 (GPS Live Map) | Default precision is ≤3 decimal places; no GPS over unencrypted Reticulum announcements |
| Singleton refactoring for multi-transport | M2 (Transport Abstraction) | `rtc`, `signaling`, `ptt` replaced with injected instances; unit tests pass with mock transports |

## Sources

- Codebase analysis: `electron/main.ts`, `client/src/lib/webrtc.ts`, `client/src/lib/signaling.ts`, `client/src/lib/chatdb.ts`, `electron/preload.ts`
- Existing tech debt catalog: `.planning/codebase/CONCERNS.md` (2025-04-12 audit)
- Existing architecture analysis: `.planning/codebase/ARCHITECTURE.md` (2025-07-15)
- Project requirements: `.planning/PROJECT.md` — constraints on liboqs cross-compile, LXMF compat, byte-identical attestation
- Milestone plan: `TODO.md` — M1 through M8 feature breakdown
- WebRTC specification: RFC 8829 (Perfect Negotiation), RFC 8831 (DataChannel), SCTP buffering behavior
- NIST FIPS 204 (ML-DSA) — signature sizes (3293 bytes for ML-DSA-65)
- NIST FIPS 203 (ML-KEM) — ciphertext sizes (1088 bytes for ML-KEM-768)
- Apple iOS Background Execution documentation — app suspension behavior, background modes
- Reticulum documentation — TCPServerInterface, Link packet sizes, identity model (HIGH confidence, well-documented protocol)
- LXMF specification — content types, propagation model (MEDIUM confidence — protocol is less formally specified than Reticulum itself)
- Capacitor-community/electron GitHub — maintenance cadence and issue tracker (MEDIUM confidence — community project status changes over time)

---
*Pitfalls research for: Comms — P2P protocol-agnostic room runtime*
*Researched: 2025-07-15*
