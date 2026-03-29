import { test, expect, describe, beforeAll, afterAll } from 'bun:test'

// Integration test: spin up a minimal signaling relay and test the full
// WebSocket signaling + invite flow end-to-end.

type WS = import('bun').ServerWebSocket<{ id: string }>

interface Room {
  peers: Map<string, WS>
}

let server: ReturnType<typeof Bun.serve>
let port: number
const rooms = new Map<string, Room>()

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req, server) {
      if (server.upgrade(req, { data: { id: '' } })) return
      return new Response('Not a WebSocket', { status: 400 })
    },
    websocket: {
      message(ws: WS, raw) {
        const msg = JSON.parse(raw as string)
        switch (msg.type) {
          case 'join': {
            ws.data.id = msg.peer_id
            const room = rooms.get(msg.room) ?? { peers: new Map() }
            // Send peer list to joiner
            const peers = [...room.peers.entries()].map(([id, _]) => ({ id, name: 'test' }))
            ws.send(JSON.stringify({ type: 'peers', peers }))
            // Notify existing peers
            for (const [, peer] of room.peers) {
              peer.send(JSON.stringify({ type: 'peer_joined', peer: { id: msg.peer_id, name: msg.name } }))
            }
            room.peers.set(msg.peer_id, ws)
            rooms.set(msg.room, room)
            break
          }
          case 'signal': {
            // Find target peer across all rooms and forward
            for (const room of rooms.values()) {
              const target = room.peers.get(msg.to)
              if (target) {
                target.send(JSON.stringify({ type: 'signal', from: ws.data.id, data: msg.data }))
                break
              }
            }
            break
          }
          case 'leave': {
            for (const [roomId, room] of rooms.entries()) {
              if (room.peers.has(ws.data.id)) {
                room.peers.delete(ws.data.id)
                for (const [, peer] of room.peers) {
                  peer.send(JSON.stringify({ type: 'peer_left', peer_id: ws.data.id }))
                }
                if (room.peers.size === 0) rooms.delete(roomId)
                break
              }
            }
            break
          }
        }
      },
      close(ws: WS) {
        for (const [roomId, room] of rooms.entries()) {
          if (room.peers.has(ws.data.id)) {
            room.peers.delete(ws.data.id)
            for (const [, peer] of room.peers) {
              peer.send(JSON.stringify({ type: 'peer_left', peer_id: ws.data.id }))
            }
            if (room.peers.size === 0) rooms.delete(roomId)
            break
          }
        }
      },
    },
  })
  port = server.port
})

afterAll(() => {
  server.stop(true)
})

function connectWS(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`)
    ws.onopen = () => resolve(ws)
    ws.onerror = () => reject(new Error('WS connection failed'))
  })
}

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

describe('signaling relay integration', () => {
  test('peer joins room and receives empty peer list', async () => {
    const ws = await connectWS()
    ws.send(JSON.stringify({ type: 'join', room: 'room-1', peer_id: 'alice', name: 'Alice' }))
    const msg = await waitForMessage(ws, 'peers')
    expect(msg.peers).toEqual([])
    ws.close()
  })

  test('second peer sees first in peer list', async () => {
    const alice = await connectWS()
    alice.send(JSON.stringify({ type: 'join', room: 'room-2', peer_id: 'alice', name: 'Alice' }))
    await waitForMessage(alice, 'peers')

    const bob = await connectWS()
    bob.send(JSON.stringify({ type: 'join', room: 'room-2', peer_id: 'bob', name: 'Bob' }))
    const peersMsg = await waitForMessage(bob, 'peers')
    expect(peersMsg.peers).toHaveLength(1)
    expect(peersMsg.peers[0].id).toBe('alice')

    alice.close()
    bob.close()
  })

  test('existing peer notified when new peer joins', async () => {
    const alice = await connectWS()
    alice.send(JSON.stringify({ type: 'join', room: 'room-3', peer_id: 'alice', name: 'Alice' }))
    await waitForMessage(alice, 'peers')

    const bob = await connectWS()
    bob.send(JSON.stringify({ type: 'join', room: 'room-3', peer_id: 'bob', name: 'Bob' }))

    const joined = await waitForMessage(alice, 'peer_joined')
    expect(joined.peer.id).toBe('bob')
    expect(joined.peer.name).toBe('Bob')

    alice.close()
    bob.close()
  })

  test('signal messages are forwarded between peers', async () => {
    const alice = await connectWS()
    alice.send(JSON.stringify({ type: 'join', room: 'room-4', peer_id: 'alice', name: 'Alice' }))
    await waitForMessage(alice, 'peers')

    const bob = await connectWS()
    bob.send(JSON.stringify({ type: 'join', room: 'room-4', peer_id: 'bob', name: 'Bob' }))
    await waitForMessage(bob, 'peers')
    // consume peer_joined on alice's side
    await waitForMessage(alice, 'peer_joined')

    // Alice sends an SDP offer to Bob
    const offerData = { type: 'offer', sdp: { type: 'offer', sdp: 'fake-sdp-offer' } }
    alice.send(JSON.stringify({ type: 'signal', to: 'bob', data: offerData }))

    const signal = await waitForMessage(bob, 'signal')
    expect(signal.from).toBe('alice')
    expect(signal.data.type).toBe('offer')
    expect(signal.data.sdp.sdp).toBe('fake-sdp-offer')

    // Bob sends an answer back
    const answerData = { type: 'answer', sdp: { type: 'answer', sdp: 'fake-sdp-answer' } }
    bob.send(JSON.stringify({ type: 'signal', to: 'alice', data: answerData }))

    const answer = await waitForMessage(alice, 'signal')
    expect(answer.from).toBe('bob')
    expect(answer.data.type).toBe('answer')

    alice.close()
    bob.close()
  })

  test('peer_left broadcast on disconnect', async () => {
    const alice = await connectWS()
    alice.send(JSON.stringify({ type: 'join', room: 'room-5', peer_id: 'alice', name: 'Alice' }))
    await waitForMessage(alice, 'peers')

    const bob = await connectWS()
    bob.send(JSON.stringify({ type: 'join', room: 'room-5', peer_id: 'bob', name: 'Bob' }))
    await waitForMessage(bob, 'peers')
    await waitForMessage(alice, 'peer_joined')

    bob.close()
    const left = await waitForMessage(alice, 'peer_left')
    expect(left.peer_id).toBe('bob')

    alice.close()
  })

  test('leave message triggers cleanup', async () => {
    const alice = await connectWS()
    alice.send(JSON.stringify({ type: 'join', room: 'room-6', peer_id: 'alice', name: 'Alice' }))
    await waitForMessage(alice, 'peers')

    const bob = await connectWS()
    bob.send(JSON.stringify({ type: 'join', room: 'room-6', peer_id: 'bob', name: 'Bob' }))
    await waitForMessage(bob, 'peers')
    await waitForMessage(alice, 'peer_joined')

    bob.send(JSON.stringify({ type: 'leave' }))
    const left = await waitForMessage(alice, 'peer_left')
    expect(left.peer_id).toBe('bob')

    alice.close()
    bob.close()
  })

  test('ICE candidate exchange works', async () => {
    const alice = await connectWS()
    alice.send(JSON.stringify({ type: 'join', room: 'room-7', peer_id: 'alice', name: 'Alice' }))
    await waitForMessage(alice, 'peers')

    const bob = await connectWS()
    bob.send(JSON.stringify({ type: 'join', room: 'room-7', peer_id: 'bob', name: 'Bob' }))
    await waitForMessage(bob, 'peers')
    await waitForMessage(alice, 'peer_joined')

    // Simulate ICE candidate exchange
    const candidate = { type: 'ice', candidate: { candidate: 'candidate:1 1 udp 2130706431 192.168.1.1 5000 typ host', sdpMid: '0' } }
    alice.send(JSON.stringify({ type: 'signal', to: 'bob', data: candidate }))

    const iceMsg = await waitForMessage(bob, 'signal')
    expect(iceMsg.data.type).toBe('ice')
    expect(iceMsg.data.candidate.candidate).toContain('192.168.1.1')

    alice.close()
    bob.close()
  })
})
