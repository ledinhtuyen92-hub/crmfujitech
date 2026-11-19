import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { message, notification, Avatar } from 'antd'
import {
  MessageOutlined,
  UserOutlined,
  RightOutlined,
  PictureOutlined,
  PaperClipOutlined,
  TagOutlined,
} from '@ant-design/icons'
import api from '../utils/api'
import { useAuth } from './AuthContext'

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const { user, token } = useAuth()
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [messagesByConv, setMessagesByConv] = useState({})
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [onlineUserIds, setOnlineUserIds] = useState(new Set())
  const [typingUsers, setTypingUsers] = useState({})
  const [isWidgetOpen, setIsWidgetOpen] = useState(false)
  const [widgetConvId, setWidgetConvId] = useState(null)

  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const audioContextRef = useRef(null)

  // Lưu trữ các giá trị state trong refs để tránh reconnect WebSocket khi state thay đổi
  const activeConversationRef = useRef(activeConversation)
  const widgetConvIdRef = useRef(widgetConvId)
  const isWidgetOpenRef = useRef(isWidgetOpen)
  const userRef = useRef(user)
  const conversationsRef = useRef(conversations)

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    activeConversationRef.current = activeConversation
  }, [activeConversation])

  useEffect(() => {
    widgetConvIdRef.current = widgetConvId
  }, [widgetConvId])

  useEffect(() => {
    isWidgetOpenRef.current = isWidgetOpen
  }, [isWidgetOpen])

  useEffect(() => {
    userRef.current = user
  }, [user])

  // ── Quản lý AudioContext dùng chung, chống cạn kiệt Hardware Context & vượt Autoplay Policy ──
  const getAudioContext = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx()
        }
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {})
      }
      return audioContextRef.current
    } catch (_) {
      return null
    }
  }, [])

  // Tự động mở khóa âm thanh khi người dùng click/chạm vào màn hình lần đầu
  useEffect(() => {
    const unlockAudio = () => {
      try {
        const ctx = getAudioContext()
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {})
        }
      } catch (_) {}
      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
    }
    window.addEventListener('click', unlockAudio, { passive: true })
    window.addEventListener('keydown', unlockAudio, { passive: true })
    window.addEventListener('touchstart', unlockAudio, { passive: true })
    return () => {
      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      window.removeEventListener('touchstart', unlockAudio)
    }
  }, [getAudioContext])

  // Phát âm thanh chuông nhẹ nhàng khi có tin nhắn mới
  const playNotificationSound = useCallback(() => {
    try {
      const ctx = getAudioContext()
      if (!ctx) return

      const playChime = (c) => {
        try {
          const now = c.currentTime
          const osc = c.createOscillator()
          const gain = c.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(587.33, now) // D5
          osc.frequency.setValueAtTime(880, now + 0.08) // A5
          gain.gain.setValueAtTime(0.15, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
          osc.connect(gain)
          gain.connect(c.destination)
          osc.start(now)
          osc.stop(now + 0.35)
        } catch (_) {}
      }

      if (ctx.state === 'suspended') {
        ctx.resume().then(() => playChime(ctx)).catch(() => {})
      } else {
        playChime(ctx)
      }
    } catch (_) {}
  }, [getAudioContext])

  // Xin quyền thông báo màn hình (Desktop Notification) của hệ điều hành
  const requestDesktopNotificationPermission = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {})
        }
      }
    } catch (_) {}
  }, [])

  useEffect(() => {
    if (user) {
      requestDesktopNotificationPermission()
    }
  }, [user, requestDesktopNotificationPermission])

  // Thông báo tin nhắn đa kênh (Âm thanh + Desktop Notification + Toast Ant Design)
  const notifyIncomingMessage = useCallback((newMsg, conversationId) => {
    // 1. Luôn phát âm thanh thông báo
    playNotificationSound()

    const senderName = newMsg.sender?.full_name || 'Đồng nghiệp'
    const contentText = newMsg.content || (newMsg.message_type === 'image' ? '[Hình ảnh]' : '[Tệp tin]')

    // 2. Nếu tab đang ở chế độ ẩn/thu nhỏ (document.hidden): kích hoạt Desktop Notification
    if (typeof document !== 'undefined' && document.hidden) {
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          const notif = new Notification(`Tin nhắn từ ${senderName}`, {
            body: contentText,
            icon: newMsg.sender?.avatar || '/favicon.png',
            tag: `chat_${conversationId}`,
          })
          notif.onclick = () => {
            window.focus()
            if (window.location.pathname === '/internal-chat') {
              setActiveConversation((prev) => (prev?.id === conversationId ? prev : { id: conversationId }))
            } else {
              setIsWidgetOpen(true)
              setWidgetConvId(conversationId)
            }
          }
        }
      } catch (_) {}
    }

    // 3. Nếu người dùng đang làm việc ở trang khác (không phải đang nhìn trực diện cuộc trò chuyện này)
    const isTabActive = typeof document !== 'undefined' && !document.hidden
    const isThisConvActive =
      (activeConversationRef.current?.id === conversationId) ||
      (isWidgetOpenRef.current && widgetConvIdRef.current === conversationId)

    if (!isTabActive || !isThisConvActive) {
      let previewNode = contentText
      if (newMsg.message_type === 'image') {
        previewNode = (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#2563eb' }}>
            <PictureOutlined /> [Hình ảnh]
          </span>
        )
      } else if (newMsg.message_type === 'file') {
        previewNode = (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#2563eb' }}>
            <PaperClipOutlined /> {newMsg.file_name || '[Tệp tin]'}
          </span>
        )
      } else if (newMsg.message_type === 'context_doc') {
        const docCode = (newMsg.context_data || {}).doc_code || 'Chứng từ'
        previewNode = (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#059669' }}>
            <TagOutlined /> [Chứng từ: {docCode}]
          </span>
        )
      } else if (typeof contentText === 'string' && contentText.length > 70) {
        previewNode = `${contentText.slice(0, 70)}...`
      }

      const notifKey = `chat_msg_${newMsg.id}`

      const handleClick = () => {
        notification.destroy(notifKey)
        if (window.location.pathname === '/internal-chat') {
          setActiveConversation((prev) => (prev?.id === conversationId ? prev : { id: conversationId }))
        } else {
          setIsWidgetOpen(true)
          setWidgetConvId(conversationId)
        }
      }

      notification.open({
        key: notifKey,
        placement: 'topRight',
        duration: 4.5,
        style: {
          padding: '12px 14px',
          borderRadius: 14,
          boxShadow: '0 12px 30px -4px rgba(15, 23, 42, 0.12), 0 4px 12px -2px rgba(15, 23, 42, 0.06)',
          border: '1px solid #e2e8f0',
          borderLeft: '4px solid #1649c9',
          background: '#ffffff',
          cursor: 'pointer',
        },
        message: null,
        description: (
          <div onClick={handleClick} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Avatar
                src={newMsg.sender?.avatar}
                icon={<UserOutlined />}
                size={40}
                style={{
                  backgroundColor: '#1649c9',
                  boxShadow: '0 2px 8px rgba(22, 73, 201, 0.25)',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 17,
                  height: 17,
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }}
              >
                <MessageOutlined style={{ fontSize: 9.5, color: '#1649c9' }} />
              </span>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <span
                  style={{
                    fontWeight: 650,
                    fontSize: 13.5,
                    color: '#0f172a',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {senderName}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8, flexShrink: 0 }}>
                  Vừa xong
                </span>
              </div>

              <div
                style={{
                  fontSize: 12.5,
                  color: '#334155',
                  lineHeight: 1.45,
                  wordBreak: 'break-word',
                  background: '#f8fafc',
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid #f1f5f9',
                  marginTop: 4,
                }}
              >
                {previewNode}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 6,
                  fontSize: 11,
                  color: '#1649c9',
                  fontWeight: 600,
                }}
              >
                <span>Nhấp để mở cuộc trò chuyện</span>
                <RightOutlined style={{ fontSize: 8.5 }} />
              </div>
            </div>
          </div>
        ),
      })
    }
  }, [playNotificationSound])

  const [colleagues, setColleagues] = useState([])

  // ── 1. Tải danh sách cuộc trò chuyện ──────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!user) return
    try {
      const res = await api.get('/chat/conversations/')
      const list = Array.isArray(res.data) ? res.data : (res.data.results || [])
      // Nếu WebSocket mất kết nối mà polling phát hiện có thêm tin nhắn chưa đọc mới: kích hoạt chuông báo
      const prevUnread = (conversationsRef.current || []).reduce((sum, c) => sum + (c.unread_count || 0), 0)
      const currentUnread = list.reduce((sum, c) => sum + (c.unread_count || 0), 0)
      if (currentUnread > prevUnread && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
        playNotificationSound()
      }
      setConversations(list)
      const onlineFromConvs = list
        .filter((c) => c.type === 'direct' && c.direct_partner?.is_online)
        .map((c) => c.direct_partner.id)
      const offlineFromConvs = list
        .filter((c) => c.type === 'direct' && c.direct_partner && !c.direct_partner.is_online)
        .map((c) => c.direct_partner.id)
      setOnlineUserIds((prev) => {
        const next = new Set(prev instanceof Set ? prev : [])
        onlineFromConvs.forEach((id) => next.add(id))
        offlineFromConvs.forEach((id) => next.delete(id))
        return next
      })
    } catch (err) {
      console.error('Lỗi tải danh sách hội thoại chat:', err)
    }
  }, [user])

  // ── 2. Tải tin nhắn trong hội thoại từ REST API ───────────────────────────
  const fetchMessages = useCallback(async (convId, beforeId = null) => {
    if (!convId) return
    setLoadingMessages(true)
    try {
      const res = await api.get(`/chat/conversations/${convId}/messages/`, {
        params: { before_id: beforeId, limit: 40 },
      })
      const newMsgs = res.data.results || []
      setMessagesByConv((prev) => {
        const existing = prev[convId] || []
        if (beforeId) {
          return { ...prev, [convId]: [...newMsgs, ...existing] }
        } else {
          return { ...prev, [convId]: newMsgs }
        }
      })
      // Đánh dấu đã đọc trong state local
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
      )
    } catch (err) {
      console.error('Lỗi tải tin nhắn chat:', err)
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  // Tải danh sách đồng nghiệp
  const fetchColleagues = useCallback(async () => {
    if (!user) return
    try {
      const res = await api.get('/chat/colleagues/')
      const list = Array.isArray(res.data) ? res.data : (res.data.results || [])
      setColleagues(list)
      const onlineFromColleagues = list.filter((c) => c.is_online).map((c) => c.id)
      const offlineFromColleagues = list.filter((c) => !c.is_online).map((c) => c.id)
      setOnlineUserIds((prev) => {
        const next = new Set(prev instanceof Set ? prev : [])
        onlineFromColleagues.forEach((id) => next.add(id))
        offlineFromColleagues.forEach((id) => next.delete(id))
        return next
      })
    } catch (err) {
      console.error('Lỗi tải danh sách đồng nghiệp:', err)
    }
  }, [user])

  // Đồng bộ nhóm phòng ban và tải hội thoại
  const syncDepartmentGroups = useCallback(async () => {
    if (!user) return
    try {
      await api.get('/chat/department-groups/').catch(() => {})
      await fetchConversations()
    } catch (_) {}
  }, [user, fetchConversations])

  useEffect(() => {
    if (user) {
      syncDepartmentGroups()
      fetchColleagues()
    } else {
      setConversations([])
      setColleagues([])
      setActiveConversation(null)
      setMessagesByConv({})
    }
  }, [user, syncDepartmentGroups, fetchColleagues])

  // Polling fallback mỗi 8 giây: Đảm bảo đồng bộ tin nhắn mới, hội thoại và trạng thái online ngay cả khi WebSocket gián đoạn
  useEffect(() => {
    if (!user) return

    let tick = 0
    const pollInterval = setInterval(() => {
      tick += 1
      // 1. Tải lại danh sách hội thoại để cập nhật badge số tin chưa đọc và tin mới nhất
      fetchConversations()

      // 2. Nếu đang mở một cuộc trò chuyện, tải thêm tin nhắn mới nhất
      const currentActiveId = activeConversationRef.current?.id || widgetConvIdRef.current
      if (currentActiveId) {
        fetchMessages(currentActiveId)
      }

      // 3. Mỗi 24 giây, làm mới danh sách đồng nghiệp và trạng thái online
      if (tick % 3 === 0) {
        fetchColleagues()
      }
    }, 8000)

    return () => clearInterval(pollInterval)
  }, [user, fetchConversations, fetchMessages, fetchColleagues])

  // Tự động tải tin nhắn khi hội thoại active hoặc widget thay đổi
  useEffect(() => {
    if (activeConversation?.id) {
      fetchMessages(activeConversation.id)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'join_conversation', conversation_id: activeConversation.id }))
      }
    }
  }, [activeConversation?.id, fetchMessages])

  useEffect(() => {
    if (widgetConvId) {
      fetchMessages(widgetConvId)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'join_conversation', conversation_id: widgetConvId }))
      }
    }
  }, [widgetConvId, fetchMessages])

  // ── 3. Đánh dấu đã đọc an toàn, chống lặp vô hạn ─────────────────────────
  const markAsRead = useCallback(async (conversationId) => {
    if (!conversationId) return
    setConversations((prev) => {
      const target = prev.find((c) => c.id === conversationId)
      if (!target || (target.unread_count || 0) === 0) return prev
      return prev.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c))
    })
    try {
      await api.post(`/chat/conversations/${conversationId}/read/`)
    } catch (_) {}
  }, [])

  // ── 4. WebSocket Real-time Connection ──────────────────────────────────────
  const connectWebSocket = useCallback(() => {
    const accessToken = localStorage.getItem('accessToken') || token
    if (!accessToken || !user) return

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    let host = window.location.host
    if (window.location.port === '5173') {
      host = `${window.location.hostname}:8000`
    } else if (import.meta.env.VITE_API_URL) {
      try {
        const parsed = new URL(import.meta.env.VITE_API_URL)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          host = parsed.host
        }
      } catch (_) {}
    }
    const wsUrl = `${protocol}//${host}/ws/chat/?token=${accessToken}`
    console.log('[Chat WS] Đang kết nối tới:', wsUrl)

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[Chat WS] Kết nối WebSocket thành công!')
        // Tự động tham gia các hội thoại đang mở nếu có
        if (activeConversationRef.current?.id) {
          ws.send(JSON.stringify({ action: 'join_conversation', conversation_id: activeConversationRef.current.id }))
        }
        if (widgetConvIdRef.current) {
          ws.send(JSON.stringify({ action: 'join_conversation', conversation_id: widgetConvIdRef.current }))
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = jsonParse(event.data)
          if (!data) return

          if (data.type === 'new_message') {
            const { conversation_id, message: newMsg } = data

            // Bổ sung tin nhắn vào danh sách tin của hội thoại
            setMessagesByConv((prev) => {
              const currentList = prev[conversation_id] || []
              if (currentList.some((m) => m.id === newMsg.id)) return prev
              return { ...prev, [conversation_id]: [...currentList, newMsg] }
            })

            const isTabFocused = typeof document !== 'undefined' && !document.hidden
            const activeId = activeConversationRef.current?.id
            const isWidgetActive = isWidgetOpenRef.current && widgetConvIdRef.current === conversation_id
            const isViewingThisConv = (activeId === conversation_id) || isWidgetActive
            const isReallyReading = isViewingThisConv && isTabFocused
            const isSelf = newMsg.sender?.id === userRef.current?.id

            // Cập nhật thông tin tin nhắn cuối cùng và sắp xếp lại hội thoại
            setConversations((prev) => {
              const exists = prev.some((c) => c.id === conversation_id)
              if (!exists) {
                fetchConversations()
                return prev
              }
              return prev.map((c) => {
                if (c.id === conversation_id) {
                  // Chỉ coi là unread=0 nếu người dùng thực sự đang nhìn vào cuộc trò chuyện trên màn hình
                  const unread = isReallyReading || isSelf ? 0 : (c.unread_count || 0) + 1
                  return {
                    ...c,
                    last_message_text: newMsg.content || (newMsg.message_type === 'image' ? '[Hình ảnh]' : '[Tệp tin]'),
                    last_message_at: newMsg.created_at,
                    last_sender_name: newMsg.sender?.full_name || '',
                    unread_count: unread,
                  }
                }
                return c
              }).sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))
            })

            // Kích hoạt thông báo đa kênh nếu là tin nhắn từ người khác
            if (!isSelf) {
              notifyIncomingMessage(newMsg, conversation_id)
            }

            // Nếu người dùng thực sự đang mở và nhìn vào màn hình cuộc trò chuyện này, đánh dấu đã đọc
            if (isReallyReading && !isSelf) {
              markAsRead(conversation_id)
            }
          } else if (data.type === 'user_typing') {
            const { conversation_id, user_name, is_typing } = data
            setTypingUsers((prev) => {
              const current = prev[conversation_id] || []
              if (is_typing) {
                if (!current.includes(user_name)) return { ...prev, [conversation_id]: [...current, user_name] }
              } else {
                return { ...prev, [conversation_id]: current.filter((n) => n !== user_name) }
              }
              return prev
            })
          } else if (data.type === 'initial_presence') {
            const ids = Array.isArray(data.online_user_ids) ? data.online_user_ids : []
            setOnlineUserIds(new Set(ids))
          } else if (data.type === 'presence_update') {
            const { user_id, status: presStatus } = data
            setOnlineUserIds((prev) => {
              const next = new Set(prev instanceof Set ? prev : [])
              if (presStatus === 'online') next.add(user_id)
              else next.delete(user_id)
              return next
            })
          } else if (data.type === 'conversation_deleted') {
            const { conversation_id } = data
            setConversations((prev) => prev.filter((c) => c.id !== conversation_id))
            setMessagesByConv((prev) => {
              const next = { ...prev }
              delete next[conversation_id]
              return next
            })
            if (activeConversationRef.current?.id === conversation_id) {
              setActiveConversation(null)
            }
            if (widgetConvIdRef.current === conversation_id) {
              setWidgetConvId(null)
            }
          } else if (data.type === 'conversation_cleared') {
            const { conversation_id } = data
            setMessagesByConv((prev) => ({ ...prev, [conversation_id]: [] }))
            setConversations((prev) =>
              prev.map((c) => (c.id === conversation_id ? { ...c, last_message_text: '', last_message_at: null } : c))
            )
          } else if (data.type === 'message_recalled') {
            const { conversation_id, message_id, message: updatedMsg } = data
            setMessagesByConv((prev) => {
              const list = prev[conversation_id] || []
              return {
                ...prev,
                [conversation_id]: list.map((m) => (m.id === message_id ? updatedMsg : m)),
              }
            })
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conversation_id
                  ? { ...c, last_message_text: 'Tin nhắn đã được thu hồi' }
                  : c
              )
            )
          }
        } catch (err) {
          console.error('Lỗi xử lý WS chat message:', err)
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        // Tự động kết nối lại sau 3 giây
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket()
        }, 3000)
      }

      ws.onerror = (e) => {
        console.warn('Chat WS connection error:', e)
        ws.close()
      }
    } catch (e) {
      console.warn('Cannot establish WS:', e)
    }
  }, [token, user, fetchConversations, markAsRead, notifyIncomingMessage])

  useEffect(() => {
    connectWebSocket()
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connectWebSocket])

  // Khi người dùng quay lại tab (window focus / visibilitychange), đánh dấu đã đọc cuộc trò chuyện đang mở
  useEffect(() => {
    const handleFocus = () => {
      const activeId = activeConversationRef.current?.id || widgetConvIdRef.current
      if (activeId) {
        markAsRead(activeId)
      }
    }
    window.addEventListener('focus', handleFocus)
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        handleFocus()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [markAsRead])

  // ── 5. Gửi tin nhắn qua REST API đảm bảo lưu trữ và broadcast ─────────────
  const sendMessage = async ({ conversationId, content, messageType = 'text', contextData = null, file = null }) => {
    if (!conversationId) return null

    const formData = new FormData()
    if (content) formData.append('content', content)
    formData.append('message_type', messageType)
    if (contextData) formData.append('context_data', JSON.stringify(contextData))
    if (file) formData.append('file', file)

    try {
      const res = await api.post(`/chat/conversations/${conversationId}/send/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const newMsg = res.data
      setMessagesByConv((prev) => {
        const cur = prev[conversationId] || []
        if (cur.some((m) => m.id === newMsg.id)) return prev
        return { ...prev, [conversationId]: [...cur, newMsg] }
      })
      setConversations((prev) => {
        return prev.map((c) => {
          if (c.id === conversationId) {
            return {
              ...c,
              last_message_text: newMsg.content || (newMsg.message_type === 'image' ? '[Hình ảnh]' : '[Tệp tin]'),
              last_message_at: newMsg.created_at,
              last_sender_name: newMsg.sender?.full_name || '',
            }
          }
          return c
        }).sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))
      })
      return newMsg
    } catch (err) {
      console.error('Lỗi gửi tin nhắn chat:', err)
      const errorMsg =
        err.response?.data?.detail ||
        (typeof err.response?.data === 'string' ? err.response.data : null) ||
        (err.response?.data && typeof err.response?.data === 'object' ? Object.values(err.response.data).flat().join(', ') : null) ||
        'Không thể gửi tin nhắn.'
      message.error(errorMsg)
      return null
    }
  }

  // ── 6. Báo đang soạn tin qua WebSocket ───────────────────────────────────
  const sendTyping = (conversationId, isTyping) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && conversationId) {
      wsRef.current.send(
        JSON.stringify({
          action: 'typing',
          conversation_id: conversationId,
          is_typing: isTyping,
        })
      )
    }
  }

  // ── 7. Bắt đầu chat 1-1 với đồng nghiệp ──────────────────────────────────
  const startDirectChat = async (partnerId) => {
    try {
      const res = await api.post('/chat/conversations/', {
        type: 'direct',
        partner_id: partnerId,
      })
      const conv = res.data
      setConversations((prev) => {
        if (!prev.some((c) => c.id === conv.id)) {
          return [conv, ...prev]
        }
        return prev
      })
      setActiveConversation(conv)
      setWidgetConvId(conv.id)
      if (typeof window !== 'undefined' && window.location.pathname !== '/internal-chat') {
        setIsWidgetOpen(true)
      }
      return conv
    } catch (err) {
      message.error(err.response?.data?.detail || 'Không thể tạo cuộc trò chuyện.')
      return null
    }
  }

  // ── 8. Tạo nhóm chat mới ─────────────────────────────────────────────────
  const createGroupChat = async (title, memberIds) => {
    try {
      const res = await api.post('/chat/conversations/', {
        type: 'group',
        title,
        member_ids: memberIds,
      })
      const conv = res.data
      setConversations((prev) => [conv, ...prev])
      setActiveConversation(conv)
      setWidgetConvId(conv.id)
      if (typeof window !== 'undefined' && window.location.pathname !== '/internal-chat') {
        setIsWidgetOpen(true)
      }
      message.success(`Đã tạo nhóm chat "${title}" thành công!`)
      return conv
    } catch (err) {
      message.error(err.response?.data?.detail || 'Không thể tạo nhóm trò chuyện.')
      return null
    }
  }

  // ── 9. Xóa cuộc trò chuyện ────────────────────────────────────────────────
  const deleteConversation = async (conversationId) => {
    if (!conversationId) return false
    try {
      const res = await api.delete(`/chat/conversations/${conversationId}/`)
      setConversations((prev) => prev.filter((c) => c.id !== conversationId))
      setMessagesByConv((prev) => {
        const next = { ...prev }
        delete next[conversationId]
        return next
      })
      if (activeConversationRef.current?.id === conversationId) {
        setActiveConversation(null)
      }
      if (widgetConvIdRef.current === conversationId) {
        setWidgetConvId(null)
      }
      message.success(res.data?.detail || 'Đã xóa cuộc trò chuyện thành công.')
      return true
    } catch (err) {
      const errorMsg =
        err.response?.data?.detail ||
        (typeof err.response?.data === 'string' ? err.response.data : null) ||
        'Không thể xóa cuộc trò chuyện.'
      message.error(errorMsg)
      return false
    }
  }

  // ── 10. Xóa toàn bộ lịch sử tin nhắn trong cuộc trò chuyện ────────────────
  const clearChatHistory = async (conversationId) => {
    if (!conversationId) return false
    try {
      const res = await api.post(`/chat/conversations/${conversationId}/clear_messages/`)
      setMessagesByConv((prev) => ({ ...prev, [conversationId]: [] }))
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, last_message_text: '', last_message_at: null } : c))
      )
      message.success(res.data?.detail || 'Đã xóa toàn bộ lịch sử tin nhắn.')
      return true
    } catch (err) {
      const errorMsg =
        err.response?.data?.detail ||
        (typeof err.response?.data === 'string' ? err.response.data : null) ||
        'Không thể xóa lịch sử tin nhắn.'
      message.error(errorMsg)
      return false
    }
  }

  // ── 11. Thu hồi tin nhắn đã gửi ──────────────────────────────────────────
  const recallMessage = async (conversationId, messageId) => {
    if (!conversationId || !messageId) return false
    try {
      const res = await api.post(`/chat/conversations/${conversationId}/messages/${messageId}/recall/`)
      const updatedMsg = res.data
      setMessagesByConv((prev) => {
        const list = prev[conversationId] || []
        return {
          ...prev,
          [conversationId]: list.map((m) => (m.id === messageId ? updatedMsg : m)),
        }
      })
      message.success('Đã thu hồi tin nhắn thành công.')
      return true
    } catch (err) {
      const errorMsg =
        err.response?.data?.detail ||
        (typeof err.response?.data === 'string' ? err.response.data : null) ||
        'Không thể thu hồi tin nhắn.'
      message.error(errorMsg)
      return false
    }
  }

  // Tính tổng số tin nhắn chưa đọc
  const totalUnreadCount = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversation,
        setActiveConversation,
        messagesByConv,
        loadingMessages,
        onlineUserIds,
        typingUsers,
        totalUnreadCount,
        colleagues,
        setColleagues,
        fetchColleagues,
        isWidgetOpen,
        setIsWidgetOpen,
        widgetConvId,
        setWidgetConvId,
        fetchConversations,
        fetchMessages,
        sendMessage,
        sendTyping,
        markAsRead,
        startDirectChat,
        createGroupChat,
        deleteConversation,
        clearChatHistory,
        recallMessage,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

function jsonParse(str) {
  try {
    return JSON.parse(str)
  } catch (_) {
    return null
  }
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return ctx
}
