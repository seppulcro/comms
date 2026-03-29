import { useState, useCallback } from 'preact/hooks'
import type { Room, User } from '../lib/store'
import type { PeerEntry } from '../app'

interface SidebarProps {
  rooms: Room[]
  currentRoom: Room | null
  peers: PeerEntry[]
  onSelectRoom: (room: Room) => void
  onHostRoom: (name: string) => Promise<string | null>
  onJoinRoom: (invite: string) => void
  onLeaveRoom: (room: Room) => void
  onKickPeer: (peerId: string) => void
  user: User | null
  onSettings: () => void
  connected: boolean
  connecting: boolean
}

function Nf({ i }: { i: string }) {
  return <span class="nf">{i}</span>
}

export function Sidebar({ rooms, currentRoom, peers, onSelectRoom, onHostRoom, onJoinRoom, onLeaveRoom, onKickPeer, user, onSettings, connected, connecting }: SidebarProps) {
  const [showHost, setShowHost] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [joinInvite, setJoinInvite] = useState('')
  const [createdInvite, setCreatedInvite] = useState<string | null>(null)
  const [roomsCollapsed, setRoomsCollapsed] = useState(false)
  const [usersCollapsed, setUsersCollapsed] = useState(false)

  const handleHost = useCallback(async () => {
    const name = newRoomName.trim()
    if (!name) return
    const invite = await onHostRoom(name)
    if (invite) {
      setCreatedInvite(invite)
      setNewRoomName('')
      copyToClipboard(invite)
      setTimeout(() => {
        setShowHost(false)
        setCreatedInvite(null)
      }, 3000)
    }
  }, [newRoomName, onHostRoom])

  const handleJoin = useCallback(() => {
    const invite = joinInvite.trim()
    if (!invite) return
    onJoinRoom(invite)
    setJoinInvite('')
    setShowJoin(false)
  }, [joinInvite, onJoinRoom])

  const copyToClipboard = useCallback((text: string) => {
    if (window.electronAPI?.copyToClipboard) {
      window.electronAPI.copyToClipboard(text)
    } else {
      navigator.clipboard?.writeText(text).catch(() => {})
    }
  }, [])

  return (
    <nav class="sidebar" box-="square">
      <div class="sidebar-channels">
        {/* ── Host / Join actions ── */}
        <row gap-="1" style="padding: 0.5lh 1ch">
          <button
            variant-="foreground0"
            size-="small"
            onClick={() => { setShowHost(!showHost); setShowJoin(false); setCreatedInvite(null) }}
          >
            <Nf i={"\uf067"} /> Host
          </button>
          <button
            variant-="foreground0"
            size-="small"
            onClick={() => { setShowJoin(!showJoin); setShowHost(false); setCreatedInvite(null) }}
          >
            <Nf i={"\uf061"} /> Join
          </button>
        </row>

        {showHost && (
          <div style="padding: 0.25lh 1ch">
            <input
              is-="input"
              type="text"
              size-="small"
              placeholder="Room name"
              value={newRoomName}
              onInput={(e) => setNewRoomName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Enter' && handleHost()}
              style="width: 100%; margin-bottom: 0.3lh"
            />
            <button size-="small" disabled={connecting} onClick={handleHost}>
              {connecting ? 'Connecting...' : 'Create'}
            </button>
            {createdInvite && (
              <row gap-="1" style="margin-top: 0.5lh; font-size: 0.75em; word-break: break-all" {...{"align-^": "center"}}>
                <span is-="badge" variant-="green"><Nf i={"\uf00c"} /> Hosted!</span>
                <a href="#" onClick={(e) => { e.preventDefault(); copyToClipboard(createdInvite!) }}>
                  <Nf i={"\uf0c5"} /> Copy
                </a>
              </row>
            )}
          </div>
        )}

        {showJoin && (
          <div style="padding: 0.25lh 1ch">
            <input
              is-="input"
              type="text"
              size-="small"
              placeholder="Paste invite code"
              value={joinInvite}
              onInput={(e) => setJoinInvite((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              style="width: 100%; margin-bottom: 0.3lh"
            />
            <button size-="small" disabled={connecting} onClick={handleJoin}>
              {connecting ? 'Connecting...' : 'Join'}
            </button>
          </div>
        )}

        {/* ── Rooms list ── */}
        {rooms.length > 0 && (
          <div class={`sidebar-section ${roomsCollapsed ? 'collapsed' : ''}`} box-="square" shear-="top" style="border-left: none; border-right: none; border-bottom: none">
            <row gap-="1" style="padding: 0 1ch" {...{"align-^": "center"}} onClick={() => setRoomsCollapsed(!roomsCollapsed)}>
              <span class={`sidebar-section-header ${roomsCollapsed ? 'collapsed' : ''}`} is-="badge" variant-="background0"><Nf i={"\uf0e0"} /> Rooms</span>
            </row>
            <ul class="channel-list">
              {rooms.map((room) => (
                <li key={room.invite}>
                  <a
                    href="#"
                    class={`channel-item ${currentRoom?.invite === room.invite ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); onSelectRoom(room) }}
                  >
                    <row gap-="1" style="min-width: 0" {...{"align-^": "center", "self-~": "grow"}}>
                      {room.hosting && <Nf i={"\uf015"} />}
                      <span class="truncate">{room.name}</span>
                      {currentRoom?.invite === room.invite && (
                        <span is-="badge" variant-="green" size-="small" style="font-size: 0.65em">connected</span>
                      )}
                    </row>
                    <span class="room-actions">
                      <button
                        size-="small"
                        aria-label="Copy invite"
                        title="Copy invite"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyToClipboard(room.invite) }}
                      >
                        <Nf i={"\uf0c5"} />
                      </button>
                      <button
                        size-="small"
                        aria-label={`Leave room ${room.name}`}
                        title="Leave room"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onLeaveRoom(room) }}
                      >
                        <Nf i={"\uf00d"} />
                      </button>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Online users in current room ── */}
        {currentRoom && peers.length > 0 && (
          <div class={`sidebar-section ${usersCollapsed ? 'collapsed' : ''}`} box-="square" shear-="top" style="border-left: none; border-right: none; border-bottom: none">
            <row gap-="1" style="padding: 0 1ch" {...{"align-^": "center"}} onClick={() => setUsersCollapsed(!usersCollapsed)}>
              <span class={`sidebar-section-header ${usersCollapsed ? 'collapsed' : ''}`} is-="badge" variant-="background0"><Nf i={"\uf0c0"} /> Online — {currentRoom.name}</span>
            </row>
            <ul class="channel-list">
              {peers.map(p => (
                <li key={p.id}>
                  <span class="channel-item" style="cursor: default">
                    <row gap-="1" {...{"align-^": "center", "self-~": "grow"}} >
                      <span class="dot connected" />
                      <span>{p.name}</span>
                      {p.id === user?.peer_id && <span class="dim">(you)</span>}
                    </row>
                    {currentRoom.hosting && p.id !== user?.peer_id && (
                      <button
                        size-="small"
                        aria-label={`Kick ${p.name}`}
                        title={`Kick ${p.name}`}
                        onClick={() => onKickPeer(p.id)}
                      >
                        <Nf i={"\uf00d"} />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <column class="sidebar-footer" box-="square" shear-="top" style="border-left: none; border-right: none; border-bottom: none; flex-shrink: 0">
 <row gap-="1" style="padding: 0.3lh 1ch" {...{"align-^": "center"}}>
          <span is-="badge" variant-="background0"><Nf i={"\uf007"} /> {user?.display_name || '...'}</span>
        </row>
 <row gap-="1" style="padding: 0.3lh 1ch; font-size: 0.8em" {...{"align-^": "center", "align-$": "between"}}>
          {connected
            ? <span is-="badge" variant-="green" size-="small">● On</span>
            : <span is-="badge" variant-="red" size-="small">○ Off</span>
          }
          <button size-="small" onClick={onSettings} aria-label="Settings" title="Settings">
            <Nf i={"\uf013"} /> Settings
          </button>
        </row>
      </column>
    </nav>
  )
}
