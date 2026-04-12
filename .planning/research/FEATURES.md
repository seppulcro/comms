# Feature Landscape

**Domain:** P2P protocol-agnostic room runtime (voice, text, GPS, files, services, mesh interop)
**Researched:** 2025-07-15
**Overall confidence:** MEDIUM-HIGH

## Table Stakes

Features users expect from a P2P room/communication platform. Missing = product feels incomplete or broken.

### Transport & Connectivity

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| WebRTC voice/text/video (existing) | Baseline — Discord/Zoom/Meet set this expectation | Done | Already implemented. DTLS-SRTP E2E, DataChannels for chat. |
| Graceful transport degradation | If the app claims multi-transport, it must not crash when one is unavailable. Features grey out, not error out. | Medium | Core UX contract. Voice greys out on LoRa. Text stays available. GPS works everywhere. UI must visually communicate what's available. |
| Connection status indicators | Users need to know if they're connected, to whom, and via what transport | Low | Show transport type icon per peer (WiFi/internet vs mesh). Show latency. Show connection quality. Competitors all do this. |
| Auto-reconnect across transports | If WebRTC drops, try mesh. If mesh drops, try WebRTC. No manual intervention. | High | This is what "transport abstraction" really means to users. Seamless failover. The signaling layer already has reconnect logic (exponential backoff). Transport layer needs the same. |
| NAT traversal (STUN/TURN) | WebRTC without TURN fails for ~15% of users behind symmetric NATs | Medium | Currently STUN-only (Google, Cloudflare, Metered). Need at minimum a self-hostable TURN option or relay fallback. Without TURN, some users simply cannot connect. Discord, Signal, and every production WebRTC app has TURN. |

### File Sharing

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Chunked file transfer over DataChannel | Every group chat app does file sharing. Discord, Signal, Briar, MeshChat, Sideband — all support it. | Medium | WebRTC DataChannel max message ~256KB (SCTP). Files must be chunked (16-64KB per chunk is optimal). Send metadata envelope first (filename, size, MIME type, SHA-256), then stream chunks with sequence numbers. Receiver reassembles and verifies. |
| Transfer progress indication | Users expect a progress bar for files > few KB | Low | Derive from chunk sequence / total chunks. Trivial once chunking works. |
| Image/media inline preview | Already partially implemented (image paste via Ctrl+V). Users expect sent files to render inline if they're images/video. | Low | Extend existing image rendering. Use `URL.createObjectURL()` for received blobs. |
| File size limits (explicit) | Users need to know what they can send. Unbounded transfer over DataChannel will stall. | Low | Set pragmatic limits: ~100MB over WebRTC (DataChannel throughput ~2-30 Mbps depending on network). Over Reticulum/LoRa: text-only or tiny files (Reticulum handles arbitrarily large transfers but at low bandwidth). |
| Drag-and-drop file sending | Standard interaction pattern. Discord, Slack, Signal all support it. | Low | HTML5 drag events on the chat area. Trivial UI work. |

### Room Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Invite codes (existing) | Baseline — how people join rooms | Done | Already implemented as `comms-{hex}-{base64name}`. |
| Persistent room list | Users expect rooms to survive app restarts | Done | Already in localStorage. |
| Peer list with presence | See who's in the room, who's talking, who's connected | Done | Already implemented (PeerInfo with speaking detection). |
| Kick/ban capability | Room hosts need moderation. Basic expectation for any group platform. | Low | Kick exists via signaling relay. Ban needs persistent blocklist (by crypto identity once that's implemented). |

### Identity & Security

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Persistent crypto identity | Users expect to be "someone" across sessions. Current UUID-based identity is fragile (no proof of ownership). | Medium | Move from random UUID to Ed25519 keypair. Public key = identity. This is prerequisite for gated rooms, attestation, and mesh interop (Reticulum uses X25519+Ed25519). Sideband, Signal, Briar all use key-based identity. |
| E2E encryption indicators | Users in security-conscious contexts expect to verify encryption is active | Low | Visual lock icon per connection. Already E2E via DTLS-SRTP/DataChannel encryption. Just need to surface it. |
| Private/ephemeral mode (existing) | Some users want zero persistence | Done | Already implemented via `--private` flag. |

## Differentiators

Features that set Comms apart. Not expected (no competitor does all of these), but high value.

### Transport Abstraction Layer

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Protocol-agnostic transport interface | **THE core differentiator.** No app today bridges WebRTC ↔ Reticulum. Discord is internet-only. Sideband/MeshChat are Reticulum-only. Comms speaks both simultaneously. | High | Define a `Transport` interface: `send(envelope)`, `onReceive(handler)`, `capabilities()` (bandwidth, latency, reliability). WebRTC transport and Reticulum transport both implement it. Room multiplexes across available transports. Message routing selects best transport per data type. |
| Bandwidth-aware feature gating | UI shows what's possible on current transport. Voice requires >16kbps (WebRTC). GPS coordinates work on LoRa (tiny payload). Files adapt chunk size to bandwidth. | Medium | Transport reports capabilities. UI binds feature availability to capabilities. This is graceful degradation done right — not just error handling, but proactive feature visibility. |
| Simultaneous multi-transport | Both WebRTC and Reticulum active at once. Peer A connects via internet, Peer B via LoRa, both in same room. | Very High | Requires message deduplication (peers reachable via both transports), consistent message ID scheme across transports, and a room-level message bus that aggregates from all transports. This is the "AirDrop meets Discord meets Tailscale" vision. |
| Automatic transport selection | App picks best available transport per message type without user intervention | High | Heuristic: voice → WebRTC only. Text → prefer WebRTC, fall back to Reticulum. GPS → any transport. Files → WebRTC if available, Reticulum with size warning otherwise. User can override per-room. |

### GPS / Location Sharing

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Live location pins on map | Share GPS in room. Peers see each other on a map. Sideband already does this (telemetry + map display). Comms differentiates by doing it over WebRTC OR mesh simultaneously. | Medium | GPS payloads are tiny (~50-100 bytes for lat/lon/alt/timestamp/accuracy). Works over any transport including LoRa. Use Geolocation API (browser) or Capacitor Geolocation plugin (mobile). |
| Offline-capable map tiles | Critical for mesh/field use. If you're on LoRa, you don't have internet for map tiles. | Medium | Use pre-downloaded tile packs (MBTiles format or similar). Sideband already implements offline maps. Leaflet.js with offline tile layers is the standard approach. Store tiles in app data or let user download region packs. |
| Location sharing as opt-in toggle | Privacy-sensitive. Never share location by default. Per-room toggle. | Low | Simple boolean setting per room. When off, GPS data never sent. When on, broadcast at configurable interval (default: every 30s). |
| Geofencing / proximity alerts | Notify when a peer enters/leaves a defined area | Medium | Nice-to-have. Compute distance client-side. Useful for tactical/field scenarios. Sideband has geospatial awareness calculations already. |
| GPS over LoRa specifically | Sending coordinates over extremely low bandwidth is one of the most practical mesh use cases (SAR, hiking, field ops) | Low | GPS data is naturally tiny. LXMF fields dictionary can carry arbitrary data. Define a standard field key for GPS payloads that Sideband/MeshChat can also read. |

### P2P Media Streaming

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Host-serves-media pattern | One peer has a file (video, music, podcast). Other peers stream it in real-time through the room. Not upload-then-download — actual streaming. | High | Use WebRTC MediaStream for audio/video content. Host reads file via MediaSource API or Web Audio API, pipes to MediaStream, adds as track to peer connections. Receivers play it like a voice/video call. This is differentiated — Discord requires uploading files. |
| Synchronized playback controls | Host controls play/pause/seek. All peers stay in sync. | Medium | Send control messages (play, pause, seek position) over DataChannel. Peers sync to host timestamp. NTP-like offset correction for latency. The "watch party" pattern. |
| Audio-only streaming over mesh | Codec2 at 1200-3200bps can carry intelligible voice over LoRa. LXST already does this over Reticulum. Comms could do the same with integrated Codec2 encoding. | Very High | Requires Codec2 WASM or native module. LXST uses Codec2 + Opus with dynamic codec switching. For Comms: Opus over WebRTC (existing), Codec2 over Reticulum (new). Codec switching based on transport. |

### Service Bridging / Port Forwarding

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| TCP tunnel through DataChannel | Expose `localhost:port` to room peers. Same pattern as Tailscale Funnel / SSH port forwarding. Any TCP service (HTTP, SMB, SSH, database) becomes accessible in-room without public IPs or port forwarding. | High | Electron `net` module provides raw TCP sockets. Pattern: Host opens TCP connection to local service → reads data → sends over DataChannel → peer receives → writes to local TCP socket (virtual listener). Bidirectional. Needs per-service DataChannel or multiplexed framing. |
| Service catalog in room | Room shows what services are available (e.g., "File Server on :8080", "Web App on :3000") | Low | DataChannel message type `service-announce` with name, port, protocol. Peers display a list. Click to connect. |
| HTTP proxy mode | Most natural for web services. Peer clicks a service → local proxy starts on random port → browser opens `localhost:randomport` → traffic tunneled to host's service | Medium | This is the Tailscale Funnel UX. Requires Electron main process to spawn TCP listener. Preload bridge exposes proxy control. Renderer shows URL to open. |
| Security: per-service access control | Not all room members should access all services. Host controls who can connect to what. | Medium | Allowlist per service per peer identity. Host approves tunnel requests. Without this, any room member could access any exposed service — dangerous for SSH/database. |

### Reticulum/LXMF Mesh Interop

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| LXMF message send/receive | Comms peers can message Sideband/MeshChat/NomadNet users and vice versa. **The bridge nobody has built.** | Very High | LXMF uses Reticulum Identity (X25519+Ed25519), msgpack payload format, 111-byte overhead. Comms needs to: (1) generate/store Reticulum Identity, (2) run LXMF router, (3) map LXMF messages to room chat messages, (4) announce on Reticulum network. Python runtime dependency (Reticulum is Python) or C++ reimplementation of protocol subset. |
| Reticulum Identity integration | Comms crypto identity IS a Reticulum Identity. One identity, two worlds. | High | Reticulum Identity = 512-bit EC keyset (X25519+Ed25519). Need to either: (a) embed Python Reticulum library via subprocess/IPC, (b) use the `rnid` CLI tool, or (c) reimplement the identity generation in TypeScript/C++. Option (a) is most pragmatic. Option (c) is cleanest but highest effort. |
| Announce discovery | Discover Sideband/MeshChat peers through Reticulum announce system | High | Reticulum announces propagate destination hashes + public keys. Comms needs to listen for announces and display discovered peers. Reverse: Comms announces itself so Sideband/MeshChat users can find it. |
| Propagation Node support | Store-and-forward for offline mesh peers | Medium | LXMF Propagation Nodes already exist in the ecosystem. Comms doesn't need to be one — just needs to sync with them. `lxmd` can run alongside Comms. |
| Multi-hop mesh routing | Messages traverse multiple LoRa hops to reach distant peers | N/A (Reticulum handles) | Reticulum's core value. Comms doesn't implement routing — Reticulum does. Comms just needs to interface with a local Reticulum instance. |

### Gated / Permissioned Rooms

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Room keys (symmetric encryption) | Room content encrypted with a shared key. Only holders can read messages. | Medium | AES-256-GCM room key generated by creator. Distributed via invite code (embed key in invite). All messages encrypted before sending over DataChannel. This is how Signal groups work (Sender Keys). |
| Identity-gated access | Only specific public keys can join. Room creator maintains an allowlist. | Medium | Join request includes signed challenge (prove you hold the private key). Room creator/host validates signature against allowlist. Reject unknown identities. |
| Token/invite-gated access | One-time or limited-use invite tokens. Revocable. | Low | Generate random tokens, store in room config. Token consumed on join. Creator can revoke. Simple auth gate in signaling relay or room-level protocol. |
| Role-based permissions | Different members have different capabilities (admin, member, viewer) | Medium | Permission levels: admin (full control), member (chat/voice/files), viewer (read-only). Stored in room metadata. Enforced both client-side (UI) and by peers (reject unauthorized actions). |
| Paid/commercial room access | Gated by payment (not crypto tokens — simple payment verification) | High | Out of scope for initial implementation. Could use Lightning Network invoices or simple API key verification later. Flag as future differentiator. |

### Post-Quantum Attestation

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| ML-DSA-65 signature chain | Every room event (message, join, leave, file share, GPS update) gets a PQ-resistant digital signature chained to previous event hash. Tamper-evident audit trail. | High | PHANTOM repo has the C++ core (liboqs ML-DSA-65 + SHA3-256 + SQLite). Needs N-API binding for Electron, native module for Capacitor mobile. Chain: each event hash = SHA3-256(previous_hash ‖ event_data ‖ timestamp). Signed with ML-DSA-65 key. |
| Toggleable attestation (on/off per room) | Casual users don't want crypto overhead. Tactical users need it always. | Low | Room-level setting. When off: no signatures, no chain, no overhead. When on: all events attested. Setting itself is attested (can't silently disable). |
| Chain verification / audit | Verify entire room history hasn't been tampered with | Medium | Walk the chain from genesis, verify each hash links to previous, verify each signature. UI shows "chain valid" or "broken at event N". Export chain for external verification. |
| Cross-platform byte-identical output | Attestation chain must produce identical hashes on all platforms (Electron/Android/iOS) | High | Requires deterministic serialization (canonical JSON or msgpack with sorted keys). liboqs must produce identical signatures given same inputs across platforms. This is a constraint from PROJECT.md — test extensively. |
| PQ key exchange (ML-KEM-768) | Future-proof key agreement for room key distribution | Very High | Beyond signing (ML-DSA-65) — actual key encapsulation for room key distribution. liboqs provides ML-KEM-768. Needed for truly PQ-resistant gated rooms. Can defer — classical ECDH is fine until quantum computers exist. |

## Anti-Features

Features to explicitly NOT build. These are traps.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Central user accounts / auth server | Defeats the entire P2P philosophy. Creates a single point of failure and surveillance. Signal has this problem (phone number requirement). | Crypto identity only. Ed25519 keypair IS the identity. No server validates it. Peers validate each other directly. |
| Custom LoRa/ESP-NOW mesh implementation | Reticulum already does this extremely well (multi-medium, multi-hop, autoconfiguring). Reimplementing mesh routing is years of work for inferior results. | Use Reticulum as-is. Interface with it via IPC/subprocess. Don't reimplement the protocol. |
| Blockchain / token economics for gated rooms | Adds enormous complexity, legal exposure, and repels privacy-focused users. Every "web3 chat" project has failed. | Simple symmetric key distribution. Room keys distributed via invite codes or identity-gated handshakes. No chain needed for access control. |
| Custom voice codec | WebRTC handles codec negotiation (Opus). Reticulum ecosystem has LXST with Codec2/Opus. Building a codec is a multi-year specialized effort. | Use Opus over WebRTC (default). Use Codec2 via LXST or Codec2 WASM for low-bandwidth Reticulum voice if ever implemented. |
| Federation protocol (Matrix-style) | Federation adds enormous complexity (split-brain, eventual consistency, identity federation). The room model is simpler: you're in the room or you're not. | Direct P2P connections. LXMF interop for mesh. No federation servers. |
| Always-on location tracking | Privacy nightmare. Even Google Maps asks before tracking. | GPS sharing is opt-in, per-room, user-initiated. No background tracking. No location history stored on any remote system. |
| Server-side message storage | Creates a honeypot. Breaks E2E encryption guarantees. | Messages stored only on client devices (IndexedDB). Chat history synced P2P on join (existing pattern). LXMF Propagation Nodes are the closest thing — and they store encrypted blobs they can't read. |
| Screen sharing over mesh/LoRa | LoRa bandwidth (0.3-50 kbps) cannot carry video. Attempting it will produce an unusable experience and confuse users. | Grey out screen sharing when only mesh transport is available. Show clear "requires WiFi/internet" indicator. |
| Plugin/extension marketplace | Too early. Focus on core features. Plugin systems add API stability burden. | Build features directly into the app. Attestation comes as a native module, not a plugin. Revisit plugins after v1.0. |
| Multi-device sync (Signal-style linked devices) | Extremely complex (key distribution, message ordering, conflict resolution across devices). Signal took years to get this right. | One identity per device. Users can have multiple devices with different identities in the same room. Simple and honest. |

## Feature Dependencies

```
Crypto Identity (Ed25519 keypair)
├── Gated Rooms (need identity to verify access)
│   ├── Role-based permissions (need identity for role assignment)
│   └── Room key distribution (encrypt room key to peer's public key)
├── Post-Quantum Attestation (need identity to sign events)
│   └── Chain verification (need all signers' public keys)
├── Reticulum Identity integration (map Ed25519 → Reticulum Identity)
│   └── LXMF interop (need Reticulum Identity for LXMF addressing)
│       └── Announce discovery (need LXMF address to announce)
└── Service bridging access control (need identity for per-peer authorization)

Transport Abstraction Interface
├── Bandwidth-aware feature gating (transport reports capabilities)
│   └── GPS over LoRa (gating allows GPS but blocks voice on mesh)
├── Simultaneous multi-transport (room multiplexes transports)
│   └── Message deduplication (same message via WebRTC and Reticulum)
├── Reticulum transport implementation (one transport backend)
│   └── LXMF message routing (uses Reticulum transport)
└── Auto transport selection (heuristic over available transports)

File Sharing (chunked DataChannel transfer)
├── P2P media streaming (file streaming is chunked transfer + MediaSource)
└── File transfer over Reticulum (same chunking, different transport)

GPS location sharing
└── Offline map tiles (display layer for GPS data)
```

## MVP Recommendation

### Phase 1: Foundation (transport abstraction + crypto identity)
Prioritize:
1. **Transport abstraction interface** — Define the `Transport` interface. Implement WebRTC transport as first backend (refactor existing `WebRTCManager` to implement it). This unlocks everything.
2. **Crypto identity (Ed25519 keypair)** — Replace UUID identity with Ed25519 keypair. Store private key securely. Public key = identity hash. This unlocks gated rooms, attestation, and Reticulum interop.
3. **TURN relay option** — Add self-hostable TURN server support to WebRTC config. Without this, ~15% of users can't connect at all.

### Phase 2: Room capabilities (files, GPS, gating)
Prioritize:
4. **Chunked file transfer** — Extend DataChannel with file transfer protocol. Metadata envelope → chunked transfer → reassembly → hash verification. Most-requested feature in any group chat.
5. **GPS location sharing** — Tiny payloads, works on any transport. High-value for the mesh use case. Leaflet.js map with offline tile support.
6. **Gated rooms (identity-based)** — Room creator sets allowlist of public keys. Signed join challenges. Room key encryption.

### Phase 3: Mesh bridge (Reticulum interop)
Prioritize:
7. **Reticulum transport backend** — Implement `Transport` interface for Reticulum. Interface with local `rnsd` via IPC or Python subprocess.
8. **LXMF message bridge** — Map LXMF messages ↔ room chat messages. Announce on Reticulum network. Discover Sideband/MeshChat peers.

### Phase 4: Advanced features
9. **Service bridging** — TCP tunnel through DataChannel. Service catalog. HTTP proxy mode.
10. **Post-quantum attestation** — Integrate PHANTOM C++ core via N-API. Toggleable per room.
11. **P2P media streaming** — Host-serves-media pattern. Synchronized playback.

Defer:
- **Paid room access**: Needs entire payment infrastructure. Defer to post-v1.0.
- **PQ key exchange (ML-KEM-768)**: Classical ECDH is fine for now. ML-DSA-65 for signing is the priority.
- **Codec2 voice over mesh**: LXST exists for this. Integration is very complex. Defer to post-v1.0 unless there's specific demand.
- **Multi-hop mesh voice**: Reticulum + LXST can technically do this already. Comms should focus on text/GPS over mesh first, which is proven and practical.

## Competitor Feature Matrix

| Feature | Discord | Signal | Briar | Sideband | MeshChat | Tailscale | **Comms (target)** |
|---------|---------|--------|-------|----------|----------|-----------|-------------------|
| Voice/video | ✅ | ✅ | ❌ | ✅ (LXST) | ✅ (beta) | ❌ | ✅ |
| Text chat | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| File sharing | ✅ (server) | ✅ | ✅ | ✅ | ✅ | ✅ (Taildrop) | ✅ (P2P) |
| E2E encryption | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ (WireGuard) | ✅ |
| P2P (no server) | ❌ | ❌ | ✅ (Tor) | ✅ | ✅ | ❌ (coord server) | ✅ |
| LoRa/mesh support | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Internet support | ✅ | ✅ | ✅ (Tor) | ✅ (TCP/I2P) | ✅ (TCP) | ✅ | ✅ |
| GPS/map | ❌ | ✅ (live loc) | ❌ | ✅ | ❌ | ❌ | ✅ |
| Service tunneling | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Multi-transport | ❌ | ❌ | ❌ | Reticulum only | Reticulum only | ❌ | **✅ (unique)** |
| PQ attestation | ❌ | PQ PQXDH | ❌ | ❌ | ❌ | ❌ | **✅ (unique)** |
| Offline-first | ❌ | Partial | ✅ | ✅ | ✅ | ❌ | ✅ |
| Gated rooms | ✅ (server) | ❌ | ❌ | ❌ | ❌ | ACLs | **✅ (crypto)** |

**Key insight:** No single product bridges internet-grade real-time (WebRTC) with mesh networking (Reticulum). Sideband is the closest competitor for the mesh side. Discord is the closest for the internet side. Comms is the only one attempting both simultaneously with room-as-primitive.

## Sources

- Reticulum README and manual: https://github.com/markqvist/Reticulum (HIGH confidence — primary source)
- LXMF protocol specification: https://github.com/markqvist/lxmf (HIGH confidence — primary source)
- LXST streaming protocol: https://github.com/markqvist/LXST (HIGH confidence — primary source)
- Sideband features/README: https://github.com/markqvist/Sideband (HIGH confidence — primary source)
- MeshChat features/README: https://github.com/liamcottle/reticulum-meshchat (HIGH confidence — primary source)
- WebRTC DataChannel specifications: W3C WebRTC spec (HIGH confidence — platform knowledge)
- liboqs (ML-DSA-65, ML-KEM-768): https://github.com/open-quantum-safe/liboqs (HIGH confidence — project already uses this)
- Tailscale Funnel pattern: Tailscale documentation (MEDIUM confidence — training data, pattern verified by PROJECT.md description)
- Signal Protocol PQ-XDH: Signal blog posts on PQXDH upgrade (MEDIUM confidence — training data)
- Existing Comms codebase: Direct source code analysis (HIGH confidence)
