export interface User {
  peer_id: string
  display_name: string
}

export interface Room {
  name: string
  invite: string
  hosting: boolean
}

export interface ChatMessage {
  id: string
  from_id: string
  from_name: string
  content: string
  timestamp: number
  system?: boolean
}

export type VoiceMode = 'ptt' | 'vad'

export interface Settings {
  pttKey: string
  voiceMode: VoiceMode
  voiceThreshold: number
  audioInputDevice: string
  audioOutputDevice: string
}

export const store = {
  settings: {
    pttKey: localStorage.getItem('ptt-key') || 'KeyV',
    voiceMode: (localStorage.getItem('voice-mode') as VoiceMode) || 'ptt',
    voiceThreshold: Number(localStorage.getItem('voice-threshold')) || 15,
    audioInputDevice: localStorage.getItem('audio-input-device') || 'default',
    audioOutputDevice: localStorage.getItem('audio-output-device') || 'default',
  } as Settings,
}

export function saveSettings(settings: Partial<Settings>) {
  Object.assign(store.settings, settings)
  if (settings.pttKey !== undefined) localStorage.setItem('ptt-key', settings.pttKey)
  if (settings.voiceMode !== undefined) localStorage.setItem('voice-mode', settings.voiceMode)
  if (settings.voiceThreshold !== undefined) localStorage.setItem('voice-threshold', String(settings.voiceThreshold))
  if (settings.audioInputDevice !== undefined) localStorage.setItem('audio-input-device', settings.audioInputDevice)
  if (settings.audioOutputDevice !== undefined) localStorage.setItem('audio-output-device', settings.audioOutputDevice)
}

export function saveRooms(rooms: Room[]) {
  localStorage.setItem('rooms', JSON.stringify(rooms))
}

export function loadRooms(): Room[] {
  try { return JSON.parse(localStorage.getItem('rooms') || '[]') }
  catch { return [] }
}

export function saveDisplayName(name: string) {
  localStorage.setItem('display-name', name)
}

export function loadDisplayName(): string | null {
  return localStorage.getItem('display-name')
}

const DEFAULT_SIGNALING_URL = 'wss://comms.seppulcro.com'

export function saveSignalingUrl(url: string) {
  localStorage.setItem('signaling-url', url)
}

export function loadSignalingUrl(): string {
  return localStorage.getItem('signaling-url') || DEFAULT_SIGNALING_URL
}

export function encodeInvite(room: string, name: string): string {
  const hex = room.replace(/-/g, '')
  const encodedName = btoa(name).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `comms-${hex}-${encodedName}`
}

export function decodeInvite(invite: string): { room: string; name?: string } | null {
  try {
    const body = invite.replace(/^comms-/, '')

    // New format: 32-hex + dash + base64url name
    const match = body.match(/^([0-9a-f]{32})-(.+)$/i)
    if (match) {
      const hex = match[1]
      const room = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
      const name = atob(match[2].replace(/-/g, '+').replace(/_/g, '/'))
      return { room, name }
    }

    // Compat: plain 32-hex (no name)
    if (body.length === 32 && /^[0-9a-f]+$/i.test(body)) {
      const room = `${body.slice(0, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}-${body.slice(16, 20)}-${body.slice(20)}`
      return { room }
    }
    return null
  } catch { return null }
}
