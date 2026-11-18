import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  LockOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Avatar,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
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
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import api from '../../utils/api'

const { Title, Text } = Typography

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

export default function SystemUserManagement() {
  const { token } = theme.useToken()
  const [messageApi, contextHolder] = message.useMessage()

  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [roles, setRoles] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(false)
  
  // States for Modals
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false)
  const [resettingUser, setResettingUser] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [deletingUser, setDeletingUser] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Filters
  const [selectedCompanyId, setSelectedCompanyId] = useState(null)
  const [searchText, setSearchText] = useState('')

  const [form] = Form.useForm()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const companyQuery = selectedCompanyId ? `?company=${selectedCompanyId}` : ''
      const [usersRes, companiesRes] = await Promise.all([
        api.get(`users/users/${companyQuery}`),
        api.get('users/companies/'),
      ])
      const usersData = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.results ?? []
      const companiesData = Array.isArray(companiesRes.data) ? companiesRes.data : companiesRes.data?.results ?? []
      
      setUsers(usersData)
      setCompanies(companiesData)
    } catch {
      messageApi.error('Không thể tải dữ liệu.')
    } finally {
      setLoading(false)
    }
  }, [messageApi, selectedCompanyId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Lấy roles và departments khi chọn company trong form tạo/sửa
  const fetchCompanyDetails = async (companyId) => {
    if (!companyId) {
      setRoles([])
      setDepartments([])
      return
    }
    try {
      const [rolesRes, depsRes] = await Promise.all([
        api.get(`users/roles/?company=${companyId}`),
        api.get(`users/departments/?company=${companyId}`),
      ])
      const allRoles = Array.isArray(rolesRes.data) ? rolesRes.data : rolesRes.data?.results ?? []
      const allDeps = Array.isArray(depsRes.data) ? depsRes.data : depsRes.data?.results ?? []
      setRoles(allRoles.filter(r => !r.company || r.company === companyId))
      setDepartments(allDeps.filter(d => !d.company || d.company === companyId))
    } catch {
      messageApi.error('Không thể tải danh sách vai trò và phòng ban của công ty này.')
    }
  }

  // ── Modals ─────────────────────────────────────────────────────────
  const openModal = async (user = null) => {
    setEditingUser(user)
    const compId = user?.company || selectedCompanyId
    if (compId) {
      await fetchCompanyDetails(compId)
    } else {
      setRoles([])
      setDepartments([])
    }
    
    form.setFieldsValue(
      user
        ? {
            full_name: user.full_name,
            email: user.email,
            username: user.username,
            phone: user.phone,
            job_title: user.job_title,
            company_id: user.company,
            role: user.role,
            department: user.department,
            extra_departments: user.extra_departments || [],
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
            company_id: selectedCompanyId || null,
            role: undefined,
            department: undefined,
            extra_departments: [],
            is_active: true,
            is_company_admin: false,
            is_auto_assign_target: false,
            password: '',
          },
    )
    setModalOpen(true)
  }

  const handleCompanyChange = (value) => {
    form.setFieldsValue({ role: undefined, department: undefined, extra_departments: [] })
    fetchCompanyDetails(value)
  }

  const handleSubmit = async (values) => {
    const payload = { ...values }
    if (!payload.password) delete payload.password

    // explicitly clear undefined select values for DRF PATCH
    if (payload.department === undefined) payload.department = null;
    if (payload.role === undefined) payload.role = null;
    if (payload.extra_departments === undefined) payload.extra_departments = [];

    try {
      if (editingUser) {
        await api.patch(`users/users/${editingUser.id}/`, payload)
        messageApi.success('Cập nhật nhân viên thành công.')
      } else {
        await api.post('users/users/', payload)
        messageApi.success('Tạo tài khoản thành công.')
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

  const handleDelete = async () => {
    if (!deletingUser) return
    if (deleteConfirmText !== deletingUser.username) {
      messageApi.error('Tên đăng nhập không khớp. Vui lòng nhập lại.')
      return
    }

    if (deletingUser.is_superuser) {
      messageApi.error('Không thể xoá tài khoản Quản trị hệ thống (Superadmin)!')
      return
    }
    try {
      await api.delete(`users/users/${deletingUser.id}/`)
      messageApi.success(`Đã xoá tài khoản ${deletingUser.username} và tự động chuyển giao dữ liệu thành công.`)
      setDeletingUser(null)
      setDeleteConfirmText('')
      fetchData()
    } catch {
      messageApi.error('Không thể xoá tài khoản này.')
    }
  }

  const toggleActive = async (user) => {
    if (user.is_superuser) {
      messageApi.error('Không thể khoá/mở tài khoản Quản trị hệ thống (Superadmin)!')
      return
    }
    try {
      await api.patch(`users/users/${user.id}/`, { is_active: !user.is_active })
      messageApi.success(user.is_active ? 'Đã khóa tài khoản.' : 'Đã kích hoạt tài khoản.')
      fetchData()
    } catch {
      messageApi.error('Không thể thay đổi trạng thái.')
    }
  }

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      messageApi.error('Mật khẩu mới phải có ít nhất 6 ký tự.')
      return
    }
    try {
      await api.post(`users/users/${resettingUser.id}/reset_password/`, { new_password: newPassword })
      messageApi.success(`Đã đặt lại mật khẩu cho tài khoản ${resettingUser.username}.`)
      setResetPasswordModalOpen(false)
      setNewPassword('')
    } catch (err) {
      const errors = err.response?.data
      if (errors && typeof errors === 'object') {
        messageApi.error(Object.values(errors).flat().join(' '))
      } else {
        messageApi.error('Không thể đặt lại mật khẩu.')
      }
    }
  }

  // ── Columns ──────────────────────────────────────────────────────
  const columns = [
    {
      title: 'Tài khoản',
      key: 'account',
      render: (_, record) => {
        const isBanned = !record.is_active
        return (
          <Space>
            <Avatar
              style={{
                backgroundColor: isBanned ? '#d9d9d9' : getAvatarColor(record.full_name),
                opacity: isBanned ? 0.5 : 1,
              }}
            >
              {getInitials(record.full_name)}
            </Avatar>
            <div>
              <div style={{ fontWeight: 600, color: isBanned ? '#999' : token.colorText }}>
                {record.full_name || 'Chưa cập nhật'} {record.is_company_admin && <Tag color="blue" style={{marginLeft: 8}}>Admin</Tag>}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                @{record.username} • {record.email}
              </Text>
            </div>
          </Space>
        )
      },
    },
    {
      title: 'Công ty',
      dataIndex: 'company_name',
      key: 'company_name',
      render: (company_name) => (
        <span style={{ fontWeight: 500, color: '#1649c9' }}>{company_name || 'Hệ thống'}</span>
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
            {record.extra_department_names?.length > 0 && (
              <Space wrap size={2}>
                {record.extra_department_names.map((name) => (
                  <Tag key={name} color="cyan" style={{ fontSize: 11, margin: 0 }}>
                    {name} (Kiêm nhiệm)
                  </Tag>
                ))}
              </Space>
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
      title: 'Trạng thái',
      key: 'status',
      align: 'center',
      render: (_, record) => (
        record.is_active ? <Tag color="success">Hoạt động</Tag> : <Tag color="error">Đã khoá</Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="Đổi mật khẩu">
            <Button
              type="text"
              icon={<KeyOutlined />}
              onClick={() => {
                setResettingUser(record)
                setNewPassword('')
                setResetPasswordModalOpen(true)
              }}
            />
          </Tooltip>
          <Tooltip title="Chỉnh sửa">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openModal(record)}
            />
          </Tooltip>
          {/* Ẩn nút Khoá & Xoá với tài khoản Superadmin hệ thống */}
          {!record.is_superuser && (
            <Tooltip title={record.is_active ? 'Khóa tài khoản' : 'Mở khóa'}>
              <Button
                type="text"
                danger={record.is_active}
                icon={record.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
                onClick={() => toggleActive(record)}
              />
            </Tooltip>
          )}
          {!record.is_superuser && (
            <Tooltip title="Xoá tài khoản">
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setDeletingUser(record)} />
            </Tooltip>
          )}
          {record.is_superuser && (
            <Tooltip title="Tài khoản này được bảo vệ — không thể khoá hoặc xoá">
              <Tag color="gold" style={{ margin: 0 }} icon={<SafetyCertificateOutlined />}>Bảo vệ</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ]

  const filteredUsers = users.filter((u) => {
    if (selectedCompanyId && u.company !== selectedCompanyId) return false
    if (!searchText) return true
    const searchLower = searchText.toLowerCase()
    return (
      (u.username || '').toLowerCase().includes(searchLower) ||
      (u.full_name || '').toLowerCase().includes(searchLower) ||
      (u.email || '').toLowerCase().includes(searchLower)
    )
  })

  return (
    <div id="system-user-management-page">
      {contextHolder}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Quản lý Tài khoản (Hệ thống)</Title>
          <Text type="secondary">Quản trị tất cả người dùng thuộc mọi công ty</Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ background: '#1649c9' }}
          onClick={() => openModal()}
        >
          Thêm tài khoản
        </Button>
      </div>

      <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <Input.Search
            placeholder="Tìm kiếm tài khoản..."
            allowClear
            style={{ width: 300 }}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Lọc theo Công ty"
            allowClear
            style={{ width: 250 }}
            value={selectedCompanyId}
            onChange={setSelectedCompanyId}
            options={companies.map(c => ({ value: c.id, label: c.name }))}
          />
        </div>

        <Table scroll={{ x: 'max-content' }}
          columns={columns}
          dataSource={filteredUsers}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 25 }}
        />
      </Card>

      {/* Modal Add/Edit User */}
      <Modal
        title={editingUser ? `Chỉnh sửa tài khoản: ${editingUser.full_name || editingUser.username}` : 'Tạo tài khoản mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
        width={620}
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false} style={{ marginTop: 20 }}>
          <Row gutter={12}>
            <Col xs={24} md={24}>
              {editingUser?.is_superuser ? (
                <Form.Item label="Thuộc Công ty (Workspace)">
                  <Input
                    size="large"
                    disabled
                    value="Hệ thống Quản trị SaaS (Không thuộc doanh nghiệp nào)"
                    style={{ color: '#1649c9', fontWeight: 600, backgroundColor: '#f0f5ff' }}
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  name="company_id"
                  label="Thuộc Công ty (Workspace)"
                  rules={[{ required: true, message: 'Vui lòng chọn công ty' }]}
                >
                  <Select
                    size="large"
                    placeholder="Chọn công ty..."
                    onChange={handleCompanyChange}
                    options={companies.map(c => ({ value: c.id, label: c.name }))}
                    disabled={!!editingUser}
                  />
                </Form.Item>
              )}
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
            <Col xs={24} md={12}>
              <Form.Item
                name="password"
                label={editingUser ? 'Mật khẩu mới (Để trống nếu không đổi)' : 'Mật khẩu'}
                rules={[{ required: !editingUser, message: 'Vui lòng nhập mật khẩu', min: 6 }]}
              >
                <Input.Password size="large" placeholder={editingUser ? '••••••••' : 'Tối thiểu 6 ký tự'} />
              </Form.Item>
            </Col>

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

            <Col xs={24} md={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[{ type: 'email', message: 'Email không hợp lệ' }]}
              >
                <Input size="large" placeholder="nhanvien@congty.vn" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="job_title" label="Chức danh">
                <Input size="large" placeholder="Vd: Giám đốc Kinh doanh" />
              </Form.Item>
            </Col>

            {!editingUser?.is_superuser && (
              <>
                <Col xs={24} md={12}>
                  <Form.Item name="department" label="Phòng ban chính">
                    <Select
                      size="large"
                      placeholder="Chọn phòng ban chính..."
                      allowClear
                      options={departments.map((d) => ({ value: d.id, label: d.name }))}
                      onChange={(deptId) => {
                        const dept = departments.find((d) => d.id === deptId)
                        if (dept) {
                          form.setFieldsValue({ is_auto_assign_target: !!dept.is_auto_assign_target })
                        } else {
                          form.setFieldsValue({ is_auto_assign_target: false })
                        }
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="role" label="Vai trò (nhóm quyền)">
                    <Select
                      size="large"
                      placeholder="Chọn vai trò..."
                      allowClear
                      options={roles.map((r) => ({ value: r.id, label: r.name }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={24}>
                  <Form.Item
                    name="extra_departments"
                    label="Phòng ban kiêm nhiệm (nhiều phòng ban)"
                    tooltip="Chọn thêm các phòng ban mà nhân sự này kiêm nhiệm, hỗ trợ hoặc tham gia nhóm chat"
                  >
                    <Select
                      mode="multiple"
                      size="large"
                      placeholder="Chọn thêm các phòng ban kiêm nhiệm..."
                      allowClear
                      options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} md={12}>
                  <Form.Item
                    name="is_company_admin"
                    valuePropName="checked"
                    help="Bật để cấp quyền Quản trị viên Công ty (Toàn quyền quản lý tài khoản, cấu hình doanh nghiệp)."
                  >
                    <Switch checkedChildren="Admin công ty" unCheckedChildren="Tài khoản thường" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={24}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 16,
                      padding: '12px 16px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: '#0f172a', marginBottom: 2 }}>
                        Nhận khách tự động (Cá nhân)
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: '1.4' }}>
                        Gạt Tắt nếu nhân viên nghỉ phép, nghỉ ốm hoặc tạm dừng nhận khách mới. Gạt Bật khi làm việc trở lại.
                      </div>
                    </div>
                    <Form.Item name="is_auto_assign_target" valuePropName="checked" noStyle>
                      <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
                    </Form.Item>
                  </div>
                </Col>
              </>
            )}
          </Row>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit">
              {editingUser ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Reset Password */}
      <Modal
        title={<span><KeyOutlined /> Đặt lại mật khẩu</span>}
        open={resetPasswordModalOpen}
        onCancel={() => setResetPasswordModalOpen(false)}
        onOk={handleResetPassword}
        okText="Xác nhận"
        cancelText="Hủy"
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          Bạn đang đặt lại mật khẩu cho tài khoản <b>{resettingUser?.username}</b> ({resettingUser?.full_name}).
        </div>
        <Input.Password
          size="large"
          placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </Modal>

      {/* ── Modal Xác Nhận Xoá ───────────────────────────────────── */}
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
