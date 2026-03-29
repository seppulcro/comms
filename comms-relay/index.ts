// comms-relay — lightweight WebRTC signaling server
// Self-hostable. Routes SDP/ICE messages between peers. Never sees actual data.

import type { ServerWebSocket } from 'bun'
import path from 'node:path'

interface PeerInfo {
  id: string
  name: string
}

interface Peer extends PeerInfo {
  ws: ServerWebSocket<PeerData>
  isHost: boolean
}

interface PeerData {
  id: string
  room: string | null
  ip: string
}

const rooms = new Map<string, Map<string, Peer>>()

const MAX_PEERS_PER_ROOM = 50

// --- Per-IP rate limiting ---
const rateLimits = new Map<string, number[]>()

function checkRateLimit(ip: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now()
  const timestamps = (rateLimits.get(ip) || []).filter(t => now - t < windowMs)
  timestamps.push(now)
  rateLimits.set(ip, timestamps)
  return timestamps.length <= max
}

setInterval(() => {
  const now = Date.now()
  for (const [ip, timestamps] of rateLimits) {
    const recent = timestamps.filter(t => now - t < 60_000)
    if (recent.length === 0) rateLimits.delete(ip)
    else rateLimits.set(ip, recent)
  }
}, 300_000)

// --- Room name validation ---
function isValidRoomId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

function getRoom(name: string): Map<string, Peer> {
  let room = rooms.get(name)
  if (!room) {
    room = new Map()
    rooms.set(name, room)
  }
  return room
}

function removePeer(ws: ServerWebSocket<PeerData>) {
  const { id, room: roomName } = ws.data
  if (!roomName || !id) return

  const room = rooms.get(roomName)
  if (!room) return

  room.delete(id)

  // Broadcast peer_left to remaining peers
  const msg = JSON.stringify({ type: 'peer_left', peer_id: id })
  for (const peer of room.values()) {
    peer.ws.send(msg)
  }

  // Clean up empty rooms
  if (room.size === 0) {
    rooms.delete(roomName)
  }

  ws.data.room = null
}

const server = Bun.serve({
  port: parseInt(process.env.PORT || '4000'),
  async fetch(req, server) {
    const url = new URL(req.url)

    if (url.pathname === '/health') {
      return new Response('ok')
    }

    // WebSocket upgrade
    if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const ip = server.requestIP(req)?.address || 'unknown'
      if (server.upgrade(req, { data: { id: '', room: null, ip } })) return
      return new Response('WebSocket upgrade failed', { status: 500 })
    }

    // Static landing page
    const staticDir = import.meta.dir + '/public'
    const filePath = url.pathname === '/' ? '/index.html' : url.pathname
    const resolved = path.resolve(staticDir + filePath)
    if (!resolved.startsWith(path.resolve(staticDir))) {
      return new Response('Forbidden', { status: 403 })
    }
    const file = Bun.file(resolved)
    if (await file.exists()) {
      return new Response(file)
    }

    return new Response('Not Found', { status: 404 })
  },
  websocket: {
    open(ws) {
      if (!checkRateLimit(ws.data.ip)) {
        ws.close(1008, 'Rate limited')
      }
    },
    message(ws, raw) {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw as string)
      } catch {
        return // invalid JSON silently dropped
      }

      switch (msg.type) {
        case 'join': {
          // Clean up previous room if re-joining
          if (ws.data.room) removePeer(ws)

          const roomName = msg.room || 'default'
          const peerId = msg.peer_id || 'unknown'
          const name = msg.name || 'Anonymous'

          // Validate room name (must be UUID or 'default')
          if (roomName !== 'default' && !isValidRoomId(roomName)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid room ID' }))
            ws.close(1008, 'Invalid room ID')
            return
          }

          ws.data.id = peerId
          ws.data.room = roomName

          const room = getRoom(roomName)
          console.log(`[join] peer → room ${roomName} (${room.size + 1} peers)`)

          // Enforce per-room peer limit
          if (room.size >= MAX_PEERS_PER_ROOM) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }))
            ws.close(1008, 'Room is full')
            ws.data.room = null
            return
          }

          // Send existing peers list to joiner
          const peers: PeerInfo[] = []
          for (const peer of room.values()) {
            peers.push({ id: peer.id, name: peer.name })
          }
          ws.send(JSON.stringify({ type: 'peers', peers }))

          // Broadcast peer_joined to existing peers
          const joinedMsg = JSON.stringify({
            type: 'peer_joined',
            peer: { id: peerId, name },
          })
          for (const peer of room.values()) {
            peer.ws.send(joinedMsg)
          }

          // Add joiner to room AFTER broadcasting
          const isHost = room.size === 0
          room.set(peerId, { id: peerId, name, ws, isHost })
          break
        }

        case 'signal': {
          const roomName = ws.data.room
          if (!roomName) return

          const room = rooms.get(roomName)
          if (!room) return

          const target = room.get(msg.to)
          if (!target) {
            return
          }
          console.log(`[signal] relay in room ${roomName}`)

          target.ws.send(
            JSON.stringify({
              type: 'signal',
              from: ws.data.id,
              data: msg.data,
            }),
          )
          break
        }

        case 'kick': {
          const roomName = ws.data.room
          if (!roomName) return

          const room = rooms.get(roomName)
          if (!room) return

          // Only the host can kick
          const kicker = room.get(ws.data.id)
          if (!kicker?.isHost) {
            ws.send(JSON.stringify({ type: 'error', message: 'Only the host can kick' }))
            return
          }

          const target = room.get(msg.peer_id)
          if (!target) return

          // Send kicked notification to target
          target.ws.send(
            JSON.stringify({
              type: 'kicked',
              by: ws.data.id,
            }),
          )

          // Remove target from room and broadcast peer_left
          room.delete(msg.peer_id)
          const leftMsg = JSON.stringify({
            type: 'peer_left',
            peer_id: msg.peer_id,
          })
          for (const peer of room.values()) {
            peer.ws.send(leftMsg)
          }

          // Close kicked peer's connection
          target.ws.close()

          // Clean up empty rooms
          if (room.size === 0) {
            rooms.delete(roomName)
          }
          break
        }

        case 'leave': {
          removePeer(ws)
          break
        }
      }
    },
    close(ws) {
      removePeer(ws)
    },
  },
})

console.log(`comms-relay listening on port ${server.port}`)
