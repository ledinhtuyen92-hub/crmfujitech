import { useState, useEffect } from 'react'
import {
  Alert, Button, Card, Col, Form, Input,
  message, Modal, Row, Select, Space, Switch, Table, Tag, Typography, Tooltip, List
} from 'antd'
import {
  FileTextOutlined, PlusOutlined, EditOutlined, DeleteOutlined, InfoCircleOutlined, CloudSyncOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../utils/api'
import { useAuth } from '../../contexts/AuthContext'
import { useResponsive } from '../../hooks/useResponsive'

const { Title, Text } = Typography
const { Option } = Select

export default function ZaloTemplatePage() {
  const { maintenanceMode, hasPermission } = useAuth()
  const { isMobile } = useResponsive()
  const canManageTemplates = hasPermission('zalo.manage_templates') || hasPermission('zalo.config')
  const [templates, setTemplates] = useState([])
  const [oaList, setOaList] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [form] = Form.useForm()

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await api.get('/zalo/templates/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setTemplates(data)
    } catch (e) {
      console.error(e)
      message.error('Lỗi khi tải dữ liệu template.')
    } finally {
      setLoading(false)
    }
  }

  const fetchOaList = async () => {
    try {
      const res = await api.get('/zalo/templates/oa-list/')
      setOaList(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      console.error('Không thể tải danh sách Zalo OA:', e)
    }
  }

  useEffect(() => {
    fetchTemplates()
    fetchOaList()
  }, [])

  const handleOpenModal = (template = null) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    setEditingTemplate(template)
    if (template) {
      form.setFieldsValue({
        name: template.name,
        zalo_template_id: template.zalo_template_id,
        template_type: template.template_type,
        content_preview: template.content_preview,
        params_schema: JSON.stringify(template.params_schema, null, 2),
        oa_config: template.oa_config || null,
        is_active: template.is_active,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({
        is_active: true,
        template_type: 'custom',
        params_schema: '{\n  "ten_khach_hang": "Tên khách hàng",\n  "ma_don_hang": "Mã đơn hàng"\n}',
        oa_config: oaList.length === 1 ? oaList[0].id : null,
      })
    }
    setModalVisible(true)
  }

  const handleDelete = async (id) => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    try {
      await api.delete(`/zalo/templates/${id}/`)
      message.success('Đã xóa mẫu ZNS!')
      fetchTemplates()
    } catch {
      message.error('Không thể xóa mẫu ZNS.')
    }
  }

  const handleSyncTemplates = async () => {
    if (maintenanceMode) { message.warning('⚠️ Hệ thống đang bảo trì. Chức năng tạm khóa!'); return }
    setSyncing(true)
    try {
      const res = await api.post('/zalo/templates/sync/')
      message.success(res.data?.detail || 'Đồng bộ thành công!')
      fetchTemplates()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Lỗi khi đồng bộ từ Zalo.')
    } finally {
      setSyncing(false)
    }
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      // Parse JSON for params_schema
      try {
        values.params_schema = JSON.parse(values.params_schema)
      } catch (e) {
        message.error('Định dạng Cấu trúc tham số (JSON) không hợp lệ!')
        return
      }

      setSaving(true)
      if (editingTemplate) {
        await api.patch(`/zalo/templates/${editingTemplate.id}/`, values)
        message.success('Cập nhật mẫu ZNS thành công!')
      } else {
        await api.post('/zalo/templates/', values)
        message.success('Thêm mẫu ZNS thành công!')
      }
      setModalVisible(false)
      fetchTemplates()
    } catch (err) {
      if (err.response?.data) {
        const errors = err.response.data
        for (const key in errors) {
          message.error(`${key}: ${errors[key]}`)
        }
      } else if (err.errorFields) {
        return
      } else {
        message.error('Lỗi khi lưu mẫu ZNS.')
      }
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      title: 'Tên mẫu',
      dataIndex: 'name',
      key: 'name',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Zalo Template ID',
      dataIndex: 'zalo_template_id',
      key: 'zalo_template_id',
      render: (text) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: 'OA Gửi',
      dataIndex: 'oa_name',
      key: 'oa_name',
      render: (oaName) => oaName
        ? <Tag color="geekblue" style={{ fontWeight: 500 }}>{oaName}</Tag>
        : <Tag color="warning">Chưa gán OA</Tag>,
    },
    {
      title: 'Loại mẫu',
      dataIndex: 'template_type',
      key: 'template_type',
      render: (text) => {
        const types = {
          order_confirm: { color: 'green', label: 'Xác nhận Đơn hàng' },
          appointment: { color: 'cyan', label: 'Nhắc lịch hẹn' },
          promotion: { color: 'magenta', label: 'Khuyến mãi' },
          birthday: { color: 'purple', label: 'Chúc mừng sinh nhật' },
          care: { color: 'orange', label: 'Thu tiền / Chăm sóc' },
          delivery_warranty: { color: 'blue', label: 'Giao hàng / Bảo hành' },
          custom: { color: 'default', label: 'Tùy chỉnh' },
        }
        const t = types[text] || types.custom
        return <Tag color={t.color}>{t.label}</Tag>
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive) => (
        <Tag color={isActive ? 'success' : 'default'}>
          {isActive ? 'Hoạt động' : 'Tạm dừng'}
        </Tag>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text) => dayjs(text).format('DD/MM/YYYY'),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          {canManageTemplates && (
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleOpenModal(record)}
            />
          )}
          {canManageTemplates && (
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: 'Xác nhận xóa',
                  content: `Bạn có chắc chắn muốn xóa mẫu ZNS "${record.name}"?`,
                  okText: 'Xóa',
                  okType: 'danger',
                  cancelText: 'Hủy',
                  onOk: () => handleDelete(record.id),
                })
              }}
            />
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', gap: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileTextOutlined style={{ color: '#0068ff' }} />
            Quản lý Mẫu ZNS
          </Title>
          <Text type="secondary">Đồng bộ các mẫu tin nhắn ZNS đã được Zalo OA xét duyệt để gửi cho khách hàng</Text>
        </div>
        {canManageTemplates && (
          <Space>
            <Button
              icon={<CloudSyncOutlined />}
              onClick={handleSyncTemplates}
              loading={syncing}
            >
              Đồng bộ từ Zalo
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleOpenModal()}
              style={{ background: '#0068ff', borderColor: '#0068ff' }}
            >
              Thêm Mẫu ZNS
            </Button>
          </Space>
        )}
      </div>

      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 0 }}>
        {isMobile ? (
          <List
            dataSource={templates}
            loading={loading}
            renderItem={(record) => {
              const types = {
                order_confirm: { color: 'green', label: 'Xác nhận Đơn hàng' },
                appointment: { color: 'cyan', label: 'Nhắc lịch hẹn' },
                promotion: { color: 'magenta', label: 'Khuyến mãi' },
                birthday: { color: 'purple', label: 'Chúc mừng sinh nhật' },
                care: { color: 'orange', label: 'Thu tiền / Chăm sóc' },
                delivery_warranty: { color: 'blue', label: 'Giao hàng / Bảo hành' },
                custom: { color: 'default', label: 'Tùy chỉnh' },
              }
              const t = types[record.template_type] || types.custom
              return (
                <List.Item style={{ padding: '16px', display: 'block', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 15 }}>{record.name}</Text>
                    <Tag color={record.is_active ? 'success' : 'default'} style={{ margin: 0 }}>
                      {record.is_active ? 'Hoạt động' : 'Tạm dừng'}
                    </Tag>
                  </div>
                  
                  <div style={{ marginBottom: 12 }}>
                    <Text type="secondary" style={{ fontSize: 13, marginRight: 8 }}>Template ID:</Text>
                    <Tag color="blue" style={{ margin: 0 }}>{record.zalo_template_id}</Tag>
                  </div>

                  <div style={{ marginBottom: 12, background: '#f8fafc', padding: '8px 12px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>Loại mẫu:</Text>
                    <Tag color={t.color} style={{ margin: 0 }}>{t.label}</Tag>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #f0f0f0', paddingTop: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Ngày tạo: {dayjs(record.created_at).format('DD/MM/YYYY')}</Text>
                    <Space size="small">
                      {canManageTemplates && (
                        <Button type="text" icon={<EditOutlined style={{ color: '#1677ff' }} />} onClick={() => handleOpenModal(record)} />
                      )}
                      {canManageTemplates && (
                        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => {
                          Modal.confirm({
                            title: 'Xác nhận xóa',
                            content: `Bạn có chắc chắn muốn xóa mẫu ZNS "${record.name}"?`,
                            okText: 'Xóa',
                            okType: 'danger',
                            cancelText: 'Hủy',
                            onOk: () => handleDelete(record.id),
                          })
                        }} />
                      )}
                    </Space>
                  </div>
                </List.Item>
              )
            }}
          />
        ) : (
          <Table scroll={{ x: 'max-content' }}
            columns={columns}
            dataSource={templates}
            rowKey="id"
            loading={loading}
            pagination={false}
          />
        )}
      </Card>

      <Modal
        title={
          <Space>
            <FileTextOutlined style={{ color: '#0068ff' }} />
            {editingTemplate ? 'Chỉnh sửa Mẫu ZNS' : 'Thêm Mẫu ZNS mới'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSave}
        okText="Lưu Mẫu ZNS"
        cancelText="Huỷ"
        confirmLoading={saving}
        width={600}
        okButtonProps={{ style: { background: '#0068ff', borderColor: '#0068ff' } }}
      >
        <Alert
          type="info" showIcon style={{ marginBottom: 20 }}
          message="Lưu ý: Mẫu ZNS phải được tạo và xét duyệt trên hệ thống Zalo (ZCA) trước khi thêm vào đây. ID Mẫu ZNS phải trùng khớp chính xác."
        />
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Form.Item name="name" label="Tên gợi nhớ" rules={[{ required: true, message: 'Vui lòng nhập tên mẫu' }]}>
                <Input placeholder="VD: Mẫu Xác nhận Đơn hàng" />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="zalo_template_id" label="Zalo Template ID" rules={[{ required: true, message: 'Bắt buộc' }]}>
                <Input placeholder="ID từ Zalo (VD: 123456)" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="oa_config"
            label="Zalo OA Gửi"
            rules={[{ required: true, message: 'Vui lòng chọn Zalo OA sẽ gửi mẫu tin này' }]}
          >
            <Select
              placeholder="Chọn Zalo OA gửi mẫu tin này"
              allowClear
              optionLabelProp="label"
            >
              {oaList.map(oa => (
                <Option key={oa.id} value={oa.id} label={oa.oa_name}>
                  {oa.oa_name}
                  {oa.oa_id && <span style={{ marginLeft: 8, color: '#888', fontSize: 12 }}>({oa.oa_id})</span>}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="template_type" label="Loại mẫu (Mục đích)">
            <Select>
              <Option value="order_confirm">Xác nhận Đơn hàng</Option>
              <Option value="appointment">Nhắc lịch hẹn</Option>
              <Option value="promotion">Khuyến mãi / Marketing</Option>
              <Option value="birthday">Chúc mừng sinh nhật</Option>
              <Option value="care">Thu tiền / Chăm sóc</Option>
              <Option value="delivery_warranty">Giao hàng / Bảo hành</Option>
              <Option value="custom">Tùy chỉnh khác</Option>
            </Select>
          </Form.Item>

          <Form.Item name="content_preview" label="Nội dung mẫu (Chỉ để xem và dễ nhớ)">
            <Input.TextArea rows={3} placeholder="Ví dụ: Xin chào <ten_khach_hang>, đơn hàng <ma_don_hang> của bạn đã được xác nhận..." />
          </Form.Item>

          <Form.Item 
            name="params_schema" 
            label={
              <span>
                Cấu trúc Tham số (JSON)
                <Tooltip title="Các tham số (biến) mà Zalo yêu cầu truyền vào mẫu này. Định dạng JSON mapping giữa key tham số và mô tả.">
                  <InfoCircleOutlined style={{ marginLeft: 6, color: '#9ca3af' }} />
                </Tooltip>
              </span>
            }
            rules={[{ required: true, message: 'Vui lòng nhập cấu trúc JSON' }]}
          >
            <Input.TextArea rows={4} style={{ fontFamily: 'monospace' }} />
          </Form.Item>

          <Form.Item name="is_active" label="Trạng thái" valuePropName="checked">
            <Switch checkedChildren="Hoạt động" unCheckedChildren="Tạm dừng" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
