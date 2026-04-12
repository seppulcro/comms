# TODO

## Vision

**One room, any wire.** Comms is a P2P room you can join from any device, over any
network. Everything Chromium can do, but peer-to-peer and routed through rooms instead
of URLs. A modern digital walkie-talkie that scales from voice chat to service hosting.

AirDrop meets Discord meets Tailscale — decentralized, works over radio, serves anything.

```
┌──────────────────────────────────────────────────────┐
│                  Comms (the room)                      │
│                                                        │
│  Join a room. See what's shared. Share what you want.  │
│                                                        │
│  DataChannels: text, files, GPS, calendar, services,   │
│                torrents, media, app state, anything     │
│  MediaStreams: voice, video, screenshare                │
│                                                        │
├──────────────────────────────────────────────────────┤
│          Transport (automatic best-available)           │
│                                                        │
│  WebRTC ──── internet P2P (Discord-grade)              │
│  Reticulum ─ LoRa / WiFi Direct / Serial / TCP         │
│  LXMF ────── Sideband / MeshChat interop               │
│                                                        │
├──────────────────────────────────────────────────────┤
│   Attestation (optional) · ML-DSA-65 · SHA3 · SQLite   │
└──────────────────────────────────────────────────────┘
```

---

## Milestone 1 — Add Mobile Targets

Desktop stays Electron (existing, working). Add Capacitor for iOS/Android only.
`@capacitor-community/electron` is dead — don't touch it.

- Add `@capacitor/core`, `@capacitor/cli`
- `npx cap add ios` + `npx cap add android`
- Shared `client/` Preact code runs unchanged in native WebViews
- Electron keeps tray, clipboard, global shortcut, uiohook, native sockets
- Verify WebRTC voice + text + screenshare work in WKWebView and Chrome WebView
- Handle iOS `UIBackgroundModes: audio` for background voice

---

## Milestone 2 — Transport Abstraction

Abstract the message path so room data flows over any available transport.

- Define a `Transport` interface: `send(msg)` / `onReceive(msg)` / `status()`
- Implement `WebRTCTransport` (current behavior — extract from `webrtc.ts`)
- Implement `ReticulumTransport` (talks to local Reticulum daemon via socket)
- Implement `LXMFTransport` (Sideband/MeshChat interop)
- Transport selection is automatic: best available, graceful degradation
- Voice/screenshare/media remain WebRTC-only — check transport capability, grey out if unavailable

Ref: https://github.com/markqvist/Reticulum

---

## Milestone 3 — Attestation

Build `@comms/attestation` — WASM module using @oqs/liboqs-js for post-quantum
tamper-evident attestation. Reuses crypto design from github.com/seppulcro/phantom.
No C++ N-API or CMake cross-compile needed — WASM runs in Electron and Capacitor WebViews.

Every attested message/beacon gets:
- Signed with ML-DSA-65 (NIST FIPS 204 — post-quantum, Shor-resistant)
- Hash-chained with SHA3-256 (tamper-evident, append-only log)
- Stored in SQLite (verifiable by anyone with the public key, offline, forever)

Toggleable in settings — off for casual (Discord replacement), on for tactical use.

---

## Milestone 4 — GPS Live Map

Share location in a room — same join model as voice or screenshare.

- `@capacitor/geolocation` for position data
- Emit `{lat, lon, alt, timestamp, user_id}` at ~1Hz over DataChannel/Reticulum
- Attested when attestation is enabled
- Peers render live map with pins, "Share Location" / "Stop" buttons
- Works over LoRa (~50 bytes per beacon)

---

## Milestone 5 — File Sharing & Media Streaming

Share files and stream media P2P inside rooms.

- Chunked file transfer over DataChannels (any file type, any size)
- P2P media streaming — host serves, peers stream directly (seekable)
- No central server — host's device IS the server
- Room-scoped: content lives in the room

---

## Milestone 6 — Service Bridging

Expose localhost services into rooms — the Tailscale Funnel of Comms.

- Host runs any TCP service (HTTP, SMB, Jellyfin, wiki, anything)
- Comms proxies localhost:port through DataChannel to peers
- Peers access it as a local port — transparent TCP proxy
- Services only exist inside the room — dark to the outside internet
- Settings: choose which local services to share per room

---

## Milestone 7 — Gated Rooms

Rooms with access control — invite-only or key-gated.

- Room creator sets access: open, invite-only, or key-gated
- Key-gated rooms require a cryptographic token to join
- Tokens distributed however creator wants (paid, earned, gifted)
- Identity is crypto keypair — no accounts, no email, no server
- Attestation proves membership and access history when enabled

---

## Milestone 8 — Mobile Polish

- iOS + Android builds via Capacitor (added in Milestone 1)
- @oqs/liboqs-js WASM works in mobile WebViews — no native compilation
- WebRTC voice works on mobile WebViews natively
- Reticulum transport via local daemon or companion Sideband app
- GPS is native via `@capacitor/geolocation`
