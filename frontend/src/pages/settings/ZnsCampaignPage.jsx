import React, { useState, useEffect, useCallback } from 'react'
import {
  Badge, Button, Card, Col, DatePicker, Divider, Drawer, Empty, Form, Input,
  InputNumber, Modal, Popconfirm, Row, Select, Space, Spin, Statistic,
  Switch, Table, Tag, Tabs, Tooltip, Typography, message, Checkbox,
  Radio, Alert, Progress
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
  PauseCircleOutlined, ThunderboltOutlined, HistoryOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  BarChartOutlined, ExperimentOutlined, ReloadOutlined,
  RocketOutlined, BellOutlined, CalendarOutlined, GiftOutlined,
  CarOutlined, SettingOutlined, InfoCircleOutlined, EyeOutlined
} from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, Cell
} from 'recharts'
import dayjs from 'dayjs'
import api from '../../utils/api'

const { RangePicker } = DatePicker

const { Title, Text, Paragraph } = Typography
const { Option } = Select

// ── Campaign type config ──────────────────────────────────────────────────────
const CAMPAIGN_TYPES = {
  order_confirm: {
    label: 'Xác nhận Đơn hàng',
    color: '#2563eb',
    bg: '#eff6ff',
    icon: <ThunderboltOutlined />,
    desc: 'Gửi ZNS ngay khi đơn hàng được tạo mới (1 lần/đơn)',
  },
  payment: {
    label: 'Thu tiền',
    color: '#16a34a',
    bg: '#f0fdf4',
    icon: <CheckCircleOutlined />,
    desc: 'Gửi ZNS khi hoàn thành 1 phiếu thu (1 lần/phiếu)',
  },
  birthday: {
    label: 'Chúc mừng Sinh nhật',
    color: '#d97706',
    bg: '#fffbeb',
    icon: <GiftOutlined />,
    desc: 'Tự động gửi lúc 08:00 mỗi ngày cho KH có sinh nhật hôm đó',
  },
  appointment: {
    label: 'Nhắc lịch hẹn',
    color: '#7c3aed',
    bg: '#f5f3ff',
    icon: <CalendarOutlined />,
    desc: 'Gửi ZNS trước ngày hẹn đã cấu hình',
  },
  delivery: {
    label: 'Giao hàng / Bảo hành',
    color: '#0891b2',
    bg: '#ecfeff',
    icon: <CarOutlined />,
    desc: 'Gửi ZNS khi đơn hàng chuyển sang trạng thái đã chọn',
  },
  marketing: {
    label: 'Khuyến mãi / Marketing',
    color: '#dc2626',
    bg: '#fef2f2',
    icon: <BellOutlined />,
    desc: 'Gửi hàng loạt thủ công hoặc theo lịch đặt trước',
  },
  custom: {
    label: 'Tùy chỉnh khác',
    color: '#6b7280',
    bg: '#f9fafb',
    icon: <SettingOutlined />,
    desc: 'Cấu hình nâng cao qua webhook/API nội bộ',
  },
}

// Trạng thái giao hàng
const DELIVERY_STATUS_OPTIONS = [
  { value: 'shipping', label: '🚚 Đang giao' },
  { value: 'delivered', label: '✅ Đã giao' },
  { value: 'warranty_done', label: '🔧 Hoàn thành bảo hành' },
]

const STATUS_LOG_COLOR = { sent: 'success', failed: 'error', pending: 'processing' }
const STATUS_LOG_LABEL = { sent: 'Thành công', failed: 'Thất bại', pending: 'Chờ gửi' }

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (iso) => iso ? dayjs(iso).format('HH:mm DD/MM/YYYY') : '—'

export default function ZnsCampaignPage() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState(null)
  const [saving, setSaving] = useState(false)
  const [mainTab, setMainTab] = useState('list')

  // Log / Report state
  const [selectedCampaignForLog, setSelectedCampaignForLog] = useState(null)
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [stats, setStats] = useState(null)
  const [logFilter, setLogFilter] = useState('all')
  const [logDateRange, setLogDateRange] = useState(null)
  const [logDrawerOpen, setLogDrawerOpen] = useState(false)
  const [errorDetailRecord, setErrorDetailRecord] = useState(null)
  const [errorModalOpen, setErrorModalOpen] = useState(false)

  // Test send
  const [testPhone, setTestPhone] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testCampaignId, setTestCampaignId] = useState(null)
  const [testModalOpen, setTestModalOpen] = useState(false)

  const [form] = Form.useForm()
  const watchType = Form.useWatch('campaign_type', form)

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/zalo/campaigns/')
      setCampaigns(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch { message.error('Không tải được danh sách chiến dịch') }
    finally { setLoading(false) }
  }, [])

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await api.get('/zalo/templates/')
      setTemplates(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchCampaigns()
    fetchTemplates()
  }, [fetchCampaigns, fetchTemplates])

  // ── Fetch logs ─────────────────────────────────────────────────────────────
  const fetchLogs = async (campaignId, statusFilter = 'all', dateRange = null) => {
    if (!campaignId) return
    setLogsLoading(true)
    try {
      const params = { page_size: 200 }
      if (statusFilter !== 'all') params.status = statusFilter
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD')
      const [logRes, statsRes] = await Promise.all([
        api.get(`/zalo/campaigns/${campaignId}/logs/`, { params }),
        api.get(`/zalo/campaigns/${campaignId}/stats/`),
      ])
      setLogs(Array.isArray(logRes.data) ? logRes.data : logRes.data?.results ?? [])
      setStats(statsRes.data)
    } catch { message.error('Không tải được lịch sử') }
    finally { setLogsLoading(false) }
  }

  const openLogDrawer = (campaign) => {
    setSelectedCampaignForLog(campaign)
    setLogFilter('all')
    setLogDateRange(null)
    setLogDrawerOpen(true)
    fetchLogs(campaign.id, 'all', null)
  }

  // ── Toggle bật/tắt ────────────────────────────────────────────────────────
  const handleToggle = async (id, checked) => {
    try {
      await api.post(`/zalo/campaigns/${id}/toggle/`)
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, is_active: checked } : c))
      message.success(checked ? '✅ Đã bật chiến dịch' : '⏸ Đã tắt chiến dịch')
    } catch { message.error('Không thể thay đổi trạng thái') }
  }

  // ── Tạo / Sửa ─────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingCampaign(null)
    form.resetFields()
    form.setFieldsValue({ campaign_type: 'order_confirm', delay_minutes: 0 })
    setDrawerOpen(true)
  }

  const openEdit = (campaign) => {
    setEditingCampaign(campaign)
    const cfg = campaign.config_json || {}
    form.setFieldsValue({
      name: campaign.name,
      campaign_type: campaign.campaign_type,
      template: campaign.template,
      delay_minutes: cfg.delay_minutes ?? 0,
      trigger_statuses: cfg.trigger_statuses ?? [],
      send_hour: cfg.send_hour ?? 8,
      days_before: cfg.days_before ?? 0,
      minutes_before: cfg.minutes_before ?? 120,
    })
    setDrawerOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      // Build config_json theo loại
      const cfg = {}
      const type = values.campaign_type
      if (type === 'order_confirm' || type === 'payment') {
        cfg.delay_minutes = values.delay_minutes ?? 0
      } else if (type === 'delivery') {
        cfg.trigger_statuses = values.trigger_statuses ?? []
        cfg.delay_minutes = values.delay_minutes ?? 0
      } else if (type === 'birthday') {
        cfg.send_hour = values.send_hour ?? 8
        cfg.days_before = values.days_before ?? 0
      } else if (type === 'appointment') {
        cfg.minutes_before = values.minutes_before ?? 120
      }

      const payload = {
        name: values.name,
        campaign_type: values.campaign_type,
        template: values.template,
        config_json: cfg,
      }

      if (editingCampaign) {
        await api.put(`/zalo/campaigns/${editingCampaign.id}/`, payload)
        message.success('✅ Đã cập nhật chiến dịch')
      } else {
        await api.post('/zalo/campaigns/', payload)
        message.success('✅ Đã tạo chiến dịch mới')
      }
      setDrawerOpen(false)
      fetchCampaigns()
    } catch (err) {
      if (err?.errorFields) return // form validation error
      message.error('Lỗi lưu chiến dịch')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/zalo/campaigns/${id}/`)
      message.success('Đã xóa chiến dịch')
      fetchCampaigns()
    } catch { message.error('Không thể xóa') }
  }

  // ── Test gửi ──────────────────────────────────────────────────────────────
  const handleTest = async () => {
    if (!testPhone.trim()) return message.warning('Nhập SĐT nhận test')
    setTestLoading(true)
    try {
      await api.post(`/zalo/campaigns/${testCampaignId}/test/`, { phone: testPhone })
      message.success('✅ Đã gửi tin ZNS test!')
      setTestModalOpen(false)
    } catch { message.error('Gửi test thất bại') }
    finally { setTestLoading(false) }
  }

  // ── Form cấu hình động theo loại ─────────────────────────────────────────
  const renderConfigFields = () => {
    const type = watchType
    if (!type) return null

    if (type === 'order_confirm' || type === 'payment') {
      return (
        <Form.Item label="Thời gian gửi" name="delay_minutes" initialValue={0}>
          <Radio.Group>
            <Space direction="vertical">
              <Radio value={0}>⚡ Gửi ngay khi kích hoạt</Radio>
              <Radio value={5}>⏱ Gửi sau 5 phút</Radio>
              <Radio value={15}>⏱ Gửi sau 15 phút</Radio>
              <Radio value={30}>⏱ Gửi sau 30 phút</Radio>
              <Radio value={60}>⏱ Gửi sau 1 giờ</Radio>
            </Space>
          </Radio.Group>
        </Form.Item>
      )
    }

    if (type === 'delivery') {
      return (
        <>
          <Form.Item
            label="Trạng thái kích hoạt gửi ZNS"
            name="trigger_statuses"
            rules={[{ required: true, message: 'Chọn ít nhất 1 trạng thái' }]}
            extra="Hệ thống gửi 1 lần cho mỗi trạng thái được chọn khi đơn chuyển sang đó."
          >
            <Checkbox.Group options={DELIVERY_STATUS_OPTIONS} style={{ display: 'flex', flexDirection: 'column', gap: 8 }} />
          </Form.Item>
          <Form.Item label="Thời gian gửi" name="delay_minutes" initialValue={0}>
            <Radio.Group>
              <Space direction="vertical">
                <Radio value={0}>⚡ Gửi ngay khi cập nhật trạng thái</Radio>
                <Radio value={5}>⏱ Gửi sau 5 phút</Radio>
                <Radio value={30}>⏱ Gửi sau 30 phút</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
        </>
      )
    }

    if (type === 'birthday') {
      return (
        <>
          <Alert
            message="Cron tự động chạy lúc 08:00 mỗi ngày, tìm khách hàng có sinh nhật và gửi ZNS."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Form.Item label="Gửi trước bao nhiêu ngày" name="days_before" initialValue={0}
            extra="0 = gửi đúng ngày sinh nhật, 1 = gửi trước 1 ngày.">
            <InputNumber min={0} max={7} addonAfter="ngày trước" style={{ width: 180 }} />
          </Form.Item>
        </>
      )
    }

    if (type === 'appointment') {
      return (
        <Form.Item label="Gửi trước lịch hẹn" name="minutes_before" initialValue={120}
          extra="Hệ thống quét mỗi 5 phút, gửi ZNS khi lịch hẹn còn cách đúng thời gian cấu hình.">
          <Select style={{ width: 220 }}>
            <Option value={30}>30 phút trước</Option>
            <Option value={60}>1 giờ trước</Option>
            <Option value={120}>2 giờ trước</Option>
            <Option value={180}>3 giờ trước</Option>
            <Option value={360}>6 giờ trước</Option>
            <Option value={1440}>1 ngày trước</Option>
          </Select>
        </Form.Item>
      )
    }

    if (type === 'marketing') {
      return (
        <Alert
          message="Chiến dịch Marketing sẽ được cấu hình chi tiết (chọn danh sách KH, lên lịch) sau khi tạo xong."
          type="warning"
          showIcon
        />
      )
    }

    return null
  }

  // ── Columns bảng danh sách ────────────────────────────────────────────────
  const columns = [
    {
      title: 'Tên chiến dịch',
      dataIndex: 'name',
      key: 'name',
      render: (name, row) => {
        const cfg = CAMPAIGN_TYPES[row.campaign_type] || CAMPAIGN_TYPES.custom
        return (
          <Space>
            <span style={{ fontSize: 18 }}>{cfg.icon}</span>
            <div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{name}</div>
              <Tag color={cfg.color} style={{ fontSize: 10, marginTop: 2 }}>{cfg.label}</Tag>
            </div>
          </Space>
        )
      },
    },
    {
      title: 'Mẫu ZNS',
      dataIndex: 'template_name',
      key: 'template_name',
      render: (v) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>Chưa chọn mẫu</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (active, row) => (
        <Switch
          checked={active}
          onChange={(checked) => handleToggle(row.id, checked)}
          checkedChildren="Bật"
          unCheckedChildren="Tắt"
          style={{ background: active ? '#16a34a' : '#9ca3af' }}
        />
      ),
    },
    {
      title: 'Cập nhật',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 140,
      render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{fmt(v)}</Text>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 180,
      render: (_, row) => (
        <Space size={4}>
          <Tooltip title="Lịch sử gửi">
            <Button size="small" icon={<HistoryOutlined />} onClick={() => openLogDrawer(row)} />
          </Tooltip>
          <Tooltip title="Gửi test">
            <Button size="small" icon={<ExperimentOutlined />} onClick={() => {
              setTestCampaignId(row.id)
              setTestPhone('')
              setTestModalOpen(true)
            }} />
          </Tooltip>
          <Tooltip title="Sửa">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          </Tooltip>
          <Popconfirm title="Xóa chiến dịch này?" onConfirm={() => handleDelete(row.id)} okText="Xóa" cancelText="Hủy">
            <Tooltip title="Xóa">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // ── Columns bảng log ──────────────────────────────────────────────────────
  const logColumns = [
    {
      title: 'Thời gian',
      dataIndex: 'sent_at',
      key: 'sent_at',
      width: 140,
      render: (v) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text>,
    },
    {
      title: 'Khách hàng',
      dataIndex: 'recipient_name',
      key: 'recipient_name',
      render: (v) => <Text>{v || '—'}</Text>,
    },
    {
      title: 'SĐT',
      dataIndex: 'recipient_phone',
      key: 'recipient_phone',
      width: 120,
    },
    {
      title: 'Nguồn',
      dataIndex: 'trigger_object',
      key: 'trigger_object',
      width: 130,
      render: (v) => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s) => (
        <Badge
          status={STATUS_LOG_COLOR[s] || 'default'}
          text={<span style={{ fontSize: 12 }}>{STATUS_LOG_LABEL[s] || s}</span>}
        />
      ),
    },
    {
      title: 'Chi tiết lỗi',
      key: 'error_detail',
      width: 100,
      render: (_, row) => row.error_message ? (
        <Tooltip title={row.error_message}>
          <Button
            size="small" danger
            icon={<EyeOutlined />}
            onClick={() => { setErrorDetailRecord(row); setErrorModalOpen(true) }}
          >
            Xem lỗi
          </Button>
        </Tooltip>
      ) : null,
    },
  ]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <RocketOutlined style={{ color: '#2563eb' }} />
            Chiến dịch ZNS
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Tạo và quản lý các chiến dịch gửi tin nhắn ZNS tự động
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchCampaigns} loading={loading}>Làm mới</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}
            style={{ background: '#2563eb' }}>
            Tạo chiến dịch mới
          </Button>
        </Space>
      </div>

      {/* Stats cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {[
          { label: 'Tổng chiến dịch', value: campaigns.length, color: '#2563eb', icon: <RocketOutlined /> },
          { label: 'Đang hoạt động', value: campaigns.filter(c => c.is_active).length, color: '#16a34a', icon: <PlayCircleOutlined /> },
          { label: 'Đã tắt', value: campaigns.filter(c => !c.is_active).length, color: '#9ca3af', icon: <PauseCircleOutlined /> },
        ].map((s, i) => (
          <Col span={8} key={i}>
            <Card bordered={false} style={{ background: '#f8fafc', borderRadius: 12 }}>
              <Statistic
                title={<span style={{ fontSize: 13, color: '#64748b' }}>{s.label}</span>}
                value={s.value}
                valueStyle={{ color: s.color, fontSize: 28, fontWeight: 800 }}
                prefix={s.icon}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Main tabs */}
      <Tabs activeKey={mainTab} onChange={setMainTab}
        items={[
          {
            key: 'list',
            label: <span><RocketOutlined /> Danh sách</span>,
            children: (
              <Table
                dataSource={campaigns}
                columns={columns}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 20 }}
                locale={{ emptyText: <Empty description="Chưa có chiến dịch nào. Tạo chiến dịch đầu tiên!" /> }}
              />
            ),
          },
          {
            key: 'report',
            label: <span><BarChartOutlined /> Báo cáo tổng hợp</span>,
            children: <CampaignReport campaigns={campaigns} />,
          },
        ]}
      />

      {/* ── Drawer Tạo/Sửa ── */}
      <Drawer
        title={editingCampaign ? '✏️ Sửa chiến dịch' : '🚀 Tạo chiến dịch ZNS mới'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={() => setDrawerOpen(false)}>Hủy</Button>
            <Button type="primary" loading={saving} onClick={handleSave}
              style={{ background: '#2563eb' }}>
              {editingCampaign ? 'Lưu thay đổi' : 'Tạo chiến dịch'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Tên chiến dịch" name="name"
            rules={[{ required: true, message: 'Nhập tên chiến dịch' }]}>
            <Input placeholder="VD: Xác nhận đơn hàng mới" />
          </Form.Item>

          <Form.Item label="Loại chiến dịch" name="campaign_type"
            rules={[{ required: true }]}>
            <Select placeholder="Chọn loại chiến dịch">
              {Object.entries(CAMPAIGN_TYPES).map(([key, cfg]) => (
                <Option key={key} value={key}>
                  <Space>
                    {cfg.icon}
                    <span>{cfg.label}</span>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          {watchType && (
            <Alert
              message={CAMPAIGN_TYPES[watchType]?.desc}
              type="info"
              showIcon
              style={{ marginBottom: 16, fontSize: 12 }}
            />
          )}

          <Form.Item label="Mẫu ZNS" name="template"
            rules={[{ required: true, message: 'Chọn mẫu ZNS' }]}
            extra="OA gửi sẽ tự động lấy từ mẫu đã chọn.">
            <Select placeholder="Chọn mẫu ZNS" showSearch
              filterOption={(input, option) => option?.label?.toLowerCase().includes(input.toLowerCase())}
              options={templates.map(t => ({
                value: t.id,
                label: `${t.name} (${t.zalo_template_id})`,
              }))}
            />
          </Form.Item>

          <Divider style={{ margin: '12px 0' }}>Cấu hình chiến dịch</Divider>
          {renderConfigFields()}
        </Form>
      </Drawer>

      {/* ── Drawer Lịch sử gửi ── */}
      <Drawer
        title={
          <span>
            <HistoryOutlined /> Lịch sử gửi —{' '}
            <span style={{ color: '#2563eb' }}>{selectedCampaignForLog?.name}</span>
          </span>
        }
        open={logDrawerOpen}
        onClose={() => setLogDrawerOpen(false)}
        width={800}
      >
        {/* Stats mini */}
        {stats && (
          <Row gutter={12} style={{ marginBottom: 16 }}>
            {[
              { label: 'Tổng gửi', value: stats.total, color: '#2563eb' },
              { label: '✅ Thành công', value: stats.sent, color: '#16a34a' },
              { label: '❌ Thất bại', value: stats.failed, color: '#dc2626' },
              { label: 'Tỷ lệ thành công', value: `${stats.success_rate || 0}%`, color: '#7c3aed' },
            ].map((s, i) => (
              <Col span={6} key={i}>
                <Card size="small" bordered={false} style={{ background: '#f8fafc', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{s.label}</div>
                </Card>
              </Col>
            ))}
          </Row>
        )}

        {/* Filter */}
        <Space wrap style={{ marginBottom: 12 }}>
          <Text strong style={{ fontSize: 13 }}>Lọc:</Text>
          {['all', 'sent', 'failed', 'pending'].map(f => (
            <Button key={f} size="small"
              type={logFilter === f ? 'primary' : 'default'}
              onClick={() => { setLogFilter(f); fetchLogs(selectedCampaignForLog?.id, f, logDateRange) }}
              danger={f === 'failed'}
            >
              {f === 'all' ? 'Tất cả' : STATUS_LOG_LABEL[f]}
            </Button>
          ))}
          <RangePicker
            size="small"
            value={logDateRange}
            onChange={(val) => { setLogDateRange(val); fetchLogs(selectedCampaignForLog?.id, logFilter, val) }}
            placeholder={['Từ ngày', 'Đến ngày']}
            format="DD/MM/YYYY"
            allowClear
          />
          <Button size="small" icon={<ReloadOutlined />}
            onClick={() => fetchLogs(selectedCampaignForLog?.id, logFilter, logDateRange)} />
        </Space>

        <Table
          dataSource={logs}
          columns={logColumns}
          rowKey="id"
          loading={logsLoading}
          size="small"
          pagination={{ pageSize: 50 }}
          locale={{ emptyText: 'Chưa có lịch sử gửi' }}
        />
      </Drawer>

      {/* ── Modal Test gửi ── */}
      <Modal
        title={<span><ExperimentOutlined /> Gửi test ZNS</span>}
        open={testModalOpen}
        onCancel={() => setTestModalOpen(false)}
        onOk={handleTest}
        okText="Gửi test"
        confirmLoading={testLoading}
        okButtonProps={{ style: { background: '#2563eb' } }}
      >
        <Alert
          message="Hệ thống sẽ gửi 1 tin ZNS mẫu đến số điện thoại bạn nhập để kiểm tra."
          type="info" showIcon style={{ marginBottom: 16 }}
        />
        <Input
          prefix={<span>📱</span>}
          placeholder="Nhập SĐT nhận test (VD: 0901234567)"
          value={testPhone}
          onChange={e => setTestPhone(e.target.value)}
          size="large"
        />
      </Modal>

      {/* ── Modal Chi tiết lỗi ── */}
      <Modal
        title={<span style={{ color: '#dc2626' }}>❌ Chi tiết lỗi gửi ZNS</span>}
        open={errorModalOpen}
        onCancel={() => setErrorModalOpen(false)}
        footer={<Button onClick={() => setErrorModalOpen(false)}>Đóng</Button>}
        width={520}
      >
        {errorDetailRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>SĐT nhận</div>
              <div style={{ fontWeight: 700 }}>{errorDetailRecord.recipient_phone}</div>
            </div>
            {errorDetailRecord.error_code && (
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Mã lỗi Zalo</div>
                <Tag color="orange">{errorDetailRecord.error_code}</Tag>
              </div>
            )}
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Mô tả lỗi</div>
              <div style={{ color: '#dc2626', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {errorDetailRecord.error_message || 'Không có mô tả lỗi'}
              </div>
            </div>
            {errorDetailRecord.trigger_object && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Nguồn kích hoạt</div>
                <Tag>{errorDetailRecord.trigger_object}</Tag>
              </div>
            )}
            <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>🕐 {fmt(errorDetailRecord.sent_at)}</div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Sub-component: Báo cáo tổng hợp ─────────────────────────────────────────
function CampaignReport({ campaigns }) {
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState([dayjs().subtract(30, 'day'), dayjs()])

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD')
      const res = await api.get('/zalo/campaigns/report/', { params })
      setReportData(res.data)
    } catch {}
    finally { setLoading(false) }
  }, [dateRange])

  useEffect(() => { fetchReport() }, [fetchReport])

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  if (!reportData) return <Empty description="Chưa có dữ liệu báo cáo" style={{ padding: 60 }} />

  // Chart colors
  const byCampaign = reportData.by_campaign ?? []
  const chartData = byCampaign.map(c => ({
    name: c.name.length > 14 ? c.name.slice(0, 14) + '…' : c.name,
    'Thành công': c.sent ?? 0,
    'Thất bại': c.failed ?? 0,
  }))

  return (
    <div>
      {/* Filter date range */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Text strong style={{ fontSize: 14 }}>📊 Tổng quan chiến dịch</Text>
        <Space>
          <RangePicker
            value={dateRange}
            onChange={setDateRange}
            format="DD/MM/YYYY"
            placeholder={['Từ ngày', 'Đến ngày']}
            presets={[
              { label: '7 ngày qua', value: [dayjs().subtract(7, 'd'), dayjs()] },
              { label: '30 ngày qua', value: [dayjs().subtract(30, 'd'), dayjs()] },
              { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs()] },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchReport} loading={loading} size="small">Làm mới</Button>
        </Space>
      </div>

      {/* KPI Cards */}
      <Row gutter={16} style={{ marginBottom: 28 }}>
        {[
          { label: 'Tổng gửi', value: reportData.total_sent ?? 0, color: '#2563eb', bg: '#eff6ff', icon: '📤' },
          { label: 'Thành công', value: reportData.total_success ?? 0, color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
          { label: 'Thất bại', value: reportData.total_failed ?? 0, color: '#dc2626', bg: '#fef2f2', icon: '❌' },
          { label: 'Tỷ lệ thành công', value: `${reportData.success_rate ?? 0}%`, color: '#7c3aed', bg: '#f5f3ff', icon: '📈' },
        ].map((s, i) => (
          <Col span={6} key={i}>
            <Card bordered={false} style={{ background: s.bg, borderRadius: 14, textAlign: 'center', border: `1px solid ${s.color}22` }}>
              <div style={{ fontSize: 26, marginBottom: 2 }}>{s.icon}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{s.label}</div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Biểu đồ cột theo chiến dịch */}
      {chartData.length > 0 && (
        <Card
          bordered={false}
          style={{ marginBottom: 24, borderRadius: 12, background: '#fafafa' }}
          title={
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              <BarChartOutlined style={{ marginRight: 6, color: '#2563eb' }} />
              Số tin gửi theo chiến dịch
            </span>
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <RTooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Thành công" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={48} />
              <Bar dataKey="Thất bại" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Bảng chi tiết theo từng campaign */}
      <Card
        bordered={false}
        style={{ borderRadius: 12 }}
        title={<span style={{ fontSize: 13, fontWeight: 700 }}>📋 Chi tiết theo chiến dịch</span>}
      >
        <Table
          dataSource={byCampaign}
          rowKey="id"
          size="small"
          pagination={false}
          columns={[
            {
              title: 'Chiến dịch',
              dataIndex: 'name',
              render: (name, row) => (
                <Space>
                  <span>{CAMPAIGN_TYPES[row.campaign_type]?.icon}</span>
                  <span style={{ fontWeight: 600 }}>{name}</span>
                </Space>
              ),
            },
            {
              title: 'Loại',
              dataIndex: 'campaign_type',
              width: 160,
              render: (t) => {
                const cfg = CAMPAIGN_TYPES[t]
                return <Tag color={cfg?.color} style={{ borderColor: cfg?.color }}>{cfg?.label}</Tag>
              },
            },
            {
              title: 'Tổng gửi',
              dataIndex: 'total',
              width: 90,
              render: v => <b style={{ fontSize: 14 }}>{v ?? 0}</b>,
            },
            {
              title: '✅ OK',
              dataIndex: 'sent',
              width: 80,
              render: v => <span style={{ color: '#16a34a', fontWeight: 700 }}>{v ?? 0}</span>,
            },
            {
              title: '❌ Fail',
              dataIndex: 'failed',
              width: 80,
              render: v => <span style={{ color: '#dc2626', fontWeight: 700 }}>{v ?? 0}</span>,
            },
            {
              title: 'Tỷ lệ thành công',
              dataIndex: 'success_rate',
              width: 160,
              render: (v) => {
                const pct = v ?? 0
                const color = pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626'
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Progress
                      percent={pct}
                      size="small"
                      strokeColor={color}
                      showInfo={false}
                      style={{ flex: 1, minWidth: 60 }}
                    />
                    <span style={{ color, fontWeight: 700, minWidth: 38 }}>{pct}%</span>
                  </div>
                )
              },
            },
          ]}
        />
      </Card>
    </div>
  )
}
