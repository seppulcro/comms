# Research Summary: Comms P2P Room Runtime — Milestone 2

**Domain:** Protocol-agnostic P2P communication (WebRTC + mesh networking)
**Researched:** 2025-07-15
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

The existing Comms app (Electron/Preact/WebRTC) is a solid foundation for the protocol-agnostic room runtime vision. The core challenge of this milestone isn't any single technology — it's the **integration seam between WebRTC (JavaScript/TypeScript world) and Reticulum (Python world)**, and the **platform divergence between Electron (desktop) and Capacitor (mobile)**.

The most significant discovery is that `@capacitor-community/electron` — the planned bridge for unifying desktop and mobile under Capacitor — is **effectively dead** (last update September 2023, stuck at Capacitor v5, while Capacitor is at v8). This means the desktop path must remain raw Electron, with Capacitor used only for mobile. The platform abstraction layer becomes critical: a TypeScript interface that abstracts platform-specific operations behind a unified API, with separate implementations for Electron and Capacitor.

The second major finding is `@oqs/liboqs-js` v0.15.1 — official WASM bindings from the Open Quantum Safe project that support ML-DSA-65 and ML-KEM-768 natively in both Node.js and browsers. This **eliminates the planned C++ N-API native addon approach** for post-quantum cryptography, dramatically simplifying the attestation plugin. WASM also guarantees byte-identical output across platforms, which is a requirement for the attestation chain.

Reticulum integration will require a Python sidecar process pattern — no TypeScript port of RNS exists, and building one is infeasible given the 15k+ lines of actively-evolving networking code. The sidecar communicates over stdio JSON-RPC, which is simple and proven. Mobile Reticulum is the hardest piece and should be deferred until desktop mesh works.

## Key Findings

**Stack:** Electron (desktop) + Capacitor 8 (mobile) + Python sidecar for Reticulum + @oqs/liboqs-js WASM for PQ crypto
**Architecture:** Platform abstraction layer bridging Electron IPC and Capacitor plugins, with transport abstraction routing messages to WebRTC or Reticulum based on availability
**Critical pitfall:** `@capacitor-community/electron` is dead — don't build on it. Use separate Electron + Capacitor paths.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Transport Abstraction + Platform Layer** - Foundation phase
   - Build the `Transport` interface that WebRTC and Reticulum both implement
   - Build the `PlatformBridge` interface with `ElectronPlatform` implementation
   - Refactor existing WebRTC code behind the transport interface
   - Addresses: Transport abstraction requirement, architectural foundation
   - Avoids: Building features on unabstracted WebRTC that later need refactoring

2. **GPS + File Transfer** - Features on existing WebRTC transport
   - GPS sharing over DataChannels + Leaflet map rendering
   - Chunked file transfer over DataChannels
   - These work on the WebRTC transport immediately, no Reticulum needed
   - Addresses: GPS live map, file sharing, immediate user value
   - Avoids: Blocking useful features on Reticulum integration

3. **Service Bridging** - TCP proxy over DataChannels
   - `net` module TCP ↔ DataChannel bridge
   - Desktop-first (mobile service bridging is edge case)
   - Addresses: Service bridging requirement
   - Avoids: Premature mobile TCP socket complexity

4. **Reticulum Sidecar + LXMF Bridge** - Mesh integration
   - Python sidecar with JSON-RPC stdio bridge
   - LXMF message translation (Comms room messages ↔ LXMF)
   - GPS telemetry interop with Sideband format
   - Addresses: Reticulum/LXMF interop, mesh capability
   - Avoids: Trying to build mesh and features simultaneously

5. **Post-Quantum Attestation** - Crypto plugin
   - @oqs/liboqs-js WASM integration for ML-DSA-65
   - better-sqlite3 attestation chain storage
   - Toggleable attestation on room messages
   - Addresses: Gated rooms foundation, PHANTOM absorption
   - Avoids: Premature crypto complexity before transport works

6. **Capacitor Mobile Shell** - Mobile deployment
   - Capacitor 8 project setup for iOS/Android
   - `CapacitorPlatform` implementation of PlatformBridge
   - Mobile-specific GPS, file system, background task
   - Addresses: Mobile requirement
   - Avoids: Mobile complexity contaminating desktop development

**Phase ordering rationale:**
- Transport abstraction first because everything else depends on it
- GPS/files before Reticulum because they deliver value immediately over WebRTC and validate the transport interface
- Service bridging before Reticulum because it's the same DataChannel pipe pattern (good test)
- Reticulum after features because mesh adds an integration dimension orthogonal to feature development
- Attestation after Reticulum because gated rooms need transport-agnostic identity, which requires the abstraction to be solid
- Mobile last because Electron is the primary platform and mobile adds platform divergence that's easier to handle once features are stable

**Research flags for phases:**
- Phase 4 (Reticulum): Needs deeper research on mobile Python embedding (Chaquopy/PythonKit) — HIGH uncertainty
- Phase 5 (Attestation): WASM approach needs validation that @oqs/liboqs-js output is truly byte-identical to PHANTOM's C implementation
- Phase 6 (Mobile): Capacitor WebRTC gotchas need phase-specific research (WKWebView audio handling, background WebRTC, etc.)
- Phase 1-3: Standard patterns, unlikely to need additional research

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (desktop) | HIGH | Electron + WebRTC is proven, versions verified against npm registry |
| Stack (mobile) | MEDIUM | Capacitor 8 WebRTC works in theory; needs hands-on validation |
| Stack (PQ crypto) | HIGH | @oqs/liboqs-js verified against npm + GitHub, API matches need |
| Reticulum integration | MEDIUM | Python sidecar is standard pattern, but TypeScript↔Python bridge is custom work |
| LXMF interop | MEDIUM | Protocol fields analyzed from source, but real interop testing with Sideband needed |
| Mobile Reticulum | LOW | No proven pattern for running Python RNS inside a mobile app shell |
| Service bridging | HIGH | TCP ↔ DataChannel is a well-understood proxy pattern |
| Capacitor Electron | HIGH (negative) | Conclusively dead — verified via npm, GitHub, commit history |

## Gaps to Address

- **Mobile Python embedding**: How to bundle and run Reticulum on iOS/Android. Chaquopy (Android only) and PythonKit (iOS) are leads but unvalidated.
- **WASM attestation parity**: Need to verify @oqs/liboqs-js ML-DSA-65 output matches PHANTOM's C-based liboqs output byte-for-byte.
- **Capacitor WebRTC on iOS**: WKWebView WebRTC has known quirks (audio session management, background behavior). Needs phase-specific research.
- **Codec2 WASM**: No production-ready Codec2 WASM on npm. Voice over LoRa requires custom WASM build from C source. Deferred.
- **Offline map tiles**: Leaflet tile caching for mesh-only scenarios. Solvable with IndexedDB tile cache but not researched in depth.
- **Reticulum on Windows/macOS mobile**: Less tested than Linux. May need platform-specific serial/TCP configuration.

---

*Research summary: 2025-07-15*
