import {
  DeleteOutlined,
  EditOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
  List,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../utils/api'
import { useAuth } from '../../contexts/AuthContext'
import { useResponsive } from '../../hooks/useResponsive'

const { Title, Text } = Typography

const MODULE_ORDER = [
  'dashboard',
  'notifications',
  'approvals',
  'crm',
  'products',
  'sales',
  'orders',
  'inventory',
  'production',
  'delivery',
  'warranty',
  'finance',
  'reports',
  'zalo',
  'facebook',
  'settings'
]
export default function RoleManagement() {
  const { token } = theme.useToken()
  const { checkMaintenance, hasPermission, isCompanyAdmin } = useAuth()
  const { isMobile } = useResponsive()
  const canManageRoles = isCompanyAdmin || hasPermission('settings.roles')
  const [messageApi, contextHolder] = message.useMessage()

  const [roles, setRoles] = useState([])
  const [allPermissions, setAllPermissions] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [form] = Form.useForm()
  const [systemModules, setSystemModules] = useState([])

  // ── Nhóm permissions theo module ─────────────────────────────────
  const permissionsByModule = useMemo(() => {
    const groups = {}
    allPermissions.forEach((p) => {
      const mod = p.module || 'other'
      if (!groups[mod]) groups[mod] = []
      groups[mod].push(p)
    })
    return groups
  }, [allPermissions])

  const moduleLabels = useMemo(() => {
    const map = {}
    systemModules.forEach(m => map[m.code] = m.name)
    return map
  }, [systemModules])

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    try {
      const [rolesRes, permsRes, modsRes] = await Promise.all([
        api.get('users/roles/'),
        api.get('users/permissions/'),
        api.get('users/modules/'),
      ])
      const rolesData = Array.isArray(rolesRes.data) ? rolesRes.data : rolesRes.data?.results ?? []
      const permsData = Array.isArray(permsRes.data) ? permsRes.data : permsRes.data?.results ?? []
      setRoles(rolesData)
      setAllPermissions(permsData)
      setSystemModules(Array.isArray(modsRes.data) ? modsRes.data : [])
    } catch {
      messageApi.error('Không thể tải dữ liệu.')
    } finally {
      setLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Modal ─────────────────────────────────────────────────────────
  const openModal = (role = null) => {
    if (checkMaintenance()) return
    setEditingRole(role)
    form.setFieldsValue({
      name: role?.name ?? '',
      description: role?.description ?? '',
      is_auto_assign_target: role?.is_auto_assign_target ?? false,
      permissions: role?.permissions ?? [],
    })
    setModalOpen(true)
  }

  const handleSubmit = async (values) => {
    try {
      if (editingRole) {
        await api.patch(`users/roles/${editingRole.id}/`, values)
        messageApi.success('Cập nhật vai trò thành công.')
      } else {
        await api.post('users/roles/', values)
        messageApi.success('Tạo vai trò thành công.')
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

  const handleDelete = (role) => {
    if (checkMaintenance()) return
    Modal.confirm({
      title: `Xóa vai trò "${role.name}"?`,
      content: 'Các nhân viên đang giữ vai trò này sẽ mất vai trò. Hành động không thể hoàn tác.',
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await api.delete(`users/roles/${role.id}/`)
          messageApi.success('Đã xóa vai trò.')
          fetchData()
        } catch {
          messageApi.error('Không thể xóa vai trò này.')
        }
      },
    })
  }

  // ── Columns ───────────────────────────────────────────────────────
  const columns = [
    {
      title: 'Tên vai trò',
      dataIndex: 'name',
      key: 'name',
      width: '25%',
      fixed: 'left',
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
      title: 'Số quyền',
      key: 'perm_count',
      align: 'center',
      render: (_, record) => (
        <Tag color="blue" icon={<KeyOutlined />}>
          {record.permission_details?.length ?? 0} quyền
        </Tag>
      ),
    },
    {
      title: 'Nhân viên',
      key: 'user_count',
      align: 'center',
      render: (_, record) => (
        <Tag color="purple" icon={<TeamOutlined />}>
          {record.user_count ?? 0} người
        </Tag>
      ),
    },
    {
      title: 'Modules được truy cập',
      key: 'modules',
      width: '45%',
      render: (_, record) => {
        const mods = [...new Set((record.permission_details || []).map((p) => p.module))]
        return (
          <Space size={4} wrap>
            {mods.map((m) => (
              <Tag key={m} color="geekblue" style={{ fontSize: 11 }}>
                {moduleLabels[m] || m}
              </Tag>
            ))}
            {mods.length === 0 && <Text type="secondary">Chưa có quyền nào</Text>}
          </Space>
        )
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'center',
      render: (_, record) => canManageRoles ? (
        <Space>
          <Tooltip title="Chỉnh sửa">
            <Button type="text" icon={<EditOutlined />} onClick={() => openModal(record)} />
          </Tooltip>
          <Tooltip title="Xóa">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record)}
            />
          </Tooltip>
        </Space>
      ) : null,
    },
  ]

  return (
    <div id="role-management-page">
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
            Vai trò & Phân quyền
          </Title>
          <Text type="secondary">
            Quản lý các chức danh trong công ty và quyền hạn tương ứng
          </Text>
        </div>
        {canManageRoles && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => openModal()}
            style={{ background: '#1649c9' }}
            id="btn-add-role"
          >
            Tạo vai trò mới
          </Button>
        )}
      </div>

      <Card style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(15,23,42,0.08)' }}>
        {isMobile ? (
          <List
            dataSource={roles}
            loading={loading}
            pagination={{ pageSize: 10, size: 'small' }}
            renderItem={(record) => {
              const mods = [...new Set((record.permission_details || []).map((p) => p.module))]
              return (
                <List.Item style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: token.colorText }}>{record.name}</div>
                      {record.description && <Text type="secondary" style={{ fontSize: 13 }}>{record.description}</Text>}
                    </div>
                    <Tag color="purple" icon={<TeamOutlined />}>{record.user_count ?? 0} người</Tag>
                  </div>
                  
                  <div style={{ marginBottom: 12 }}>
                    <Tag color="blue" icon={<KeyOutlined />}>{record.permission_details?.length ?? 0} quyền</Tag>
                  </div>

                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Modules được truy cập:</Text>
                    <Space size={4} wrap>
                      {mods.map((m) => (
                        <Tag key={m} color="geekblue" style={{ fontSize: 11, margin: 0 }}>
                          {moduleLabels[m] || m}
                        </Tag>
                      ))}
                      {mods.length === 0 && <Text type="secondary" style={{ fontSize: 12 }}>Chưa có quyền nào</Text>}
                    </Space>
                  </div>

                  {canManageRoles && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px dashed #f0f0f0', paddingTop: 12 }}>
                      <Space size="small">
                        <Button type="text" icon={<EditOutlined style={{ color: '#1677ff' }}/>} onClick={() => openModal(record)} />
                        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
                      </Space>
                    </div>
                  )}
                </List.Item>
              )
            }}
          />
        ) : (
          <Table scroll={{ x: 'max-content' }}
            id="role-table"
            columns={columns}
            dataSource={roles}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
          />
        )}
      </Card>

      {/* ── Modal Tạo / Sửa ────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <KeyOutlined />
            <span>{editingRole ? `Sửa: ${editingRole.name}` : 'Tạo vai trò mới'}</span>
          </Space>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
        width={680}
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
                name="name"
                label="Tên vai trò / Chức danh"
                rules={[{ required: true, message: 'Vui lòng nhập tên vai trò' }]}
              >
                <Input size="large" placeholder="Vd: Nhân viên Sale, Kế toán, Trưởng phòng..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="description" label="Mô tả">
                <Input size="large" placeholder="Mô tả ngắn về vai trò..." />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="is_auto_assign_target"
            valuePropName="checked"
            style={{ marginBottom: 8 }}
          >
            <Checkbox>
              <Text strong>Nhóm được chia khách tự động</Text>
              <Tooltip title="Bật tùy chọn này để nhân viên thuộc vai trò này có thể nhận khách từ chức năng Phân bổ tự động (Round-robin)">
                <InfoCircleOutlined style={{ marginLeft: 8, color: token.colorTextSecondary }} />
              </Tooltip>
            </Checkbox>
          </Form.Item>

          <Divider orientation="left" style={{ margin: '16px 0 16px' }}>
            <Text strong>Phân quyền theo Module</Text>
          </Divider>

          <Form.Item name="permissions">
            <Checkbox.Group style={{ width: '100%' }}>
              {Object.entries(permissionsByModule)
                .sort(([modA], [modB]) => {
                  const a = MODULE_ORDER.indexOf(modA)
                  const b = MODULE_ORDER.indexOf(modB)
                  return (a === -1 ? 999 : a) - (b === -1 ? 999 : b)
                })
                .map(([module, perms]) => {
                const allCodes = perms.map((p) => p.id)
                const currentValues = form.getFieldValue('permissions') || []
                const allChecked = allCodes.every((id) => currentValues.includes(id))

                return (
                  <Card
                    key={module}
                    size="small"
                    style={{
                      marginBottom: 12,
                      borderRadius: 8,
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong style={{ fontSize: 13 }}>
                          {moduleLabels[module] || module}
                        </Text>
                        <Button
                          size="small"
                          type="link"
                          style={{ padding: 0 }}
                          onClick={() => {
                            const current = form.getFieldValue('permissions') || []
                            if (allChecked) {
                              form.setFieldValue(
                                'permissions',
                                current.filter((id) => !allCodes.includes(id)),
                              )
                            } else {
                              form.setFieldValue('permissions', [
                                ...new Set([...current, ...allCodes]),
                              ])
                            }
                          }}
                        >
                          {allChecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                        </Button>
                      </div>
                    }
                  >
                    <Row gutter={[0, 6]}>
                      {perms.map((p) => (
                        <Col xs={24} md={12} key={p.id}>
                          <Checkbox value={p.id}>
                            <Text style={{ fontSize: 13 }}>{p.name}</Text>
                          </Checkbox>
                        </Col>
                      ))}
                    </Row>
                  </Card>
                )
              })}
            </Checkbox.Group>
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ background: '#1649c9' }}>
              {editingRole ? 'Lưu thay đổi' : 'Tạo vai trò'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
