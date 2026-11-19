import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  List,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Dropdown,
  Popconfirm,
  message,
} from 'antd'
import {
  MessageOutlined,
  SendOutlined,
  PaperClipOutlined,
  TagOutlined,
  UserOutlined,
  TeamOutlined,
  ApartmentOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  LeftOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  ShoppingCartOutlined,
  FileDoneOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  MoreOutlined,
  RollbackOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useChat } from '../contexts/ChatContext'
import { useAuth } from '../contexts/AuthContext'
import { useResponsive } from '../hooks/useResponsive'
import api from '../utils/api'

const { Title, Text } = Typography
const { TextArea } = Input

export default function InternalChat() {
  const { user, isCompanyAdmin, isSuperAdmin, hasPermission } = useAuth()
  const { isMobile } = useResponsive()

  const {
    conversations,
    activeConversation,
    setActiveConversation,
    messagesByConv,
    loadingMessages,
    onlineUserIds,
    typingUsers,
    totalUnreadCount,
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
  } = useChat()

  const [inputContent, setInputContent] = useState('')
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'direct' | 'department' | 'group'
  const [searchText, setSearchText] = useState('')
  const [colleagueSearchText, setColleagueSearchText] = useState('')
  const [colleagueFilterTab, setColleagueFilterTab] = useState('all') // 'all' | 'online' | 'offline'
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false)
  const [directChatModalOpen, setDirectChatModalOpen] = useState(false)
  const [crmDocModalOpen, setCrmDocModalOpen] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)

  // Dữ liệu cho modal tạo nhóm & chat trực tiếp
  const [colleagues, setColleagues] = useState([])
  const [groupTitle, setGroupTitle] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState([])

  // Dữ liệu tìm kiếm chứng từ CRM
  const [crmDocs, setCrmDocs] = useState([])
  const [searchingDocs, setSearchingDocs] = useState(false)
  const [docSearchKeyword, setDocSearchKeyword] = useState('')

  // Cấu hình lưu trữ
  const [chatConfig, setChatConfig] = useState({
    retention_days: 90,
    max_file_size_mb: 15,
    allow_file_upload: true,
    auto_compress_images: true,
  })
  const [savingConfig, setSavingConfig] = useState(false)
  const [cleaningFiles, setCleaningFiles] = useState(false)

  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const searchTimeoutRef = useRef(null)
  const initialMobileSetRef = useRef(false)

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [])

  const canManageConfig = isSuperAdmin || isCompanyAdmin || hasPermission('chat.admin')

  // Tải danh sách đồng nghiệp
  const fetchColleagues = () => {
    if (user) {
      api.get('/chat/colleagues/').then((res) => setColleagues(res.data || [])).catch(() => {})
    }
  }

  useEffect(() => {
    if (user) {
      fetchColleagues()
      api.get('/chat/department-groups/').then(() => fetchConversations()).catch(() => {})
      if (canManageConfig) {
        api.get('/chat/config/').then((res) => setChatConfig(res.data)).catch(() => {})
      }
    }
  }, [user, canManageConfig, fetchConversations])

  const openDirectChatModal = () => {
    setColleagueSearchText('')
    setColleagueFilterTab('all')
    setDirectChatModalOpen(true)
    fetchColleagues()
  }

  // Số lượng đồng nghiệp online
  const onlineCount = useMemo(() => {
    return colleagues.filter((c) => onlineUserIds.has(c.id) || !!c.is_online).length
  }, [colleagues, onlineUserIds])

  // Danh sách đồng nghiệp hiển thị trong modal Nhắn tin trực tiếp
  const filteredColleaguesInModal = useMemo(() => {
    let list = colleagues.map((c) => ({
      ...c,
      isOnline: onlineUserIds.has(c.id) || !!c.is_online,
    }))

    if (colleagueSearchText.trim()) {
      const q = colleagueSearchText.trim().toLowerCase()
      list = list.filter((c) =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.username || '').toLowerCase().includes(q) ||
        (c.department_name || '').toLowerCase().includes(q) ||
        (c.role_name || '').toLowerCase().includes(q)
      )
    }

    if (colleagueFilterTab === 'online') {
      list = list.filter((c) => c.isOnline)
    } else if (colleagueFilterTab === 'offline') {
      list = list.filter((c) => !c.isOnline)
    }

    return list.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1
      return (a.full_name || '').localeCompare(b.full_name || '', 'vi')
    })
  }, [colleagues, onlineUserIds, colleagueSearchText, colleagueFilterTab])

  // Lọc danh sách hội thoại theo từ khóa và tab
  const searchLower = searchText.trim().toLowerCase()
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (activeTab === 'direct' && c.type !== 'direct') return false
      if (activeTab === 'department' && c.type !== 'department') return false
      if (activeTab === 'group' && c.type !== 'group') return false
      if (!searchLower) return true

      if (c.type === 'direct') {
        const partner = c.direct_partner || {}
        return (
          (partner.full_name || '').toLowerCase().includes(searchLower) ||
          (partner.username || '').toLowerCase().includes(searchLower) ||
          (partner.department_name || '').toLowerCase().includes(searchLower) ||
          (partner.role_name || '').toLowerCase().includes(searchLower)
        )
      }
      return (
        (c.title || '').toLowerCase().includes(searchLower) ||
        (c.department_name || '').toLowerCase().includes(searchLower)
      )
    })
  }, [conversations, activeTab, searchLower])

  // Lọc danh sách đồng nghiệp phù hợp với từ khóa tìm kiếm (dùng để gợi ý chat 1-1 ngay trên thanh tìm kiếm)
  const matchingColleagues = useMemo(() => {
    if (!searchLower || activeTab === 'department' || activeTab === 'group') return []
    return colleagues
      .filter((col) => {
        const name = (col.full_name || '').toLowerCase()
        const uname = (col.username || '').toLowerCase()
        const dept = (col.department_name || '').toLowerCase()
        const role = (col.role_name || '').toLowerCase()
        return (
          name.includes(searchLower) ||
          uname.includes(searchLower) ||
          dept.includes(searchLower) ||
          role.includes(searchLower)
        )
      })
      .map((col) => ({
        ...col,
        isOnline: onlineUserIds.has(col.id) || !!col.is_online,
      }))
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1
        return (a.full_name || '').localeCompare(b.full_name || '', 'vi')
      })
  }, [searchLower, colleagues, activeTab, onlineUserIds])

  const currentMessages = (activeConversation && messagesByConv[activeConversation.id]) || []
  const currentTyping = (activeConversation && typingUsers[activeConversation.id]) || []

  // Trên Mobile: Mặc định hiển thị danh sách hội thoại khi mới mở trang lần đầu
  useEffect(() => {
    if (isMobile && !initialMobileSetRef.current) {
      initialMobileSetRef.current = true
      setActiveConversation(null)
    }
  }, [isMobile, setActiveConversation])

  // Tự động chọn cuộc trò chuyện đầu tiên nếu chưa chọn hội thoại nào (chỉ áp dụng trên Desktop)
  useEffect(() => {
    if (!isMobile && !activeConversation && filteredConversations.length > 0) {
      setActiveConversation(filteredConversations[0])
    }
  }, [isMobile, filteredConversations, activeConversation, setActiveConversation])

  // Tự động cuộn xuống cuối khi có tin nhắn mới hoặc đổi hội thoại
  useEffect(() => {
    if (activeConversation) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [currentMessages.length, activeConversation?.id])

  // Tải tin nhắn và đánh dấu đã đọc khi chọn hội thoại
  useEffect(() => {
    if (activeConversation?.id) {
      if (fetchMessages) fetchMessages(activeConversation.id)
      if (markAsRead) markAsRead(activeConversation.id)
    }
  }, [activeConversation?.id, fetchMessages, markAsRead])

  // Gửi tin nhắn text
  const handleSend = async () => {
    const trimmed = inputContent.trim()
    if (!trimmed || !activeConversation) return

    setInputContent('')
    sendTyping(activeConversation.id, false)
    await sendMessage({
      conversationId: activeConversation.id,
      content: trimmed,
      messageType: 'text',
    })
  }

  // Gửi file đính kèm
  const handleFileUpload = async (file) => {
    if (!activeConversation) return
    const isImg = file.type?.startsWith('image/')
    await sendMessage({
      conversationId: activeConversation.id,
      content: isImg ? '' : file.name,
      messageType: isImg ? 'image' : 'file',
      file,
    })
  }

  // Dán ảnh từ clipboard (Ctrl + V)
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

  // Tìm kiếm chứng từ CRM (có debounce 250ms tránh xung đột request)
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

  // Chọn chứng từ CRM
  const handleSelectCrmDoc = async (doc) => {
    setCrmDocModalOpen(false)
    if (!activeConversation) return
    await sendMessage({
      conversationId: activeConversation.id,
      content: `[Chứng từ CRM] ${doc.title}`,
      messageType: 'context_doc',
      contextData: doc,
    })
  }

  // Lưu cấu hình lưu trữ
  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      const res = await api.post('/chat/config/', chatConfig)
      setChatConfig(res.data)
      message.success('Đã lưu cấu hình lưu trữ chat thành công!')
      setConfigModalOpen(false)
    } catch (err) {
      message.error(err.response?.data?.detail || 'Lưu cấu hình thất bại.')
    } finally {
      setSavingConfig(false)
    }
  }

  // Dọn dẹp tệp tin cũ
  const handleCleanOldFiles = async () => {
    setCleaningFiles(true)
    try {
      const res = await api.post('/chat/clean-old-files/', { days: 30 })
      message.success(res.data.detail || 'Đã dọn dẹp tệp tin cũ thành công!')
    } catch (err) {
      message.error(err.response?.data?.detail || 'Dọn dẹp thất bại.')
    } finally {
      setCleaningFiles(false)
    }
  }

  // Hàm render danh sách cuộc trò chuyện
  const renderConversationList = (list) => (
    <List
      dataSource={list}
      renderItem={(item) => {
        const isDirect = item.type === 'direct'
        const isDept = item.type === 'department'
        const partner = item.direct_partner
        const title = isDirect ? partner?.full_name : item.title
        const isOnline = isDirect && (onlineUserIds.has(partner?.id) || !!partner?.is_online)
        const isSelected = activeConversation?.id === item.id

        return (
          <List.Item
            onClick={() => {
              setActiveConversation(item)
              fetchMessages(item.id)
              markAsRead(item.id)
            }}
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              borderBottom: '1px solid #f8fafc',
              background: isSelected ? '#eff6ff' : item.unread_count > 0 ? '#f0fdf4' : '#ffffff',
              borderLeft: isSelected ? '4px solid #2563eb' : '4px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            <List.Item.Meta
              avatar={
                <div style={{ position: 'relative' }}>
                  <Avatar
                    src={isDirect ? partner?.avatar : item.avatar}
                    icon={isDirect ? <UserOutlined /> : isDept ? <ApartmentOutlined /> : <TeamOutlined />}
                    size={42}
                    style={{
                      background: isDirect ? '#3b82f6' : isDept ? '#8b5cf6' : '#10b981',
                    }}
                  />
                  {isOnline && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 11,
                        height: 11,
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
                  <span style={{ fontWeight: item.unread_count > 0 ? 700 : 600, fontSize: 13.5, color: '#0f172a' }}>
                    {title}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    {item.unread_count > 0 && (
                      <Badge count={item.unread_count} style={{ backgroundColor: '#ef4444' }} />
                    )}
                    {item.type !== 'department' && (
                      <Popconfirm
                        title={
                          item.type === 'direct'
                            ? 'Xóa cuộc trò chuyện ở phía bạn?'
                            : (item.created_by?.id === user?.id || isCompanyAdmin || isSuperAdmin
                                ? 'Giải tán nhóm trò chuyện này?'
                                : 'Rời khỏi nhóm trò chuyện này?')
                        }
                        description={
                          item.type === 'direct'
                            ? 'Cuộc trò chuyện sẽ được ẩn khỏi danh sách của bạn. Người đối diện vẫn giữ lịch sử trò chuyện. Nếu cả hai bên đều xóa, dữ liệu sẽ được xóa triệt để.'
                            : (item.created_by?.id === user?.id || isCompanyAdmin || isSuperAdmin
                                ? 'Toàn bộ tin nhắn và dữ liệu nhóm sẽ bị xóa triệt để khỏi hệ thống.'
                                : 'Bạn sẽ rời nhóm và không nhận được tin nhắn từ nhóm này nữa.')
                        }
                        okText={
                          item.type === 'direct'
                            ? 'Xóa ở phía tôi'
                            : (item.created_by?.id === user?.id || isCompanyAdmin || isSuperAdmin
                                ? 'Giải tán nhóm'
                                : 'Rời nhóm')
                        }
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => deleteConversation(item.id)}
                      >
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined style={{ fontSize: 13, color: '#94a3b8' }} />}
                          style={{ padding: 2, height: 22, width: 22 }}
                          title={
                            item.type === 'direct'
                              ? 'Xóa ở phía tôi'
                              : (item.created_by?.id === user?.id || isCompanyAdmin || isSuperAdmin
                                  ? 'Giải tán nhóm'
                                  : 'Rời nhóm')
                          }
                        />
                      </Popconfirm>
                    )}
                  </div>
                </div>
              }
              description={
                <div style={{ fontSize: 12, color: item.unread_count > 0 ? '#1e40af' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: item.unread_count > 0 ? 600 : 400 }}>
                  {item.last_sender_name ? `${item.last_sender_name}: ` : ''}
                  {item.last_message_text || 'Bắt đầu cuộc trò chuyện'}
                </div>
              }
            />
          </List.Item>
        )
      }}
    />
  )

  // Render Left Pane (Danh sách hội thoại)
  const renderLeftPane = () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRight: isMobile ? 'none' : '1px solid #e2e8f0',
        background: '#ffffff',
      }}
    >
      {/* Header Left */}
      <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
              }}
            >
              <MessageOutlined />
            </div>
            <div>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Chat Nội Bộ</span>
              {totalUnreadCount > 0 && (
                <Tag color="red" style={{ marginLeft: 6, fontWeight: 600 }}>
                  {totalUnreadCount} mới
                </Tag>
              )}
            </div>
          </div>

          <Space size={4}>
            <Tooltip title="Nhắn tin với đồng nghiệp">
              <Button
                type="text"
                icon={<UserOutlined style={{ fontSize: 16, color: '#2563eb' }} />}
                onClick={openDirectChatModal}
              />
            </Tooltip>
            <Tooltip title="Tạo nhóm chat mới">
              <Button
                type="text"
                icon={<PlusOutlined style={{ fontSize: 16, color: '#16a34a' }} />}
                onClick={() => setCreateGroupModalOpen(true)}
              />
            </Tooltip>
            {canManageConfig && (
              <Tooltip title="Cấu hình lưu trữ & dọn dẹp">
                <Button
                  type="text"
                  icon={<SettingOutlined style={{ fontSize: 16, color: '#64748b' }} />}
                  onClick={() => setConfigModalOpen(true)}
                />
              </Tooltip>
            )}
          </Space>
        </div>

        {/* Ô tìm kiếm */}
        <Input
          placeholder="Tìm kiếm đồng nghiệp, nhóm..."
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          style={{ borderRadius: 8, marginBottom: 8 }}
        />

        {/* Tabs bộ lọc */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'direct', label: '1 - 1' },
            { key: 'department', label: 'Phòng ban' },
            { key: 'group', label: 'Nhóm' },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              type={activeTab === tab.key ? 'primary' : 'default'}
              onClick={() => setActiveTab(tab.key)}
              style={{
                fontSize: 12,
                borderRadius: 6,
                padding: '0 8px',
                background: activeTab === tab.key ? '#2563eb' : '#f8fafc',
                border: activeTab === tab.key ? 'none' : '1px solid #e2e8f0',
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Danh sách hội thoại cuộn */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {searchLower ? (
          <div>
            {matchingColleagues.length === 0 && filteredConversations.length === 0 ? (
              <Empty
                description={`Không tìm thấy cuộc trò chuyện hoặc đồng nghiệp nào phù hợp với "${searchText}"`}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ margin: '40px 16px' }}
              />
            ) : (
              <>
                {/* Kết quả tìm kiếm đồng nghiệp */}
                {matchingColleagues.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: '8px 16px',
                        background: '#f8fafc',
                        borderBottom: '1px solid #f1f5f9',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Đồng nghiệp ({matchingColleagues.length})
                    </div>
                    <List
                      dataSource={matchingColleagues}
                      renderItem={(col) => {
                        const isOnline = col.isOnline
                        return (
                          <List.Item
                            onClick={async () => {
                              setSearchText('')
                              const conv = await startDirectChat(col.id)
                              if (conv?.id) {
                                setActiveConversation(conv)
                                if (fetchMessages) fetchMessages(conv.id)
                              }
                            }}
                            style={{
                              padding: '10px 16px',
                              cursor: 'pointer',
                              borderBottom: '1px solid #f8fafc',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                          >
                            <List.Item.Meta
                              avatar={
                                <div style={{ position: 'relative' }}>
                                  <Avatar
                                    src={col.avatar}
                                    icon={<UserOutlined />}
                                    size={40}
                                    style={{ background: isOnline ? '#2563eb' : '#94a3b8' }}
                                  />
                                  <span
                                    style={{
                                      position: 'absolute',
                                      bottom: 0,
                                      right: 0,
                                      width: 10,
                                      height: 10,
                                      background: isOnline ? '#22c55e' : '#cbd5e1',
                                      border: '2px solid #fff',
                                      borderRadius: '50%',
                                    }}
                                  />
                                </div>
                              }
                              title={
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 600, fontSize: 13.5, color: '#0f172a' }}>
                                    {col.full_name}
                                  </span>
                                  {isOnline ? (
                                    <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 500 }}>
                                      Online
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                      Offline
                                    </span>
                                  )}
                                </div>
                              }
                              description={
                                <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {col.department_name ? <span>{col.department_name}</span> : null}
                                  {col.role_name && <span style={{ color: '#94a3b8' }}> • {col.role_name}</span>}
                                </div>
                              }
                            />
                          </List.Item>
                        )
                      }}
                    />
                  </div>
                )}

                {/* Kết quả tìm kiếm cuộc trò chuyện */}
                {filteredConversations.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: '8px 16px',
                        background: '#f8fafc',
                        borderBottom: '1px solid #f1f5f9',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Cuộc trò chuyện ({filteredConversations.length})
                    </div>
                    {renderConversationList(filteredConversations)}
                  </div>
                )}
              </>
            )}
          </div>
        ) : filteredConversations.length > 0 ? (
          renderConversationList(filteredConversations)
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 16px' }}>
            <Empty
              description={
                activeTab === 'direct'
                  ? 'Chưa có cuộc trò chuyện 1-1 nào'
                  : activeTab === 'department'
                  ? 'Chưa có nhóm phòng ban nào'
                  : activeTab === 'group'
                  ? 'Chưa có nhóm trò chuyện nào'
                  : 'Chưa có cuộc trò chuyện nào'
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
            {activeTab === 'direct' && (
              <Button
                type="primary"
                icon={<UserOutlined />}
                onClick={openDirectChatModal}
                style={{ marginTop: 12, background: '#2563eb' }}
              >
                Nhắn tin với đồng nghiệp
              </Button>
            )}
            {activeTab === 'group' && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateGroupModalOpen(true)}
                style={{ marginTop: 12, background: '#16a34a' }}
              >
                Tạo nhóm chat mới
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // Render Right Pane (Khung Chat)
  const renderRightPane = () => {
    if (!activeConversation) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#f8fafc', color: '#94a3b8' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 12 }}>
            <MessageOutlined style={{ color: '#64748b' }} />
          </div>
          <Title level={4} style={{ color: '#475569', marginBottom: 4 }}>
            Chọn một cuộc trò chuyện để bắt đầu
          </Title>
          <Text type="secondary">
            Trao đổi trực tiếp, làm việc nhóm và gắn thẻ chứng từ CRM với đồng nghiệp tức thì.
          </Text>
        </div>
      )
    }

    const isDirect = activeConversation.type === 'direct'
    const isDept = activeConversation.type === 'department'
    const partner = activeConversation.direct_partner || {}
    const title = isDirect ? (partner.full_name || 'Đồng nghiệp') : (activeConversation.title || 'Hội thoại')
    const isOnline = isDirect && (onlineUserIds.has(partner.id) || !!partner.is_online)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#ffffff' }}>
        {/* Chat Room Header */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, minWidth: 0 }}>
            {isMobile && (
              <Button
                type="text"
                icon={<LeftOutlined style={{ fontSize: 18, color: '#334155' }} />}
                onClick={() => setActiveConversation(null)}
                style={{ padding: '4px', marginRight: 4, height: 36, width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Quay lại danh sách hội thoại"
              />
            )}
            <div style={{ position: 'relative' }}>
              <Avatar
                src={isDirect ? partner?.avatar : activeConversation.avatar}
                icon={isDirect ? <UserOutlined /> : isDept ? <ApartmentOutlined /> : <TeamOutlined />}
                size={40}
                style={{ background: isDirect ? '#3b82f6' : isDept ? '#8b5cf6' : '#10b981' }}
              />
              {isOnline && (
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
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{title}</div>
              <div style={{ fontSize: 11.5, color: '#64748b' }}>
                {isDirect ? (
                  isOnline ? (
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>• Đang hoạt động</span>
                  ) : (
                    'Ngoại tuyến'
                  )
                ) : (
                  `${activeConversation.participants?.length || 0} thành viên • ${isDept ? 'Nhóm phòng ban' : 'Nhóm công việc'}`
                )}
              </div>
            </div>
          </div>

          <Space size={8}>
            <Tooltip title="Gắn thẻ chứng từ CRM (Đơn hàng, Báo giá, Khách hàng)">
              <Button
                icon={<TagOutlined style={{ color: '#d97706' }} />}
                onClick={() => {
                  setDocSearchKeyword('')
                  setCrmDocs([])
                  setCrmDocModalOpen(true)
                }}
              >
                Gắn thẻ chứng từ
              </Button>
            </Tooltip>

            <Dropdown
              menu={{
                items: [
                  {
                    key: 'clear',
                    icon: <HistoryOutlined style={{ color: '#f59e0b' }} />,
                    label: isDirect ? 'Xóa lịch sử ở phía tôi' : 'Xóa lịch sử tin nhắn nhóm',
                    onClick: () => {
                      Modal.confirm({
                        title: isDirect ? 'Xóa lịch sử tin nhắn ở phía bạn?' : 'Xóa toàn bộ lịch sử tin nhắn nhóm?',
                        content: isDirect
                          ? 'Toàn bộ tin nhắn trước thời điểm này sẽ bị ẩn/xóa khỏi giao diện của bạn. Người đối diện vẫn giữ nguyên 100% lịch sử tin nhắn.'
                          : 'Tất cả tin nhắn trong nhóm này sẽ bị xóa đối với các thành viên.',
                        okText: isDirect ? 'Xóa ở phía tôi' : 'Xác nhận xóa',
                        okButtonProps: { danger: true },
                        cancelText: 'Hủy',
                        onOk: () => clearChatHistory(activeConversation.id),
                      })
                    },
                  },
                  {
                    type: 'divider',
                  },
                  {
                    key: 'delete',
                    icon: <DeleteOutlined />,
                    danger: true,
                    label: isDirect
                      ? 'Xóa ở phía tôi'
                      : (activeConversation.created_by?.id === user?.id || isCompanyAdmin || isSuperAdmin
                          ? 'Giải tán nhóm trò chuyện'
                          : 'Rời khỏi nhóm trò chuyện'),
                    onClick: () => {
                      Modal.confirm({
                        title: isDirect
                          ? 'Xóa cuộc trò chuyện ở phía bạn?'
                          : (activeConversation.created_by?.id === user?.id || isCompanyAdmin || isSuperAdmin
                              ? 'Giải tán nhóm trò chuyện này?'
                              : 'Rời khỏi nhóm trò chuyện này?'),
                        content: isDirect
                          ? 'Cuộc trò chuyện sẽ được ẩn khỏi danh sách của bạn. Người đối diện vẫn giữ toàn bộ lịch sử trò chuyện. Nếu cả hai bên đều bấm xóa, hệ thống sẽ tự động xóa triệt để dữ liệu.'
                          : (activeConversation.created_by?.id === user?.id || isCompanyAdmin || isSuperAdmin
                              ? 'Toàn bộ tin nhắn và dữ liệu nhóm sẽ bị xóa triệt để khỏi hệ thống cho tất cả thành viên.'
                              : 'Bạn sẽ rời khỏi nhóm và không còn nhận được tin nhắn từ nhóm này nữa.'),
                        okText: isDirect ? 'Xóa ở phía tôi' : (activeConversation.created_by?.id === user?.id || isCompanyAdmin || isSuperAdmin ? 'Giải tán nhóm' : 'Rời nhóm'),
                        okButtonProps: { danger: true },
                        cancelText: 'Hủy',
                        onOk: () => deleteConversation(activeConversation.id),
                      })
                    },
                  },
                ],
              }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Button icon={<MoreOutlined />} title="Tùy chọn cuộc trò chuyện" />
            </Dropdown>
          </Space>
        </div>

        {/* Message Thread Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', background: '#f8fafc' }}>
          {loadingMessages && (
            <div style={{ textAlign: 'center', padding: 12 }}>
              <Spin size="small" />
            </div>
          )}

          {currentMessages.length === 0 && !loadingMessages && (
            <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: 60, fontSize: 13 }}>
              Chưa có tin nhắn nào trong cuộc trò chuyện này. Hãy gửi tin nhắn đầu tiên!
            </div>
          )}

          {currentMessages.map((msg) => {
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
                  marginBottom: 12,
                }}
              >
                {!isMine && activeConversation.type !== 'direct' && (
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2, marginLeft: 6 }}>
                    {msg.sender?.full_name || msg.sender?.username}
                  </div>
                )}

                {msg.is_recalled ? (
                  <div
                    style={{
                      maxWidth: isMobile ? '88%' : '65%',
                      padding: '8px 14px',
                      borderRadius: 14,
                      background: '#f1f5f9',
                      color: '#94a3b8',
                      fontStyle: 'italic',
                      fontSize: 12.5,
                      border: '1px dashed #cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <StopOutlined style={{ fontSize: 13, color: '#94a3b8' }} />
                    <span>Tin nhắn đã được thu hồi</span>
                  </div>
                ) : (
                  <div
                    style={{
                      maxWidth: isMobile ? '88%' : '65%',
                      padding: msg.message_type === 'context_doc' ? '10px 14px' : '10px 14px',
                      borderRadius: 14,
                      background: isMine ? '#2563eb' : '#ffffff',
                      color: isMine ? '#ffffff' : '#0f172a',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      border: isMine ? 'none' : '1px solid #e2e8f0',
                      wordBreak: 'break-word',
                      fontSize: 13.5,
                      lineHeight: 1.5,
                    }}
                  >
                    {/* Ảnh */}
                    {msg.message_type === 'image' && msg.file_url && (
                      <div style={{ marginBottom: msg.content ? 8 : 0, borderRadius: 8, overflow: 'hidden' }}>
                        <Image src={msg.file_url} alt="chat-img" style={{ maxHeight: 280, objectFit: 'contain' }} />
                      </div>
                    )}

                    {/* Tệp tin */}
                    {msg.message_type === 'file' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                        <PaperClipOutlined style={{ fontSize: 18 }} />
                        <div>
                          <a
                            href={msg.file_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: isMine ? '#dbeafe' : '#2563eb',
                              fontWeight: 600,
                              textDecoration: 'underline',
                            }}
                          >
                            {msg.file_name || 'Tệp đính kèm'}
                          </a>
                          {msg.file_size > 0 && (
                            <div style={{ fontSize: 10.5, color: isMine ? '#bfdbfe' : '#94a3b8' }}>
                              {(msg.file_size / (1024 * 1024)).toFixed(2)} MB
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Thẻ Chứng từ CRM Liên kết */}
                    {msg.message_type === 'context_doc' && msg.context_data && (
                      <div
                        style={{
                          background: isMine ? 'rgba(255,255,255,0.15)' : '#f1f5f9',
                          padding: '10px 12px',
                          borderRadius: 10,
                          borderLeft: `4px solid ${isMine ? '#93c5fd' : '#2563eb'}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Tag color={msg.context_data.badge_color || 'blue'} style={{ fontWeight: 700, margin: 0 }}>
                            {msg.context_data.doc_code}
                          </Tag>
                          {msg.context_data.extra && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: isMine ? '#fef08a' : '#16a34a' }}>
                              {msg.context_data.extra}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                          {msg.context_data.title}
                        </div>
                      </div>
                    )}

                    {/* Nội dung tin nhắn text */}
                    {msg.content && msg.message_type !== 'context_doc' && (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                    )}
                  </div>
                )}

                {/* Thời gian và nút thao tác */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, padding: '0 4px' }}>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>
                    {new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {canRecall && (
                    <Popconfirm
                      title="Thu hồi tin nhắn này?"
                      description="Tin nhắn sẽ bị thu hồi ở cả hai phía."
                      okText="Thu hồi"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => recallMessage(activeConversation.id, msg.id)}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<RollbackOutlined style={{ fontSize: 11, color: '#94a3b8' }} />}
                        title="Thu hồi tin nhắn"
                        style={{ height: 18, width: 18, padding: 0, minWidth: 18 }}
                      />
                    </Popconfirm>
                  )}
                </div>
              </div>
            )
          })}

          {/* Typing */}
          {currentTyping.length > 0 && (
            <div style={{ fontSize: 11.5, color: '#64748b', fontStyle: 'italic', marginBottom: 6 }}>
              {currentTyping.join(', ')} đang soạn tin...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
          <TextArea
            placeholder="Nhập nội dung tin nhắn... (Enter để gửi, Shift+Enter xuống dòng, dán ảnh Ctrl+V)"
            value={inputContent}
            onChange={(e) => {
              setInputContent(e.target.value)
              sendTyping(activeConversation.id, e.target.value.length > 0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            onPaste={handlePaste}
            autoSize={{ minRows: 2, maxRows: 5 }}
            style={{ borderRadius: 8, fontSize: 13 }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Space size={8}>
              <Button
                icon={<PaperClipOutlined />}
                onClick={() => fileInputRef.current?.click()}
                title="Gửi tệp tin / Hình ảnh"
              >
                Gửi file / ảnh
              </Button>
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

              <Button
                icon={<TagOutlined style={{ color: '#d97706' }} />}
                onClick={() => {
                  setDocSearchKeyword('')
                  setCrmDocs([])
                  setCrmDocModalOpen(true)
                }}
                title="Gắn thẻ chứng từ CRM (Đơn hàng, Báo giá, Khách hàng)"
              >
                Gắn thẻ chứng từ
              </Button>
            </Space>

            <Button
              type="primary"
              icon={<SendOutlined />}
              disabled={!inputContent.trim()}
              onClick={handleSend}
              style={{ background: '#2563eb', borderRadius: 6, fontWeight: 600 }}
            >
              Gửi tin nhắn
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        height: 'calc(100vh - 110px)',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        background: '#ffffff',
      }}
    >
      <Row style={{ height: '100%' }}>
        {/* Mobile: Chỉ render Pane tương ứng */}
        {isMobile ? (
          <Col span={24} style={{ height: '100%' }}>
            {activeConversation ? renderRightPane() : renderLeftPane()}
          </Col>
        ) : (
          <>
            <Col xs={24} md={8} lg={7} xl={6} style={{ height: '100%' }}>
              {renderLeftPane()}
            </Col>
            <Col xs={24} md={16} lg={17} xl={18} style={{ height: '100%' }}>
              {renderRightPane()}
            </Col>
          </>
        )}
      </Row>

      {/* ── Modal Bắt đầu chat 1-1 với đồng nghiệp ── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserOutlined style={{ color: '#2563eb' }} />
            <span>Nhắn tin với đồng nghiệp</span>
          </div>
        }
        open={directChatModalOpen}
        onCancel={() => {
          setDirectChatModalOpen(false)
          setColleagueSearchText('')
        }}
        footer={null}
        width={460}
        centered
        destroyOnClose
      >
        {/* Ô tìm kiếm trong modal */}
        <Input
          placeholder="Tìm theo tên, phòng ban, chức danh..."
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          value={colleagueSearchText}
          onChange={(e) => setColleagueSearchText(e.target.value)}
          allowClear
          style={{ borderRadius: 8, marginBottom: 10 }}
        />

        {/* Bộ lọc trạng thái Online / Offline */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <Button
            size="small"
            type={colleagueFilterTab === 'all' ? 'primary' : 'default'}
            onClick={() => setColleagueFilterTab('all')}
            style={{ borderRadius: 6, fontSize: 12 }}
          >
            Tất cả ({colleagues.length})
          </Button>
          <Button
            size="small"
            type={colleagueFilterTab === 'online' ? 'primary' : 'default'}
            onClick={() => setColleagueFilterTab('online')}
            style={{
              borderRadius: 6,
              fontSize: 12,
              background: colleagueFilterTab === 'online' ? '#16a34a' : undefined,
              borderColor: colleagueFilterTab === 'online' ? '#16a34a' : undefined,
            }}
          >
            Đang online ({onlineCount})
          </Button>
          <Button
            size="small"
            type={colleagueFilterTab === 'offline' ? 'primary' : 'default'}
            onClick={() => setColleagueFilterTab('offline')}
            style={{ borderRadius: 6, fontSize: 12 }}
          >
            Ngoại tuyến ({colleagues.length - onlineCount})
          </Button>
        </div>

        {/* Danh sách đồng nghiệp */}
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          <List
            dataSource={filteredColleaguesInModal}
            locale={{
              emptyText: (
                <Empty
                  description={
                    colleagueSearchText
                      ? 'Không tìm thấy đồng nghiệp phù hợp'
                      : colleagueFilterTab === 'online'
                      ? 'Hiện không có đồng nghiệp nào online'
                      : 'Không có dữ liệu'
                  }
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ),
            }}
            renderItem={(c) => {
              const isOnline = c.isOnline
              return (
                <List.Item
                  onClick={async () => {
                    setDirectChatModalOpen(false)
                    setColleagueSearchText('')
                    const conv = await startDirectChat(c.id)
                    if (conv?.id) {
                      setActiveConversation(conv)
                      if (fetchMessages) fetchMessages(conv.id)
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 14px',
                    borderRadius: 8,
                    transition: 'all 0.15s',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <List.Item.Meta
                    avatar={
                      <div style={{ position: 'relative' }}>
                        <Avatar
                          src={c.avatar}
                          icon={<UserOutlined />}
                          size={40}
                          style={{ background: isOnline ? '#2563eb' : '#94a3b8' }}
                        />
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            width: 10,
                            height: 10,
                            background: isOnline ? '#22c55e' : '#cbd5e1',
                            border: '2px solid #fff',
                            borderRadius: '50%',
                          }}
                        />
                      </div>
                    }
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{c.full_name}</strong>
                        {isOnline ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              color: '#16a34a',
                              fontWeight: 500,
                              background: '#f0fdf4',
                              border: '1px solid #bbf7d0',
                              padding: '1px 8px',
                              borderRadius: 10,
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                            Đang online
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 11,
                              color: '#94a3b8',
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              padding: '1px 8px',
                              borderRadius: 10,
                            }}
                          >
                            Ngoại tuyến
                          </span>
                        )}
                      </div>
                    }
                    description={
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {c.department_name ? <span>{c.department_name}</span> : null}
                        {c.role_name && <span style={{ color: '#94a3b8' }}> • {c.role_name}</span>}
                      </div>
                    }
                  />
                </List.Item>
              )
            }}
          />
        </div>
      </Modal>

      {/* ── Modal Tạo nhóm chat mới ── */}
      <Modal
        title="Tạo nhóm trò chuyện mới"
        open={createGroupModalOpen}
        onCancel={() => setCreateGroupModalOpen(false)}
        onOk={async () => {
          if (!groupTitle.trim()) {
            message.warning('Vui lòng nhập tên nhóm!')
            return
          }
          await createGroupChat(groupTitle.trim(), selectedMemberIds)
          setCreateGroupModalOpen(false)
          setGroupTitle('')
          setSelectedMemberIds([])
        }}
        okText="Tạo nhóm"
        cancelText="Hủy"
        width={480}
        centered
        destroyOnClose
      >
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 12 }}>
            <Text strong>Tên nhóm chat <span style={{ color: 'red' }}>*</span></Text>
            <Input
              placeholder="Ví dụ: Nhóm Dự Án Cửa Nhôm..."
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>

          <div>
            <Text strong>Thêm thành viên</Text>
            <Select
              mode="multiple"
              placeholder="Chọn các đồng nghiệp tham gia nhóm..."
              value={selectedMemberIds}
              onChange={setSelectedMemberIds}
              style={{ width: '100%', marginTop: 6 }}
              options={colleagues.map((c) => ({
                label: `${c.full_name} ${onlineUserIds.has(c.id) || !!c.is_online ? '(Online)' : ''} (${c.department_name || c.username})`,
                value: c.id,
              }))}
            />
          </div>
        </div>
      </Modal>

      {/* ── Modal Gắn thẻ chứng từ CRM ── */}
      <Modal
        title="Gắn thẻ chứng từ CRM vào tin nhắn"
        open={crmDocModalOpen}
        onCancel={() => setCrmDocModalOpen(false)}
        footer={null}
        width={520}
        centered
        destroyOnClose
      >
        <Input
          placeholder="Nhập mã Đơn hàng (FT-DH-xxx), Báo giá, Phiếu xuất kho, hoặc Tên khách..."
          value={docSearchKeyword}
          onChange={(e) => handleSearchCrmDocs(e.target.value)}
          allowClear
          style={{ marginBottom: 14 }}
        />
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <List
            loading={searchingDocs}
            dataSource={crmDocs}
            locale={{ emptyText: docSearchKeyword ? 'Không tìm thấy chứng từ phù hợp' : 'Nhập từ khóa để tra cứu chứng từ' }}
            renderItem={(doc) => (
              <List.Item
                onClick={() => handleSelectCrmDoc(doc)}
                style={{ cursor: 'pointer', padding: '12px 14px', borderRadius: 8, borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fdf4')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Tag color={doc.badge_color} style={{ fontWeight: 700 }}>{doc.doc_code}</Tag>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{doc.title}</span>
                  </div>
                  {doc.extra && <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 12.5 }}>{doc.extra}</span>}
                </div>
              </List.Item>
            )}
          />
        </div>
      </Modal>

      {/* ── Modal Cấu hình Lưu trữ & Dọn dẹp (Admin) ── */}
      <Modal
        title={
          <Space>
            <SettingOutlined style={{ color: '#2563eb' }} />
            <span>Cấu hình Chính sách Lưu trữ & Dọn dẹp Chat</span>
          </Space>
        }
        open={configModalOpen}
        onCancel={() => setConfigModalOpen(false)}
        onOk={handleSaveConfig}
        confirmLoading={savingConfig}
        okText="Lưu cấu hình"
        cancelText="Đóng"
        width={520}
        centered
        destroyOnClose
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <Text strong>Thời hạn lưu trữ tin nhắn chat:</Text>
            <div style={{ marginTop: 6 }}>
              <Select
                value={chatConfig.retention_days}
                onChange={(val) => setChatConfig({ ...chatConfig, retention_days: val })}
                style={{ width: '100%' }}
                options={[
                  { label: 'Lưu 30 ngày (Tự động xóa tin & file cũ hơn 1 tháng)', value: 30 },
                  { label: 'Lưu 60 ngày (Tự động xóa tin & file cũ hơn 2 tháng)', value: 60 },
                  { label: 'Lưu 90 ngày (Khuyên dùng - 3 tháng)', value: 90 },
                  { label: 'Lưu 180 ngày (Nửa năm)', value: 180 },
                  { label: 'Lưu vĩnh viễn (Không tự động xóa)', value: 0 },
                ]}
              />
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Hệ thống Celery Beat sẽ tự động quét và giải phóng tin nhắn cùng tệp tin vật lý quá hạn mỗi đêm lúc 02:00 sáng.
            </Text>
          </div>

          <Divider style={{ margin: '14px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <Text strong>Cho phép gửi tệp tin & hình ảnh</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>Nếu tắt, nhân viên chỉ có thể chat văn bản</Text></div>
            </div>
            <Switch
              checked={chatConfig.allow_file_upload}
              onChange={(checked) => setChatConfig({ ...chatConfig, allow_file_upload: checked })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <Text strong>Tự động nén ảnh tối ưu (WebP / JPEG)</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>Nén ảnh trước khi lưu để tiết kiệm ~80% ổ cứng</Text></div>
            </div>
            <Switch
              checked={chatConfig.auto_compress_images}
              onChange={(checked) => setChatConfig({ ...chatConfig, auto_compress_images: checked })}
            />
          </div>

          <Divider style={{ margin: '14px 0' }} />

          {/* Nút dọn dẹp thủ công */}
          <div style={{ background: '#fef2f2', padding: '12px 14px', borderRadius: 8, border: '1px solid #fecaca' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ color: '#991b1b', fontSize: 13 }}>Dọn dẹp tệp tin đính kèm cũ</strong>
                <div style={{ fontSize: 11.5, color: '#b91c1c' }}>
                  Xóa các file ảnh/tệp tin cũ hơn 30 ngày để giải phóng ổ cứng (vẫn giữ tin nhắn văn bản).
                </div>
              </div>
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={cleaningFiles}
                onClick={handleCleanOldFiles}
              >
                Dọn tệp cũ
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

