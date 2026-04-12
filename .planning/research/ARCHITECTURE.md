# Architecture Patterns

**Domain:** Protocol-agnostic P2P room runtime with multi-transport mesh networking
**Researched:** 2025-07-15

## Recommended Architecture

The system evolves from the current Electron+WebRTC monolith into a layered runtime where a **Room Runtime** sits at the center, managing state, routing messages across transports, and exposing a unified API to UI components. The key insight: the existing `WebRTCManager` and `SignalingClient` don't get replaced — they get wrapped as one transport provider among several.

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer (Preact)                        │
│  Chat │ Voice │ GPS Map │ Files │ Services │ Settings           │
├─────────────────────────────────────────────────────────────────┤
│                       Room Runtime                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Message Bus  │  │ State Sync   │  │ Capability Registry    │ │
│  │ (typed msgs) │  │ (room state) │  │ (what each transport   │ │
│  │              │  │              │  │  can carry)            │ │
│  └──────┬───┬──┘  └──────────────┘  └────────────────────────┘ │
├─────────┼───┼───────────────────────────────────────────────────┤
│         │   │      Transport Abstraction Layer                  │
│  ┌──────┴───┴──┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ WebRTC      │  │ Reticulum    │  │ Future Transport       │ │
│  │ Transport   │  │ Transport    │  │ (BLE, WiFi Direct...)  │ │
│  │             │  │ (sidecar)    │  │                        │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                    Platform Layer                               │
│  Electron (desktop) │ Capacitor (mobile) │ Web (fallback)      │
│  Node.js net/TCP    │ Swift/Kotlin native │ Browser APIs only   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Room Runtime** | Central orchestrator. Manages room membership, routes messages between transports, enforces capabilities | All components. UI via typed events. Transports via Transport interface |
| **Transport Abstraction** | Defines the interface contract. Each transport implements `send()`, `receive()`, `connect()`, `disconnect()`, `capabilities()` | Room Runtime (upward). Network/hardware (downward) |
| **WebRTC Transport** | Wraps existing `WebRTCManager` + `SignalingClient`. High-bandwidth transport for voice/video/screenshare/data | SignalingClient → relay server. RTCPeerConnection → peers |
| **Reticulum Transport** | Python sidecar process with JSON-RPC IPC. Low-bandwidth mesh transport for text/GPS/metadata | RNS daemon (via stdio/TCP). Room Runtime (via IPC bridge) |
| **Message Bus** | Typed message dispatcher. Components subscribe to message types, Bus routes to appropriate handlers | Room Runtime. UI components. Transport layer |
| **Capability Registry** | Tracks what each transport can carry (voice needs WebRTC, text works on any, GPS works on any, files need bandwidth) | Room Runtime. Used for graceful degradation |
| **State Sync** | Room membership, peer presence, shared state. Last-Writer-Wins register for simple state, operation log for chat history | Room Runtime. Persisted to IndexedDB |
| **Service Bridge** | TCP proxy: `localhost:port` ↔ DataChannel ↔ `localhost:port` on peer. Bidirectional byte stream tunneling | Electron `net` module (TCP sockets). WebRTC DataChannel (binary mode) |
| **File Transfer** | Chunked, resumable file transfer over DataChannels with SHA-256 integrity verification | WebRTC DataChannel (binary). IndexedDB (resume state) |
| **GPS Module** | Location broadcasting and map rendering. Periodically sends coordinates to room | Room Runtime (any available transport). Geolocation API / Capacitor Geolocation plugin |
| **Attestation Plugin** | ML-DSA-65 + SHA3-256 hash chain. Capacitor native plugin wrapping C++ liboqs via N-API (desktop) / JNI (Android) / Swift bridging (iOS) | Room Runtime (signs/verifies messages). SQLite (chain storage) |

### Data Flow

**Message lifecycle (outbound):**

```
1. User action (e.g., sends chat message)
2. UI component calls Room Runtime API: room.send({ type: 'chat', content: '...' })
3. Room Runtime serializes to RoomMessage envelope:
   { id, type, from, room, timestamp, payload, [attestation] }
4. Room Runtime queries Capability Registry:
   "Which transports can carry 'chat'?" → [WebRTC, Reticulum]
5. Room Runtime sends to ALL capable, connected transports
6. Each transport encodes for its wire format:
   - WebRTC: JSON string over DataChannel
   - Reticulum: msgpack over LXMF (≤295 bytes per packet, link for larger)
7. Message persisted locally (IndexedDB) with delivery status
```

**Message lifecycle (inbound):**

```
1. Transport receives raw data from network
2. Transport decodes to RoomMessage envelope
3. Transport emits to Room Runtime via onMessage callback
4. Room Runtime deduplicates (by message ID)
5. Room Runtime verifies attestation (if enabled)
6. Room Runtime dispatches to Message Bus subscribers
7. UI component receives typed event, updates state
8. Message persisted to IndexedDB
```

**Cross-transport relay (bridge peer):**

```
Peer A (LoRa only) → Reticulum → Bridge Peer (has both) → WebRTC → Peer B (internet only)

The bridge peer's Room Runtime receives on Reticulum transport,
deduplicates, then forwards to WebRTC transport for peers only
reachable via WebRTC. This is automatic — the Room Runtime
relays messages to all connected transports by default.
```

## Core Abstractions

### Transport Interface

The heart of the architecture. Every transport implements this contract:

```typescript
interface TransportCapabilities {
  maxPayloadBytes: number       // WebRTC: ~256KB, Reticulum: 500B (packet), ~16MB (link)
  supportsStreaming: boolean    // WebRTC: yes (audio/video tracks), Reticulum: no
  supportsBinary: boolean       // Both: yes
  latencyClass: 'low' | 'medium' | 'high'  // WebRTC: low, Reticulum/LoRa: high
  bandwidthClass: 'high' | 'medium' | 'low' // WebRTC: high, Reticulum: varies
  reliabilityMode: 'ordered' | 'unordered' | 'best-effort'
}

interface TransportPeer {
  id: string                    // Canonical peer ID (room-scoped)
  transportPeerId: string       // Transport-specific identifier
  transport: string             // Which transport connected this peer
  capabilities: TransportCapabilities
}

interface Transport {
  readonly name: string
  readonly capabilities: TransportCapabilities
  readonly status: 'disconnected' | 'connecting' | 'connected' | 'error'

  // Lifecycle
  connect(roomId: string, peerId: string, peerName: string): Promise<void>
  disconnect(): Promise<void>

  // Messaging
  send(peerId: string, message: Uint8Array): void
  broadcast(message: Uint8Array): void

  // Events
  onPeerJoined: (peer: TransportPeer) => void
  onPeerLeft: (peerId: string) => void
  onMessage: (peerId: string, data: Uint8Array) => void
  onStatusChange: (status: Transport['status']) => void

  // Optional: streaming (only WebRTC implements this)
  addTrack?(track: MediaStreamTrack, stream: MediaStream): void
  onTrack?: (peerId: string, stream: MediaStream, kind: 'audio' | 'video') => void
}
```

**Confidence: HIGH** — This pattern is well-established. libp2p uses an identical approach (transport interface with capability descriptors). The key decision is using `Uint8Array` as the wire format (not JSON strings) so transports can use efficient binary encoding.

### Room Runtime

```typescript
interface RoomMessage {
  id: string              // UUID, used for deduplication
  type: string            // 'chat' | 'gps' | 'file-offer' | 'file-chunk' | 'service-announce' | ...
  from: string            // Peer ID
  room: string            // Room ID
  timestamp: number       // Unix ms
  payload: Uint8Array     // Type-specific payload (msgpack encoded)
  attestation?: Uint8Array // Optional ML-DSA-65 signature
}

class RoomRuntime {
  private transports: Map<string, Transport>
  private peers: Map<string, RoomPeer>        // Unified peer map across transports
  private seen: Set<string>                    // Message ID dedup (LRU, max 10K entries)
  private handlers: Map<string, Set<Handler>>  // Message type → handlers

  // Register a transport
  addTransport(transport: Transport): void

  // Send to all peers via all capable transports
  send(msg: Omit<RoomMessage, 'id' | 'from' | 'timestamp'>): void

  // Subscribe to message types
  on(type: string, handler: Handler): void
  off(type: string, handler: Handler): void

  // Peer management
  getPeers(): RoomPeer[]  // Unified across transports

  // Room lifecycle
  join(roomId: string): Promise<void>
  leave(): void
}
```

The Room Runtime is the **only** component that UI talks to. Components never import transports directly.

### Evolving Existing Code

**Key principle: Wrap, don't rewrite.** The existing `WebRTCManager` and `SignalingClient` become the internals of `WebRTCTransport`. This is a refactor, not a rewrite.

```
Current:
  signaling (singleton) ← directly imported by webrtc.ts
  rtc (singleton) ← directly imported by components

After:
  WebRTCTransport (implements Transport)
    └── wraps SignalingClient (unchanged internally)
    └── wraps WebRTCManager (unchanged internally, but callbacks routed to Transport interface)

  RoomRuntime
    └── owns WebRTCTransport
    └── owns ReticulumTransport
    └── exposes unified API to components
```

**Migration path:**

1. Extract `Transport` interface (new file, no changes to existing code)
2. Create `WebRTCTransport` class that wraps `rtc` singleton and adapts its callbacks to `Transport` interface
3. Create `RoomRuntime` that owns `WebRTCTransport` as its only transport
4. Migrate components from importing `rtc` directly to using `RoomRuntime`
5. Now adding Reticulum is just: `runtime.addTransport(new ReticulumTransport())`

**What changes in existing code:** Mostly import paths. The `WebRTCManager` internal implementation stays the same. The adaptation layer translates between its callback-based API and the `Transport` interface.

**What doesn't change:** `SignalingClient`, `WebRTCManager` internals, `chatdb.ts`, `store.ts`, component rendering logic.

## Patterns to Follow

### Pattern 1: Capability-Gated Features

**What:** UI features automatically enable/disable based on which transports are connected and what they support. No manual feature flags.

**When:** Always. This is the core of "graceful degradation."

**Example:**

```typescript
// Capability registry
const FEATURE_REQUIREMENTS: Record<string, (caps: TransportCapabilities) => boolean> = {
  'voice':       (c) => c.supportsStreaming && c.bandwidthClass === 'high',
  'video':       (c) => c.supportsStreaming && c.bandwidthClass === 'high',
  'chat':        (_) => true,  // Works on any transport
  'gps':         (_) => true,  // Small payload, works on any transport
  'file-share':  (c) => c.maxPayloadBytes > 1024,  // Needs reasonable bandwidth
  'service':     (c) => c.supportsBinary && c.bandwidthClass !== 'low',
  'screenshare': (c) => c.supportsStreaming,
}

// In component
function VoiceButton({ room }: { room: RoomRuntime }) {
  const canVoice = room.hasCapability('voice')
  return <button disabled={!canVoice} title={canVoice ? 'Join voice' : 'No high-bandwidth transport'}>
    {canVoice ? '🎤 Join Voice' : '🎤 Voice unavailable'}
  </button>
}
```

### Pattern 2: Reticulum as Sidecar Process

**What:** Reticulum (Python) runs as a separate process. The Electron/Capacitor app communicates with it via JSON-RPC over stdio or local TCP socket.

**Why:** Reticulum is Python-only. No JavaScript port exists. Embedding Python in Electron is impractical. The sidecar pattern is proven (LSP servers, language servers, Docker, etc.).

**Architecture:**

```
┌──────────────────┐     stdio/JSON-RPC     ┌──────────────────┐
│  Electron App    │ ◄──────────────────────►│  RNS Sidecar     │
│  (TypeScript)    │                         │  (Python)        │
│                  │  Commands:              │                  │
│  ReticulumBridge │  - announce(dest)       │  rns_bridge.py   │
│  class           │  - send(dest, data)     │  - RNS.Reticulum │
│                  │  - get_peers()          │  - LXMF.Router   │
│                  │  Events:                │  - Destinations   │
│                  │  - message_received     │  - Links          │
│                  │  - peer_discovered      │                  │
│                  │  - link_established     │                  │
└──────────────────┘                         └──────────────────┘
```

**Wire protocol:** Newline-delimited JSON over stdio (same pattern as LSP):

```json
{"jsonrpc":"2.0","method":"send","params":{"dest":"13425ec15b621c1d","data":"base64..."},"id":1}
{"jsonrpc":"2.0","result":{"status":"queued"},"id":1}
{"jsonrpc":"2.0","method":"message_received","params":{"from":"a1b2c3...","data":"base64..."}}
```

**Confidence: HIGH** — This is the only practical approach for integrating Python-based Reticulum with a JavaScript app. The sidecar pattern is battle-tested (VS Code + language servers, Docker Desktop + Docker Engine).

**Mobile consideration:** On iOS/Android, the Python sidecar can't run. Mobile Reticulum integration requires either: (a) a companion app like Sideband running Reticulum, accessed via Android intents / URL schemes, or (b) a future partial TypeScript port of RNS (feasible for the transport layer, very hard for the full stack). For the initial milestone, Reticulum is desktop-only.

### Pattern 3: Message Envelope with Msgpack

**What:** All messages use a common envelope format, serialized with msgpack (not JSON) for efficiency over constrained links.

**Why:** Reticulum has a 500-byte MTU. JSON wastes bytes on keys and string encoding. Msgpack is ~30-40% smaller for typical payloads and handles binary data natively.

```typescript
// Message envelope (before serialization)
interface RoomMessageEnvelope {
  i: string     // id (UUID, 36 bytes as string or 16 as binary)
  t: string     // type
  f: string     // from peer ID
  r: string     // room ID
  s: number     // timestamp (unix seconds, not ms — saves 3 bytes)
  p: Uint8Array // payload (type-specific, already msgpack-encoded)
  a?: Uint8Array // attestation signature
}

// Serialized: msgpack.encode(envelope) → Uint8Array
// Over WebRTC DataChannel: send as binary (dc.send(bytes))
// Over Reticulum: send as LXMF message content
```

**Confidence: MEDIUM** — Msgpack is the right choice for constrained links. The risk is added complexity vs JSON. For WebRTC-only scenarios, JSON is fine. The transition to msgpack should happen when Reticulum transport is added, not before.

### Pattern 4: Service Bridge (TCP Proxy over DataChannel)

**What:** A host exposes a local TCP service (e.g., HTTP on port 8080) into the room. Peers connect to a local proxy port that tunnels traffic through a WebRTC DataChannel to the host's actual service.

**This is the same pattern as:**
- **Tailscale Funnel:** Expose local service to Tailscale network
- **SSH port forwarding:** `ssh -L 8080:localhost:8080 remote`
- **ngrok:** Tunnel to localhost through relay

**Architecture:**

```
Host side:                              Peer side:
┌─────────────┐                         ┌─────────────┐
│ Local HTTP   │                         │ Browser/App  │
│ :8080        │                         │ connects to  │
│              │                         │ localhost    │
└──────┬───────┘                         │ :9090        │
       │ TCP                             └──────┬───────┘
       ▼                                        │ TCP
┌──────────────┐   DataChannel (binary)  ┌──────▼───────┐
│ ServiceHost  │ ◄─────────────────────► │ ServiceProxy │
│ - TCP server │   framed byte stream   │ - TCP server  │
│   accept()   │                         │   connect()   │
│ - frame mux  │                         │ - frame demux │
└──────────────┘                         └──────────────┘
```

**Framing protocol over DataChannel:**

```
Each frame:
  [4 bytes: stream ID (uint32)]  — multiplexes concurrent TCP connections
  [4 bytes: payload length (uint32)]
  [N bytes: payload]

Control frames (stream ID = 0):
  { type: 'open', streamId: N, port: 8080 }   — new TCP connection
  { type: 'close', streamId: N }                — TCP connection closed
  { type: 'error', streamId: N, msg: '...' }   — error
```

**Implementation uses Electron's `net` module** (Node.js TCP) on both sides. The DataChannel is set to `ordered: true, maxRetransmits: undefined` (reliable ordered) to match TCP semantics.

**Confidence: HIGH** — This is a well-understood pattern. The main complexity is flow control (backpressure when the DataChannel buffer fills). Use DataChannel's `bufferedAmount` + `bufferedAmountLowThreshold` events for backpressure.

### Pattern 5: Chunked File Transfer

**What:** Files split into fixed-size chunks, transferred over DataChannel with SHA-256 integrity and resume support.

**Protocol:**

```
1. Sender broadcasts file offer:
   { type: 'file-offer', fileId, name, size, sha256, chunkSize: 64KB, totalChunks }

2. Receiver accepts:
   { type: 'file-accept', fileId, startChunk: 0 }  // or startChunk > 0 for resume

3. Sender streams chunks (binary DataChannel):
   [16 bytes: fileId] [4 bytes: chunkIndex] [N bytes: chunk data]

4. Receiver ACKs in batches (every 16 chunks):
   { type: 'file-ack', fileId, lastChunk: 47 }

5. Transfer complete:
   { type: 'file-complete', fileId, sha256: '...' }  // receiver verifies

6. Resume: receiver stores { fileId, lastChunk, partialData } in IndexedDB
   On reconnect, sends file-accept with startChunk = lastChunk + 1
```

**Chunk size: 64KB** — WebRTC DataChannels have a ~256KB message limit (browser-dependent). 64KB leaves headroom for overhead and allows reasonable progress granularity. Over Reticulum links (~16MB max), this also works but transfer is slow.

**Confidence: HIGH** — This is standard chunked transfer. The complexity is resume state management and handling peer disconnection mid-transfer.

### Pattern 6: GPS Location Broadcasting

**What:** Peers periodically broadcast their GPS coordinates to the room. Displayed on a map component.

```typescript
interface GPSMessage {
  type: 'gps'
  lat: number       // float64
  lon: number       // float64
  alt?: number      // meters above sea level
  accuracy?: number // meters
  heading?: number  // degrees
  speed?: number    // m/s
  timestamp: number // unix seconds
}

// Broadcast interval: configurable, default 10s when moving, 60s when stationary
// Payload size: ~40 bytes msgpack encoded — fits in Reticulum single packet
// Privacy: opt-in per session, never persisted to disk by default
```

**Map rendering:** Use Leaflet.js with OpenStreetMap tiles. Leaflet is 42KB gzipped, has no dependencies, and works offline with pre-cached tile packs. Peers appear as pins with names, updated in real-time.

**Geolocation source:**
- **Desktop (Electron):** `navigator.geolocation` (Chromium's implementation, uses IP geolocation or system location services)
- **Mobile (Capacitor):** `@capacitor/geolocation` plugin — provides native GPS access with background location on both iOS and Android

**Confidence: HIGH** — Simple broadcast pattern. The main concern is battery life on mobile (background GPS). Use significant-change monitoring rather than continuous polling.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Shared Mutable State Across Transports

**What:** Having the Room Runtime or transports share mutable state objects (peer maps, message queues) without clear ownership.

**Why bad:** Race conditions when WebRTC and Reticulum transports both modify the peer map simultaneously. The Reticulum sidecar operates asynchronously via IPC.

**Instead:** Each transport owns its own peer state. The Room Runtime maintains a *unified view* by copying/merging transport peer lists into its own canonical `Map<string, RoomPeer>`. Transports emit events; Room Runtime reacts.

### Anti-Pattern 2: JSON Over Constrained Links

**What:** Using `JSON.stringify()` for all wire formats, including Reticulum.

**Why bad:** Reticulum's packet MTU is 500 bytes. LXMF overhead is 112 bytes. That leaves 295 bytes for content in a single packet. JSON wastes ~40% of that on key names and string escaping. A chat message that fits in one Reticulum packet as msgpack might require a Link (multi-round-trip) as JSON.

**Instead:** Use msgpack for the wire format. Keep JSON as the internal representation within the app (for IndexedDB, for component state). Serialize to msgpack at the transport boundary.

### Anti-Pattern 3: Tight Coupling to Electron APIs

**What:** Importing `electron` or `net` directly in transport code, making it impossible to test or run on other platforms.

**Why bad:** The app needs to run on Capacitor (mobile) too. If `ServiceBridge` imports `net` directly, it can't run on mobile at all — not even in a degraded mode.

**Instead:** Use platform abstraction. The `ServiceBridge` takes a `TCPSocketFactory` interface parameter. On Electron, this uses `net.createConnection()`. On mobile, it could use a Capacitor plugin or simply be unavailable (with the feature greyed out via capability gating).

### Anti-Pattern 4: Rewriting WebRTCManager

**What:** Scrapping the existing 479-line `WebRTCManager` and writing a new one from scratch as part of the transport abstraction.

**Why bad:** The existing code works. It handles ICE, SDP, renegotiation, speaking detection, screen sharing, and chat sync. Rewriting introduces bugs in proven code for no functional gain.

**Instead:** Wrap it. `WebRTCTransport` delegates to the existing `WebRTCManager` and `SignalingClient`, adapting their callback-based API to the `Transport` interface. The internal implementation is unchanged.

### Anti-Pattern 5: Adopting @capacitor-community/electron for Desktop

**What:** Migrating the Electron app to use `@capacitor-community/electron` as the desktop platform.

**Why bad:** The `@capacitor-community/electron` package is **unmaintained** (last code commit: September 2023, stuck on Electron 26, current Electron is 41). The maintenance badge explicitly says "unmaintained." Migrating to it would lock the project to an abandoned dependency.

**Instead:** Keep the current custom Electron setup for desktop. Use Capacitor only for iOS and Android targets. The shared code is the Preact client — it runs identically in Electron's BrowserWindow and Capacitor's WebView. Platform-specific code (IPC, native modules) is already isolated behind `electronAPI` / Capacitor plugin interfaces.

## Scalability Considerations

| Concern | 5 peers (room) | 50 peers (room) | Cross-transport bridge |
|---------|----------------|-----------------|----------------------|
| WebRTC connections | Full mesh (10 connections) | Impractical full mesh (1225 connections). Need SFU or gossip subgroups | N/A — WebRTC handles its own mesh |
| Reticulum routing | Direct links | RNS handles routing natively, designed for large meshes | Bridge peer relays between transports |
| Message dedup | LRU set, trivial | LRU set, ~10K entries max, fast O(1) lookup | Dedup prevents loops: bridge peer checks `seen` before relaying |
| State sync | Full broadcast | Gossip or vector clocks needed above ~20 peers | Each transport syncs independently; Room Runtime merges |
| File transfer | Direct peer-to-peer | Still peer-to-peer (sender→receiver), doesn't scale with room size | Files only over high-bandwidth transports |
| Service bridge | 1:1 TCP tunnel per service | 1:N possible but each peer gets own stream ID | Services only on WebRTC (bandwidth) |

**Realistic room size:** The current design targets rooms of 2-20 peers. Full mesh WebRTC works well up to ~10-15 peers. Beyond that, selective forwarding (SFU-like peer) or gossip protocols would be needed. This is a future concern, not an initial milestone blocker.

## Suggested Build Order

Based on dependency analysis, the components should be built in this order:

```
Phase 1: Transport Abstraction (foundation — everything depends on this)
  1. Define Transport interface + RoomMessage types
  2. Implement WebRTCTransport (wrapping existing code)
  3. Implement RoomRuntime with single transport
  4. Migrate UI components from rtc singleton → RoomRuntime
  Result: Same functionality, but architecture supports multiple transports

Phase 2: New Data Types (leverage existing WebRTC pipe)
  5. GPS module (small, self-contained, proves the message type system)
  6. File transfer module (chunking, resume, proves binary DataChannel usage)
  7. Service bridge (TCP proxy, proves bidirectional binary streaming)
  Result: All new features working over WebRTC

Phase 3: Reticulum Integration (add second transport)
  8. RNS sidecar Python script (bridge process)
  9. ReticulumTransport (IPC bridge)
  10. Capability-gated features (graceful degradation)
  11. Cross-transport relay (bridge peer)
  Result: Peers on different transports can communicate

Phase 4: Mobile + Attestation (platform expansion)
  12. Capacitor shell (iOS + Android WebView)
  13. Attestation native plugin (C++ liboqs via N-API/JNI/Swift)
  14. Capacitor Geolocation plugin integration
  Result: Cross-platform with optional PQ attestation
```

**Rationale:** Transport abstraction first because every subsequent feature uses it. New data types before Reticulum because they can be built and tested with the existing WebRTC transport. Reticulum after data types because it's the hardest integration (Python sidecar, IPC, constrained MTU) and benefits from having the message format already proven. Mobile last because it has the least technical risk (Capacitor WebView just runs the same Preact app).

## Platform Strategy

### Desktop: Keep Existing Electron

The current Electron setup is custom, working, and modern (Electron 41). The preload bridge pattern is correct. Keep it.

**For native modules (attestation):** Use N-API (Node-API). Build liboqs C++ as a native addon. This gives direct access from the main process. Expose to renderer via IPC handler, same pattern as the existing `uiohook-napi` integration.

### Mobile: Capacitor (iOS + Android)

Use Capacitor v8 for mobile targets. The Preact client runs in the native WebView. Platform-specific functionality goes in Capacitor plugins:

- **Geolocation:** `@capacitor/geolocation` (official plugin)
- **Attestation:** Custom Capacitor plugin wrapping C++ liboqs (JNI on Android, Swift bridging on iOS)
- **Background services:** Custom plugin for background Reticulum (if feasible — see mobile consideration above)

**The web layer is shared:** The same `client/src/` Preact code runs in both Electron's BrowserWindow and Capacitor's WebView. Platform detection (`isElectron`, `isCapacitor`) gates platform-specific features.

### Native Module Architecture (Attestation)

```
                     ┌─────────────────────────────┐
                     │  TypeScript API              │
                     │  attestation.ts              │
                     │  sign(), verify(), chain()   │
                     └─────────────┬───────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
    ┌─────────▼────────┐  ┌───────▼───────┐  ┌─────────▼────────┐
    │  Electron (N-API) │  │  Android (JNI) │  │  iOS (Swift)     │
    │  liboqs.node      │  │  liboqs.so     │  │  liboqs.xcframework│
    │  via node-addon-api│  │  via Capacitor │  │  via Capacitor   │
    │  CMake build       │  │  plugin + JNI  │  │  plugin + C interop│
    └──────────────────┘  └───────────────┘  └──────────────────┘
              │                    │                     │
              └────────────────────┼────────────────────┘
                                   │
                     ┌─────────────▼───────────────┐
                     │  liboqs (C library)          │
                     │  ML-DSA-65, SHA3-256         │
                     │  Cross-compiled per platform │
                     └─────────────────────────────┘
```

## Sources

- Reticulum Network Stack 1.1.4 documentation — "Understanding Reticulum" section: destination model, 500-byte MTU, Link abstraction, encryption by default. **Source: markqvist.github.io/Reticulum/manual/** (HIGH confidence — official documentation)
- Reticulum `Interface` base class source: transport interface pattern with capabilities (bitrate, MTU, mode). **Source: github.com/markqvist/Reticulum** (HIGH confidence — source code)
- LXMF `LXMessage`: 112-byte overhead, 295-byte max single-packet content, OPPORTUNISTIC/DIRECT/PROPAGATED delivery methods. **Source: github.com/markqvist/LXMF** (HIGH confidence — source code)
- Capacitor v8 plugin guides (iOS/Android): Swift `CAPPlugin` + `CAPBridgedPlugin`, Java `@CapacitorPlugin` with `@PluginMethod`. Plugin generator, permission pattern, event emitting. **Source: capacitorjs.com/docs** (HIGH confidence — official docs)
- `@capacitor-community/electron`: **Unmaintained since Sept 2023**, stuck on Electron 26, explicitly marked "unmaintained" in README. Last commit May 2024 (README-only). **Source: github.com/capacitor-community/electron** (HIGH confidence — verified via GitHub API)
- WebRTC DataChannel: 256KB message limit (browser-dependent), ordered/unordered modes, `bufferedAmount` for backpressure. **Source: W3C WebRTC spec + training data** (HIGH confidence)
- libp2p transport abstraction pattern: transport interface with capabilities, multi-transport with unified peer identity. **Source: training data** (MEDIUM confidence — pattern reference, not direct implementation)
- TCP tunneling over WebRTC: Same pattern as SSH port forwarding. Stream multiplexing via stream IDs. Flow control via DataChannel buffering events. **Source: training data + first principles** (MEDIUM confidence — no direct library reference, but pattern is well-understood)

---

*Architecture analysis: 2025-07-15*
