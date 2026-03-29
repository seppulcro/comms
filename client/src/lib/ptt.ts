import { isElectron } from './platform'
import { rtc } from './webrtc'
import { store } from './store'

class PTTHandler {
  private key: string = 'CapsLock'
  private active: boolean = false
  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null
  private boundKeyUp: ((e: KeyboardEvent) => void) | null = null
  private boundMouseDown: ((e: MouseEvent) => void) | null = null
  private boundMouseUp: ((e: MouseEvent) => void) | null = null

  init() {
    const saved = localStorage.getItem('ptt-key')
    if (saved) this.key = saved

    // DOM events for focused window (fallback for browser, also works in Electron)
    this.boundKeyDown = this.handleKeyDown.bind(this)
    this.boundKeyUp = this.handleKeyUp.bind(this)
    this.boundMouseDown = this.handleMouseDown.bind(this)
    this.boundMouseUp = this.handleMouseUp.bind(this)
    window.addEventListener('keydown', this.boundKeyDown)
    window.addEventListener('keyup', this.boundKeyUp)
    window.addEventListener('mousedown', this.boundMouseDown)
    window.addEventListener('mouseup', this.boundMouseUp)

    // Global keyboard hook via uiohook-napi (Electron only)
    if (isElectron) {
      window.electronAPI.registerPttKey(this.key)
      window.electronAPI.onPttDown(() => {
        if (!this.isPTT) return
        if (!this.active) {
          this.active = true
          rtc.setMicEnabled(true)
        }
      })
      window.electronAPI.onPttUp(() => {
        if (!this.isPTT) return
        if (this.active) {
          this.active = false
          rtc.setMicEnabled(false)
        }
      })
    }
  }

  private get isPTT(): boolean {
    return store.settings.voiceMode === 'ptt'
  }

  private isTyping(e: KeyboardEvent): boolean {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
    return tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable === true
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.isPTT || e.code !== this.key || e.repeat || this.isTyping(e)) return
    if (!this.active) {
      this.active = true
      rtc.setMicEnabled(true)
    }
  }

  private handleKeyUp(e: KeyboardEvent) {
    if (!this.isPTT || e.code !== this.key) return
    if (this.active) {
      this.active = false
      rtc.setMicEnabled(false)
    }
  }

  private static mouseButtonName(button: number): string | null {
    switch (button) {
      case 3: return 'Mouse4'
      case 4: return 'Mouse5'
      default: return null  // don't bind primary/secondary/middle
    }
  }

  private get isMouseKey(): boolean {
    return this.key.startsWith('Mouse')
  }

  private handleMouseDown(e: MouseEvent) {
    if (!this.isPTT || !this.isMouseKey) return
    const name = PTTHandler.mouseButtonName(e.button)
    if (name !== this.key) return
    e.preventDefault()
    if (!this.active) {
      this.active = true
      rtc.setMicEnabled(true)
    }
  }

  private handleMouseUp(e: MouseEvent) {
    if (!this.isPTT || !this.isMouseKey) return
    const name = PTTHandler.mouseButtonName(e.button)
    if (name !== this.key) return
    if (this.active) {
      this.active = false
      rtc.setMicEnabled(false)
    }
  }

  setKey(keyCode: string) {
    this.key = keyCode
    localStorage.setItem('ptt-key', keyCode)
    if (isElectron) {
      window.electronAPI.registerPttKey(keyCode)
    }
  }

  getKey(): string {
    return this.key
  }

  isActive(): boolean {
    return this.active
  }

  destroy() {
    if (this.boundKeyDown) window.removeEventListener('keydown', this.boundKeyDown)
    if (this.boundKeyUp) window.removeEventListener('keyup', this.boundKeyUp)
    if (this.boundMouseDown) window.removeEventListener('mousedown', this.boundMouseDown)
    if (this.boundMouseUp) window.removeEventListener('mouseup', this.boundMouseUp)
    this.boundKeyDown = null
    this.boundKeyUp = null
    this.boundMouseDown = null
    this.boundMouseUp = null
    this.active = false
    if (isElectron) window.electronAPI.removePttListeners()
  }
}

export const ptt = new PTTHandler()
