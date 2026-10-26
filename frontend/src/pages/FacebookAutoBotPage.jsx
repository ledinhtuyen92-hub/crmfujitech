import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LikeOutlined,
  MessageOutlined,
  PlusOutlined,
  RadarChartOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../utils/api'

const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { TextArea } = Input

const FB_BLUE = '#1877f2'

export default function FacebookAutoBotPage() {
  const [pages, setPages] = useState([])
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [pageConfig, setPageConfig] = useState(null)
  const [loadingPages, setLoadingPages] = useState(false)
  const [savingBotStatus, setSavingBotStatus] = useState(false)
  const [savingFallback, setSavingFallback] = useState(false)

  // Tab Active
  const [activeTab, setActiveTab] = useState('general')

  // Forms
  const [botStatusForm] = Form.useForm()
  const [fallbackForm] = Form.useForm()

  // Post Rules state
  const [postRules, setPostRules] = useState([])
  const [loadingPostRules, setLoadingPostRules] = useState(false)
  const [postRuleModalVisible, setPostRuleModalVisible] = useState(false)
  const [editingPostRule, setEditingPostRule] = useState(null)
  const [postRuleForm] = Form.useForm()

  // Published posts drawer/modal for quick pick
  const [publishedPostsModalVisible, setPublishedPostsModalVisible] = useState(false)
  const [publishedPosts, setPublishedPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  // Radar Post ID capture modal
  const [radarModalVisible, setRadarModalVisible] = useState(false)
  const radarTimerRef = useRef(null)

  // Keyword Rules state
  const [keywordRules, setKeywordRules] = useState([])
  const [loadingKeywordRules, setLoadingKeywordRules] = useState(false)
  const [keywordRuleModalVisible, setKeywordRuleModalVisible] = useState(false)
  const [editingKeywordRule, setEditingKeywordRule] = useState(null)
  const [keywordRuleForm] = Form.useForm()

  // Activity Logs state
  const [logs, setLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [logFilterEventType, setLogFilterEventType] = useState('')
  const [logFilterStatus, setLogFilterStatus] = useState('')
  const [logSearchQuery, setLogSearchQuery] = useState('')
  const [totalLogs, setTotalLogs] = useState(0)

  // ── Load Pages ─────────────────────────────────────────────────────────────
  const fetchPages = useCallback(async () => {
    setLoadingPages(true)
    try {
      const res = await api.get('/facebook/pages/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results || []
      setPages(data)
      if (data.length > 0 && !selectedPageId) {
        setSelectedPageId(data[0].id)
      }
    } catch {
      message.error('Không thể tải danh sách Trang Facebook.')
    } finally {
      setLoadingPages(false)
    }
  }, [selectedPageId])

  useEffect(() => {
    fetchPages()
  }, [fetchPages])

  // ── Load Selected Page Details ─────────────────────────────────────────────
  const fetchPageDetails = useCallback(async (id) => {
    if (!id) return
    try {
      const res = await api.get(`/facebook/pages/${id}/`)
      setPageConfig(res.data)
      botStatusForm.setFieldsValue({
        enable_bot: res.data.enable_bot,
        enable_like_comment: res.data.enable_like_comment,
        enable_keyword_reply: res.data.enable_keyword_reply,
        enable_ai_fallback: res.data.enable_ai_fallback,
      })
      fallbackForm.setFieldsValue({
        enable_comment_reply: res.data.enable_comment_reply,
        default_comment_reply: res.data.default_comment_reply,
        enable_private_message: res.data.enable_private_message,
        default_private_message: res.data.default_private_message,
      })
    } catch {
      message.error('Lỗi khi tải cấu hình Trang.')
    }
  }, [botStatusForm, fallbackForm])

  useEffect(() => {
    if (selectedPageId) {
      fetchPageDetails(selectedPageId)
    }
  }, [selectedPageId, fetchPageDetails])

  // ── Save Bot Status (Card Trái) ────────────────────────────────────────────
  const handleSaveBotStatus = async (values) => {
    if (!selectedPageId) return
    setSavingBotStatus(true)
    try {
      const payload = {
        enable_bot: !!values.enable_bot,
        enable_like_comment: !!values.enable_like_comment,
        enable_keyword_reply: !!values.enable_keyword_reply,
        enable_ai_fallback: !!values.enable_ai_fallback,
      }
      const res = await api.patch(`/facebook/pages/${selectedPageId}/`, payload)
      setPageConfig(res.data)
      message.success('Đã lưu trạng thái Auto Bot thành công!')
    } catch {
      message.error('Không thể lưu trạng thái Bot. Vui lòng kiểm tra lại.')
    } finally {
      setSavingBotStatus(false)
    }
  }

  // ── Save Fallback Reply Config (Card Phải) ─────────────────────────────────
  const handleSaveFallback = async (values) => {
    if (!selectedPageId) return
    setSavingFallback(true)
    try {
      const payload = {
        enable_comment_reply: !!values.enable_comment_reply,
        default_comment_reply: values.default_comment_reply || '',
        enable_private_message: !!values.enable_private_message,
        default_private_message: values.default_private_message || '',
      }
      const res = await api.patch(`/facebook/pages/${selectedPageId}/`, payload)
      setPageConfig(res.data)
      message.success('Đã lưu cấu hình phản hồi mặc định thành công!')
    } catch {
      message.error('Không thể lưu cấu hình mặc định. Vui lòng kiểm tra lại.')
    } finally {
      setSavingFallback(false)
    }
  }

  // ── Load Post Rules ────────────────────────────────────────────────────────
  const fetchPostRules = useCallback(async () => {
    if (!selectedPageId) return
    setLoadingPostRules(true)
    try {
      const res = await api.get('/facebook/post-rules/', { params: { page_config: selectedPageId } })
      const data = Array.isArray(res.data) ? res.data : res.data?.results || []
      setPostRules(data)
    } catch {
      message.error('Không thể tải danh sách cấu hình bài viết.')
    } finally {
      setLoadingPostRules(false)
    }
  }, [selectedPageId])

  // ── Load Keyword Rules ─────────────────────────────────────────────────────
  const fetchKeywordRules = useCallback(async () => {
    if (!selectedPageId) return
    setLoadingKeywordRules(true)
    try {
      const res = await api.get('/facebook/keyword-rules/', { params: { page_config: selectedPageId } })
      const data = Array.isArray(res.data) ? res.data : res.data?.results || []
      setKeywordRules(data)
    } catch {
      message.error('Không thể tải danh sách cấu hình từ khóa.')
    } finally {
      setLoadingKeywordRules(false)
    }
  }, [selectedPageId])

  // ── Load Activity Logs ─────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    if (!selectedPageId) return
    setLoadingLogs(true)
    try {
      const params = { page_config: selectedPageId, page_size: 100 }
      if (logFilterEventType) params.event_type = logFilterEventType
      if (logFilterStatus) params.status = logFilterStatus
      if (logSearchQuery) params.search = logSearchQuery
      const res = await api.get('/facebook/bot-logs/', { params })
      const data = Array.isArray(res.data) ? res.data : res.data?.results || []
      setLogs(data)
      setTotalLogs(res.data?.count || data.length)
    } catch {
      message.error('Không thể tải nhật ký hoạt động của Bot.')
    } finally {
      setLoadingLogs(false)
    }
  }, [selectedPageId, logFilterEventType, logFilterStatus, logSearchQuery])

  // Trigger loads when tab changes or page changes
  useEffect(() => {
    if (activeTab === 'post_rules') fetchPostRules()
    else if (activeTab === 'keywords') fetchKeywordRules()
    else if (activeTab === 'logs') fetchLogs()
  }, [activeTab, selectedPageId, fetchPostRules, fetchKeywordRules, fetchLogs])

  // ── Post Rules Modal Handlers ──────────────────────────────────────────────
  const openPostRuleModal = (rule = null) => {
    setEditingPostRule(rule)
    if (rule) {
      postRuleForm.setFieldsValue({
        post_id_list: rule.post_id_list,
        keywords: rule.keywords,
        post_note: rule.post_note,
        comment_reply: rule.comment_reply,
        private_message: rule.private_message,
        enable_like: rule.enable_like,
        is_active: rule.is_active,
      })
    } else {
      postRuleForm.resetFields()
      postRuleForm.setFieldsValue({
        enable_like: true,
        is_active: true,
      })
    }
    setPostRuleModalVisible(true)
  }

  const handleSavePostRule = async (values) => {
    try {
      const payload = {
        ...values,
        page_config: selectedPageId,
      }
      if (editingPostRule) {
        await api.patch(`/facebook/post-rules/${editingPostRule.id}/`, payload)
        message.success('Đã cập nhật cấu hình bài viết!')
      } else {
        await api.post('/facebook/post-rules/', payload)
        message.success('Đã thêm cấu hình bài viết mới!')
      }
      setPostRuleModalVisible(false)
      fetchPostRules()
    } catch {
      message.error('Lỗi khi lưu cấu hình bài viết.')
    }
  }

  const handleDeletePostRule = async (id) => {
    try {
      await api.delete(`/facebook/post-rules/${id}/`)
      message.success('Đã xóa cấu hình bài viết.')
      fetchPostRules()
    } catch {
      message.error('Lỗi khi xóa cấu hình bài viết.')
    }
  }

  const handleTogglePostRuleActive = async (rule, checked) => {
    try {
      await api.patch(`/facebook/post-rules/${rule.id}/`, { is_active: checked })
      message.success(`Đã ${checked ? 'bật' : 'tắt'} bài viết.`)
      fetchPostRules()
    } catch {
      message.error('Không thể đổi trạng thái bài viết.')
    }
  }

  // ── Fetch Published Posts (Quick Pick) ─────────────────────────────────────
  const openPublishedPostsModal = async () => {
    if (!selectedPageId) return
    setLoadingPosts(true)
    setPublishedPostsModalVisible(true)
    try {
      const res = await api.get(`/facebook/pages/${selectedPageId}/published-posts/`)
      setPublishedPosts(res.data?.posts || [])
    } catch {
      message.error('Không thể tải bài viết từ Facebook. Vui lòng kiểm tra quyền Token.')
    } finally {
      setLoadingPosts(false)
    }
  }

  const handleSelectPublishedPost = (post) => {
    const rawId = post.id
    const shortId = rawId.includes('_') ? rawId.split('_')[1] : rawId
    const currentVal = postRuleForm.getFieldValue('post_id_list') || ''
    const newVal = currentVal ? `${currentVal}, ${shortId}` : shortId
    postRuleForm.setFieldsValue({
      post_id_list: newVal,
      post_note: postRuleForm.getFieldValue('post_note') || (post.message ? post.message.slice(0, 50) + '...' : `Bài viết ${shortId}`),
    })
    setPublishedPostsModalVisible(false)
    message.success(`Đã thêm Post ID: ${shortId}`)
  }

  // ── Radar Auto Capture Post ID ─────────────────────────────────────────────
  const startRadarCapture = () => {
    setRadarModalVisible(true)
    if (radarTimerRef.current) clearInterval(radarTimerRef.current)

    // Polling every 2s
    radarTimerRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/facebook/pages/${selectedPageId}/check-captured-post-id/`)
        if (res.data?.success && res.data?.id) {
          clearInterval(radarTimerRef.current)
          setRadarModalVisible(false)
          const capturedId = res.data.id
          const currentVal = postRuleForm.getFieldValue('post_id_list') || ''
          const newVal = currentVal ? `${currentVal}, ${capturedId}` : capturedId
          postRuleForm.setFieldsValue({ post_id_list: newVal })
          message.success(`🎯 Đã bắt thành công Post ID: ${capturedId}!`)
        }
      } catch {
        // ignore
      }
    }, 2000)
  }

  const stopRadarCapture = () => {
    if (radarTimerRef.current) clearInterval(radarTimerRef.current)
    setRadarModalVisible(false)
  }

  // ── Keyword Rules Handlers ─────────────────────────────────────────────────
  const openKeywordRuleModal = (rule = null) => {
    setEditingKeywordRule(rule)
    if (rule) {
      keywordRuleForm.setFieldsValue({
        keywords: rule.keywords || [],
        match_type: rule.match_type,
        use_for_inbox: rule.use_for_inbox,
        comment_reply: rule.comment_reply,
        private_message: rule.private_message,
        is_active: rule.is_active,
      })
    } else {
      keywordRuleForm.resetFields()
      keywordRuleForm.setFieldsValue({
        keywords: [],
        match_type: 'contains',
        use_for_inbox: false,
        is_active: true,
      })
    }
    setKeywordRuleModalVisible(true)
  }

  const handleSaveKeywordRule = async (values) => {
    try {
      const payload = {
        ...values,
        page_config: selectedPageId,
      }
      if (editingKeywordRule) {
        await api.patch(`/facebook/keyword-rules/${editingKeywordRule.id}/`, payload)
        message.success('Đã cập nhật quy tắc từ khóa!')
      } else {
        await api.post('/facebook/keyword-rules/', payload)
        message.success('Đã thêm quy tắc từ khóa mới!')
      }
      setKeywordRuleModalVisible(false)
      fetchKeywordRules()
    } catch {
      message.error('Lỗi khi lưu quy tắc từ khóa.')
    }
  }

  const handleDeleteKeywordRule = async (id) => {
    try {
      await api.delete(`/facebook/keyword-rules/${id}/`)
      message.success('Đã xóa quy tắc từ khóa.')
      fetchKeywordRules()
    } catch {
      message.error('Lỗi khi xóa quy tắc từ khóa.')
    }
  }

  const handleToggleKeywordRuleActive = async (rule, checked) => {
    try {
      await api.patch(`/facebook/keyword-rules/${rule.id}/`, { is_active: checked })
      message.success(`Đã ${checked ? 'bật' : 'tắt'} quy tắc từ khóa.`)
      fetchKeywordRules()
    } catch {
      message.error('Không thể đổi trạng thái quy tắc.')
    }
  }

  // ── Activity Logs Handlers ─────────────────────────────────────────────────
  const handleClearHistory = async () => {
    try {
      await api.delete('/facebook/bot-logs/clear-history/', { params: { page_config: selectedPageId } })
      message.success('Đã xóa sạch nhật ký hoạt động của Bot!')
      fetchLogs()
    } catch {
      message.error('Không thể xóa nhật ký.')
    }
  }

  const selectedPage = pages.find((p) => p.id === selectedPageId)

  return (
    <div style={{ padding: '0 8px 32px 8px' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Card
        style={{
          borderRadius: 16,
          marginBottom: 20,
          background: 'linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%)',
          border: '1px solid #dbeafe',
          boxShadow: '0 4px 16px rgba(24, 119, 242, 0.06)',
        }}
        bodyStyle={{ padding: '20px 24px' }}
      >
        <Row gutter={[16, 16]} align="middle" justify="space-between">
          <Col xs={24} md={14}>
            <Space align="start" size={16}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #1877f2 0%, #0c57c4 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 16px rgba(24, 119, 242, 0.25)',
                }}
              >
                <RobotOutlined style={{ fontSize: 28, color: '#fff' }} />
              </div>
              <div>
                <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
                  Tự động hóa Fanpage (Facebook Auto Bot)
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Tự động Like, trả lời bình luận công khai, gửi tin nhắn riêng (Private Reply), bắt Post ID tự động và tích hợp Trợ lý AI.
                </Text>
              </div>
            </Space>
          </Col>

          {/* Chọn Fanpage */}
          <Col xs={24} md={10} style={{ textAlign: 'right' }}>
            <Space direction="vertical" size={4} style={{ width: '100%', maxWidth: 360, textAlign: 'left' }}>
              <Text strong style={{ fontSize: 13, color: '#475569' }}>
                Chọn Fanpage cấu hình:
              </Text>
              <Select
                value={selectedPageId}
                onChange={(val) => setSelectedPageId(val)}
                loading={loadingPages}
                style={{ width: '100%' }}
                size="large"
                placeholder="Chọn Trang Facebook..."
              >
                {pages.map((p) => (
                  <Option key={p.id} value={p.id}>
                    <Space>
                      <Avatar src={p.page_avatar} size="small" icon={<RobotOutlined />}>
                        {p.page_name?.[0]}
                      </Avatar>
                      <Text strong>{p.page_name}</Text>
                      {p.enable_bot ? (
                        <Tag color="success" style={{ marginLeft: 6 }}>
                          Bot BẬT
                        </Tag>
                      ) : (
                        <Tag color="default" style={{ marginLeft: 6 }}>
                          Bot TẮT
                        </Tag>
                      )}
                    </Space>
                  </Option>
                ))}
              </Select>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Cảnh báo chưa có Page */}
      {pages.length === 0 && !loadingPages && (
        <Card style={{ borderRadius: 16, textAlign: 'center', padding: '40px 0' }}>
          <Empty
            description={
              <Space direction="vertical" size={8}>
                <Text strong style={{ fontSize: 16 }}>Chưa có Trang Facebook nào được kết nối.</Text>
                <Text type="secondary">Vui lòng vào menu "Cấu hình kết nối Page" để đăng nhập Facebook OAuth trước.</Text>
                <Button type="primary" href="/settings/facebook" style={{ marginTop: 12 }}>
                  Đi đến Kết nối Trang Facebook
                </Button>
              </Space>
            }
          />
        </Card>
      )}

      {/* Nội dung chính nếu có Page */}
      {pages.length > 0 && (
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k)}
          type="card"
          size="large"
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'general',
              label: (
                <Space>
                  <ThunderboltOutlined style={{ color: '#1877f2' }} />
                  <span>1. Trả lời Chung & Mặc định</span>
                </Space>
              ),
              children: (
                <Row gutter={[20, 20]}>
                  {/* Trạng thái Tổng & Bật Tắt Bot */}
                  <Col xs={24} md={8}>
                    <Card
                      title={
                        <Space>
                          <RobotOutlined style={{ color: FB_BLUE }} />
                          <span>Trạng thái Auto Bot</span>
                        </Space>
                      }
                      style={{ borderRadius: 14, height: '100%' }}
                    >
                      <Form
                        form={botStatusForm}
                        layout="vertical"
                        onFinish={handleSaveBotStatus}
                        initialValues={{
                          enable_bot: false,
                          enable_like_comment: true,
                          enable_keyword_reply: true,
                          enable_ai_fallback: true,
                        }}
                      >
                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.enable_bot !== cur.enable_bot}>
                          {() => {
                            const isBotActive = botStatusForm.getFieldValue('enable_bot')
                            return (
                              <div
                                style={{
                                  padding: 16,
                                  borderRadius: 12,
                                  background: isBotActive ? '#f0fdf4' : '#f8fafc',
                                  border: `1px solid ${isBotActive ? '#bbf7d0' : '#e2e8f0'}`,
                                  marginBottom: 20,
                                  textAlign: 'center',
                                }}
                              >
                                <Space direction="vertical" align="center" size={8}>
                                  <Badge
                                    status={isBotActive ? 'processing' : 'default'}
                                    color={isBotActive ? '#16a34a' : '#94a3b8'}
                                  />
                                  <Text strong style={{ fontSize: 16, color: isBotActive ? '#15803d' : '#64748b' }}>
                                    {isBotActive ? 'BOT ĐANG HOẠT ĐỘNG' : 'BOT ĐANG TẠM DỪNG'}
                                  </Text>
                                  <Form.Item name="enable_bot" valuePropName="checked" style={{ margin: 0 }}>
                                    <Switch
                                      checkedChildren="BẬT BOT"
                                      unCheckedChildren="TẮT BOT"
                                      style={{ transform: 'scale(1.15)', marginTop: 8 }}
                                    />
                                  </Form.Item>
                                </Space>
                              </div>
                            )
                          }}
                        </Form.Item>

                        <Divider style={{ margin: '16px 0' }} />

                        <Form.Item
                          name="enable_like_comment"
                          valuePropName="checked"
                          label="Tự động Like bình luận"
                          extra="Thả Like ngay khi khách hàng để lại bình luận."
                        >
                          <Switch />
                        </Form.Item>

                        <Form.Item
                          name="enable_keyword_reply"
                          valuePropName="checked"
                          label="Bật phản hồi theo Bộ Từ Khóa"
                          extra="Quét bộ từ khóa (Tab 3) trước khi áp dụng câu trả lời mặc định."
                        >
                          <Switch />
                        </Form.Item>

                        <Form.Item
                          name="enable_ai_fallback"
                          valuePropName="checked"
                          label="Trợ lý AI tư vấn khi không khớp từ khóa"
                          extra={
                            <div style={{ marginTop: 4 }}>
                              <div>Sử dụng Trợ lý AI của Fanpage để trả lời thông minh và xin SĐT tự động khi không khớp từ khóa.</div>
                              {selectedPage?.ai_agent_name ? (
                                <Tag color="blue" style={{ marginTop: 6, borderRadius: 4, padding: '2px 8px' }}>
                                  🤖 Trợ lý AI liên kết: <strong>{selectedPage.ai_agent_name}</strong>
                                </Tag>
                              ) : (
                                <Tag color="warning" style={{ marginTop: 6, borderRadius: 4, padding: '2px 8px' }}>
                                  ⚠️ Chưa chọn Trợ lý AI (Có thể chọn tại menu Cấu hình Fanpage)
                                </Tag>
                              )}
                            </div>
                          }
                        >
                          <Switch />
                        </Form.Item>

                        <Button
                          type="primary"
                          htmlType="submit"
                          icon={<SaveOutlined />}
                          loading={savingBotStatus}
                          block
                          style={{
                            height: 42,
                            borderRadius: 8,
                            fontWeight: 600,
                            background: FB_BLUE,
                            marginTop: 12,
                          }}
                        >
                          Lưu Trạng Thái Bot
                        </Button>
                      </Form>
                    </Card>
                  </Col>

                  {/* Cấu hình Nội dung Mặc định */}
                  <Col xs={24} md={16}>
                    <Card
                      title={
                        <Space>
                          <MessageOutlined style={{ color: FB_BLUE }} />
                          <span>Nội dung Phản hồi Mặc định (Tầng 4 Fallback)</span>
                        </Space>
                      }
                      style={{ borderRadius: 14 }}
                      extra={
                        <Tooltip title="Spintax {A|B|C} giúp nội dung xoay vòng ngẫu nhiên chống bị Facebook khóa tính năng spam. Biến {name} sẽ thay bằng tên thật của khách.">
                          <Tag color="processing" style={{ cursor: 'pointer' }}>
                            Hỗ trợ Spintax & Biến {'{name}'}
                          </Tag>
                        </Tooltip>
                      }
                    >
                      <Form
                        form={fallbackForm}
                        layout="vertical"
                        onFinish={handleSaveFallback}
                        initialValues={{
                          enable_comment_reply: false,
                          default_comment_reply: '',
                          enable_private_message: false,
                          default_private_message: '',
                        }}
                      >
                        <Alert
                          message="Quy tắc trả lời mặc định (Fallback)"
                          description="Nội dung dưới đây sẽ được áp dụng khi bình luận của khách KHÔNG khớp với bất kỳ bài viết cụ thể nào (Tab 2) và KHÔNG khớp bộ từ khóa (Tab 3)."
                          type="info"
                          showIcon
                          style={{ marginBottom: 20 }}
                        />

                        {/* Mặc định Reply Comment */}
                        <Card size="small" style={{ borderRadius: 10, marginBottom: 16, background: '#fafafa' }}>
                          <Form.Item
                            name="enable_comment_reply"
                            valuePropName="checked"
                            label={<Text strong>1. Tự động Trả lời Công khai dưới Bình luận</Text>}
                            style={{ marginBottom: 12 }}
                          >
                            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
                          </Form.Item>
                          <Form.Item
                            name="default_comment_reply"
                            label="Mẫu nội dung trả lời bình luận mặc định:"
                            extra="Ví dụ: Dạ em chào {anh|chị} {name}, bên em đã gửi thông tin chi tiết qua tin nhắn Messenger, {anh|chị} kiểm tra hộp thư giúp em nhé ạ ❤️"
                          >
                            <TextArea rows={3} placeholder="Nhập nội dung trả lời cmt..." />
                          </Form.Item>
                        </Card>

                        {/* Mặc định Gửi Private Message */}
                        <Card size="small" style={{ borderRadius: 10, marginBottom: 20, background: '#fafafa' }}>
                          <Form.Item
                            name="enable_private_message"
                            valuePropName="checked"
                            label={<Text strong>2. Tự động Gửi Tin nhắn riêng (Private Message vào Messenger)</Text>}
                            style={{ marginBottom: 12 }}
                          >
                            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
                          </Form.Item>
                          <Form.Item
                            name="default_private_message"
                            label="Mẫu nội dung inbox riêng gửi khách:"
                            extra="Ví dụ: Dạ chào {name}! Cảm ơn bạn đã quan tâm sản phẩm của bên mình. Bạn đang quan tâm mẫu nào hoặc cần tư vấn lắp đặt ở khu vực nào ạ?"
                          >
                            <TextArea rows={4} placeholder="Nhập nội dung inbox riêng..." />
                          </Form.Item>
                        </Card>

                        <div style={{ textAlign: 'right' }}>
                          <Button
                            type="primary"
                            htmlType="submit"
                            icon={<SaveOutlined />}
                            loading={savingFallback}
                            size="large"
                            style={{ borderRadius: 8, background: FB_BLUE }}
                          >
                            Lưu Cấu Hình Mặc Định
                          </Button>
                        </div>
                      </Form>
                    </Card>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'post_rules',
              label: (
                <Space>
                  <Badge count={postRules.length} offset={[8, -2]} size="small" style={{ backgroundColor: '#10b981' }}>
                    <span>2. Theo Bài Viết Cụ Thể (Post Rules)</span>
                  </Badge>
                </Space>
              ),
              children: (
                <Card
                  title={
                    <Space>
                      <span>Danh sách Cấu hình theo Bài viết (Ưu tiên số 1)</span>
                      <Tooltip title="Khi có bình luận trên bài viết này, Bot sẽ áp dụng quy tắc này trước tiên, bỏ qua các từ khóa chung.">
                        <Tag color="cyan">Tầng 1 - Ưu tiên cao nhất</Tag>
                      </Tooltip>
                    </Space>
                  }
                  style={{ borderRadius: 14 }}
                  extra={
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openPostRuleModal()}
                      style={{ borderRadius: 8, background: FB_BLUE }}
                    >
                      Thêm Cấu Hình Bài Viết
                    </Button>
                  }
                >
                  <Table
                    dataSource={postRules}
                    rowKey="id"
                    loading={loadingPostRules}
                    pagination={{ pageSize: 10 }}
                    columns={[
                      {
                        title: 'Mô tả / Post ID',
                        key: 'post_id',
                        render: (_, r) => (
                          <div>
                            <Text strong>{r.post_note || 'Bài viết'}</Text>
                            <div style={{ marginTop: 4 }}>
                              {r.post_id_list.split(/[, \n]+/).filter(Boolean).map((id, idx) => (
                                <Tag key={idx} color="blue" style={{ marginBottom: 4 }}>
                                  #{id}
                                </Tag>
                              ))}
                            </div>
                          </div>
                        ),
                      },
                      {
                        title: 'Từ khóa lọc',
                        dataIndex: 'keywords',
                        key: 'keywords',
                        render: (text) =>
                          text ? (
                            text.split(',').map((kw, i) => (
                              <Tag key={i} color="orange">
                                {kw.trim()}
                              </Tag>
                            ))
                          ) : (
                            <Tag color="green">Mọi bình luận</Tag>
                          ),
                      },
                      {
                        title: 'Trả lời Bình luận',
                        dataIndex: 'comment_reply',
                        key: 'comment_reply',
                        ellipsis: true,
                        render: (t) => t || <Text type="secondary">(Không trả lời)</Text>,
                      },
                      {
                        title: 'Inbox riêng (Messenger)',
                        dataIndex: 'private_message',
                        key: 'private_message',
                        ellipsis: true,
                        render: (t) => t || <Text type="secondary">(Không gửi)</Text>,
                      },
                      {
                        title: 'Like',
                        dataIndex: 'enable_like',
                        key: 'enable_like',
                        align: 'center',
                        render: (val) => (val ? <LikeOutlined style={{ color: '#16a34a', fontSize: 16 }} /> : '-'),
                      },
                      {
                        title: 'Hoạt động',
                        dataIndex: 'is_active',
                        key: 'is_active',
                        align: 'center',
                        render: (val, r) => (
                          <Switch
                            checked={val}
                            size="small"
                            onChange={(checked) => handleTogglePostRuleActive(r, checked)}
                          />
                        ),
                      },
                      {
                        title: 'Thao tác',
                        key: 'actions',
                        align: 'center',
                        render: (_, r) => (
                          <Space size={8}>
                            <Button
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => openPostRuleModal(r)}
                            />
                            <Popconfirm
                              title="Bạn có chắc chắn muốn xóa cấu hình bài viết này?"
                              onConfirm={() => handleDeletePostRule(r.id)}
                              okText="Xóa"
                              cancelText="Hủy"
                              okButtonProps={{ danger: true }}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              ),
            },
            {
              key: 'keywords',
              label: (
                <Space>
                  <Badge count={keywordRules.length} offset={[8, -2]} size="small" style={{ backgroundColor: '#f59e0b' }}>
                    <span>3. Theo Bộ Từ Khóa (Keyword Rules)</span>
                  </Badge>
                </Space>
              ),
              children: (
                <Card
                  title={
                    <Space>
                      <span>Danh sách Quy tắc Từ Khóa (Ưu tiên số 2)</span>
                      <Tag color="orange">Tầng 2</Tag>
                    </Space>
                  }
                  style={{ borderRadius: 14 }}
                  extra={
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openKeywordRuleModal()}
                      style={{ borderRadius: 8, background: FB_BLUE }}
                    >
                      Thêm Quy Tắc Từ Khóa
                    </Button>
                  }
                >
                  <Table
                    dataSource={keywordRules}
                    rowKey="id"
                    loading={loadingKeywordRules}
                    pagination={{ pageSize: 10 }}
                    columns={[
                      {
                        title: 'Bộ Từ Khóa',
                        dataIndex: 'keywords',
                        key: 'keywords',
                        render: (kws) =>
                          Array.isArray(kws)
                            ? kws.map((kw, i) => (
                                <Tag key={i} color="volcano" style={{ marginBottom: 4 }}>
                                  {kw}
                                </Tag>
                              ))
                            : String(kws),
                      },
                      {
                        title: 'Kiểu khớp',
                        dataIndex: 'match_type',
                        key: 'match_type',
                        render: (type) =>
                          type === 'exact' ? (
                            <Tag color="purple">Khớp chính xác 100%</Tag>
                          ) : (
                            <Tag color="geekblue">Có chứa từ khóa</Tag>
                          ),
                      },
                      {
                        title: 'Áp dụng Inbox',
                        dataIndex: 'use_for_inbox',
                        key: 'use_for_inbox',
                        align: 'center',
                        render: (val) =>
                          val ? <Tag color="success">Áp dụng cả Inbox</Tag> : <Tag color="default">Chỉ Comment</Tag>,
                      },
                      {
                        title: 'Trả lời Comment',
                        dataIndex: 'comment_reply',
                        key: 'comment_reply',
                        ellipsis: true,
                        render: (t) => t || <Text type="secondary">(Không trả lời)</Text>,
                      },
                      {
                        title: 'Gửi Inbox riêng',
                        dataIndex: 'private_message',
                        key: 'private_message',
                        ellipsis: true,
                        render: (t) => t || <Text type="secondary">(Không gửi)</Text>,
                      },
                      {
                        title: 'Hoạt động',
                        dataIndex: 'is_active',
                        key: 'is_active',
                        align: 'center',
                        render: (val, r) => (
                          <Switch
                            checked={val}
                            size="small"
                            onChange={(checked) => handleToggleKeywordRuleActive(r, checked)}
                          />
                        ),
                      },
                      {
                        title: 'Thao tác',
                        key: 'actions',
                        align: 'center',
                        render: (_, r) => (
                          <Space size={8}>
                            <Button
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => openKeywordRuleModal(r)}
                            />
                            <Popconfirm
                              title="Bạn có chắc chắn muốn xóa quy tắc từ khóa này?"
                              onConfirm={() => handleDeleteKeywordRule(r.id)}
                              okText="Xóa"
                              cancelText="Hủy"
                              okButtonProps={{ danger: true }}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              ),
            },
            {
              key: 'logs',
              label: (
                <Space>
                  <ClockCircleOutlined />
                  <span>4. Nhật Ký Hoạt Động (Activity Logs)</span>
                </Space>
              ),
              children: (
                <Card
                  title={
                    <Row gutter={[16, 16]} align="middle" style={{ width: '100%' }}>
                      <Col xs={24} md={6}>
                        <Space>
                          <span>Nhật ký tương tác Bot</span>
                          <Tag color="blue">{totalLogs} bản ghi</Tag>
                        </Space>
                      </Col>
                      <Col xs={24} md={18} style={{ textAlign: 'right' }}>
                        <Space wrap>
                          <Select
                            placeholder="Loại tương tác"
                            allowClear
                            value={logFilterEventType || undefined}
                            onChange={(val) => setLogFilterEventType(val || '')}
                            style={{ width: 140 }}
                          >
                            <Option value="comment">Bình luận</Option>
                            <Option value="message">Tin nhắn</Option>
                          </Select>
                          <Select
                            placeholder="Trạng thái"
                            allowClear
                            value={logFilterStatus || undefined}
                            onChange={(val) => setLogFilterStatus(val || '')}
                            style={{ width: 160 }}
                          >
                            <Option value="success">Thành công</Option>
                            <Option value="skipped_cooldown">Bỏ qua (Cooldown)</Option>
                            <Option value="error">Lỗi</Option>
                          </Select>
                          <Input
                            placeholder="Tìm tên khách, nội dung..."
                            prefix={<SearchOutlined />}
                            value={logSearchQuery}
                            onChange={(e) => setLogSearchQuery(e.target.value)}
                            onPressEnter={fetchLogs}
                            style={{ width: 200 }}
                          />
                          <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loadingLogs}>
                            Làm mới
                          </Button>
                          <Popconfirm
                            title="Bạn có chắc muốn xóa toàn bộ lịch sử nhật ký của Trang này?"
                            onConfirm={handleClearHistory}
                            okText="Xóa hết"
                            cancelText="Hủy"
                            okButtonProps={{ danger: true }}
                          >
                            <Button danger icon={<DeleteOutlined />}>
                              Xóa lịch sử
                            </Button>
                          </Popconfirm>
                        </Space>
                      </Col>
                    </Row>
                  }
                  style={{ borderRadius: 14 }}
                >
                  <Table
                    dataSource={logs}
                    rowKey="id"
                    loading={loadingLogs}
                    pagination={{ pageSize: 20 }}
                    columns={[
                      {
                        title: 'Thời gian',
                        dataIndex: 'created_at',
                        key: 'created_at',
                        width: 140,
                        render: (t) => dayjs(t).format('DD/MM/YYYY HH:mm:ss'),
                      },
                      {
                        title: 'Khách hàng',
                        dataIndex: 'customer_name',
                        key: 'customer_name',
                        width: 160,
                        render: (name, r) => (
                          <div>
                            <Text strong>{name || 'Ẩn danh'}</Text>
                            <div>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                ID: {r.fb_sender_id}
                              </Text>
                            </div>
                          </div>
                        ),
                      },
                      {
                        title: 'Loại',
                        dataIndex: 'event_type',
                        key: 'event_type',
                        width: 110,
                        render: (t) =>
                          t === 'comment' ? (
                            <Tag color="cyan">Bình luận</Tag>
                          ) : (
                            <Tag color="blue">Tin nhắn</Tag>
                          ),
                      },
                      {
                        title: 'Nội dung Trigger',
                        dataIndex: 'trigger_content',
                        key: 'trigger_content',
                        render: (text) => (
                          <div style={{ maxWidth: 260, wordBreak: 'break-word' }}>
                            <Text>{text || '[Trống]'}</Text>
                          </div>
                        ),
                      },
                      {
                        title: 'Hành động của Bot',
                        dataIndex: 'action_taken',
                        key: 'action_taken',
                        render: (act) => <Tag color="geekblue">{act}</Tag>,
                      },
                      {
                        title: 'Quy tắc kích hoạt',
                        dataIndex: 'details',
                        key: 'details',
                        render: (det) => <Text type="secondary">{det}</Text>,
                      },
                      {
                        title: 'Trạng thái',
                        dataIndex: 'status',
                        key: 'status',
                        width: 120,
                        align: 'center',
                        render: (st) => {
                          if (st === 'success') return <Tag color="success">Thành công</Tag>
                          if (st === 'skipped_cooldown') return <Tag color="warning">Cooldown 5s</Tag>
                          return <Tag color="error">Lỗi</Tag>
                        },
                      },
                    ]}
                  />
                </Card>
              ),
            },
          ]}
        />
      )}

      {/* ── Modal Thêm/Sửa Cấu hình Bài viết (Post Rule) ───────────────────── */}
      <Modal
        title={editingPostRule ? 'Chỉnh sửa Cấu hình Bài viết' : 'Thêm Cấu hình Bài viết Mới (Post Rule)'}
        open={postRuleModalVisible}
        onCancel={() => setPostRuleModalVisible(false)}
        onOk={() => postRuleForm.submit()}
        width={720}
        destroyOnClose
      >
        <Form form={postRuleForm} layout="vertical" onFinish={handleSavePostRule} style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="post_id_list"
                label={<Text strong>Danh sách ID Bài viết (Post ID):</Text>}
                rules={[{ required: true, message: 'Vui lòng nhập ít nhất 1 Post ID' }]}
                extra="Nhập ID bài viết hoặc sử dụng 2 công cụ bên cạnh để lấy tự động."
              >
                <Input
                  placeholder="VD: 123456789, 987654321..."
                  addonAfter={
                    <Space size={4}>
                      <Tooltip title="Chọn từ danh sách 25 bài viết mới nhất trên Fanpage">
                        <Button
                          type="link"
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={openPublishedPostsModal}
                        >
                          Chọn từ Page
                        </Button>
                      </Tooltip>
                      <Tooltip title="Lắng nghe comment POSTID trên bài viết Facebook">
                        <Button
                          type="link"
                          size="small"
                          icon={<RadarChartOutlined />}
                          onClick={startRadarCapture}
                          style={{ color: '#16a34a' }}
                        >
                          Lấy ID Tự Động (POSTID)
                        </Button>
                      </Tooltip>
                    </Space>
                  }
                />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item
                name="keywords"
                label="Từ khóa lọc trong bài viết:"
                extra="Để trống nếu muốn áp dụng cho TẤT CẢ bình luận trong bài viết. Nếu có từ khóa, chỉ bình luận chứa từ khóa mới kích hoạt (phân cách dấu phẩy)."
              >
                <Input placeholder="VD: giá, tư vấn, inbox, mua hàng..." />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item name="post_note" label="Ghi chú bài viết / chiến dịch:">
                <Input placeholder="VD: Bài viết khuyến mãi 20/10, Video giới thiệu máy..." />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item
                name="comment_reply"
                label="Nội dung Trả lời bình luận công khai:"
                extra="Hỗ trợ Spintax {A|B|C} và biến {name}. Để trống nếu không muốn reply cmt."
              >
                <TextArea rows={3} placeholder="VD: Dạ em chào {name}, em đã nhắn tin gửi bảng giá cho bạn rồi ạ!" />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item
                name="private_message"
                label="Nội dung Tin nhắn riêng gửi vào Messenger (Private Reply):"
                extra="Hỗ trợ Spintax {A|B|C} và biến {name}. Để trống nếu không muốn gửi inbox riêng."
              >
                <TextArea rows={3} placeholder="VD: Chào {name}! Bạn quan tâm mẫu sản phẩm nào để bên em báo giá ưu đãi nhé ạ?" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="enable_like" valuePropName="checked" label="Tự động Like bình luận:">
                <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="is_active" valuePropName="checked" label="Trạng thái quy tắc:">
                <Switch checkedChildren="Hoạt động" unCheckedChildren="Tạm dừng" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Modal Chọn Bài Viết Từ Page (Published Posts) ──────────────────── */}
      <Modal
        title="Chọn bài viết từ Fanpage"
        open={publishedPostsModalVisible}
        onCancel={() => setPublishedPostsModalVisible(false)}
        footer={null}
        width={760}
      >
        <Spin spinning={loadingPosts}>
          <List
            itemLayout="horizontal"
            dataSource={publishedPosts}
            pagination={{ pageSize: 5 }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => handleSelectPublishedPost(item)}
                  >
                    Chọn bài này
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    item.full_picture ? (
                      <Avatar shape="square" size={64} src={item.full_picture} />
                    ) : (
                      <Avatar shape="square" size={64} icon={<MessageOutlined />} />
                    )
                  }
                  title={
                    <a href={item.permalink_url} target="_blank" rel="noreferrer">
                      Post ID: {item.id.includes('_') ? item.id.split('_')[1] : item.id}
                    </a>
                  }
                  description={
                    <div>
                      <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 4 }}>
                        {item.message || '(Bài viết dạng ảnh/video không có mô tả)'}
                      </Paragraph>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Ngày đăng: {dayjs(item.created_time).format('DD/MM/YYYY HH:mm')}
                      </Text>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        </Spin>
      </Modal>

      {/* ── Modal Lắng Nghe Bắt Post ID Tự Động (Radar POSTID) ─────────────── */}
      <Modal
        title={
          <Space>
            <RadarChartOutlined style={{ color: '#16a34a' }} />
            <span>Đang lắng nghe bắt ID bài viết tự động...</span>
          </Space>
        }
        open={radarModalVisible}
        onCancel={stopRadarCapture}
        footer={[
          <Button key="cancel" onClick={stopRadarCapture}>
            Đóng
          </Button>,
        ]}
        width={540}
        destroyOnClose
      >
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Spin size="large" />
          <Title level={4} style={{ marginTop: 20, color: '#16a34a' }}>
            Hệ thống đang chờ bình luận POSTID...
          </Title>
          <Paragraph type="secondary" style={{ fontSize: 14 }}>
            👉 Hãy dùng tài khoản Facebook bất kỳ (hoặc tài khoản cá nhân) vào bài viết cần cấu hình trên Fanpage <strong>{selectedPage?.page_name}</strong> và bình luận đúng chữ:
          </Paragraph>
          <div
            style={{
              display: 'inline-block',
              padding: '8px 24px',
              borderRadius: 8,
              background: '#f1f5f9',
              border: '2px dashed #94a3b8',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 3,
              color: '#0f172a',
              marginBottom: 16,
            }}
          >
            POSTID
          </div>
          <Alert
            message="Tự động nhận diện & thả Like"
            description="Ngay khi bạn comment chữ POSTID, hệ thống sẽ tự động thả Like bình luận đó để báo hiệu và tự động điền Post ID vào ô nhập liệu!"
            type="success"
            showIcon
          />
        </div>
      </Modal>

      {/* ── Modal Thêm/Sửa Quy Tắc Từ Khóa (Keyword Rule) ─────────────────── */}
      <Modal
        title={editingKeywordRule ? 'Chỉnh sửa Quy tắc Từ khóa' : 'Thêm Quy tắc Từ khóa Mới (Keyword Rule)'}
        open={keywordRuleModalVisible}
        onCancel={() => setKeywordRuleModalVisible(false)}
        onOk={() => keywordRuleForm.submit()}
        width={680}
        destroyOnClose
      >
        <Form form={keywordRuleForm} layout="vertical" onFinish={handleSaveKeywordRule} style={{ marginTop: 16 }}>
          <Form.Item
            name="keywords"
            label={<Text strong>Danh sách Từ khóa:</Text>}
            rules={[{ required: true, message: 'Vui lòng nhập ít nhất 1 từ khóa' }]}
            extra="Nhập từ khóa và gõ phím Enter để thêm (VD: giá, báo giá, bao nhiêu, mua hàng...)"
          >
            <Select
              mode="tags"
              placeholder="Nhập từ khóa và ấn Enter..."
              style={{ width: '100%' }}
              tokenSeparators={[',']}
            />
          </Form.Item>

          <Form.Item name="match_type" label="Kiểu so khớp:">
            <Radio.Group>
              <Radio value="contains">Có chứa từ khóa (Khuyên dùng)</Radio>
              <Radio value="exact">Khớp chính xác 100%</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="use_for_inbox"
            valuePropName="checked"
            label="Áp dụng khi khách nhắn tin trực tiếp vào Messenger:"
            extra="Nếu bật, khi khách nhắn tin vào Inbox có chứa từ khóa này, Bot cũng sẽ tự động phản hồi."
          >
            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
          </Form.Item>

          <Form.Item
            name="comment_reply"
            label="Nội dung Trả lời bình luận công khai:"
            extra="Hỗ trợ Spintax {A|B|C} và biến {name}. Để trống nếu không muốn reply cmt."
          >
            <TextArea rows={3} placeholder="VD: Chào {name}, bên em gửi bảng giá chi tiết qua tin nhắn cho bạn rồi nhé!" />
          </Form.Item>

          <Form.Item
            name="private_message"
            label="Nội dung Tin nhắn riêng gửi vào Messenger (Private Reply):"
            extra="Hỗ trợ Spintax {A|B|C} và biến {name}. Để trống nếu không muốn gửi inbox riêng."
          >
            <TextArea rows={3} placeholder="VD: Dạ chào {name}! Cảm ơn bạn đã hỏi về giá sản phẩm. Bạn để lại SĐT để bên em tư vấn chiết khấu đại lý tốt nhất nhé ạ!" />
          </Form.Item>

          <Form.Item name="is_active" valuePropName="checked" label="Trạng thái quy tắc:">
            <Switch checkedChildren="Hoạt động" unCheckedChildren="Tạm dừng" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
