import { test, expect, describe, beforeEach } from 'bun:test'

// store.ts references localStorage at module scope — mock before dynamic import
const storage = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v) },
  removeItem: (k: string) => { storage.delete(k) },
  clear: () => { storage.clear() },
  get length() { return storage.size },
  key: (i: number) => [...storage.keys()][i] ?? null,
} as Storage

const { encodeInvite, decodeInvite, saveSignalingUrl, loadSignalingUrl } = await import('./store')

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('encodeInvite / decodeInvite', () => {
  test('round-trip with name', () => {
    const encoded = encodeInvite(UUID, 'My Room')
    const decoded = decodeInvite(encoded)
    expect(decoded).toEqual({ room: UUID, name: 'My Room' })
  })

  test('encoded format is comms-HEX-BASE64NAME', () => {
    const encoded = encodeInvite(UUID, 'Test')
    expect(encoded).toMatch(/^comms-[0-9a-f]{32}-.+$/)
  })

  test('round-trip with unicode name', () => {
    const encoded = encodeInvite(UUID, '🎮 Gaming')
    const decoded = decodeInvite(encoded)
    expect(decoded?.name).toBe('🎮 Gaming')
    expect(decoded?.room).toBe(UUID)
  })

  test('round-trip with another UUID', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const encoded = encodeInvite(uuid, 'room2')
    const decoded = decodeInvite(encoded)
    expect(decoded).toEqual({ room: uuid, name: 'room2' })
  })

  // Compat: plain 32-hex (no name)
  test('decode handles plain 32-hex without name', () => {
    const invite = 'comms-550e8400e29b41d4a716446655440000'
    const decoded = decodeInvite(invite)
    expect(decoded).toEqual({ room: UUID })
  })

  test('decode returns null for empty string', () => {
    expect(decodeInvite('')).toBeNull()
  })

  test('decode returns null for garbage input', () => {
    expect(decodeInvite('not-a-valid-invite-code')).toBeNull()
  })

  test('decode returns null for truncated invite', () => {
    const encoded = encodeInvite(UUID, 'test')
    const truncated = encoded.slice(0, 10)
    expect(decodeInvite(truncated)).toBeNull()
  })
})

describe('signaling URL', () => {
  beforeEach(() => {
    storage.clear()
  })

  test('loadSignalingUrl returns default when not set', () => {
    expect(loadSignalingUrl()).toBe('ws://localhost:4000')
  })

  test('saveSignalingUrl persists and loadSignalingUrl reads it back', () => {
    saveSignalingUrl('ws://my-server.example.com:5000')
    expect(loadSignalingUrl()).toBe('ws://my-server.example.com:5000')
  })
})
