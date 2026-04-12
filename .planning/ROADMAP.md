# Roadmap: Comms v1.0.0

## Overview

Comms evolves from a working WebRTC desktop app (v0.0.1) into a protocol-agnostic P2P room runtime. The build order follows the dependency chain: transport abstraction first (everything depends on it), then new data types over existing WebRTC (GPS, files, services), then Reticulum mesh integration (core differentiator), then crypto features (attestation + gated rooms), and finally mobile (Capacitor iOS/Android). Each phase delivers a complete, verifiable capability on top of the previous.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Transport Abstraction & Identity** - Wrap WebRTC in a transport interface, establish persistent crypto identity, enable graceful degradation
- [ ] **Phase 2: GPS & File Sharing** - Share live location and files P2P inside rooms over DataChannels
- [ ] **Phase 3: Service Bridging** - Expose localhost TCP services into rooms via DataChannel tunnel
- [ ] **Phase 4: Mesh Interop** - Reticulum sidecar + LXMF bridge for Sideband/MeshChat interop over LoRa/mesh
- [ ] **Phase 5: Attestation & Gated Rooms** - PQ tamper-evident event chains and crypto access control for rooms
- [ ] **Phase 6: Mobile** - Capacitor iOS/Android builds with platform-native capabilities

## Phase Details

### Phase 1: Transport Abstraction & Identity
**Goal**: Room data flows through a transport-agnostic runtime with persistent crypto identity
**Depends on**: Nothing (first phase — builds on existing v0.0.1 codebase)
**Requirements**: TRANS-01, TRANS-02, TRANS-03, TRANS-05, TRANS-06, IDENT-01, IDENT-02, IDENT-03
**Success Criteria** (what must be TRUE):
  1. Existing voice, text, and screenshare work identically after WebRTC is wrapped behind the Transport interface
  2. User has a persistent Ed25519 keypair that survives app restarts — public key is their identity
  3. Connection status shows transport type and quality per peer, with E2E encryption indicator
  4. Features that need unavailable transports grey out gracefully instead of erroring
  5. A new transport can be added by implementing the Transport interface alone — no room logic changes needed
**Plans**: TBD
**UI hint**: yes

### Phase 2: GPS & File Sharing
**Goal**: Users can share live location and transfer files P2P inside rooms
**Depends on**: Phase 1 (needs Transport interface for capability-aware routing)
**Requirements**: GPS-01, GPS-02, GPS-03, GPS-04, GPS-05, FILE-01, FILE-02, FILE-03, FILE-04, FILE-05, FILE-06
**Success Criteria** (what must be TRUE):
  1. User toggles "Share Location" in a room and peers see live-updating pins on an interactive map with configurable broadcast interval
  2. Map works offline with pre-downloaded tile packs (no internet required for map rendering)
  3. User can send files via drag-and-drop or file picker with visible progress bar and resumable transfers
  4. Images and media files render inline in chat (extending existing image paste behavior)
  5. File size limits are enforced per transport — large files over WebRTC, tiny GPS payloads (~50-100 bytes) over any transport including LoRa-class
**Plans**: TBD
**UI hint**: yes

### Phase 3: Service Bridging
**Goal**: Users can expose and access localhost TCP services through rooms
**Depends on**: Phase 1 (needs Transport interface and DataChannel binary mode)
**Requirements**: SVC-01, SVC-02, SVC-03, SVC-04, SVC-05
**Success Criteria** (what must be TRUE):
  1. Host exposes a local TCP service and peers access it transparently as a local port (HTTP proxy mode for browser-based services)
  2. Room displays a service catalog showing available services from all peers (name, port, protocol)
  3. Host controls per-service access — only allowed peer identities can connect (no open relay)
  4. Service bridging is desktop-only (Electron `net` module) — mobile shows "available on desktop" indicator
**Plans**: TBD
**UI hint**: yes

### Phase 4: Mesh Interop
**Goal**: Comms peers and Sideband/MeshChat peers share the same room over Reticulum mesh
**Depends on**: Phase 1 (Transport interface), Phase 2 (GPS telemetry format for LXMF compat)
**Requirements**: TRANS-04, TRANS-07, MESH-01, MESH-02, MESH-03, MESH-04, MESH-05
**Success Criteria** (what must be TRUE):
  1. Reticulum transport connects to local RNS daemon via Python sidecar (JSON-RPC over stdio) and routes text/GPS over mesh
  2. Sideband/MeshChat users can exchange messages and GPS telemetry with Comms peers via LXMF (using FIELD_TELEMETRY format)
  3. Comms is discoverable by other Reticulum apps via the announce system, and discovers Sideband/MeshChat peers
  4. If WebRTC drops, communication falls back to mesh automatically — and vice versa
  5. Offline mesh peers receive messages via LXMF store-and-forward propagation nodes
**Plans**: TBD

### Phase 5: Attestation & Gated Rooms
**Goal**: Room events are tamper-evident and rooms enforce crypto access control
**Depends on**: Phase 1 (crypto identity for signing), Phase 4 (transport-aware attestation — attest locally, transmit compact references over LoRa)
**Requirements**: ATT-01, ATT-02, ATT-03, ATT-04, ATT-05, ATT-06, GATE-01, GATE-02, GATE-03, GATE-04
**Success Criteria** (what must be TRUE):
  1. Attested room events are signed with ML-DSA-65 and chained via SHA3-256 hash chain (previous_hash ‖ event_data ‖ timestamp)
  2. User can walk the attestation chain in a verification UI showing "valid" or "broken at event N"
  3. Attestation is toggleable per room — off by default for casual use, on for tactical (the toggle itself is attested)
  4. Room creator can restrict access via AES-256-GCM shared key, identity allowlist, or revocable invite tokens — and assign roles (admin/member/viewer)
  5. Attestation output is byte-identical across Electron and Capacitor via @oqs/liboqs-js WASM with canonical msgpack serialization
**Plans**: TBD
**UI hint**: yes

### Phase 6: Mobile
**Goal**: Comms works on iOS and Android with platform-native capabilities
**Depends on**: Phase 1 (Transport interface), Phase 2 (GPS, files), Phase 5 (attestation WASM in WebViews)
**Requirements**: MOB-01, MOB-02, MOB-03, MOB-04, MOB-05
**Success Criteria** (what must be TRUE):
  1. iOS and Android builds via Capacitor run the shared Preact client in native WebViews
  2. WebRTC voice, text, and screenshare work in WKWebView (iOS) and Chrome WebView (Android)
  3. iOS keeps voice calls alive in background via UIBackgroundModes: audio
  4. GPS sharing uses @capacitor/geolocation on mobile with same map UI as desktop
  5. Desktop Electron experience is unchanged — tray, global hotkeys, native sockets, uiohook all preserved
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Transport Abstraction & Identity | 0/TBD | Not started | - |
| 2. GPS & File Sharing | 0/TBD | Not started | - |
| 3. Service Bridging | 0/TBD | Not started | - |
| 4. Mesh Interop | 0/TBD | Not started | - |
| 5. Attestation & Gated Rooms | 0/TBD | Not started | - |
| 6. Mobile | 0/TBD | Not started | - |
