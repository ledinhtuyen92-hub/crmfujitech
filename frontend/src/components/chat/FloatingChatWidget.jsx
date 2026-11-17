import React, { useState, useEffect, useRef } from 'react'
import {
  Badge,
  Button,
  Card,
  Input,
  Space,
  Avatar,
  List,
  Typography,
  Tag,
  Tooltip,
  Modal,
  Select,
  Image,
  Upload,
  Popconfirm,
  message,
} from 'antd'
import {
  MessageOutlined,
  CloseOutlined,
  MinusOutlined,
  FullscreenOutlined,
  LeftOutlined,
  SendOutlined,
  PaperClipOutlined,
  TagOutlined,
  UserOutlined,
  TeamOutlined,
  ApartmentOutlined,
  FileDoneOutlined,
  ShoppingCartOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  RollbackOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useChat } from '../../contexts/ChatContext'
import { useAuth } from '../../contexts/AuthContext'
import { useResponsive } from '../../hooks/useResponsive'
import api from '../../utils/api'

const { Text } = Typography
const { TextArea } = Input

export default function FloatingChatWidget() {
  const { user, isModuleActive, isCompanyAdmin, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { isMobile } = useResponsive()

  const {
    conversations,
    totalUnreadCount,
    isWidgetOpen,
    setIsWidgetOpen,
    widgetConvId,
    setWidgetConvId,
    messagesByConv,
    sendMessage,
    sendTyping,
    markAsRead,
    startDirectChat,
    createGroupChat,
    deleteConversation,
    recallMessage,
    onlineUserIds,
    typingUsers,
    fetchConversations,
  } = useChat()

  const [inputContent, setInputContent] = useState('')
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'direct' | 'group'
  const [searchText, setSearchText] = useState('')
  const [newChatModalOpen, setNewChatModalOpen] = useState(false)
  const [crmDocModalOpen, setCrmDocModalOpen] = useState(false)
  const [colleagues, setColleagues] = useState([])
  const [crmDocs, setCrmDocs] = useState([])
  const [searchingDocs, setSearchingDocs] = useState(false)
  const [docSearchKeyword, setDocSearchKeyword] = useState('')

  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const searchTimeoutRef = useRef(null)

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [])

  // Không hiển thị widget nếu đang ở ngay trang /internal-chat toàn màn hình
  const isDedicatedChatPage = location.pathname === '/internal-chat'

  // Cuộn tin nhắn xuống cuối cùng khi có tin mới
  useEffect(() => {
    if (isWidgetOpen && widgetConvId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messagesByConv, widgetConvId, isWidgetOpen])

  // Khi mở hội thoại trong widget, đánh dấu đã đọc
  useEffect(() => {
    if (isWidgetOpen && widgetConvId) {
      markAsRead(widgetConvId)
    }
  }, [isWidgetOpen, widgetConvId, markAsRead])

  if (!user || isDedicatedChatPage || !isModuleActive('chat')) return null

  const activeConv = conversations.find((c) => c.id === widgetConvId)
  const activeMessages = (widgetConvId && messagesByConv[widgetConvId]) || []
  const activeTyping = (widgetConvId && typingUsers[widgetConvId]) || []

  // Lọc hội thoại theo tab và tìm kiếm
  const filteredConversations = conversations.filter((c) => {
    if (activeTab === 'direct' && c.type !== 'direct') return false
    if (activeTab === 'group' && c.type === 'direct') return false
    if (!searchText) return true

    const title = c.type === 'direct' ? c.direct_partner?.full_name || '' : c.title || ''
    return title.toLowerCase().includes(searchText.toLowerCase())
  })

  // Gửi tin nhắn văn bản
  const handleSend = async () => {
    const trimmed = inputContent.trim()
    if (!trimmed || !widgetConvId) return

    setInputContent('')
    sendTyping(widgetConvId, false)
    await sendMessage({
      conversationId: widgetConvId,
      content: trimmed,
      messageType: 'text',
    })
  }

  // Xử lý gửi tệp tin / hình ảnh
  const handleFileUpload = async (file) => {
    if (!widgetConvId) return
    const isImg = file.type?.startsWith('image/')
    await sendMessage({
      conversationId: widgetConvId,
      content: isImg ? '' : file.name,
      messageType: isImg ? 'image' : 'file',
      file,
    })
  }

  // Xử lý dán ảnh từ clipboard (Ctrl + V)
  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file) {
          handleFileUpload(file)
          e.preventDefault()
          return
        }
      }
    }
  }

  // Tìm kiếm chứng từ CRM để gắn thẻ (có debounce 250ms)
  const handleSearchCrmDocs = (val) => {
    setDocSearchKeyword(val)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!val.trim()) {
      setCrmDocs([])
      setSearchingDocs(false)
      return
    }
    setSearchingDocs(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await api.get('/chat/search-crm-docs/', { params: { q: val.trim() } })
        setCrmDocs(res.data || [])
      } catch (_) {
        setCrmDocs([])
      } finally {
        setSearchingDocs(false)
      }
    }, 250)
  }

  // Chọn chứng từ CRM và gửi ngay vào chat
  const handleSelectCrmDoc = async (doc) => {
    setCrmDocModalOpen(false)
    if (!widgetConvId) return
    await sendMessage({
      conversationId: widgetConvId,
      content: `[Chứng từ CRM] ${doc.title}`,
      messageType: 'context_doc',
      contextData: doc,
    })
  }

  // Mở modal tạo chat mới
  const handleOpenNewChatModal = async () => {
    try {
      const res = await api.get('/chat/colleagues/')
      setColleagues(res.data || [])
      setNewChatModalOpen(true)
    } catch (_) {}
  }

  return (
    <>
      {/* ── 1. Floating Action Button (Góc dưới bên phải) ── */}
      {!isWidgetOpen && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1050 }}>
          <Tooltip title="Chat nội bộ công ty" placement="left">
            <Badge count={totalUnreadCount} overflowCount={99} offset={[-4, 4]}>
              <Button
                type="primary"
                shape="circle"
                size="large"
                icon={<MessageOutlined style={{ fontSize: 24 }} />}
                onClick={() => setIsWidgetOpen(true)}
                style={{
                  width: 56,
                  height: 56,
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  boxShadow: '0 8px 24px rgba(37, 99, 235, 0.35)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />
            </Badge>
          </Tooltip>
        </div>
      )}

      {/* ── 2. Floating Chat Window ── */}
      {isWidgetOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: isMobile ? 0 : 20,
            right: isMobile ? 0 : 24,
            width: isMobile ? '100vw' : 380,
            height: isMobile ? '100vh' : 530,
            zIndex: 1050,
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            borderRadius: isMobile ? 0 : 16,
            boxShadow: '0 12px 36px rgba(15, 23, 42, 0.2), 0 4px 12px rgba(15, 23, 42, 0.08)',
            border: isMobile ? 'none' : '1px solid #e2e8f0',
            overflow: 'hidden',
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            {activeConv ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <Button
                  type="text"
                  size="small"
                  icon={<LeftOutlined style={{ color: '#fff' }} />}
                  onClick={() => setWidgetConvId(null)}
                  style={{ color: '#fff', padding: 0, width: 26, height: 26 }}
                />
                <div style={{ position: 'relative' }}>
                  <Avatar
                    src={activeConv.type === 'direct' ? activeConv.direct_partner?.avatar : activeConv.avatar}
                    icon={activeConv.type === 'direct' ? <UserOutlined /> : <TeamOutlined />}
                    size={32}
                    style={{ background: '#3b82f6' }}
                  />
                  {activeConv.type === 'direct' && onlineUserIds.has(activeConv.direct_partner?.id) && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 10,
                        height: 10,
                        background: '#22c55e',
                        border: '2px solid #fff',
                        borderRadius: '50%',
                      }}
                    />
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeConv.type === 'direct' ? activeConv.direct_partner?.full_name : activeConv.title}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#bfdbfe', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeConv.type === 'direct'
                      ? onlineUserIds.has(activeConv.direct_partner?.id) ? 'Đang hoạt động' : 'Ngoại tuyến'
                      : `${activeConv.participants?.length || 0} thành viên`}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageOutlined style={{ fontSize: 18 }} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>Chat Nội Bộ</span>
                {totalUnreadCount > 0 && <Tag color="error" style={{ margin: 0, fontSize: 11 }}>{totalUnreadCount}</Tag>}
              </div>
            )}

            <Space size={4}>
              {activeConv && activeConv.type !== 'department' && (
                <Popconfirm
                  title={
                    activeConv.type === 'direct'
                      ? 'Xóa cuộc trò chuyện ở phía bạn?'
                      : (activeConv.created_by?.id === user?.id || isCompanyAdmin || isSuperAdmin
                          ? 'Giải tán nhóm trò chuyện này?'
                          : 'Rời khỏi nhóm trò chuyện này?')
                  }
                  description={
                    activeConv.type === 'direct'
                      ? 'Cuộc trò chuyện sẽ được ẩn khỏi danh sách của bạn. Người đối diện vẫn giữ lịch sử trò chuyện.'
                      : (activeConv.created_by?.id === user?.id || isCompanyAdmin || isSuperAdmin
                          ? 'Toàn bộ tin nhắn và dữ liệu nhóm sẽ bị xóa triệt để khỏi hệ thống.'
                          : 'Bạn sẽ rời nhóm và không nhận được tin nhắn từ nhóm này nữa.')
                  }
                  okText={
                    activeConv.type === 'direct'
                      ? 'Xóa ở phía tôi'
                      : (activeConv.created_by?.id === user?.id || isCompanyAdmin || isSuperAdmin
                          ? 'Giải tán nhóm'
                          : 'Rời nhóm')
                  }
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => deleteConversation(activeConv.id)}
                >
                  <Tooltip
                    title={
                      activeConv.type === 'direct'
                        ? 'Xóa ở phía tôi'
                        : (activeConv.created_by?.id === user?.id || isCompanyAdmin || isSuperAdmin
                            ? 'Giải tán nhóm'
                            : 'Rời nhóm')
                    }
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined style={{ color: '#fff' }} />}
                      style={{ color: '#fff', width: 28, height: 28 }}
                    />
                  </Tooltip>
                </Popconfirm>
              )}
              <Tooltip title="Mở trang Chat toàn màn hình">
                <Button
                  type="text"
                  size="small"
                  icon={<FullscreenOutlined style={{ color: '#fff' }} />}
                  onClick={() => {
                    setIsWidgetOpen(false)
                    navigate('/internal-chat')
                  }}
                  style={{ color: '#fff', width: 28, height: 28 }}
                />
              </Tooltip>
              <Button
                type="text"
                size="small"
                icon={<MinusOutlined style={{ color: '#fff' }} />}
                onClick={() => setIsWidgetOpen(false)}
                style={{ color: '#fff', width: 28, height: 28 }}
              />
            </Space>
          </div>

          {/* ── Body: Conversation List ── */}
          {!activeConv && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {/* Search & Actions */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <Input
                    placeholder="Tìm đồng nghiệp, nhóm..."
                    prefix={<MessageOutlined style={{ color: '#94a3b8' }} />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                    size="small"
                    style={{ borderRadius: 6 }}
                  />
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={handleOpenNewChatModal}
                    title="Nhắn tin với đồng nghiệp"
                    style={{ background: '#2563eb', borderRadius: 6 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button
                    size="small"
                    type={activeTab === 'all' ? 'primary' : 'text'}
                    onClick={() => setActiveTab('all')}
                    style={{ fontSize: 11, padding: '0 8px', height: 22 }}
                  >
                    Tất cả
                  </Button>
                  <Button
                    size="small"
                    type={activeTab === 'direct' ? 'primary' : 'text'}
                    onClick={() => setActiveTab('direct')}
                    style={{ fontSize: 11, padding: '0 8px', height: 22 }}
                  >
                    1-1
                  </Button>
                  <Button
                    size="small"
                    type={activeTab === 'group' ? 'primary' : 'text'}
                    onClick={() => setActiveTab('group')}
                    style={{ fontSize: 11, padding: '0 8px', height: 22 }}
                  >
                    Nhóm
                  </Button>
                </div>
              </div>

              {/* List */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <List
                  dataSource={filteredConversations}
                  locale={{ emptyText: 'Chưa có cuộc trò chuyện nào' }}
                  renderItem={(item) => {
                    const isDirect = item.type === 'direct'
                    const partner = item.direct_partner
                    const title = isDirect ? partner?.full_name : item.title
                    const isOnline = isDirect && onlineUserIds.has(partner?.id)

                    return (
                      <List.Item
                        onClick={() => {
                          setWidgetConvId(item.id)
                          fetchMessages(item.id)
                        }}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          borderBottom: '1px solid #f8fafc',
                          background: item.unread_count > 0 ? '#f0f9ff' : '#fff',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = item.unread_count > 0 ? '#f0f9ff' : '#fff')}
                      >
                        <List.Item.Meta
                          avatar={
                            <div style={{ position: 'relative' }}>
                              <Avatar
                                src={isDirect ? partner?.avatar : item.avatar}
                                icon={isDirect ? <UserOutlined /> : <TeamOutlined />}
                                style={{ background: isDirect ? '#3b82f6' : '#10b981' }}
                              />
                              {isOnline && (
                                <span
                                  style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    right: 0,
                                    width: 9,
                                    height: 9,
                                    background: '#22c55e',
                                    border: '2px solid #fff',
                                    borderRadius: '50%',
                                  }}
                                />
                              )}
                            </div>
                          }
                          title={
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: item.unread_count > 0 ? 700 : 600, fontSize: 13, color: '#0f172a' }}>
                                {title}
                              </span>
                              {item.unread_count > 0 && (
                                <Badge count={item.unread_count} size="small" style={{ backgroundColor: '#ef4444' }} />
                              )}
                            </div>
                          }
                          description={
                            <div style={{ fontSize: 11.5, color: item.unread_count > 0 ? '#0284c7' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: item.unread_count > 0 ? 600 : 400 }}>
                              {item.last_sender_name ? `${item.last_sender_name}: ` : ''}
                              {item.last_message_text || 'Bắt đầu cuộc trò chuyện'}
                            </div>
                          }
                        />
                      </List.Item>
                    )
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Body: Chat Room ── */}
          {activeConv && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {/* Message scroll container */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', background: '#f8fafc' }}>
                {activeMessages.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 12 }}>
                    Chưa có tin nhắn nào. Hãy gửi lời chào để bắt đầu trao đổi!
                  </div>
                )}
                {activeMessages.map((msg) => {
                  const isMine = msg.sender?.id === user?.id
                  const diffMins = (new Date() - new Date(msg.created_at)) / (1000 * 60)
                  const canRecall = isMine && !msg.is_recalled && diffMins <= 60

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isMine ? 'flex-end' : 'flex-start',
                        marginBottom: 10,
                      }}
                    >
                      {!isMine && activeConv.type !== 'direct' && (
                        <span style={{ fontSize: 10.5, color: '#64748b', marginBottom: 2, marginLeft: 4 }}>
                          {msg.sender?.full_name}
                        </span>
                      )}

                      {msg.is_recalled ? (
                        <div
                          style={{
                            maxWidth: '82%',
                            padding: '6px 10px',
                            borderRadius: 12,
                            background: '#f1f5f9',
                            color: '#94a3b8',
                            fontStyle: 'italic',
                            fontSize: 11.5,
                            border: '1px dashed #cbd5e1',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <StopOutlined style={{ fontSize: 11, color: '#94a3b8' }} />
                          <span>Tin nhắn đã được thu hồi</span>
                        </div>
                      ) : (
                        <div
                          style={{
                            maxWidth: '82%',
                            padding: msg.message_type === 'context_doc' ? '8px 10px' : '8px 12px',
                            borderRadius: 12,
                            background: isMine ? '#2563eb' : '#ffffff',
                            color: isMine ? '#ffffff' : '#0f172a',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                            border: isMine ? 'none' : '1px solid #e2e8f0',
                            wordBreak: 'break-word',
                            fontSize: 12.5,
                            lineHeight: 1.45,
                          }}
                        >
                          {/* Hình ảnh */}
                          {msg.message_type === 'image' && msg.file_url && (
                            <div style={{ marginBottom: msg.content ? 6 : 0, borderRadius: 8, overflow: 'hidden' }}>
                              <Image src={msg.file_url} alt="chat-img" style={{ maxHeight: 180, objectFit: 'cover' }} />
                            </div>
                          )}

                          {/* File đính kèm */}
                          {msg.message_type === 'file' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                              <PaperClipOutlined style={{ fontSize: 16 }} />
                              <a
                                href={msg.file_url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: isMine ? '#dbeafe' : '#2563eb', textDecoration: 'underline' }}
                              >
                                {msg.file_name || 'Tệp đính kèm'}
                              </a>
                            </div>
                          )}

                          {/* Thẻ chứng từ CRM */}
                          {msg.message_type === 'context_doc' && msg.context_data && (
                            <div
                              style={{
                                background: isMine ? 'rgba(255,255,255,0.15)' : '#f1f5f9',
                                padding: '8px 10px',
                                borderRadius: 8,
                                borderLeft: `3px solid ${isMine ? '#93c5fd' : '#2563eb'}`,
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                <Tag color="blue" style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>
                                  {msg.context_data.doc_code}
                                </Tag>
                                <span style={{ fontSize: 11, fontWeight: 700 }}>{msg.context_data.extra}</span>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                                {msg.context_data.title}
                              </div>
                            </div>
                          )}

                          {/* Nội dung text */}
                          {msg.content && msg.message_type !== 'context_doc' && (
                            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                          )}
                        </div>
                      )}

                      {/* Time và Recall button */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, padding: '0 4px' }}>
                        <span style={{ fontSize: 9.5, color: '#94a3b8' }}>
                          {new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {canRecall && (
                          <Popconfirm
                            title="Thu hồi tin nhắn này?"
                            description="Tin nhắn sẽ bị thu hồi ở cả hai phía."
                            okText="Thu hồi"
                            cancelText="Hủy"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => recallMessage(widgetConvId, msg.id)}
                          >
                            <Button
                              type="text"
                              size="small"
                              icon={<RollbackOutlined style={{ fontSize: 10, color: '#94a3b8' }} />}
                              title="Thu hồi tin nhắn"
                              style={{ height: 16, width: 16, padding: 0, minWidth: 16 }}
                            />
                          </Popconfirm>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Typing indicator */}
                {activeTyping.length > 0 && (
                  <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', marginBottom: 6 }}>
                    {activeTyping.join(', ')} đang soạn tin...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Bottom input bar */}
              <div style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
                <TextArea
                  placeholder="Nhập tin nhắn... (Enter gửi, Shift+Enter xuống dòng, dán ảnh Ctrl+V)"
                  value={inputContent}
                  onChange={(e) => {
                    setInputContent(e.target.value)
                    sendTyping(widgetConvId, e.target.value.length > 0)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  onPaste={handlePaste}
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  style={{ borderRadius: 8, fontSize: 12.5 }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <Space size={4}>
                    <Tooltip title="Gửi tệp tin / Hình ảnh">
                      <Button
                        type="text"
                        size="small"
                        icon={<PaperClipOutlined />}
                        onClick={() => fileInputRef.current?.click()}
                      />
                    </Tooltip>
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleFileUpload(file)
                        e.target.value = ''
                      }}
                    />

                    <Tooltip title="Gắn thẻ chứng từ CRM (Đơn hàng, Báo giá, Khách hàng)">
                      <Button
                        type="text"
                        size="small"
                        icon={<TagOutlined style={{ color: '#d97706' }} />}
                        onClick={() => {
                          setDocSearchKeyword('')
                          setCrmDocs([])
                          setCrmDocModalOpen(true)
                        }}
                      />
                    </Tooltip>
                  </Space>

                  <Button
                    type="primary"
                    size="small"
                    icon={<SendOutlined />}
                    disabled={!inputContent.trim()}
                    onClick={handleSend}
                    style={{ background: '#2563eb', borderRadius: 6 }}
                  >
                    Gửi
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal Bắt đầu trò chuyện với đồng nghiệp ── */}
      <Modal
        title="Nhắn tin với đồng nghiệp"
        open={newChatModalOpen}
        onCancel={() => setNewChatModalOpen(false)}
        footer={null}
        width={400}
        centered
        destroyOnClose
      >
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          <List
            dataSource={colleagues}
            renderItem={(colleague) => (
              <List.Item
                onClick={async () => {
                  setNewChatModalOpen(false)
                  await startDirectChat(colleague.id)
                }}
                style={{ cursor: 'pointer', padding: '8px 12px', borderRadius: 6 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <List.Item.Meta
                  avatar={<Avatar src={colleague.avatar} icon={<UserOutlined />} style={{ background: '#3b82f6' }} />}
                  title={<strong style={{ fontSize: 13 }}>{colleague.full_name}</strong>}
                  description={<span style={{ fontSize: 11, color: '#64748b' }}>{colleague.department_name || colleague.role_name || colleague.username}</span>}
                />
              </List.Item>
            )}
          />
        </div>
      </Modal>

      {/* ── Modal Tìm kiếm & Gắn thẻ chứng từ CRM ── */}
      <Modal
        title="Gắn thẻ chứng từ CRM vào tin nhắn"
        open={crmDocModalOpen}
        onCancel={() => setCrmDocModalOpen(false)}
        footer={null}
        width={480}
        centered
        destroyOnClose
      >
        <Input
          placeholder="Nhập mã ĐH (747), Báo giá, hoặc tên khách hàng..."
          value={docSearchKeyword}
          onChange={(e) => handleSearchCrmDocs(e.target.value)}
          allowClear
          style={{ marginBottom: 12 }}
        />
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          <List
            loading={searchingDocs}
            dataSource={crmDocs}
            locale={{ emptyText: docSearchKeyword ? 'Không tìm thấy chứng từ phù hợp' : 'Hãy nhập từ khóa để tìm kiếm' }}
            renderItem={(doc) => (
              <List.Item
                onClick={() => handleSelectCrmDoc(doc)}
                style={{ cursor: 'pointer', padding: '10px 12px', borderRadius: 8, borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fdf4')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Tag color={doc.badge_color} style={{ fontWeight: 600 }}>{doc.doc_code}</Tag>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{doc.title}</span>
                  </div>
                  {doc.extra && <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 12 }}>{doc.extra}</span>}
                </div>
              </List.Item>
            )}
          />
        </div>
      </Modal>
    </>
  )
}
