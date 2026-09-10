import {
  BankOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  StopOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
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

export default function CompanyManagement() {
  const { token } = theme.useToken()
  const [messageApi, contextHolder] = message.useMessage()

  const [companies, setCompanies] = useState([])
  const [plans, setPlans] = useState([])
  const [systemModules, setSystemModules] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCompany, setEditingCompany] = useState(null)
  const [deletingCompany, setDeletingCompany] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [searchText, setSearchText] = useState('')
  const [form] = Form.useForm()

  // ── Fetch danh sách công ty ─────────────────────────────────────
  const fetchCompanies = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    try {
      const { data } = await api.get('users/companies/')
      setCompanies(Array.isArray(data) ? data : data?.results ?? [])
    } catch {
      messageApi.error('Không thể tải danh sách công ty.')
    } finally {
      setLoading(false)
    }
  }, [messageApi])

  const fetchPlans = useCallback(async () => {
    try {
      const { data } = await api.get('users/subscription-plans/')
      setPlans(Array.isArray(data) ? data : data?.results ?? [])
    } catch {
      messageApi.error('Không thể tải danh sách gói đăng ký.')
    }
  }, [messageApi])

  const fetchModules = useCallback(async () => {
    try {
      const { data } = await api.get('users/modules/')
      setSystemModules(Array.isArray(data) ? data : [])
    } catch {
      messageApi.error('Không thể tải danh sách phân hệ.')
    }
  }, [messageApi])

  useEffect(() => {
    fetchCompanies()
    fetchPlans()
    fetchModules()
  }, [fetchCompanies, fetchPlans, fetchModules])

  // ── Mở modal tạo mới / chỉnh sửa ───────────────────────────────
  const openModal = (company = null) => {
    setEditingCompany(company)
    form.setFieldsValue(
      company
        ? {
            name: company.name,
            workspace_id: company.workspace_id,
            tax_code: company.tax_code,
            address: company.address,
            user_limit: company.user_limit ?? 15,
            is_active: company.is_active,
            set_active_modules: company.active_modules || [],
          }
        : { name: '', workspace_id: '', tax_code: '', address: '', user_limit: 15, admin_username: '', admin_password: '', admin_fullname: '', admin_email: '', set_active_modules: ['crm', 'sales', 'inventory'] },
    )
    setModalOpen(true)
  }

  const handleSubmit = async (values) => {
    try {
      if (editingCompany) {
        await api.patch(`users/companies/${editingCompany.id}/`, values)
        messageApi.success('Cập nhật công ty thành công.')
      } else {
        await api.post('users/companies/', values)
        messageApi.success('Tạo công ty thành công.')
      }
      setModalOpen(false)
      fetchCompanies()
    } catch (err) {
      const errors = err.response?.data
      if (errors && typeof errors === 'object') {
        const msgs = Object.values(errors).flat().join(' ')
        messageApi.error(msgs)
      } else {
        messageApi.error('Có lỗi xảy ra. Vui lòng thử lại.')
      }
    }
  }

  // ── Toggle trạng thái công ty ───────────────────────────────────
  const toggleActive = async (company) => {
    try {
      await api.patch(`users/companies/${company.id}/`, {
        is_active: !company.is_active,
      })
      messageApi.success(
        company.is_active
          ? `Đã khóa công ty "${company.name}".`
          : `Đã kích hoạt công ty "${company.name}".`,
      )
      fetchCompanies()
    } catch {
      messageApi.error('Không thể cập nhật trạng thái.')
    }
  }

  // ── Xoá công ty ──────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletingCompany) return
    if (deleteConfirmText !== deletingCompany.workspace_id) {
      messageApi.error('Mã Workspace ID không khớp. Vui lòng nhập lại.')
      return
    }

    try {
      await api.delete(`users/companies/${deletingCompany.id}/`)
      messageApi.success(`Đã xoá công ty "${deletingCompany.name}" thành công.`)
      setDeletingCompany(null)
      setDeleteConfirmText('')
      fetchCompanies()
    } catch {
      messageApi.error('Không thể xoá công ty này.')
    }
  }

  // ── Tạo lại admin ────────────────────────────────────────────────
  const handleRecreateAdmin = async (company) => {
    try {
      const res = await api.post(`users/companies/${company.id}/recreate_admin/`)
      Modal.success({
        title: 'Tạo lại tài khoản Giám đốc thành công',
        content: (
          <div>
            <p>{res.data.detail}</p>
            <p>Tài khoản: <Text copyable strong>{res.data.username}</Text></p>
            <p>Mật khẩu: <Text copyable strong>{res.data.password}</Text></p>
            <p style={{color: 'red', marginTop: 10, fontSize: 12}}>Vui lòng lưu lại thông tin này trước khi đóng!</p>
          </div>
        )
      })
      fetchCompanies()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Không thể tạo lại tài khoản Giám đốc'
      messageApi.error(msg)
    }
  }

  // ── AI Quota ─────────────────────────────────────────────────────
  const handleToggleSystemKeys = async (company, checked) => {
    try {
      await api.post(`users/companies/${company.id}/toggle_system_keys/`, { allow_system_keys: checked })
      messageApi.success('Đã cập nhật quyền Quota dự phòng.')
      fetchCompanies()
    } catch {
      messageApi.error('Lỗi khi cập nhật quyền Quota.')
    }
  }

  // ── Stats ────────────────────────────────────────────────────────
  const totalCompanies = companies.length
  const activeCompanies = companies.filter((c) => c.is_active).length
  const totalUsers = companies.reduce((sum, c) => sum + (c.user_count || 0), 0)

  // ── Columns ──────────────────────────────────────────────────────
  const columns = [
    {
      title: 'Công ty',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <div>
          <div style={{ fontWeight: 600, color: token.colorText }}>{name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            MST: {record.tax_code}
          </Text>
        </div>
      ),
    },
    {
      title: 'Workspace ID',
      dataIndex: 'workspace_id',
      key: 'workspace_id',
      render: (id) => (
        <Tag color="blue" style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>
          {id}
        </Tag>
      ),
    },
    {
      title: 'Owner',
      dataIndex: 'owner_email',
      key: 'owner_email',
      render: (email) => email || <Text type="secondary">—</Text>,
    },
    {
      title: 'Gói / Hạn mức NS',
      key: 'user_limit_status',
      align: 'left',
      render: (_, record) => {
        const count = record.user_count || 0
        const limit = record.user_limit || 0
        const percent = limit > 0 ? Math.min(Math.round((count / limit) * 100), 100) : 0
        return (
          <div style={{ minWidth: 150 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: 600 }}>
                <TeamOutlined style={{ marginRight: 6, color: '#2563eb' }} />
                {count} / {limit > 0 ? `${limit} user` : '∞ VIP'}
              </Text>
              {limit > 0 && (
                <Tag
                  color={percent >= 100 ? 'error' : percent > 80 ? 'warning' : 'processing'}
                  style={{ margin: 0, fontSize: 11 }}
                >
                  {percent >= 100 ? 'Đã đầy' : `${percent}%`}
                </Tag>
              )}
            </div>
            {limit > 0 ? (
              <Progress
                percent={percent}
                status={percent >= 100 ? 'exception' : 'normal'}
                size="small"
                showInfo={false}
              />
            ) : (
              <Tag color="purple" style={{ margin: 0 }}>
                Không giới hạn
              </Tag>
            )}
          </div>
        )
      },
    },
    {
      title: 'Module',
      key: 'active_modules',
      render: (_, record) => (
        <Space size={[0, 4]} wrap style={{ maxWidth: 200 }}>
          {record.active_modules?.map(m => (
            <Tag key={m} color="blue">{m.toUpperCase()}</Tag>
          ))}
        </Space>
      )
    },
    {
      title: 'AI Quota',
      dataIndex: 'allow_system_keys',
      key: 'allow_system_keys',
      align: 'center',
      render: (allow_system_keys, record) => (
        <Tooltip title={allow_system_keys ? "Đã cấp quyền dùng Quota dự phòng hệ thống" : "Chưa cấp quyền"}>
          <Switch 
            checkedChildren="Cấp" 
            unCheckedChildren="Cắt" 
            checked={allow_system_keys} 
            onChange={(checked) => handleToggleSystemKeys(record, checked)} 
          />
        </Tooltip>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      align: 'center',
      render: (active) =>
        active ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            Hoạt động
          </Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">
            Đã khóa
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
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openModal(record)}
            />
          </Tooltip>
          <Tooltip title="Tạo lại tài khoản Giám đốc">
            <Popconfirm
              title="Bạn có muốn tạo lại tài khoản Giám đốc cho công ty này không?"
              onConfirm={() => handleRecreateAdmin(record)}
              okText="Đồng ý"
              cancelText="Hủy"
            >
              <Button type="text" icon={<UserAddOutlined />} />
            </Popconfirm>
          </Tooltip>
          <Tooltip title={record.is_active ? 'Khóa công ty' : 'Kích hoạt'}>
            <Button
              type="text"
              danger={record.is_active}
              icon={record.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
              onClick={() => toggleActive(record)}
            />
          </Tooltip>
          <Tooltip title="Xoá vĩnh viễn">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => setDeletingCompany(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  const filteredCompanies = companies.filter((c) => {
    if (!searchText) return true
    const searchLower = searchText.toLowerCase()
    return (
      (c.name || '').toLowerCase().includes(searchLower) ||
      (c.workspace_id || '').toLowerCase().includes(searchLower) ||
      (c.tax_code || '').toLowerCase().includes(searchLower)
    )
  })

  return (
    <div id="company-management-page">
      {contextHolder}

      {/* ── Header ─────────────────────────────────────────────── */}
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
          <Title level={2} style={{ margin: 0, color: token.colorText }}>
            Quản lý Công ty
          </Title>
          <Text type="secondary">Danh sách tất cả công ty đang sử dụng hệ thống CRM SaaS</Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => openModal()}
          style={{ background: '#1649c9' }}
          id="btn-add-company"
        >
          Thêm công ty
        </Button>
      </div>

      {/* ── Stats Cards ─────────────────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          {
            title: 'Tổng công ty',
            value: totalCompanies,
            icon: <BankOutlined />,
            color: '#2563eb',
          },
          {
            title: 'Đang hoạt động',
            value: activeCompanies,
            icon: <CheckCircleOutlined />,
            color: '#16a34a',
          },
          {
            title: 'Tổng nhân viên',
            value: totalUsers,
            icon: <TeamOutlined />,
            color: '#7c3aed',
          },
        ].map((stat) => (
          <Col xs={24} sm={8} key={stat.title}>
            <Card
              style={{
                borderRadius: 12,
                boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
              }}
            >
              <Statistic
                title={
                  <Space>
                    <span style={{ color: stat.color }}>{stat.icon}</span>
                    <Text type="secondary">{stat.title}</Text>
                  </Space>
                }
                value={stat.value}
                valueStyle={{ color: stat.color, fontWeight: 700, fontSize: 32 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── Table ───────────────────────────────────────────────── */}
      <Card
        style={{
          borderRadius: 12,
          boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <Input.Search
            placeholder="Tìm kiếm công ty theo tên, MST, mã workspace..."
            allowClear
            style={{ width: 350 }}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <Table scroll={{ x: 'max-content' }}
          id="company-table"
          columns={columns}
          dataSource={filteredCompanies}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 25, showTotal: (total) => `${total} công ty` }}
        />
      </Card>

      {/* ── Modal Tạo / Sửa ────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <BankOutlined />
            <span>{editingCompany ? 'Chỉnh sửa công ty' : 'Thêm công ty mới'}</span>
          </Space>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
        width={520}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          style={{ marginTop: 20 }}
        >
          <Form.Item
            name="name"
            label="Tên công ty"
            rules={[{ required: true, message: 'Vui lòng nhập tên công ty' }]}
          >
            <Input size="large" placeholder="Công ty TNHH An Phát" />
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                name="workspace_id"
                label="Workspace ID"
                tooltip="Mã định danh khi đăng nhập. Để trống để tự động tạo từ MST."
              >
                <Input
                  size="large"
                  placeholder="ANPHAT"
                  style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="tax_code"
                label="Mã số thuế"
                rules={[{ required: true, message: 'Vui lòng nhập MST' }]}
              >
                <Input size="large" placeholder="0123456789" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="Địa chỉ">
            <Input.TextArea rows={2} placeholder="Địa chỉ trụ sở..." />
          </Form.Item>

          <Form.Item
            name="set_active_modules"
            label="Module kích hoạt"
            tooltip="Chọn các module mà công ty này được phép sử dụng."
          >
            <Checkbox.Group style={{ width: '100%' }}>
              <Row gutter={[12, 12]}>
                {systemModules.map(m => (
                  <Col xs={24} md={12} key={m.code}>
                    <Checkbox value={m.code}>{m.name}</Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                name="user_limit"
                label="Gói / Giới hạn nhân viên"
                tooltip="Số lượng tài khoản tối đa công ty được phép tạo."
                rules={[{ required: true, message: 'Vui lòng chọn hạn mức' }]}
              >
                <Select size="large" placeholder="Chọn gói hạn mức">
                  {plans.map(p => (
                    <Select.Option key={p.code} value={p.user_limit}>
                      {p.name} ({p.user_limit === 99999 ? 'Không giới hạn' : `${p.user_limit} user`})
                    </Select.Option>
                  ))}
                  <Select.Option value={0}>Không giới hạn (0 / VIP)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="Số điện thoại">
                <Input size="large" placeholder="02438889999" />
              </Form.Item>
            </Col>
          </Row>

          {!editingCompany && (
            <>
              <div style={{ marginTop: 8, marginBottom: 16, fontWeight: 600, color: '#1649c9', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                👤 Khởi tạo Tài khoản Giám đốc ban đầu
              </div>
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="admin_username"
                    label="Tên đăng nhập"
                    rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }]}
                  >
                    <Input size="large" placeholder="giamdoc_anphat" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="admin_password"
                    label="Mật khẩu"
                    rules={[{ required: true, message: 'Vui lòng nhập mật khẩu', min: 6 }]}
                  >
                    <Input.Password size="large" placeholder="Ít nhất 6 ký tự" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="admin_fullname"
                    label="Họ và tên Giám đốc"
                  >
                    <Input size="large" placeholder="Nguyễn Văn A" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="admin_email"
                    label="Email liên hệ"
                    rules={[{ type: 'email', message: 'Email không hợp lệ' }]}
                  >
                    <Input size="large" placeholder="admin@congty.com" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {editingCompany && (
            <Form.Item name="is_active" label="Trạng thái" valuePropName="checked">
              <Switch
                checkedChildren="Hoạt động"
                unCheckedChildren="Đã khóa"
              />
            </Form.Item>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ background: '#1649c9' }}>
              {editingCompany ? 'Lưu thay đổi' : 'Tạo công ty'}
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={
          <div style={{ color: '#cf1322', display: 'flex', alignItems: 'center', gap: 8 }}>
            <DeleteOutlined /> Cảnh báo: Xoá vĩnh viễn công ty
          </div>
        }
        open={!!deletingCompany}
        onCancel={() => {
          setDeletingCompany(null)
          setDeleteConfirmText('')
        }}
        onOk={handleDelete}
        okText="Xoá vĩnh viễn"
        cancelText="Hủy"
        okButtonProps={{ danger: true, disabled: deleteConfirmText !== deletingCompany?.workspace_id }}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          Hành động này sẽ <b>xoá toàn bộ dữ liệu</b> của công ty <b>{deletingCompany?.name}</b> và không thể hoàn tác.
        </div>
        <div style={{ marginBottom: 8 }}>
          Để xác nhận, vui lòng nhập mã Workspace ID <Tag color="red" style={{ fontFamily: 'monospace', fontSize: 14 }}>{deletingCompany?.workspace_id}</Tag> vào ô bên dưới:
        </div>
        <Input
          placeholder="Nhập mã Workspace ID để xác nhận"
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
          style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
        />
      </Modal>
    </div>
  )
}
