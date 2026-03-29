import { useState, useCallback, useEffect } from 'preact/hooks'
import { ptt } from '../lib/ptt'
import { store, saveSettings, loadSignalingUrl, saveSignalingUrl } from '../lib/store'
import type { User, VoiceMode } from '../lib/store'

function Nf({ i }: { i: string }) {
  return <span class="nf">{i}</span>
}

interface SettingsProps {
  user: User | null
  onClose: () => void
  onDisplayNameChange: (name: string) => void
}

export function Settings({ user, onClose, onDisplayNameChange }: SettingsProps) {
  const [pttKey, setPttKey] = useState(store.settings.pttKey)
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [recording, setRecording] = useState(false)
  const [signalingUrl, setSignalingUrl] = useState(loadSignalingUrl())
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(store.settings.voiceMode)
  const [voiceThreshold, setVoiceThreshold] = useState(store.settings.voiceThreshold)
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [audioInput, setAudioInput] = useState(store.settings.audioInputDevice)
  const [audioOutput, setAudioOutput] = useState(store.settings.audioOutputDevice)

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      setInputDevices(devices.filter(d => d.kind === 'audioinput'))
      setOutputDevices(devices.filter(d => d.kind === 'audiooutput'))
    }).catch(() => {})
  }, [])

  const handleRecordKey = useCallback(() => {
    setRecording(true)
    const keyHandler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setPttKey(e.code)
      setRecording(false)
      window.removeEventListener('keydown', keyHandler)
      window.removeEventListener('mousedown', mouseHandler)
    }
    const mouseHandler = (e: MouseEvent) => {
      // Only capture side buttons (Mouse4, Mouse5)
      if (e.button < 3) return
      e.preventDefault()
      e.stopPropagation()
      const name = e.button === 3 ? 'Mouse4' : e.button === 4 ? 'Mouse5' : null
      if (!name) return
      setPttKey(name)
      setRecording(false)
      window.removeEventListener('keydown', keyHandler)
      window.removeEventListener('mousedown', mouseHandler)
    }
    window.addEventListener('keydown', keyHandler)
    window.addEventListener('mousedown', mouseHandler)
  }, [])

  const handleSave = useCallback(() => {
    ptt.setKey(pttKey)
    saveSettings({ pttKey, voiceMode, voiceThreshold, audioInputDevice: audioInput, audioOutputDevice: audioOutput })
    saveSignalingUrl(signalingUrl.trim() || loadSignalingUrl())
    if (displayName.trim() && displayName !== user?.display_name) {
      onDisplayNameChange(displayName.trim())
    }
    onClose()
  }, [pttKey, voiceMode, voiceThreshold, audioInput, audioOutput, displayName, signalingUrl, user?.display_name, onDisplayNameChange, onClose])

  const keyLabel = pttKey === 'CapsLock' ? '⇪ CapsLock' : pttKey.startsWith('Mouse') ? pttKey : pttKey.replace('Key', '').replace('Digit', '').replace('Arrow', '↑↓←→ ')

  return (
    <column class="settings-container" box-="square" {...{"self-~": "grow"}} gap-="1">
      <row gap-="1" shear-="top" style="padding: 0 1ch; flex-shrink: 0" {...{"align-^": "center"}}>
        <span is-="badge" variant-="background0"><Nf i={'\uf013'} /> Settings</span>
      </row>

      <column style="flex: 1; overflow-y: auto; padding: 0.5lh 2ch" gap-="1">

        {/* ── Identity ── */}
        <column gap-="1">
          <row gap-="1" {...{"align-^": "center"}}>
            <Nf i={'\uf007'} />
            <span is-="badge" variant-="background0">Identity</span>
          </row>
          <label box-="square" shear-="top">
            <span is-="badge">Display Name</span>
            <input
              is-="input"
              type="text"
              value={displayName}
              onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
              placeholder="Enter display name"
              style="width: 100%"
            />
          </label>
        </column>

        <div is-="separator" />

        {/* ── Voice Mode ── */}
        <column gap-="1">
          <row gap-="1" {...{"align-^": "center"}}>
            <Nf i={'\uf130'} />
            <span is-="badge" variant-="background0">Voice Mode</span>
          </row>
          <row gap-="1">
            <button
              variant-={voiceMode === 'ptt' ? 'foreground0' : undefined}
              onClick={() => setVoiceMode('ptt')}
              style={voiceMode === 'ptt' ? 'flex: 1' : 'flex: 1; opacity: 0.5'}
            >
              <Nf i={'\uf084'} /> Push-to-Talk
            </button>
            <button
              variant-={voiceMode === 'vad' ? 'foreground0' : undefined}
              onClick={() => setVoiceMode('vad')}
              style={voiceMode === 'vad' ? 'flex: 1' : 'flex: 1; opacity: 0.5'}
            >
              <Nf i={'\uf028'} /> Voice Activity
            </button>
          </row>
        </column>

        {/* ── PTT Keybind (only in PTT mode) ── */}
        {voiceMode === 'ptt' && (
          <>
            <div is-="separator" />
            <column gap-="1">
              <row gap-="1" {...{"align-^": "center"}}>
                <Nf i={'\uf084'} />
                <span is-="badge" variant-="background0">Push-to-Talk</span>
              </row>
              <row gap-="1" {...{"align-^": "center"}}>
                <span style="font-size: 0.85em; color: var(--foreground1)">Keybind:</span>
                <button
                  variant-="foreground0"
                  class={`keybind-btn ${recording ? 'recording' : ''}`}
                  onClick={handleRecordKey}
                >
                  {recording ? '... press a key or mouse button ...' : `[ ${keyLabel} ]`}
                </button>
              </row>
            </column>
          </>
        )}

        {/* ── Voice Threshold (only in VAD mode) ── */}
        {voiceMode === 'vad' && (
          <>
            <div is-="separator" />
            <column gap-="1">
              <row gap-="1" {...{"align-^": "center"}}>
                <Nf i={'\uf028'} />
                <span is-="badge" variant-="background0">Voice Threshold</span>
                <span style="font-size: 0.75em; color: var(--foreground2)">{voiceThreshold}</span>
              </row>
              <input
                type="range"
                min="0"
                max="100"
                value={voiceThreshold}
                onInput={(e) => setVoiceThreshold(Number((e.target as HTMLInputElement).value))}
                style="width: 100%"
              />
              <span style="font-size: 0.75em; color: var(--foreground2)">
                Lower = more sensitive. Default: 15
              </span>
            </column>
          </>
        )}

        <div is-="separator" />

        {/* ── Audio Devices ── */}
        <column gap-="1">
          <row gap-="1" {...{"align-^": "center"}}>
            <Nf i={'\uf025'} />
            <span is-="badge" variant-="background0">Audio Devices</span>
          </row>
          <label box-="square" shear-="top">
            <span is-="badge"><Nf i={'\uf130'} /> Input</span>
            <select value={audioInput} onChange={(e) => setAudioInput((e.target as HTMLSelectElement).value)} style="width: 100%">
              <option value="default">Default</option>
              {inputDevices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>
              ))}
            </select>
          </label>
          <label box-="square" shear-="top">
            <span is-="badge"><Nf i={'\uf025'} /> Output</span>
            <select value={audioOutput} onChange={(e) => setAudioOutput((e.target as HTMLSelectElement).value)} style="width: 100%">
              <option value="default">Default</option>
              {outputDevices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>
              ))}
            </select>
          </label>
        </column>

        <div is-="separator" />

        {/* ── Advanced (open by default) ── */}
        <column gap-="1">
          <row gap-="1" {...{"align-^": "center"}}>
            <Nf i={'\uf0e8'} />
            <span is-="badge" variant-="background0">Advanced</span>
          </row>
          <label box-="square" shear-="top">
            <span is-="badge">Signaling Server</span>
            <input
              is-="input"
              type="text"
              value={signalingUrl}
              onInput={(e) => setSignalingUrl((e.target as HTMLInputElement).value)}
              placeholder="ws://localhost:4000"
              style="width: 100%"
            />
          </label>
          <label box-="square" shear-="top">
            <span is-="badge">Peer ID</span>
            <input
              is-="input"
              type="text"
              value={user?.peer_id || ''}
              readOnly
              style="width: 100%; opacity: 0.7; cursor: default"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          </label>
        </column>

      </column>

      {/* ── Actions (pinned to bottom) ── */}
      <row gap-="1" style="padding: 0.5lh 2ch; flex-shrink: 0" {...{"align-$": "end"}}>
        <button onClick={onClose}>Cancel</button>
        <button variant-="foreground0" onClick={handleSave}>Save</button>
      </row>
    </column>
  )
}
