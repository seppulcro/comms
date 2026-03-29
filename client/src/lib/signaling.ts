export interface SignalingMessage {
  type: string
  [key: string]: unknown
}

type Listener = (data: SignalingMessage) => void

export class SignalingClient {
  private ws: WebSocket | null = null
  private listeners: Map<string, Set<Listener>> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private shouldReconnect = true
  private epoch = 0 // incremented on each connect to invalidate stale handlers

  connect(url: string) {
    if (this.ws?.readyState === WebSocket.OPEN) return
    this.cleanup()
    this.shouldReconnect = true
    this.reconnectDelay = 1000
    const myEpoch = ++this.epoch
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      if (myEpoch !== this.epoch) return
      this.reconnectDelay = 1000
      this.emit('_connected', {})
    }
    this.ws.onclose = () => {
      if (myEpoch !== this.epoch) return
      this.emit('_disconnected', {})
      if (this.shouldReconnect) this.scheduleReconnect(url)
    }
    this.ws.onerror = () => {
      if (myEpoch !== this.epoch) return
      this.ws?.close()
    }
    this.ws.onmessage = (e) => {
      if (myEpoch !== this.epoch) return
      try {
        const msg = JSON.parse(e.data)
        if (msg.type) this.emit(msg.type, msg)
      } catch {}
    }
  }

  waitForConnect(timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }
      const timer = setTimeout(() => {
        this.off('_connected', onConnect)
        reject(new Error('WebSocket connect timeout'))
      }, timeout)
      const onConnect = () => {
        clearTimeout(timer)
        this.off('_connected', onConnect)
        resolve()
      }
      this.on('_connected', onConnect)
    })
  }

  send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  joinRoom(room: string, peerId: string, name: string) {
    this.send({ type: 'join', room, peer_id: peerId, name })
  }

  signal(to: string, data: Record<string, unknown>) {
    this.send({ type: 'signal', to, data })
  }

  leave() {
    this.send({ type: 'leave' })
  }

  kick(peerId: string) {
    this.send({ type: 'kick', peer_id: peerId })
  }

  on(type: string, cb: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(cb)
  }

  off(type: string, cb: Listener) {
    this.listeners.get(type)?.delete(cb)
  }

  disconnect() {
    this.shouldReconnect = false
    this.cleanup()
  }

  private cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      // Detach handlers before closing to prevent stale onclose from firing
      this.ws.onopen = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null
      this.ws.close()
      this.ws = null
    }
  }

  private emit(type: string, data: SignalingMessage) {
    this.listeners.get(type)?.forEach(cb => { try { cb(data) } catch {} })
  }

  private scheduleReconnect(url: string) {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      this.connect(url)
    }, this.reconnectDelay)
  }
}

export const signaling = new SignalingClient()
