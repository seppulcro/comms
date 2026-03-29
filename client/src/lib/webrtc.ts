import { signaling } from './signaling'
import { store } from './store'
import { loadMessages } from './chatdb'
import { isElectron } from './platform'

type MessageHandler = (peerId: string, data: any) => void
type TrackHandler = (peerId: string, stream: MediaStream, kind: 'audio' | 'video') => void
type PeerChangeHandler = () => void

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.relay.metered.ca:80' },
  ],
  iceCandidatePoolSize: 2,
}

export interface PeerInfo {
  id: string
  name: string
  connection: RTCPeerConnection
  chatChannel: RTCDataChannel | null
  audioStream: MediaStream | null
  speaking: boolean
  locallyMuted: boolean
  inVoice: boolean
}

class WebRTCManager {
  private peers: Map<string, PeerInfo> = new Map()
  private localAudioStream: MediaStream | null = null
  private screenStream: MediaStream | null = null
  private onMessage: MessageHandler | null = null
  onTrack: TrackHandler | null = null
  private onPeerChange: PeerChangeHandler | null = null
  private myPeerId: string = ''
  private audioContext: AudioContext | null = null
  private speakingInterval: ReturnType<typeof setInterval> | null = null
  localSpeaking: boolean = false
  localMuted: boolean = false
  currentRoomInvite: string = ''
  private _lastMsgTime = 0
  private _msgCount = 0
  private readonly MSG_RATE_LIMIT = 20

  setMessageHandler(handler: MessageHandler) { this.onMessage = handler }
  setTrackHandler(handler: TrackHandler) { this.onTrack = handler }
  setPeerChangeHandler(handler: PeerChangeHandler) { this.onPeerChange = handler }

  init(myPeerId: string) {
    this.myPeerId = myPeerId

    signaling.on('peers', (msg) => {
      for (const peer of msg.peers) {
        this.createPeerConnection(peer.id, peer.name, true)
      }
    })

    signaling.on('peer_joined', (_msg) => {
      // New peer joined — they will send us an offer (they initiate from "peers" list)
    })

    signaling.on('peer_left', (msg) => {
      this.removePeer(msg.peer_id)
    })

    signaling.on('signal', async (msg) => {
      const { from, data } = msg
      let peer = this.peers.get(from)

      if (data.type === 'offer') {
        if (!peer) {
          this.createPeerConnection(from, data.name || 'Unknown', false)
          peer = this.peers.get(from)!
        }
        await peer.connection.setRemoteDescription(new RTCSessionDescription(data.sdp))
        const answer = await peer.connection.createAnswer()
        await peer.connection.setLocalDescription(answer)
        signaling.signal(from, { type: 'answer', sdp: answer })
      } else if (data.type === 'answer') {
        if (peer) {
          await peer.connection.setRemoteDescription(new RTCSessionDescription(data.sdp))
        }
      } else if (data.type === 'ice') {
        if (peer) {
          await peer.connection.addIceCandidate(new RTCIceCandidate(data.candidate))
        }
      }
    })
  }

  private createPeerConnection(peerId: string, name: string, initiator: boolean) {
    const pc = new RTCPeerConnection(ICE_CONFIG)
    const peerInfo: PeerInfo = {
      id: peerId,
      name,
      connection: pc,
      chatChannel: null,
      audioStream: null,
      speaking: false,
      locallyMuted: false,
      inVoice: false,
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        signaling.signal(peerId, { type: 'ice', candidate: e.candidate.toJSON() })
      }
    }

    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track])
      const kind = e.track.kind === 'video' ? 'video' : 'audio'
      if (kind === 'audio') {
        peerInfo.audioStream = stream
        if (this._inVoice) {
          this.playAudioStream(peerId, stream)
        }
        this.monitorSpeaking(peerInfo, stream)
      }
      this.onTrack?.(peerId, stream, kind as 'audio' | 'video')
    }

    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach(t => pc.addTrack(t, this.localAudioStream!))
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => pc.addTrack(t, this.screenStream!))
    }

    if (initiator) {
      const dc = pc.createDataChannel('chat')
      peerInfo.chatChannel = dc
      this.setupDataChannel(dc, peerId)
    } else {
      pc.ondatachannel = (e) => {
        peerInfo.chatChannel = e.channel
        this.setupDataChannel(e.channel, peerId)
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.removePeer(peerId)
      }
    }

    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        signaling.signal(peerId, { type: 'offer', sdp: offer, name: peerInfo.name })
      } catch (e) {
        console.error('Renegotiation failed:', e)
      }
    }

    this.peers.set(peerId, peerInfo)
    this.onPeerChange?.()

    // For initiators, onnegotiationneeded fires from createDataChannel + addTrack
    // but we also explicitly create an initial offer to ensure connection starts
    if (initiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer).then(() => {
          signaling.signal(peerId, { type: 'offer', sdp: offer, name })
        }).catch(e => console.error('setLocalDescription failed:', e))
      }).catch(e => console.error('createOffer failed:', e))
    }
  }

  private setupDataChannel(dc: RTCDataChannel, peerId: string) {
    dc.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'voice-state') {
          const peer = this.peers.get(peerId)
          if (peer) {
            peer.inVoice = data.inVoice
            this.onPeerChange?.()
          }
          // Still forward to app-level handler for sound effects
        } else if (data.type === 'name-change') {
          const peer = this.peers.get(data.peer_id)
          if (peer) {
            peer.name = data.name
            this.onPeerChange?.()
          }
        }
        this.onMessage?.(peerId, data)
      } catch {}
    }
    dc.onopen = () => {
      // Sync voice state
      if (this._inVoice) {
        dc.send(JSON.stringify({ type: 'voice-state', inVoice: true }))
      }
      // Sync chat history to new peer (async, skip large image messages to stay under DC limits)
      if (this.currentRoomInvite) {
        loadMessages(this.currentRoomInvite).then(history => {
          if (history.length === 0 || dc.readyState !== 'open') return
          // Filter out image-heavy messages for sync (>10KB content), send last 200 text msgs
          const syncable = history
            .filter(m => m.content.length < 10_000)
            .slice(-200)
          if (syncable.length === 0) return
          // Chunk if needed — DC max message ~256KB
          const json = JSON.stringify({ type: 'chat-history', messages: syncable })
          if (json.length < 200_000) {
            dc.send(json)
          } else {
            // Send in smaller batches
            for (let i = 0; i < syncable.length; i += 50) {
              const chunk = syncable.slice(i, i + 50)
              dc.send(JSON.stringify({ type: 'chat-history', messages: chunk }))
            }
          }
        }).catch(() => {})
      }
      this.onPeerChange?.()
    }
  }

  private _inVoice = false

  get inVoice() { return this._inVoice }

  setInVoice(v: boolean) {
    this._inVoice = v
    if (v) {
      for (const [peerId, peer] of this.peers) {
        if (peer.audioStream) {
          this.playAudioStream(peerId, peer.audioStream)
        }
      }
    } else {
      document.querySelectorAll('audio[data-peer-id]').forEach((el) => {
        (el as HTMLAudioElement).pause();
        (el as HTMLAudioElement).srcObject = null;
        el.remove();
      })
    }
  }

  sendNameChange(peerId: string, newName: string) {
    const json = JSON.stringify({ type: 'name-change', peer_id: peerId, name: newName })
    for (const peer of this.peers.values()) {
      if (peer.chatChannel?.readyState === 'open') {
        peer.chatChannel.send(json)
      }
    }
  }

  broadcastVoiceState(inVoice: boolean) {
    this._inVoice = inVoice
    const json = JSON.stringify({ type: 'voice-state', inVoice })
    for (const peer of this.peers.values()) {
      if (peer.chatChannel?.readyState === 'open') {
        peer.chatChannel.send(json)
      }
    }
  }

  sendChat(message: { id: string; from_id: string; from_name: string; content: string; timestamp: number }) {
    const now = Date.now()
    if (now - this._lastMsgTime > 1000) {
      this._msgCount = 0
      this._lastMsgTime = now
    }
    if (++this._msgCount > this.MSG_RATE_LIMIT) return

    const json = JSON.stringify({ type: 'chat', ...message })
    if (json.length > 100_000) {
      console.warn('Message too large, dropping')
      return
    }
    for (const peer of this.peers.values()) {
      if (peer.chatChannel?.readyState === 'open') {
        peer.chatChannel.send(json)
      }
    }
  }

  async initMicrophone(deviceId?: string): Promise<MediaStream> {
    if (this.localAudioStream) return this.localAudioStream
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
    if (deviceId && deviceId !== 'default') {
      audioConstraints.deviceId = { exact: deviceId }
    }
    const constraints: MediaStreamConstraints = { audio: audioConstraints }
    this.localAudioStream = await navigator.mediaDevices.getUserMedia(constraints)
    // PTT default muted
    this.localAudioStream.getAudioTracks().forEach(t => t.enabled = false)
    this.startSpeakingDetection()
    this.addTracksToExistingPeers()
    return this.localAudioStream
  }

  private playAudioStream(peerId: string, stream: MediaStream) {
    // Remove any existing audio element for this peer
    document.querySelector(`audio[data-peer-id="${peerId}"]`)?.remove()
    const audio = document.createElement('audio')
    audio.setAttribute('data-peer-id', peerId)
    audio.srcObject = stream
    audio.autoplay = true
    // Apply output device if configured
    const outputDevice = store.settings.audioOutputDevice
    if (outputDevice && outputDevice !== 'default' && typeof (audio as any).setSinkId === 'function') {
      (audio as any).setSinkId(outputDevice).catch(() => {})
    }
    audio.style.display = 'none'
    document.body.appendChild(audio)
  }

  private monitorSpeaking(peerInfo: PeerInfo, stream: MediaStream) {
    if (!this.audioContext) this.audioContext = new AudioContext()
    const source = this.audioContext.createMediaStreamSource(stream)
    const analyser = this.audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const check = () => {
      if (!this.peers.has(peerInfo.id)) return
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length
      const wasSpeaking = peerInfo.speaking
      peerInfo.speaking = avg > store.settings.voiceThreshold
      if (wasSpeaking !== peerInfo.speaking) this.onPeerChange?.()
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }

  private startSpeakingDetection() {
    if (!this.localAudioStream || this.speakingInterval) return
    if (!this.audioContext) this.audioContext = new AudioContext()
    const source = this.audioContext.createMediaStreamSource(this.localAudioStream)
    const analyser = this.audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const check = () => {
      if (!this.localAudioStream) return
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length
      const was = this.localSpeaking
      this.localSpeaking = avg > store.settings.voiceThreshold
      if (was !== this.localSpeaking) this.onPeerChange?.()
      this.speakingInterval = requestAnimationFrame(check) as any
    }
    requestAnimationFrame(check)
  }

  addTracksToExistingPeers() {
    if (!this.localAudioStream) return
    for (const peer of this.peers.values()) {
      const senders = peer.connection.getSenders()
      const alreadyAdded = senders.some(s => s.track && this.localAudioStream!.getTracks().includes(s.track))
      if (!alreadyAdded) {
        this.localAudioStream.getTracks().forEach(t => {
          peer.connection.addTrack(t, this.localAudioStream!)
        })
      }
    }
  }

  private notifyTrayMicState(active: boolean) {
    if (isElectron) window.electronAPI.setMicState(active)
  }

  toggleLocalMute(): boolean {
    this.localMuted = !this.localMuted
    this.localAudioStream?.getAudioTracks().forEach(t => t.enabled = !this.localMuted)
    this.notifyTrayMicState(!this.localMuted)
    this.onPeerChange?.()
    return this.localMuted
  }

  togglePeerMute(peerId: string): boolean {
    const peer = this.peers.get(peerId)
    if (!peer) return false
    peer.locallyMuted = !peer.locallyMuted
    const el = document.querySelector(`audio[data-peer-id="${peerId}"]`) as HTMLAudioElement | null
    if (el) el.muted = peer.locallyMuted
    this.onPeerChange?.()
    return peer.locallyMuted
  }

  setMicEnabled(enabled: boolean) {
    if (this.localMuted) return
    this.localAudioStream?.getAudioTracks().forEach(t => t.enabled = enabled)
    this.notifyTrayMicState(enabled)
  }

  async startScreenShare(): Promise<MediaStream> {
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    for (const peer of this.peers.values()) {
      this.screenStream.getTracks().forEach(t => {
        peer.connection.addTrack(t, this.screenStream!)
      })
    }
    this.screenStream.getVideoTracks()[0].onended = () => {
      this.stopScreenShare()
    }
    return this.screenStream
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop())
      this.screenStream = null
    }
  }

  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values())
  }

  getConnectedPeerCount(): number {
    let count = 0
    for (const peer of this.peers.values()) {
      if (peer.connection.connectionState === 'connected') count++
    }
    return count
  }

  private removePeer(peerId: string) {
    const peer = this.peers.get(peerId)
    if (peer) {
      peer.connection.close()
      document.querySelector(`audio[data-peer-id="${peerId}"]`)?.remove()
      this.peers.delete(peerId)
      this.onPeerChange?.()
    }
  }

  setAudioOutputDevice(deviceId: string) {
    for (const peer of this.peers.values()) {
      if (peer.audioStream) {
        const audioElements = document.querySelectorAll('audio[data-peer-id]') as NodeListOf<HTMLAudioElement>
        for (const el of audioElements) {
          if (typeof (el as any).setSinkId === 'function') {
            (el as any).setSinkId(deviceId).catch(() => {})
          }
        }
      }
    }
  }

  destroy() {
    for (const peer of this.peers.values()) {
      peer.connection.close()
    }
    this.peers.clear()
    // Clean up all peer audio elements
    document.querySelectorAll('audio[data-peer-id]').forEach(el => {
      (el as HTMLAudioElement).pause();
      (el as HTMLAudioElement).srcObject = null;
      el.remove();
    })
    this.localAudioStream?.getTracks().forEach(t => t.stop())
    this.localAudioStream = null
    this.localSpeaking = false
    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
    this.stopScreenShare()
    signaling.disconnect()
  }
}

export const rtc = new WebRTCManager()
