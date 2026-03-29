import { render } from 'preact'
import { useState, useEffect, useCallback } from 'preact/hooks'
import { checkForUpdates } from './lib/updater'
import { ptt } from './lib/ptt'
import * as ipc from './lib/ipc'
import { signaling } from './lib/signaling'
import { rtc } from './lib/webrtc'
import { loadRooms, saveRooms, encodeInvite, decodeInvite, saveDisplayName, loadDisplayName, loadSignalingUrl } from './lib/store'
import { Sidebar } from './components/Sidebar'
import { Chat } from './components/Chat'
import { Voice } from './components/Voice'
import { Settings } from './components/Settings'
import type { User, Room } from './lib/store'

export interface PeerEntry { id: string; name: string }

function Welcome({ user }: { user: User | null }) {
  return (
    <column class="welcome-container" {...{"align-^": "center", "align-$": "center", "self-~": "grow"}} style="padding: 2lh 4ch; text-align: center; color: var(--foreground2)">
      <strong style="color: var(--foreground0); font-size: 1.2em">Welcome{user ? `, ${user.display_name}` : ''}</strong>
      <p>Host a room or join one with an invite to get started.</p>
      <column gap-="0" style="margin-top: 1lh; text-align: left; font-size: 0.85em; line-height: 1.8; color: var(--foreground1)">
        <strong style="color: var(--foreground0)">Quick Start</strong>
        <span>1. Host a room from the sidebar</span>
        <span>2. Share the invite code with a friend</span>
        <span>3. Talk!</span>
      </column>
      <row gap-="1" {...{"align-^": "center"}} style="margin-top: 1lh; font-size: 0.75em; color: var(--foreground2)">
        <span is-="badge" variant-="foreground0" size-="small">⇪</span>
        <span>push-to-talk</span>
      </row>
      <span style="margin-top: 0.5lh; font-size: 0.8em; color: var(--foreground2)">P2P — your data never leaves your devices</span>
    </column>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [rooms, setRooms] = useState<Room[]>(loadRooms())
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [ready, setReady] = useState(false)
  const [peers, setPeers] = useState<PeerEntry[]>([])
  const [signalingConnected, setSignalingConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  useEffect(() => {
    checkForUpdates()
    ptt.init()

    let cancelled = false
    ;(async () => {
      try {
        const identity = await ipc.getIdentity()
        if (cancelled) return

        let displayName = identity.display_name
        const saved = loadDisplayName()
        if (saved && saved !== displayName) {
          try {
            await ipc.setDisplayName(saved)
            displayName = saved
          } catch {}
        }

        setUser({ peer_id: identity.peer_id, display_name: displayName })
        rtc.init(identity.peer_id)
        setReady(true)
      } catch (e) {
        console.error('Failed to get identity:', e)
      }
    })()

    const onPeers = (msg: any) => {
      setPeers((msg.peers ?? []).map((p: any) => ({ id: p.id, name: p.name })))
    }
    const onPeerJoined = (msg: any) => {
      if (msg.peer) setPeers(prev => [...prev, { id: msg.peer.id, name: msg.peer.name }])
    }
    const onPeerLeft = (msg: any) => {
      if (msg.peer_id) setPeers(prev => prev.filter(p => p.id !== msg.peer_id))
    }
    const onKicked = () => {
      signaling.disconnect()
      setPeers([])
      alert('You were kicked from the room.')
    }

    const onConnected = () => setSignalingConnected(true)
    const onDisconnected = () => setSignalingConnected(false)

    signaling.on('peers', onPeers)
    signaling.on('peer_joined', onPeerJoined)
    signaling.on('peer_left', onPeerLeft)
    signaling.on('kicked', onKicked)
    signaling.on('_connected', onConnected)
    signaling.on('_disconnected', onDisconnected)

    return () => {
      cancelled = true
      ptt.destroy()
      rtc.destroy()
      signaling.off('peers', onPeers)
      signaling.off('peer_joined', onPeerJoined)
      signaling.off('peer_left', onPeerLeft)
      signaling.off('kicked', onKicked)
      signaling.off('_connected', onConnected)
      signaling.off('_disconnected', onDisconnected)
    }
  }, [])

  const persistRooms = useCallback((next: Room[]) => {
    setRooms(next)
    saveRooms(next)
  }, [])

  const connectAndJoin = useCallback(async (roomId: string, peerId: string, name: string) => {
    signaling.disconnect()
    signaling.connect(loadSignalingUrl())
    await signaling.waitForConnect()
    signaling.joinRoom(roomId, peerId, name)
  }, [])

  const handleHostRoom = useCallback(async (name: string): Promise<string | null> => {
    if (!user) return null
    setShowSettings(false)
    setConnecting(true)
    try {
      const roomId = crypto.randomUUID()
      const invite = encodeInvite(roomId, name)

      await connectAndJoin(roomId, user.peer_id, user.display_name)

      const room: Room = { name, invite, hosting: true }
      persistRooms([...rooms, room])
      setCurrentRoom(room)
      rtc.currentRoomInvite = room.invite
      return invite
    } catch (e) {
      console.error('Failed to host room:', e)
      return null
    } finally {
      setConnecting(false)
    }
  }, [user, rooms, persistRooms, connectAndJoin])

  const handleJoinRoom = useCallback(async (invite: string) => {
    if (!user) return
    const decoded = decodeInvite(invite)
    if (!decoded) {
      console.error('Invalid invite code')
      return
    }
    setShowSettings(false)
    setConnecting(true)
    try {
      await connectAndJoin(decoded.room, user.peer_id, user.display_name)

      const room: Room = { name: decoded.name || decoded.room.slice(0, 8), invite, hosting: false }
      const exists = rooms.some(r => r.invite === invite)
      if (!exists) persistRooms([...rooms, room])
      setCurrentRoom(room)
      rtc.currentRoomInvite = room.invite
    } catch (e) {
      console.error('Failed to join room:', e)
    } finally {
      setConnecting(false)
    }
  }, [user, rooms, persistRooms, connectAndJoin])

  const handleSelectRoom = useCallback(async (room: Room) => {
    if (!user) return
    const decoded = decodeInvite(room.invite)
    if (!decoded) return

    setShowSettings(false)
    await connectAndJoin(decoded.room, user.peer_id, user.display_name)
    setCurrentRoom(room)
    rtc.currentRoomInvite = room.invite
  }, [user, connectAndJoin])

  const handleLeaveRoom = useCallback(async (room: Room) => {
    signaling.leave()
    signaling.disconnect()

    persistRooms(rooms.filter(r => r.invite !== room.invite))
    if (currentRoom?.invite === room.invite) {
      setCurrentRoom(null)
      setPeers([])
    }
  }, [rooms, currentRoom, persistRooms])

  const handleKickPeer = useCallback((peerId: string) => {
    signaling.kick(peerId)
  }, [])

  const handleDisplayNameChange = useCallback(async (name: string) => {
    try {
      await ipc.setDisplayName(name)
      saveDisplayName(name)
      setUser(prev => {
        if (prev) rtc.sendNameChange(prev.peer_id, name)
        return prev ? { ...prev, display_name: name } : prev
      })
    } catch (e) {
      console.error('Failed to set display name:', e)
    }
  }, [])

  if (!ready) {
    return (
      <column {...{"align-^": "center", "align-$": "center"}} style="height: 100vh">
        <strong>Initializing...</strong>
        <span style="color: var(--foreground2)">Setting up P2P identity</span>
      </column>
    )
  }

  return (
    <row class="app-layout" style="height: 100vh; overflow: hidden">
      <Sidebar
        rooms={rooms}
        currentRoom={currentRoom}
        peers={peers}
        onSelectRoom={handleSelectRoom}
        onHostRoom={handleHostRoom}
        onJoinRoom={handleJoinRoom}
        onLeaveRoom={handleLeaveRoom}
        onKickPeer={handleKickPeer}
        user={user}
        onSettings={() => setShowSettings(true)}
        connected={signalingConnected}
        connecting={connecting}
      />
      <column class="main-content" {...{"self-~": "grow"}} style="min-width: 0; overflow: hidden">
        {showSettings ? (
          <Settings
            user={user}
            onClose={() => setShowSettings(false)}
            onDisplayNameChange={handleDisplayNameChange}
          />
        ) : currentRoom ? (
          <row class="content-row" {...{"self-~": "grow"}} style="overflow: hidden">
            <Chat room={currentRoom} user={user} />
            <Voice />
          </row>
        ) : (
          <Welcome user={user} />
        )}
      </column>
    </row>
  )
}

render(<App />, document.getElementById('app')!)
