# Technology Stack

**Project:** Comms — P2P Room Runtime (Milestone 2: Transport Abstraction + Multi-Transport Features)
**Researched:** 2025-07-15

## Recommended Stack

### Runtime Shell — Electron (desktop) + Capacitor 8 (mobile)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Electron | 41.x (current) | Desktop shell | Already in production. Full Node.js access, native addon support, `net` module for TCP sockets, `child_process` for Python sidecar. No reason to change. | HIGH |
| @capacitor/core | 8.3.0 | Mobile shell (iOS + Android) | Native WebView gives WebRTC for free (no bridge needed unlike React Native). Plugin architecture for native APIs. Capacitor 8 is current stable. | HIGH |
| @capacitor/cli | 8.3.0 | Capacitor tooling | Required for `npx cap add ios/android`, sync, build | HIGH |
| @capacitor/ios | 8.3.0 | iOS platform | WKWebView with full WebRTC support | HIGH |
| @capacitor/android | 8.3.0 | Android platform | WebView with full WebRTC support | HIGH |

**CRITICAL: Do NOT use `@capacitor-community/electron` for desktop.**

The `@capacitor-community/electron` package is **abandoned**:
- Last meaningful commit: September 2023 (v5.0.1)
- Depends on `@capacitor/core >=5.4.0` — 3 major versions behind current (v8)
- 67 open issues, no active maintainers, repository effectively dead (last push May 2024 was a README edit)
- No forks with significant activity

**Architecture instead:** Keep Electron for desktop, Capacitor for mobile, share the Preact web app between both. Build a **platform abstraction layer** in TypeScript that presents unified APIs with platform-specific backends (Electron IPC vs Capacitor plugin calls). The existing `client/src/lib/platform.ts` pattern (`isElectron` check) extends naturally to `isCapacitor`.

### Reticulum / Mesh Transport

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| RNS (Reticulum) | 1.1.4 | Mesh network stack | The only mature, actively maintained (5.4k stars, pushed today), multi-medium mesh stack for LoRa/WiFi/Serial/TCP. Python only — no JS implementation exists. MIT-variant license (with ethical clauses). | HIGH |
| LXMF | 0.9.4 | Message format over Reticulum | Standard message format for Sideband/MeshChat interop. Supports text, images, audio (Codec2), file attachments, telemetry (GPS), and custom data fields. | HIGH |
| Python 3.11+ | System | Reticulum runtime | RNS requires Python >=3.7; use 3.11+ for performance. Runs as sidecar process, not embedded. | HIGH |

**Integration pattern: Python sidecar with JSON-RPC over stdio**

Reticulum is 100% Python with no TypeScript/JS port. The integration approach:

1. **Desktop (Electron):** Spawn Python sidecar via `child_process.spawn()`. Communicate over stdin/stdout using newline-delimited JSON (JSON-RPC 2.0 style). Sidecar runs RNS + LXMF, handles mesh networking. TypeScript side sends/receives messages through the bridge.

2. **Mobile (Capacitor):** Bundle Python via [Chaquopy](https://chaquo.com/chaquopy/) (Android) or [PythonKit](https://github.com/nickvdende/PythonKit) (iOS) — OR run Reticulum as a separate app (Sideband) and use Android intents / iOS URL schemes for IPC. Mobile Reticulum integration is the hardest piece; consider deferring to after desktop mesh works.

3. **Reticulum shared instance:** RNS runs a local TCP server on port 37428 and RPC on 37429. Multiple programs can connect to a single Reticulum instance. The sidecar connects to an existing `rnsd` daemon if running, or starts its own instance.

**Why not Pyodide (Python in WASM)?** RNS needs real network sockets (TCP, UDP, Serial) for hardware interfaces. WASM sandboxing prevents this. The sidecar pattern is correct.

**Why not rewrite Reticulum in TypeScript?** RNS is ~15k lines of complex networking code with active development. Tracking upstream would be impossible. Use the reference implementation.

### Post-Quantum Cryptography

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @oqs/liboqs-js | 0.15.1 | ML-DSA-65 signatures, ML-KEM-768 key encapsulation | Official Open Quantum Safe WASM bindings. Supports all NIST FIPS 203/204/205 algorithms. Works in Node.js 22+ and browsers. Tree-shakable per-algorithm WASM modules. SIMD-optimized. **Eliminates the need for C++ N-API native addon** — WASM is cross-platform by default and gives byte-identical output everywhere. | HIGH |
| Node.js `crypto` | Built-in | SHA3-256 hashing | `crypto.createHash('sha3-256')` works in Node.js. For browser/Capacitor, use SubtleCrypto or a WASM SHA3 implementation. | HIGH |

**Key insight: WASM > N-API for this use case.** The PROJECT.md suggested packaging liboqs as a Capacitor native plugin via C++ N-API. The `@oqs/liboqs-js` WASM approach is superior because:
- Cross-platform without cross-compilation (works in Electron Node.js, Capacitor WebView, and browser)
- Deterministic WASM execution ensures byte-identical attestation chain output across platforms
- No CMake toolchain needed per target platform
- Official OQS project backing with version tracking against liboqs releases
- Requires Node.js 22+ (Electron 41 ships Node.js v22.x ✓)

**API example (ML-DSA-65 signing):**
```typescript
import { createMLDSA65 } from '@oqs/liboqs-js';
const signer = await createMLDSA65();
const { publicKey, secretKey } = signer.generateKeyPair();
const signature = signer.sign(message, secretKey);
const isValid = signer.verify(message, signature, publicKey);
signer.destroy(); // secure cleanup
```

### SQLite (Attestation Chain Storage)

| Technology | Version | Purpose | Platform | Why | Confidence |
|------------|---------|---------|----------|-----|------------|
| better-sqlite3 | 12.9.0 | Attestation chain DB | Electron (desktop) | Synchronous API (critical for chain integrity), fastest Node.js SQLite binding, native addon rebuilt against Electron's Node.js headers | HIGH |
| @capacitor-community/sqlite | 8.1.0 | Attestation chain DB | Capacitor (mobile) | Capacitor 8 compatible, wraps native SQLite on iOS/Android. Uses `jeep-sqlite` internally. | MEDIUM |

**Why not sql.js (WASM SQLite)?** Performance matters for attestation chains with potentially thousands of entries. Native SQLite is 5-10x faster than WASM SQLite. Use native bindings on each platform.

**Why not Bun's built-in SQLite?** Bun SQLite works for the relay server but Electron runs on Node.js, not Bun. The client app needs `better-sqlite3`.

### GPS / Geolocation

| Technology | Version | Purpose | Platform | Why | Confidence |
|------------|---------|---------|----------|-----|------------|
| @capacitor/geolocation | 8.2.0 | GPS coordinates | Capacitor (mobile) | Official Capacitor plugin, supports Cap 8. Native GPS access on iOS/Android with watch mode for live tracking. | HIGH |
| Web Geolocation API | Built-in | GPS coordinates | Electron (desktop) | Chromium's `navigator.geolocation` works in Electron. Requires either Google Geolocation API key or system location services. Desktop GPS is less critical than mobile. | MEDIUM |
| Leaflet | 1.9.4 | Map rendering | All platforms | Lightweight (42KB gzip), no API key required, works with free tile providers (OpenStreetMap). Imperative API integrates cleanly with Preact via refs — don't use react-leaflet/preact-leaflet wrappers. | HIGH |

**Map integration approach:** Use Leaflet directly with Preact refs, not a wrapper library. `react-leaflet` v5 requires React 19 (incompatible with Preact 10). `preact-leaflet` v0.1.20 is abandoned (last update May 2022). Leaflet's imperative API is simple:

```typescript
// In a Preact component
const mapRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  const map = L.map(mapRef.current!).setView([lat, lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  return () => map.remove();
}, []);
```

**LXMF telemetry interop:** Sideband uses `SID_LOCATION` sensor with `{ latitude: float, longitude: float, altitude: float }` format (6 decimal places). Comms GPS messages over WebRTC should use the same format for bidirectional bridge compatibility.

**Offline tiles:** For mesh/LoRa scenarios without internet, pre-cache tile packages. Leaflet supports custom tile sources. Tile caching can use IndexedDB (same as chat persistence).

### File Transfer (Chunked P2P)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Custom chunking over WebRTC DataChannel | N/A | File transfer | No good library exists for DataChannel file transfer. WebRTC SCTP-based DataChannels have browser-specific max message sizes (~256KB safe). Build custom chunking: 64KB chunks, SHA-256 integrity per chunk, progress tracking. This is the standard approach in P2P apps. | HIGH |

**Protocol design:**
```typescript
// File offer message (over existing chat DataChannel)
{ type: 'file-offer', fileId: string, name: string, size: number, sha256: string, chunks: number }

// Each chunk (over dedicated binary DataChannel)
// Header: [4B fileId-hash][4B chunkIndex][data]
// 64KB chunk size = ~16 chunks/MB, good DataChannel throughput

// File accept/reject
{ type: 'file-accept', fileId: string }
{ type: 'file-reject', fileId: string }

// Completion
{ type: 'file-complete', fileId: string, sha256: string }
```

**Why 64KB chunks?** Safe below all browser SCTP limits. Large enough for good throughput (~50MB/s on local network). Small enough for progress granularity. Matches LXMF's Resource transfer pattern for mesh bridging.

**LXMF file interop:** LXMF natively supports `FIELD_FILE_ATTACHMENTS` (0x05). Files under 295 bytes go as single packets; larger files use Reticulum Links (automatic). The Python sidecar handles LXMF file transfer; TypeScript handles WebRTC chunked transfer. The bridge translates between the two.

### Service Bridging (TCP Proxy)

| Technology | Version | Purpose | Platform | Why | Confidence |
|------------|---------|---------|----------|-----|------------|
| Node.js `net` module | Built-in | TCP socket proxy | Electron (desktop) | Already available in Electron's Node.js. Create TCP server + client that bridges to WebRTC DataChannels. Same pattern as Tailscale Funnel / SSH port forwarding. | HIGH |
| @deedarb/capacitor-tcp-socket | 7.2.1 | TCP socket proxy | Capacitor (mobile) | Capacitor plugin providing TCP socket access on iOS/Android. PeerDep `@capacitor/core >=7.0.0` covers Capacitor 8. | LOW |

**Service bridging architecture:**
1. Host exposes `localhost:port` into room
2. Main process creates TCP connection to `localhost:port`
3. TCP data is framed and forwarded through a dedicated WebRTC DataChannel (binary, ordered)
4. Peer's main process receives DataChannel data and pipes to a local TCP server
5. Peer connects to their local TCP server → traffic flows bidirectionally

**Why this is desktop-first:** Service bridging (HTTP, SMB, SSH, etc.) is primarily a desktop use case. Mobile service bridging is an edge case and can be deferred. Node.js `net` module in Electron is the proven path.

### Platform Abstraction Layer

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Custom TypeScript interfaces | N/A | Unified platform API | Abstract platform-specific capabilities behind interfaces. Implementations: `ElectronPlatform` (Node.js IPC), `CapacitorPlatform` (plugin calls), `WebPlatform` (browser-only fallback). Pattern already started with `client/src/lib/platform.ts`. | HIGH |

**Abstraction surface:**
```typescript
interface PlatformBridge {
  // Identity
  getIdentity(): Promise<Identity>;
  setDisplayName(name: string): Promise<void>;

  // GPS
  watchPosition(cb: (pos: GeoPosition) => void): Promise<WatchId>;
  clearWatch(id: WatchId): Promise<void>;

  // File system
  saveFile(data: Uint8Array, name: string): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;

  // TCP (service bridging)
  createTCPServer(port: number): Promise<TCPServer>;
  connectTCP(host: string, port: number): Promise<TCPSocket>;

  // Background service
  isBackgroundSupported(): boolean;
  requestBackground(): Promise<void>;

  // Reticulum sidecar
  startSidecar(): Promise<SidecarBridge>;
  stopSidecar(): Promise<void>;
}
```

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| @capawesome/capacitor-background-task | 8.0.2 | Background execution on mobile | When Reticulum sidecar or GPS tracking needs to run with app backgrounded. Capacitor 8 compatible. | MEDIUM |
| @capacitor/filesystem | 8.1.2 | Mobile file access | File transfer save/read on iOS/Android. Capacitor 8 compatible. | HIGH |
| @capacitor/network | 8.0.1 | Network status | Detect online/offline for transport selection (WebRTC vs mesh). | HIGH |

### LXMF Protocol Compatibility

| Concern | Detail | Confidence |
|---------|--------|------------|
| Message format | LXMF uses msgpack serialization. Use `@msgpack/msgpack` (npm) for TypeScript side. | HIGH |
| Custom bridge data | LXMF fields `FIELD_CUSTOM_TYPE` (0xFB) + `FIELD_CUSTOM_DATA` (0xFC) allow embedding arbitrary protocols — use for Comms room protocol tunneling over LXMF. | HIGH |
| GPS interop | LXMF `FIELD_TELEMETRY` (0x02) with `SID_LOCATION` sensor carries lat/lng/alt. Match Sideband's 6-decimal-place format. | HIGH |
| Audio interop | LXMF `FIELD_AUDIO` with Codec2 modes (450-3200 bps). Voice over LoRa requires Codec2 encoding. | MEDIUM |
| File interop | LXMF `FIELD_FILE_ATTACHMENTS` (0x05). Automatic single-packet vs Link-based transfer based on size. | HIGH |

**Codec2 for voice over mesh:** LXMF defines Codec2 audio modes. For LoRa voice (extremely constrained bandwidth), Codec2 at 700C (700 bps) or 1200 bps is the standard. No production-ready Codec2 WASM exists on npm — `@uimaxbai/ffmpeg-core-codec2` bundles it via FFmpeg but is heavy. **Defer Codec2 integration** — text/GPS/files over mesh first, voice over mesh is a future optimization requiring custom WASM build from Codec2 C source.

### Reticulum License Consideration

Reticulum uses a **modified MIT license** with two additional clauses:
1. **No harm clause:** "Shall not be used in any kind of system which includes the ability to purposefully do harm to human beings"
2. **No AI/ML clause:** "Shall not be used in the creation of an AI/ML training dataset"

These clauses are compatible with Comms' AGPL-3.0 license and use case. However, they make the license non-standard (not OSI-approved MIT). Document this in CONTRIBUTING.md.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Desktop shell | Electron (keep) | @capacitor-community/electron | Dead project (v5.0.1, Sept 2023). 3 major versions behind Capacitor 8. 67 open issues, no maintainers. |
| Desktop shell | Electron (keep) | Tauri 2.x | Would require rewriting all Node.js/IPC code in Rust. Loses native addon ecosystem. WebView has worse WebRTC support than Chromium on some platforms. |
| PQ crypto | @oqs/liboqs-js (WASM) | liboqs C++ via N-API | Cross-compilation needed per target. CMake toolchain per platform. WASM is universal, byte-identical, and the official OQS project ships it. |
| PQ crypto | @oqs/liboqs-js (WASM) | liboqs-node | v0.1.0, single maintainer (TapuCosmo), not official OQS. Unclear algorithm support. |
| SQLite | better-sqlite3 (desktop) / cap-sqlite (mobile) | sql.js (WASM) | 5-10x slower. Attestation chain with thousands of entries needs native performance. |
| Map | Leaflet (direct) | react-leaflet 5.x | Requires React 19, incompatible with Preact 10. |
| Map | Leaflet (direct) | preact-leaflet | Abandoned (v0.1.20, May 2022). Thin wrapper adds no value. |
| Map | Leaflet (direct) | MapLibre GL JS 5.x | Heavier (200KB+ vs 42KB), overkill for pin display. Vector tiles unnecessary. WebGL requirement may conflict with some Electron configs. |
| Mesh | Reticulum (Python sidecar) | rust-reticulum | 6 stars, read-only mirror, incomplete implementation. Not production-ready. |
| Mesh | Reticulum (Python sidecar) | Custom TypeScript RNS port | 15k+ lines of complex networking code under active development. Tracking upstream impossible. |
| Python IPC | stdio JSON-RPC | Pyodide (WASM) | RNS needs real network sockets for hardware interfaces. WASM sandboxing prevents this. |
| Python IPC | stdio JSON-RPC | HTTP REST | Extra port binding, firewall issues, overhead. stdio is zero-config, no network exposure. |
| File transfer | Custom chunking | WebTorrent / simple-peer | WebTorrent adds BitTorrent overhead. simple-peer is a WebRTC wrapper (unmaintained, last update Feb 2022), not a file transfer protocol. |

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| `@capacitor-community/electron` | Dead. Do not introduce a dead dependency as a platform foundation. |
| `react-leaflet` / `preact-leaflet` | React 19 requirement or abandoned. Use Leaflet API directly. |
| `python-shell` npm package | Unnecessary abstraction over `child_process.spawn()`. Adds dependency for trivial functionality. |
| Redux / Zustand / MobX | Current singleton pattern works. No state management library needed for transport abstraction — events and callbacks suffice. |
| Socket.IO / WebSocket libraries | Signaling relay already uses raw Bun WebSocket. Transport abstraction uses DataChannels. No WS library needed. |
| libp2p / Gun.js / OrbitDB | Over-engineered for this use case. Comms defines its own room protocol; Reticulum handles mesh. These libraries solve different problems. |

## Installation

```bash
# Mobile platform (Capacitor 8)
bun add @capacitor/core @capacitor/cli
bun add @capacitor/ios @capacitor/android
bun add @capacitor/geolocation @capacitor/filesystem @capacitor/network
bun add @capawesome/capacitor-background-task
bun add @capacitor-community/sqlite

# Post-quantum crypto (WASM — all platforms)
bun add @oqs/liboqs-js

# SQLite for desktop (Electron native addon)
bun add better-sqlite3
bun add -D @types/better-sqlite3

# Map rendering
bun add leaflet
bun add -D @types/leaflet

# LXMF protocol compatibility
bun add @msgpack/msgpack

# TCP socket for mobile service bridging (defer until needed)
# bun add @deedarb/capacitor-tcp-socket

# Initialize Capacitor platforms
npx cap init comms com.seppulcro.comms --web-dir client/dist
npx cap add ios
npx cap add android
```

```bash
# Python sidecar dependencies (separate venv)
python3 -m venv .venv
source .venv/bin/activate
pip install rns>=1.1.4 lxmf>=0.9.4
```

## Version Compatibility Matrix

| Component | Version | Requires | Verified |
|-----------|---------|----------|----------|
| @capacitor/core | 8.3.0 | — | npm registry ✓ |
| @capacitor/geolocation | 8.2.0 | @capacitor/core >=8.0.0 | npm registry ✓ |
| @capacitor/filesystem | 8.1.2 | @capacitor/core >=8.0.0 | npm registry ✓ |
| @capacitor/network | 8.0.1 | @capacitor/core >=8.0.0 | npm registry ✓ |
| @capacitor-community/sqlite | 8.1.0 | @capacitor/core >=8.0.0 | npm registry ✓ |
| @capawesome/capacitor-background-task | 8.0.2 | @capacitor/core >=8.0.0 | npm registry ✓ |
| @oqs/liboqs-js | 0.15.1 | Node.js 22+ | npm registry + README ✓ |
| better-sqlite3 | 12.9.0 | Node.js — needs Electron rebuild | npm registry ✓ |
| leaflet | 1.9.4 | — | npm registry ✓ |
| @msgpack/msgpack | latest | — | npm registry ✓ |
| RNS | 1.1.4 | Python >=3.7 | PyPI ✓ |
| LXMF | 0.9.4 | RNS >=1.1.1 | PyPI ✓ |
| @deedarb/capacitor-tcp-socket | 7.2.1 | @capacitor/core >=7.0.0 | npm registry ✓ |

## Sources

- Capacitor 8 release: npm registry `@capacitor/core@8.3.0` (published 2026-03-25)
- @capacitor-community/electron: npm registry v5.0.1 (published 2023-09-21), GitHub last push 2024-05-22, 67 open issues
- Reticulum: GitHub `markqvist/Reticulum` (5.4k stars, pushed 2026-04-12), PyPI `RNS@1.1.4`
- LXMF: PyPI `LXMF@0.9.4`, GitHub `markqvist/LXMF`
- @oqs/liboqs-js: npm registry v0.15.1, GitHub `open-quantum-safe/liboqs-js` (7 stars, pushed 2026-02-17)
- liboqs: GitHub `open-quantum-safe/liboqs` (2.8k stars), release v0.15.0 (2025-11-14)
- Reticulum RPC: Source code analysis of `RNS/Reticulum.py` — `multiprocessing.connection.Listener` on port 37429
- Reticulum LocalInterface: Source code analysis of `RNS/Interfaces/LocalInterface.py` — TCP on port 37428
- LXMF fields: Source code analysis of `LXMF/LXMF.py` — field IDs, custom data support
- LXMF telemetry: Source code analysis of `Sideband/sbapp/sideband/sense.py` — GPS format
- Reticulum license: `markqvist/Reticulum/LICENSE` — modified MIT with ethical clauses

---

*Stack research: 2025-07-15*
