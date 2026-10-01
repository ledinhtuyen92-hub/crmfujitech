import React, { useState, useEffect } from 'react'
import { Card, Typography, Button, Table, Tag, Space, message, Row, Col, Drawer, Form, Select, Input, Radio } from 'antd'
import { VideoCameraOutlined, PlusOutlined, PlayCircleOutlined, PauseCircleOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons'
import api from '../../utils/api'

const { Title, Text } = Typography

// ─── Status Utilities ────────────────────────────────────────────────────────
const getStatusColor = (status) => {
  switch (status) {
    case 'running': return 'green'
    case 'paused': return 'orange'
    case 'human_takeover': return 'purple'
    case 'stopped': return 'red'
    case 'ready': return 'blue'
    case 'error': return 'magenta'
    default: return 'default'
  }
}

const getStatusText = (status) => {
  switch (status) {
    case 'draft': return 'Bản nháp'
    case 'ready': return 'Sẵn sàng'
    case 'running': return 'Đang chạy'
    case 'paused': return 'Tạm dừng'
    case 'human_takeover': return 'Người kiểm soát'
    case 'stopped': return 'Đã dừng'
    case 'error': return 'Lỗi'
    default: return status
  }
}

export default function LiveSessionsList() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Create Drawer state
  const [createVisible, setCreateVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  
  const [deps, setDeps] = useState({ devices: [], products: [], agents: [], accounts: [] })
  
  // Watch values for dynamic fields
  const platform = Form.useWatch('platform', form)
  const shopeeMode = Form.useWatch('shopee_connection_mode', form)

  const fetchSessions = async () => {
    setLoading(true)
    try {
      const res = await api.get('/live_sessions/sessions/')
      const data = Array.isArray(res.data) ? res.data : (res.data?.results || [])
      setSessions(data)
    } catch (err) {
      message.error('Không thể tải danh sách phiên Live')
    } finally {
      setLoading(false)
    }
  }

  const fetchDependencies = async () => {
    try {
      const [devRes, prodRes, agentRes, accRes] = await Promise.all([
        api.get('/live_sessions/devices/').catch(() => ({ data: [] })),
        api.get('/inventory/products/').catch(() => ({ data: [] })),
        api.get('/ai_agents/agents/').catch(() => ({ data: [] })),
        api.get('/live_sessions/platform-accounts/').catch(() => ({ data: [] }))
      ])
      setDeps({
        devices: Array.isArray(devRes.data) ? devRes.data : devRes.data.results || [],
        products: Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.results || [],
        agents: Array.isArray(agentRes.data) ? agentRes.data : agentRes.data.results || [],
        accounts: Array.isArray(accRes.data) ? accRes.data : accRes.data.results || []
      })
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [])

  useEffect(() => {
    if (createVisible) {
      fetchDependencies()
      form.setFieldsValue({ platform: 'shopee', shopee_connection_mode: 'api' })
    }
  }, [createVisible, form])

  const handleAction = async (id, action) => {
    try {
      await api.post(`/live_sessions/sessions/${id}/${action}/`)
      message.success(`Đã thực hiện lệnh: ${action}`)
      fetchSessions()
    } catch (err) {
      message.error(`Lỗi khi thực hiện lệnh ${action}`)
    }
  }

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      // Separate RTMP details from standard fields
      const { shopee_connection_mode, server_url, stream_key, ...sessionData } = values
      
      if (shopee_connection_mode === 'api') {
        sessionData.shopee_connection_mode = 'api'
      }

      // 1. Create Session
      const res = await api.post('/live_sessions/sessions/', sessionData)
      const sessionId = res.data.id

      // 2. If Manual RTMP, setup connection
      if (sessionData.platform === 'shopee' && shopee_connection_mode === 'manual_rtmp') {
        await api.post(`/live_sessions/sessions/${sessionId}/setup-manual-rtmp/`, {
          server_url,
          stream_key
        })
      }

      message.success('Tạo phiên Live thành công')
      form.resetFields()
      setCreateVisible(false)
      fetchSessions()
    } catch (err) {
      if (err.response) {
        message.error('Lỗi: ' + JSON.stringify(err.response.data))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    {
      title: 'Thiết bị',
      dataIndex: 'device',
      key: 'device',
      render: (deviceId) => {
        const device = deps.devices.find(d => d.id === deviceId)
        return device ? device.name : deviceId
      }
    },
    {
      title: 'Nền tảng',
      dataIndex: 'platform',
      key: 'platform',
      render: (text) => <Tag color="orange">{text?.toUpperCase()}</Tag>
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={getStatusColor(status)}>{getStatusText(status)}</Tag>
      )
    },
    {
      title: 'Connection Mode',
      dataIndex: 'shopee_connection_mode',
      key: 'shopee_connection_mode',
      render: (mode) => mode ? <Text type="secondary">{mode === 'api' ? 'API Mode' : 'Manual RTMP'}</Text> : '-'
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text) => new Date(text).toLocaleString()
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_, record) => {
        const status = record.status
        return (
          <Space>
            <Button 
              type="primary" 
              size="small" 
              icon={<PlayCircleOutlined />} 
              disabled={!['draft', 'ready'].includes(status)}
              onClick={() => handleAction(record.id, 'start')}
            >
              Start
            </Button>
            <Button 
              danger 
              size="small" 
              icon={<StopOutlined />} 
              disabled={['stopped', 'error'].includes(status)}
              onClick={() => handleAction(record.id, 'stop')}
            >
              Stop
            </Button>
          </Space>
        )
      }
    }
  ]

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Quản lý Phiên Livestream</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchSessions}>Làm mới</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateVisible(true)}>Tạo phiên mới</Button>
        </Space>
      </div>

      <Card>
        <Table 
          columns={columns} 
          dataSource={sessions} 
          rowKey="id" 
          loading={loading}
          pagination={false}
        />
      </Card>

      <Drawer
        title="Tạo Phiên Livestream Mới"
        width={600}
        onClose={() => setCreateVisible(false)}
        open={createVisible}
        extra={
          <Space>
            <Button onClick={() => setCreateVisible(false)}>Hủy</Button>
            <Button type="primary" onClick={handleCreate} loading={submitting}>Tạo Phiên</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="device" label="Thiết bị (Live Studio)" rules={[{ required: true }]}>
            <Select placeholder="Chọn thiết bị">
              {deps.devices.map(d => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="product" label="Sản phẩm trung tâm" rules={[{ required: true }]}>
            <Select placeholder="Chọn sản phẩm">
              {deps.products.map(p => <Select.Option key={p.id} value={p.id}>{p.code} - {p.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="ai_agent" label="AI Agent" rules={[{ required: true }]}>
            <Select placeholder="Chọn AI Agent (Kịch bản)">
              {deps.agents.map(a => <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>)}
            </Select>
          </Form.Item>
          
          <div style={{ borderTop: '1px solid #f0f0f0', margin: '24px 0' }} />
          
          <Title level={5}>Cấu hình Nền tảng</Title>
          <Form.Item name="platform" label="Nền tảng" rules={[{ required: true }]}>
            <Select placeholder="Chọn nền tảng">
              <Select.Option value="shopee">Shopee</Select.Option>
              <Select.Option value="tiktok">TikTok</Select.Option>
            </Select>
          </Form.Item>

          {platform === 'shopee' && (
            <>
              <Form.Item name="shopee_connection_mode" label="Chế độ kết nối Shopee" rules={[{ required: true }]}>
                <Radio.Group>
                  <Radio.Button value="api">API Mode (Tự động)</Radio.Button>
                  <Radio.Button value="manual_rtmp">Manual RTMP (Thủ công)</Radio.Button>
                </Radio.Group>
              </Form.Item>

              {shopeeMode === 'api' && (
                <Form.Item name="platform_account" label="Tài khoản Shopee" rules={[{ required: true }]}>
                  <Select placeholder="Chọn tài khoản đã kết nối API">
                    {deps.accounts.filter(a => a.platform === 'shopee').map(a => (
                      <Select.Option key={a.id} value={a.id}>{a.display_name} ({a.status})</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              )}

              {shopeeMode === 'manual_rtmp' && (
                <div style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                    Vui lòng copy Server URL và Stream Key từ Shopee Live PC dán vào đây:
                  </Text>
                  <Form.Item name="server_url" label="Server URL" rules={[{ required: true }]}>
                    <Input placeholder="rtmp://..." />
                  </Form.Item>
                  <Form.Item name="stream_key" label="Stream Key" rules={[{ required: true }]}>
                    <Input.Password placeholder="Stream Key" />
                  </Form.Item>
                </div>
              )}
            </>
          )}
        </Form>
      </Drawer>
    </div>
  )
}
