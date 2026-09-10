import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  TeamOutlined,
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

export default function DepartmentManagement() {
  const { token } = theme.useToken()
  const { checkMaintenance } = useAuth()
  const { isMobile } = useResponsive()
  const [messageApi, contextHolder] = message.useMessage()

  const [departments, setDepartments] = useState([])
  const [users, setUsers] = useState([])
  const [factories, setFactories] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState(null)
  
  // State xoá
  const [deletingDepartment, setDeletingDepartment] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const [form] = Form.useForm()

  const fetchData = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    try {
      const [depsRes, usersRes, factoriesRes] = await Promise.all([
        api.get('users/departments/'),
        api.get('users/users/'),
        api.get('production/factories/'),
      ])
      const depsData = Array.isArray(depsRes.data) ? depsRes.data : depsRes.data?.results ?? []
      const usersData = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.results ?? []
      const factoriesData = Array.isArray(factoriesRes.data) ? factoriesRes.data : factoriesRes.data?.results ?? []
      setDepartments(depsData)
      setUsers(usersData)
      setFactories(factoriesData)
    } catch {
      messageApi.error('Không thể tải dữ liệu phòng ban.')
    } finally {
      setLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Modal Tạo / Sửa ───────────────────────────────────────────────
  const openModal = (department = null) => {
    if (checkMaintenance()) return
    setEditingDepartment(department)
    form.setFieldsValue({
      name: department?.name ?? '',
      description: department?.description ?? '',
      manager: department?.manager ?? null,
      factory: department?.factory ?? null,
      is_sales_department: department?.is_sales_department ?? false,
    })
    setModalOpen(true)
  }

  const handleSubmit = async (values) => {
    try {
      const payload = {
        ...values,
        manager: values.manager === undefined ? null : values.manager,
        factory: values.factory === undefined ? null : values.factory,
      }
      
      if (editingDepartment) {
        await api.patch(`users/departments/${editingDepartment.id}/`, payload)
        messageApi.success('Cập nhật phòng ban thành công.')
      } else {
        await api.post('users/departments/', payload)
        messageApi.success('Tạo phòng ban thành công.')
      }
      setModalOpen(false)
      fetchData()
    } catch (err) {
      const errors = err.response?.data
      if (errors && typeof errors === 'object') {
        messageApi.error(Object.values(errors).flat().join(' '))
      } else {
        messageApi.error('Có lỗi xảy ra.')
      }
    }
  }

  const confirmDelete = async () => {
    if (deleteConfirmText !== deletingDepartment.name) {
      messageApi.error('Tên phòng ban không khớp, vui lòng nhập lại.')
      return
    }
    try {
      await api.delete(`users/departments/${deletingDepartment.id}/`)
      messageApi.success('Đã xóa phòng ban.')
      setDeletingDepartment(null)
      setDeleteConfirmText('')
      fetchData()
    } catch {
      messageApi.error('Không thể xóa phòng ban này.')
    }
  }

  // ── Columns ───────────────────────────────────────────────────────
  const columns = [
    {
      title: 'Tên phòng ban',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: token.colorText }}>{name}</div>
          {record.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.description}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Trưởng phòng',
      dataIndex: 'manager_name',
      key: 'manager_name',
      render: (managerName) => (
        <Text strong style={{ color: managerName ? token.colorPrimary : token.colorTextDisabled }}>
          {managerName || 'Chưa phân công'}
        </Text>
      ),
    },
    {
      title: 'Thống kê Doanh số',
      key: 'is_sales_department',
      align: 'center',
      render: (_, record) => (
        record.is_sales_department ? <Tag color="green">Có</Tag> : <Text type="secondary">Không</Text>
      ),
    },
    {
      title: 'Nhân sự',
      key: 'user_count',
      align: 'center',
      render: (_, record) => (
        <Tag color="purple" icon={<TeamOutlined />}>
          {record.user_count ?? 0} người
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'center',
      render: (_, record) => (
        <Space>
          <Tooltip title="Chỉnh sửa">
            <Button type="text" icon={<EditOutlined />} onClick={() => openModal(record)} />
          </Tooltip>
          <Tooltip title="Xóa">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                if (!checkMaintenance()) {
                  setDeletingDepartment(record)
                  setDeleteConfirmText('')
                }
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div id="department-management-page">
      {contextHolder}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 28,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <Title level={isMobile ? 3 : 2} style={{ margin: 0 }}>
            Quản lý Phòng ban
          </Title>
          <Text type="secondary">
            Thiết lập phòng ban và quản lý nhân sự theo từng bộ phận
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => openModal()}
          style={{ background: '#1649c9' }}
        >
          Thêm phòng ban
        </Button>
      </div>

      <Card style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(15,23,42,0.08)' }}>
        {isMobile ? (
          <List
            dataSource={departments}
            loading={loading}
            pagination={{ pageSize: 25, size: 'small' }}
            renderItem={(record) => (
              <List.Item style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: token.colorText }}>{record.name}</div>
                    {record.description && <Text type="secondary" style={{ fontSize: 13 }}>{record.description}</Text>}
                  </div>
                  <Tag color="purple" icon={<TeamOutlined />}>{record.user_count ?? 0} người</Tag>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 13 }}>Trưởng phòng:</Text>{' '}
                    <Text strong style={{ color: record.manager_name ? token.colorPrimary : token.colorTextDisabled, fontSize: 13 }}>
                      {record.manager_name || 'Chưa phân công'}
                    </Text>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 13 }}>Thống kê Doanh số:</Text>{' '}
                    {record.is_sales_department ? <Tag color="green" style={{ margin: 0 }}>Có</Tag> : <Text type="secondary" style={{ fontSize: 13 }}>Không</Text>}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px dashed #f0f0f0', paddingTop: 12 }}>
                  <Space size="small">
                    <Button type="text" icon={<EditOutlined style={{ color: '#1677ff' }}/>} onClick={() => openModal(record)} />
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => { if (!checkMaintenance()) { setDeletingDepartment(record); setDeleteConfirmText(''); } }} />
                  </Space>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Table scroll={{ x: 'max-content' }}
            id="department-table"
            columns={columns}
            dataSource={departments}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 25 }}
          />
        )}
      </Card>

      {/* ── Modal Tạo / Sửa ────────────────────────────────────── */}
      <Modal
        title={editingDepartment ? `Sửa phòng ban: ${editingDepartment.name}` : 'Thêm phòng ban mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
        width={isMobile ? '95vw' : 500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="Tên phòng ban"
            rules={[{ required: true, message: 'Vui lòng nhập tên phòng ban' }]}
          >
            <Input size="large" placeholder="VD: Phòng Kinh doanh 1, Phòng Marketing..." />
          </Form.Item>
          
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Mô tả chức năng nhiệm vụ..." />
          </Form.Item>

          <Form.Item
            name="manager"
            label="Trưởng phòng (Quản lý)"
            help="Trưởng phòng có thể xem dữ liệu của toàn bộ nhân viên thuộc phòng ban này."
          >
            <Select
              size="large"
              placeholder="Chọn trưởng phòng..."
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={users.map((u) => ({
                value: u.id,
                label: `${u.full_name} (${u.username})`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="factory"
            label="Nhà máy trực thuộc"
            help="Nếu bộ phận này là tổ sản xuất/chuyền may... hãy chọn nhà máy tương ứng để hệ thống phân quyền tự động."
          >
            <Select
              size="large"
              placeholder="Chọn nhà máy (Bỏ trống nếu là văn phòng)"
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={factories.map((f) => ({
                value: f.id,
                label: f.name,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="is_sales_department"
            valuePropName="checked"
            help="Bật tùy chọn này để hệ thống tính doanh số của các nhân viên trong phòng ban này vào bảng xếp hạng Sales Tốt/Yếu nhất."
          >
            <Switch checkedChildren="Có thống kê" unCheckedChildren="Không" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ background: '#1649c9' }}>
              {editingDepartment ? 'Lưu thay đổi' : 'Tạo phòng ban'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* ── Modal Xoá ──────────────────────────────────────────── */}
      <Modal
        title={
          <Space style={{ color: token.colorError }}>
            <DeleteOutlined />
            <span>Xác nhận xoá phòng ban</span>
          </Space>
        }
        open={!!deletingDepartment}
        onCancel={() => {
          setDeletingDepartment(null)
          setDeleteConfirmText('')
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setDeletingDepartment(null)
              setDeleteConfirmText('')
            }}
          >
            Huỷ
          </Button>,
          <Button
            key="delete"
            danger
            type="primary"
            disabled={deleteConfirmText !== deletingDepartment?.name}
            onClick={confirmDelete}
          >
            Xoá vĩnh viễn
          </Button>,
        ]}
      >
        <div style={{ marginTop: 16 }}>
          <Text>
            Bạn đang chuẩn bị xoá phòng ban <Text strong>{deletingDepartment?.name}</Text>. 
            Hành động này sẽ xoá phòng ban khỏi hệ thống (nhân viên thuộc phòng này sẽ bị gỡ phòng ban).
          </Text>
          <Divider />
          <Text>
            Vui lòng nhập lại chính xác tên phòng ban <b>{deletingDepartment?.name}</b> để xác nhận.
          </Text>
          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="Nhập tên phòng ban..."
            style={{ marginTop: 8 }}
          />
        </div>
      </Modal>
    </div>
  )
}
