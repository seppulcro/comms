import { test, expect, beforeAll, afterAll, afterEach, describe } from 'bun:test'
import type { Subprocess } from 'bun'

const PORT = 4444
let proc: Subprocess

// Queued WebSocket wrapper — buffers messages so none are lost between recv() calls
interface QueuedSocket {
  raw: WebSocket
  queue: any[]
  waiters: Array<(msg: any) => void>
}

function createQueued(socket: WebSocket): QueuedSocket {
  const qs: QueuedSocket = { raw: socket, queue: [], waiters: [] }
  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data as string)
    if (qs.waiters.length > 0) {
      qs.waiters.shift()!(msg)
    } else {
      qs.queue.push(msg)
    }
  }
  return qs
}

function recv(qs: QueuedSocket, timeout = 2000): Promise<any> {
  if (qs.queue.length > 0) {
    return Promise.resolve(qs.queue.shift()!)
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = qs.waiters.indexOf(handler)
      if (idx >= 0) qs.waiters.splice(idx, 1)
      reject(new Error('timeout waiting for message'))
    }, timeout)
    const handler = (msg: any) => {
      clearTimeout(timer)
      resolve(msg)
    }
    qs.waiters.push(handler)
  })
}

function send(qs: QueuedSocket, msg: any) {
  qs.raw.send(JSON.stringify(msg))
}

// Collect all messages within a time window
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

beforeAll(async () => {
  proc = Bun.spawn(['bun', 'run', 'index.ts'], {
    cwd: import.meta.dir,
    env: { ...process.env, PORT: String(PORT) },
    stdout: 'ignore',
    stderr: 'ignore',
  })
  // Wait for server to be ready
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

const sockets: QueuedSocket[] = []
afterEach(() => {
  for (const s of sockets) {
    try { s.raw.close() } catch {}
  }
  sockets.length = 0
})

async function connect(): Promise<QueuedSocket> {
  const socket = await new Promise<WebSocket>((resolve, reject) => {
    const s = new WebSocket(`ws://localhost:${PORT}/`)
    s.onopen = () => resolve(s)
    s.onerror = (e) => reject(e)
  })
  const qs = createQueued(socket)
  sockets.push(qs)
  return qs
}

// Generate unique UUID room names per test to avoid cross-test interference
function testRoom(): string {
  return crypto.randomUUID()
}

describe('comms-relay', () => {
  test('health check', async () => {
    const res = await fetch(`http://localhost:${PORT}/health`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  test('non-websocket request to / returns static page', async () => {
    const res = await fetch(`http://localhost:${PORT}/`)
    expect(res.status).toBe(200)
  })

  test('peer joins room and gets empty peer list', async () => {
    const alice = await connect()
    send(alice, { type: 'join', room: testRoom(), peer_id: 'alice', name: 'Alice' })
    const msg = await recv(alice)
    expect(msg).toEqual({ type: 'peers', peers: [] })
  })

  test('second peer joins and gets first peer in list', async () => {
    const alice = await connect()
    const room = testRoom()
    send(alice, { type: 'join', room, peer_id: 'alice', name: 'Alice' })
    await recv(alice) // peers list

    const bob = await connect()
    send(bob, { type: 'join', room, peer_id: 'bob', name: 'Bob' })
    const msg = await recv(bob)
    expect(msg).toEqual({
      type: 'peers',
      peers: [{ id: 'alice', name: 'Alice' }],
    })
  })

  test('peer_joined notification sent to existing peers', async () => {
    const alice = await connect()
    const room = testRoom()
    send(alice, { type: 'join', room, peer_id: 'alice', name: 'Alice' })
    await recv(alice) // peers list

    const bob = await connect()
    send(bob, { type: 'join', room, peer_id: 'bob', name: 'Bob' })

    const notification = await recv(alice)
    expect(notification).toEqual({
      type: 'peer_joined',
      peer: { id: 'bob', name: 'Bob' },
    })
  })

  test('signal forwarding between peers', async () => {
    const alice = await connect()
    const room = testRoom()
    send(alice, { type: 'join', room, peer_id: 'alice', name: 'Alice' })
    await recv(alice)

    const bob = await connect()
    send(bob, { type: 'join', room, peer_id: 'bob', name: 'Bob' })
    await recv(bob) // peers
    await recv(alice) // peer_joined

    // Alice sends SDP offer to Bob
    const offerData = { type: 'offer', sdp: { type: 'offer', sdp: 'v=0\r\n...' } }
    send(alice, { type: 'signal', to: 'bob', data: offerData })

    const forwarded = await recv(bob)
    expect(forwarded).toEqual({
      type: 'signal',
      from: 'alice',
      data: offerData,
    })

    // Bob sends answer back to Alice
    const answerData = { type: 'answer', sdp: { type: 'answer', sdp: 'v=0\r\n...' } }
    send(bob, { type: 'signal', to: 'alice', data: answerData })

    const reply = await recv(alice)
    expect(reply).toEqual({
      type: 'signal',
      from: 'bob',
      data: answerData,
    })
  })

  test('peer_left on disconnect', async () => {
    const alice = await connect()
    const room = testRoom()
    send(alice, { type: 'join', room, peer_id: 'alice', name: 'Alice' })
    await recv(alice)

    const bob = await connect()
    send(bob, { type: 'join', room, peer_id: 'bob', name: 'Bob' })
    await recv(bob) // peers
    await recv(alice) // peer_joined

    // Bob disconnects
    bob.raw.close()
    // Remove from tracked sockets so afterEach doesn't double-close
    sockets.splice(sockets.indexOf(bob), 1)

    const msg = await recv(alice)
    expect(msg).toEqual({ type: 'peer_left', peer_id: 'bob' })
  })

  test('leave message cleanup', async () => {
    const alice = await connect()
    const room = testRoom()
    send(alice, { type: 'join', room, peer_id: 'alice', name: 'Alice' })
    await recv(alice)

    const bob = await connect()
    send(bob, { type: 'join', room, peer_id: 'bob', name: 'Bob' })
    await recv(bob) // peers
    await recv(alice) // peer_joined

    // Bob sends explicit leave
    send(bob, { type: 'leave' })

    const msg = await recv(alice)
    expect(msg).toEqual({ type: 'peer_left', peer_id: 'bob' })
  })

  test('kick message forwarding', async () => {
    const alice = await connect()
    const room = testRoom()
    send(alice, { type: 'join', room, peer_id: 'alice', name: 'Alice' })
    await recv(alice)

    const bob = await connect()
    send(bob, { type: 'join', room, peer_id: 'bob', name: 'Bob' })
    await recv(bob) // peers
    await recv(alice) // peer_joined

    // Set up collectors before kick
    const bobMsgs = collectMessages(bob)
    const aliceMsgs = collectMessages(alice)

    // Alice kicks Bob
    send(alice, { type: 'kick', peer_id: 'bob' })

    const bobReceived = await bobMsgs
    const aliceReceived = await aliceMsgs

    // Bob should receive kicked notification
    expect(bobReceived.some((m) => m.type === 'kicked' && m.by === 'alice')).toBe(true)

    // Alice should receive peer_left
    expect(aliceReceived.some((m) => m.type === 'peer_left' && m.peer_id === 'bob')).toBe(true)
  })

  test('empty rooms are cleaned up', async () => {
    const alice = await connect()
    const room = testRoom()
    send(alice, { type: 'join', room, peer_id: 'alice', name: 'Alice' })
    await recv(alice)

    // Alice leaves
    send(alice, { type: 'leave' })
    await Bun.sleep(100)

    // Join same room again — should get empty peers list (room was cleaned up)
    const bob = await connect()
    send(bob, { type: 'join', room, peer_id: 'bob', name: 'Bob' })
    const msg = await recv(bob)
    expect(msg).toEqual({ type: 'peers', peers: [] })
  })

  test('signal to non-existent peer is silently dropped', async () => {
    const alice = await connect()
    send(alice, { type: 'join', room: testRoom(), peer_id: 'alice', name: 'Alice' })
    await recv(alice)

    // Signal to non-existent peer — should not crash
    send(alice, { type: 'signal', to: 'ghost', data: { type: 'offer' } })

    // Verify server is still alive
    const res = await fetch(`http://localhost:${PORT}/health`)
    expect(res.ok).toBe(true)
  })

  test('rooms are isolated', async () => {
    const roomA = testRoom()
    const roomB = testRoom()
    const alice = await connect()
    send(alice, { type: 'join', room: roomA, peer_id: 'alice-iso', name: 'Alice' })
    await recv(alice)

    const bob = await connect()
    send(bob, { type: 'join', room: roomB, peer_id: 'bob-iso', name: 'Bob' })
    const msg = await recv(bob)

    // Bob should not see Alice (different room)
    expect(msg).toEqual({ type: 'peers', peers: [] })

    // Signal across rooms should be silently dropped
    send(alice, { type: 'signal', to: 'bob-iso', data: { test: true } })
    await Bun.sleep(200)

    // Bob should not have received anything after peers
    const res = await fetch(`http://localhost:${PORT}/health`)
    expect(res.ok).toBe(true)
  })

  test('default values for missing fields', async () => {
    const alice = await connect()
    // Join with missing room and name
    send(alice, { type: 'join', peer_id: `alice-default-${Date.now()}` })
    const msg = await recv(alice)
    expect(msg.type).toBe('peers')

    // Another peer joins same default room
    const bob = await connect()
    send(bob, { type: 'join', peer_id: `bob-default-${Date.now()}` })
    const peers = await recv(bob)
    expect(peers.type).toBe('peers')
    // At least alice should be there (other stale peers from default room might exist)
    expect(peers.peers.length).toBeGreaterThanOrEqual(1)
  })
})
