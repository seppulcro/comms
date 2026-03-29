// IndexedDB-backed chat storage — unlimited history, supports image blobs

const DB_NAME = 'comms'
const DB_VERSION = 1
const STORE_NAME = 'messages'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('room', 'roomInvite', { unique: false })
        store.createIndex('room_ts', ['roomInvite', 'timestamp'], { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export interface StoredMessage {
  id: string
  roomInvite: string
  from_id: string
  from_name: string
  content: string
  timestamp: number
  system?: boolean
}

export async function saveMessage(roomInvite: string, msg: {
  id: string; from_id: string; from_name: string; content: string; timestamp: number; system?: boolean
}): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({ ...msg, roomInvite })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveMessages(roomInvite: string, msgs: StoredMessage[]): Promise<void> {
  if (msgs.length === 0) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    for (const msg of msgs) {
      store.put({ ...msg, roomInvite })
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadMessages(roomInvite: string): Promise<StoredMessage[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const index = tx.objectStore(STORE_NAME).index('room_ts')
    const range = IDBKeyRange.bound([roomInvite, -Infinity], [roomInvite, Infinity])
    const req = index.getAll(range)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function clearRoomMessages(roomInvite: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('room')
    const req = index.openCursor(IDBKeyRange.only(roomInvite))
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
