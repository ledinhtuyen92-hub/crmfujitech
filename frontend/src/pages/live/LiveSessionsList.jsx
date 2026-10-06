import React, { useState, useEffect } from 'react'
import { Card, Typography, Button, Space, Drawer, Form, Select, Input, Radio, message, Spin, Row, Col, Empty } from 'antd'
import { PlusOutlined, SyncOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import StreamCard from './components/StreamCard'

const { Title, Text } = Typography

export default function LiveSessionsList() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Create Form State
  const [createVisible, setCreateVisible] = useState(false)
  const [editSession, setEditSession] = useState(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  
  // Dependencies for form
  const [deps, setDeps] = useState({
    devices: [],
    products: [],
    agents: [],
    accounts: []
  })

  // Watch form values for dynamic UI
  const platform = Form.useWatch('platform', form)
  const shopeeMode = Form.useWatch('shopee_connection_mode', form)

  const fetchSessions = async () => {
    setLoading(true)
    try {
      const res = await api.get('/live_sessions/sessions/')
      const data = Array.isArray(res.data) ? res.data : (res.data?.results || [])
      setSessions(data)
    } catch (err) {
      message.error('Lỗi khi tải danh sách phiên')
    } finally {
      setLoading(false)
    }
  }

  const fetchDependencies = async () => {
    try {
      const [devRes, prodRes, agtRes, accRes] = await Promise.all([
        api.get('/live_sessions/devices/').catch(() => ({ data: [] })),
        api.get('/inventory/products/').catch(() => ({ data: [] })),
        api.get('/ai_agents/agents/').catch(() => ({ data: [] })),
        api.get('/live_sessions/platform-accounts/').catch(() => ({ data: [] }))
      ])
      
      setDeps({
        devices: Array.isArray(devRes.data) ? devRes.data : (devRes.data?.results || []),
        products: Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data?.results || []),
        agents: Array.isArray(agtRes.data) ? agtRes.data : (agtRes.data?.results || []),
        accounts: Array.isArray(accRes.data) ? accRes.data : (accRes.data?.results || [])
      })
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchSessions()
    fetchDependencies()
  }, [])

  const handleAction = async (id, action) => {
    try {
      await api.post(`/live_sessions/sessions/${id}/${action}/`)
      message.success(`Đã gửi lệnh ${action} thành công`)
      fetchSessions()
    } catch (err) {
      const errorDetail = err.response?.data?.detail || err.response?.data?.error || `Lỗi khi thực hiện lệnh ${action}`
      message.error(errorDetail)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/live_sessions/sessions/${id}/`)
      message.success('Đã xóa phiên livestream')
      fetchSessions()
    } catch (err) {
      if (err.response?.status === 409) {
        message.error(err.response.data?.detail || 'Không thể xóa phiên livestream ở trạng thái này')
      } else {
        message.error('Lỗi khi xóa phiên livestream')
      }
    }
  }

  const handleEdit = (session) => {
    setEditSession(session)
    form.setFieldsValue({
      device: session.device,
      product: session.product,
      ai_agent: session.ai_agent,
      platform: session.platform,
      shopee_connection_mode: session.shopee_connection_mode,
      tiktok_connection_mode: session.tiktok_connection_mode,
    })
    
    // Parse stream_url into server_url and stream_key for manual RTMP modes
    if (session.stream_url) {
       const lastSlash = session.stream_url.lastIndexOf('/')
       if (lastSlash !== -1) {
          form.setFieldsValue({
            server_url: session.stream_url.substring(0, lastSlash),
            stream_key: session.stream_url.substring(lastSlash + 1)
          })
       } else {
          form.setFieldsValue({ stream_key: session.stream_url })
       }
    }
    
    setCreateVisible(true)
  }

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      
      // Transform payload slightly if needed
      const payload = { ...values }
      if (values.server_url && values.stream_key) {
        payload.stream_url = `${values.server_url.replace(/\/$/, '')}/${values.stream_key}`
        delete payload.server_url // Not accepted by backend model
      }
      
      // Map TikTok specific connection mode
      if (payload.platform === 'tiktok') {
        payload.tiktok_connection_mode = values.tiktok_connection_mode || 'manual_rtmp'
      }
      
      if (editSession) {
        await api.patch(`/live_sessions/sessions/${editSession.id}/`, payload)
        message.success('Đã cập nhật phiên Livestream thành công')
      } else {
        await api.post('/live_sessions/sessions/', payload)
        message.success('Đã tạo phiên Livestream thành công')
      }
      
      setCreateVisible(false)
      setEditSession(null)
      form.resetFields()
      fetchSessions()
    } catch (err) {
      if (err.errorFields) return // Validation error handled by antd
      message.error('Không thể tạo phiên Livestream')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: 24, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Quản lý Phiên Livestream</Title>
          <Text type="secondary">Thiết lập kịch bản, sản phẩm và điều khiển luồng phát</Text>
        </div>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchSessions}>Làm mới</Button>
          <Button type="primary" style={{ backgroundColor: '#1649c9' }} icon={<PlusOutlined />} onClick={() => {
            setEditSession(null)
            form.resetFields()
            setCreateVisible(true)
          }}>Tạo phiên mới</Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        {sessions.length === 0 && !loading ? (
          <Card style={{ borderRadius: 12 }}>
            <Empty description="Chưa có phiên livestream nào" />
          </Card>
        ) : (
          <Row gutter={[24, 24]}>
            {sessions.map(session => (
              <Col xs={24} sm={12} lg={8} xl={6} key={session.id}>
                <StreamCard 
                  session={session} 
                  onStart={(id) => handleAction(id, 'start')}
                  onStop={(id) => handleAction(id, 'stop')}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                />
              </Col>
            ))}
          </Row>
        )}
      </Spin>

      <Drawer
        title={editSession ? "Chỉnh Sửa Phiên Livestream" : "Tạo Phiên Livestream Mới"}
        width={600}
        onClose={() => {
          setCreateVisible(false)
          setEditSession(null)
          form.resetFields()
        }}
        open={createVisible}
        extra={
          <Space>
            <Button onClick={() => {
              setCreateVisible(false)
              setEditSession(null)
              form.resetFields()
            }}>Hủy</Button>
            <Button type="primary" style={{ backgroundColor: '#1649c9' }} onClick={handleCreate} loading={submitting}>
              {editSession ? "Lưu Thay Đổi" : "Tạo Phiên"}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Card size="small" title="Cấu hình Nội dung" style={{ marginBottom: 24, borderRadius: 8 }}>
            <Form.Item name="device" label="Máy chủ phát sóng (Live Studio Device)" rules={[{ required: true }]}>
              <Select placeholder="Chọn máy chủ Windows">
                {deps.devices.map(d => (
                  <Select.Option key={d.id} value={d.id}>
                    <Space>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: d.is_online ? '#52c41a' : '#f5222d' }} />
                      {d.name} {d.is_online ? '(Đang bật)' : '(Đang tắt)'}
                    </Space>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="product" label="Sản phẩm trung tâm" rules={[{ required: true }]}>
              <Select placeholder="Chọn sản phẩm">
                {deps.products.map(p => <Select.Option key={p.id} value={p.id}>{p.code} - {p.name}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="ai_agent" label="AI Agent (Host/Kịch bản)" rules={[{ required: true }]}>
              <Select placeholder="Chọn AI Agent">
                {deps.agents.map(a => <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>)}
              </Select>
            </Form.Item>
          </Card>
          
          <Card size="small" title="Cấu hình Nền tảng (Platform)" style={{ borderRadius: 8 }}>
            <Form.Item name="platform" label="Nền tảng đích" rules={[{ required: true }]}>
              <Select placeholder="Chọn nền tảng">
                <Select.Option value="shopee">Shopee Live</Select.Option>
                <Select.Option value="tiktok">TikTok Live</Select.Option>
                <Select.Option value="custom">Nền tảng khác (Custom RTMP)</Select.Option>
              </Select>
            </Form.Item>

            {platform === 'shopee' && (
              <>
                <Form.Item name="shopee_connection_mode" label="Chế độ kết nối Shopee" rules={[{ required: true }]} initialValue="api">
                  <Radio.Group style={{ width: '100%' }}>
                    <Radio.Button value="api" style={{ width: '50%', textAlign: 'center' }}>API (Tự động)</Radio.Button>
                    <Radio.Button value="manual_rtmp" style={{ width: '50%', textAlign: 'center' }}>RTMP (Thủ công)</Radio.Button>
                  </Radio.Group>
                </Form.Item>

                {shopeeMode === 'api' && (
                  <Form.Item name="platform_account" label="Tài khoản Shopee" rules={[{ required: true }]}>
                    {deps.accounts.filter(a => a.platform === 'shopee').length > 0 ? (
                      <Select placeholder="Chọn tài khoản đã kết nối">
                        {deps.accounts.filter(a => a.platform === 'shopee').map(a => (
                          <Select.Option key={a.id} value={a.id}>{a.display_name} ({a.status})</Select.Option>
                        ))}
                      </Select>
                    ) : (
                      <div style={{ padding: 12, backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4 }}>
                        <Text type="warning">Chưa có tài khoản Shopee nào được kết nối. Vui lòng kết nối trong phần Cài Đặt hoặc chuyển sang chế độ <b>RTMP (Thủ công)</b> để kiểm thử Local.</Text>
                      </div>
                    )}
                  </Form.Item>
                )}

                {shopeeMode === 'manual_rtmp' && (
                  <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, border: '1px solid #f0f0f0' }}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                      Vui lòng nhập Server URL và Stream Key được cung cấp từ Shopee Live PC (có thể bỏ trống nếu chỉ muốn tạo phiên để kiểm thử):
                    </Text>
                    <Form.Item name="server_url" label="Server URL">
                      <Input placeholder="rtmp://..." />
                    </Form.Item>
                    <Form.Item name="stream_key" label="Stream Key">
                      <Input.Password placeholder="Nhập mã bảo mật (Stream Key)" />
                    </Form.Item>
                  </div>
                )}
              </>
            )}
            
            {platform === 'tiktok' && (
              <>
                <Form.Item name="tiktok_connection_mode" label="Chế độ phát sóng TikTok" rules={[{ required: true }]} initialValue="manual_rtmp">
                  <Radio.Group style={{ width: '100%' }}>
                    <Radio.Button value="manual_rtmp" style={{ width: '100%', textAlign: 'center' }}>TikTok LIVE Studio / External Source</Radio.Button>
                  </Radio.Group>
                </Form.Item>
                <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, border: '1px solid #f0f0f0' }}>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                    API TikTok hiện chưa hỗ trợ lấy luồng tự động. Vui lòng mở TikTok LIVE Studio hoặc giao diện Web, chọn <b>Phát qua phần mềm (External Source)</b> và nhập thông số (có thể bỏ trống nếu chỉ muốn tạo phiên để kiểm thử):
                  </Text>
                  <Form.Item name="server_url" label="Server URL">
                    <Input placeholder="rtmp://..." />
                  </Form.Item>
                  <Form.Item name="stream_key" label="Stream Key">
                    <Input.Password placeholder="Nhập mã bảo mật (Stream Key)" />
                  </Form.Item>
                </div>
              </>
            )}

            {platform === 'custom' && (
              <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, border: '1px solid #f0f0f0' }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                  Vui lòng nhập RTMP Server URL và Stream Key (có thể bỏ trống nếu chỉ muốn tạo phiên để kiểm thử):
                </Text>
                <Form.Item name="server_url" label="RTMP Server URL">
                  <Input placeholder="rtmp://..." />
                </Form.Item>
                <Form.Item name="stream_key" label="Stream Key">
                  <Input.Password placeholder="Stream Key" />
                </Form.Item>
              </div>
            )}
          </Card>
        </Form>
      </Drawer>
    </div>
  )
}
