import {
  ClockCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  HistoryOutlined,
  MailOutlined,
  MessageOutlined,
  InfoCircleOutlined,
  PaperClipOutlined,
  PhoneOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
  StarFilled,
  StarOutlined,
  TagOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
  UserOutlined,
  UserSwitchOutlined,
  VideoCameraOutlined,
  RobotOutlined,
  StopOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons'
import {
  AutoComplete,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Popover,
  Radio,
  Row,
  Select,
  Skeleton,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
  theme
} from 'antd'
import { useResponsive } from '../hooks/useResponsive'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../utils/api'

const cleanUrl = (url) => {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname.includes('ngrok-free.dev') || u.hostname.includes('ngrok.io')) {
      const base = api.defaults.baseURL.replace(/\/api\/?$/, '');
      return `${base}${u.pathname}`;
    }
  } catch (e) {}
  return url;
}

const { Text } = Typography

const STATUS_CONFIG = {
  not_added: { color: '#f59e0b', bg: '#fef3c7', label: 'Chưa thêm KH', border: '#fde68a' },
  converted: { color: '#10b981', bg: '#d1fae5', label: 'Đã có trong KH', border: '#6ee7b7' },
}

const avatarColors = ['#2563eb', '#7c3aed', '#dc2626', '#d97706', '#059669', '#0891b2', '#db2777', '#4f46e5', '#ea580c', '#16a34a']
function getAvatarColor(name) {
  if (!name) return '#2563eb'
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % avatarColors.length
  return avatarColors[idx]
}

function LeadAvatar({ lead, size = 44, style = {} }) {
  const name = lead?.fb_user_name || 'Khách hàng'
  const src = lead?.fb_user_avatar || null
  const initial = name.charAt(0).toUpperCase()
  return (
    <Avatar
      size={size}
      src={src}
      style={{
        background: src ? 'transparent' : getAvatarColor(name),
        color: '#fff',
        fontWeight: 600,
        fontSize: Math.round(size * 0.42),
        flexShrink: 0,
        ...style
      }}
    >
      {!src && initial}
    </Avatar>
  )
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    const diffMs = now - d
    const diffMin = Math.floor(diffMs / 60000)
    const diffH = Math.floor(diffMs / 3600000)
    if (diffMin < 1) return 'Vừa xong'
    if (diffMin < 60) return `${diffMin} phút`
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)} giờ`
    return d.toLocaleDateString('vi-VN')
  } catch (e) {
    return ''
  }
}

// Conversation list item
function ConvItem({ lead, selected, onClick }) {
  if (!lead) return null
  const cfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG.not_added
  const unreadNum = lead.unread_count || (lead.has_unread_message ? 1 : 0)
  const isUnread = unreadNum > 0

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        cursor: 'pointer',
        borderBottom: '1px solid #e5e7eb',
        background: selected ? '#e8f0fe' : isUnread ? '#f0f9ff' : 'transparent',
        borderLeft: selected ? '3px solid #1877f2' : isUnread ? '3px solid #3b82f6' : '3px solid transparent',
        transition: 'all 0.15s',
      }}
    >
      <Badge
        count={isUnread ? unreadNum : 0}
        overflowCount={99}
        offset={[-4, 4]}
        style={{
          background: '#ef4444',
          color: '#fff',
          fontWeight: 700,
          boxShadow: '0 0 0 2px #fff',
        }}
      >
        <Badge
          dot
          style={{ background: lead.is_customer_converted ? '#10b981' : '#f59e0b' }}
          offset={[-3, 40]}
        >
          <LeadAvatar lead={lead} size={44} />
        </Badge>
      </Badge>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 13,
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
              fontWeight: isUnread ? 800 : 600,
              color: isUnread ? '#0f172a' : '#1f2937',
            }}
          >
            {lead.is_starred && <StarFilled style={{ color: '#f59e0b', marginRight: 4 }} />}
            {lead.fb_user_name || 'Khách hàng'}
          </Text>
          <Text
            style={{
              fontSize: 11,
              flexShrink: 0,
              marginLeft: 4,
              fontWeight: isUnread ? 700 : 400,
              color: isUnread ? '#2563eb' : '#9ca3af',
            }}
          >
            {formatTime(lead.last_message_at)}
          </Text>
        </div>
        <Text
          style={{
            fontSize: 12,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: isUnread ? 700 : 400,
            color: isUnread ? '#1e293b' : '#6b7280',
          }}
        >
          {lead.last_message_preview || 'Chưa có tin nhắn'}
        </Text>
        <div style={{ marginTop: 3, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(() => {
            const manualTags = lead.tags || [];
            const aiTags = (lead.ai_tags || []).map((t, i) => ({ id: `ai-${i}`, name: t, color: '#8b5cf6' }));
            const combinedTags = [...manualTags, ...aiTags];
            return (
              <>
                {combinedTags.slice(0, 2).map(t => (
                  <Tag key={t.id} style={{ fontSize: 10, padding: '0 6px', lineHeight: '16px', borderRadius: 8, margin: 0, color: '#fff', background: t.color || '#3b82f6', border: 'none', fontWeight: 600 }}>
                    {t.name}
                  </Tag>
                ))}
                {combinedTags.length > 2 && (
                  <Tooltip title={combinedTags.slice(2).map(t => t.name).join(', ')}>
                    <Tag style={{ fontSize: 10, padding: '0 6px', lineHeight: '16px', borderRadius: 8, margin: 0, color: '#fff', background: '#94a3b8', border: 'none', fontWeight: 600, cursor: 'help' }}>
                      +{combinedTags.length - 2}
                    </Tag>
                  </Tooltip>
                )}
              </>
            );
          })()}
          {lead.assigned_to_name && (
            <Tag style={{ fontSize: 10, padding: '0 6px', lineHeight: '16px', borderRadius: 8, margin: 0, color: '#4b5563', background: '#f3f4f6', border: '1px solid #e5e7eb' }}>
              👤 {lead.assigned_to_name}
            </Tag>
          )}
          <Tag style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', borderRadius: 8, margin: 0,
            color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            {cfg.label}
          </Tag>
          {lead.latest_sender === 'customer' ? (
            <Tag style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', borderRadius: 8, margin: 0,
              color: '#d97706', background: '#fef3c7', border: '1px solid #fde68a' }}>
              ⏳ Chờ trả lời
            </Tag>
          ) : lead.latest_sender === 'page' ? (
            <Tag style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', borderRadius: 8, margin: 0,
              color: '#16a34a', background: '#dcfce7', border: '1px solid #bbf7d0' }}>
              ✓ Đã trả lời
            </Tag>
          ) : null}
          {lead.detected_phone && (
            <Tag style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', borderRadius: 8, margin: 0,
              color: '#2563eb', background: '#dbeafe', border: '1px solid #93c5fd' }}>
              📞 {lead.detected_phone}
            </Tag>
          )}
          {lead.detected_email && (
            <Tag style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', borderRadius: 8, margin: 0,
              color: '#059669', background: '#d1fae5', border: '1px solid #6ee7b7' }}>
              📧 {lead.detected_email}
            </Tag>
          )}
        </div>
      </div>
    </div>
  )
}

// Message bubble (Meta Messenger style & Zalo clean UX)
function MessageBubble({ msg, lead, showAvatar = true }) {
  if (!msg) return null

  if (msg.payload?.is_system_alert) {
    return (
      <div style={{ textAlign: 'center', margin: '16px 0' }}>
        <span style={{ background: '#fee2e2', color: '#dc2626', padding: '6px 12px', borderRadius: 16, fontSize: 11, fontWeight: 500, display: 'inline-block', maxWidth: '80%', wordBreak: 'break-word' }}>
          ⚠️ Lỗi hệ thống: {msg.payload.error_message || msg.text}
        </span>
      </div>
    )
  }

  const isPage = msg.sender_type === 'page'
  const urlLower = (msg.attachment_url || '').toLowerCase()
  const attachType = (msg.attachment_type || '').toLowerCase()

  // Ưu tiên attachment_type từ backend trước, rồi mới đoán qua URL
  const isVideo = attachType === 'video' ||
    /\.(mp4|mov|avi|webm|mkv)(\?.*)?$/i.test(urlLower) ||
    urlLower.includes('/videos/') ||
    urlLower.includes('video_redirect') ||
    urlLower.includes('attachment_type=video')

  // isImage chỉ khi KHÔNG phải video
  const isImage = !isVideo && (
    attachType === 'image' ||
    /\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(urlLower) ||
    urlLower.includes('fbcdn.net/v/') ||
    urlLower.includes('scontent.') ||
    urlLower.includes('/images/')
  )

  const isAudio = !isVideo && !isImage && (
    attachType === 'audio' ||
    /\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(urlLower)
  )

  const hasOnlyMedia = !msg.text && msg.attachment_url && (isImage || isVideo)


  return (
    <div style={{
      display: 'flex',
      justifyContent: isPage ? 'flex-end' : 'flex-start',
      marginBottom: showAvatar ? 12 : 3,
      padding: '0 16px',
    }}>
      {!isPage && (
        <div style={{ width: 28, marginRight: 8, flexShrink: 0, alignSelf: 'flex-end' }}>
          {showAvatar && (
            <LeadAvatar lead={lead} size={28} />
          )}
        </div>
      )}
        <div style={{
          maxWidth: '68%',
          padding: hasOnlyMedia ? 0 : '10px 14px',
          borderRadius: isPage ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: hasOnlyMedia ? 'transparent' : isPage ? '#1877f2' : '#f0f0f0',
          color: isPage ? '#fff' : '#1a1a1a',
          fontSize: 14,
          lineHeight: 1.5,
          boxShadow: hasOnlyMedia ? 'none' : isPage ? '0 1px 4px rgba(24,119,242,0.25)' : '0 1px 4px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}>
        {msg.attachment_type === 'carousel' && Array.isArray(msg.payload) && (
          <div style={{ marginBottom: msg.text ? 8 : 0, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, paddingRight: 12 }}>
            {msg.payload.map((item, idx) => (
              <div key={idx} style={{ width: 140, flexShrink: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <div style={{ width: '100%', height: 100, backgroundImage: `url(${cleanUrl(item.image_url)})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <div style={{ padding: '6px 8px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.title}>{item.title}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.subtitle}>{item.subtitle}</div>
                  <div style={{ marginTop: 6, textAlign: 'center', fontSize: 11, color: '#1877f2', fontWeight: 500, padding: '4px 0', borderTop: '1px solid #e2e8f0' }}>Nhận tư vấn</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {msg.text && msg.attachment_type !== 'carousel' && <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.text}</div>}
        {msg.attachment_url && msg.attachment_type !== 'carousel' && (
          <div style={{ marginTop: msg.text ? 8 : 0 }}>
            {isImage ? (
              <Image
                src={msg.attachment_url}
                alt="attachment"
                style={{ maxWidth: 260, maxHeight: 260, borderRadius: 12, objectFit: 'cover', display: 'block' }}
              />
            ) : isVideo ? (
              <div style={{ maxWidth: 280 }}>
                <video
                  controls
                  src={msg.attachment_url}
                  style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 12, display: 'block', background: '#000' }}
                  onError={(e) => {
                    // Nếu video không load được (URL hết hạn), hiển thị nút tải thay thế
                    e.target.style.display = 'none'
                    e.target.nextSibling && (e.target.nextSibling.style.display = 'flex')
                  }}
                />
                <a
                  href={msg.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'none',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: isPage ? 'rgba(255,255,255,0.15)' : '#e5e7eb',
                    color: isPage ? '#fff' : '#1f2937',
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  <VideoCameraOutlined style={{ fontSize: 20, color: '#6b7280' }} />
                  <span>Video (nhấn để mở)</span>
                  <DownloadOutlined />
                </a>
              </div>
            ) : isAudio ? (
              <audio controls src={msg.attachment_url} style={{ maxWidth: 240 }} />
            ) : (
              <a
                href={msg.attachment_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: isPage ? 'rgba(255,255,255,0.15)' : '#e5e7eb',
                  color: isPage ? '#fff' : '#1f2937',
                  textDecoration: 'none',
                }}
              >
                <PaperClipOutlined style={{ fontSize: 18 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Tệp đính kèm ({msg.attachment_url.split('/').pop().split('?')[0] || 'file'})
                </span>
                <DownloadOutlined />
              </a>
            )}
          </div>
        )}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isPage ? 'flex-end' : 'flex-start',
          gap: 4,
          fontSize: 10,
          marginTop: 4,
          opacity: isPage ? 0.8 : 0.6,
          textShadow: hasOnlyMedia ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
          color: hasOnlyMedia ? '#6b7280' : 'inherit',
        }}>
          {isPage && msg.sender_name && (
            <span>{msg.sender_name} &bull;</span>
          )}
          <span>{formatTime(msg.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

export default function FacebookInboxPage() {
  const { token } = theme.useToken()
  const { user, maintenanceMode, hasPermission, isCompanyAdmin } = useAuth()
  const { isMobile } = useResponsive()
  const canDeleteConversation = isCompanyAdmin || user?.is_superuser || hasPermission('facebook.delete_conversation')
  const canViewAllInbox = isCompanyAdmin || hasPermission('facebook.view_all_inbox')
  const canChat = isCompanyAdmin || hasPermission('facebook.chat')
  const canCreateCustomer = isCompanyAdmin || hasPermission('facebook.create_customer')
  // Resizable columns
  const [leftColWidth, setLeftColWidth] = useState(270)
  const [rightColWidth, setRightColWidth] = useState(260)
  const isDraggingLeft = useRef(false)
  const isDraggingRight = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const startDragLeft = (e) => {
    isDraggingLeft.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = leftColWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  const startDragRight = (e) => {
    isDraggingRight.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = rightColWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  useEffect(() => {
    const onMove = (e) => {
      if (isDraggingLeft.current) {
        const delta = e.clientX - dragStartX.current
        setLeftColWidth(Math.min(420, Math.max(180, dragStartWidth.current + delta)))
      }
      if (isDraggingRight.current) {
        const delta = dragStartX.current - e.clientX
        setRightColWidth(Math.min(380, Math.max(180, dragStartWidth.current + delta)))
      }
    }
    const onUp = () => {
      isDraggingLeft.current = false
      isDraggingRight.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const [pages, setPages] = useState([])
  const [selectedPage, setSelectedPage] = useState('all')
  const [leads, setLeads] = useState([])
  const [selectedLead, setSelectedLead] = useState(null)
  const [messages, setMessages] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [hasPhoneOnly, setHasPhoneOnly] = useState(false)
  const [hasUnreadOnly, setHasUnreadOnly] = useState(false)
  const [isArchivedOnly, setIsArchivedOnly] = useState(false)
  const [replyFilter, setReplyFilter] = useState('') // '' | 'unanswered' | 'read_unanswered'
  const [sortBy, setSortBy] = useState('') // '' | 'waiting_longest' | 'time_asc'
  const [phoneFilterMode, setPhoneFilterMode] = useState('all') // 'all' | 'has_phone' | 'no_phone'
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [infoDrawerVisible, setInfoDrawerVisible] = useState(false)
  const [msgLoading, setMsgLoading] = useState(false)
  const [tags, setTags] = useState([])
  const [quickReplies, setQuickReplies] = useState([])
  const [employees, setEmployees] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  
  const [extracting, setExtracting] = useState(false)
  const [extractModalVisible, setExtractModalVisible] = useState(false)
  const [extractedText, setExtractedText] = useState('')
  const [extractSaving, setExtractSaving] = useState(false)
  const [createForm] = Form.useForm()
  const [createModal, setCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const isUserScrollingUp = useRef(false)  // true khi người dùng đang kéo lên xem tin cũ
  const prevLeadId = useRef(null)           // theo dõi lần đầu mở hội thoại

  // Sync History
  const [syncModal, setSyncModal] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMaxConv, setSyncMaxConv] = useState(100)
  const [syncLimitMsg, setSyncLimitMsg] = useState(50)
  const [syncTargetPage, setSyncTargetPage] = useState('all')

  // Quick Media Library
  const [quickMediaModal, setQuickMediaModal] = useState(false)
  const [quickMediaList, setQuickMediaList] = useState([])
  const [quickMediaLoading, setQuickMediaLoading] = useState(false)
  const [quickMediaUploading, setQuickMediaUploading] = useState(false)
  const [quickMediaTitle, setQuickMediaTitle] = useState('')
  const [quickMediaType, setQuickMediaType] = useState('image')
  const [quickMediaFolder, setQuickMediaFolder] = useState('Chung')
  const [activeMediaFolderTab, setActiveMediaFolderTab] = useState('all')
  const [selectedMediaIds, setSelectedMediaIds] = useState(new Set())

  // Pancake filters state
  const [isStarredOnly, setIsStarredOnly] = useState(false)
  const [tagFilter, setTagFilter] = useState('all')
  const [assignedToFilter, setAssignedToFilter] = useState('all')

  // Tags & Quick Replies & Notes state
  const [tagsList, setTagsList] = useState([])
  const [quickRepliesList, setQuickRepliesList] = useState([])
  const [quickReplyModal, setQuickReplyModal] = useState(false)
  const [qrShortcut, setQrShortcut] = useState('')
  const [qrTitle, setQrTitle] = useState('')
  const [qrContent, setQrContent] = useState('')
  const [qrSaving, setQrSaving] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [manageTagsModal, setManageTagsModal] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3b82f6')

  const fetchPages = async () => {
    try {
      const res = await api.get('/facebook/pages/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setPages(data.filter(p => p.is_active !== false))
    } catch { /* silent */ }
  }

  const fetchCompanySettings = async () => {
    try {
      const res = await api.get('/ai_agents/settings/mine/')
      setCompanySettings(res.data)
    } catch {}
  }

  const fetchTags = async () => {
    try {
      const res = await api.get('/facebook/lead-tags/')
      setTagsList(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch { /* silent */ }
  }

  const fetchQuickReplies = async () => {
    try {
      const res = await api.get('/facebook/quick-replies/')
      setQuickRepliesList(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch { /* silent */ }
  }

  const fetchLeads = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params = {}
      if (selectedPage && selectedPage !== 'all') params.page_config = selectedPage
      if (phoneFilterMode === 'has_phone' || hasPhoneOnly) params.has_phone = 'true'
      else if (phoneFilterMode === 'no_phone') params.has_phone = 'false'
      if (statusFilter) params.status = statusFilter
      if (hasUnreadOnly) params.has_unread = 'true'
      if (isArchivedOnly) params.is_archived = 'true'
      if (replyFilter) params.reply_filter = replyFilter
      if (sortBy) params.sort_by = sortBy
      if (isStarredOnly) params.is_starred = 'true'
      if (tagFilter && tagFilter !== 'all') params.tag_id = tagFilter
      if (assignedToFilter && assignedToFilter !== 'all') params.assigned_to = assignedToFilter
      const res = await api.get('/facebook/leads/', { params })
      setLeads(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch { if (!silent) message.error('Không thể tải danh sách hội thoại Facebook.') }
    finally { if (!silent) setLoading(false) }
  }

  const fetchMessages = async (lead, silent = false) => {
    if (!silent) setMsgLoading(true)
    try {
      const res = await api.get(`/facebook/leads/${lead.id}/`)
      setMessages(res.data.messages || [])
      setSelectedLead(res.data)
      if (!silent) fetchLeads(true)
    } catch { if (!silent) message.error('Không thể tải tin nhắn.') }
    finally { if (!silent) setMsgLoading(false) }
  }

  const handleToggleAi = async (checked) => {
    if (!selectedLead) return
    try {
      await api.patch(`/facebook/leads/${selectedLead.id}/`, { is_ai_active: checked })
      setSelectedLead(prev => ({ ...prev, is_ai_active: checked }))
      message.success(checked ? 'Đã bật chế độ AI tự động trả lời' : 'Đã tắt AI - Sale tiếp quản')
    } catch {
      message.error('Không thể thay đổi trạng thái AI')
    }
  }

  const handleToggleGlobalAi = async (pageId, checked) => {
    try {
      await api.patch(`/facebook/pages/${pageId}/`, { is_ai_active: checked })
      setPages(prev => prev.map(p => p.id === pageId ? { ...p, is_ai_active: checked } : p))
      message.success(`Đã ${checked ? 'Bật' : 'Tắt'} AI toàn cục cho trang!`)
    } catch {
      message.error('Không thể thay đổi trạng thái AI toàn cục')
    }
  }

  useEffect(() => {
    fetchPages()
    fetchTags()
    fetchQuickReplies()
    fetchCompanySettings()
    // Gọi /users/users/ để lấy danh sách nhân viên trong công ty (lọc đúng theo tenant)
    api.get('/users/users/').then(res => {
      const data = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.results) ? res.data.results : [])
      const active = data.filter(e => e.is_active !== false)
      // Chỉ giữ nhân viên có quyền liên quan đến module Facebook hoặc là admin
      const withFb = active.filter(e => {
        if (e.is_superuser || e.is_company_admin) return true
        const perms = e.permissions || []
        return perms.some(p => typeof p === 'string' ? p.startsWith('facebook.') : (p.codename || '').startsWith('facebook.'))
      })
      // Nếu không ai có quyền cụ thể (VD: Giám đốc dùng quyền tổng hợp), fallback hiển thị tất cả
      setEmployees(withFb.length > 0 ? withFb : active)
    }).catch(() => setEmployees([]))
  }, [])
  useEffect(() => { 
    fetchLeads() 
    const interval = setInterval(() => { fetchLeads(true) }, 3000)
    return () => clearInterval(interval)
  }, [selectedPage, hasPhoneOnly, phoneFilterMode, statusFilter, hasUnreadOnly, isArchivedOnly, replyFilter, sortBy, isStarredOnly, tagFilter, assignedToFilter])

  useEffect(() => {
    if (selectedLead?.id) {
      const interval = setInterval(() => {
        fetchMessages(selectedLead, true)
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [selectedLead?.id])

  // Hàm scroll xuống cuối — chỉ gọi khi cần thiết
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
    }
  }

  // Theo dõi người dùng đang cuộn lên không
  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    // Nếu cách đáy > 120px thì coi như đang xem tin cũ
    isUserScrollingUp.current = distanceFromBottom > 120
  }

  useEffect(() => {
    if (!messages || messages.length === 0) return
    const leadChanged = prevLeadId.current !== selectedLead?.id
    if (leadChanged) {
      // Mới mở hội thoại: scroll xuống ngay (không có animation)
      prevLeadId.current = selectedLead?.id
      isUserScrollingUp.current = false
      setTimeout(() => scrollToBottom(false), 50)
      return
    }
    // Khi có tin nhắn mới (polling): chỉ scroll nếu người dùng đang ở gần cuối
    if (!isUserScrollingUp.current) {
      scrollToBottom(true)
    }
  }, [messages])

  const handleSelectLead = (lead) => {
    setSelectedLead(lead)
    fetchMessages(lead)
  }


  const handleExtractConversation = async () => {
    if (!selectedLead || !currentPage?.ai_agent) {
      message.error('Chưa có khách hàng hoặc khách hàng chưa được cấu hình AI Agent')
      return
    }
    setExtracting(true)
    try {
      const res = await api.post('/ai_agents/knowledge/extract_conversation/', {
        lead_id: selectedLead.id,
        platform: 'facebook',
        agent_id: currentPage.ai_agent
      })
      if (res.data.status === 'success') {
        setExtractedText(res.data.extracted_text)
        setExtractModalVisible(true)
      } else {
        message.success(res.data.status || 'Đã đóng gói thành công!')
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Lỗi khi trích xuất hội thoại')
    } finally {
      setExtracting(false)
    }
  }

  const handleSaveExtractedText = async () => {
    if (!extractedText.trim()) {
      message.error('Nội dung không được để trống')
      return
    }
    setExtractSaving(true)
    try {
      await api.post('/ai_agents/knowledge/save_extracted_conversation/', {
        extracted_text: extractedText,
        agent_id: currentPage.ai_agent
      })
      message.success('Đã lưu thành công vào Cẩm nang AI!')
      setExtractModalVisible(false)
    } catch (err) {
      message.error(err.response?.data?.error || 'Lỗi khi lưu tài liệu')
    } finally {
      setExtractSaving(false)
    }
  }

  const handleSend = async (file = null, requestPhone = false, requestEmail = false) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    if (!msgText.trim() && !file && !requestPhone && !requestEmail && !selectedLead) return
    setSending(true)
    try {
      const formData = new FormData()
      if (msgText.trim()) formData.append('text', msgText.trim())
      if (file) formData.append('file', file)
      if (requestPhone) formData.append('request_phone', 'true')
      if (requestEmail) formData.append('request_email', 'true')

      const res = await api.post(`/facebook/leads/${selectedLead.id}/send-message/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setMessages(prev => [...prev, res.data])
      if (!file && !requestPhone && !requestEmail) setMsgText('')
      // Sau khi gửi: reset cờ để scroll xuống xem tin vừa gửi
      isUserScrollingUp.current = false
      fetchLeads(true)
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Không thể gửi tin nhắn.'
      if (errMsg.length > 50) {
        Modal.error({
          title: '⚠️ Facebook từ chối gửi tin nhắn',
          content: errMsg,
          okText: 'Đã hiểu',
          width: 460
        })
      } else {
        message.error(errMsg)
      }
    } finally { setSending(false) }
  }

  const handleAssign = async (userId) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    try {
      await api.post(`/facebook/leads/${selectedLead.id}/assign/`, { assigned_to: userId || null })
      message.success('Phân công thành công!')
      fetchLeads(true)
      fetchMessages(selectedLead, true)
    } catch { message.error('Lỗi khi phân công.') }
  }

  const handleCreateCustomer = async (values) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    setCreating(true)
    try {
      await api.post(`/facebook/leads/${selectedLead.id}/create-customer/`, values)
      message.success('Đã tạo Khách hàng thành công!')
      setCreateModal(false)
      fetchLeads()
      fetchMessages(selectedLead)
    } catch (err) {
      message.error(err.response?.data?.error || 'Không thể tạo khách hàng.')
    } finally { setCreating(false) }
  }

  const handleRescanPhone = async () => {
    try {
      const res = await api.post(`/facebook/leads/${selectedLead.id}/rescan-phone/`)
      message.success(res.data.detail)
      fetchLeads()
      setSelectedLead(prev => ({
        ...prev,
        detected_phone: res.data.phone,
        detected_email: res.data.email,
        detected_address: res.data.address
      }))
    } catch (err) {
      message.error(err.response?.data?.error || 'Không tìm thấy thông tin liên hệ.')
    }
  }

  const handleScanAllPhones = async () => {
    try {
      const res = await api.post('/facebook/leads/scan-phones/')
      message.success(res.data.detail)
      fetchLeads()
    } catch (err) {
      message.error(err.response?.data?.error || 'Lỗi khi quét thông tin liên hệ.')
    }
  }

  const fetchQuickMedia = async () => {
    setQuickMediaLoading(true)
    try {
      const res = await api.get('/facebook/quick-media/')
      setQuickMediaList(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch { message.error('Lỗi khi tải thư viện media mẫu.') }
    finally { setQuickMediaLoading(false) }
  }

  const handleUploadQuickMedia = async (file) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì!'); return false }
    if (!file) return false
    setQuickMediaUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', quickMediaTitle || file.name)
      formData.append('media_type', quickMediaType)
      formData.append('folder', quickMediaFolder || 'Chung')
      await api.post('/facebook/quick-media/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      message.success(`Đã tải lên "${file.name}"!`)
      setQuickMediaTitle('')
      fetchQuickMedia()
    } catch (err) {
      message.error(err.response?.data?.error || `Không thể tải file "${file.name}" lên.`)
    } finally { setQuickMediaUploading(false) }
    return false
  }

  const handleDeleteQuickMedia = async (id) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì!'); return }
    try {
      await api.delete(`/facebook/quick-media/${id}/`)
      message.success('Đã xóa mẫu!')
      fetchQuickMedia()
    } catch { message.error('Lỗi khi xóa.') }
  }

  const handleSendQuickMedia = async (asset) => {
    if (!selectedLead) {
      message.warning('Vui lòng chọn một hội thoại trước khi gửi!')
      setQuickMediaModal(false)
      return
    }
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì!'); return }
    setSending(true)
    setQuickMediaModal(false)
    try {
      const res = await api.post(`/facebook/leads/${selectedLead.id}/send-message/`, {
        text: '',
        attachment_url: asset.file_url,
        attachment_type: asset.media_type || 'image'
      })
      setMessages(prev => [...prev, res.data])
      message.success(`Đã gửi "${asset.title}" đến ${selectedLead.fb_user_name || 'Khách hàng'}!`)
      fetchLeads(true)
    } catch (err) {
      message.error(err.response?.data?.error || 'Không thể gửi mẫu.')
    } finally { setSending(false) }
  }

  const toggleSelectMediaItem = (id) => {
    setSelectedMediaIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSendBulkQuickMedia = async () => {
    if (!selectedLead) {
      message.warning('Vui lòng chọn một hội thoại trước khi gửi!')
      setQuickMediaModal(false)
      return
    }
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì!'); return }
    const selectedList = quickMediaList.filter(item => selectedMediaIds.has(item.id))
    if (selectedList.length === 0) return
    setSending(true)
    setQuickMediaModal(false)
    let count = 0
    for (const asset of selectedList) {
      try {
        const res = await api.post(`/facebook/leads/${selectedLead.id}/send-message/`, {
          text: '',
          attachment_url: asset.file_url,
          attachment_type: asset.media_type || 'image'
        })
        setMessages(prev => [...prev, res.data])
        count++
      } catch (err) {
        message.error(`Lỗi khi gửi mẫu "${asset.title}".`)
      }
    }
    if (count > 0) {
      message.success(`Đã gửi thành công ${count}/${selectedList.length} mẫu đã chọn tới khách hàng!`)
      fetchLeads(true)
      setSelectedMediaIds(new Set())
    }
    setSending(false)
  }

  const handleSyncHistory = async () => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì!'); return }
    const targets = syncTargetPage === 'all'
      ? pages
      : pages.filter(p => p.id === syncTargetPage)

    if (targets.length === 0) {
      message.warning('Không tìm thấy Trang Facebook nào để đồng bộ!')
      return
    }

    setSyncing(true)
    try {
      let totalConv = 0
      let totalMsg = 0
      for (const page of targets) {
        const res = await api.post(`/facebook/pages/${page.id}/sync-history/`, {
          max_conversations: syncMaxConv,
          limit_messages: syncLimitMsg,
        })
        totalConv += res.data?.data?.synced_conversations || 0
        totalMsg += res.data?.data?.synced_messages || 0
      }
      message.success(`🎉 Đã đồng bộ thành công ${totalConv} hội thoại và ${totalMsg} tin nhắn từ Meta!`)
      setSyncModal(false)
      fetchLeads()
    } catch (err) {
      message.error(err.response?.data?.error || 'Lỗi khi đồng bộ lịch sử.')
    } finally { setSyncing(false) }
  }

  const handleToggleStar = async () => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    if (!selectedLead) return
    try {
      const res = await api.post(`/facebook/leads/${selectedLead.id}/toggle-star/`)
      setSelectedLead(prev => ({ ...prev, is_starred: res.data.is_starred }))
      message.success(res.data.is_starred ? '★ Đã đánh dấu Khách VIP!' : '☆ Đã bỏ đánh dấu VIP.')
      fetchLeads(true)
    } catch { message.error('Lỗi khi đánh dấu VIP.') }
  }

  const handleUpdateLeadTags = async (tagIds) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    if (!selectedLead) return
    try {
      const res = await api.post(`/facebook/leads/${selectedLead.id}/update-tags/`, { tag_ids: tagIds })
      setSelectedLead(prev => ({ ...prev, tags: res.data.tags }))
      message.success('Đã cập nhật nhãn!')
      fetchLeads(true)
    } catch { message.error('Lỗi khi cập nhật nhãn.') }
  }

  const handleAddNote = async (content) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    if (!selectedLead || !content.trim()) return
    setNoteSaving(true)
    try {
      const res = await api.post(`/facebook/leads/${selectedLead.id}/add-note/`, { content: content.trim() })
      setSelectedLead(prev => ({
        ...prev,
        internal_notes: [res.data, ...(prev.internal_notes || [])]
      }))
      setNoteText('')
      message.success('Đã thêm ghi chú nội bộ!')
    } catch { message.error('Lỗi khi thêm ghi chú.') }
    finally { setNoteSaving(false) }
  }

  const handleCreateTag = async () => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    if (!newTagName.trim()) return
    try {
      await api.post('/facebook/lead-tags/', { name: newTagName.trim(), color: newTagColor })
      message.success('Đã tạo nhãn mới!')
      setNewTagName('')
      fetchTags()
    } catch { message.error('Lỗi khi tạo nhãn.') }
  }

  const handleDeleteTag = async (id) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    try {
      await api.delete(`/facebook/lead-tags/${id}/`)
      message.success('Đã xóa nhãn!')
      fetchTags()
      fetchLeads(true)
    } catch { message.error('Lỗi khi xóa nhãn.') }
  }

  const handleCreateQuickReply = async () => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    if (!qrShortcut.trim() || !qrContent.trim()) {
      message.warning('Vui lòng nhập phím tắt (VD: /hello) và nội dung mẫu!')
      return
    }
    let shortcut = qrShortcut.trim()
    if (!shortcut.startsWith('/')) shortcut = '/' + shortcut
    setQrSaving(true)
    try {
      await api.post('/facebook/quick-replies/', { shortcut, title: qrTitle || shortcut, content: qrContent })
      message.success('Đã tạo văn bản mẫu!')
      setQrShortcut('')
      setQrTitle('')
      setQrContent('')
      fetchQuickReplies()
    } catch (err) {
      message.error(err.response?.data?.error || 'Lỗi khi tạo văn bản mẫu.')
    } finally { setQrSaving(false) }
  }

  const handleDeleteQuickReply = async (id) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    try {
      await api.delete(`/facebook/quick-replies/${id}/`)
      message.success('Đã xóa văn bản mẫu!')
      fetchQuickReplies()
    } catch { message.error('Lỗi khi xóa văn bản mẫu.') }
  }

  const handleInsertQuickReply = (qr) => {
    setMsgText(prev => (prev ? prev + ' ' + qr.content : qr.content))
    setQuickReplyModal(false)
  }

  const handleMsgTextChange = (e) => {
    const val = e.target.value
    setMsgText(val)
    const parts = val.split(' ')
    const lastWord = parts[parts.length - 1]
    if (lastWord.startsWith('/') && lastWord.length > 1) {
      const match = quickRepliesList.find(q => q.shortcut.toLowerCase() === lastWord.toLowerCase())
      if (match) {
        parts[parts.length - 1] = match.content
        setMsgText(parts.join(' '))
        message.info(`⚡ Đã tự động gõ tắt ${match.shortcut} -> "${match.title}"`)
      }
    }
  }

  const filteredLeads = (leads || []).filter(l =>
    !search || (l.fb_user_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.last_message_preview || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.detected_phone || '').includes(search) ||
    (l.detected_email || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.detected_address || '').toLowerCase().includes(search.toLowerCase())
  )

  const currentPage = pages.find(p => p.id === selectedPage) || (pages.length === 1 ? pages[0] : null)

  const renderCustomerInfo = () => {
    return selectedLead ? (
      <>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <LeadAvatar
            lead={selectedLead}
            size={64}
            style={{ margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          />
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
            {selectedLead.is_starred && <StarFilled style={{ color: '#f59e0b', marginRight: 4 }} />}
            {selectedLead.fb_user_name || 'Khách hàng'}
          </div>
          <Tag color={selectedLead.is_customer_converted ? 'success' : 'warning'} style={{ marginTop: 6 }}>
            {selectedLead.is_customer_converted ? '✅ Đã có trong KH' : '⚠️ Chưa thêm KH'}
          </Tag>
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
          <Button
            type={selectedLead.is_starred ? "primary" : "default"}
            block
            icon={<StarFilled style={{ color: selectedLead.is_starred ? '#fff' : '#f59e0b' }} />}
            onClick={handleToggleStar}
            style={{ background: selectedLead.is_starred ? '#f59e0b' : '#fff', borderColor: '#f59e0b', color: selectedLead.is_starred ? '#fff' : '#d97706', marginBottom: 14, borderRadius: 20, fontWeight: 600 }}
          >
            {selectedLead.is_starred ? '★ Đang là Khách VIP' : '☆ Đánh dấu Khách VIP'}
          </Button>

          <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>NHÃN HỘI THOẠI (TAGS)</Text>
            <Button size="small" type="link" onClick={() => setManageTagsModal(true)} style={{ padding: 0, fontSize: 11 }}>+ Quản lý</Button>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Select
              mode="multiple"
              placeholder="Gắn nhãn cho khách hàng..."
              style={{ width: '100%' }}
              value={(selectedLead.tags || []).map(t => t.id)}
              onChange={handleUpdateLeadTags}
              tagRender={(props) => {
                const t = tagsList.find(item => item.id === props.value)
                return <Tag color={t?.color || '#3b82f6'} closable={props.closable} onClose={props.onClose} style={{ marginRight: 3, fontWeight: 600 }}>{props.label}</Tag>
              }}
              options={tagsList.map(t => ({ value: t.id, label: t.name }))}
            />
          </div>

          <Tabs
            defaultActiveKey="info"
            items={[
              {
                key: 'info',
                label: 'ℹ️ Thông tin',
                children: (
                  <div style={{ paddingTop: 6 }}>
                    <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>TRANG FACEBOOK</Text></div>
                    <div style={{ fontSize: 13, marginBottom: 12 }}>🟦 {selectedLead.page_name}</div>
                    
                    {selectedLead.ai_summary && (
                      <div style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f', padding: '8px 12px', borderRadius: 8 }}>
                        <div style={{ marginBottom: 4 }}><Text strong style={{ fontSize: 12, color: '#389e0d' }}>✨ AI Tóm tắt Hội thoại</Text></div>
                        <div style={{ fontSize: 13, color: '#595959', whiteSpace: 'pre-wrap' }}>
                          {selectedLead.ai_summary}
                        </div>
                        {selectedLead.ai_tags && selectedLead.ai_tags.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {selectedLead.ai_tags.map((t, idx) => (
                              <span key={idx} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)', color: '#fff', fontWeight: 600, boxShadow: '0 2px 4px rgba(99, 102, 241, 0.2)' }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {selectedLead.detected_phone && (
                      <>
                        <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>SỐ ĐIỆN THOẠI</Text></div>
                        <div style={{ fontSize: 13, marginBottom: 12, color: '#1877f2', fontWeight: 600 }}>📞 {selectedLead.detected_phone}</div>
                      </>
                    )}
                    {selectedLead.detected_email && (
                      <>
                        <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>EMAIL PHÁT HIỆN</Text></div>
                        <div style={{ fontSize: 13, marginBottom: 12, color: '#059669', fontWeight: 600 }}>📧 {selectedLead.detected_email}</div>
                      </>
                    )}
                    {selectedLead.detected_address && (
                      <>
                        <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>ĐỊA CHỈ PHÁT HIỆN</Text></div>
                        <div style={{ fontSize: 13, marginBottom: 12, color: '#d97706' }}>📍 {selectedLead.detected_address}</div>
                      </>
                    )}
                    {selectedLead.customer_name && (
                      <>
                        <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>KHÁCH HÀNG CRM</Text></div>
                        <div style={{ fontSize: 13, marginBottom: 12 }}>👤 {selectedLead.customer_name}</div>
                      </>
                    )}
                    <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>NHÂN VIÊN PHỤ TRÁCH</Text></div>
                    <div style={{ marginBottom: 16 }}>
                      <Select
                        placeholder="Chọn nhân viên"
                        style={{ width: '100%' }}
                        value={selectedLead.assigned_to || ''}
                        allowClear
                        disabled={!isCompanyAdmin && !hasPermission('facebook.assign')}
                        onChange={val => handleAssign(val || null)}
                        options={[{ value: '', label: '-- Chưa phân công --' }, ...(employees || []).map(e => ({ value: e.id, label: e.full_name || e.username }))]}
                      />
                    </div>
                    {!selectedLead.is_customer_converted && canCreateCustomer && (
                      <Button
                        type="primary"
                        block
                        icon={<UserAddOutlined />}
                        onClick={() => {
                          if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì!'); return }
                          createForm.setFieldsValue({
                            phone: selectedLead.detected_phone || '',
                            name: selectedLead.fb_user_name || '',
                            email: selectedLead.detected_email || '',
                            address: selectedLead.detected_address || ''
                          })
                          setCreateModal(true)
                        }}
                        style={{ background: '#1877f2', marginTop: 8, borderRadius: 20 }}
                      >
                        Tạo Khách hàng CRM
                      </Button>
                    )}
                  </div>
                )
              },
              {
                key: 'notes',
                label: `📝 Ghi chú (${selectedLead.internal_notes?.length || 0})`,
                children: (
                  <div style={{ paddingTop: 6 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                      <Input.TextArea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Ghi chú nội bộ (chỉ Sale thấy)..."
                        autoSize={{ minRows: 2, maxRows: 4 }}
                        style={{ borderRadius: 8, fontSize: 12 }}
                      />
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        loading={noteSaving}
                        onClick={() => handleAddNote(noteText)}
                        disabled={!noteText.trim()}
                        style={{ background: '#10b981', borderRadius: 8 }}
                      />
                    </div>
                    <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(selectedLead.internal_notes || []).length === 0 ? (
                        <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block', margin: '20px 0' }}>Chưa có ghi chú nào</Text>
                      ) : (
                        (selectedLead.internal_notes || []).map((note, idx) => (
                          <div key={note.id || idx} style={{ background: '#fff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                              <Text strong style={{ fontSize: 11, color: '#334155' }}>👤 {note.created_by_name || 'Sale'}</Text>
                              <Text type="secondary" style={{ fontSize: 10 }}>{formatTime(note.created_at)}</Text>
                            </div>
                            <div style={{ color: '#1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{note.content}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              }
            ]}
          />
        </div>
      </>
    ) : (
      <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40 }}>
        <UserOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
        <span style={{ fontSize: 13 }}>Chọn hội thoại để xem thông tin</span>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, flex: 1 }}>
      {/* Header */}
      {(!isMobile || !selectedLead) && (
      <div style={{ padding: '10px 16px', background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ fontSize: 22, color: '#1877f2', fontWeight: 900, flexShrink: 0 }}>𝐟</span>
        <span style={{ fontWeight: 700, fontSize: 15, flexShrink: 0 }}>Facebook Inbox</span>
        {pages.length > 1 && (
          <Select
            value={selectedPage}
            onChange={setSelectedPage}
            style={{ width: 170, flexShrink: 0 }}
            size="small"
          >
            <Select.Option value="all">🔀 Tất cả Trang</Select.Option>
            {pages.map(p => (
              <Select.Option key={p.id} value={p.id}>{p.page_name}</Select.Option>
            ))}
          </Select>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {currentPage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 16, background: currentPage.is_ai_active ? '#dcfce7' : '#fee2e2', padding: '4px 12px', borderRadius: 20, border: `1px solid ${currentPage.is_ai_active ? '#bbf7d0' : '#fecaca'}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: currentPage.is_ai_active ? '#16a34a' : '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                {currentPage.is_ai_active ? <><RobotOutlined /> AI Đang Bật</> : <><StopOutlined /> AI Đang Tắt</>}
              </span>
              <Switch
                size="small"
                checked={currentPage.is_ai_active}
                onChange={(checked) => handleToggleGlobalAi(currentPage.id, checked)}
                style={{ background: currentPage.is_ai_active ? '#10b981' : '#ccc' }}
              />
            </div>
          )}
          {!canViewAllInbox && (
            <Tooltip title="Bạn đang ở chế độ 'Giỏ của tôi': Chỉ thấy hội thoại chưa phân công + hội thoại được giao cho bạn. Liên hệ Admin để được cấp quyền xem toàn bộ.">
              <Tag color="blue" style={{ borderRadius: 20, cursor: 'default', fontWeight: 600, fontSize: 11, margin: 0 }}>
                🧑 Giỏ của tôi
              </Tag>
            </Tooltip>
          )}
          <Button
            size="small"
            style={{ background: '#3b82f6', color: '#fff', borderColor: '#3b82f6' }}
            icon={<ReloadOutlined />}
            onClick={handleScanAllPhones}
          >
            Quét tất cả liên hệ
          </Button>
          <Button
            size="small"
            type="primary"
            style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
            icon={<HistoryOutlined />}
            onClick={() => {
              setSyncTargetPage(selectedPage !== 'all' ? selectedPage : (pages[0]?.id || 'all'))
              setSyncModal(true)
            }}
          >
            Đồng bộ lịch sử
          </Button>
          <Button
            size="small"
            style={{ background: '#10b981', color: '#fff', borderColor: '#10b981' }}
            icon={<FolderOpenOutlined />}
            onClick={() => {
              fetchQuickMedia()
              setQuickMediaModal(true)
            }}
          >
            Thư viện mẫu
          </Button>
          {!isMobile && (
            <>
              <Button
                size="small"
                type={hasUnreadOnly ? 'primary' : 'default'}
                danger={hasUnreadOnly}
                onClick={() => setHasUnreadOnly(!hasUnreadOnly)}
              >
                {hasUnreadOnly ? '🔴 Chưa đọc' : 'Chưa đọc'}
              </Button>
              <Button
                size="small"
                type={hasPhoneOnly ? 'primary' : 'default'}
                icon={<PhoneOutlined />}
                onClick={() => setHasPhoneOnly(!hasPhoneOnly)}
              >
                {hasPhoneOnly ? 'Có SĐT' : 'Lọc SĐT'}
              </Button>
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                size="small"
                style={{ width: 130 }}
                placeholder="Lọc trạng thái"
              >
                <Select.Option value="">Tất cả trạng thái</Select.Option>
                <Select.Option value="not_added">Chưa thêm KH</Select.Option>
                <Select.Option value="converted">Đã có trong KH</Select.Option>
              </Select>
              <Button
                size="small"
                type={isArchivedOnly ? 'primary' : 'default'}
                onClick={() => setIsArchivedOnly(!isArchivedOnly)}
                style={isArchivedOnly ? { background: '#f97316', borderColor: '#f97316' } : {}}
              >
                {isArchivedOnly ? 'Lead rác (đã ẩn)' : '🗑️ Kho rác'}
              </Button>
            </>
          )}
          <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchLeads()} title="Làm mới" />
        </div>
      </div>
      )}

      {/* Main 4-column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row', minHeight: 0 }}>
        {/* Pancake-style Vertical Filter Toolbar */}
        <div className="hide-scrollbar" style={{
          width: isMobile ? '100%' : 52,
          height: isMobile ? 52 : 'auto',
          background: '#0f172a',
          display: isMobile && selectedLead ? 'none' : 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          alignItems: 'center',
          padding: isMobile ? '0 12px' : '12px 0',
          gap: 16,
          flexShrink: 0,
          borderRight: isMobile ? 'none' : '1px solid #1e293b',
          borderBottom: isMobile ? '1px solid #1e293b' : 'none',
          overflowX: isMobile ? 'auto' : 'hidden',
          overflowY: isMobile ? 'hidden' : 'auto',
          zIndex: 10,
        }}>
          {/* 1. Tất cả tin nhắn (Reset/Mặc định) */}
          <Tooltip title="Tất cả hội thoại" placement="right">
            <div
              onClick={() => {
                setReplyFilter('')
                setSortBy('')
                setHasUnreadOnly(false)
                setHasPhoneOnly(false)
                setPhoneFilterMode('all')
                setStatusFilter('')
                setIsArchivedOnly(false)
                setIsStarredOnly(false)
                setTagFilter('all')
                setAssignedToFilter('all')
              }}
              style={{
                width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: (!replyFilter && !sortBy && !hasUnreadOnly && phoneFilterMode === 'all' && !hasPhoneOnly && !statusFilter && !isArchivedOnly && !isStarredOnly && tagFilter === 'all' && assignedToFilter === 'all') ? '#2563eb' : 'transparent',
                color: (!replyFilter && !sortBy && !hasUnreadOnly && phoneFilterMode === 'all' && !hasPhoneOnly && !statusFilter && !isArchivedOnly && !isStarredOnly && tagFilter === 'all' && assignedToFilter === 'all') ? '#fff' : '#94a3b8',
                transition: 'all 0.2s',
              }}
            >
              <MessageOutlined style={{ fontSize: 18 }} />
            </div>
          </Tooltip>

          {/* 2. Lọc chưa trả lời (Pancake Clock popover) */}
          <Popover
            placement="rightTop"
            title={<span style={{ fontWeight: 700, color: '#1e293b' }}>🕒 Lọc chưa trả lời</span>}
            content={
              <div style={{ minWidth: 230, padding: 4 }}>
                <Radio.Group
                  value={sortBy === 'waiting_longest' ? 'waiting_longest' : (replyFilter || 'all')}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === 'all') {
                      setReplyFilter('')
                      setSortBy('')
                    } else if (val === 'unanswered') {
                      setReplyFilter('unanswered')
                      setSortBy('')
                    } else if (val === 'waiting_longest') {
                      setReplyFilter('unanswered')
                      setSortBy('waiting_longest')
                    } else if (val === 'read_unanswered') {
                      setReplyFilter('read_unanswered')
                      setSortBy('')
                    }
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <Radio value="all" style={{ fontWeight: 500 }}>🌐 Tất cả tin nhắn</Radio>
                  <Radio value="unanswered" style={{ fontWeight: 500, color: '#2563eb' }}>⏱️ Giảm dần theo thời gian (Khách chờ)</Radio>
                  <Radio value="waiting_longest" style={{ fontWeight: 600, color: '#d97706' }}>⏳ Đợi phản hồi lâu nhất</Radio>
                  <Radio value="read_unanswered" style={{ fontWeight: 500, color: '#9333ea' }}>👀 Đã đọc nhưng chưa trả lời</Radio>
                </Radio.Group>
              </div>
            }
            trigger="click"
          >
            <Tooltip title="Lọc chưa trả lời (Theo thời gian / Đợi lâu nhất)" placement="right">
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: (replyFilter || sortBy) ? '#f59e0b' : 'transparent',
                  color: (replyFilter || sortBy) ? '#fff' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <ClockCircleOutlined style={{ fontSize: 18 }} />
              </div>
            </Tooltip>
          </Popover>

          {/* Khách VIP (Starred) */}
          <Tooltip title="Lọc Khách VIP (Đánh dấu sao)" placement="right">
            <div
              onClick={() => setIsStarredOnly(!isStarredOnly)}
              style={{
                width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isStarredOnly ? '#f59e0b' : 'transparent',
                color: isStarredOnly ? '#fff' : '#94a3b8',
                transition: 'all 0.2s',
              }}
            >
              <StarFilled style={{ fontSize: 18, color: isStarredOnly ? '#fff' : '#f59e0b' }} />
            </div>
          </Tooltip>

          {/* Lọc theo Nhãn (Tags) */}
          <Popover
            placement="rightTop"
            title={<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontWeight: 700, color: '#1e293b' }}>🏷️ Lọc theo Nhãn Tag</span><Button size="small" type="link" onClick={() => setManageTagsModal(true)} style={{ padding: 0 }}>Quản lý</Button></div>}
            content={
              <div style={{ minWidth: 200, padding: 4, maxHeight: 300, overflowY: 'auto' }}>
                <Radio.Group
                  value={tagFilter}
                  onChange={e => setTagFilter(e.target.value)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <Radio value="all" style={{ fontWeight: 500 }}>🌐 Tất cả nhãn</Radio>
                  {tagsList.map(t => (
                    <Radio key={t.id} value={t.id}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: t.color || '#3b82f6', marginRight: 6 }} />
                      <span style={{ fontWeight: 500 }}>{t.name}</span>
                    </Radio>
                  ))}
                </Radio.Group>
              </div>
            }
            trigger="click"
          >
            <Tooltip title="Lọc theo Nhãn Tag" placement="right">
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: tagFilter !== 'all' ? '#10b981' : 'transparent',
                  color: tagFilter !== 'all' ? '#fff' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <TagOutlined style={{ fontSize: 18 }} />
              </div>
            </Tooltip>
          </Popover>

          {/* Lọc theo Sale phụ trách */}
          <Popover
            placement="rightTop"
            title={<span style={{ fontWeight: 700, color: '#1e293b' }}>👤 Phân công Sale</span>}
            content={
              <div style={{ minWidth: 200, padding: 4, maxHeight: 300, overflowY: 'auto' }}>
                <Radio.Group
                  value={assignedToFilter}
                  onChange={e => setAssignedToFilter(e.target.value)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <Radio value="all" style={{ fontWeight: 500 }}>🌐 Tất cả nhân viên</Radio>
                  <Radio value="me" style={{ fontWeight: 600, color: '#2563eb' }}>🧑 Giỏ hội thoại của tôi</Radio>
                  <Radio value="unassigned" style={{ fontWeight: 500, color: '#f59e0b' }}>❓ Chưa phân công</Radio>
                  {employees.map(emp => (
                    <Radio key={emp.id} value={emp.id} style={{ fontWeight: 500 }}>
                      👤 {emp.full_name || emp.username}
                    </Radio>
                  ))}
                </Radio.Group>
              </div>
            }
            trigger="click"
          >
            <Tooltip title="Lọc theo Sale phụ trách" placement="right">
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: assignedToFilter !== 'all' ? '#8b5cf6' : 'transparent',
                  color: assignedToFilter !== 'all' ? '#fff' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <UserSwitchOutlined style={{ fontSize: 18 }} />
              </div>
            </Tooltip>
          </Popover>

          {/* 3. Tin nhắn chưa đọc */}
          <Tooltip title="Tin nhắn chưa đọc" placement="right">
            <div
              onClick={() => setHasUnreadOnly(!hasUnreadOnly)}
              style={{
                width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: hasUnreadOnly ? '#ef4444' : 'transparent',
                color: hasUnreadOnly ? '#fff' : '#94a3b8',
                transition: 'all 0.2s',
              }}
            >
              <Badge dot={!hasUnreadOnly} offset={[2, -2]} color="#ef4444">
                <MailOutlined style={{ fontSize: 18, color: hasUnreadOnly ? '#fff' : '#94a3b8' }} />
              </Badge>
            </div>
          </Tooltip>

          {/* 4. Lọc số điện thoại */}
          <Popover
            placement="rightTop"
            title={<span style={{ fontWeight: 700, color: '#1e293b' }}>📞 Lọc số điện thoại</span>}
            content={
              <div style={{ minWidth: 200, padding: 4 }}>
                <Radio.Group
                  value={phoneFilterMode !== 'all' ? phoneFilterMode : (hasPhoneOnly ? 'has_phone' : 'all')}
                  onChange={e => {
                    const val = e.target.value
                    setPhoneFilterMode(val)
                    setHasPhoneOnly(val === 'has_phone')
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <Radio value="all" style={{ fontWeight: 500 }}>🌐 Tất cả hội thoại</Radio>
                  <Radio value="has_phone" style={{ fontWeight: 600, color: '#10b981' }}>📞 Có số điện thoại</Radio>
                  <Radio value="no_phone" style={{ fontWeight: 500, color: '#ef4444' }}>❌ Chưa có số điện thoại</Radio>
                </Radio.Group>
              </div>
            }
            trigger="click"
          >
            <Tooltip title="Lọc số điện thoại" placement="right">
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: (phoneFilterMode !== 'all' || hasPhoneOnly) ? '#10b981' : 'transparent',
                  color: (phoneFilterMode !== 'all' || hasPhoneOnly) ? '#fff' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <PhoneOutlined style={{ fontSize: 18 }} />
              </div>
            </Tooltip>
          </Popover>

          {/* 5. Phân loại Khách hàng CRM */}
          <Popover
            placement="rightTop"
            title={<span style={{ fontWeight: 700, color: '#1e293b' }}>👥 Trạng thái CRM</span>}
            content={
              <div style={{ minWidth: 200, padding: 4 }}>
                <Radio.Group
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <Radio value="" style={{ fontWeight: 500 }}>🌐 Tất cả</Radio>
                  <Radio value="not_added" style={{ fontWeight: 500, color: '#f59e0b' }}>⚠️ Chưa thêm vào CRM</Radio>
                  <Radio value="converted" style={{ fontWeight: 600, color: '#10b981' }}>✓ Đã có trong CRM</Radio>
                </Radio.Group>
              </div>
            }
            trigger="click"
          >
            <Tooltip title="Lọc theo trạng thái CRM" placement="right">
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: statusFilter ? '#8b5cf6' : 'transparent',
                  color: statusFilter ? '#fff' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <TeamOutlined style={{ fontSize: 18 }} />
              </div>
            </Tooltip>
          </Popover>

          {/* 6. Kho rác / Đã ẩn */}
          <Tooltip title="Kho rác / Hội thoại đã ẩn" placement={isMobile ? "bottom" : "right"}>
            <div
              onClick={() => setIsArchivedOnly(!isArchivedOnly)}
              style={{
                width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isArchivedOnly ? '#f97316' : 'transparent',
                color: isArchivedOnly ? '#fff' : '#94a3b8',
                marginTop: isMobile ? 0 : 'auto',
                marginLeft: isMobile ? 'auto' : 0,
                transition: 'all 0.2s',
              }}
            >
              <FolderOutlined style={{ fontSize: 18 }} />
            </div>
          </Tooltip>
        </div>

        {/* Left: Conversation List */}
        {/* Drag handle between filter sidebar and left column — unused, left col already flex */}
        {(!isMobile || !selectedLead) && (
        <div style={{ width: isMobile ? '100%' : leftColWidth, flex: isMobile ? 1 : 'none', height: isMobile ? 'auto' : '100%', flexShrink: isMobile ? 1 : 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff', minWidth: 0, borderRight: 'none' }}>
          {/* Active Filter Banner */}
          {(replyFilter || sortBy || hasUnreadOnly || (phoneFilterMode !== 'all' && phoneFilterMode !== '') || hasPhoneOnly || statusFilter || isArchivedOnly || isStarredOnly || tagFilter !== 'all' || assignedToFilter !== 'all') && (
            <div style={{ padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Lọc:</span>
              {replyFilter === 'unanswered' && sortBy !== 'waiting_longest' && <Tag color="blue" closable onClose={() => setReplyFilter('')} style={{ fontSize: 11, margin: 1 }}>⏱️ Khách chờ</Tag>}
              {sortBy === 'waiting_longest' && <Tag color="orange" closable onClose={() => { setSortBy(''); setReplyFilter(''); }} style={{ fontSize: 11, margin: 1 }}>⏳ Đợi lâu nhất</Tag>}
              {replyFilter === 'read_unanswered' && <Tag color="purple" closable onClose={() => setReplyFilter('')} style={{ fontSize: 11, margin: 1 }}>👀 Đã đọc</Tag>}
              {isStarredOnly && <Tag color="gold" closable onClose={() => setIsStarredOnly(false)} style={{ fontSize: 11, margin: 1 }}>★ Khách VIP</Tag>}
              {tagFilter !== 'all' && <Tag color="green" closable onClose={() => setTagFilter('all')} style={{ fontSize: 11, margin: 1 }}>🏷️ {tagsList.find(t => t.id == tagFilter)?.name || 'Tag'}</Tag>}
              {assignedToFilter !== 'all' && <Tag color="purple" closable onClose={() => setAssignedToFilter('all')} style={{ fontSize: 11, margin: 1 }}>👤 {assignedToFilter === 'me' ? 'Của tôi' : assignedToFilter === 'unassigned' ? 'Chưa phân công' : employees.find(e => e.id == assignedToFilter)?.full_name || 'Sale'}</Tag>}
              {hasUnreadOnly && <Tag color="red" closable onClose={() => setHasUnreadOnly(false)} style={{ fontSize: 11, margin: 1 }}>🔴 Chưa đọc</Tag>}
              {(phoneFilterMode === 'has_phone' || hasPhoneOnly) && <Tag color="green" closable onClose={() => { setPhoneFilterMode('all'); setHasPhoneOnly(false); }} style={{ fontSize: 11, margin: 1 }}>📞 Có SĐT</Tag>}
              {phoneFilterMode === 'no_phone' && <Tag color="default" closable onClose={() => setPhoneFilterMode('all')} style={{ fontSize: 11, margin: 1 }}>❌ Không SĐT</Tag>}
              {statusFilter === 'not_added' && <Tag color="warning" closable onClose={() => setStatusFilter('')} style={{ fontSize: 11, margin: 1 }}>Chưa vào CRM</Tag>}
              {statusFilter === 'converted' && <Tag color="success" closable onClose={() => setStatusFilter('')} style={{ fontSize: 11, margin: 1 }}>Đã vào CRM</Tag>}
              {isArchivedOnly && <Tag color="orange" closable onClose={() => setIsArchivedOnly(false)} style={{ fontSize: 11, margin: 1 }}>🗑️ Kho rác</Tag>}
              <span
                style={{ fontSize: 11, color: '#2563eb', cursor: 'pointer', marginLeft: 'auto', fontWeight: 600 }}
                onClick={() => {
                  setReplyFilter('')
                  setSortBy('')
                  setHasUnreadOnly(false)
                  setHasPhoneOnly(false)
                  setPhoneFilterMode('all')
                  setStatusFilter('')
                  setIsArchivedOnly(false)
                  setIsStarredOnly(false)
                  setTagFilter('all')
                  setAssignedToFilter('all')
                }}
              >
                Xóa lọc
              </span>
            </div>
          )}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
              placeholder="Tìm kiếm hội thoại..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              size="small"
              style={{ borderRadius: 20 }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 16 }}><Skeleton active avatar paragraph={{ rows: 2 }} /><Skeleton active avatar paragraph={{ rows: 2 }} /></div>
            ) : filteredLeads.length === 0 ? (
              <Empty description="Chưa có hội thoại" style={{ marginTop: 40 }} />
            ) : (
              filteredLeads.map(lead => (
                <ConvItem
                  key={lead.id}
                  lead={lead}
                  selected={selectedLead?.id === lead.id}
                  onClick={() => handleSelectLead(lead)}
                />
              ))
            )}
          </div>
        </div>
        )}

        {/* Drag handle: Left | Mid */}
        {!isMobile && (
        <div
          onMouseDown={startDragLeft}
          style={{
            width: 5, flexShrink: 0, cursor: 'col-resize', background: 'transparent',
            borderLeft: '1px solid #e5e7eb', transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        />
        )}

        {/* Middle: Chat */}
        {(!isMobile || selectedLead) && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', minWidth: 0, width: isMobile ? '100%' : 'auto', minHeight: 0 }}>
          {!selectedLead ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexDirection: 'column', gap: 12 }}>
              <MessageOutlined style={{ fontSize: 48, color: '#d1d5db' }} />
              <span>Chọn một hội thoại để xem tin nhắn</span>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0, flexShrink: 0 }}>
                {isMobile && (
                  <Space size={0}>
                    <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setSelectedLead(null)} style={{ padding: 4 }} />
                    <Button type="text" icon={<InfoCircleOutlined />} onClick={() => setInfoDrawerVisible(true)} style={{ padding: 4, marginRight: 0, color: '#1877f2' }} />
                  </Space>
                )}
                <LeadAvatar lead={selectedLead} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong style={{ fontSize: 14, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedLead.fb_user_name || 'Khách hàng'}
                  </Text>
                  <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedLead.page_name}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0, maxWidth: '100%' }}>
                  <div style={{ marginRight: 12, display: 'flex', alignItems: 'center', gap: 6, background: (currentPage?.is_ai_active && selectedLead.is_ai_active) ? '#f6ffed' : '#fff1f0', padding: '4px 12px', borderRadius: 20, border: `1px solid ${(currentPage?.is_ai_active && selectedLead.is_ai_active) ? '#b7eb8f' : '#ffa39e'}` }}>
                    <Switch size="small" disabled={!currentPage?.is_ai_active} checked={currentPage?.is_ai_active && selectedLead.is_ai_active} onChange={handleToggleAi} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: (currentPage?.is_ai_active && selectedLead.is_ai_active) ? '#389e0d' : '#cf1322', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {(currentPage?.is_ai_active && selectedLead.is_ai_active) ? <><RobotOutlined /> AI Đang Trực</> : <><UserOutlined /> Sale Tiếp Quản</>}
                    </span>
                  </div>
                  {companySettings?.enable_chat_extraction && (
                    <Tooltip title="Trích xuất các đoạn chat hay thành kiến thức cho AI học">
                      <Button
                        size="small"
                        type="dashed"
                        style={{ color: '#d48806', borderColor: '#ffe58f', background: '#fffbe6' }}
                        icon={<span style={{fontSize: '12px'}}>⚡</span>}
                        onClick={handleExtractConversation}
                        loading={extracting}
                      >
                        {isMobile ? 'Lưu' : 'Đóng gói vào RAG'}
                      </Button>
                    </Tooltip>
                  )}
                  {!selectedLead.is_customer_converted && canCreateCustomer && (
                    <Button
                      type="primary"
                      size="small"
                      icon={<UserAddOutlined />}
                      onClick={() => {
                        if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì!'); return }
                        createForm.setFieldsValue({
                          phone: selectedLead.detected_phone || '',
                          name: selectedLead.fb_user_name || '',
                          email: selectedLead.detected_email || '',
                          address: selectedLead.detected_address || ''
                        })
                        setCreateModal(true)
                      }}
                      style={{ background: '#1877f2', borderRadius: 16 }}
                    >
                      Tạo KH
                    </Button>
                  )}
                  {selectedLead.detected_phone && (
                    <Tag color="blue" style={{ margin: 0, lineHeight: '26px', fontSize: 12 }}>📞 {selectedLead.detected_phone}</Tag>
                  )}
                  {selectedLead.detected_email && (
                    <Tag color="green" style={{ margin: 0, lineHeight: '26px', fontSize: 12 }}>📧 {selectedLead.detected_email}</Tag>
                  )}
                  {selectedLead.detected_address && (
                    <Tag color="orange" style={{ margin: 0, lineHeight: '26px', fontSize: 12 }} title={selectedLead.detected_address}>📍 {selectedLead.detected_address.length > 25 ? selectedLead.detected_address.substring(0, 25) + '...' : selectedLead.detected_address}</Tag>
                  )}
                  <Tooltip title="Quét lại toàn bộ tin nhắn cũ để tìm SĐT, Email, Địa chỉ">
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={handleRescanPhone}
                      style={{ borderRadius: 16 }}
                    >
                      Quét LH
                    </Button>
                  </Tooltip>
                  {canDeleteConversation && (
                    <Tooltip title="Xóa hội thoại">
                      <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          Modal.confirm({
                            title: 'Xóa hội thoại này?',
                            content: 'Toàn bộ tin nhắn với khách hàng này sẽ bị xóa vĩnh viễn.',
                            okText: 'Xóa',
                            okType: 'danger',
                            cancelText: 'Hủy',
                            onOk: async () => {
                              if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì dữ liệu. Chức năng này tạm thời bị khóa!'); return }
                              try {
                                await api.delete(`/facebook/leads/${selectedLead.id}/`)
                                message.success('Đã xóa hội thoại')
                                setSelectedLead(null)
                                fetchLeads()
                              } catch (err) {
                                message.error(err.response?.data?.error || 'Lỗi khi xóa hội thoại')
                              }
                            }
                          })
                        }}
                      />
                    </Tooltip>
                  )}
                </div>
              </div>

              {/* Contact detected banner */}
              {(selectedLead.detected_phone || selectedLead.detected_email || selectedLead.detected_address) && !selectedLead.is_customer_converted && (
                <div style={{ padding: '8px 16px', background: '#fffbeb', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PhoneOutlined style={{ color: '#f59e0b' }} />
                  <Text style={{ color: '#92400e', fontSize: 13 }}>
                    Phát hiện liên hệ: <b>{selectedLead.detected_phone || '---'}</b> | 📧 <b>{selectedLead.detected_email || '---'}</b> | 📍 <b>{selectedLead.detected_address || '---'}</b> 
                    {canCreateCustomer && <span> — Bấm <b>"Tạo khách hàng"</b> để thêm vào CRM</span>}
                  </Text>
                </div>
              )}
              {selectedLead.is_customer_converted && (
                <div style={{ padding: '8px 16px', background: '#ecfdf5', borderBottom: '1px solid #6ee7b7', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✅</span>
                  <Text style={{ color: '#065f46', fontSize: 13 }}>
                    Khách hàng đã có trong hệ thống CRM: <b>{selectedLead.customer_name || selectedLead.fb_user_name || 'Khách hàng CRM'}</b>
                  </Text>
                </div>
              )}

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                style={{ flex: 1, overflowY: 'auto', padding: '16px 0', background: '#f9fafb', minHeight: 0 }}
              >
                {msgLoading ? <Spin style={{ display: 'block', margin: 'auto', marginTop: 40 }} /> : (
                  <>
                    {(messages || []).length === 0 && <Empty description="Chưa có tin nhắn" style={{ marginTop: 40 }} />}
                    {(messages || []).map((msg, index) => {
                      if (!msg) return null
                      const nextMsg = messages[index + 1]
                      const showAvatar = !nextMsg || nextMsg.sender_type !== msg.sender_type
                      return <MessageBubble key={msg.id || index} msg={msg} lead={selectedLead} showAvatar={showAvatar} />
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Message input & toolbar */}
              <div style={{ padding: '10px 14px', borderTop: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
                {/* Hàng ngang phía trên khung nhập chat (3 nút biểu tượng icon: Yêu cầu SĐT, Yêu cầu Email, Văn bản mẫu) */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <Tooltip title="Yêu cầu khách chia sẻ số điện thoại" placement="top">
                    <Button
                      size="small"
                      shape="circle"
                      icon={<PhoneOutlined />}
                      onClick={() => handleSend(null, true, false)}
                      loading={sending}
                      style={{ color: '#1877f2', borderColor: '#1877f2' }}
                    />
                  </Tooltip>
                  <Tooltip title="Yêu cầu khách chia sẻ Email" placement="top">
                    <Button
                      size="small"
                      shape="circle"
                      icon={<MailOutlined />}
                      onClick={() => handleSend(null, false, true)}
                      loading={sending}
                      style={{ color: '#10b981', borderColor: '#10b981' }}
                    />
                  </Tooltip>
                  <Tooltip title="⚡ Văn bản mẫu (/gõ tắt)" placement="top">
                    <Button
                      size="small"
                      shape="circle"
                      icon={<ThunderboltOutlined />}
                      onClick={() => setQuickReplyModal(true)}
                      style={{ color: '#c2410c', borderColor: '#fdba74', background: '#fff7ed' }}
                    />
                  </Tooltip>
                </div>

                {/* Hàng ngang khung nhập chat + Nút đính kèm & Gửi bên phải */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <Input.TextArea
                    value={msgText}
                    onChange={handleMsgTextChange}
                    placeholder={canChat ? "Nhập tin nhắn (hoặc gõ /phimtat)..." : "Bạn không có quyền gửi tin nhắn"}
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    style={{ borderRadius: 18, resize: 'none', flex: 1, padding: '8px 12px' }}
                    onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); handleSend() } }}
                    disabled={sending || !canChat}
                  />
                  {/* Đính kèm ảnh và tài liệu ở bên phải (nằm ngang như bình thường) */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 2 }}>
                    <Upload fileList={[]} beforeUpload={(file) => { handleSend(file, false); return false; }} showUploadList={false} multiple={true} accept="image/*" disabled={!canChat}>
                      <Button shape="circle" icon={<PictureOutlined style={{ fontSize: 16 }} />} disabled={sending || !canChat} title="Gửi hình ảnh (Chọn nhiều được)" />
                    </Upload>
                    <Upload fileList={[]} beforeUpload={(file) => { handleSend(file, false); return false; }} showUploadList={false} multiple={true} disabled={!canChat}>
                      <Button shape="circle" icon={<PaperClipOutlined style={{ fontSize: 16 }} />} disabled={sending || !canChat} title="Gửi file tài liệu (Chọn nhiều được)" />
                    </Upload>
                    <Button
                      type="primary"
                      icon={<SendOutlined style={{ fontSize: 16 }} />}
                      onClick={() => handleSend()}
                      loading={sending}
                      disabled={(!msgText.trim() && !sending) || !canChat}
                      style={{ background: '#1877f2', borderRadius: '50%', width: 36, height: 36, padding: 0, flexShrink: 0 }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        )}

        {/* Drag handle: Mid | Right */}
        {!isMobile && selectedLead && (
        <div
          onMouseDown={startDragRight}
          style={{
            width: 5, flexShrink: 0, cursor: 'col-resize', background: 'transparent',
            borderLeft: '1px solid #e5e7eb', transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        />
        )}
        {/* Right: CRM Customer Profile */}
        {!isMobile && selectedLead && (
        <div style={{ width: rightColWidth, flexShrink: 0, background: '#fafafa', overflowY: 'auto', padding: 12, minWidth: 0 }}>
          {renderCustomerInfo()}
        </div>
        )}
      </div>

      {/* Mobile Drawer for Customer Info */}
      <Drawer
        title={<Space><InfoCircleOutlined style={{ color: '#1877f2' }} /> Thông tin khách hàng</Space>}
        placement="right"
        onClose={() => setInfoDrawerVisible(false)}
        open={infoDrawerVisible}
        width={320}
        styles={{ body: { padding: 12 } }}
      >
        {renderCustomerInfo()}
      </Drawer>

      {/* Sync History Modal */}
      <Modal
        open={syncModal}
        title="🔄 Đồng bộ lịch sử hội thoại từ Facebook"
        onCancel={() => setSyncModal(false)}
        onOk={handleSyncHistory}
        confirmLoading={syncing}
        okText="Bắt đầu đồng bộ"
        cancelText="Đóng"
        width={560}
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ color: '#4b5563', fontSize: 13, marginBottom: 16 }}>
            Hệ thống sẽ kéo các hội thoại cũ và tin nhắn gần nhất trực tiếp từ Graph API. Quá trình này chỉ mất 3-5 giây nhờ cơ chế tối giới hạn, không gây tải nặng hay đầy DB.
          </p>
          <Form layout="vertical">
            <Form.Item label="Chọn Trang Facebook cần đồng bộ">
              <Select value={syncTargetPage} onChange={setSyncTargetPage}>
                {pages.length > 1 && <Select.Option value="all">🔀 Tất cả Trang quản lý</Select.Option>}
                {pages.map(p => (
                  <Select.Option key={p.id} value={p.id}>🟦 {p.page_name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Số hội thoại tối đa"
                  tooltip="Số lượng hội thoại gần nhất kéo về (mặc định 50 - 200)"
                >
                  <InputNumber
                    min={1}
                    max={1000}
                    value={syncMaxConv}
                    onChange={setSyncMaxConv}
                    style={{ width: '100%' }}
                    addonAfter="hội thoại"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Số tin nhắn / hội thoại"
                  tooltip="Số tin nhắn gần nhất mỗi hội thoại để Sale hiểu ngữ cảnh (mặc định 50)"
                >
                  <InputNumber
                    min={1}
                    max={500}
                    value={syncLimitMsg}
                    onChange={setSyncLimitMsg}
                    style={{ width: '100%' }}
                    addonAfter="tin nhắn"
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </div>
      </Modal>

      {/* Quick Media Library Modal */}
      <Modal
        open={quickMediaModal}
        title="📁 Thư viện mẫu & gửi nhanh"
        onCancel={() => setQuickMediaModal(false)}
        footer={[
          selectedMediaIds.size > 0 && (
            <Button key="bulk-send" type="primary" icon={<SendOutlined />} onClick={handleSendBulkQuickMedia} loading={sending} style={{ background: '#10b981', marginRight: 8 }}>
              Gửi {selectedMediaIds.size} mẫu đã chọn
            </Button>
          ),
          <Button key="close" onClick={() => setQuickMediaModal(false)}>Đóng</Button>
        ].filter(Boolean)}
        width={760}
      >
        <div style={{ padding: '8px 0' }}>
          <Card size="small" style={{ marginBottom: 16, background: '#f8fafc', borderColor: '#e2e8f0' }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>⬆️ Tải lên mẫu mới (Hình ảnh, Video, Báo giá... có thể chọn cùng lúc nhiều ảnh)</div>
            <Row gutter={[12, 8]} align="middle">
              <Col xs={24} md={8}>
                <Input
                  size="small"
                  placeholder="Tên gợi nhớ (VD: Báo giá 2026)..."
                  value={quickMediaTitle}
                  onChange={e => setQuickMediaTitle(e.target.value)}
                />
              </Col>
              <Col xs={24} md={5}>
                <Select size="small" value={quickMediaType} onChange={setQuickMediaType} style={{ width: '100%' }}>
                  <Select.Option value="image">🖼️ Hình ảnh</Select.Option>
                  <Select.Option value="video">🎬 Video</Select.Option>
                  <Select.Option value="file">📄 Tài liệu / File</Select.Option>
                </Select>
              </Col>
              <Col xs={24} md={6}>
                <AutoComplete
                  size="small"
                  style={{ width: '100%' }}
                  placeholder="Thư mục (VD: Báo giá...)"
                  value={quickMediaFolder}
                  onChange={setQuickMediaFolder}
                  options={Array.from(new Set(['Chung', ...quickMediaList.map(i => i.folder || 'Chung')])).map(f => ({ value: f }))}
                />
              </Col>
              <Col xs={24} md={5}>
                <Upload
                  fileList={[]}
                  multiple={true}
                  beforeUpload={handleUploadQuickMedia}
                  showUploadList={false}
                  accept={quickMediaType === 'image' ? 'image/*' : quickMediaType === 'video' ? 'video/*' : '*/*'}
                >
                  <Button size="small" type="primary" icon={<PlusOutlined />} loading={quickMediaUploading} style={{ background: '#10b981', width: '100%' }}>
                    Chọn file tải lên
                  </Button>
                </Upload>
              </Col>
            </Row>
          </Card>

          {quickMediaLoading ? <Spin style={{ display: 'block', margin: '30px auto' }} /> : (
            <>
              {selectedMediaIds.size > 0 && (
                <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '8px 12px', borderRadius: 8, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#047857', fontWeight: 600, fontSize: 13 }}>
                    🎉 Đã chọn {selectedMediaIds.size} mẫu
                  </span>
                  <div>
                    <Button size="small" onClick={() => setSelectedMediaIds(new Set())} style={{ marginRight: 8 }}>Bỏ chọn</Button>
                    <Button size="small" type="primary" icon={<SendOutlined />} onClick={handleSendBulkQuickMedia} loading={sending} style={{ background: '#10b981' }}>
                      Gửi {selectedMediaIds.size} mẫu đã chọn
                    </Button>
                  </div>
                </div>
              )}
              <Tabs
                activeKey={activeMediaFolderTab}
                onChange={setActiveMediaFolderTab}
                items={[
                  {
                    key: 'all',
                    label: `📁 Tất cả (${quickMediaList.length})`
                  },
                  ...Array.from(new Set(['Chung', ...quickMediaList.map(i => i.folder || 'Chung')])).map(f => ({
                    key: f,
                    label: `📁 ${f} (${quickMediaList.filter(i => (i.folder || 'Chung') === f).length})`
                  }))
                ]}
              />
              <Row gutter={[12, 12]} style={{ maxHeight: 380, overflowY: 'auto', marginTop: 4 }}>
                {quickMediaList.filter(item => activeMediaFolderTab === 'all' || (item.folder || 'Chung') === activeMediaFolderTab).length === 0 && (
                  <Empty description="Chưa có mẫu nào trong thư mục này" style={{ margin: '30px auto', width: '100%' }} />
                )}
                {quickMediaList
                  .filter(item => activeMediaFolderTab === 'all' || (item.folder || 'Chung') === activeMediaFolderTab)
                  .map(item => (
                    <Col xs={24} md={8} key={item.id}>
                      <Card
                        size="small"
                        hoverable
                        style={{
                          borderRadius: 8,
                          overflow: 'hidden',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          border: selectedMediaIds.has(item.id) ? '2px solid #10b981' : undefined,
                          background: selectedMediaIds.has(item.id) ? '#f0fdf4' : undefined
                        }}
                        bodyStyle={{ padding: 10, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>📁 {item.folder || 'Chung'}</Tag>
                            <Checkbox checked={selectedMediaIds.has(item.id)} onChange={() => toggleSelectMediaItem(item.id)} />
                          </div>
                          <div onClick={() => toggleSelectMediaItem(item.id)} style={{ cursor: 'pointer' }}>
                            {item.media_type === 'image' ? (
                              <Image
                                src={item.file_url}
                                alt={item.title}
                                style={{ height: 100, width: '100%', objectFit: 'cover', borderRadius: 6 }}
                                preview={false}
                              />
                            ) : (
                              <div style={{ height: 100, background: '#e2e8f0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                                {item.media_type === 'video' ? <VideoCameraOutlined style={{ fontSize: 32, color: '#3b82f6' }} /> : <FileOutlined style={{ fontSize: 32, color: '#64748b' }} />}
                                <span style={{ fontSize: 11, color: '#475569', padding: '0 8px', textAlign: 'center', wordBreak: 'break-all' }}>
                                  {item.file_url?.split('/').pop()}
                                </span>
                              </div>
                            )}
                            <div style={{ fontWeight: 600, fontSize: 13, marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                              {item.title}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>Bởi: {item.created_by_name || 'Admin'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                          <Button
                            type="primary"
                            size="small"
                            icon={<SendOutlined />}
                            onClick={() => handleSendQuickMedia(item)}
                            disabled={!selectedLead}
                            style={{ background: '#1877f2', fontSize: 11, padding: '0 8px' }}
                          >
                            Gửi ngay
                          </Button>
                          <Popconfirm
                            title="Xóa mẫu này?"
                            onConfirm={() => handleDeleteQuickMedia(item.id)}
                            okText="Xóa"
                            cancelText="Hủy"
                          >
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </div>
                      </Card>
                    </Col>
                  ))}
              </Row>
            </>
          )}
        </div>
      </Modal>

      {/* Create Customer Modal */}
      <Modal
        open={createModal}
        title="Tạo Khách hàng từ Facebook"
        onCancel={() => setCreateModal(false)}
        footer={null}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateCustomer} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Tên Khách hàng" rules={[{ required: true, message: 'Vui lòng nhập tên' }]}>
            <Input placeholder="Họ và tên khách hàng..." />
          </Form.Item>
          <Form.Item name="phone" label="Số điện thoại" rules={[{ required: true, message: 'Vui lòng nhập SĐT' }]}>
            <Input placeholder="0912345678" prefix={<PhoneOutlined />} />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input placeholder="email@example.com" prefix={<MailOutlined />} />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ">
            <Input placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP..." />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setCreateModal(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={creating} style={{ background: '#1877f2' }}>
              Tạo Khách hàng
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Manage Tags Modal */}
      <Modal
        open={manageTagsModal}
        title="🏷️ Quản lý Nhãn hội thoại (Tags)"
        onCancel={() => setManageTagsModal(false)}
        footer={[
          <Button key="close" onClick={() => setManageTagsModal(false)}>Đóng</Button>
        ]}
        width={500}
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Input
              placeholder="Tên nhãn mới..."
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onPressEnter={handleCreateTag}
              style={{ flex: 1 }}
            />
            <input
              type="color"
              value={newTagColor}
              onChange={e => setNewTagColor(e.target.value)}
              style={{ width: 40, height: 32, padding: 0, border: '1px solid #d9d9d9', borderRadius: 6, cursor: 'pointer' }}
              title="Chọn màu"
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateTag} style={{ background: '#10b981' }}>
              Tạo nhãn
            </Button>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tagsList.length === 0 ? (
              <Empty description="Chưa có nhãn nào" style={{ margin: '20px auto' }} />
            ) : (
              tagsList.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: t.color || '#3b82f6', display: 'inline-block' }} />
                    <Text strong style={{ fontSize: 13 }}>{t.name}</Text>
                  </div>
                  <Popconfirm title="Xóa nhãn này?" onConfirm={() => handleDeleteTag(t.id)} okText="Xóa" cancelText="Hủy">
                    <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Quick Replies Modal */}
      <Modal
        open={quickReplyModal}
        title="⚡ Danh sách Văn bản mẫu (/gõ tắt)"
        onCancel={() => setQuickReplyModal(false)}
        footer={[
          <Button key="close" onClick={() => setQuickReplyModal(false)}>Đóng</Button>
        ]}
        width={640}
      >
        <div style={{ padding: '8px 0' }}>
          <Card size="small" style={{ marginBottom: 16, background: '#fff7ed', borderColor: '#fed7aa' }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: '#9a3412' }}>➕ Thêm văn bản mẫu mới</div>
            <Row gutter={[8, 8]}>
              <Col xs={24} md={8}>
                <Input
                  size="small"
                  placeholder="Phím tắt (VD: /hello)..."
                  value={qrShortcut}
                  onChange={e => setQrShortcut(e.target.value)}
                />
              </Col>
              <Col xs={24} md={16}>
                <Input
                  size="small"
                  placeholder="Tiêu đề gợi nhớ (VD: Chào hỏi ban đầu)..."
                  value={qrTitle}
                  onChange={e => setQrTitle(e.target.value)}
                />
              </Col>
              <Col xs={24} md={24}>
                <Input.TextArea
                  size="small"
                  placeholder="Nội dung tin nhắn mẫu..."
                  value={qrContent}
                  onChange={e => setQrContent(e.target.value)}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                />
              </Col>
              <Col xs={24} md={24} style={{ textAlign: 'right' }}>
                <Button size="small" type="primary" icon={<PlusOutlined />} loading={qrSaving} onClick={handleCreateQuickReply} style={{ background: '#f59e0b', borderColor: '#f59e0b' }}>
                  Tạo mẫu
                </Button>
              </Col>
            </Row>
          </Card>

          <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {quickRepliesList.length === 0 ? (
              <Empty description="Chưa có văn bản mẫu nào" style={{ margin: '20px auto' }} />
            ) : (
              quickRepliesList.map(qr => (
                <div key={qr.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Tag color="orange" style={{ fontWeight: 700, margin: 0 }}>{qr.shortcut}</Tag>
                      <Text strong style={{ fontSize: 13 }}>{qr.title}</Text>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{qr.content}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button type="primary" size="small" onClick={() => handleInsertQuickReply(qr)} style={{ background: '#1877f2' }}>
                      Chèn
                    </Button>
                    <Popconfirm title="Xóa mẫu này?" onConfirm={() => handleDeleteQuickReply(qr.id)} okText="Xóa" cancelText="Hủy">
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      <Modal
        title="⚡ Duyệt nội dung Đóng gói Hội thoại (RAG)"
        open={extractModalVisible}
        onCancel={() => setExtractModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setExtractModalVisible(false)}>Hủy bỏ</Button>,
          <Button key="save" type="primary" onClick={handleSaveExtractedText} loading={extractSaving}>Lưu vào Cẩm nang AI</Button>
        ]}
        width={700}
      >
        <div style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary">AI đã tự động trích xuất các thắc mắc và câu trả lời trong đoạn hội thoại này. Bạn có thể chỉnh sửa lại cho chuẩn xác trước khi nạp vào bộ nhớ RAG của AI.</Typography.Text>
        </div>
        <Input.TextArea
          value={extractedText}
          onChange={e => setExtractedText(e.target.value)}
          autoSize={{ minRows: 8, maxRows: 16 }}
        />
      </Modal>
    </div>
  )
}
