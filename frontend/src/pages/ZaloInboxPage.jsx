import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Avatar, Badge, Button, Col, Divider, Empty, Input, Modal, Drawer,
  Row, Select, Space, Spin, Switch, Tag, Tooltip, Typography, Form, message, Upload,
  Tabs, Radio, Popover, theme
} from 'antd'
import {
  CheckCircleOutlined, CloseOutlined, MessageOutlined,
  PhoneOutlined, ReloadOutlined, SearchOutlined,
  UserAddOutlined, UserOutlined, WechatOutlined,
  InfoCircleOutlined, TeamOutlined, PaperClipOutlined, SendOutlined,
  PictureOutlined, DeleteOutlined, StarFilled, TagOutlined,
  ThunderboltOutlined, MailOutlined, PlusOutlined, ClockCircleOutlined,
  RobotOutlined, StopOutlined, ArrowLeftOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/vi'
import api from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { useResponsive } from '../hooks/useResponsive'

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

dayjs.extend(relativeTime)
dayjs.locale('vi')

const { Text, Title, Paragraph } = Typography
const { Search } = Input

// ── Status Config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  new:       { label: 'Mới',           color: '#3b82f6', bg: '#eff6ff' },
  chatting:  { label: 'Đang chat',     color: '#10b981', bg: '#ecfdf5' },
  converted: { label: 'Đã chuyển đổi', color: '#8b5cf6', bg: '#f5f3ff' },
  archived:  { label: 'Lưu trữ',       color: '#6b7280', bg: '#f9fafb' },
}

const formatTime = (isoString) => {
  if (!isoString) return ''
  return dayjs(isoString).format('HH:mm DD/MM/YYYY')
}

// ── Lead Item trong danh sách Cột 2 ──────────────────────────────────────────
function LeadListItem({ lead, selected, onClick }) {
  const cfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new
  const isNew = lead.status === 'new'
  const unreadNum = lead.unread_count || (lead.has_unread_message ? 1 : 0)
  const isUnread = unreadNum > 0

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        cursor: 'pointer',
        borderBottom: '1px solid #e5e7eb',
        background: selected ? '#eff6ff' : isUnread ? '#f0f9ff' : 'transparent',
        borderLeft: selected ? '3px solid #2563eb' : isUnread ? '3px solid #3b82f6' : '3px solid transparent',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!selected && !isUnread) e.currentTarget.style.background = '#f8fafc' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = isUnread ? '#f0f9ff' : 'transparent' }}
    >
      <Row gutter={10} align="middle" wrap={false}>
        <Col flex="none">
          <Badge
            count={isUnread ? unreadNum : 0}
            dot={!isUnread && isNew}
            overflowCount={99}
            color={!isUnread && isNew ? "#3b82f6" : undefined}
            offset={[-4, 4]}
            style={{
              background: '#ef4444',
              color: '#fff',
              fontWeight: 700,
              boxShadow: '0 0 0 2px #fff',
            }}
          >
            <Avatar
              size={44}
              src={lead.avatar_url}
              icon={<UserOutlined />}
              style={{ background: '#dbeafe', color: '#2563eb' }}
            />
          </Badge>
        </Col>
        <Col flex="auto" style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              {lead.is_starred && <StarFilled style={{ color: '#f59e0b', fontSize: 13, flexShrink: 0 }} />}
              <Text
                ellipsis
                style={{
                  fontSize: 14,
                  maxWidth: 130,
                  fontWeight: isUnread ? 800 : 600,
                  color: isUnread ? '#0f172a' : '#1f2937',
                }}
              >
                {lead.display_name || `Zalo ${lead.social_id?.slice(-4)}`}
              </Text>
            </div>
            <Text
              style={{
                fontSize: 11,
                whiteSpace: 'nowrap',
                fontWeight: isUnread ? 700 : 400,
                color: isUnread ? '#2563eb' : '#9ca3af',
              }}
            >
              {dayjs(lead.last_interaction_date).fromNow()}
            </Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <Text
              ellipsis
              style={{
                fontSize: 12,
                maxWidth: 135,
                fontWeight: isUnread ? 700 : 400,
                color: isUnread ? '#1e293b' : '#6b7280',
              }}
            >
              {lead.last_message || 'Chưa có tin nhắn'}
            </Text>
            <Space size={4}>
              {lead.oa_name && (
                <Tag style={{ fontSize: 10, padding: '0 6px', lineHeight: '18px', borderRadius: 10, margin: 0, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                  🏢 {lead.oa_name}
                </Tag>
              )}
              <Tag
                style={{
                  fontSize: 10, padding: '0 6px', lineHeight: '18px',
                  color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}30`,
                  borderRadius: 10, margin: 0,
                }}
              >
                {cfg.label}
              </Tag>
            </Space>
          </div>

          {/* Tags (Nhãn) */}
          {(() => {
            const manualTags = lead.tags || [];
            const aiTags = (lead.ai_tags || []).map((t, i) => ({ id: `ai-${i}`, name: t, color: '#8b5cf6' }));
            const combinedTags = [...manualTags, ...aiTags];
            if (combinedTags.length === 0) return null;
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {combinedTags.slice(0, 2).map(t => (
                  <Tag key={t.id} color={t.color || '#3b82f6'} style={{ fontSize: 10, padding: '0 6px', borderRadius: 10, margin: 0 }}>
                    {t.name}
                  </Tag>
                ))}
                {combinedTags.length > 2 && (
                  <Tooltip title={combinedTags.slice(2).map(t => t.name).join(', ')}>
                    <Tag color="#94a3b8" style={{ fontSize: 10, padding: '0 6px', borderRadius: 10, margin: 0, cursor: 'help' }}>
                      +{combinedTags.length - 2}
                    </Tag>
                  </Tooltip>
                )}
              </div>
            );
          })()}

          {/* Smart Contact Badges (SĐT | Email | Địa chỉ) */}
          {(lead.detected_phone || lead.detected_email || lead.detected_address) && (
            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {lead.detected_phone && (
                lead.is_customer_converted ? (
                  <Tag color="success" style={{ fontSize: 10, borderRadius: 10, margin: 0 }}>
                    ✅ SĐT: {lead.detected_phone}
                  </Tag>
                ) : (
                  <Tag color="warning" style={{ fontSize: 10, borderRadius: 10, margin: 0, fontWeight: 600 }}>
                    📞 SĐT: {lead.detected_phone}
                  </Tag>
                )
              )}
              {lead.detected_email && (
                <Tag color="blue" style={{ fontSize: 10, borderRadius: 10, margin: 0 }}>
                  📧 {lead.detected_email}
                </Tag>
              )}
              {lead.detected_address && (
                <Tag color="orange" style={{ fontSize: 10, borderRadius: 10, margin: 0 }}>
                  📍 {lead.detected_address.slice(0, 18)}{lead.detected_address.length > 18 ? '...' : ''}
                </Tag>
              )}
            </div>
          )}
        </Col>
      </Row>
    </div>
  )
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function ZaloInboxPage() {
  const { token } = theme.useToken()
  const { user, isCompanyAdmin, maintenanceMode, hasPermission } = useAuth()
  const { isMobile } = useResponsive()
  const canDeleteConversation = isCompanyAdmin || user?.is_superuser || hasPermission('zalo.delete_conversation')
  // Sale có thể xem toàn bộ hội thoại nếu là admin hoặc có quyền zalo.view_all_inbox
  const canViewAllInbox = isCompanyAdmin || hasPermission('zalo.view_all_inbox')
  const canChat = isCompanyAdmin || hasPermission('zalo.chat')
  const canCreateCustomer = isCompanyAdmin || hasPermission('zalo.create_customer')

  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractModalVisible, setExtractModalVisible] = useState(false)
  const [extractedText, setExtractedText] = useState('')
  const [extractSaving, setExtractSaving] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [selectedLeadDetail, setSelectedLeadDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [infoDrawerVisible, setInfoDrawerVisible] = useState(false)
  
  // Filter states
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [phoneFilterMode, setPhoneFilterMode] = useState('all') // 'all' | 'has_phone' | 'no_phone'
  const [replyFilter, setReplyFilter] = useState('')
  const [sortBy, setSortBy] = useState('')
  const [isStarredOnly, setIsStarredOnly] = useState(false)
  const [tagFilter, setTagFilter] = useState('all')
  const [assignedToFilter, setAssignedToFilter] = useState('all')
  const [selectedOaFilter, setSelectedOaFilter] = useState('all')
  const [oaConfigs, setOaConfigs] = useState([])
  const [employees, setEmployees] = useState([])
  const [scanning, setScanning] = useState(false)
  const [companySettings, setCompanySettings] = useState(null)

  // Chat states
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const chatContainerRef = useRef(null)

  // Tags & Notes states
  const [tagsList, setTagsList] = useState([])
  const [manageTagsModal, setManageTagsModal] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3b82f6')
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  // Quick Replies states
  const [quickRepliesList, setQuickRepliesList] = useState([])
  const [quickReplyModal, setQuickReplyModal] = useState(false)
  const [qrShortcut, setQrShortcut] = useState('')
  const [qrTitle, setQrTitle] = useState('')
  const [qrContent, setQrContent] = useState('')
  const [qrSaving, setQrSaving] = useState(false)

  // Convert modal
  const [convertModalVisible, setConvertModalVisible] = useState(false)
  const [convertForm] = Form.useForm()
  const [convertLoading, setConvertLoading] = useState(false)

  // Resizable columns
  const [leftColWidth, setLeftColWidth] = useState(275)
  const [rightColWidth, setRightColWidth] = useState(265)
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
        setLeftColWidth(Math.min(420, Math.max(200, dragStartWidth.current + delta)))
      }
      if (isDraggingRight.current) {
        const delta = dragStartX.current - e.clientX
        setRightColWidth(Math.min(380, Math.max(200, dragStartWidth.current + delta)))
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

  const fetchTags = async () => {
    try {
      const res = await api.get('/zalo/tags/')
      setTagsList(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {}
  }

  const fetchQuickReplies = async () => {
    try {
      const res = await api.get('/zalo/quick-replies/')
      setQuickRepliesList(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {}
  }

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/users/users/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      const active = data.filter(e => e.is_active !== false)
      const withZalo = active.filter(e => {
        if (e.is_superuser || e.is_company_admin) return true
        const perms = e.permissions || []
        return perms.some(p => typeof p === 'string' ? p.startsWith('zalo.') : (p.codename || '').startsWith('zalo.'))
      })
      setEmployees(withZalo.length > 0 ? withZalo : active)
    } catch {}
  }

  const fetchOaConfigs = async () => {
    try {
      const res = await api.get('/zalo/config/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setOaConfigs(data.filter(oa => oa.is_active !== false))
    } catch {}
  }

  const fetchCompanySettings = async () => {
    try {
      const res = await api.get('/ai_agents/settings/mine/')
      setCompanySettings(res.data)
    } catch {}
  }

  const fetchLeads = useCallback(async (background = false) => {
    if (!background) setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      if (phoneFilterMode === 'has_phone') params.has_phone = 'true'
      else if (phoneFilterMode === 'no_phone') params.has_phone = 'false'
      if (replyFilter) params.reply_filter = replyFilter
      if (sortBy) params.sort_by = sortBy
      if (selectedOaFilter && selectedOaFilter !== 'all') params.oa_config = selectedOaFilter
      if (isStarredOnly) params.is_starred = 'true'
      if (tagFilter && tagFilter !== 'all') params.tag = tagFilter
      if (assignedToFilter && assignedToFilter !== 'all') params.assigned_to = assignedToFilter

      const res = await api.get('/zalo/social-leads/', { params })
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setLeads(data)
    } catch {
      if (!background) message.error('Không thể tải danh sách Social Leads.')
    } finally {
      if (!background) setLoading(false)
    }
  }, [search, statusFilter, phoneFilterMode, replyFilter, sortBy, selectedOaFilter, isStarredOnly, tagFilter, assignedToFilter])

  const fetchDetail = async (leadId, background = false) => {
    if (!background) setDetailLoading(true)
    try {
      const res = await api.get(`/zalo/social-leads/${leadId}/`)
      setSelectedLeadDetail(res.data)
      setSelectedLead(res.data)
    } catch {
    } finally {
      if (!background) setDetailLoading(false)
    }
  }

  const fetchMessages = async (leadId, background = false) => {
    if (!background) setLoadingMessages(true)
    try {
      const res = await api.get(`/zalo/social-leads/${leadId}/messages/`)
      setMessages(res.data || [])
      if (!background) scrollToBottom()
    } catch {
    } finally {
      if (!background) setLoadingMessages(false)
    }
  }

  useEffect(() => {
    fetchEmployees()
    fetchOaConfigs()
    fetchTags()
    fetchQuickReplies()
    fetchCompanySettings()
  }, [])

  useEffect(() => {
    fetchLeads()
    const interval = setInterval(() => { fetchLeads(true) }, 3000)
    return () => clearInterval(interval)
  }, [fetchLeads])

  useEffect(() => {
    if (selectedLead?.id) {
      fetchMessages(selectedLead.id)
      fetchDetail(selectedLead.id)
      const interval = setInterval(() => {
        fetchMessages(selectedLead.id, true)
        fetchDetail(selectedLead.id, true)
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [selectedLead?.id])

  const scrollToBottom = () => {
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
      }
    }, 100)
  }

  const handleSelectLead = (lead) => {
    setSelectedLead(lead)
  }

  const handleRefresh = () => {
    fetchLeads()
    if (selectedLead) {
      fetchDetail(selectedLead.id)
      fetchMessages(selectedLead.id)
    }
  }

  const handleScanPhones = async () => {
    setScanning(true)
    try {
      const res = await api.post('/zalo/social-leads/scan-phones/')
      message.success(res.data?.detail || 'Quét SĐT thành công!')
      fetchLeads()
    } catch {
      message.error('Lỗi khi quét SĐT trong hội thoại.')
    } finally {
      setScanning(false)
    }
  }

  // ── Actions trên Lead ─────────────────────────────────────────────────────
  const handleToggleAi = async (checked) => {
    if (!selectedLead) return
    try {
      await api.patch(`/zalo/social-leads/${selectedLead.id}/`, { is_ai_active: checked })
      setSelectedLead(prev => ({ ...prev, is_ai_active: checked }))
      message.success(checked ? 'Đã bật chế độ AI tự động trả lời' : 'Đã tắt AI - Sale tiếp quản')
    } catch {
      message.error('Không thể thay đổi trạng thái AI')
    }
  }

  const handleToggleGlobalAi = async (oaId, checked) => {
    try {
      await api.patch(`/zalo/config/${oaId}/`, { is_ai_active: checked })
      setOaConfigs(prev => prev.map(oa => oa.id === oaId ? { ...oa, is_ai_active: checked } : oa))
      message.success(`Đã ${checked ? 'Bật' : 'Tắt'} AI toàn cục cho Zalo OA!`)
    } catch {
      message.error('Không thể thay đổi trạng thái AI toàn cục')
    }
  }

  const handleExtractConversation = async () => {
    if (!selectedLead || !currentOa?.ai_agent) {
      message.error('Chưa có khách hàng hoặc khách hàng chưa được cấu hình AI Agent')
      return
    }
    setExtracting(true)
    try {
      const res = await api.post('/ai_agents/knowledge/extract_conversation/', {
        lead_id: selectedLead.id,
        platform: 'zalo',
        agent_id: currentOa.ai_agent
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
        agent_id: currentOa.ai_agent
      })
      message.success('Đã lưu thành công vào Cẩm nang AI!')
      setExtractModalVisible(false)
    } catch (err) {
      message.error(err.response?.data?.error || 'Lỗi khi lưu tài liệu')
    } finally {
      setExtractSaving(false)
    }
  }

  const handleSendMessage = async (file = null, requestPhone = false, forceAsFile = false, requestEmail = false) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    if (!selectedLead) return
    if (!messageText.trim() && !file && !requestPhone && !requestEmail) return

    setSending(true)
    try {
      const formData = new FormData()
      if (messageText.trim()) {
        formData.append('text', messageText.trim())
      }
      if (file) {
        formData.append('file', file)
        if (forceAsFile) formData.append('force_as_file', 'true')
      }
      if (requestPhone) formData.append('request_phone', 'true')
      if (requestEmail) formData.append('request_email', 'true')

      const res = await api.postForm(`/zalo/social-leads/${selectedLead.id}/send-message/`, formData)

      setMessages(prev => [...prev, res.data])
      setMessageText('')
      if (res.data?.is_mock && res.data?.note) {
        message.info(res.data.note, 4)
      }
      scrollToBottom()
      fetchLeads(true)
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Gửi tin nhắn thất bại.'
      if (errMsg.length > 50 || err.response?.data?.zalo_error_code) {
        Modal.error({
          title: '⚠️ Zalo từ chối gửi tin nhắn',
          content: (
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <p style={{ fontWeight: 500, color: '#dc2626' }}>{errMsg}</p>
              {err.response?.data?.zalo_error_code && (
                <div style={{ marginTop: 10, padding: 8, background: '#f8fafc', borderRadius: 6, fontSize: 12, border: '1px solid #e2e8f0' }}>
                  <div><b>Mã lỗi Zalo:</b> {err.response?.data?.zalo_error_code}</div>
                  {err.response?.data?.zalo_message && <div><b>Chi tiết kỹ thuật:</b> {err.response?.data?.zalo_message}</div>}
                </div>
              )}
            </div>
          ),
          okText: 'Đã hiểu',
          width: 480
        })
      } else {
        message.error(errMsg)
      }
    } finally {
      setSending(false)
    }
  }

  const handleMsgTextChange = (e) => {
    const val = e.target.value
    setMessageText(val)
    const parts = val.split(' ')
    const lastWord = parts[parts.length - 1]
    if (lastWord.startsWith('/') && lastWord.length > 1) {
      const match = quickRepliesList.find(q => q.shortcut.toLowerCase() === lastWord.toLowerCase())
      if (match) {
        parts[parts.length - 1] = match.content
        setMessageText(parts.join(' '))
        message.info(`⚡ Đã tự động gõ tắt ${match.shortcut} -> "${match.title}"`)
      }
    }
  }

  const handleToggleStar = async () => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    if (!selectedLead) return
    try {
      const res = await api.post(`/zalo/social-leads/${selectedLead.id}/toggle_star/`)
      setSelectedLeadDetail(prev => ({ ...prev, is_starred: res.data.is_starred }))
      setSelectedLead(prev => ({ ...prev, is_starred: res.data.is_starred }))
      message.success(res.data.is_starred ? '★ Đã đánh dấu Khách VIP!' : '☆ Đã bỏ đánh dấu VIP.')
      fetchLeads(true)
    } catch { message.error('Lỗi khi đánh dấu VIP.') }
  }

  const handleUpdateLeadTags = async (tagIds) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    if (!selectedLead) return
    try {
      const res = await api.post(`/zalo/social-leads/${selectedLead.id}/manage_tags/`, { tag_ids: tagIds })
      setSelectedLeadDetail(prev => ({ ...prev, tags: res.data.tags }))
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
      const res = await api.post(`/zalo/social-leads/${selectedLead.id}/notes/`, { content: content.trim() })
      setSelectedLeadDetail(prev => ({
        ...prev,
        internal_notes: [res.data, ...(prev?.internal_notes || [])]
      }))
      setNoteText('')
      message.success('Đã thêm ghi chú nội bộ!')
    } catch { message.error('Lỗi khi thêm ghi chú.') }
    finally { setNoteSaving(false) }
  }

  const handleAssign = async (userId) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    if (!selectedLead) return
    try {
      await api.post(`/zalo/social-leads/${selectedLead.id}/assign/`, { assigned_to: userId || null })
      message.success('Phân công thành công!')
      fetchDetail(selectedLead.id)
      fetchLeads(true)
    } catch { message.error('Lỗi khi phân công.') }
  }

  const handleConvert = async () => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì dữ liệu. Chức năng này tạm thời bị khóa!'); return }
    if (!selectedLead) return
    try {
      const values = await convertForm.validateFields()
      setConvertLoading(true)
      await api.post(`/zalo/social-leads/${selectedLead.id}/convert/`, values)
      message.success('Chuyển đổi Khách hàng thành công!')
      setConvertModalVisible(false)
      convertForm.resetFields()
      fetchDetail(selectedLead.id)
      fetchLeads(true)
    } catch (err) {
      if (err.name === 'ValidationError') return
      message.error(err.response?.data?.error || 'Lỗi khi chuyển đổi.')
    } finally {
      setConvertLoading(false)
    }
  }

  // Tags Management
  const handleCreateTag = async () => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    if (!newTagName.trim()) return
    try {
      await api.post('/zalo/tags/', { name: newTagName.trim(), color: newTagColor })
      message.success('Đã tạo nhãn mới!')
      setNewTagName('')
      fetchTags()
    } catch { message.error('Lỗi khi tạo nhãn.') }
  }

  const handleDeleteTag = async (id) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    try {
      await api.delete(`/zalo/tags/${id}/`)
      message.success('Đã xóa nhãn!')
      fetchTags()
      fetchLeads(true)
    } catch { message.error('Lỗi khi xóa nhãn.') }
  }

  // Quick Replies Management
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
      await api.post('/zalo/quick-replies/', { shortcut, title: qrTitle || shortcut, content: qrContent })
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
      await api.delete(`/zalo/quick-replies/${id}/`)
      message.success('Đã xóa văn bản mẫu!')
      fetchQuickReplies()
    } catch { message.error('Lỗi khi xóa văn bản mẫu.') }
  }

  const handleInsertQuickReply = (qr) => {
    setMessageText(prev => (prev ? prev + ' ' + qr.content : qr.content))
    setQuickReplyModal(false)
  }
  const currentOa = oaConfigs.find(oa => oa.id === selectedOaFilter) || (oaConfigs.length === 1 ? oaConfigs[0] : null)

  const renderCustomerInfo = () => {
    return selectedLeadDetail ? (
      <div style={{ padding: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Avatar size={64} src={selectedLeadDetail.avatar_url} icon={<UserOutlined />} style={{ background: '#dbeafe', color: '#2563eb' }} />
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 8 }}>{selectedLeadDetail.display_name || `Khách Zalo (${selectedLeadDetail.social_id?.slice(-4)})`}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Zalo ID: {selectedLeadDetail.social_id}</div>
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
          <Button
            type={selectedLeadDetail.is_starred ? "primary" : "default"}
            block
            icon={<StarFilled style={{ color: selectedLeadDetail.is_starred ? '#fff' : '#f59e0b' }} />}
            onClick={handleToggleStar}
            style={{ background: selectedLeadDetail.is_starred ? '#f59e0b' : '#fff', borderColor: '#f59e0b', color: selectedLeadDetail.is_starred ? '#fff' : '#d97706', marginBottom: 14, borderRadius: 20, fontWeight: 600 }}
          >
            {selectedLeadDetail.is_starred ? '★ Đang là Khách VIP' : '☆ Đánh dấu Khách VIP'}
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
              value={(selectedLeadDetail.tags || []).map(t => t.id)}
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
                    <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>ZALO OA CỦA CÔNG TY</Text></div>
                    <div style={{ fontSize: 13, marginBottom: 12 }}>🏢 {selectedLeadDetail.oa_name || 'Zalo OA'}</div>
                    
                    {selectedLeadDetail.ai_summary && (
                      <div style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f', padding: '8px 12px', borderRadius: 8 }}>
                        <div style={{ marginBottom: 4 }}><Text strong style={{ fontSize: 12, color: '#389e0d' }}>✨ AI Tóm tắt Hội thoại</Text></div>
                        <div style={{ fontSize: 13, color: '#595959', whiteSpace: 'pre-wrap' }}>
                          {selectedLeadDetail.ai_summary}
                        </div>
                        {selectedLeadDetail.ai_tags && selectedLeadDetail.ai_tags.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {selectedLeadDetail.ai_tags.map((t, idx) => (
                              <span key={idx} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)', color: '#fff', fontWeight: 600, boxShadow: '0 2px 4px rgba(99, 102, 241, 0.2)' }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {selectedLeadDetail.detected_phone && (
                      <>
                        <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>SỐ ĐIỆN THOẠI</Text></div>
                        <div style={{ fontSize: 13, marginBottom: 12, color: '#0068ff', fontWeight: 600 }}>📞 {selectedLeadDetail.detected_phone}</div>
                      </>
                    )}
                    {selectedLeadDetail.detected_email && (
                      <>
                        <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>EMAIL PHÁT HIỆN</Text></div>
                        <div style={{ fontSize: 13, marginBottom: 12, color: '#059669', fontWeight: 600 }}>📧 {selectedLeadDetail.detected_email}</div>
                      </>
                    )}
                    {selectedLeadDetail.detected_address && (
                      <>
                        <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>ĐỊA CHỈ PHÁT HIỆN</Text></div>
                        <div style={{ fontSize: 13, marginBottom: 12, color: '#d97706' }}>📍 {selectedLeadDetail.detected_address}</div>
                      </>
                    )}
                    {selectedLeadDetail.customer_name && (
                      <>
                        <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>KHÁCH HÀNG CRM</Text></div>
                        <div style={{ fontSize: 13, marginBottom: 12 }}>👤 {selectedLeadDetail.customer_name}</div>
                      </>
                    )}
                    <div style={{ marginBottom: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>NHÂN VIÊN PHỤ TRÁCH</Text></div>
                    <div style={{ marginBottom: 16 }}>
                      <Select
                        placeholder="Chọn nhân viên"
                        style={{ width: '100%' }}
                        value={selectedLeadDetail.assigned_to || ''}
                        allowClear
                        disabled={!isCompanyAdmin && !hasPermission('zalo.assign')}
                        onChange={val => handleAssign(val || null)}
                        options={[{ value: '', label: '-- Chưa phân công --' }, ...employees.map(e => ({ value: e.id, label: e.full_name || e.username }))]}
                      />
                    </div>
                    {!selectedLeadDetail.is_customer_converted && canCreateCustomer && (
                      <Button
                        type="primary"
                        block
                        icon={<UserAddOutlined />}
                        onClick={() => {
                          if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì dữ liệu. Chức năng này tạm thời bị khóa!'); return }
                          convertForm.setFieldsValue({
                            customer_name: selectedLeadDetail.display_name || '',
                            phone_number: selectedLeadDetail.detected_phone || '',
                            email: selectedLeadDetail.detected_email || '',
                            address: selectedLeadDetail.detected_address || ''
                          })
                          setConvertModalVisible(true)
                        }}
                        style={{ background: '#8b5cf6', marginTop: 8, borderRadius: 20 }}
                      >
                        Tạo Khách hàng CRM
                      </Button>
                    )}
                  </div>
                )
              },
              {
                key: 'notes',
                label: `📝 Ghi chú (${selectedLeadDetail.internal_notes?.length || 0})`,
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
                    <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(selectedLeadDetail.internal_notes || []).length === 0 ? (
                        <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block', margin: '20px 0' }}>Chưa có ghi chú nào</Text>
                      ) : (
                        (selectedLeadDetail.internal_notes || []).map((note, idx) => (
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
      </div>
    ) : (
      <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40 }}>
        <UserOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
        <span style={{ fontSize: 13 }}>Chọn hội thoại để xem thông tin</span>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <WechatOutlined style={{ fontSize: 22, color: '#0068ff' }} />
        <span style={{ fontWeight: 700, fontSize: 15, flexShrink: 0 }}>Zalo Inbox</span>
        {oaConfigs.length > 1 && (
          <Select
            value={selectedOaFilter}
            onChange={setSelectedOaFilter}
            style={{ width: 180, flexShrink: 0 }}
            size="small"
          >
            <Select.Option value="all">🌐 Tất cả Zalo OA ({oaConfigs.length})</Select.Option>
            {oaConfigs.map(oa => (
              <Select.Option key={oa.id} value={oa.id}>{oa.oa_name}</Select.Option>
            ))}
          </Select>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {currentOa && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 16, background: currentOa.is_ai_active ? '#dcfce7' : '#fee2e2', padding: '4px 12px', borderRadius: 20, border: `1px solid ${currentOa.is_ai_active ? '#bbf7d0' : '#fecaca'}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: currentOa.is_ai_active ? '#16a34a' : '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                {currentOa.is_ai_active ? <><RobotOutlined /> AI Đang Bật</> : <><StopOutlined /> AI Đang Tắt</>}
              </span>
              <Switch
                size="small"
                checked={currentOa.is_ai_active}
                onChange={(checked) => handleToggleGlobalAi(currentOa.id, checked)}
                style={{ background: currentOa.is_ai_active ? '#10b981' : '#ccc' }}
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
          {!isMobile && (
            <>
              <Button
                size="small"
                type={replyFilter === 'read_unanswered' ? 'primary' : 'default'}
                danger={replyFilter === 'read_unanswered'}
                onClick={() => setReplyFilter(replyFilter === 'read_unanswered' ? '' : 'read_unanswered')}
              >
                {replyFilter === 'read_unanswered' ? '🔴 Chưa đọc' : 'Chưa đọc'}
              </Button>
              <Button
                size="small"
                type={phoneFilterMode === 'has_phone' ? 'primary' : 'default'}
                icon={<PhoneOutlined />}
                onClick={() => setPhoneFilterMode(phoneFilterMode === 'has_phone' ? 'all' : 'has_phone')}
              >
                {phoneFilterMode === 'has_phone' ? 'Có SĐT' : 'Lọc SĐT'}
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
            </>
          )}
          <Button size="small" icon={<ReloadOutlined />} onClick={handleRefresh} title="Làm mới" />
        </div>
      </div>

      {/* Main 4-column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Cột 1: Pancake-style Vertical Filter Sidebar */}
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
                setPhoneFilterMode('all')
                setStatusFilter('')
                setIsStarredOnly(false)
                setTagFilter('all')
                setAssignedToFilter('all')
              }}
              style={{
                width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: (!replyFilter && !sortBy && phoneFilterMode === 'all' && !statusFilter && !isStarredOnly && tagFilter === 'all' && assignedToFilter === 'all') ? '#2563eb' : 'transparent',
                color: (!replyFilter && !sortBy && phoneFilterMode === 'all' && !statusFilter && !isStarredOnly && tagFilter === 'all' && assignedToFilter === 'all') ? '#fff' : '#94a3b8',
                transition: 'all 0.2s',
              }}
            >
              <MessageOutlined style={{ fontSize: 18 }} />
            </div>
          </Tooltip>

          {/* Lọc chưa trả lời (Pancake Clock popover) */}
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

          {/* 2. Lọc theo SĐT (Có SĐT / Chưa có SĐT) */}
          <Popover
            placement="rightTop"
            title={<span style={{ fontWeight: 700, color: '#1e293b' }}>📞 Lọc theo Số điện thoại</span>}
            content={
              <div style={{ minWidth: 200, padding: 4 }}>
                <Radio.Group
                  value={phoneFilterMode}
                  onChange={e => setPhoneFilterMode(e.target.value)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <Radio value="all" style={{ fontWeight: 500 }}>🌐 Tất cả hội thoại</Radio>
                  <Radio value="has_phone" style={{ fontWeight: 600, color: '#10b981' }}>✅ Khách đã có SĐT</Radio>
                  <Radio value="no_phone" style={{ fontWeight: 500, color: '#64748b' }}>❓ Khách chưa có SĐT</Radio>
                </Radio.Group>
              </div>
            }
            trigger="click"
          >
            <Tooltip title="Lọc theo Số điện thoại" placement="right">
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: phoneFilterMode !== 'all' ? '#10b981' : 'transparent',
                  color: phoneFilterMode !== 'all' ? '#fff' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <PhoneOutlined style={{ fontSize: 18 }} />
              </div>
            </Tooltip>
          </Popover>

          {/* 3. Khách VIP (Starred) */}
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

          {/* 4. Lọc theo Nhãn (Tags) */}
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
                  background: tagFilter !== 'all' ? '#3b82f6' : 'transparent',
                  color: tagFilter !== 'all' ? '#fff' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <TagOutlined style={{ fontSize: 18 }} />
              </div>
            </Tooltip>
          </Popover>

          {/* 5. Lọc theo Sale phụ trách */}
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
            <Tooltip title="Lọc theo nhân viên phụ trách" placement="right">
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: assignedToFilter !== 'all' ? '#8b5cf6' : 'transparent',
                  color: assignedToFilter !== 'all' ? '#fff' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <TeamOutlined style={{ fontSize: 18 }} />
              </div>
            </Tooltip>
          </Popover>

          {/* 6. Quét tất cả liên hệ Zalo */}
          <Tooltip title="Quét lại tin nhắn tìm SĐT/Email/Địa chỉ" placement={isMobile ? "bottom" : "right"}>
            <div
              onClick={handleScanPhones}
              style={{
                width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: scanning ? '#38bdf8' : '#94a3b8',
                marginTop: isMobile ? 0 : 'auto',
                marginLeft: isMobile ? 'auto' : 0,
                transition: 'all 0.2s',
              }}
            >
              {scanning ? <Spin size="small" /> : <ReloadOutlined style={{ fontSize: 18 }} />}
            </div>
          </Tooltip>
        </div>

        {/* Cột 2: Danh sách hội thoại */}
        {(!isMobile || !selectedLead) && (
        <div style={{ width: isMobile ? '100%' : leftColWidth, flex: isMobile ? 1 : 'none', height: isMobile ? 'auto' : '100%', borderRight: isMobile ? 'none' : '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: isMobile ? 1 : 0, minHeight: 0 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>
            <Search
              placeholder="Tìm tên, tin nhắn..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onSearch={() => fetchLeads()}
              allowClear
              style={{ marginBottom: 8 }}
            />
            <Select
              style={{ width: '100%' }}
              placeholder="Trạng thái"
              value={statusFilter || undefined}
              onChange={v => setStatusFilter(v || '')}
              allowClear
              size="small"
              options={[
                { value: 'new',       label: '🔵 Mới' },
                { value: 'chatting',  label: '🟢 Đang chat' },
                { value: 'converted', label: '🟣 Đã chuyển đổi' },
                { value: 'archived',  label: '⚫ Lưu trữ' },
              ]}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
            ) : leads.length === 0 ? (
              <Empty style={{ marginTop: 40 }} description="Không có hội thoại nào" />
            ) : (
              leads.map(lead => (
                <LeadListItem
                  key={lead.id}
                  lead={lead}
                  selected={selectedLead?.id === lead.id}
                  onClick={() => handleSelectLead(lead)}
                />
              ))
            )}
          </div>
          <div style={{ padding: '6px 12px', borderTop: '1px solid #e5e7eb', background: '#f8fafc', fontSize: 11, color: '#64748b' }}>
            Tổng: {leads.length} hội thoại
          </div>
        </div>
        )}

        {/* Resizer Trái */}
        {!isMobile && (
        <div
          onMouseDown={startDragLeft}
          style={{ width: 4, cursor: 'col-resize', background: '#f1f5f9', borderRight: '1px solid #e2e8f0', flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.background = '#3b82f6'}
          onMouseLeave={e => { if (!isDraggingLeft.current) e.currentTarget.style.background = '#f1f5f9' }}
        />
        )}

        {/* Cột 3: Khung Chat */}
        {(!isMobile || selectedLead) && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', minWidth: 0, width: isMobile ? '100%' : 'auto' }}>
          {selectedLead ? (
            <>
              {/* Chat Header */}
              <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: isMobile ? 12 : 0, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: isMobile ? '100%' : 'auto' }}>
                  {isMobile && (
                    <Space size={0}>
                      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setSelectedLead(null)} style={{ padding: 4 }} />
                      <Button type="text" icon={<InfoCircleOutlined />} onClick={() => setInfoDrawerVisible(true)} style={{ padding: 4, marginRight: 4, color: '#0068ff' }} />
                    </Space>
                  )}
                  <Avatar size={40} src={selectedLead.avatar_url} icon={<UserOutlined />} style={{ background: '#dbeafe', color: '#2563eb' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Text strong ellipsis style={{ fontSize: 15, maxWidth: isMobile ? 180 : 'none' }}>{selectedLead.display_name || `Khách Zalo (${selectedLead.social_id?.slice(-4)})`}</Text>
                      {selectedLead.is_starred && <StarFilled style={{ color: '#f59e0b', fontSize: 14, flexShrink: 0 }} />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                      <Tag style={{ fontSize: 11, margin: 0, color: STATUS_CONFIG[selectedLead.status]?.color, background: STATUS_CONFIG[selectedLead.status]?.bg }}>
                        {STATUS_CONFIG[selectedLead.status]?.label || 'Mới'}
                      </Tag>
                      <Text type="secondary" ellipsis style={{ fontSize: 11, maxWidth: isMobile ? 160 : 250 }}>🏢 {selectedLead.oa_name || 'Zalo OA'}</Text>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', width: isMobile ? '100%' : 'auto', overflowX: 'auto', paddingBottom: isMobile ? 4 : 0, gap: 8 }}>
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, background: (currentOa?.is_ai_active && selectedLead.is_ai_active) ? '#f6ffed' : '#fff1f0', padding: '4px 12px', borderRadius: 20, border: `1px solid ${(currentOa?.is_ai_active && selectedLead.is_ai_active) ? '#b7eb8f' : '#ffa39e'}` }}>
                    <Switch size="small" disabled={!currentOa?.is_ai_active} checked={currentOa?.is_ai_active && selectedLead.is_ai_active} onChange={handleToggleAi} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: (currentOa?.is_ai_active && selectedLead.is_ai_active) ? '#389e0d' : '#cf1322', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {(currentOa?.is_ai_active && selectedLead.is_ai_active) ? <><RobotOutlined /> {isMobile ? 'AI Trực' : 'AI Đang Trực'}</> : <><UserOutlined /> {isMobile ? 'Sale' : 'Sale Tiếp Quản'}</>}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
                    <Tooltip title="Quét lại liên hệ cho hội thoại này">
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={async () => {
                          try {
                            const res = await api.post(`/zalo/social-leads/${selectedLead.id}/rescan-phone/`)
                            message.success(res.data.detail)
                            fetchDetail(selectedLead.id)
                            fetchLeads(true)
                          } catch (err) {
                            message.error(err.response?.data?.error || 'Không tìm thấy liên hệ.')
                          }
                        }}
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
                                if (maintenanceMode) { message.warning('Hệ thống bảo trì!'); return }
                                try {
                                  await api.delete(`/zalo/social-leads/${selectedLead.id}/`)
                                  message.success('Đã xóa hội thoại')
                                  setSelectedLead(null)
                                  setSelectedLeadDetail(null)
                                  fetchLeads()
                                } catch { message.error('Lỗi khi xóa hội thoại') }
                              }
                            })
                          }}
                        />
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>

              {/* Chat Messages */}
              <div ref={chatContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#eef2f5', minHeight: 0 }}>
                {loadingMessages ? (
                  <div style={{ textAlign: 'center', marginTop: 40 }}><Spin /></div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', marginTop: 40, color: '#9ca3af' }}>Chưa có tin nhắn nào.</div>
                ) : (
                  messages.map((msg) => {
                    if (msg.payload?.is_system_alert) {
                      return (
                        <div key={msg.id} style={{ textAlign: 'center', margin: '16px 0' }}>
                          <span style={{ background: '#fee2e2', color: '#dc2626', padding: '6px 12px', borderRadius: 16, fontSize: 11, fontWeight: 500, display: 'inline-block', maxWidth: '80%', wordBreak: 'break-word' }}>
                            ⚠️ {msg.payload.error_code ? `Lỗi API Zalo (${msg.payload.error_code}): ` : 'Lỗi hệ thống: '}
                            {msg.payload.error_message || msg.content}
                          </span>
                        </div>
                      )
                    }
                    const isOutbound = msg.direction === 'outbound'
                    return (
                      <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOutbound ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: isOutbound ? 'row-reverse' : 'row' }}>
                          {!isOutbound && <Avatar size={28} src={selectedLead.avatar_url} icon={<UserOutlined />} />}
                          <div style={{
                              background: isOutbound ? '#0068ff' : '#fff',
                              color: isOutbound ? '#fff' : '#0f172a',
                              border: isOutbound ? 'none' : '1px solid #e2e8f0',
                              borderRadius: isOutbound ? '12px 0 12px 12px' : '0 12px 12px 12px',
                              padding: msg.attachment_type === 'carousel' ? '8px 0 8px 12px' : '8px 12px',
                              maxWidth: msg.attachment_type === 'carousel' ? 420 : 380,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}>
                              {msg.attachment_type === 'carousel' && Array.isArray(msg.payload) && (
                                <div style={{ marginBottom: msg.content ? 8 : 0, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, paddingRight: 12 }}>
                                  {msg.payload.map((item, idx) => (
                                    <div key={idx} style={{ width: 140, flexShrink: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                                      <div style={{ width: '100%', height: 100, backgroundImage: `url(${cleanUrl(item.image_url)})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                                      <div style={{ padding: '6px 8px' }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.title}>{item.title}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.subtitle}>{item.subtitle}</div>
                                        <div style={{ marginTop: 6, textAlign: 'center', fontSize: 11, color: '#0068ff', fontWeight: 500, padding: '4px 0', borderTop: '1px solid #e2e8f0' }}>Nhận tư vấn</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {msg.attachment_url && msg.attachment_type !== 'carousel' && (
                                <div style={{ marginBottom: msg.content ? 8 : 0 }}>
                                  {msg.attachment_type === 'image' ? (
                                    <img src={msg.attachment_url} alt="attachment" style={{ maxWidth: '100%', borderRadius: 8 }} />
                                  ) : (
                                    <a href={msg.attachment_url} target="_blank" rel="noreferrer" style={{ color: isOutbound ? '#fff' : '#0068ff', textDecoration: 'underline' }}>
                                      <PaperClipOutlined /> Tệp đính kèm ({msg.attachment_type})
                                    </a>
                                  )}
                                </div>
                              )}
                            {msg.content && msg.attachment_type !== 'carousel' && <Text style={{ color: 'inherit', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.content}</Text>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, marginRight: isOutbound ? 8 : 0, marginLeft: isOutbound ? 0 : 36 }}>
                          {isOutbound && msg.sender_name && (
                            <Text type="secondary" style={{ fontSize: 10 }}>{msg.sender_name} &bull;</Text>
                          )}
                          <Text type="secondary" style={{ fontSize: 10 }}>
                            {dayjs(msg.created_at).format('HH:mm DD/MM/YYYY')}
                          </Text>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Chat Input & Horizontal Toolbar Chuẩn Pancake */}
              {selectedLead.status !== 'archived' && canChat && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
                  {/* Hàng ngang phía trên khung nhập chat (3 nút biểu tượng icon: Yêu cầu SĐT, Yêu cầu Email, Văn bản mẫu) */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <Tooltip title="Yêu cầu khách chia sẻ số điện thoại" placement="top">
                      <Button
                        size="small"
                        shape="circle"
                        icon={<PhoneOutlined />}
                        onClick={() => handleSendMessage(null, true, false, false)}
                        loading={sending}
                        style={{ color: '#0068ff', borderColor: '#0068ff' }}
                      />
                    </Tooltip>
                    <Tooltip title="Yêu cầu khách chia sẻ Email" placement="top">
                      <Button
                        size="small"
                        shape="circle"
                        icon={<MailOutlined />}
                        onClick={() => handleSendMessage(null, false, false, true)}
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
                      value={messageText}
                      onChange={handleMsgTextChange}
                      placeholder="Nhập tin nhắn (hoặc gõ /phimtat)..."
                      autoSize={{ minRows: 1, maxRows: 4 }}
                      style={{ borderRadius: 18, resize: 'none', flex: 1, padding: '8px 12px' }}
                      onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); handleSendMessage() } }}
                      disabled={sending}
                    />
                    {/* Đính kèm ảnh và tài liệu ở bên phải (nằm ngang như bình thường) */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 2 }}>
                      <Upload fileList={[]} beforeUpload={(file) => { handleSendMessage(file, false, false); return false; }} showUploadList={false} multiple={true} accept="image/*">
                        <Button shape="circle" icon={<PictureOutlined style={{ fontSize: 16 }} />} disabled={sending} title="Gửi hình ảnh" />
                      </Upload>
                      <Upload fileList={[]} beforeUpload={(file) => { handleSendMessage(file, false, true); return false; }} showUploadList={false} multiple={true}>
                        <Button shape="circle" icon={<PaperClipOutlined style={{ fontSize: 16 }} />} disabled={sending} title="Gửi file tài liệu" />
                      </Upload>
                      <Button
                        type="primary"
                        icon={<SendOutlined style={{ fontSize: 16 }} />}
                        onClick={() => handleSendMessage()}
                        loading={sending}
                        style={{ background: '#0068ff', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#9ca3af' }}>
              <WechatOutlined style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }} />
              <span>Chọn một hội thoại bên trái để bắt đầu chat</span>
            </div>
          )}
        </div>
        )}

        {/* Resizer Phải */}
        {!isMobile && selectedLead && (
        <div
          onMouseDown={startDragRight}
          style={{ width: 4, cursor: 'col-resize', background: '#f1f5f9', borderLeft: '1px solid #e2e8f0', flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.background = '#3b82f6'}
          onMouseLeave={e => { if (!isDraggingRight.current) e.currentTarget.style.background = '#f1f5f9' }}
        />
        )}

        {/* Cột 4: CRM Right Profile & Notes Panel */}
        {!isMobile && selectedLead && (
        <div style={{ width: rightColWidth, background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
          {renderCustomerInfo()}
        </div>
        )}
      </div>

      {/* Mobile Drawer for Customer Info */}
      <Drawer
        title={<Space><InfoCircleOutlined style={{ color: '#0068ff' }} /> Thông tin khách hàng</Space>}
        placement="right"
        onClose={() => setInfoDrawerVisible(false)}
        open={infoDrawerVisible}
        width={320}
        styles={{ body: { padding: 0 } }}
      >
        {selectedLead && renderCustomerInfo()}
      </Drawer>

      {/* Modal Convert Khách Hàng CRM */}
      <Modal
        title={<Space><UserAddOutlined style={{ color: '#8b5cf6' }} />Chuyển đổi Lead Zalo thành Khách hàng CRM</Space>}
        open={convertModalVisible}
        onCancel={() => setConvertModalVisible(false)}
        onOk={handleConvert}
        okText="Chuyển đổi"
        cancelText="Huỷ"
        confirmLoading={convertLoading}
        okButtonProps={{ style: { background: '#8b5cf6', borderColor: '#8b5cf6' } }}
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Nhập tên và số điện thoại của <strong>{selectedLeadDetail?.display_name}</strong> để tạo hồ sơ Khách hàng CRM chính thức. Nếu SĐT đã tồn tại, hệ thống sẽ tự động liên kết Lead vào hồ sơ hiện có.
        </Paragraph>
        <Form form={convertForm} layout="vertical">
          <Form.Item name="customer_name" label="Tên khách hàng" rules={[{ required: true, message: 'Vui lòng nhập tên khách hàng' }]}>
            <Input prefix={<UserOutlined />} placeholder="VD: Anh Minh (Zalo)" size="large" />
          </Form.Item>
          <Form.Item name="phone_number" label="Số điện thoại" rules={[{ required: true, message: 'Vui lòng nhập số điện thoại' }]}>
            <Input prefix={<PhoneOutlined />} placeholder="VD: 0901234567" size="large" />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input placeholder="VD: minh@example.com" size="large" />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ">
            <Input placeholder="VD: 123 Lê Lợi, Q1, TP. HCM" size="large" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Quản Lý Nhãn Tag */}
      <Modal
        title="🏷️ Quản lý Nhãn hội thoại Zalo"
        open={manageTagsModal}
        onCancel={() => setManageTagsModal(false)}
        footer={[<Button key="close" onClick={() => setManageTagsModal(false)}>Đóng</Button>]}
      >
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
            style={{ width: 40, height: 32, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateTag}>Thêm</Button>
        </div>
        <Divider style={{ margin: '12px 0' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
          {tagsList.length === 0 ? (
            <Text type="secondary">Chưa có nhãn nào được tạo.</Text>
          ) : (
            tagsList.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div>
                  <Tag color={t.color || '#3b82f6'} style={{ fontWeight: 600 }}>{t.name}</Tag>
                </div>
                <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => handleDeleteTag(t.id)} />
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Modal Quản Lý Văn Bản Mẫu Zalo (Quick Replies) */}
      <Modal
        title="⚡ Quản lý Văn bản mẫu & Gõ tắt (/shortcut)"
        open={quickReplyModal}
        onCancel={() => setQuickReplyModal(false)}
        footer={[<Button key="close" onClick={() => setQuickReplyModal(false)}>Đóng</Button>]}
      >
        <div style={{ background: '#fff7ed', padding: 12, borderRadius: 8, border: '1px solid #ffedd5', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, color: '#9a3412', marginBottom: 6 }}>Tạo mẫu tin nhắn trả lời nhanh mới:</div>
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Space style={{ width: '100%' }}>
              <Input
                placeholder="Phím tắt (/hello)..."
                value={qrShortcut}
                onChange={e => setQrShortcut(e.target.value)}
                style={{ width: 140 }}
              />
              <Input
                placeholder="Tiêu đề mô tả ngắn..."
                value={qrTitle}
                onChange={e => setQrTitle(e.target.value)}
                style={{ flex: 1 }}
              />
            </Space>
            <Input.TextArea
              placeholder="Nội dung tin nhắn mẫu khi gõ phím tắt..."
              value={qrContent}
              onChange={e => setQrContent(e.target.value)}
              rows={2}
            />
            <Button type="primary" loading={qrSaving} onClick={handleCreateQuickReply} style={{ background: '#f97316', borderColor: '#f97316' }}>
              + Thêm mẫu gõ tắt
            </Button>
          </Space>
        </div>
        <Divider style={{ margin: '12px 0' }} />
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Danh sách mẫu gõ tắt hiện có:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
          {quickRepliesList.length === 0 ? (
            <Text type="secondary">Chưa có văn bản mẫu nào.</Text>
          ) : (
            quickRepliesList.map(qr => (
              <div key={qr.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#f8fafc', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => handleInsertQuickReply(qr)}>
                  <Space style={{ marginBottom: 4 }}>
                    <Tag color="orange" style={{ fontWeight: 700 }}>{qr.shortcut}</Tag>
                    <Text strong style={{ fontSize: 13 }}>{qr.title}</Text>
                  </Space>
                  <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'pre-wrap' }}>{qr.content}</div>
                </div>
                <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => handleDeleteQuickReply(qr.id)} />
              </div>
            ))
          )}
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
