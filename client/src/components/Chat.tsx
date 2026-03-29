import { useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { rtc } from '../lib/webrtc'
import { playMessage, playJoin, playLeave } from '../lib/sounds'
import { loadMessages, saveMessage, saveMessages, type StoredMessage } from '../lib/chatdb'
import type { Room, User, ChatMessage } from '../lib/store'

function Nf({ i }: { i: string }) {
  return <span class="nf">{i}</span>
}

const EMOJI: Record<string, string> = {
  ':smile:': '😄', ':grin:': '😁', ':joy:': '😂', ':heart:': '❤️',
  ':thumbsup:': '👍', ':thumbsdown:': '👎', ':wave:': '👋', ':fire:': '🔥',
  ':100:': '💯', ':rocket:': '🚀', ':eyes:': '👀', ':thinking:': '🤔',
  ':check:': '✅', ':x:': '❌', ':warning:': '⚠️', ':skull:': '💀',
  ':clap:': '👏', ':pray:': '🙏', ':shrug:': '🤷', ':ok:': '👌',
  ':star:': '⭐', ':sparkles:': '✨', ':tada:': '🎉', ':laughing:': '😆',
  ':wink:': '😉', ':sob:': '😭', ':angry:': '😡', ':sunglasses:': '😎',
  ':poop:': '💩', ':beer:': '🍺', ':coffee:': '☕', ':pizza:': '🍕',
}

function replaceEmoji(text: string): string {
  return text.replace(/:[a-z_]+:/g, (match) => EMOJI[match] || match)
}

marked.setOptions({
  breaks: true,
  gfm: true,
})

function renderMarkdown(content: string): string {
  const withEmoji = replaceEmoji(content)
  const html = marked.parse(withEmoji, { async: false }) as string
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'del', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'title'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })
}

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return `c${Math.abs(hash) % 8}`
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Resize + compress an image file to a base64 data URL (max 1920px, JPEG 0.75) */
function compressImage(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1920
      let w = img.width, h = img.height
      if (w > MAX || h > MAX) {
        const ratio = Math.min(MAX / w, MAX / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

interface ChatProps {
  room: Room
  user: User | null
}

const MSG_PAGE_SIZE = 100

export function Chat({ room, user }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [visibleCount, setVisibleCount] = useState(MSG_PAGE_SIZE)
  const [dragging, setDragging] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isAtBottom = useRef(true)
  const dragCounter = useRef(0)

  // Track whether user is scrolled to bottom
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  // Only auto-scroll if user is near the bottom
  const scrollToBottom = useCallback(() => {
    if (isAtBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  // Reset visible count on room change
  useEffect(() => {
    setVisibleCount(MSG_PAGE_SIZE)
    isAtBottom.current = true
  }, [room.invite])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Infinite scroll: observe sentinel at top of messages
  useEffect(() => {
    const sentinel = sentinelRef.current
    const container = messagesContainerRef.current
    if (!sentinel || !container) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => {
            if (prev >= messages.length) return prev
            // Preserve scroll position when prepending
            const oldHeight = container.scrollHeight
            requestAnimationFrame(() => {
              container.scrollTop += container.scrollHeight - oldHeight
            })
            return Math.min(prev + MSG_PAGE_SIZE, messages.length)
          })
        }
      },
      { root: container, threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [messages.length])

  useEffect(() => {
    let active = true
    // Load persisted history from IndexedDB
    loadMessages(room.invite).then(saved => {
      if (!active) return
      setMessages(saved.map(m => ({
        id: m.id, from_id: m.from_id, from_name: m.from_name,
        content: m.content, timestamp: m.timestamp, system: m.system,
      })))
    })

    rtc.setMessageHandler((_peerId, data) => {
      if (data.type === 'chat') {
        playMessage()
        const msg: ChatMessage = {
          id: data.id, from_id: data.from_id, from_name: data.from_name,
          content: data.content, timestamp: data.timestamp,
        }
        setMessages(prev => {
          if (prev.some(m => m.id === data.id)) return prev
          return [...prev, msg]
        })
        saveMessage(room.invite, msg)
      } else if (data.type === 'chat-history') {
        // Merge peer's history with ours
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id))
          const incoming = (data.messages as ChatMessage[]).filter(m => !ids.has(m.id))
          if (incoming.length === 0) return prev
          // Persist new messages
          saveMessages(room.invite, incoming.map(m => ({ ...m, roomInvite: room.invite })))
          return [...prev, ...incoming].sort((a, b) => a.timestamp - b.timestamp)
        })
      } else if (data.type === 'voice-state') {
        if (data.inVoice) playJoin()
        else playLeave()
      }
    })

    return () => {
      active = false
      rtc.setMessageHandler((() => {}) as any)
    }
  }, [room.invite])

  const sendMsg = useCallback((content: string) => {
    if (!content || !user) return
    const msg: ChatMessage = {
      id: `${user.peer_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from_id: user.peer_id,
      from_name: user.display_name,
      content,
      timestamp: Math.floor(Date.now() / 1000),
    }
    setMessages(prev => [...prev, msg])
    saveMessage(room.invite, msg)
    rtc.sendChat(msg)
  }, [user, room.invite])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return
    sendMsg(trimmed)
    setInput('')
    textareaRef.current?.focus()
  }, [input, sendMsg])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        try {
          const dataUrl = await compressImage(file)
          sendMsg(`![image](${dataUrl})`)
        } catch (err) {
          console.error('Image paste failed:', err)
        }
        return
      }
    }
  }, [sendMsg])

  const handleAttach = useCallback(async (files: FileList | File[]) => {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        try {
          const dataUrl = await compressImage(file)
          sendMsg(`![image](${dataUrl})`)
        } catch (err) {
          console.error('Image attach failed:', err)
        }
      }
    }
  }, [sendMsg])

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer?.types.includes('Files')) setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)
    if (e.dataTransfer?.files.length) handleAttach(e.dataTransfer.files)
  }, [handleAttach])

  const handleImageClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG' && target.getAttribute('src')) {
      setLightboxSrc(target.getAttribute('src')!)
    }
  }, [])

  useEffect(() => {
    if (!lightboxSrc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxSrc(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightboxSrc])

  return (
 <column class="chat-container" box-="square" {...{"self-~": "grow"}}
    onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
  >
 <row gap-="1" shear-="top" style="padding: 0 1ch; flex-shrink: 0" {...{"align-^": "center"}}>
        <span is-="badge" variant-="background0"><Nf i={'\uf292'} /> {room.name}</span>
      </row>

      {dragging && (
        <div class="chat-drop-zone">
          <Nf i={'\uf093'} /> Drop image to send
        </div>
      )}

      <div class="chat-messages" ref={messagesContainerRef} onScroll={handleScroll} onClick={handleImageClick} style="flex: 1; overflow-y: auto; padding: 0.5lh 1ch">
        <div ref={sentinelRef} style="height: 1px" />
        {messages.slice(Math.max(0, messages.length - visibleCount)).map((msg) => (
          msg.system ? (
            <div key={msg.id} class="chat-msg system">
              [{formatTime(msg.timestamp)}] ── {msg.content}
            </div>
          ) : (
            <div key={msg.id} class="chat-msg">
              <span class="timestamp">[{formatTime(msg.timestamp)}] </span>
              <span class={`author ${hashColor(msg.from_name)}`}>&lt;{msg.from_name}&gt; </span>
              <span
                class="content"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
              />
            </div>
          )
        ))}
        <div ref={messagesEndRef} />
      </div>

      {lightboxSrc && (
        <div class="lightbox-overlay" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} class="lightbox-img" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

 <row class="chat-input-area" gap-="1" style="padding: 0.5lh 1ch; flex-shrink: 0" {...{"align-^": "stretch"}}>
        <textarea
          is-="input"
          ref={textareaRef}
          value={input}
          onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={`Message #${room.name}... (drop or paste images)`}
          rows={1}
          style="flex: 1; resize: none; min-height: 2lh; max-height: 6lh; font-size: 0.875em"
        />
        <button
          size-="small"
          variant-="green"
          onClick={handleSend}
          disabled={!input.trim()}
          aria-label="Send message"
          title="Send"
        >
          <Nf i={'\uf04b'} />
        </button>
      </row>
    </column>
  )
}
