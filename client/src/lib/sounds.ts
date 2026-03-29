// Minimalistic UI sounds using Web Audio API — no external files needed

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  const ac = getCtx()
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, ac.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start()
  osc.stop(ac.currentTime + duration)
}

/** Two quick ascending notes — someone joined voice */
export function playJoin() {
  playTone(440, 0.12, 'sine', 0.12)
  setTimeout(() => playTone(587, 0.15, 'sine', 0.12), 100)
}

/** Two quick descending notes — someone left voice */
export function playLeave() {
  playTone(587, 0.12, 'sine', 0.10)
  setTimeout(() => playTone(392, 0.18, 'sine', 0.10), 100)
}

/** Soft ping — new chat message */
export function playMessage() {
  playTone(880, 0.08, 'sine', 0.08)
}
