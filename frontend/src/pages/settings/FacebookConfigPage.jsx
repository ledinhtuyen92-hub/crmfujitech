import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  InfoCircleOutlined,
  LoginOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useResponsive } from '../../hooks/useResponsive'
import api from '../../utils/api'

const { Title, Text, Paragraph } = Typography

const FB_BLUE = '#1877f2'

// ── Token Status Badge ────────────────────────────────────────────────────────
function TokenStatusBadge({ config }) {
  if (!config.is_token_valid) {
    return <Tag icon={<CloseCircleOutlined />} color="error">Chưa có Token</Tag>
  }
  if (config.is_token_near_expiry) {
    return <Tag icon={<WarningOutlined />} color="warning">Sắp hết hạn</Tag>
  }
  return (
    <Tag icon={<CheckCircleOutlined />} color="success">
      Token hợp lệ {config.token_expires_at_display && `— ${config.token_expires_at_display}`}
    </Tag>
  )
}

export default function FacebookConfigPage() {
  const { isCompanyAdmin, hasPermission, maintenanceMode } = useAuth()
  const { isMobile } = useResponsive()
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [debuggingId, setDebuggingId] = useState(null)
  const [editingPage, setEditingPage] = useState(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [aiAgents, setAiAgents] = useState([])
  // Facebook Login OAuth
  const [oauthPages, setOauthPages] = useState([])       // pages returned by exchange-oauth-code
  const [selectPageModal, setSelectPageModal] = useState(false)
  const [oauthTargetConfigId, setOauthTargetConfigId] = useState(null)
  const [form] = Form.useForm()
  const useSystemConfig = Form.useWatch('use_system_config', form)
  // Safe Delete Modal
  const [deleteModal, setDeleteModal] = useState({ open: false, page: null })
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const fetchPages = async () => {
    setLoading(true)
    try {
      const res = await api.get('/facebook/pages/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setPages(data)
    } catch { message.error('Không thể tải danh sách Trang Facebook.') }
    finally { setLoading(false) }
  }

  // ── Xử lý callback từ Facebook Login SDK / Redirect ──────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fbCode = params.get('code')
    const stateConfigId = params.get('state') || localStorage.getItem('fb_oauth_config_id')

    if (fbCode) {
      // Server-side redirect flow (nếu dùng)
      window.history.replaceState({}, document.title, window.location.pathname)
      localStorage.removeItem('fb_oauth_config_id')
      handleExchangeCode(fbCode, stateConfigId)
    } else {
      fetchPages()
    }
    api.get('ai_agents/agents/')
      .then(res => setAiAgents(Array.isArray(res.data) ? res.data : res.data?.results ?? []))
      .catch(console.error)
  }, [])

  const handleExchangeCode = async (code, configId) => {
    setLoading(true)
    try {
      const redirectUri = window.location.origin + window.location.pathname
      const res = await api.post('/facebook/pages/exchange-oauth-code/', {
        code: code,
        redirect_uri: redirectUri,
        config_id: configId,
      })
      if (res.data.pages?.length) {
        setOauthPages(res.data.pages)
        setOauthTargetConfigId(configId || res.data.config_id)
        setSelectPageModal(true)
      }
      fetchPages()
    } catch (err) {
      message.error(err.response?.data?.error || 'Lỗi khi đổi mã xác thực Facebook.')
      fetchPages()
    } finally { setLoading(false) }
  }

  // ── Facebook Login JS SDK flow (Client-side) ──────────────────────────────
  const handleFacebookLogin = (config) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì!'); return }
    const appId = config.resolved_app_id || config.app_id
    if (!appId) {
      message.warning('Vui lòng lưu cấu hình App ID trước khi đăng nhập.')
      return
    }
    // Dùng Redirect OAuth flow của Facebook
    localStorage.setItem('fb_oauth_config_id', config.id)
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname)
    const scope = encodeURIComponent('pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement')
    const oauthUrl = `https://www.facebook.com/v25.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&state=${config.id}&response_type=code`
    window.location.href = oauthUrl
  }

  // ── Chọn trang sau OAuth ──────────────────────────────────────────────────
  const handleSelectPage = async (page) => {
    try {
      await api.post(`/facebook/pages/${oauthTargetConfigId}/select-page/`, {
        page_id: page.id,
        page_name: page.name,
        access_token: page.access_token,
        picture: page.picture,
      })
      message.success(`Đã kết nối Trang: ${page.name}`)
      setSelectPageModal(false)
      fetchPages()
    } catch (err) {
      message.error(err.response?.data?.error || 'Không thể kết nối trang này.')
    }
  }

  // ── Debug Token ───────────────────────────────────────────────────────────
  const handleDebugToken = async (config) => {
    setDebuggingId(config.id)
    try {
      const res = await api.post(`/facebook/pages/${config.id}/debug-token/`)
      Modal.info({
        title: '🔍 Kiểm tra chi tiết Token Facebook',
        width: 500,
        content: (
          <div style={{ marginTop: 12 }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Trạng thái">
                {res.data.is_valid
                  ? <Tag color="success">✅ Hợp lệ</Tag>
                  : <Tag color="error">❌ Không hợp lệ</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Loại Token">
                <Tag color="blue">{res.data.token_type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Thời hạn">
                {res.data.token_expires_at_display || 'Không giới hạn (Page Token)'}
              </Descriptions.Item>
              <Descriptions.Item label="App ID">{res.data.app_id}</Descriptions.Item>
              <Descriptions.Item label="Quyền được cấp">
                {(res.data.scopes || []).join(', ') || 'Không có thông tin'}
              </Descriptions.Item>
            </Descriptions>
            {!res.data.is_valid && (
              <Alert
                type="error"
                style={{ marginTop: 12 }}
                message="Token không hợp lệ. Vui lòng đăng nhập lại để lấy Token mới."
              />
            )}
          </div>
        )
      })
      fetchPages()
    } catch (err) {
      message.error(err.response?.data?.error || 'Không thể kiểm tra token.')
    } finally { setDebuggingId(null) }
  }

  // ── Modal form ────────────────────────────────────────────────────────────
  const handleOpenModal = (page = null, isNew = false) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì!'); return }
    setIsCreatingNew(isNew || !page)
    setEditingPage(page)
    if (page && !isNew) {
      form.setFieldsValue({
        page_name: page.page_name,
        page_id: page.page_id,
        use_system_config: page.use_system_config,
        app_id: page.app_id,
        app_secret: '',
        webhook_verify_token: page.webhook_verify_token,
        auto_create_customer_from_phone: page.auto_create_customer_from_phone,
        auto_assign_lead_to_customer_assignee: page.auto_assign_lead_to_customer_assignee ?? true,
        lead_cleanup_days: page.lead_cleanup_days || 30,
        request_phone_template: page.request_phone_template,
        request_email_template: page.request_email_template,
        ai_agent: page.ai_agent,
        is_active: page.is_active,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({
        use_system_config: true,
        is_active: true,
        auto_create_customer_from_phone: false,
        auto_assign_lead_to_customer_assignee: true,
        lead_cleanup_days: 30,
        request_phone_template: "Dạ chào bạn, để tiện chuyên viên tư vấn chi tiết và gửi bảng giá ưu đãi, bạn cho mình xin số điện thoại liên hệ với ạ ❤️",
        request_email_template: "Dạ bạn cho mình xin địa chỉ Email để bên em gửi catalogue và thông tin chi tiết qua email cho mình nhé 📧",
        ai_agent: null,
      })
    }
    setModalVisible(true)
  }

  const handleSave = async () => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (!values.page_access_token && editingPage) delete values.page_access_token
      if (!values.app_secret && editingPage) delete values.app_secret
      if (editingPage && !isCreatingNew) {
        await api.patch(`/facebook/pages/${editingPage.id}/`, values)
        message.success('Đã cập nhật cấu hình Trang Facebook!')
      } else {
        await api.post('/facebook/pages/', values)
        message.success('Đã thêm Trang Facebook thành công!')
      }
      setModalVisible(false)
      fetchPages()
    } catch (err) {
      message.error(err.response?.data?.detail || err.response?.data?.page_name?.[0] || 'Lỗi khi lưu.')
    } finally { setSaving(false) }
  }

  const handleDisconnect = async (id) => {
    try {
      await api.delete(`/facebook/pages/${id}/`)
      message.success('Đã ngắt kết nối Trang. Lịch sử hội thoại & tin nhắn được bảo vệ an toàn!')
      fetchPages()
    } catch { message.error('Không thể ngắt kết nối trang này.') }
  }

  const handleReconnect = async (id) => {
    try {
      await api.post(`/facebook/pages/${id}/reconnect/`)
      message.success('Đã khôi phục kết nối và kích hoạt lại Trang!')
      fetchPages()
    } catch { message.error('Lỗi khi khôi phục kết nối.') }
  }

  const openDeleteModal = (page) => {
    setDeleteModal({ open: true, page })
    setDeleteConfirmText('')
  }

  const handlePermanentDelete = async () => {
    const { page } = deleteModal
    if (!page) return
    setDeleting(true)
    try {
      await api.delete(`/facebook/pages/${page.id}/permanent-delete/`)
      message.success(`Đã xoá vĩnh viễn Trang "${page.page_name}" và toàn bộ dữ liệu liên quan.`)
      setDeleteModal({ open: false, page: null })
      fetchPages()
    } catch { message.error('Lỗi khi xoá vĩnh viễn. Vui lòng thử lại.') }
    finally { setDeleting(false) }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', overflowX: 'hidden', padding: isMobile ? '0 8px' : 0 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={14}>
          <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: FB_BLUE, fontWeight: 900, fontSize: 22 }}>𝐟</span>
            <span>Cấu hình Facebook Multi-Page Inbox</span>
          </Title>
          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>Kết nối Fanpage Facebook để nhận tin nhắn và quản lý khách hàng trực tiếp trong CRM</Text>
        </Col>
        <Col xs={24} md={10} style={{ display: 'flex', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
          <Space wrap>
            {pages.length > 0 && (
              <Button onClick={() => handleOpenModal(null, true)} style={{ borderRadius: 16 }}>
                + Thêm Trang mới
              </Button>
            )}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleOpenModal(null, true)}
              style={{ background: FB_BLUE, borderColor: FB_BLUE, borderRadius: 20 }}
              disabled={pages.length > 0}
            >
              Kết nối Trang Facebook
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Webhook Guide */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 20, borderRadius: 10, padding: isMobile ? '8px 12px' : '8px 15px', overflow: 'hidden' }}
        message="Hướng dẫn cấu hình Webhook trên Meta Developers"
        description={
          <div style={{ marginTop: 6 }}>
            <p style={{ margin: '2px 0' }}>
              Vào <b>Meta Developers → App → Messenger → Webhooks</b>, điền:
            </p>
            <p style={{ margin: '2px 0', wordBreak: 'break-all' }}>
              • <b>Callback URL:</b>{' '}
              <code style={{ background: '#e8f4fd', padding: '1px 6px', borderRadius: 4, wordBreak: 'break-all' }}>
                {window.location.origin}/api/facebook/webhook/
              </code>
            </p>
            <p style={{ margin: '2px 0' }}>
              • <b>Verify Token:</b> Chuỗi bí mật bạn tự đặt (giống trường Webhook Verify Token bên dưới)
            </p>
            <p style={{ margin: '2px 0' }}>
              • <b>Subscribe Events:</b> <code>messages</code>, <code>messaging_postbacks</code>
            </p>
            <Divider style={{ margin: '12px 0' }} />
            <p style={{ margin: '2px 0', fontWeight: 'bold' }}>
              Cấu hình Đăng nhập Facebook (Facebook Login → Cài đặt)
            </p>
            <p style={{ margin: '2px 0', wordBreak: 'break-word' }}>
              • <b>Miền ứng dụng (App Domains) [Cài đặt cơ bản]:</b>{' '}
              <code style={{ background: '#e8f4fd', padding: '1px 6px', borderRadius: 4, wordBreak: 'break-all' }}>
                {window.location.hostname}
              </code>
            </p>
            <p style={{ margin: '2px 0', wordBreak: 'break-word' }}>
              • <b>URI chuyển hướng OAuth hợp lệ (Valid OAuth Redirect URIs):</b>{' '}
              <code style={{ background: '#e8f4fd', padding: '1px 6px', borderRadius: 4, wordBreak: 'break-all' }}>
                {window.location.origin + window.location.pathname}
              </code>
            </p>
            <p style={{ margin: '8px 0 0', color: '#1877f2' }}>
              💡 Bấm <b>"🔐 Đăng nhập Facebook"</b> sau khi lưu cấu hình App ID/Secret để tự động lấy Page Access Token.
            </p>
          </div>
        }
      />

      {/* No pages state */}
      {pages.length === 0 && !loading ? (
        <Card style={{ textAlign: 'center', padding: '40px 20px', borderRadius: 12 }}>
          <span style={{ fontSize: 56, display: 'block', marginBottom: 16 }}>𝐟</span>
          <Title level={5} style={{ color: '#6b7280' }}>Chưa kết nối Trang Facebook nào</Title>
          <Paragraph type="secondary">Thêm cấu hình trang Facebook, sau đó bấm "Đăng nhập Facebook" để lấy Page Access Token tự động.</Paragraph>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal(null, true)}
            style={{ background: FB_BLUE, borderColor: FB_BLUE, borderRadius: 20 }}>
            Tạo cấu hình đầu tiên
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {pages.map(page => (
            <Card
              key={page.id}
              style={{
                borderRadius: 12,
                border: page.is_active
                  ? (page.is_token_near_expiry ? '2px solid #fde68a' : '1px solid #bbf7d0')
                  : '1px solid #e5e7eb',
              }}
              bodyStyle={{ padding: '20px 24px' }}
            >
              <Row align="middle" gutter={[16, 16]}>
                <Col xs={24} md={12} lg={14}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 12, background: '#dbeafe',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 26, color: FB_BLUE, fontWeight: 900, flexShrink: 0,
                    }}>𝐟</div>
                    <div>
                      <Text strong style={{ fontSize: 16 }}>{page.page_name}</Text>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <TokenStatusBadge config={page} />
                        <Tag color={page.is_active ? 'success' : 'error'}>
                          {page.is_active ? 'Đang hoạt động' : '⚠️ Đã ngắt kết nối'}
                        </Tag>
                        {page.page_id && <Tag color="blue">ID: {page.page_id}</Tag>}
                        {page.use_system_config
                          ? <Tag color="purple">🔧 Dùng App hệ thống</Tag>
                          : <Tag color="orange">⚙️ App riêng</Tag>}
                      </div>
                      <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                        {page.auto_create_customer_from_phone
                          ? '🤖 Tự động tạo KH khi phát hiện SĐT'
                          : '👆 Thêm KH thủ công'}
                      </Text>
                    </div>
                  </div>
                </Col>
                <Col xs={24} md={12} lg={10}>
                  <Space wrap>
                    {page.is_active ? (
                      <>
                        <Tooltip title="Đăng nhập Facebook và tự động lấy Page Access Token">
                          <Button
                            type="primary"
                            icon={<LoginOutlined />}
                            onClick={() => handleFacebookLogin(page)}
                            style={{ background: FB_BLUE, borderColor: FB_BLUE, borderRadius: 16 }}
                          >
                            🔐 Đăng nhập Facebook
                          </Button>
                        </Tooltip>
                        {page.is_token_valid && (
                          <Tooltip title="Kiểm tra thời hạn & quyền của Token qua Meta API">
                            <Button
                              icon={<SafetyCertificateOutlined />}
                              loading={debuggingId === page.id}
                              onClick={() => handleDebugToken(page)}
                            >
                              Kiểm tra Token
                            </Button>
                          </Tooltip>
                        )}
                        <Button icon={<SettingOutlined />} onClick={() => handleOpenModal(page)}>
                          Chỉnh sửa
                        </Button>
                        <Popconfirm
                          title={
                            <div style={{ maxWidth: 280 }}>
                              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Xác nhận ngắt kết nối?</div>
                              <div style={{ fontSize: 13, color: '#555' }}>
                                Trang sẽ bị <b>tạm dừng nhận tin nhắn mới</b>, nhưng <b style={{ color: '#10b981' }}>toàn bộ lịch sử hội thoại và tin nhắn được giữ nguyên hoàn toàn</b>. Bạn có thể khôi phục lại bất cứ lúc nào.
                              </div>
                            </div>
                          }
                          onConfirm={() => handleDisconnect(page.id)}
                          okText="Ngắt kết nối" cancelText="Hủy" okType="warning"
                          icon={null}
                        >
                          <Tooltip title="Tạm ngắt kết nối — lịch sử tin nhắn được bảo toàn, khôi phục được">
                            <Button danger icon={<DisconnectOutlined />}>Ngắt kết nối</Button>
                          </Tooltip>
                        </Popconfirm>
                      </>
                    ) : (
                      <>
                        <Button
                          type="primary"
                          icon={<ReloadOutlined />}
                          onClick={() => handleReconnect(page.id)}
                          style={{ background: '#10b981', borderColor: '#10b981', borderRadius: 16 }}
                        >
                          🔄 Khôi phục kết nối
                        </Button>
                        <Button icon={<SettingOutlined />} onClick={() => handleOpenModal(page)}>
                          Chỉnh sửa
                        </Button>
                        <Tooltip title="Xóa vĩnh viễn — mất toàn bộ lịch sử hội thoại, KHÔNG khôi phục được">
                          <Button danger icon={<DeleteOutlined />} onClick={() => openDeleteModal(page)}>
                            Xóa vĩnh viễn
                          </Button>
                        </Tooltip>
                      </>
                    )}
                  </Space>
                </Col>
              </Row>
            </Card>
          ))}
        </div>
      )}

      {/* ── Config Modal ─────────────────────────────────────────────────── */}
      <Modal
        open={modalVisible}
        title={editingPage && !isCreatingNew
          ? `Chỉnh sửa: ${editingPage.page_name}`
          : 'Thêm cấu hình Trang Facebook'}
        onCancel={() => setModalVisible(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editingPage && !isCreatingNew ? 'Lưu thay đổi' : 'Tạo cấu hình'}
        okButtonProps={{ style: { background: FB_BLUE } }}
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="page_name" label="Tên Trang Facebook" rules={[{ required: true, message: 'Vui lòng nhập tên' }]}>
            <Input placeholder="VD: Fanpage Nội Thất ABC" />
          </Form.Item>

          <Divider>⚙️ Cấu hình Ứng dụng Facebook</Divider>

          <Form.Item name="use_system_config" label="Sử dụng ứng dụng Facebook của Hệ thống" valuePropName="checked">
            <Switch
              checkedChildren="🟢 Dùng App hệ thống"
              unCheckedChildren="🔵 App riêng"
            />
          </Form.Item>

          {useSystemConfig === false && (
            <>
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12, borderRadius: 8 }}
                message="Bạn cần tự tạo App tại Meta Developers và nhập thông tin bên dưới."
              />
              <Form.Item name="app_id" label="Facebook App ID" rules={[{ required: true, message: 'Vui lòng nhập App ID' }]}>
                <Input placeholder="VD: 123456789012345" />
              </Form.Item>
              <Form.Item
                name="app_secret"
                label="Facebook App Secret"
                rules={[{ required: !editingPage || isCreatingNew, message: 'Vui lòng nhập App Secret' }]}
              >
                <Input.Password placeholder={editingPage && !isCreatingNew ? 'Để trống nếu không thay đổi' : 'Nhập App Secret...'} />
              </Form.Item>
              <Form.Item
                name="webhook_verify_token"
                label="Webhook Verify Token"
                tooltip="Chuỗi bí mật tự đặt, khai báo trùng trên Meta Developers"
              >
                <Input placeholder="VD: mysecret_2025" />
              </Form.Item>
            </>
          )}

          {useSystemConfig && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12, borderRadius: 8 }}
              message="Sẽ dùng App ID, App Secret và Webhook Verify Token do SuperAdmin cấu hình trong Cài đặt Hệ thống."
            />
          )}
          <Divider>✅ Trạng thái & Tính năng</Divider>
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item name="is_active" label="Trạng thái" valuePropName="checked">
                <Switch checkedChildren="Hoạt động" unCheckedChildren="Tạm dừng" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item
                name="auto_create_customer_from_phone"
                label="Tự tạo KH từ SĐT"
                valuePropName="checked"
                tooltip="Tự động tạo Khách hàng CRM khi phát hiện SĐT trong hội thoại"
              >
                <Switch checkedChildren="🤖 Tự động" unCheckedChildren="👆 Thủ công" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item
                name="auto_assign_lead_to_customer_assignee"
                label="Tự động gán hội thoại"
                valuePropName="checked"
                tooltip="Tự động gán hội thoại cho nhân viên phụ trách Khách hàng đó"
              >
                <Switch checkedChildren="🤖 Bật" unCheckedChildren="👆 Tắt" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item
                name="lead_cleanup_days"
                label="Dọn dẹp Lead rác"
                tooltip="Hội thoại không có SĐT và không tương tác sau số ngày này sẽ tự động bị ẩn vào kho lưu trữ (3:00 sáng hàng ngày)"
              >
                <InputNumber min={1} max={365} addonAfter="ngày" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider>🤖 Trợ lý AI (Giao việc tự động)</Divider>
          <Form.Item name="ai_agent" label="Chọn Trợ lý AI" help="Khi chọn một AI Agent, nó sẽ tự động nhận và trả lời tin nhắn mới của khách hàng trên trang này.">
            <Select allowClear placeholder="-- Không sử dụng Trợ lý AI --">
              {aiAgents.map(agent => (
                <Select.Option key={agent.id} value={agent.id}>{agent.name} ({agent.model_name})</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Divider>💬 Mẫu tin nhắn xin thông tin (Quick Reply 1 chạm)</Divider>
          <Form.Item
            name="request_phone_template"
            label="Lời nhắn xin SĐT (Mặc định)"
            tooltip="Mẫu tin nhắn sẽ gửi kèm nút 1 chạm xin SĐT từ Facebook Graph API"
          >
            <Input.TextArea rows={2} placeholder="Nhập lời nhắn xin số điện thoại..." />
          </Form.Item>
          <Form.Item
            name="request_email_template"
            label="Lời nhắn xin Email (Mặc định)"
            tooltip="Mẫu tin nhắn sẽ gửi kèm nút 1 chạm xin Email từ Facebook Graph API"
          >
            <Input.TextArea rows={2} placeholder="Nhập lời nhắn xin địa chỉ email..." />
          </Form.Item>

          {(editingPage && !isCreatingNew) && (
            <>
              <Divider>🔑 Cập nhật Token thủ công (nếu cần)</Divider>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12, borderRadius: 8 }}
                message='Khuyến nghị: Dùng nút "🔐 Đăng nhập Facebook" để lấy token tự động thay vì nhập tay.'
              />
              <Form.Item
                name="page_access_token"
                label="Page Access Token (thủ công)"
              >
                <Input.Password placeholder="Để trống nếu không cập nhật token" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      {/* ── Chọn Trang sau OAuth ─────────────────────────────────────────── */}
      <Modal
        open={selectPageModal}
        title={`🎉 Đăng nhập thành công! Chọn Trang Facebook để kết nối`}
        onCancel={() => setSelectPageModal(false)}
        footer={null}
        width={560}
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Bên dưới là danh sách các Trang Facebook mà tài khoản của bạn đang quản lý. Chọn trang muốn kết nối vào CRM.
        </Paragraph>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {oauthPages.map(pg => (
            <Card
              key={pg.id}
              hoverable
              style={{ borderRadius: 10, cursor: 'pointer' }}
              bodyStyle={{ padding: '14px 16px' }}
              onClick={() => handleSelectPage(pg)}
            >
              <Row align="middle" gutter={12}>
                <Col>
                  {pg.picture?.data?.url
                    ? <img src={pg.picture.data.url} style={{ width: 40, height: 40, borderRadius: 8 }} alt={pg.name} />
                    : <div style={{ width: 40, height: 40, borderRadius: 8, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: FB_BLUE, fontWeight: 900 }}>𝐟</div>
                  }
                </Col>
                <Col flex="auto">
                  <Text strong>{pg.name}</Text>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {pg.category} · ID: {pg.id}
                    {pg.fan_count != null && ` · ${pg.fan_count.toLocaleString()} người theo dõi`}
                  </div>
                </Col>
                <Col>
                  <Button type="primary" size="small" style={{ background: FB_BLUE, borderRadius: 14 }}>
                    Kết nối
                  </Button>
                </Col>
              </Row>
            </Card>
          ))}
        </div>
      </Modal>

      {/* ── Safe Delete Modal ─────────────────────────────────────────────────── */}
      <Modal
        open={deleteModal.open}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#dc2626' }}>
            <DeleteOutlined style={{ fontSize: 20 }} />
            <span>Xóa vĩnh viễn Trang Facebook</span>
          </div>
        }
        onCancel={() => setDeleteModal({ open: false, page: null })}
        footer={[
          <Button key="cancel" onClick={() => setDeleteModal({ open: false, page: null })}>
            Hủy bỏ
          </Button>,
          <Button
            key="confirm"
            danger
            type="primary"
            icon={<DeleteOutlined />}
            disabled={deleteConfirmText !== 'DELETE'}
            loading={deleting}
            onClick={handlePermanentDelete}
          >
            Xác nhận xóa vĩnh viễn
          </Button>,
        ]}
        width={500}
      >
        {deleteModal.page && (
          <div>
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
              message="Hành động này KHÔNG THỂ hoàn tác!"
              description={
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 2 }}>
                  <li>Toàn bộ <b>lịch sử hội thoại</b> với khách hàng từ trang này sẽ <b style={{ color: '#dc2626' }}>bị xóa sạch</b></li>
                  <li>Toàn bộ <b>tin nhắn, file đính kèm, ghi chú nội bộ</b> sẽ bị xóa</li>
                  <li>Các <b>khách hàng CRM được tạo từ trang này</b> sẽ không bị ảnh hưởng</li>
                </ul>
              }
            />

            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
            }}>
              <Text strong style={{ color: '#dc2626' }}>Trang sẽ bị xóa:</Text>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, background: '#1877f2',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 900, fontSize: 18, flexShrink: 0,
                }}>𝐟</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{deleteModal.page.page_name}</div>
                  {deleteModal.page.page_id && (
                    <div style={{ fontSize: 12, color: '#6b7280' }}>ID: {deleteModal.page.page_id}</div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <Text>Để xác nhận, hãy nhập chính xác <Text strong style={{ color: '#dc2626', fontSize: 15 }}>DELETE</Text> vào ô bên dưới:</Text>
            </div>
            <Input
              size="large"
              placeholder="Nhập DELETE để xác nhận"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value.toUpperCase())}
              style={{
                borderColor: deleteConfirmText === 'DELETE' ? '#10b981' : '#d1d5db',
                fontWeight: 700,
                letterSpacing: 2,
                textAlign: 'center',
              }}
              onPressEnter={() => deleteConfirmText === 'DELETE' && handlePermanentDelete()}
            />
            {deleteConfirmText.length > 0 && deleteConfirmText !== 'DELETE' && (
              <Text type="danger" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                ❌ Vui lòng nhập đúng: <b>DELETE</b>
              </Text>
            )}
            {deleteConfirmText === 'DELETE' && (
              <Text style={{ fontSize: 12, marginTop: 4, display: 'block', color: '#10b981' }}>
                ✅ Đã xác nhận — nhấn nút đỏ bên dưới để tiến hành xóa
              </Text>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
