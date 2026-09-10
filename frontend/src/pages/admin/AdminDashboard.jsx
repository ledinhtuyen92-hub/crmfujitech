import { useEffect, useState } from 'react'
import {
  BankOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DashboardOutlined,
  RightOutlined,
  TeamOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
  theme,
} from 'antd'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

const { Title, Text } = Typography

export default function AdminDashboard() {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState([])
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      const res = await api.get('users/companies/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setCompanies(data)
    } catch {
      messageApi.error('Không thể tải dữ liệu thống kê hệ thống SaaS.')
    } finally {
      setLoading(false)
    }
  }

  // Thống kê tổng quan
  const totalCompanies = companies.length
  const activeCompanies = companies.filter((c) => c.is_active).length
  const inactiveCompanies = totalCompanies - activeCompanies
  const totalUsers = companies.reduce((sum, c) => sum + (c.user_count || 0), 0)
  const totalLimit = companies.reduce((sum, c) => sum + (c.user_limit || 0), 0)
  const utilizationRate = totalLimit > 0 ? Math.round((totalUsers / totalLimit) * 100) : 0

  // Top 5 công ty đông nhân viên nhất cho BarChart
  const barData = [...companies]
    .sort((a, b) => (b.user_count || 0) - (a.user_count || 0))
    .slice(0, 5)
    .map((c) => ({
      name: c.workspace_id || c.name.slice(0, 15),
      fullName: c.name,
      users: c.user_count || 0,
      limit: c.user_limit || 0,
    }))

  // Dữ liệu PieChart trạng thái
  const pieData = [
    { name: 'Đang hoạt động', value: activeCompanies, color: '#10b981' },
    { name: 'Khóa / Ngừng', value: inactiveCompanies, color: '#ef4444' },
  ].filter((d) => d.value > 0)

  // Bảng công ty mới
  const columns = [
    {
      title: 'Tên Khách hàng SaaS (Công ty)',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <Text style={{ fontWeight: 700, fontSize: 14, color: token.colorPrimary, display: 'block' }}>
            {text}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            MST: {record.tax_code} | Owner: {record.owner_email || 'Chưa gán'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Workspace ID',
      dataIndex: 'workspace_id',
      key: 'workspace_id',
      render: (id) => <Tag color="blue">{id}</Tag>,
    },
    {
      title: 'Hạn mức Tài khoản',
      key: 'usage',
      render: (_, record) => {
        const count = record.user_count || 0
        const limit = record.user_limit || 0
        const percent = limit > 0 ? Math.min(Math.round((count / limit) * 100), 100) : 0
        const statusColor = percent >= 100 ? 'exception' : percent > 80 ? 'warning' : 'normal'
        return (
          <div style={{ minWidth: 140 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: 600 }}>
                {count} / {limit > 0 ? limit : '∞'} nhân viên
              </Text>
              {limit > 0 && (
                <Text style={{ fontSize: 11, color: percent >= 100 ? '#ef4444' : '#64748b' }}>
                  {percent}%
                </Text>
              )}
            </div>
            {limit > 0 ? (
              <Progress percent={percent} status={statusColor} size="small" showInfo={false} />
            ) : (
              <Tag color="purple">Không giới hạn</Tag>
            )}
          </div>
        )
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) =>
        active ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            Hoạt động
          </Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">
            Bị khóa
          </Tag>
        ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          onClick={() => navigate('/admin/companies')}
          icon={<RightOutlined />}
        >
          Quản lý
        </Button>
      ),
    },
  ]

  const cardStyle = {
    borderRadius: 12,
    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
    height: '100%',
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {contextHolder}

      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: 16,
          padding: '28px 32px',
          marginBottom: 24,
          color: '#ffffff',
          boxShadow: '0 14px 34px rgba(15, 23, 42, 0.18)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <Space align="center" size={12}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #f97316 0%, #dc2626 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(239, 68, 68, 0.4)',
              }}
            >
              <DashboardOutlined style={{ fontSize: 24, color: '#ffffff' }} />
            </div>
            <div>
              <Title level={3} style={{ color: '#ffffff', margin: 0, fontWeight: 800 }}>
                SaaS Platform Console
              </Title>
              <Text style={{ color: '#cbd5e1', fontSize: 13 }}>
                Hệ thống Quản trị & Giám sát các Khách hàng thuê bao CRM SaaS
              </Text>
            </div>
          </Space>
        </div>
        <Space>
          <Button
            type="primary"
            size="large"
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              border: 0,
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            }}
            onClick={() => navigate('/admin/companies')}
          >
            Quản lý Công ty
          </Button>
          <Button
            size="large"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', fontWeight: 600 }}
            onClick={() => navigate('/admin/settings')}
          >
            Cấu hình Gói & Hạn mức
          </Button>
        </Space>
      </div>

      {/* 4 Stat Cards */}
      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle}>
            <Statistic
              title={<Text style={{ fontWeight: 600 }}>Tổng Khách Hàng SaaS</Text>}
              value={totalCompanies}
              suffix="công ty"
              icon={<BankOutlined />}
              valueStyle={{ color: '#2563eb', fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle}>
            <Statistic
              title={<Text style={{ fontWeight: 600 }}>Đang Hoạt Động</Text>}
              value={activeCompanies}
              suffix="công ty"
              icon={<CheckCircleOutlined />}
              valueStyle={{ color: '#10b981', fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle}>
            <Statistic
              title={<Text style={{ fontWeight: 600 }}>Tổng Tài Khoản SaaS</Text>}
              value={totalUsers}
              suffix="user"
              icon={<TeamOutlined />}
              valueStyle={{ color: '#8b5cf6', fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle}>
            <Statistic
              title={<Text style={{ fontWeight: 600 }}>Tỷ Lệ Sử Dụng Hạn Mức</Text>}
              value={utilizationRate}
              suffix="%"
              icon={<UsergroupAddOutlined />}
              valueStyle={{ color: utilizationRate > 80 ? '#ef4444' : '#f59e0b', fontWeight: 800 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 2 Charts */}
      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <Card style={cardStyle}>
            <Title level={5} style={{ marginBottom: 16, fontWeight: 700 }}>
              Top Công ty sử dụng nhiều tài khoản nhất
            </Title>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div style={{ background: '#1e293b', padding: '10px 14px', borderRadius: 8, color: '#fff' }}>
                            <Text style={{ color: '#fff', fontWeight: 700, display: 'block' }}>{data.fullName}</Text>
                            <Text style={{ color: '#93c5fd', fontSize: 12 }}>Đang dùng: {data.users} user</Text>
                            <br />
                            <Text style={{ color: '#cbd5e1', fontSize: 12 }}>Hạn mức: {data.limit > 0 ? `${data.limit} user` : 'Không giới hạn'}</Text>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Legend />
                  <Bar dataKey="users" name="Số tài khoản hiện tại" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={40} />
                  <Bar dataKey="limit" name="Giới hạn tối đa" fill="#e2e8f0" radius={[6, 6, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card style={cardStyle}>
            <Title level={5} style={{ marginBottom: 16, fontWeight: 700 }}>
              Trạng thái Khách hàng SaaS
            </Title>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table Danh sách Công ty */}
      <Card style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={5} style={{ margin: 0, fontWeight: 700 }}>
            Danh sách Khách hàng SaaS gần đây
          </Title>
          <Button type="link" onClick={() => navigate('/admin/companies')}>
            Xem tất cả công ty ({totalCompanies}) &rarr;
          </Button>
        </div>
        <Table scroll={{ x: 'max-content' }}
          columns={columns}
          dataSource={companies}
          rowKey="id"
          pagination={{ pageSize: 25 }}
          style={{ background: 'transparent' }}
        />
      </Card>
    </div>
  )
}
