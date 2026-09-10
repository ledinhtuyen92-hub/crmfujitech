import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
  List,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import api from '../../utils/api'
import { useAuth } from '../../contexts/AuthContext'
import { useResponsive } from '../../hooks/useResponsive'

const { Title, Text } = Typography

export default function FactoryManagement() {
  const { token } = theme.useToken()
  const { checkMaintenance } = useAuth()
  const { isMobile } = useResponsive()
  const [messageApi, contextHolder] = message.useMessage()

  const [factories, setFactories] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingFactory, setEditingFactory] = useState(null)
  
  // State xoá
  const [deletingFactory, setDeletingFactory] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const [form] = Form.useForm()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [factoriesRes, warehousesRes] = await Promise.all([
        api.get('production/factories/'),
        api.get('inventory/warehouses/'),
      ])
      const factoriesData = Array.isArray(factoriesRes.data) ? factoriesRes.data : factoriesRes.data?.results ?? []
      const warehousesData = Array.isArray(warehousesRes.data) ? warehousesRes.data : warehousesRes.data?.results ?? []
      setFactories(factoriesData)
      setWarehouses(warehousesData)
    } catch {
      messageApi.error('Không thể tải dữ liệu nhà máy.')
    } finally {
      setLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Modal Tạo / Sửa ───────────────────────────────────────────────
  const openModal = (factory = null) => {
    if (checkMaintenance()) return
    setEditingFactory(factory)
    form.setFieldsValue({
      name: factory?.name ?? '',
      location: factory?.location ?? '',
      linked_warehouse: factory?.linked_warehouse ?? null,
      is_active: factory?.is_active ?? true,
    })
    setModalOpen(true)
  }

  const handleSubmit = async (values) => {
    try {
      if (editingFactory) {
        await api.patch(`production/factories/${editingFactory.id}/`, values)
        messageApi.success('Cập nhật nhà máy thành công.')
      } else {
        await api.post('production/factories/', values)
        messageApi.success('Tạo nhà máy thành công.')
      }
      setModalOpen(false)
      fetchData()
    } catch (err) {
      const errors = err.response?.data
      if (errors && typeof errors === 'object') {
        messageApi.error(Object.values(errors).flat().join(' '))
      } else {
        messageApi.error('Có lỗi xảy ra, vui lòng thử lại sau.')
      }
    }
  }

  // ── Xóa Nhà máy ──────────────────────────────────────────────────
  const openDeleteModal = (factory) => {
    if (checkMaintenance()) return
    setDeletingFactory(factory)
    setDeleteConfirmText('')
  }

  const handleDelete = async () => {
    if (deleteConfirmText !== deletingFactory.name) {
      messageApi.error('Vui lòng nhập đúng tên nhà máy để xác nhận.')
      return
    }
    try {
      await api.delete(`production/factories/${deletingFactory.id}/`)
      messageApi.success('Đã xoá nhà máy.')
      setDeletingFactory(null)
      fetchData()
    } catch (err) {
      const detail = err.response?.data?.detail || 'Không thể xóa nhà máy (có thể do nhà máy đã được gán vào lệnh sản xuất).'
      messageApi.error(detail)
    }
  }

  // ── Table Columns ────────────────────────────────────────────────
  const columns = [
    {
      title: 'Tên nhà máy',
      dataIndex: 'name',
      key: 'name',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Địa chỉ',
      dataIndex: 'location',
      key: 'location',
    },
    {
      title: 'Kho liên kết',
      dataIndex: 'linked_warehouse_name',
      key: 'linked_warehouse_name',
      render: (text) => text || <Text type="secondary">Chưa liên kết</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive) => (
        <Tag color={isActive ? 'success' : 'default'}>
          {isActive ? 'Hoạt động' : 'Tạm ngưng'}
        </Tag>
      ),
    },
    {
      title: 'Hành động',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Tooltip title="Chỉnh sửa">
            <Button
              type="text"
              icon={<EditOutlined style={{ color: token.colorPrimary }} />}
              onClick={() => openModal(record)}
            />
          </Tooltip>
          <Tooltip title="Xoá">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => openDeleteModal(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title={
        <Space>
          <ToolOutlined style={{ color: token.colorPrimary }} />
          <Title level={4} style={{ margin: 0 }}>
            Cấu hình Nhà máy Sản xuất
          </Title>
        </Space>
      }
      extra={
        !isMobile && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openModal()}
          >
            Thêm nhà máy
          </Button>
        )
      }
      styles={{ body: { padding: '16px 24px' } }}
      bordered={false}
    >
      {contextHolder}
      {isMobile && (
        <div style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openModal()}
            block
          >
            Thêm nhà máy
          </Button>
        </div>
      )}
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Thiết lập các xưởng / nhà máy sản xuất của công ty và liên kết với Kho vật tư mặc định.
        Hệ thống sẽ dựa vào liên kết này để tự động gợi ý nhà máy tương ứng khi xuất kho.
      </Typography.Paragraph>

      {isMobile ? (
        <List
          dataSource={factories}
          loading={loading}
          pagination={{ pageSize: 25, size: 'small' }}
          renderItem={(item) => (
            <List.Item style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                <Text strong style={{ fontSize: 15, color: '#4f46e5' }}>{item.name}</Text>
                <Tag color={item.is_active ? 'success' : 'default'} style={{ margin: 0 }}>
                  {item.is_active ? 'Hoạt động' : 'Tạm ngưng'}
                </Tag>
              </div>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>Địa chỉ: </Text>
                <Text>{item.location || '—'}</Text>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>Kho liên kết: </Text>
                {item.linked_warehouse_name ? <Text>{item.linked_warehouse_name}</Text> : <Text type="secondary">Chưa liên kết</Text>}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button
                  type="text"
                  icon={<EditOutlined style={{ color: token.colorPrimary }} />}
                  onClick={() => openModal(item)}
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => openDeleteModal(item)}
                />
              </div>
            </List.Item>
          )}
        />
      ) : (
        <Table
          scroll={{ x: 'max-content' }}
          columns={columns}
          dataSource={factories}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 25 }}
        />
      )}

      <Modal
        title={editingFactory ? 'Chỉnh sửa nhà máy' : 'Thêm nhà máy mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
        width={isMobile ? '95vw' : 520}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ is_active: true }}
          style={{ marginTop: 24 }}
        >
          <Form.Item
            name="name"
            label="Tên nhà máy"
            rules={[{ required: true, message: 'Vui lòng nhập tên nhà máy!' }]}
          >
            <Input placeholder="VD: Nhà máy mộc số 1" />
          </Form.Item>

          <Form.Item
            name="location"
            label="Địa chỉ"
          >
            <Input placeholder="VD: Lô 12 Khu Công Nghiệp..." />
          </Form.Item>

          <Form.Item
            name="linked_warehouse"
            label="Kho liên kết mặc định"
            tooltip="Hệ thống sẽ ưu tiên chọn Nhà máy này nếu vật tư được xuất từ kho liên kết."
          >
            <Select
              placeholder="Chọn kho vật tư"
              allowClear
              options={warehouses.map((w) => ({
                label: w.name,
                value: w.id,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="is_active"
            valuePropName="checked"
            label="Trạng thái hoạt động"
          >
            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
          </Form.Item>

          <Divider />
          <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit">
              Lưu lại
            </Button>
          </Space>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <DeleteOutlined style={{ color: token.colorError }} />
            <Text strong>Xác nhận xóa nhà máy</Text>
          </Space>
        }
        open={!!deletingFactory}
        onCancel={() => setDeletingFactory(null)}
        footer={null}
      >
        <Typography.Paragraph style={{ marginTop: 16 }}>
          Bạn sắp xoá nhà máy <Text strong>{deletingFactory?.name}</Text>. Hành động này không thể hoàn tác và chỉ thực hiện được nếu nhà máy chưa có lệnh sản xuất nào.
        </Typography.Paragraph>
        <Typography.Paragraph>
          Vui lòng nhập lại tên <Text strong>{deletingFactory?.name}</Text> để xác nhận:
        </Typography.Paragraph>
        <Input
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          placeholder={`Nhập "${deletingFactory?.name}"`}
          style={{ marginBottom: 24 }}
        />
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={() => setDeletingFactory(null)}>Hủy</Button>
          <Button
            danger
            type="primary"
            disabled={deleteConfirmText !== deletingFactory?.name}
            onClick={handleDelete}
          >
            Đồng ý xóa
          </Button>
        </Space>
      </Modal>
    </Card>
  )
}
