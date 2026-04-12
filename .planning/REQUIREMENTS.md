# Requirements — Comms v1.0.0

## v1 Requirements

### Transport & Connectivity

- [ ] **TRANS-01**: User's room data flows over any available transport (WebRTC, Reticulum) without manual selection
- [ ] **TRANS-02**: Transport interface abstracts `send()` / `onReceive()` / `capabilities()` so new transports can be added without changing room logic
- [ ] **TRANS-03**: WebRTC transport wraps existing `WebRTCManager` — current voice/text/screenshare behavior is preserved
- [ ] **TRANS-04**: Reticulum transport communicates with local RNS daemon via JSON-RPC over stdio (Python sidecar)
- [ ] **TRANS-05**: Features grey out (not error) when required transport is unavailable — voice disables on LoRa, text stays on all transports
- [ ] **TRANS-06**: Connection status shows transport type per peer (internet vs mesh) and connection quality
- [ ] **TRANS-07**: Auto-reconnect across transports — if WebRTC drops, fall back to mesh; if mesh drops, try WebRTC

### Identity & Security

- [ ] **IDENT-01**: User identity is a persistent Ed25519 keypair (not random UUID) — public key = identity
- [ ] **IDENT-02**: Reticulum Identity (X25519+Ed25519) derived from or linked to Comms identity — one identity, two worlds
- [ ] **IDENT-03**: E2E encryption indicator visible per connection (lock icon, already encrypted via DTLS-SRTP)

### GPS Live Map

- [ ] **GPS-01**: User can share live GPS position in a room — peers see pins on an interactive map
- [ ] **GPS-02**: GPS sharing is opt-in per room (toggle, never on by default)
- [ ] **GPS-03**: GPS payloads are tiny (~50-100 bytes) — works over any transport including LoRa
- [ ] **GPS-04**: Map works offline with pre-downloaded tile packs (Leaflet + offline tile layers)
- [ ] **GPS-05**: GPS broadcast interval is configurable (default: 30s)

### File Sharing

- [ ] **FILE-01**: User can send files via chunked P2P transfer over DataChannels (16-64KB chunks)
- [ ] **FILE-02**: Transfer shows progress bar derived from chunk sequence / total
- [ ] **FILE-03**: Image and media files render inline in chat (extend existing image paste behavior)
- [ ] **FILE-04**: Drag-and-drop file sending on chat area
- [ ] **FILE-05**: Explicit file size limits per transport (~100MB WebRTC, text-only or tiny over LoRa)
- [ ] **FILE-06**: Resumable transfers — handle mobile background kills and reconnections

### Service Bridging

- [ ] **SVC-01**: Host can expose `localhost:port` to room peers via TCP tunnel through DataChannel
- [ ] **SVC-02**: Room displays service catalog (name, port, protocol) — peers click to connect
- [ ] **SVC-03**: HTTP proxy mode — local proxy on random port, browser opens `localhost:randomport`, traffic tunneled to host
- [ ] **SVC-04**: Per-service access control — host maintains allowlist per peer identity (no open relay)
- [ ] **SVC-05**: Service bridging is desktop-only (Electron `net` module) — mobile shows "available on desktop"

### Mesh Interop

- [ ] **MESH-01**: Comms can send/receive LXMF messages — Sideband/MeshChat/NomadNet users can chat with Comms peers
- [ ] **MESH-02**: Comms announces on Reticulum network — discoverable by other Reticulum apps
- [ ] **MESH-03**: Comms discovers Sideband/MeshChat peers through Reticulum announce system
- [ ] **MESH-04**: Store-and-forward via existing LXMF Propagation Nodes for offline mesh peers
- [ ] **MESH-05**: GPS telemetry uses LXMF `FIELD_TELEMETRY` format — compatible with Sideband map view

### Gated Rooms

- [ ] **GATE-01**: Room creator can encrypt room with AES-256-GCM shared key (distributed via invite code)
- [ ] **GATE-02**: Identity-gated access — only specific public keys in allowlist can join
- [ ] **GATE-03**: One-time or limited-use invite tokens, revocable by creator
- [ ] **GATE-04**: Role-based permissions — admin / member / viewer with different capabilities

### Attestation

- [ ] **ATT-01**: Room events (messages, joins, leaves, GPS, files) can be signed with ML-DSA-65 (PQ-resistant)
- [ ] **ATT-02**: Hash chain — each event hash = SHA3-256(previous_hash ‖ event_data ‖ timestamp), tamper-evident
- [ ] **ATT-03**: Attestation is toggleable per room — off for casual, on for tactical (setting itself is attested)
- [ ] **ATT-04**: Chain verification UI — walk chain, show "valid" or "broken at event N"
- [ ] **ATT-05**: Uses @oqs/liboqs-js WASM — runs in Electron and Capacitor WebViews, no native compilation
- [ ] **ATT-06**: Cross-platform byte-identical output (deterministic serialization via canonical msgpack)

### Mobile

- [ ] **MOB-01**: iOS and Android builds via Capacitor — shared `client/` Preact code in native WebViews
- [ ] **MOB-02**: WebRTC voice/text/screenshare work in WKWebView (iOS) and Chrome WebView (Android)
- [ ] **MOB-03**: iOS `UIBackgroundModes: audio` for background voice
- [ ] **MOB-04**: GPS via `@capacitor/geolocation` on mobile
- [ ] **MOB-05**: Desktop stays Electron — tray, global hotkeys, native sockets unchanged

## v2 Requirements (Deferred)

- P2P media streaming (host serves video/music, peers stream — "room is the swarm")
- Synchronized playback controls (watch party pattern)
- Codec2 WASM for voice-over-mesh (1200-3200bps intelligible voice over LoRa)
- Geofencing / proximity alerts
- ML-KEM-768 post-quantum key exchange for room key distribution
- Paid/commercial room gating (Lightning invoices or API key verification)

## Out of Scope

- Custom LoRa/ESP-NOW mesh implementation — Reticulum handles routing
- PHANTOM as standalone project — crypto design reused, project retired
- Specter mobile project — retired, Capacitor handles mobile
- Central user accounts / auth server — crypto identity only
- Blockchain / token economics — simple key distribution for gated rooms
- Custom voice codec development — use Opus (WebRTC) and Codec2 (Reticulum ecosystem)
- Federation protocol — rooms are self-contained, not federated
- Server-side message storage — everything is P2P or local
- `@capacitor-community/electron` — dead plugin, don't use

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRANS-01 | Phase 1: Transport Abstraction & Identity | Pending |
| TRANS-02 | Phase 1: Transport Abstraction & Identity | Pending |
| TRANS-03 | Phase 1: Transport Abstraction & Identity | Pending |
| TRANS-04 | Phase 4: Mesh Interop | Pending |
| TRANS-05 | Phase 1: Transport Abstraction & Identity | Pending |
| TRANS-06 | Phase 1: Transport Abstraction & Identity | Pending |
| TRANS-07 | Phase 4: Mesh Interop | Pending |
| IDENT-01 | Phase 1: Transport Abstraction & Identity | Pending |
| IDENT-02 | Phase 1: Transport Abstraction & Identity | Pending |
| IDENT-03 | Phase 1: Transport Abstraction & Identity | Pending |
| GPS-01 | Phase 2: GPS & File Sharing | Pending |
| GPS-02 | Phase 2: GPS & File Sharing | Pending |
| GPS-03 | Phase 2: GPS & File Sharing | Pending |
| GPS-04 | Phase 2: GPS & File Sharing | Pending |
| GPS-05 | Phase 2: GPS & File Sharing | Pending |
| FILE-01 | Phase 2: GPS & File Sharing | Pending |
| FILE-02 | Phase 2: GPS & File Sharing | Pending |
| FILE-03 | Phase 2: GPS & File Sharing | Pending |
| FILE-04 | Phase 2: GPS & File Sharing | Pending |
| FILE-05 | Phase 2: GPS & File Sharing | Pending |
| FILE-06 | Phase 2: GPS & File Sharing | Pending |
| SVC-01 | Phase 3: Service Bridging | Pending |
| SVC-02 | Phase 3: Service Bridging | Pending |
| SVC-03 | Phase 3: Service Bridging | Pending |
| SVC-04 | Phase 3: Service Bridging | Pending |
| SVC-05 | Phase 3: Service Bridging | Pending |
| MESH-01 | Phase 4: Mesh Interop | Pending |
| MESH-02 | Phase 4: Mesh Interop | Pending |
| MESH-03 | Phase 4: Mesh Interop | Pending |
| MESH-04 | Phase 4: Mesh Interop | Pending |
| MESH-05 | Phase 4: Mesh Interop | Pending |
| GATE-01 | Phase 5: Attestation & Gated Rooms | Pending |
| GATE-02 | Phase 5: Attestation & Gated Rooms | Pending |
| GATE-03 | Phase 5: Attestation & Gated Rooms | Pending |
| GATE-04 | Phase 5: Attestation & Gated Rooms | Pending |
| ATT-01 | Phase 5: Attestation & Gated Rooms | Pending |
| ATT-02 | Phase 5: Attestation & Gated Rooms | Pending |
| ATT-03 | Phase 5: Attestation & Gated Rooms | Pending |
| ATT-04 | Phase 5: Attestation & Gated Rooms | Pending |
| ATT-05 | Phase 5: Attestation & Gated Rooms | Pending |
| ATT-06 | Phase 5: Attestation & Gated Rooms | Pending |
| MOB-01 | Phase 6: Mobile | Pending |
| MOB-02 | Phase 6: Mobile | Pending |
| MOB-03 | Phase 6: Mobile | Pending |
| MOB-04 | Phase 6: Mobile | Pending |
| MOB-05 | Phase 6: Mobile | Pending |
