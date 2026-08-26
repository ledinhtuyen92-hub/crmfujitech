import { useState, useEffect } from 'react'
import {
  Alert, Button, Card, Col, Collapse, Divider, Form, Input, InputNumber,
  message, Modal, Popconfirm, Row, Select, Space, Switch, Table, Tag, Tooltip, Typography
} from 'antd'
import {
  ApiOutlined, CheckCircleOutlined, CloseCircleOutlined,
  DeleteOutlined, DisconnectOutlined, HistoryOutlined, InfoCircleOutlined, KeyOutlined,
  ReloadOutlined, SettingOutlined, WarningOutlined,
} from '@ant-design/icons'
import api from '../../utils/api'
import { useAuth } from '../../contexts/AuthContext'
import { useResponsive } from '../../hooks/useResponsive'

const { Title, Text, Paragraph } = Typography

export default function ZaloConfigPage() {
  const { maintenanceMode } = useAuth()
  const { isMobile } = useResponsive()
  const [configs, setConfigs] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ open: false, config: null })
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [aiAgents, setAiAgents] = useState([])
  const [tokenLogs, setTokenLogs] = useState([])
  const [tokenLogsLoading, setTokenLogsLoading] = useState(false)
  const [form] = Form.useForm()

  const fetchConfig = async (preferredId = null) => {
    setLoading(true)
    try {
      const res = await api.get('/zalo/config/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setConfigs(data)
      if (data.length > 0) {
        setConfig(prev => {
          const targetId = preferredId ? Number(preferredId) : prev?.id
          return data.find(item => item.id === targetId) || data[0]
        })
      } else {
        setConfig(null)
      }
    } catch (error) {
      console.error(error)
      message.error('Không thể tải cấu hình Zalo.')
    }
    finally { setLoading(false) }
  }

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const stateConfigId = urlParams.get('state') || localStorage.getItem('zalo_oauth_config_id')
    if (code) {
      window.history.replaceState({}, document.title, window.location.pathname)
      localStorage.removeItem('zalo_oauth_config_id')
      setLoading(true)
      api.post('/zalo/config/exchange-oauth-code/', { code, config_id: stateConfigId })
        .then((res) => {
          message.success(res.data?.detail || 'Đăng nhập và cấp quyền Zalo thành công!')
          fetchConfig(stateConfigId || res.data?.data?.id)
        })
        .catch((err) => {
          message.error(err.response?.data?.error || 'Lỗi khi đổi mã xác thực Zalo.')
          fetchConfig(stateConfigId)
        })
    } else {
      fetchConfig()
    }
    api.get('ai_agents/agents/')
      .then(res => setAiAgents(Array.isArray(res.data) ? res.data : res.data?.results ?? []))
      .catch(console.error)
  }, [])

  const fetchTokenLogs = async (configId) => {
    if (!configId) return
    setTokenLogsLoading(true)
    try {
      const res = await api.get(`/zalo/config/${configId}/token-logs/`)
      setTokenLogs(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.error(err)
      message.error('Không thể tải lịch sử refresh token.')
    } finally {
      setTokenLogsLoading(false)
    }
  }

  const handleZaloOAuthLogin = (targetConfig = null) => {
    const cfg = targetConfig && targetConfig.id ? targetConfig : config
    const appId = cfg?.resolved_app_id || cfg?.app_id
    if (!appId) {
      message.warning('Vui lòng lưu cấu hình App ID (hoặc dùng cấu hình hệ thống) trước khi bấm Uỷ quyền.')
      return
    }
    if (cfg?.id) {
      localStorage.setItem('zalo_oauth_config_id', cfg.id)
    }
    const redirectUri = window.location.origin + window.location.pathname
    const oauthUrl = `https://oauth.zaloapp.com/v4/oa/permission?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${cfg?.id || ''}`
    window.location.href = oauthUrl
  }

  const handleOpenModal = (targetConfig = null, isNew = false) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    const createNew = isNew || !targetConfig
    setIsCreatingNew(createNew)
    if (!createNew && targetConfig && targetConfig.id) {
      setConfig(targetConfig)
      form.setFieldsValue({
        use_system_config: targetConfig.use_system_config,
        oa_name: targetConfig.oa_name,
        app_id: targetConfig.app_id,
        oa_id: targetConfig.oa_id,
        secret_key: targetConfig.secret_key,
        webhook_secret: targetConfig.webhook_secret,
        access_token: targetConfig.access_token,
        refresh_token: targetConfig.refresh_token,
        auto_send_payment_zns: targetConfig.auto_send_payment_zns,
        auto_send_delivery_zns: targetConfig.auto_send_delivery_zns,
        auto_send_birthday_zns: targetConfig.auto_send_birthday_zns,
        auto_create_customer_from_phone: targetConfig.auto_create_customer_from_phone || false,
        auto_assign_lead_to_customer_assignee: targetConfig.auto_assign_lead_to_customer_assignee ?? true,
        lead_cleanup_days: targetConfig.lead_cleanup_days,
        request_phone_template: targetConfig.request_phone_template,
        request_email_template: targetConfig.request_email_template,
        ai_agent: targetConfig.ai_agent,
        is_active: targetConfig.is_active,
      })
    } else {
      setConfig(null)
      form.resetFields()
      form.setFieldsValue({
        use_system_config: true,
        auto_send_payment_zns: false,
        auto_send_delivery_zns: false,
        auto_send_birthday_zns: false,
        auto_create_customer_from_phone: false,
        auto_assign_lead_to_customer_assignee: true,
        lead_cleanup_days: 30,
        request_phone_template: "Vui lòng chia sẻ số điện thoại để chúng tôi có thể liên hệ hỗ trợ tốt nhất.",
        request_email_template: "Xin chào quý khách! Để thuận tiện gửi thông tin và tài liệu, xin vui lòng chia sẻ địa chỉ Email của quý khách tại đây ạ.",
        ai_agent: null,
        is_active: true,
      })
    }
    setModalVisible(true)
  }

  const useSystemConfig = Form.useWatch('use_system_config', form)

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (config && !isCreatingNew) {
        await api.patch(`/zalo/config/${config.id}/`, values)
        message.success('Cập nhật cấu hình Zalo thành công!')
      } else {
        await api.post('/zalo/config/', values)
        message.success('Thêm Zalo OA thành công!')
      }
      setModalVisible(false)
      fetchConfig()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Lỗi khi lưu cấu hình.')
    } finally { setSaving(false) }
  }

  const [verifying, setVerifying] = useState(false)

  const handleVerifyToken = async (targetConfig = null) => {
    const cfg = targetConfig && targetConfig.id ? targetConfig : config
    if (!cfg) return
    setVerifying(true)
    try {
      const res = await api.post(`/zalo/config/${cfg.id}/verify-token/`)
      Modal.success({
        title: 'Xác thực chuẩn Token Zalo OA',
        content: (
          <div style={{ marginTop: 12 }}>
            <p><b>Tên OA thực tế từ Zalo:</b> {res.data?.oa_info?.name}</p>
            <p><b>OA ID trên Zalo:</b> {res.data?.oa_info?.oa_id}</p>
            <p style={{ color: '#16a34a' }}>✅ Token đang kết nối chuẩn xác với trang Zalo OA này!</p>
          </div>
        )
      })
      fetchConfig()
    } catch (err) {
      message.error(err.response?.data?.error || 'Token không hợp lệ hoặc đã hết hạn trên Zalo.')
    } finally {
      setVerifying(false)
    }
  }

  const handleRefreshToken = async (targetConfig = null) => {
    const cfg = targetConfig && targetConfig.id ? targetConfig : config
    if (!cfg) return
    setRefreshing(true)
    try {
      await api.post(`/zalo/config/${cfg.id}/refresh-token/`)
      message.success('Token đã được làm mới!')
      fetchConfig()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Không thể làm mới token. Vui lòng bấm Đăng nhập & Lấy Token tự động.')
    } finally { setRefreshing(false) }
  }

  const handleDisconnect = async (id) => {
    try {
      await api.delete(`/zalo/config/${id}/`)
      message.success('Đã ngắt kết nối Zalo OA. Lịch sử hội thoại & tin nhắn được bảo vệ an toàn!')
      fetchConfig()
    } catch { message.error('Không thể ngắt kết nối Zalo OA này.') }
  }

  const handleReconnect = async (id) => {
    try {
      await api.post(`/zalo/config/${id}/reconnect/`)
      message.success('Đã khôi phục kết nối và kích hoạt lại Zalo OA!')
      fetchConfig()
    } catch { message.error('Lỗi khi khôi phục kết nối.') }
  }

  const openDeleteModal = (cfg) => {
    setDeleteModal({ open: true, config: cfg })
    setDeleteConfirmText('')
  }

  const handlePermanentDelete = async () => {
    const { config: cfg } = deleteModal
    if (!cfg) return
    setDeleting(true)
    try {
      await api.delete(`/zalo/config/${cfg.id}/permanent-delete/`)
      message.success(`Đã xoá vĩnh viễn Zalo OA "${cfg.oa_name}" và toàn bộ dữ liệu liên quan.`)
      setDeleteModal({ open: false, config: null })
      fetchConfig()
    } catch { message.error('Lỗi khi xoá vĩnh viễn. Vui lòng thử lại.') }
    finally { setDeleting(false) }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', overflowX: 'hidden', padding: isMobile ? '0 8px' : 0 }}>
      <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={14}>
          <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <ApiOutlined style={{ color: '#0068ff' }} />
            <span>Cấu hình Zalo OA</span>
          </Title>
          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>Kết nối Official Account Zalo để nhận Lead và gửi ZNS tự động</Text>
        </Col>
        <Col xs={24} md={10} style={{ display: 'flex', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
          <Space wrap>
            <Button
              type="primary"
              icon={<SettingOutlined />}
              onClick={() => handleOpenModal(null, true)}
              style={{ background: '#0068ff', borderColor: '#0068ff', borderRadius: 16 }}
            >
              + Thêm Zalo OA mới
            </Button>
          </Space>
        </Col>
      </Row>

      {configs.length === 0 && !loading ? (
        <Card style={{ textAlign: 'center', padding: '40px 20px', borderRadius: 12 }}>
          <ApiOutlined style={{ fontSize: 48, color: '#d1d5db', marginBottom: 16, display: 'block' }} />
          <Title level={5} style={{ color: '#6b7280' }}>Chưa kết nối Zalo OA</Title>
          <Paragraph type="secondary" style={{ maxWidth: 400, margin: '0 auto 20px' }}>
            Kết nối Zalo Official Account để bắt đầu nhận Lead tự động từ Zalo và gửi thông báo ZNS đến khách hàng.
          </Paragraph>
          <Button type="primary" icon={<ApiOutlined />} onClick={() => handleOpenModal(null, true)}
            style={{ background: '#0068ff', borderColor: '#0068ff' }}>
            Kết nối ngay
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {configs.map(item => (
            <Card
              key={item.id}
              style={{
                borderRadius: 12,
                border: item.is_active ? '1px solid #bbf7d0' : '1px solid #fed7aa',
              }}
              bodyStyle={{ padding: '20px 24px' }}
            >
              <Row align="middle" gutter={[16, 16]}>
                <Col xs={24} md={12} lg={14}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12,
                      background: item.is_active ? '#dcfce7' : '#fef3c7',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      {item.is_active
                        ? <CheckCircleOutlined style={{ fontSize: 24, color: '#16a34a' }} />
                        : <CloseCircleOutlined style={{ fontSize: 24, color: '#d97706' }} />
                      }
                    </div>
                    <div style={{ flex: 1 }}>
                      <Text strong style={{ fontSize: 16 }}>{item.oa_name}</Text>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <Tag color={item.is_active ? 'success' : 'warning'} style={{ margin: 0 }}>
                          {item.is_active ? '✅ Đang chạy' : '⚠️ Đã ngắt'}
                        </Tag>
                        {item.is_token_near_expiry && (
                          <Tag color="error" icon={<WarningOutlined />} style={{ margin: 0 }}>Sắp hết hạn!</Tag>
                        )}
                        {item.oa_id && <Tag color="blue" style={{ margin: 0 }}>ID: {item.oa_id}</Tag>}
                        {item.use_system_config
                          ? <Tag color="purple" style={{ margin: 0 }}>🔧 App chung</Tag>
                          : <Tag color="orange" style={{ margin: 0 }}>⚙️ App riêng</Tag>}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 8, background: '#f1f5f9', padding: '4px 10px', borderRadius: 6, width: 'fit-content' }}>
                        {item.token_expires_at_display ? `⏳ Hạn token: ${item.token_expires_at_display}` : 'Chưa có Token'}
                      </div>
                    </div>
                  </div>
                </Col>
                <Col xs={24} md={12} lg={10}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: isMobile ? 'flex-start' : 'flex-end', borderTop: isMobile ? '1px dashed #e2e8f0' : 'none', paddingTop: isMobile ? 12 : 0 }}>
                    {item.is_active ? (
                      <>
                        <Tooltip title="Đăng nhập Zalo và tự động lấy Access Token cho OA này">
                          <Button
                            type="primary"
                            onClick={() => handleZaloOAuthLogin(item)}
                            style={{ background: '#0068ff', borderColor: '#0068ff' }}
                          >
                            Lấy Token
                          </Button>
                        </Tooltip>
                        <Button
                          onClick={() => handleVerifyToken(item)}
                          loading={verifying}
                          icon={<InfoCircleOutlined />}
                        >
                          Kiểm tra OA
                        </Button>
                        <Button
                          icon={<ReloadOutlined />}
                          loading={refreshing}
                          onClick={() => handleRefreshToken(item)}
                        >
                          Làm mới
                        </Button>
                        <Button icon={<SettingOutlined />} onClick={() => handleOpenModal(item, false)}>
                          Sửa
                        </Button>
                        <Popconfirm
                          title={
                            <div style={{ maxWidth: 280 }}>
                              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Xác nhận ngắt kết nối?</div>
                              <div style={{ fontSize: 13, color: '#555' }}>
                                Zalo OA sẽ bị <b>tạm dừng nhận tin nhắn mới</b>, nhưng <b style={{ color: '#10b981' }}>toàn bộ lịch sử hội thoại được giữ nguyên</b>. Có thể khôi phục lại.
                              </div>
                            </div>
                          }
                          onConfirm={() => handleDisconnect(item.id)}
                          okText="Ngắt kết nối" cancelText="Hủy" okType="warning"
                          icon={null}
                        >
                          <Tooltip title="Tạm ngắt kết nối — lịch sử tin nhắn được bảo toàn">
                            <Button danger icon={<DisconnectOutlined />}>Ngắt kết nối</Button>
                          </Tooltip>
                        </Popconfirm>
                      </>
                    ) : (
                      <>
                        <Button
                          type="primary"
                          icon={<ReloadOutlined />}
                          onClick={() => handleReconnect(item.id)}
                          style={{ background: '#10b981', borderColor: '#10b981' }}
                        >
                          Khôi phục
                        </Button>
                        <Button
                          type="primary"
                          onClick={() => handleZaloOAuthLogin(item)}
                          style={{ background: '#0068ff', borderColor: '#0068ff' }}
                        >
                          Lấy Token
                        </Button>
                        <Button icon={<SettingOutlined />} onClick={() => handleOpenModal(item, false)}>
                          Sửa
                        </Button>
                        <Tooltip title="Xóa vĩnh viễn — mất toàn bộ lịch sử hội thoại, KHÔNG khôi phục được">
                          <Button danger icon={<DeleteOutlined />} onClick={() => openDeleteModal(item)}>
                            Xóa vĩnh viễn
                          </Button>
                        </Tooltip>
                      </>
                    )}
                  </div>
                </Col>
              </Row>
            </Card>
          ))}

          {/* Hướng dẫn & Webhook chung cho hệ thống */}
          <Alert
            type="info"
            showIcon
            style={{ padding: isMobile ? '8px 12px' : '8px 15px', overflow: 'hidden' }}
            message="Cấu hình Callback URL & Webhook trên Zalo Developers"
            description={
              <div>
                <div>1. <b>Official Account Callback Url (Để Đăng nhập lấy Token tự động):</b></div>
                <div style={{ marginTop: 4, marginBottom: 12, background: '#f3f4f6', padding: '6px 12px', borderRadius: 6, display: 'block', fontWeight: 600, color: '#1f2937', wordBreak: 'break-all' }}>
                  {window.location.origin + window.location.pathname}
                </div>
                <div>2. <b>URL Webhook (Để Zalo đẩy tin nhắn về CRM khi khách chat):</b></div>
                <Text code style={{ display: 'block', marginTop: 4, wordBreak: 'break-all' }}>
                  {window.location.origin}/api/zalo/webhook/
                </Text>
              </div>
            }
          />

          {/* Lịch sử Refresh Token */}
          <Collapse
            style={{ marginTop: 16 }}
            items={[{
              key: 'token-logs',
              label: <span><HistoryOutlined style={{ marginRight: 6 }} />Lịch sử Refresh Token {config ? `— ${config.oa_name}` : ''} (30 lần gần nhất)</span>,
              children: (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {configs.length > 1 && (
                      <Select
                        size="small"
                        value={config?.id}
                        onChange={(id) => {
                          const selected = configs.find(c => c.id === id)
                          if (selected) {
                            setConfig(selected)
                            fetchTokenLogs(id)
                          }
                        }}
                        style={{ minWidth: 200 }}
                      >
                        {configs.map(c => (
                          <Select.Option key={c.id} value={c.id}>{c.oa_name}</Select.Option>
                        ))}
                      </Select>
                    )}
                    {config && (
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => fetchTokenLogs(config.id)}
                        loading={tokenLogsLoading}
                      >
                        Tải lại
                      </Button>
                    )}
                  </div>
                  <Table
                    dataSource={tokenLogs}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: 'Chưa có log. Bấm "Tải lại" để xem.' }}
                    columns={[
                      {
                        title: 'Thời gian',
                        dataIndex: 'created_at',
                        width: 160,
                        render: v => v ? new Date(v).toLocaleString('vi-VN') : '-',
                      },
                      {
                        title: 'Kết quả',
                        dataIndex: 'status',
                        width: 110,
                        render: v => v === 'success'
                          ? <Tag color="success"><CheckCircleOutlined /> Thành công</Tag>
                          : <Tag color="error"><CloseCircleOutlined /> Thất bại</Tag>,
                      },
                      {
                        title: 'Nguồn',
                        dataIndex: 'trigger_display',
                        width: 150,
                        render: (v, r) => {
                          const colors = { auto: 'blue', manual: 'green', oauth: 'purple' }
                          return <Tag color={colors[r.trigger] || 'default'}>{v}</Tag>
                        },
                      },
                      {
                        title: 'Hạn cũ',
                        dataIndex: 'old_expires_at',
                        width: 160,
                        render: v => v ? new Date(v).toLocaleString('vi-VN') : '',
                      },
                      {
                        title: 'Hạn mới',
                        dataIndex: 'new_expires_at',
                        width: 160,
                        render: v => v ? new Date(v).toLocaleString('vi-VN') : '',
                      },
                      {
                        title: 'Lỗi',
                        dataIndex: 'error_message',
                        ellipsis: true,
                        render: v => v ? <Text type="danger" style={{ fontSize: 12 }}>{v}</Text> : '',
                      },
                    ]}
                  />
                </div>
              ),
            }]}
            onChange={(keys) => {
              if (keys.includes('token-logs') && config && tokenLogs.length === 0) {
                fetchTokenLogs(config.id)
              }
            }}
          />
        </div>
      )}

      {/* Modal Form */}
      <Modal
        title={
          <Space>
            <SettingOutlined style={{ color: '#0068ff' }} />
            {config ? 'Chỉnh sửa cấu hình Zalo OA' : 'Kết nối Zalo Official Account'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSave}
        okText="Lưu cấu hình"
        cancelText="Huỷ"
        confirmLoading={saving}
        width={560}
        okButtonProps={{ style: { background: '#0068ff', borderColor: '#0068ff' } }}
      >
        <Form form={form} layout="vertical">
          <Alert
            type={useSystemConfig ? "success" : "info"}
            showIcon
            style={{ marginBottom: 20, borderRadius: 8, fontWeight: 500 }}
            message={useSystemConfig ? "Bạn đang dùng Cấu hình Zalo App dùng chung của hệ thống. Bạn không cần phải tạo Zalo App riêng." : "Bạn đang tự cấu hình App riêng. Hãy lấy App ID và Secret Key từ trang developers.zalo.me"}
          />
          <Form.Item name="use_system_config" valuePropName="checked">
            <Switch 
              checkedChildren="Dùng cấu hình hệ thống (Khuyên dùng)" 
              unCheckedChildren="Tự cấu hình App riêng" 
              style={{ width: '100%' }} 
              onChange={(checked) => {
                if (checked) {
                  form.setFieldsValue({
                    app_id: '',
                    secret_key: '',
                    webhook_secret: '',
                  })
                }
              }}
            />
          </Form.Item>
          <Form.Item name="oa_name" label="Tên Zalo OA" rules={[{ required: true, message: 'Vui lòng nhập tên OA' }]}>
            <Input placeholder="VD: Mộc Lê Gia Official" prefix={<ApiOutlined />} size="large" />
          </Form.Item>
          
          <div style={{ background: useSystemConfig ? '#f3f4f6' : 'transparent', padding: useSystemConfig ? 16 : 0, borderRadius: 8, marginBottom: 16 }}>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name="app_id" label="App ID" rules={[{ required: !useSystemConfig, message: 'Bắt buộc' }]}>
                  <Input placeholder={useSystemConfig ? "Hệ thống tự điền" : "App ID từ Zalo Dev"} disabled={useSystemConfig} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="oa_id" label="OA ID (Official Account ID)">
                  <Input placeholder="Nhập để xác thực tin nhắn đúng OA" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="secret_key"
              label={<span>App Secret Key <Text type="secondary" style={{ fontSize: 11 }}>{useSystemConfig ? '(Hệ thống tự điền)' : '(để trống nếu không đổi)'}</Text></span>}
            >
              <Input.Password placeholder={useSystemConfig ? "Hệ thống tự điền" : "Nhập Secret Key..."} prefix={<KeyOutlined />} disabled={useSystemConfig} />
            </Form.Item>
            <Form.Item name="webhook_secret" label={<span>Webhook Secret <Tooltip title="Dùng để bảo mật Webhook"><InfoCircleOutlined /></Tooltip></span>}>
              <Input.Password placeholder={useSystemConfig ? "Hệ thống tự điền" : "Webhook secret (tùy chọn)"} disabled={useSystemConfig} />
            </Form.Item>
          </div>

          <Collapse
            ghost
            items={[
              {
                key: '1',
                label: <Text type="secondary" style={{ fontSize: 13, fontWeight: 600 }}>⚙️ Token thủ công (Dành cho Developer)</Text>,
                children: (
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px dashed #cbd5e1' }}>
                    <Form.Item name="access_token" label="Access Token thủ công" style={{ marginBottom: 12 }}>
                      <Input.TextArea rows={2} placeholder="Nhập Access Token (nếu có)" />
                    </Form.Item>
                    <Form.Item name="refresh_token" label="Refresh Token thủ công" style={{ marginBottom: 0 }}>
                      <Input.TextArea rows={2} placeholder="Nhập Refresh Token" />
                    </Form.Item>
                  </div>
                ),
              },
            ]}
          />

          <Divider orientation="left" plain>Cấu hình Tự động & Dọn dẹp</Divider>
          <Form.Item name="auto_send_payment_zns" label="Tự động gửi ZNS khi Thu tiền" valuePropName="checked">
            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
          </Form.Item>
          <Form.Item name="auto_send_delivery_zns" label="Tự động gửi ZNS khi Hoàn thành đơn" valuePropName="checked">
            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
          </Form.Item>
          <Form.Item name="auto_send_birthday_zns" label="Tự động gửi ZNS chúc mừng sinh nhật" valuePropName="checked" help="Chạy tự động lúc 08:00 sáng mỗi ngày.">
            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
          </Form.Item>
          <Form.Item 
            name="auto_create_customer_from_phone" 
            label="Tự động quét & tạo Khách hàng khi phát hiện SĐT" 
            valuePropName="checked"
            help="Nếu bật: Khi khách gửi SĐT trong Zalo Inbox sẽ tự động thêm vào Khách hàng hệ thống."
          >
            <Switch checkedChildren="Bật tự động" unCheckedChildren="Tắt (Sale thêm thủ công)" />
          </Form.Item>
          <Form.Item 
            name="auto_assign_lead_to_customer_assignee" 
            label="Tự động gán hội thoại theo Nhân viên phụ trách" 
            valuePropName="checked"
            help="Nếu bật: Khi hội thoại gắn với một Khách hàng đã có nhân viên phụ trách, hội thoại sẽ tự động gán cho nhân viên đó."
          >
            <Switch checkedChildren="Bật tự động" unCheckedChildren="Tắt" />
          </Form.Item>
          <Form.Item
            name="lead_cleanup_days"
            label="Số ngày dọn dẹp Lead rác"
            rules={[{ required: true, message: 'Vui lòng nhập số ngày' }]}
            help="SocialLead không tương tác sau số ngày này sẽ bị ẩn (archived)."
          >
            <InputNumber min={1} max={365} style={{ width: '100%' }} suffix="ngày" />
          </Form.Item>

          <Divider style={{ margin: '12px 0' }} />
          <Text strong style={{ fontSize: 13, color: '#1e293b', display: 'block', marginBottom: 12 }}>💬 Mẫu tin nhắn xin SĐT & Email (Gửi khi bấm nút trong Zalo Inbox)</Text>
          <Form.Item
            name="request_phone_template"
            label="Mẫu tin nhắn xin Số điện thoại"
            help="Sẽ được dùng làm nội dung gửi kèm khi nhân viên bấm nút xin SĐT trong khung chat."
          >
            <Input.TextArea rows={2} placeholder="Vui lòng chia sẻ số điện thoại để chúng tôi có thể liên hệ hỗ trợ tốt nhất." />
          </Form.Item>
          <Form.Item
            name="request_email_template"
            label="Mẫu tin nhắn xin Email"
            help="Sẽ được dùng khi nhân viên bấm nút xin Email trong khung chat."
          >
            <Input.TextArea rows={2} placeholder="Xin chào quý khách! Để thuận tiện gửi thông tin và tài liệu, xin vui lòng chia sẻ địa chỉ Email của quý khách tại đây ạ." />
          </Form.Item>

          <Divider />
          <Form.Item name="ai_agent" label="🤖 Giao việc cho Trợ lý AI (Tuỳ chọn)" help="Chọn một AI Agent để tự động trả lời khách hàng trên Zalo OA này.">
            <Select allowClear placeholder="-- Không dùng AI --">
              {aiAgents.map(agent => (
                <Select.Option key={agent.id} value={agent.id}>{agent.name} ({agent.model_name})</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Divider />
          <Form.Item name="is_active" label="Trạng thái" valuePropName="checked">
            <Switch checkedChildren="Hoạt động" unCheckedChildren="Tạm dừng" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal xác nhận xóa vĩnh viễn Zalo OA */}
      <Modal
        title={
          <Space style={{ color: '#dc2626' }}>
            <WarningOutlined />
            <span>Xác nhận xóa vĩnh viễn Zalo OA</span>
          </Space>
        }
        open={deleteModal.open}
        onCancel={() => setDeleteModal({ open: false, config: null })}
        footer={[
          <Button key="cancel" onClick={() => setDeleteModal({ open: false, config: null })}>
            Hủy bỏ
          </Button>,
          <Button
            key="submit"
            type="primary"
            danger
            icon={<DeleteOutlined />}
            loading={deleting}
            disabled={deleteConfirmText !== deleteModal.config?.oa_name}
            onClick={handlePermanentDelete}
          >
            Xóa vĩnh viễn không khôi phục
          </Button>,
        ]}
      >
        <Alert
          type="error"
          showIcon
          message="Hành động này KHÔNG THỂ khôi phục!"
          description={
            <div>
              Trang Zalo OA <b>{deleteModal.config?.oa_name}</b> sẽ bị xóa khỏi hệ thống SaaS, cùng toàn bộ:
              <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                <li>Lịch sử hội thoại Zalo</li>
                <li>Toàn bộ tin nhắn Zalo đã lưu</li>
                <li>Các cài đặt ZNS tự động</li>
              </ul>
              Nếu bạn chỉ muốn tạm dừng, hãy chọn <b>Ngắt kết nối</b>.
            </div>
          }
          style={{ marginBottom: 16 }}
        />
        <div>
          <Text>Để xác nhận, vui lòng nhập chính xác tên OA:</Text>
          <div style={{ fontWeight: 700, margin: '6px 0', color: '#111', background: '#f3f4f6', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
            {deleteModal.config?.oa_name}
          </div>
          <Input
            placeholder={`Nhập "${deleteModal.config?.oa_name}" để xác nhận...`}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            style={{ marginTop: 6 }}
            status={deleteConfirmText && deleteConfirmText !== deleteModal.config?.oa_name ? 'error' : ''}
          />
        </div>
      </Modal>
    </div>
  )
}
