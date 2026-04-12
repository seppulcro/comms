# Comms

## What This Is

A P2P room you can join from any device, over any network. Everything Chromium can do,
but peer-to-peer and routed through rooms instead of URLs. Join a room — share voice,
text, GPS, files, media, services. Works over internet, WiFi Direct, or LoRa mesh.
No servers, no accounts. The room is the network.

Think: AirDrop meets Discord meets Tailscale, decentralized and works over radio.
A modern digital walkie-talkie for smartphones and everything they connect to.

## Core Value

Any device, any network, same room. The room adapts to whatever transport is available —
voice over WiFi, text over LoRa, services over DataChannels. Nothing requires the
internet to exist. Nothing requires a server to run. Peers connect directly.

## Requirements

### Validated

- ✓ E2E encrypted P2P voice chat (WebRTC DTLS-SRTP) — existing
- ✓ E2E encrypted P2P text chat (WebRTC DataChannels) — existing
- ✓ Screen sharing (WebRTC video track) — existing
- ✓ Push-to-talk with global hotkey (uiohook-napi, Wayland+X11) — existing
- ✓ Voice activation with adjustable threshold — existing
- ✓ Markdown chat with GFM, emoji shortcodes, syntax highlighting — existing
- ✓ Image paste (Ctrl+V, auto-compressed, synced P2P) — existing
- ✓ Chat persistence (IndexedDB, survives restarts, auto-syncs peers) — existing
- ✓ Invite codes (one string to join a room) — existing
- ✓ Self-hostable signaling relay (Bun WebSocket server) — existing
- ✓ Private mode (--private flag, ephemeral sessions) — existing
- ✓ Audio device selection and mute controls — existing
- ✓ System tray with mic indicator — existing

### Active

- [ ] Mobile targets (iOS + Android via Capacitor, desktop stays Electron)
- [ ] Transport abstraction (WebRTC, Reticulum, LXMF — automatic best-available selection)
- [ ] GPS live map (share location in room, live pins, works over LoRa)
- [ ] File sharing (chunked P2P transfer over DataChannels)
- [ ] P2P media streaming (host serves media, peers stream directly)
- [ ] Service bridging (expose localhost services into room — HTTP, SMB, any TCP)
- [ ] Gated rooms (crypto identity + room keys, paid/invite access control)
- [ ] Post-quantum attestation (ML-DSA-65 + SHA3-256 hash chain + SQLite, toggleable)
- [ ] Reticulum/LXMF interop (Sideband/MeshChat peers join same rooms)
- [ ] Mobile platform validation (WebRTC in WKWebView/Chrome WebView, background audio, permissions)

### Out of Scope

- Custom LoRa/ESP-NOW mesh implementation — Reticulum handles this
- PHANTOM as standalone project — attestation core becomes a Comms plugin
- Specter mobile project — Capacitor (mobile) + Electron (desktop) handle all platforms
- Central user accounts / auth server — crypto identity only
- Blockchain / token economics — gated rooms use simple key distribution
- Custom voice codec — WebRTC on WiFi/internet, Codec2 over Reticulum when available

## Context

**Current state:** Working Electron desktop app (v0.0.1) with P2P voice, text, screenshare
over WebRTC. Self-hostable Bun signaling relay. ~316 KB app code on Chromium runtime.
Terminal aesthetic (WebTUI + Catppuccin Mocha).

**The room model:** A room is the atomic unit. Currently it carries chat, voice, and
screenshare. The vision expands it to carry any data type — GPS coordinates, files,
media streams, proxied services. WebRTC DataChannels already carry arbitrary data
(chat is JSON over a DataChannel today). Adding new data types means: new message type +
new renderer component. The pipe exists.

**Transport convergence:** WebRTC gives Discord-grade quality over internet/WiFi.
Reticulum gives mesh routing over LoRa/WiFi Direct/Serial/TCP. Both can be active
simultaneously. Voice/video require bandwidth (WiFi/internet only). Text/GPS/metadata
work on any transport including LoRa. Graceful degradation — features grey out when
their required transport isn't available.

**Service bridging pattern:** Electron's `net` module provides raw TCP sockets. A host
can proxy `localhost:port` through a DataChannel to peers who access it as a local port.
This is the same pattern as Tailscale Funnel or SSH port forwarding. Any TCP service
(HTTP, SMB, whatever) becomes accessible inside the room without port forwarding or
public IPs.

**Attestation:** The cryptographic core (ML-DSA-65 + SHA3-256 + SQLite) is implemented
and validated in the PHANTOM repo (github.com/seppulcro/phantom). @oqs/liboqs-js provides
WASM bindings for ML-DSA-65 — no C++ N-API or CMake cross-compile needed. Runs in both
Electron and Capacitor WebViews. Toggleable — off for casual use, on for
tactical/hostile-environment use where tamper-evident audit trails matter.

**Ecosystem position:** MeshChat/Sideband cover LoRa mesh chat. Discord covers internet
voice/text. Nobody bridges both worlds. Comms becomes the protocol-agnostic client that
speaks all of them — same room, same UI, best-effort on whatever wire is available.

**Chromium as runtime:** Electron ships Chromium (desktop), Capacitor uses native WebViews
(mobile) — both provide WebRTC, Fetch, IndexedDB, Service Workers, MediaStream API,
File System API. Combined with Node.js (Electron) or native plugins (Capacitor) for
platform-specific access, this covers any networking or I/O pattern needed.

## Constraints

- **Runtime**: Electron for desktop (stays as-is), Capacitor for mobile (iOS/Android) — shared Preact client code
- **Transport**: Must support WebRTC (internet) + Reticulum (mesh) simultaneously
- **Attestation crypto**: @oqs/liboqs-js WASM bindings (ML-DSA-65/ML-KEM-768) — no native compilation needed
- **Compatibility**: LXMF protocol support for Sideband/MeshChat interop
- **Attestation parity**: Chain output must be byte-identical across all platforms
- **No cloud dependencies**: Everything runs locally or P2P
- **License**: AGPL-3.0

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Electron (desktop) + Capacitor (mobile) | @capacitor-community/electron is dead; keep existing Electron, add Capacitor for mobile only | Confirmed |
| Reticulum over custom mesh | Established FOSS (MIT), multi-medium, active community, no radio stack to build | — Pending |
| Attestation as toggleable feature | Casual users don't need PQ crypto overhead; tactical users need it always on | — Pending |
| PHANTOM absorbed into Comms | No separate project needed — attestation core becomes a native plugin | — Pending |
| Specter project retired | Electron + Capacitor handle all platforms from Comms directly | Confirmed |
| DataChannels for everything | WebRTC DataChannels already carry chat; extending to GPS/files/services is the same primitive | — Pending |
| Service bridging via TCP proxy | Same pattern as Tailscale Funnel — proxy localhost:port through DataChannel to peers | — Pending |
| Room as atomic unit | Everything happens in rooms — not separate apps for chat/voice/files/services | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-12 after initialization*
