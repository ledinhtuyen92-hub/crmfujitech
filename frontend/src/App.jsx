import { lazy, Suspense, useState, useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { ConfigProvider, Spin, theme } from 'antd'
import 'antd/dist/reset.css'

import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/AuthContext'
import MainLayout from './components/MainLayout'
import {
  CompanyAdminRoute,
  ProtectedRoute,
  SuperAdminRoute,
  PermissionRoute,
  ModuleRoute,
  SmartRedirect,
} from './components/ProtectedRoute'

// Pages — lazy loaded để tránh tải code module khi chưa cần
const CustomerList = lazy(() => import('./pages/CustomerList'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Products = lazy(() => import('./pages/Products'))
const Login = lazy(() => import('./pages/Login'))
const OrderList = lazy(() => import('./pages/OrderList'))
const ProductionList = lazy(() => import('./pages/ProductionList'))
const DeliveryList = lazy(() => import('./pages/DeliveryList'))
const WarrantyList = lazy(() => import('./pages/WarrantyList'))
const QuotationList = lazy(() => import('./pages/QuotationList'))
const PublicQuotation = lazy(() => import('./pages/PublicQuotation'))
const ApprovalList = lazy(() => import('./pages/ApprovalList'))
const RegisterCompany = lazy(() => import('./pages/RegisterCompany'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const SystemBackupSettings = lazy(() => import('./pages/admin/SystemBackupSettings'))
const CompanyManagement = lazy(() => import('./pages/admin/CompanyManagement'))
const SystemUserManagement = lazy(() => import('./pages/admin/SystemUserManagement'))
const QuotationTemplateManagement = lazy(() => import('./pages/admin/QuotationTemplateManagement'))
const QuotationBuilder = lazy(() => import('./pages/admin/QuotationBuilder'))
const RoleManagement = lazy(() => import('./pages/settings/RoleManagement'))
const UserManagement = lazy(() => import('./pages/settings/UserManagement'))
const DepartmentManagement = lazy(() => import('./pages/settings/DepartmentManagement'))
const FactoryManagement = lazy(() => import('./pages/settings/FactoryManagement'))
const CompanyGeneralSettings = lazy(() => import('./pages/settings/CompanyGeneralSettings'))
const ZaloInboxPage = lazy(() => import('./pages/ZaloInboxPage'))
const ZaloConfigPage = lazy(() => import('./pages/settings/ZaloConfigPage'))
const ZaloTemplatePage = lazy(() => import('./pages/settings/ZaloTemplatePage'))
const ZnsCampaignPage = lazy(() => import('./pages/settings/ZnsCampaignPage'))
const FacebookInboxPage = lazy(() => import('./pages/FacebookInboxPage'))
const FacebookConfigPage = lazy(() => import('./pages/settings/FacebookConfigPage'))
const WebsiteIntegration = lazy(() => import('./pages/settings/WebsiteIntegration'))
const AiAgentSettings = lazy(() => import('./pages/settings/AiAgentSettings'))
const AiKnowledgeBase = lazy(() => import('./pages/settings/AiKnowledgeBase'))
const Announcements = lazy(() => import('./pages/Announcements'))

// Các component mới từ nhánh V2 cũng chuyển sang lazy load
const LiveConsolePage = lazy(() => import('./pages/live/LiveConsolePage'))
const LiveStudioBeta = lazy(() => import('./pages/live/LiveStudioBeta'))
const LiveDashboard = lazy(() => import('./pages/live/LiveDashboard'))
const LivePlatforms = lazy(() => import('./pages/live/LivePlatforms'))
const LiveSessionsList = lazy(() => import('./pages/live/LiveSessionsList'))
const LiveDevices = lazy(() => import('./pages/live/LiveDevices'))
const LiveMediaAssets = lazy(() => import('./pages/live/LiveMediaAssets'))

// Loading fallback chung
function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Spin size="large" />
    </div>
  )
}

function DynamicTitle() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    let title = 'Fujitech Group CRM';

    if (path.startsWith('/dashboard')) title = 'Dashboard | Fujitech Group CRM';
    else if (path.startsWith('/customers')) title = 'Khách hàng | Fujitech Group CRM';
    else if (path.startsWith('/products')) title = 'Sản phẩm | Fujitech Group CRM';
    else if (path.startsWith('/quotations')) title = 'Báo giá | Fujitech Group CRM';
    else if (path.startsWith('/orders')) title = 'Đơn hàng | Fujitech Group CRM';
    else if (path.startsWith('/inventory')) title = 'Kho vận | Fujitech Group CRM';
    else if (path.startsWith('/production')) title = 'Sản xuất | Fujitech Group CRM';
    else if (path.startsWith('/delivery')) title = 'Giao hàng | Fujitech Group CRM';
    else if (path.startsWith('/warranty')) title = 'Bảo hành | Fujitech Group CRM';
    else if (path.startsWith('/zalo/inbox')) title = 'Zalo Inbox | Fujitech Group CRM';
    else if (path.startsWith('/zalo/campaigns')) title = 'Chiến dịch ZNS | Fujitech Group CRM';
    else if (path.startsWith('/facebook/inbox')) title = 'Facebook Inbox | Fujitech Group CRM';
    else if (path.startsWith('/settings')) title = 'Cấu hình | Fujitech Group CRM';
    else if (path.startsWith('/admin')) title = 'Quản trị hệ thống | Fujitech Group CRM';
    else if (path.startsWith('/login')) title = 'Đăng nhập | Fujitech Group CRM';
    else if (path.startsWith('/approvals')) title = 'Phê duyệt | Fujitech Group CRM';
    else if (path.startsWith('/announcements')) title = 'Thông báo | Fujitech Group CRM';
    else if (path.startsWith('/live/console')) title = 'Live Console | Fujitech Group CRM';
    else if (path.startsWith('/live/dashboard')) title = 'Live Dashboard | Fujitech Group CRM';
    else if (path.startsWith('/live/platforms')) title = 'Live Platforms | Fujitech Group CRM';
    else if (path.startsWith('/live/sessions')) title = 'Live Sessions | Fujitech Group CRM';
    else if (path.startsWith('/live/devices')) title = 'Live Devices | Fujitech Group CRM';
    else if (path.startsWith('/live/assets')) title = 'Live Media Assets | Fujitech Group CRM';

    document.title = title;
  }, [location.pathname]);

  return null;
}

function ApplicationLayout({ isDarkMode, toggleTheme }) {
  // Chờ auth loading xong mới render route để tránh flash/giật
  // do ModuleRoute/PermissionRoute redirect ngay sau khi loading=false
  const { loading } = useAuth()

  if (loading) {
    return <PageLoader />
  }

  return (
    <ProtectedRoute>
      <MainLayout isDarkMode={isDarkMode} toggleTheme={toggleTheme}>
        <Outlet />
      </MainLayout>
    </ProtectedRoute>
  )
}

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false)

  const toggleTheme = () => {
    setIsDarkMode((currentMode) => !currentMode)
  }


  return (
    <ConfigProvider
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          borderRadius: 8,
          colorPrimary: '#1649c9',
        },
      }}
    >
      <BrowserRouter>
        <DynamicTitle />
        {/* AuthProvider must be inside BrowserRouter so useNavigate works */}
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* ── Public routes ──────────────────────────────────── */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<RegisterCompany />} />
            <Route path="/quote/:token" element={<PublicQuotation />} />

            {/* ── Protected routes (requires login) ──────────────── */}
            <Route element={<ApplicationLayout isDarkMode={isDarkMode} toggleTheme={toggleTheme} />}>
              {/* Default redirect - thông minh tìm module đầu tiên có quyền */}
              <Route path="/" element={<SmartRedirect />} />

              {/* Main app routes */}
              <Route path="/dashboard" element={
                <PermissionRoute permissionCode="dashboard.view">
                  <Dashboard />
                </PermissionRoute>
              } />

              <Route path="/announcements" element={
                <PermissionRoute permissionCode="notifications.view_announcements">
                  <Announcements />
                </PermissionRoute>
              } />

              <Route path="/live/console" element={
                <CompanyAdminRoute>
                  <LiveConsolePage />
                </CompanyAdminRoute>
              } />

              <Route path="/live" element={<Navigate to="/live/dashboard" replace />} />
              <Route path="/live/dashboard" element={
                <PermissionRoute permissionCode="ai_agent.manage_agents">
                  <LiveDashboard />
                </PermissionRoute>
              } />
              
              <Route path="/live/platforms" element={
                <PermissionRoute permissionCode="ai_agent.manage_agents">
                  <LivePlatforms />
                </PermissionRoute>
              } />

              <Route path="/live/sessions" element={
                <PermissionRoute permissionCode="ai_agent.manage_agents">
                  <LiveSessionsList />
                </PermissionRoute>
              } />

              <Route path="/live/devices" element={
                <PermissionRoute permissionCode="ai_agent.manage_agents">
                  <LiveDevices />
                </PermissionRoute>
              } />

              <Route path="/live/assets" element={
                <PermissionRoute permissionCode="ai_agent.manage_agents">
                  <LiveMediaAssets />
                </PermissionRoute>
              } />

              <Route path="/live/studio/:id" element={
                <PermissionRoute permissionCode="ai_agent.manage_agents">
                  <LiveStudioBeta />
                </PermissionRoute>
              } />

              <Route path="/approvals" element={
                <ModuleRoute moduleCode="approvals">
                  <PermissionRoute permissionCode={['approvals.approve', 'approvals.delete']}>
                    <ApprovalList />
                  </PermissionRoute>
                </ModuleRoute>
              } />

              <Route path="/customers" element={
                <ModuleRoute moduleCode="crm">
                  <PermissionRoute permissionCode="crm.view">
                    <CustomerList />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/quotations" element={
                <ModuleRoute moduleCode="sales">
                  <PermissionRoute permissionCode="sales.view">
                    <QuotationList />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/orders" element={
                <ModuleRoute moduleCode="orders">
                  <PermissionRoute permissionCode="orders.view">
                    <OrderList />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/products" element={
                <ModuleRoute moduleCode="products">
                  <PermissionRoute permissionCode="products.view">
                    <Products />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/inventory" element={
                <ModuleRoute moduleCode="inventory">
                  <PermissionRoute permissionCode="inventory.view">
                    <Inventory />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/production" element={
                <ModuleRoute moduleCode="production">
                  <PermissionRoute permissionCode="production.view">
                    <ProductionList />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/delivery" element={
                <ModuleRoute moduleCode="delivery">
                  <PermissionRoute permissionCode="delivery.view">
                    <DeliveryList />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/warranty" element={
                <ModuleRoute moduleCode="warranty">
                  <PermissionRoute permissionCode="warranty.view">
                    <WarrantyList />
                  </PermissionRoute>
                </ModuleRoute>
              } />

              {/* Zalo Integration */}
              <Route path="/zalo/inbox" element={
                <ModuleRoute moduleCode="zalo">
                  <PermissionRoute permissionCode="zalo.view">
                    <ZaloInboxPage />
                  </PermissionRoute>
                </ModuleRoute>
              } />

              <Route path="/zalo/campaigns" element={
                <ModuleRoute moduleCode="zalo">
                  <PermissionRoute permissionCode="zalo.campaigns">
                    <ZnsCampaignPage />
                  </PermissionRoute>
                </ModuleRoute>
              } />

              <Route path="/settings/zalo" element={
                <ModuleRoute moduleCode="zalo">
                  <PermissionRoute permissionCode="zalo.config">
                    <ZaloConfigPage />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/settings/zalo-templates" element={
                <ModuleRoute moduleCode="zalo">
                  <PermissionRoute permissionCode={['zalo.config', 'zalo.manage_templates']}>
                    <ZaloTemplatePage />
                  </PermissionRoute>
                </ModuleRoute>
              } />

              {/* Facebook Multi-Page Integration */}
              <Route path="/facebook/inbox" element={
                <ModuleRoute moduleCode="facebook">
                  <PermissionRoute permissionCode="facebook.view_inbox">
                    <FacebookInboxPage />
                  </PermissionRoute>
                </ModuleRoute>
              } />

              <Route path="/settings/facebook" element={
                <ModuleRoute moduleCode="facebook">
                  <PermissionRoute permissionCode="facebook.manage_config">
                    <FacebookConfigPage />
                  </PermissionRoute>
                </ModuleRoute>
              } />

              <Route
                path="/settings/website"
                element={
                  <PermissionRoute permissionCode="website_integration.manage">
                    <WebsiteIntegration />
                  </PermissionRoute>
                }
              />
              <Route
                path="/settings/ai-agents"
                element={
                  <ModuleRoute moduleCode="ai_agent">
                    <PermissionRoute permissionCode={['ai_agent.view_dashboard', 'ai_agent.manage_agents', 'ai_agent.manage_keys', 'ai_agent.manage_knowledge']}>
                      <AiAgentSettings />
                    </PermissionRoute>
                  </ModuleRoute>
                }
              />
              <Route
                path="/settings/ai-knowledge"
                element={
                  <ModuleRoute moduleCode="ai_agent">
                    <PermissionRoute permissionCode="ai_agent.manage_knowledge">
                      <AiKnowledgeBase />
                    </PermissionRoute>
                  </ModuleRoute>
                }
              />

              <Route
                path="/settings/general"
                element={
                  <CompanyAdminRoute>
                    <CompanyGeneralSettings />
                  </CompanyAdminRoute>
                }
              />
              <Route
                path="/settings/users"
                element={
                  <CompanyAdminRoute>
                    <UserManagement />
                  </CompanyAdminRoute>
                }
              />
              <Route
                path="/settings/roles"
                element={
                  <CompanyAdminRoute>
                    <RoleManagement />
                  </CompanyAdminRoute>
                }
              />
              <Route
                path="/settings/departments"
                element={
                  <CompanyAdminRoute>
                    <DepartmentManagement />
                  </CompanyAdminRoute>
                }
              />
              <Route
                path="/settings/factories"
                element={
                  <PermissionRoute permissionCode="production.manage_factory">
                    <FactoryManagement />
                  </PermissionRoute>
                }
              />
              <Route
                path="/admin/quotation-templates/:id/builder"
                element={
                  <CompanyAdminRoute>
                    <QuotationBuilder />
                  </CompanyAdminRoute>
                }
              />

              {/* System Admin routes */}
              <Route
                path="/admin/dashboard"
                element={
                  <SuperAdminRoute>
                    <AdminDashboard />
                  </SuperAdminRoute>
                }
              />
              <Route
                path="/admin/companies"
                element={
                  <SuperAdminRoute>
                    <CompanyManagement />
                  </SuperAdminRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <SuperAdminRoute>
                    <SystemUserManagement />
                  </SuperAdminRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <SuperAdminRoute>
                    <AdminSettings />
                  </SuperAdminRoute>
                }
              />
              <Route
                path="/admin/backup-settings"
                element={
                  <SuperAdminRoute>
                    <SystemBackupSettings />
                  </SuperAdminRoute>
                }
              />
              <Route
                path="/admin/quotation-templates"
                element={
                  <SuperAdminRoute>
                    <QuotationTemplateManagement />
                  </SuperAdminRoute>
                }
              />
            </Route>

            {/* ── Fallback ────────────────────────────────────────── */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
