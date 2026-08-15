import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api from '../utils/api'
import {
  Alert,
  Avatar,
  Badge,
  Dropdown,
  Layout,
  Menu,
  Space,
  Switch,
  Typography,
  theme,
  Modal,
  Form,
  Grid,
  Input,
  Drawer,
  Button,
  message,
  Popover,
  List,
} from 'antd'
import {
  AppstoreOutlined,
  BankOutlined,
  BellOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  InboxOutlined,
  KeyOutlined,
  LogoutOutlined,
  MoonOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  SmileOutlined,
  SunOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
  UsergroupAddOutlined,
  AppstoreAddOutlined,
  CarOutlined,
  SafetyCertificateOutlined,
  WechatOutlined,
  MessageOutlined,
  MenuOutlined,
  NotificationOutlined,
  LeftOutlined,
  RightOutlined,
  UpOutlined,
  DownOutlined,
  ApiOutlined,
  RobotOutlined, BookOutlined,
  FacebookOutlined,
} from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'

const { Header, Sider, Content } = Layout
const { Text, Title } = Typography
const { useBreakpoint } = Grid

function MainLayout({ children, isDarkMode, toggleTheme }) {
  const location = useLocation()
  const { token } = theme.useToken()
  const screens = useBreakpoint()
  const isMobile = screens.lg === false
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  
  const { user, logout, isSuperAdmin, isCompanyAdmin, hasPermission, maintenanceMode, isModuleActive } = useAuth()

  // ── Thông báo ──────────────────────────────────────────────────
  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingInventoryCount, setPendingInventoryCount] = useState(0)
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)
  const [pendingSalesCount, setPendingSalesCount] = useState(0)
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0)
  const [pendingProductionCount, setPendingProductionCount] = useState(0)
  const [pendingDeliveryCount, setPendingDeliveryCount] = useState(0)
  const [unreadAnnouncementsCount, setUnreadAnnouncementsCount] = useState(0)
  const [notifications, setNotifications] = useState([])
  const [notifVisible, setNotifVisible] = useState(false)

  React.useEffect(() => {
    if (!user) return

    const fetchCounts = () => {
      api.get('/notifications/unread-count/').then(res => {
        setUnreadCount(res.data.unread_count || 0)
        setPendingInventoryCount(res.data.pending_inventory_count || 0)
        setPendingApprovalCount(res.data.pending_approval_count || 0)
        setPendingSalesCount(res.data.pending_sales_count || 0)
        setPendingOrdersCount(res.data.pending_orders_count || 0)
        setPendingProductionCount(res.data.pending_production_count || 0)
        setPendingDeliveryCount(res.data.pending_delivery_count || 0)
        setUnreadAnnouncementsCount(res.data.unread_announcements_count || 0)
      }).catch(() => {})
    }

    // Gọi lần đầu
    fetchCounts()

    // Lắng nghe sự kiện để cập nhật tức thì (ngay sau khi duyệt/xóa)
    window.addEventListener('refresh-notifications', fetchCounts)

    // Lặp lại mỗi 30 giây
    const intervalId = setInterval(fetchCounts, 30000)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener('refresh-notifications', fetchCounts)
    }
  }, [user])

  // ── Menu items (tuỳ theo quyền) ────────────────────────────────
  const menuItems = isSuperAdmin
    ? [
        {
          key: '/admin/dashboard',
          icon: <DashboardOutlined />,
          label: <Link to="/admin/dashboard">Dashboard Hệ thống</Link>,
        },
        {
          key: '/admin/companies',
          icon: <BankOutlined />,
          label: <Link to="/admin/companies">Quản lý Khách hàng SaaS</Link>,
        },
        {
          key: '/admin/users',
          icon: <TeamOutlined />,
          label: <Link to="/admin/users">Quản lý Tài khoản</Link>,
        },
        {
          key: '/admin/settings',
          icon: <SettingOutlined />,
          label: <Link to="/admin/settings">Cấu hình Gói & Hạn mức</Link>,
        },
        {
          key: '/admin/quotation-templates',
          icon: <FileTextOutlined />,
          label: <Link to="/admin/quotation-templates">Kho Mẫu Báo Giá</Link>,
        },
      ]
    : [
        ...(hasPermission('dashboard.view') ? [{
          key: '/dashboard',
          icon: <DashboardOutlined />,
          label: <Link to="/dashboard">Dashboard</Link>,
        }] : []),
        ...(hasPermission('notifications.view_announcements') ? [{
          key: '/announcements',
          icon: <NotificationOutlined />,
          label: <Link to="/announcements">Thông báo {unreadAnnouncementsCount > 0 && <Badge count={unreadAnnouncementsCount} style={{ marginLeft: 8 }} />}</Link>,
        }] : []),
        ...(isModuleActive('approvals') ? [{
          key: '/approvals',
          icon: <CheckCircleOutlined />,
          label: <Link to="/approvals">Phê duyệt {pendingApprovalCount > 0 && <Badge count={pendingApprovalCount} style={{ marginLeft: 8 }} />}</Link>,
        }] : []),
        ...(isModuleActive('crm') && hasPermission('crm.view') ? [{
          key: '/customers',
          icon: <TeamOutlined />,
          label: <Link to="/customers">Khách hàng</Link>,
        }] : []),
        ...(isModuleActive('products') && hasPermission('products.view') ? [{
          key: '/products',
          icon: <InboxOutlined />,
          label: <Link to="/products">Sản phẩm & Dịch vụ</Link>,
        }] : []),
        ...(isModuleActive('sales') && hasPermission('sales.view') ? [{
          key: '/quotations',
          icon: <ShoppingCartOutlined />,
          label: <Link to="/quotations">Bán hàng (Báo giá) {pendingSalesCount > 0 && <Badge count={pendingSalesCount} style={{ marginLeft: 8 }} />}</Link>,
        }] : []),
        ...(isModuleActive('orders') && hasPermission('orders.view') ? [{
          key: '/orders',
          icon: <FileDoneOutlined />,
          label: <Link to="/orders">Đơn hàng {pendingOrdersCount > 0 && <Badge count={pendingOrdersCount} style={{ marginLeft: 8 }} />}</Link>,
        }] : []),
        ...(isModuleActive('inventory') && hasPermission('inventory.view') ? [{
          key: '/inventory',
          icon: <DatabaseOutlined />,
          label: <Link to="/inventory">Kho vận {pendingInventoryCount > 0 && <Badge count={pendingInventoryCount} style={{ marginLeft: 8 }} />}</Link>,
        }] : []),
        ...(isModuleActive('production') && hasPermission('production.view') ? [{
          key: '/production',
          icon: <ToolOutlined />,
          label: <Link to="/production">Sản xuất {pendingProductionCount > 0 && <Badge count={pendingProductionCount} style={{ marginLeft: 8 }} />}</Link>,
        }] : []),
        ...(isModuleActive('delivery') && hasPermission('delivery.view') ? [{
          key: '/delivery',
          icon: <CarOutlined />,
          label: <Link to="/delivery">Giao hàng {pendingDeliveryCount > 0 && <Badge count={pendingDeliveryCount} style={{ marginLeft: 8 }} />}</Link>,
        }] : []),
        ...(isModuleActive('warranty') && hasPermission('warranty.view') ? [{
          key: '/warranty',
          icon: <SafetyCertificateOutlined />,
          label: <Link to="/warranty">Bảo hành</Link>,
        }] : []),
        ...(isModuleActive('zalo') && (hasPermission('zalo.view') || hasPermission('zalo.config') || hasPermission('zalo.manage_templates')) ? [{
          key: 'zalo-group',
          icon: <WechatOutlined style={{ color: '#0068ff' }} />,
          label: 'Zalo (Omnichannel)',
          children: [
            ...(hasPermission('zalo.view') ? [{
              key: '/zalo/inbox',
              icon: <WechatOutlined style={{ color: '#0068ff' }} />,
              label: <Link to="/zalo/inbox">Zalo Inbox</Link>,
            }] : []),
            ...(hasPermission('zalo.config') ? [{
              key: '/settings/zalo',
              icon: <SettingOutlined />,
              label: <Link to="/settings/zalo">Cấu hình Zalo OA</Link>,
            }] : []),
            ...(hasPermission('zalo.manage_templates') ? [{
              key: '/settings/zalo-templates',
              icon: <MessageOutlined />,
              label: <Link to="/settings/zalo-templates">Mẫu Zalo ZNS</Link>,
            }] : []),
          ],
        }] : []),
        ...(isModuleActive('facebook') && (hasPermission('facebook.view_inbox') || hasPermission('facebook.manage_config')) ? [{
          key: 'facebook-group',
          icon: <span style={{ color: '#1877f2', fontWeight: 900, fontSize: 14 }}>𝐟</span>,
          label: 'Facebook (Omnichannel)',
          children: [
            ...(hasPermission('facebook.view_inbox') ? [{
              key: '/facebook/inbox',
              icon: <span style={{ color: '#1877f2', fontWeight: 900, fontSize: 14 }}>𝐟</span>,
              label: <Link to="/facebook/inbox">Facebook Inbox</Link>,
            }] : []),
            ...(hasPermission('facebook.manage_config') ? [{
              key: '/settings/facebook',
              icon: <SettingOutlined />,
              label: <Link to="/settings/facebook">Cấu hình Facebook</Link>,
            }] : []),
          ],
        }] : []),
        ...(isModuleActive('website_integration') && hasPermission('website_integration.manage') ? [{
          key: '/settings/website',
          icon: <ApiOutlined style={{ color: '#eb2f96' }} />,
          label: <Link to="/settings/website">Tích hợp Website</Link>,
        }] : []),
        ...(isModuleActive('ai_agent') && (hasPermission('ai_agent.view_dashboard') || hasPermission('ai_agent.manage_agents') || hasPermission('ai_agent.manage_knowledge') || hasPermission('ai_agent.manage_keys')) ? [
          { type: 'divider' },
          {
            key: 'tools-group',
            icon: <AppstoreAddOutlined style={{ color: '#fa8c16' }} />,
            label: 'AI Agents',
            children: [
              ...(hasPermission('ai_agent.manage_agents') || hasPermission('ai_agent.manage_keys') || hasPermission('ai_agent.view_dashboard') ? [{
                key: '/settings/ai-agents',
                icon: <RobotOutlined style={{ color: '#52c41a' }} />,
                label: <Link to="/settings/ai-agents">Trợ lý AI</Link>,
              }] : []),
              ...(hasPermission('ai_agent.manage_knowledge') ? [{
                key: '/settings/ai-knowledge',
                icon: <BookOutlined style={{ color: '#1890ff' }} />,
                label: <Link to="/settings/ai-knowledge">Huấn luyện AI (RAG)</Link>,
              }] : [])
            ],
          }
        ] : []),
        ...(isCompanyAdmin ? [
            { type: 'divider' },
            {
              key: 'settings-group',
              icon: <SettingOutlined />,
              label: 'Quản lý công ty',
              children: [
                {
                  key: '/settings/general',
                  icon: <SettingOutlined />,
                  label: <Link to="/settings/general">Cài đặt & Mẫu báo giá</Link>,
                },
                {
                  key: '/settings/users',
                  icon: <UsergroupAddOutlined />,
                  label: <Link to="/settings/users">Nhân viên</Link>,
                },
                {
                  key: '/settings/departments',
                  icon: <TeamOutlined />,
                  label: <Link to="/settings/departments">Phòng ban</Link>,
                },
                {
                  key: '/settings/roles',
                  icon: <KeyOutlined />,
                  label: <Link to="/settings/roles">Vai trò & Quyền</Link>,
                },
              ],
            },
          ]
        : []),
      ]

  // ── Modal Đổi mật khẩu ───────────────────────────────────────────
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordForm] = Form.useForm()

  const handlePasswordSubmit = async (values) => {
    try {
      await api.post('/users/change-password/', values)
      message.success('Đổi mật khẩu thành công!')
      setPasswordModalOpen(false)
    } catch (err) {
      const errData = err.response?.data
      if (errData && typeof errData === 'object') {
        const msg = Object.values(errData).flat().join(' ')
        message.error(msg || 'Mật khẩu cũ không đúng hoặc có lỗi xảy ra.')
      } else {
        message.error('Có lỗi xảy ra khi đổi mật khẩu.')
      }
    }
  }



  const handleNotifVisibleChange = (newVisible) => {
    setNotifVisible(newVisible)
    if (newVisible) {
      api.get('/notifications/').then(res => {
        const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
        setNotifications(data)
      }).catch(() => {})
    }
  }

  const handleMarkAsRead = async (item) => {
    if (!item.is_read) {
      try {
        await api.patch(`/notifications/${item.id}/read/`)
        setUnreadCount(prev => Math.max(0, prev - 1))
        setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n))
      } catch {}
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read/')
      setUnreadCount(0)
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      message.success('Đã đánh dấu tất cả là đã đọc.')
    } catch {}
  }

  // ── Avatar dropdown menu ─────────────────────────────────────────
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Hồ sơ cá nhân',
      disabled: true,
    },
    {
      key: 'change-password',
      icon: <KeyOutlined />,
      label: 'Đổi mật khẩu',
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      danger: true,
    },
  ]

  const onUserMenuClick = ({ key }) => {
    if (key === 'logout') logout()
    if (key === 'change-password') {
      setPasswordModalOpen(true)
      passwordForm.resetFields()
    }
  }

  // ── Tên hiển thị ─────────────────────────────────────────────────
  const displayName = user?.full_name || user?.username || 'Người dùng'
  const initials = displayName
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const avatarGradient = user?.is_superuser
    ? 'linear-gradient(135deg, #f59e0b 0%, #dc2626 100%)'
    : user?.is_company_admin
      ? 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)'
      : 'linear-gradient(135deg, #059669 0%, #0891b2 100%)'

  // ── Lời chào tùy chỉnh ───────────────────────────────────────────
  let greetingMessage = 'Chào mừng bạn quay lại hệ thống. Chúc bạn một ngày làm việc hiệu quả!'
  if (user?.is_superuser) {
    greetingMessage = 'Hệ thống đang hoạt động ổn định. Chúc bạn một ngày làm việc hiệu quả!'
  } else if (user?.is_company_admin) {
    greetingMessage = 'Chào mừng Giám đốc. Cùng xem qua tình hình kinh doanh hôm nay nhé!'
  } else if (hasPermission('crm.view') || hasPermission('crm.create')) {
    greetingMessage = 'Chào mừng bạn quay lại. Hôm nay có lịch hẹn khách hàng nào không?'
  }

  const siderContent = (
    <>
      {/* ── Logo ───────────────────────────────────────────────── */}
      <div
        style={{
          height: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '0 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          flexShrink: 0,
        }}
      >
          <div
            style={{
              width: 48,
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img src="/logo.png" alt="Fujitech Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        {!collapsed && (
          <Title
            level={4}
            style={{ margin: 0, color: '#ffffff', fontWeight: 800, letterSpacing: 0, whiteSpace: 'nowrap' }}
          >
            Fujitech Hub
          </Title>
        )}
      </div>

      {/* ── Company or SuperAdmin Badge ─────────────────────────── */}
      {isSuperAdmin ? (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(220, 38, 38, 0.2) 100%)',
              border: '1px solid rgba(249, 115, 22, 0.35)',
              borderRadius: 8,
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
          >
            <SettingOutlined style={{ color: '#fdba74', fontSize: 16 }} />
            {!collapsed && (
              <div>
                <Text style={{ color: '#fdba74', fontSize: 11, fontWeight: 800, display: 'block', letterSpacing: 0.5 }}>
                  SYSTEM ADMIN
                </Text>
                <Text style={{ color: '#e5e7eb', fontSize: 11 }}>
                  SaaS Platform Console
                </Text>
              </div>
            )}
          </div>
        </div>
      ) : user?.company_name ? (
        <div
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div
            style={{
              background: 'rgba(37, 99, 235, 0.2)',
              borderRadius: 8,
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 6,
              overflow: 'hidden'
            }}
          >
            <BankOutlined style={{ color: '#93c5fd', fontSize: 12, flexShrink: 0 }} />
            {!collapsed && (
              <Text style={{ color: '#93c5fd', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {user.company_name}
              </Text>
            )}
          </div>
        </div>
      ) : null}

      <Menu
        mode="inline"
        theme="dark"
        selectedKeys={[location.pathname]}
        defaultOpenKeys={[]}
        items={menuItems}
        style={{
          borderRight: 0,
          padding: '12px 12px',
          background: 'transparent',
          fontWeight: 600,
        }}
        onClick={() => {
          if (isMobile) setDrawerVisible(false)
        }}
      />
    </>
  )

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      {isMobile ? (
        <Drawer
          placement="left"
          closable={false}
          onClose={() => setDrawerVisible(false)}
          open={drawerVisible}
          styles={{ body: { padding: 0, background: 'linear-gradient(180deg, #111827 0%, #172554 100%)' } }}
          width={260}
        >
          {siderContent}
        </Drawer>
      ) : (
        <>
          <Sider
            collapsible
            collapsed={collapsed}
            trigger={null}
            width={260}
            theme="dark"
            className="custom-sider-scrollbar"
            style={{
              background: 'linear-gradient(180deg, #111827 0%, #172554 100%)',
              boxShadow: '8px 0 24px rgba(15, 23, 42, 0.16)',
              minHeight: '100vh',
              position: 'fixed',
              left: 0,
              top: 0,
              bottom: 0,
              zIndex: 100,
              overflowY: 'auto',
              transition: 'all 0.2s',
            }}
          >
            {siderContent}
          </Sider>
          <div
            onClick={() => setCollapsed(!collapsed)}
            style={{
              position: 'fixed',
              top: '50%',
              left: collapsed ? 80 : 260,
              transform: 'translate(0, -50%)',
              zIndex: 101,
              width: 14,
              height: 48,
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.05)',
              borderLeft: 'none',
              borderRadius: '0 8px 8px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#94a3b8',
              transition: 'all 0.2s',
              boxShadow: '4px 0 8px rgba(0,0,0,0.1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.background = '#3b82f6'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94a3b8'
              e.currentTarget.style.background = '#1e293b'
            }}
          >
            {collapsed ? <RightOutlined style={{ fontSize: 10, fontWeight: 900 }} /> : <LeftOutlined style={{ fontSize: 10, fontWeight: 900 }} />}
          </div>
        </>
      )}

      {/* ── Main content area (offset by sider width) ────────────── */}
      <Layout style={{ minWidth: 0, background: token.colorBgLayout, marginLeft: isMobile ? 0 : (collapsed ? 80 : 260), transition: 'all 0.2s', position: 'relative' }}>
        
        {/* Toggle Header Button */}
        {true && (
          <div
            onClick={() => setHeaderCollapsed(!headerCollapsed)}
            style={{
              position: 'fixed',
              top: headerCollapsed ? 0 : (isMobile ? 70 : 80),
              right: 24,
              zIndex: 101,
              width: 32,
              height: 16,
              background: token.colorBgContainer,
              border: '1px solid #e2e8f0',
              borderTop: 'none',
              borderRadius: '0 0 6px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748b',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#2563eb'
              e.currentTarget.style.background = '#f8fafc'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#64748b'
              e.currentTarget.style.background = token.colorBgContainer
            }}
          >
            {headerCollapsed ? <DownOutlined style={{ fontSize: 10, fontWeight: 900 }} /> : <UpOutlined style={{ fontSize: 10, fontWeight: 900 }} />}
          </div>
        )}

        <Header
          style={{
            height: headerCollapsed ? 0 : (isMobile ? 'auto' : 80),
            minHeight: headerCollapsed ? 0 : (isMobile ? 70 : 80),
            lineHeight: 'normal',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: isDarkMode
              ? '#1e293b'
              : 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
            boxShadow: isDarkMode
              ? '0 4px 18px rgba(0, 0, 0, 0.28)'
              : '0 4px 18px rgba(15, 23, 42, 0.08)',
            padding: isMobile ? '12px 16px' : '0 24px',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            flexShrink: 0,
            overflow: 'hidden',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: headerCollapsed ? 0 : 1,
            visibility: headerCollapsed ? 'hidden' : 'visible'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              minWidth: 0,
            }}
          >
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined style={{ fontSize: 20 }} />}
                onClick={() => setDrawerVisible(true)}
                style={{ marginLeft: -8 }}
              />
            )}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: isDarkMode 
                  ? 'linear-gradient(135deg, #1e3a8a 0%, #312e81 100%)' 
                  : 'linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%)',
                display: isMobile ? 'none' : 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isDarkMode 
                  ? '0 4px 14px rgba(0,0,0,0.5)' 
                  : '0 4px 14px rgba(59, 130, 246, 0.15)',
              }}
            >
              <SmileOutlined style={{ fontSize: 24, color: isDarkMode ? '#60a5fa' : '#2563eb', animation: 'wave 2.5s infinite', transformOrigin: '70% 70%' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
              <Title
                level={3}
                style={{
                  margin: 0,
                  fontSize: isMobile ? 16 : 22,
                  fontWeight: 800,
                  wordBreak: 'break-word',
                  fontFamily: "'Inter', sans-serif",
                  lineHeight: 1.2,
                  marginBottom: isMobile ? 4 : 0
                }}
              >
                <span
                  style={{
                    backgroundImage: isDarkMode 
                      ? 'linear-gradient(90deg, #60a5fa, #c084fc)' 
                      : 'linear-gradient(90deg, #2563eb, #9333ea)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    color: 'transparent',
                  }}
                >
                  Xin chào, {user?.full_name || user?.username}!
                </span>
              </Title>
              <Text type="secondary" style={{ fontSize: isMobile ? 11 : 13, fontWeight: 500, fontFamily: "'Inter', sans-serif", lineHeight: 1.3 }}>
                {greetingMessage}
              </Text>
            </div>
            <style>
              {`
                @keyframes wave {
                  0% { transform: rotate(0deg); }
                  10% { transform: rotate(14deg); }
                  20% { transform: rotate(-8deg); }
                  30% { transform: rotate(14deg); }
                  40% { transform: rotate(-4deg); }
                  50% { transform: rotate(10deg); }
                  60% { transform: rotate(0deg); }
                  100% { transform: rotate(0deg); }
                }
              `}
            </style>
          </div>

          <Space size={20} align="center" style={{ flexShrink: 0 }}>
            <Switch
              checked={isDarkMode}
              checkedChildren={<MoonOutlined />}
              unCheckedChildren={<SunOutlined />}
              onChange={toggleTheme}
            />

            <Popover
              content={
                <div style={{ width: isMobile ? '85vw' : 320, maxWidth: 350, maxHeight: '70vh', overflowY: 'auto', overflowX: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text strong>Thông báo</Text>
                    {notifications.length > 0 && (
                      <Button type="link" size="small" onClick={handleMarkAllRead} style={{ padding: 0 }}>
                        Đánh dấu tất cả đã đọc
                      </Button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '20px 0' }}>
                      Không có thông báo nào.
                    </Text>
                  ) : (
                    <List
                      itemLayout="horizontal"
                      dataSource={notifications}
                      renderItem={(item) => (
                        <List.Item
                          style={{
                            cursor: 'pointer',
                            background: item.is_read ? 'transparent' : '#f0f5ff',
                            padding: '8px 12px',
                            borderBottom: '1px solid #f0f0f0',
                            borderRadius: 4,
                            marginBottom: 4,
                          }}
                          onClick={() => handleMarkAsRead(item)}
                        >
                          <List.Item.Meta
                            title={
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Text strong={!item.is_read} style={{ fontSize: 13, color: item.is_read ? '#595959' : '#1890ff', wordBreak: 'break-word', whiteSpace: 'normal', flex: 1, paddingRight: 8 }}>
                                  {item.title}
                                </Text>
                                {!item.is_read && <Badge status="processing" style={{ flexShrink: 0, marginTop: 4 }} />}
                              </div>
                            }
                            description={
                              <div>
                                <Text style={{ fontSize: 12, color: item.is_read ? '#8c8c8c' : '#595959', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 4, wordBreak: 'break-word' }}>
                                  {item.message ? item.message.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ') : ''}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                                  {new Date(item.created_at).toLocaleString('vi-VN')}
                                </Text>
                              </div>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              }
              trigger="click"
              placement={isMobile ? 'bottom' : 'bottomRight'}
              open={notifVisible}
              onOpenChange={handleNotifVisibleChange}
            >
              <Badge count={unreadCount} offset={[-2, 4]} size="small">
                <BellOutlined
                  style={{
                    color: token.colorTextSecondary,
                    cursor: 'pointer',
                    fontSize: 20,
                  }}
                />
              </Badge>
            </Popover>

            {/* ── User Avatar Dropdown ──────────────────────────── */}
            <Dropdown
              menu={{ items: userMenuItems, onClick: onUserMenuClick }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Space
                size={10}
                align="center"
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                <Avatar
                  size={36}
                  style={{
                    background: avatarGradient,
                    boxShadow: '0 8px 18px rgba(37, 99, 235, 0.22)',
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {initials || <UserOutlined />}
                </Avatar>
                <div style={{ lineHeight: 1.3, display: isMobile ? 'none' : 'block' }}>
                  <div>
                    <Text strong style={{ fontSize: 14 }}>
                      {displayName}
                    </Text>
                  </div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {user?.is_superuser
                      ? 'System Admin'
                      : user?.role_name || user?.job_title || 'Nhân viên'}
                  </Text>
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: '0',
            padding: location.pathname.includes('/inbox') ? 0 : '24px',
            height: headerCollapsed ? '100vh' : 'calc(100vh - 80px)',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            minWidth: 0,
            overflow: 'auto',
            background: token.colorBgLayout,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {maintenanceMode && (
            <Alert
              message="⚠️ HỆ THỐNG ĐANG TRONG CHẾ ĐỘ BẢO TRÌ DỮ LIỆU"
              description="Toàn bộ chức năng thêm, sửa, xóa dữ liệu trên hệ thống tạm thời bị khóa để phục vụ bảo trì kỹ thuật. Bạn vẫn có thể tra cứu, truy cập và xem báo cáo bình thường."
              type="warning"
              showIcon
              banner
              style={{ marginBottom: 20, borderRadius: 8, border: '1px solid #f59e0b', background: '#fffbeb', color: '#b45309', fontWeight: 500 }}
            />
          )}
          {children}
        </Content>
      </Layout>

      {/* Modal Đổi Mật Khẩu */}
      <Modal
        title={<span><KeyOutlined /> Đổi mật khẩu cá nhân</span>}
        open={passwordModalOpen}
        onCancel={() => setPasswordModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={handlePasswordSubmit}
          style={{ marginTop: 24 }}
        >
          <Form.Item
            name="old_password"
            label="Mật khẩu cũ"
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu cũ' }]}
          >
            <Input.Password size="large" />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="Mật khẩu mới"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu mới' },
              { min: 8, message: 'Mật khẩu mới phải có ít nhất 8 ký tự' }
            ]}
          >
            <Input.Password size="large" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="Nhập lại mật khẩu mới"
            dependencies={['new_password']}
            rules={[
              { required: true, message: 'Vui lòng xác nhận mật khẩu mới' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('Hai mật khẩu không khớp!'))
                },
              }),
            ]}
          >
            <Input.Password size="large" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setPasswordModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit">Xác nhận đổi</Button>
          </div>
        </Form>
      </Modal>
    </Layout>
  )
}

export default MainLayout
