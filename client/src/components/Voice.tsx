import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { rtc } from '../lib/webrtc'
import { store } from '../lib/store'
import { playJoin, playLeave } from '../lib/sounds'
import { ScreenShare } from './ScreenShare'

function Nf({ i }: { i: string }) {
  return <span class="nf">{i}</span>
}

export function Voice() {
  const [joined, setJoined] = useState(false)
  const [peers, setPeers] = useState<{ id: string; name: string; speaking: boolean; locallyMuted: boolean; inVoice: boolean }[]>([])
  const [localSpeaking, setLocalSpeaking] = useState(false)
  const [localMuted, setLocalMuted] = useState(false)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [remoteScreen, setRemoteScreen] = useState<{ peerId: string; name: string; stream: MediaStream } | null>(null)
  const micInitialized = useRef(false)

  useEffect(() => {
    rtc.setPeerChangeHandler(() => {
      setPeers(rtc.getPeers().map(p => ({
        id: p.id, name: p.name, speaking: p.speaking,
        locallyMuted: p.locallyMuted, inVoice: p.inVoice,
      })))
      setLocalSpeaking(rtc.localSpeaking)
      setLocalMuted(rtc.localMuted)
    })

    rtc.onTrack = (peerId: string, stream: MediaStream, kind: 'audio' | 'video') => {
      if (kind === 'video') {
        const peer = rtc.getPeers().find(p => p.id === peerId)
        setRemoteScreen({ peerId, name: peer?.name || peerId, stream })
        stream.getVideoTracks()[0].onended = () => setRemoteScreen(null)
      }
    }

    return () => {
      rtc.setPeerChangeHandler((() => {}) as any)
      rtc.onTrack = null
    }
  }, [])

  const handleJoin = useCallback(async () => {
    try {
      if (!micInitialized.current) {
        await rtc.initMicrophone()
        micInitialized.current = true
      }
      if (store.settings.voiceMode === 'vad') {
        rtc.setMicEnabled(true)
      }
      rtc.addTracksToExistingPeers()
      rtc.broadcastVoiceState(true)
      rtc.setInVoice(true)
      playJoin()
      setJoined(true)
    } catch (e) {
      console.error('Mic access failed:', e)
    }
  }, [])

  const handleLeave = useCallback(() => {
    rtc.setMicEnabled(false)
    rtc.broadcastVoiceState(false)
    rtc.setInVoice(false)
    if (screenStream) {
      rtc.stopScreenShare()
      setScreenStream(null)
    }
    playLeave()
    setJoined(false)
  }, [screenStream])

  const handleShareScreen = useCallback(async () => {
    try {
      const stream = await rtc.startScreenShare()
      setScreenStream(stream)
      stream.getVideoTracks()[0].onended = () => {
        rtc.stopScreenShare()
        setScreenStream(null)
      }
    } catch (e) {
      console.error('Screen share failed:', e)
    }
  }, [])

  const handleStopShare = useCallback(() => {
    rtc.stopScreenShare()
    setScreenStream(null)
  }, [])

  const handleToggleSelfMute = useCallback(() => {
    const muted = rtc.toggleLocalMute()
    setLocalMuted(muted)
  }, [])

  const handleTogglePeerMute = useCallback((peerId: string) => {
    rtc.togglePeerMute(peerId)
  }, [])

  const modeLabel = store.settings.voiceMode === 'ptt' ? 'PTT' : 'VAD'
  const voicePeers = peers.filter(p => p.inVoice)
  const totalInVoice = (joined ? 1 : 0) + voicePeers.length
  const compact = totalInVoice > 6

  function TileFull({ icon, name, classes, onClick, title: tTitle }: { icon: string; name: string; classes: string; onClick?: () => void; title?: string }) {
    return (
      <div class={`voice-tile ${classes}`} box-="square" onClick={onClick} title={tTitle} style={onClick ? 'cursor: pointer' : ''}>
        <column gap-="0" style="padding: 0.5lh 1ch" {...{"align-^": "center"}}>
          <div class="tile-icon"><Nf i={icon} /></div>
          <div class="tile-username">{name}</div>
        </column>
      </div>
    )
  }

  function TileCompact({ icon, name, classes, onClick, title: tTitle }: { icon: string; name: string; classes: string; onClick?: () => void; title?: string }) {
    return (
      <row
        class={`voice-tile-compact ${classes}`}
        gap-="1"
        {...{"align-^": "center"}}
        onClick={onClick}
        title={tTitle}
        style={onClick ? 'cursor: pointer' : ''}
      >
        <span class="nf" style="width: 2ch; text-align: center">{icon}</span>
        <span class="tile-username truncate">{name}</span>
      </row>
    )
  }

  const Tile = compact ? TileCompact : TileFull

  return (
    <column class="voice-container" box-="square">
      {(screenStream || remoteScreen) && (
        <ScreenShare
          stream={screenStream || remoteScreen!.stream}
          sharingUser={screenStream ? 'You' : remoteScreen!.name}
          isLocal={!!screenStream}
          onStop={screenStream ? handleStopShare : undefined}
        />
      )}
 <row gap-="1" shear-="top" style="padding: 0 1ch; flex-shrink: 0" {...{"align-^": "center", "align-$": "between"}}>
 <span is-="badge" variant-="background0"><Nf i={'\uf028'} /> Voice</span>
 <row gap-="1" {...{"align-^": "center"}} >
          <span is-="badge" variant-={joined ? 'green' : 'red'} size-="small">
            {joined ? `● ${voicePeers.length + 1}` : '○'}
          </span>
          <span is-="badge" variant-="background0" size-="small">{modeLabel}</span>
        </row>
      </row>

 <column class="voice-grid" style="padding: 0.5lh 1ch; overflow-y: auto" gap-="1" {...{"self-~": "grow"}}>
        {joined && (
          <Tile
            icon={localMuted ? '\uf131' : '\uf130'}
            name={`You${localMuted ? ' (muted)' : ''}`}
            classes={`${localSpeaking && !localMuted ? 'speaking' : ''} ${localMuted ? 'muted' : ''}`}
            onClick={handleToggleSelfMute}
            title={localMuted ? 'Click to unmute' : 'Click to mute'}
          />
        )}
        {joined && voicePeers.map(p => (
          <Tile
            key={p.id}
            icon={p.locallyMuted ? '\uf026' : '\uf025'}
            name={`${p.name}${p.locallyMuted ? ' (muted)' : ''}`}
            classes={`${p.speaking && !p.locallyMuted ? 'speaking' : ''} ${p.locallyMuted ? 'muted' : ''}`}
            onClick={() => handleTogglePeerMute(p.id)}
            title={p.locallyMuted ? `Click to unmute ${p.name}` : `Click to mute ${p.name}`}
          />
        ))}
        {!joined && (
          <div class="voice-tile" box-="square">
 <column gap-="0" style="padding: 0.5lh 1ch" {...{"align-^": "center"}}>
              <div class="tile-icon"><Nf i={'\uf130'} /></div>
              <div class="tile-username">Join voice to talk</div>
              <div class="tile-status">{store.settings.voiceMode === 'ptt' ? 'Push-to-Talk' : 'Voice Activated'}</div>
            </column>
          </div>
        )}
      </column>

 <row class="voice-controls" gap-="1" style="padding: 0.5lh 1ch; flex-shrink: 0" {...{"align-$": "center"}}>
        {!joined ? (
          <button variant-="green" onClick={handleJoin}><Nf i={'\uf130'} /> Join Voice</button>
        ) : (
          <>
            <button variant-="red" onClick={handleLeave}><Nf i={'\uf028'} /> Leave</button>
            {!screenStream ? (
              <button variant-="blue" onClick={handleShareScreen}><Nf i={'\uf108'} /> Share</button>
            ) : (
              <button variant-="red" onClick={handleStopShare}><Nf i={'\uf04d'} /> Stop</button>
            )}
          </>
        )}
      </row>
    </column>
  )
}
