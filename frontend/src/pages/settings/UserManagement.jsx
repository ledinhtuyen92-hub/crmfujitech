import {
  DeleteOutlined,
  EditOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  PlusOutlined,
  UnlockOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Avatar,
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
import { useAuth } from '../../contexts/AuthContext'
import { useResponsive } from '../../hooks/useResponsive'
import api from '../../utils/api'

const { Title, Text } = Typography

// Màu avatar ngẫu nhiên theo tên
const avatarColors = ['#2563eb', '#7c3aed', '#dc2626', '#d97706', '#059669', '#0891b2']
function getAvatarColor(name) {
  const idx = (name?.charCodeAt(0) ?? 0) % avatarColors.length
  return avatarColors[idx]
}
function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export default function UserManagement() {
  const { token } = theme.useToken()
  const { user: currentUser, checkMaintenance } = useAuth()
  const { isMobile } = useResponsive()
  const [messageApi, contextHolder] = message.useMessage()

  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  
  // State xoá nhân viên
  const [deletingUser, setDeletingUser] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // State tìm kiếm & lọc
  const [searchText, setSearchText] = useState('')
  const [selectedDepId, setSelectedDepId] = useState(undefined)

  const [form] = Form.useForm()

  const fetchData = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    try {
      const [usersRes, rolesRes, depsRes] = await Promise.all([
        api.get('users/users/'),
        api.get('users/roles/'),
        api.get('users/departments/'),
      ])
      const usersData = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.results ?? []
      const rolesData = Array.isArray(rolesRes.data) ? rolesRes.data : rolesRes.data?.results ?? []
      const depsData = Array.isArray(depsRes.data) ? depsRes.data : depsRes.data?.results ?? []
      setUsers(usersData)
      setRoles(rolesData)
      setDepartments(depsData)
    } catch {
      messageApi.error('Không thể tải dữ liệu nhân viên.')
    } finally {
      setLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Modal ─────────────────────────────────────────────────────────
  const openModal = (user = null) => {
    if (checkMaintenance()) return
    setEditingUser(user)
    form.setFieldsValue(
      user
        ? {
            full_name: user.full_name,
            email: user.email,
            username: user.username,
            phone: user.phone,
            job_title: user.job_title,
            role: user.role,
            department: user.department,
            is_active: user.is_active,
            is_company_admin: user.is_company_admin,
            is_auto_assign_target: user.is_auto_assign_target,
            password: '',
          }
        : {
            full_name: '',
            email: '',
            username: '',
            phone: '',
            job_title: '',
            role: undefined,
            department: undefined,
            is_active: true,
            is_company_admin: false,
            is_auto_assign_target: false,
            password: '',
          },
    )
    setModalOpen(true)
  }

  const handleSubmit = async (values) => {
    const payload = { ...values }
    // Xóa password nếu để trống khi sửa
    if (!payload.password) delete payload.password

    try {
      if (editingUser) {
        await api.patch(`users/users/${editingUser.id}/`, payload)
        messageApi.success('Cập nhật nhân viên thành công.')
      } else {
        await api.post('users/users/', payload)
        messageApi.success('Tạo tài khoản nhân viên thành công.')
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

  const toggleActive = async (user) => {
    if (checkMaintenance()) return
    try {
      await api.patch(`users/users/${user.id}/`, { is_active: !user.is_active })
      messageApi.success(user.is_active ? 'Đã khóa tài khoản.' : 'Đã kích hoạt tài khoản.')
      fetchData()
    } catch {
      messageApi.error('Không thể thay đổi trạng thái.')
    }
  }

  const handleDelete = async () => {
    if (!deletingUser) return
    if (deleteConfirmText !== deletingUser.username) {
      messageApi.error('Tên đăng nhập không khớp. Vui lòng nhập lại.')
      return
    }
    try {
      await api.delete(`users/users/${deletingUser.id}/`)
      messageApi.success(`Đã xóa tài khoản ${deletingUser.username} và tự động chuyển giao dữ liệu cho Admin công ty.`)
      setDeletingUser(null)
      setDeleteConfirmText('')
      fetchData()
    } catch {
      messageApi.error('Không thể xóa tài khoản này.')
    }
  }

  // ── Columns ───────────────────────────────────────────────────────
  const columns = [
    {
      title: 'Nhân viên',
      key: 'user',
      render: (_, record) => (
        <Space>
          <Avatar
            size={40}
            style={{
              background: `linear-gradient(135deg, ${getAvatarColor(record.full_name)} 0%, #1e3a8a 100%)`,
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {getInitials(record.full_name)}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600, color: token.colorText }}>{record.full_name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              @{record.username}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Liên hệ',
      key: 'contact',
      render: (_, record) => (
        <div>
          <div style={{ fontSize: 13 }}>
            <MailOutlined style={{ marginRight: 4, color: token.colorTextSecondary }} />
            {record.email}
          </div>
          {record.phone && (
            <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 2 }}>
              <PhoneOutlined style={{ marginRight: 4 }} />
              {record.phone}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Vị trí / Vai trò',
      key: 'role',
      render: (_, record) => (
        <div>
          <Space direction="vertical" size={2}>
            {record.department_name ? (
              <Tag color="geekblue" style={{ fontWeight: 600 }}>
                {record.department_name}
              </Tag>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>Chưa gán phòng</Text>
            )}
            {record.role_name ? (
              <Tag color="purple" style={{ fontWeight: 600 }}>
                {record.role_name}
              </Tag>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>Chưa gán quyền</Text>
            )}
          </Space>
          {record.job_title && (
            <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
              {record.job_title}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Phân quyền',
      key: 'admin',
      align: 'center',
      render: (_, record) => (
        <div>
          {record.is_company_admin && (
            <Tag color="gold" style={{ fontWeight: 600 }}>
              Admin công ty
            </Tag>
          )}
          {!record.is_company_admin && (
            <Tag color="default">Nhân viên</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      align: 'center',
      render: (_, record) =>
        record.is_active ? (
          <Tag color="success">Đang làm việc</Tag>
        ) : (
          <Tag color="error">Đã khóa</Tag>
        ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'center',
      render: (_, record) => {
        const isSelf = record.id === currentUser?.id
        return (
          <Space>
            <Tooltip title="Chỉnh sửa">
              <Button type="text" icon={<EditOutlined />} onClick={() => openModal(record)} />
            </Tooltip>
            <Tooltip title={record.is_active ? 'Khóa tài khoản' : 'Mở khóa'}>
              <Button
                type="text"
                danger={record.is_active}
                icon={record.is_active ? <LockOutlined /> : <UnlockOutlined />}
                disabled={isSelf}
                onClick={() => toggleActive(record)}
              />
            </Tooltip>
            {!isSelf && (
              <Tooltip title="Xóa">
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => { if (!checkMaintenance()) setDeletingUser(record) }}
                />
              </Tooltip>
            )}
          </Space>
        )
      },
    },
  ]

  const filteredUsers = users.filter((u) => {
    if (selectedDepId && u.department !== selectedDepId) return false
    if (!searchText) return true
    const searchLower = searchText.toLowerCase()
    return (
      (u.username || '').toLowerCase().includes(searchLower) ||
      (u.full_name || '').toLowerCase().includes(searchLower) ||
      (u.email || '').toLowerCase().includes(searchLower) ||
      (u.phone || '').toLowerCase().includes(searchLower) ||
      (u.job_title || '').toLowerCase().includes(searchLower)
    )
  })

  return (
    <div id="user-management-page">
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
          <Title level={2} style={{ margin: 0 }}>
            Quản lý Nhân viên
          </Title>
          <Text type="secondary">
            Tạo tài khoản, gán chức danh và phân quyền cho nhân viên trong công ty
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => openModal()}
          style={{ background: '#1649c9' }}
          id="btn-add-user"
        >
          Thêm nhân viên
        </Button>
      </div>

      <Card style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(15,23,42,0.08)' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <Input.Search
            placeholder="Tìm kiếm theo tên, tài khoản, email, SĐT..."
            allowClear
            style={{ width: isMobile ? '100%' : 320 }}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Lọc theo Phòng ban"
            allowClear
            style={{ width: isMobile ? '100%' : 250 }}
            value={selectedDepId}
            onChange={setSelectedDepId}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
        {isMobile ? (
          <List
            dataSource={filteredUsers}
            loading={loading}
            pagination={{ pageSize: 10, size: 'small' }}
            renderItem={(record) => {
              const isSelf = record.id === currentUser?.id
              return (
                <List.Item style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block', background: '#fff' }}>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <Avatar
                      size={48}
                      style={{
                        background: `linear-gradient(135deg, ${getAvatarColor(record.full_name)} 0%, #1e3a8a 100%)`,
                        fontWeight: 700,
                        fontSize: 16,
                        flexShrink: 0,
                      }}
                    >
                      {getInitials(record.full_name)}
                    </Avatar>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: token.colorText, fontSize: 15 }}>{record.full_name}</div>
                      <Text type="secondary" style={{ fontSize: 13 }}>@{record.username}</Text>
                      {record.is_company_admin ? (
                        <Tag color="gold" style={{ fontWeight: 600, marginTop: 4, display: 'block', width: 'fit-content' }}>Admin công ty</Tag>
                      ) : (
                        <Tag color="default" style={{ marginTop: 4, display: 'block', width: 'fit-content' }}>Nhân viên</Tag>
                      )}
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 13, marginBottom: 4 }}><MailOutlined style={{ marginRight: 6, color: token.colorTextSecondary }} />{record.email}</div>
                    {record.phone && <div style={{ fontSize: 13 }}><PhoneOutlined style={{ marginRight: 6, color: token.colorTextSecondary }} />{record.phone}</div>}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {record.department_name ? (
                      <Tag color="geekblue" style={{ fontWeight: 600, margin: 0 }}>{record.department_name}</Tag>
                    ) : (
                      <Tag style={{ margin: 0 }}>Chưa gán phòng</Tag>
                    )}
                    {record.role_name ? (
                      <Tag color="purple" style={{ fontWeight: 600, margin: 0 }}>{record.role_name}</Tag>
                    ) : (
                      <Tag style={{ margin: 0 }}>Chưa gán quyền</Tag>
                    )}
                    {record.job_title && <Text type="secondary" style={{ fontSize: 12, width: '100%' }}>Chức danh: {record.job_title}</Text>}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #f0f0f0', paddingTop: 12 }}>
                    {record.is_active ? <Tag color="success" style={{ margin: 0 }}>Đang làm việc</Tag> : <Tag color="error" style={{ margin: 0 }}>Đã khóa</Tag>}
                    <Space size="small">
                      <Button type="text" icon={<EditOutlined style={{ color: '#1677ff' }}/>} onClick={() => openModal(record)} />
                      <Button type="text" danger={record.is_active} icon={record.is_active ? <LockOutlined /> : <UnlockOutlined />} disabled={isSelf} onClick={() => toggleActive(record)} />
                      {!isSelf && <Button type="text" danger icon={<DeleteOutlined />} onClick={() => { if (!checkMaintenance()) setDeletingUser(record) }} />}
                    </Space>
                  </div>
                </List.Item>
              )
            }}
          />
        ) : (
          <Table scroll={{ x: 'max-content' }}
            id="user-table"
            columns={columns}
            dataSource={filteredUsers}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showTotal: (total) => `${total} nhân viên` }}
          />
        )}
      </Card>

      {/* ── Modal ──────────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <UserOutlined />
            <span>
              {editingUser ? `Sửa: ${editingUser.full_name}` : 'Thêm nhân viên mới'}
            </span>
          </Space>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
        width={580}
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Row gutter={12}>
            <Col xs={24} md={14}>
              <Form.Item
                name="full_name"
                label="Họ và tên"
                rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
              >
                <Input size="large" placeholder="Nguyễn Văn An" />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="phone" label="Số điện thoại">
                <Input size="large" placeholder="0901234567" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Vui lòng nhập email' },
                  { type: 'email', message: 'Email không hợp lệ' },
                ]}
              >
                <Input size="large" placeholder="nhanvien@congty.vn" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="username"
                label="Tên đăng nhập"
                rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }]}
              >
                <Input size="large" placeholder="nguyenvanan" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={24}>
              <Form.Item name="job_title" label="Chức danh">
                <Input size="large" placeholder="Vd: Giám đốc Kinh doanh" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="department" label="Phòng ban">
                <Select
                  size="large"
                  placeholder="Chọn phòng ban..."
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="role" label="Vai trò (nhóm quyền)">
                <Select
                  size="large"
                  placeholder="Chọn vai trò..."
                  options={roles.map((r) => ({ value: r.id, label: r.name }))}
                  allowClear
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="password"
            label={editingUser ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'}
            rules={
              editingUser
                ? []
                : [
                    { required: true, message: 'Vui lòng nhập mật khẩu' },
                    { min: 8, message: 'Tối thiểu 8 ký tự' },
                  ]
            }
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder={editingUser ? '••••••••' : 'Tối thiểu 8 ký tự'}
            />
          </Form.Item>

          <Divider style={{ margin: '8px 0 16px' }} />

          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item name="is_active" label="Tình trạng" valuePropName="checked">
                <Switch checkedChildren="Đang làm việc" unCheckedChildren="Đã nghỉ việc" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="is_company_admin" label="Quyền Admin công ty" valuePropName="checked">
                <Switch checkedChildren="Admin" unCheckedChildren="Nhân viên" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.role !== currentValues.role}
          >
            {({ getFieldValue }) => {
              const selectedRoleId = getFieldValue('role');
              const selectedRole = roles.find((r) => r.id === selectedRoleId);
              const hasAutoAssignRole = selectedRole && selectedRole.is_auto_assign_target;

              if (hasAutoAssignRole) return null;

              return (
                <Row gutter={24}>
                  <Col xs={24} md={24}>
                    <Form.Item name="is_auto_assign_target" label="Nhận khách tự động (Quyền mở rộng)" valuePropName="checked" help="Hiển thị do tài khoản đang không có Nhóm quyền nhận khách. Bật lên nếu muốn tài khoản này được nhận khách.">
                      <Switch checkedChildren="Có nhận" unCheckedChildren="Không nhận" />
                    </Form.Item>
                  </Col>
                </Row>
              );
            }}
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ background: '#1649c9' }}>
              {editingUser ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* ── Modal Xác Nhận Xóa ───────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <DeleteOutlined style={{ color: token.colorError }} />
            <span style={{ color: token.colorError }}>Xóa tài khoản vĩnh viễn</span>
          </Space>
        }
        open={!!deletingUser}
        onCancel={() => {
          setDeletingUser(null)
          setDeleteConfirmText('')
        }}
        onOk={handleDelete}
        okText="Xóa vĩnh viễn"
        cancelText="Hủy"
        okButtonProps={{ danger: true, disabled: deleteConfirmText !== deletingUser?.username }}
      >
        <div style={{ marginBottom: 16 }}>
          Hành động này <strong>không thể hoàn tác</strong>.
          <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', padding: '8px 12px', borderRadius: 6, margin: '10px 0', color: '#d46b08', fontSize: 13 }}>
            ℹ️ <strong>Lưu ý:</strong> Toàn bộ dữ liệu (Đơn hàng, Báo giá, Lịch sử chăm sóc, v.v.) sẽ được <strong>tự động chuyển giao cho Admin công ty</strong>. Riêng Khách hàng do nhân viên này phụ trách sẽ được chuyển thành <strong>"Chưa có nhân viên phụ trách"</strong> để thuận tiện phân bổ lại.
          </div>
          Vui lòng nhập tên đăng nhập <Text strong type="danger">{deletingUser?.username}</Text> để xác nhận:
        </div>
        <Input
          placeholder={`Nhập ${deletingUser?.username}`}
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          onPressEnter={handleDelete}
        />
      </Modal>
    </div>
  )
}
