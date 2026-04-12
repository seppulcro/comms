# Testing Patterns

**Analysis Date:** 2025-07-15

## Test Framework

**Runner:**
- Bun's built-in test runner (`bun:test`)
- No separate test framework (no Jest, Vitest, or Mocha)
- Config: None — Bun test requires no config file, uses convention-based discovery

**Assertion Library:**
- Bun's built-in `expect` from `bun:test`
- Provides Jest-compatible assertions: `expect(x).toBe()`, `expect(x).toEqual()`, `expect(x).toBeNull()`, `expect(x).toMatch()`, `expect(x).toHaveLength()`, `expect(x).toBeGreaterThanOrEqual()`

**Run Commands:**
```bash
# Run all tests (from comms-relay/)
cd comms-relay && bun test

# Run a specific test file
bun test client/src/lib/store.test.ts
bun test comms-relay/index.test.ts
bun test client/src/lib/signaling.integration.test.ts
```

Note: There is no root-level `test` script in the root `package.json`. The `comms-relay/package.json` has `"test": "bun test"`.

## Test File Organization

**Location:**
- Tests are **co-located** with source files

**Naming:**
- Unit tests: `{name}.test.ts` (e.g., `client/src/lib/store.test.ts`)
- Integration tests: `{name}.integration.test.ts` (e.g., `client/src/lib/signaling.integration.test.ts`)
- Server tests: `index.test.ts` (e.g., `comms-relay/index.test.ts`)

**Current Test Files:**
```
client/src/lib/store.test.ts              # Unit tests for invite encode/decode, settings
client/src/lib/signaling.integration.test.ts  # Integration test with in-process signaling server
comms-relay/index.test.ts                 # Integration tests for relay server (spawns subprocess)
```

## Test Structure

**Suite Organization:**
```typescript
// client/src/lib/store.test.ts
import { test, expect, describe, beforeEach } from 'bun:test'

describe('encodeInvite / decodeInvite', () => {
  test('round-trip with name', () => {
    const encoded = encodeInvite(UUID, 'My Room')
    const decoded = decodeInvite(encoded)
    expect(decoded).toEqual({ room: UUID, name: 'My Room' })
  })

  test('decode returns null for garbage input', () => {
    expect(decodeInvite('not-a-valid-invite-code')).toBeNull()
  })
})

describe('signaling URL', () => {
  beforeEach(() => {
    storage.clear()
  })

  test('loadSignalingUrl returns default when not set', () => {
    expect(loadSignalingUrl()).toBe('ws://localhost:4000')
  })
})
```

**Patterns:**
- Group related tests with `describe()` blocks
- Each `test()` has a descriptive name explaining the behavior under test
- Tests are self-contained — no shared mutable state between tests (use `beforeEach` for reset)
- Test names read as specifications: `'round-trip with unicode name'`, `'decode returns null for empty string'`

## Mocking

**Framework:** Manual mocking (no mocking library)

**Pattern: `localStorage` Mock for Browser API Tests:**
```typescript
// client/src/lib/store.test.ts
// Mock localStorage before importing module (module reads localStorage at load time)
const storage = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v) },
  removeItem: (k: string) => { storage.delete(k) },
  clear: () => { storage.clear() },
  get length() { return storage.size },
  key: (i: number) => [...storage.keys()][i] ?? null,
} as Storage

// Dynamic import AFTER mocking — critical for modules with side effects at load
const { encodeInvite, decodeInvite } = await import('./store')
```

**Pattern: `electronAPI` Mock for Browser Testing:**
```typescript
// client/src/mock.ts — loaded via app.html?mock
;(window as any).electronAPI = {
  getIdentity: async () => ({ peer_id: id, display_name: 'TestUser' }),
  setDisplayName: async () => {},
  registerPttKey: async () => {},
  onPttDown: () => {},
  onPttUp: () => {},
  removePttListeners: () => {},
  checkForUpdates: async () => null,
  setMicState: () => {},
  copyToClipboard: (text: string) => navigator.clipboard.writeText(text),
}
```

**What to Mock:**
- Browser globals not available in Bun runtime (`localStorage`, `window.electronAPI`)
- Mock BEFORE dynamic import if module reads globals at load time

**What NOT to Mock:**
- WebSocket connections — use real servers (spawned as subprocess or in-process Bun.serve)
- Pure functions — test directly with real inputs/outputs

## Test Utilities

**QueuedSocket Helper (for WebSocket testing):**
```typescript
// comms-relay/index.test.ts
interface QueuedSocket {
  raw: WebSocket
  queue: any[]
  waiters: Array<(msg: any) => void>
}

function createQueued(socket: WebSocket): QueuedSocket { ... }
function recv(qs: QueuedSocket, timeout = 2000): Promise<any> { ... }
function send(qs: QueuedSocket, msg: any) { ... }
function collectMessages(qs: QueuedSocket, duration = 300): Promise<any[]> { ... }
```

The `QueuedSocket` pattern buffers incoming WebSocket messages so they aren't lost between `recv()` calls. This is the standard approach for WebSocket testing in this codebase.

**waitForMessage Helper (simpler alternative):**
```typescript
// client/src/lib/signaling.integration.test.ts
function waitForMessage(ws: WebSocket, type?: string, timeout = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type ?? 'message'}`)), timeout)
    const handler = (e: MessageEvent) => {
      const msg = JSON.parse(e.data)
      if (!type || msg.type === type) {
        clearTimeout(timer)
        ws.removeEventListener('message', handler)
        resolve(msg)
      }
    }
    ws.addEventListener('message', handler)
  })
}
```

**Test Room Isolation:**
```typescript
// comms-relay/index.test.ts
function testRoom(): string {
  return crypto.randomUUID()
}
```
Use unique room names per test to avoid cross-test interference.

## Integration Test Patterns

**Pattern 1: Spawn Server as Subprocess (real server testing)**
```typescript
// comms-relay/index.test.ts
let proc: Subprocess

beforeAll(async () => {
  proc = Bun.spawn(['bun', 'run', 'index.ts'], {
    cwd: import.meta.dir,
    env: { ...process.env, PORT: String(PORT) },
    stdout: 'ignore',
    stderr: 'ignore',
  })
  // Poll /health until server is ready
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`)
      if (res.ok) return
    } catch {}
    await Bun.sleep(100)
  }
  throw new Error('Server failed to start')
})

afterAll(() => {
  proc.kill()
})
```

**Pattern 2: In-Process Server (faster, lighter)**
```typescript
// client/src/lib/signaling.integration.test.ts
let server: ReturnType<typeof Bun.serve>

beforeAll(() => {
  server = Bun.serve({
    port: 0,  // Auto-assign port
    fetch(req, server) { ... },
    websocket: { message(ws, raw) { ... }, close(ws) { ... } },
  })
  port = server.port
})

afterAll(() => {
  server.stop(true)
})
```

**Cleanup Pattern:**
```typescript
// comms-relay/index.test.ts
const sockets: QueuedSocket[] = []
afterEach(() => {
  for (const s of sockets) {
    try { s.raw.close() } catch {}
  }
  sockets.length = 0
})
```
Track all created WebSocket connections and close them in `afterEach` to prevent resource leaks.

## Test Coverage

**Requirements:** None enforced — no coverage thresholds configured

**Current Coverage:**
- `client/src/lib/store.ts`: Tested — invite encoding/decoding, signaling URL persistence
- `comms-relay/index.ts`: Thoroughly tested — join, leave, signal forwarding, kick, room isolation, rate limiting, default values
- `client/src/lib/signaling.ts`: Indirectly tested via `signaling.integration.test.ts`
- Components (`Chat.tsx`, `Voice.tsx`, `Sidebar.tsx`, `Settings.tsx`): **Not tested**
- `client/src/lib/webrtc.ts`: **Not tested**
- `client/src/lib/ptt.ts`: **Not tested**
- `client/src/lib/chatdb.ts`: **Not tested**
- `electron/main.ts`: **Not tested**

**View Coverage:**
```bash
# Bun does not have built-in coverage reporting
# No coverage tool is configured
```

## Test Types

**Unit Tests:**
- Test pure functions in isolation
- Example: `client/src/lib/store.test.ts` tests `encodeInvite()`, `decodeInvite()`, `saveSignalingUrl()`, `loadSignalingUrl()`
- Mock browser globals when needed (`localStorage`)
- Fast, no I/O

**Integration Tests:**
- Test the full signaling server WebSocket protocol
- `comms-relay/index.test.ts`: Spawns real server subprocess, connects real WebSocket clients, tests full message flow (join → peers → signal → leave)
- `client/src/lib/signaling.integration.test.ts`: Creates in-process Bun.serve WebSocket server, tests peer lifecycle and signal forwarding
- These are the primary test type in the codebase

**E2E Tests:**
- Not used — no Playwright, Cypress, or similar framework

## Common Patterns

**Async Testing:**
```typescript
// All async tests use async/await naturally
test('peer joins room and gets empty peer list', async () => {
  const alice = await connect()
  send(alice, { type: 'join', room: testRoom(), peer_id: 'alice', name: 'Alice' })
  const msg = await recv(alice)
  expect(msg).toEqual({ type: 'peers', peers: [] })
})
```

**Timeout-Based Message Collection:**
```typescript
// Collect all messages within a time window when order/count is uncertain
function collectMessages(qs: QueuedSocket, duration = 300): Promise<any[]> {
  return new Promise((resolve) => {
    const msgs = [...qs.queue]
    qs.queue.length = 0
    const origOnMessage = qs.raw.onmessage
    qs.raw.onmessage = (e) => {
      msgs.push(JSON.parse(e.data as string))
    }
    setTimeout(() => {
      qs.raw.onmessage = origOnMessage
      resolve(msgs)
    }, duration)
  })
}

// Usage:
const bobMsgs = collectMessages(bob)
const aliceMsgs = collectMessages(alice)
send(alice, { type: 'kick', peer_id: 'bob' })
const bobReceived = await bobMsgs
expect(bobReceived.some((m) => m.type === 'kicked' && m.by === 'alice')).toBe(true)
```

**Error/Edge Case Testing:**
```typescript
test('decode returns null for empty string', () => {
  expect(decodeInvite('')).toBeNull()
})

test('decode returns null for garbage input', () => {
  expect(decodeInvite('not-a-valid-invite-code')).toBeNull()
})

test('signal to non-existent peer is silently dropped', async () => {
  const alice = await connect()
  send(alice, { type: 'join', room: testRoom(), peer_id: 'alice', name: 'Alice' })
  await recv(alice)
  send(alice, { type: 'signal', to: 'ghost', data: { type: 'offer' } })
  // Verify server didn't crash
  const res = await fetch(`http://localhost:${PORT}/health`)
  expect(res.ok).toBe(true)
})
```

**Round-Trip Testing:**
```typescript
test('round-trip with unicode name', () => {
  const encoded = encodeInvite(UUID, '🎮 Gaming')
  const decoded = decodeInvite(encoded)
  expect(decoded?.name).toBe('🎮 Gaming')
  expect(decoded?.room).toBe(UUID)
})
```

## Writing New Tests

**For pure utility functions:**
1. Create `{name}.test.ts` next to the source file
2. Import from `bun:test`: `import { test, expect, describe } from 'bun:test'`
3. Mock browser globals if needed BEFORE dynamic `import()`
4. Group with `describe()`, write individual `test()` cases

**For WebSocket/server features:**
1. Add tests to `comms-relay/index.test.ts` using the `QueuedSocket` helpers
2. Use `testRoom()` for unique room names
3. Use `connect()` to get tracked sockets (cleaned up in `afterEach`)
4. Use `recv()` for expected messages, `collectMessages()` for uncertain timing

**For client-side signaling logic:**
1. Add tests to `client/src/lib/signaling.integration.test.ts`
2. Use the in-process `Bun.serve()` WebSocket server pattern
3. Use `connectWS()` and `waitForMessage()` helpers

---

*Testing analysis: 2025-07-15*
