import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  BankOutlined,
  DollarCircleOutlined,
  PercentageOutlined,
  ProjectOutlined,
  TeamOutlined,
  TrophyOutlined,
  FrownOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Card, Col, Row, Space, Statistic, Table, Tag, Typography, theme, message, Segmented, Select, List, Badge } from 'antd'
import { DashboardOutlined } from '@ant-design/icons'
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
  Line,
  ComposedChart
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import api from '../utils/api'
import { useResponsive } from '../hooks/useResponsive'

const { Text, Title } = Typography

const contractColumns = [
  {
    title: 'Mã ĐH',
    dataIndex: 'order_number',
    key: 'order_number',
    render: (text) => <Text strong>{text}</Text>
  },
  {
    title: 'Tên khách hàng',
    dataIndex: 'customer_name',
    key: 'customerName',
  },
  {
    title: 'Tổng tiền',
    dataIndex: 'total_amount',
    key: 'total_amount',
    render: (amount) => `${Number(amount).toLocaleString('vi-VN')} đ`,
  },
  {
    title: 'Người tạo',
    dataIndex: 'created_by_name',
    key: 'created_by',
    render: (name) => (
      <Space size={6}>
        <BankOutlined style={{ color: '#2563eb' }} />
        <Text>{name || 'N/A'}</Text>
      </Space>
    ),
  },
  {
    title: 'Người duyệt',
    dataIndex: 'approved_by_name',
    key: 'approved_by',
    render: (name) => name ? <Text>{name}</Text> : <Text type="secondary">Chưa có</Text>,
  },
  {
    title: 'Trạng thái',
    dataIndex: 'status',
    key: 'status',
    render: (status) => {
      const colorMap = {
        'completed': 'green',
        'in_production': 'blue',
        'approved': 'gold',
        'pending': 'orange',
        'rejected': 'red',
        'cancelled': 'default'
      }
      
      const labelMap = {
        'completed': 'Hoàn thành',
        'in_production': 'Đang sản xuất',
        'approved': 'Đã duyệt',
        'pending': 'Chờ duyệt',
        'rejected': 'Từ chối',
        'cancelled': 'Đã huỷ'
      }

      return <Tag color={colorMap[status] ?? 'default'}>{labelMap[status] ?? status}</Tag>
    },
  },
]

function Dashboard() {
  const { token } = theme.useToken()
  const { isMobile, padding } = useResponsive()
  const { isSuperAdmin, hasPermission, isCompanyAdmin } = useAuth()
  const canViewRevenue = isCompanyAdmin || hasPermission('dashboard.view_revenue') || hasPermission('reports.view_all')
  const canViewDebt = canViewRevenue || hasPermission('orders.view_all')
  const [messageApi, contextHolder] = message.useMessage()

  const [loading, setLoading] = useState(true)
  const [timeFilter, setTimeFilter] = useState('month') // today, week, month, quarter, year, all
  const [summary, setSummary] = useState(null)
  const [revenueData, setRevenueData] = useState([])
  const [latestOrders, setLatestOrders] = useState([])
  const [topSellers, setTopSellers] = useState([])
  const [debtStats, setDebtStats] = useState({ total_debt: 0, chart_data: [] })

  const canScopeMyDept = isCompanyAdmin || hasPermission('dashboard.scope_my_department')
  const canScopeAnyDept = isCompanyAdmin || hasPermission('dashboard.scope_any_department')
  const canScopeCompany = isCompanyAdmin || hasPermission('dashboard.scope_company')

  const defaultScope = canScopeCompany ? 'company' : (canScopeAnyDept || canScopeMyDept ? 'my_department' : 'personal')
  const [scopeFilter, setScopeFilter] = useState(defaultScope)
  const [departmentId, setDepartmentId] = useState(null)
  const [departments, setDepartments] = useState([])

  useEffect(() => {
    if (isSuperAdmin) return
    fetchDashboardData()
  }, [isSuperAdmin, timeFilter, scopeFilter, departmentId])

  useEffect(() => {
    if (canScopeAnyDept) {
      api.get('users/departments/').then(res => setDepartments(res.data.results || res.data)).catch(console.error)
    }
  }, [canScopeAnyDept])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      const fetchSafe = (url, fallback) => api.get(url).catch(() => ({ data: fallback }))

      let scopeParams = `&scope=${scopeFilter}`
      if (scopeFilter === 'any_department' && departmentId) {
        scopeParams += `&department_id=${departmentId}`
      }

      const filterParam = `?time_filter=${timeFilter}${scopeParams}`
      const limitParam = timeFilter !== 'all' ? `&limit=100` : `?limit=100`
      const limitFilterParam = `?time_filter=${timeFilter}&limit=100${scopeParams}`

      const [summaryRes, revenueRes, sellersRes, ordersRes, debtRes] = await Promise.all([
        fetchSafe(`dashboard/summary/${filterParam}`, {}),
        fetchSafe(`dashboard/revenue-chart/${filterParam}`, []),
        fetchSafe(`dashboard/top-sellers/${limitFilterParam}`, []),
        fetchSafe(`orders/orders/`, { results: [] }),
        fetchSafe(`dashboard/debt-stats/${filterParam}`, { total_debt: 0, chart_data: [] })
      ])

      setSummary(summaryRes.data)
      setRevenueData(revenueRes.data)
      setDebtStats(debtRes.data)
      
      const colors = ['#2563eb', '#0f766e', '#f59e0b', '#7c3aed', '#ef4444', '#64748b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316']
      setTopSellers(sellersRes.data.map((item, idx) => ({
        ...item,
        color: colors[idx % colors.length]
      })))
      
      const orders = Array.isArray(ordersRes.data) ? ordersRes.data : ordersRes.data?.results ?? []
      setLatestOrders(orders.slice(0, 10))
      
    } catch (error) {
      console.error(error)
      messageApi.error('Không thể tải dữ liệu Dashboard.')
    } finally {
      setLoading(false)
    }
  }

  if (isSuperAdmin) {
    return <Navigate to="/admin/dashboard" replace />
  }

  const cardStyle = {
    height: '100%',
    borderRadius: 12,
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
  }
  
  const statisticCards = [
    {
      title: 'Doanh thu trong kỳ',
      value: canViewRevenue ? (summary?.orders?.revenue_in_period || 0) : '***',
      suffix: canViewRevenue ? 'đ' : '',
      icon: <DollarCircleOutlined />,
      valueStyle: { color: '#2563eb' },
      iconStyle: {
        color: '#2563eb',
        background: 'rgba(37, 99, 235, 0.12)',
      },
    },
    {
      title: 'Số lượng SP chốt',
      value: summary?.orders?.won_products_count || 0,
      suffix: 'SP',
      icon: <ProjectOutlined />,
      valueStyle: { color: '#0f766e' },
      iconStyle: {
        color: '#0f766e',
        background: 'rgba(15, 118, 110, 0.12)',
      },
      footer: `Trong đó hoàn thành: ${summary?.orders?.completed_products_count || 0}`
    },
    {
      title: 'Đơn hàng trong kỳ',
      value: summary?.orders?.total || 0,
      suffix: 'đơn',
      icon: <ProjectOutlined />,
      valueStyle: { color: '#0f766e' },
      iconStyle: {
        color: '#0f766e',
        background: 'rgba(15, 118, 110, 0.12)',
      },
    },
    {
      title: 'Khách hàng trong kỳ',
      value: summary?.customers?.total || 0,
      suffix: 'khách',
      icon: <UserOutlined />,
      valueStyle: { color: '#0ea5e9' },
      iconStyle: {
        color: '#0ea5e9',
        background: 'rgba(14, 165, 233, 0.12)',
      },
    },
    {
      title: 'Tỷ lệ chốt Sales',
      value: summary?.quotations?.win_rate || 0,
      suffix: '%',
      icon: <PercentageOutlined />,
      valueStyle: { color: '#7c3aed' },
      iconStyle: {
        color: '#7c3aed',
        background: 'rgba(124, 58, 237, 0.12)',
      },
    },
    {
      title: 'Nợ phải thu',
      value: canViewDebt ? (debtStats?.total_debt || 0) : '***',
      suffix: canViewDebt ? 'đ' : '',
      icon: <DollarCircleOutlined />,
      valueStyle: { color: '#ef4444' },
      iconStyle: {
        color: '#ef4444',
        background: 'rgba(239, 68, 68, 0.12)',
      },
    },
  ]

  const timeFilterOptions = [
    { label: 'Tất cả', value: 'all' },
    { label: 'Hôm qua', value: 'yesterday' },
    { label: 'Hôm nay', value: 'today' },
    { label: 'Tuần trước', value: 'last_week' },
    { label: 'Tuần này', value: 'week' },
    { label: 'Tháng trước', value: 'last_month' },
    { label: 'Tháng này', value: 'month' },
    { label: 'Quý trước', value: 'last_quarter' },
    { label: 'Quý này', value: 'quarter' },
    { label: 'Năm ngoái', value: 'last_year' },
    { label: 'Năm nay', value: 'year' },
  ]

  return (
    <div style={{ padding, width: '100%', minWidth: 0 }}>
      {contextHolder}
      <Row justify="space-between" align="top" gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Space direction="vertical" size={2}>
            <Title level={2} style={{ margin: 0, fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>
              <DashboardOutlined style={{ color: '#0284c7', marginRight: 10 }} />
              Dashboard
            </Title>
              <Text type="secondary" style={{ fontFamily: "'Inter', sans-serif" }}>
                Tổng quan hiệu quả kinh doanh và tình hình hoạt động của công ty
              </Text>
          </Space>
        </Col>
        <Col xs={24} md={12} style={{ textAlign: isMobile ? 'left' : 'right' }}>
          <Space direction="vertical" align={isMobile ? 'start' : 'end'} size={8} style={{ width: '100%' }}>
          <Space wrap style={{ width: isMobile ? '100%' : 'auto', flexDirection: isMobile ? 'column' : 'row' }}>
            {(canScopeCompany || canScopeAnyDept || canScopeMyDept) && (
              <Select
                value={scopeFilter}
                onChange={setScopeFilter}
                style={{ width: isMobile ? '100%' : 200, height: 40 }}
                options={[
                  { label: <Space><UserOutlined style={{ color: '#8b5cf6' }} /> Cá nhân</Space>, value: 'personal' },
                  ...(canScopeMyDept || canScopeAnyDept || canScopeCompany ? [{ label: <Space><TeamOutlined style={{ color: '#0ea5e9' }} /> Phòng ban của tôi</Space>, value: 'my_department' }] : []),
                  ...(canScopeAnyDept || canScopeCompany ? [{ label: <Space><ProjectOutlined style={{ color: '#f59e0b' }} /> Chọn phòng ban...</Space>, value: 'any_department' }] : []),
                  ...(canScopeCompany ? [{ label: <Space><BankOutlined style={{ color: '#ef4444' }} /> Toàn công ty</Space>, value: 'company' }] : []),
                ]}
              />
            )}
            
            {scopeFilter === 'any_department' && (
              <Select
                placeholder="Chọn phòng ban"
                value={departmentId}
                onChange={setDepartmentId}
                style={{ width: isMobile ? '100%' : 200, height: 40 }}
                allowClear
                options={departments.map(d => ({ label: d.name, value: d.id }))}
              />
            )}
          </Space>
          <div style={{ display: 'flex', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
            {!isMobile && <Text style={{ marginRight: 8, whiteSpace: 'nowrap' }}>Thời gian:</Text>}
            <Select 
              value={timeFilter}
              onChange={setTimeFilter}
              options={timeFilterOptions}
              style={{ width: isMobile ? '100%' : 160, height: 40, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
            />
          </div>
        </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {statisticCards.map((item) => {
          const primaryColor = item.valueStyle?.color || '#2563eb';
          const bgColor = item.iconStyle?.background || 'rgba(37, 99, 235, 0.12)';
          
          return (
            <Col xs={24} sm={12} md={8} style={{ flex: '1 1 200px' }} key={item.title}>
              <div style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '16px 20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.2s ease',
                cursor: 'default',
                height: '100%',
                position: 'relative'
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = primaryColor; e.currentTarget.style.boxShadow = `0 4px 12px ${primaryColor}20`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}
              >
                {loading && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}>
                    <div className="ant-spin ant-spin-spinning"><span className="ant-spin-dot ant-spin-dot-spin"><i className="ant-spin-dot-item"></i><i className="ant-spin-dot-item"></i><i className="ant-spin-dot-item"></i><i className="ant-spin-dot-item"></i></span></div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{item.title}</span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: primaryColor, fontSize: 15 }}>
                    {item.icon}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexGrow: 1 }}>
                  <div style={{ 
                    fontSize: item.title === 'Doanh thu trong kỳ' && item.value > 1000000 ? 22 : 28, 
                    fontWeight: 700, 
                    color: primaryColor, 
                    lineHeight: 1, 
                    fontFamily: "'Inter', sans-serif" 
                  }}>
                    {item.value === '***' ? '***' : Number(item.value).toLocaleString('vi-VN')}
                  </div>
                  {item.suffix && item.value !== '***' && (
                    <span style={{ fontSize: 14, fontWeight: 600, color: primaryColor }}>{item.suffix}</span>
                  )}
                </div>
                {item.footer && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                    {item.footer}
                  </div>
                )}
              </div>
            </Col>
          );
        })}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <Card title={`Doanh thu & Số lượng đơn hàng (${timeFilter === 'all' ? '6 tháng gần nhất' : timeFilterOptions.find(opt => opt.value === timeFilter)?.label?.toLowerCase() || ''})`} bordered={false} style={cardStyle} loading={loading}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={revenueData} margin={{ top: 12, right: 8, left: 20, bottom: 0 }}>
                <CartesianGrid stroke={token.colorBorderSecondary} strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: token.colorTextSecondary, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: token.colorTextSecondary, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: token.colorTextSecondary, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'Doanh thu') return [`${Number(value).toLocaleString('vi-VN')} đ`, name]
                    return [value, name]
                  }}
                  cursor={{ fill: 'rgba(37, 99, 235, 0.08)' }}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: token.colorBorderSecondary,
                    background: token.colorBgElevated,
                    color: token.colorText,
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" name="Doanh thu" fill="#2563eb" radius={[10, 10, 0, 0]} barSize={42} />
                <Line yAxisId="right" type="monotone" dataKey="count" name="Số đơn hàng" stroke="#f59e0b" strokeWidth={3} dot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Sản lượng chốt theo Sales" bordered={false} style={{...cardStyle, height: '100%'}} loading={loading}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={topSellers}
                  dataKey="product_count"
                  nameKey="full_name"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={4}
                >
                  {topSellers.map((entry, index) => (
                    <Cell key={entry.user_id} fill={entry.color} />
                  ))}
                </Pie>
                <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 24, fontWeight: 'bold', fill: token.colorText }}>
                  {topSellers.reduce((sum, item) => sum + (item.product_count || 0), 0).toLocaleString('vi-VN')}
                </text>
                <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 14, fill: token.colorTextSecondary }}>
                  Tổng SP
                </text>
                <Tooltip
                  formatter={(value, name) => [`${value} SP`, name]}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: token.colorBorderSecondary,
                    background: token.colorBgElevated,
                    color: token.colorText,
                  }}
                />
                <Legend 
                  iconType="circle" 
                  verticalAlign="bottom" 
                  wrapperStyle={{ maxHeight: 60, overflowY: 'auto' }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title={`Công nợ phát sinh (${timeFilter === 'all' ? '6 tháng gần nhất' : timeFilterOptions.find(opt => opt.value === timeFilter)?.label?.toLowerCase() || ''})`} bordered={false} style={cardStyle} loading={loading}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={debtStats?.chart_data || []} margin={{ top: 12, right: 8, left: 20, bottom: 0 }}>
                <CartesianGrid stroke={token.colorBorderSecondary} strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: token.colorTextSecondary, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: token.colorTextSecondary, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
                />
                <Tooltip
                  formatter={(value, name) => {
                    return [`${Number(value).toLocaleString('vi-VN')} đ`, name]
                  }}
                  cursor={{ fill: 'rgba(239, 68, 68, 0.08)' }}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: token.colorBorderSecondary,
                    background: token.colorBgElevated,
                    color: token.colorText,
                  }}
                />
                <Legend />
                <Bar dataKey="debt" name="Công nợ phát sinh" fill="#ef4444" radius={[10, 10, 0, 0]} barSize={42} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Doanh thu theo Sales" bordered={false} style={{...cardStyle, height: '100%'}} loading={loading}>
            <div style={{ height: 300, overflowY: 'auto', overflowX: 'hidden', paddingRight: 4 }}>
              <ResponsiveContainer width="100%" height={Math.max(300, topSellers.length * 45)}>
                <BarChart
                  data={topSellers}
                  layout="vertical"
                  margin={{ top: 0, right: 30, left: 20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={token.colorBorderSecondary} />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="full_name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false}
                    tick={{ fill: token.colorTextSecondary, fontSize: 13, fontWeight: 500 }}
                    width={120}
                  />
                  <Tooltip 
                    formatter={(value) => [`${Number(value).toLocaleString('vi-VN')} đ`, 'Doanh thu']}
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{
                      borderRadius: 10,
                      borderColor: token.colorBorderSecondary,
                      background: token.colorBgElevated,
                      color: token.colorText,
                    }}
                  />
                  <Bar dataKey="total_revenue" radius={[0, 4, 4, 0]} barSize={24}>
                    {topSellers.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="10 đơn hàng mới nhất" bordered={false} style={cardStyle} loading={loading}>
            {isMobile ? (
              <List
                itemLayout="horizontal"
                dataSource={latestOrders}
                pagination={false}
                renderItem={(record) => {
                  const statusItem = {
                    color: {
                      'completed': 'green',
                      'in_production': 'blue',
                      'approved': 'gold',
                      'pending': 'orange',
                      'rejected': 'red',
                      'cancelled': 'default'
                    }[record.status] || 'default',
                    label: {
                      'completed': 'Hoàn thành',
                      'in_production': 'Đang sản xuất',
                      'approved': 'Đã duyệt',
                      'pending': 'Chờ duyệt',
                      'rejected': 'Từ chối',
                      'cancelled': 'Đã huỷ'
                    }[record.status] || record.status
                  }
                  
                  return (
                    <List.Item
                      style={{ background: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, border: '1px solid #f0f0f0' }}
                    >
                      <List.Item.Meta
                        title={
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text strong style={{ fontSize: 15, color: '#1649c9' }}>{record.order_number}</Text>
                            <Badge color={statusItem.color} text={statusItem.label} />
                          </div>
                        }
                        description={
                          <div style={{ marginTop: 4 }}>
                            <Space direction="vertical" size={2}>
                              <Text type="secondary"><UserOutlined /> {record.customer_name || 'Khách lẻ'}</Text>
                              <Text type="secondary">
                                <DollarCircleOutlined /> Tổng tiền: <Text strong style={{ color: '#059669' }}>{Number(record.total_amount).toLocaleString('vi-VN')} đ</Text>
                              </Text>
                              <Text type="secondary">
                                <BankOutlined /> Người tạo: {record.created_by_name || 'N/A'}
                              </Text>
                            </Space>
                          </div>
                        }
                      />
                    </List.Item>
                  )
                }}
              />
            ) : (
              <Table
                columns={contractColumns}
                dataSource={latestOrders}
                rowKey="id"
                pagination={false}
                size="middle"
                scroll={{ x: 'max-content' }}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
