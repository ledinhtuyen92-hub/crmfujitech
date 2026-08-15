import { useState, useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import 'antd/dist/reset.css'

import { AuthProvider } from './contexts/AuthContext'
import MainLayout from './components/MainLayout'
import {
  CompanyAdminRoute,
  ProtectedRoute,
  SuperAdminRoute,
  PermissionRoute,
  ModuleRoute,
} from './components/ProtectedRoute'

// Pages
import CustomerList from './pages/CustomerList'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Products from './pages/Products'
import Login from './pages/Login'
import OrderList from './pages/OrderList'
import ProductionList from './pages/ProductionList'
import DeliveryList from './pages/DeliveryList'
import WarrantyList from './pages/WarrantyList'
import QuotationList from './pages/QuotationList'
import PublicQuotation from './pages/PublicQuotation'
import ApprovalList from './pages/ApprovalList'
import RegisterCompany from './pages/RegisterCompany'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminSettings from './pages/admin/AdminSettings'
import CompanyManagement from './pages/admin/CompanyManagement'
import SystemUserManagement from './pages/admin/SystemUserManagement'
import QuotationTemplateManagement from './pages/admin/QuotationTemplateManagement'
import QuotationBuilder from './pages/admin/QuotationBuilder'
import RoleManagement from './pages/settings/RoleManagement'
import UserManagement from './pages/settings/UserManagement'
import DepartmentManagement from './pages/settings/DepartmentManagement'
import FactoryManagement from './pages/settings/FactoryManagement'
import CompanyGeneralSettings from './pages/settings/CompanyGeneralSettings'
import ZaloInboxPage from './pages/ZaloInboxPage'
import ZaloConfigPage from './pages/settings/ZaloConfigPage'
import ZaloTemplatePage from './pages/settings/ZaloTemplatePage'
import FacebookInboxPage from './pages/FacebookInboxPage'
import FacebookConfigPage from './pages/settings/FacebookConfigPage'
import WebsiteIntegration from './pages/settings/WebsiteIntegration'
import AiAgentSettings from './pages/settings/AiAgentSettings'
import AiKnowledgeBase from './pages/settings/AiKnowledgeBase'
import Announcements from './pages/Announcements'

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
    else if (path.startsWith('/facebook/inbox')) title = 'Facebook Inbox | Fujitech Group CRM';
    else if (path.startsWith('/settings')) title = 'Cấu hình | Fujitech Group CRM';
    else if (path.startsWith('/admin')) title = 'Quản trị hệ thống | Fujitech Group CRM';
    else if (path.startsWith('/login')) title = 'Đăng nhập | Fujitech Group CRM';
    else if (path.startsWith('/approvals')) title = 'Phê duyệt | Fujitech Group CRM';
    else if (path.startsWith('/announcements')) title = 'Thông báo | Fujitech Group CRM';

    document.title = title;
  }, [location.pathname]);

  return null;
}

function ApplicationLayout({ isDarkMode, toggleTheme }) {
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
          <Routes>
            {/* ── Public routes ──────────────────────────────────── */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<RegisterCompany />} />
            <Route path="/quote/:token" element={<PublicQuotation />} />

            {/* ── Protected routes (requires login) ──────────────── */}
            <Route element={<ApplicationLayout isDarkMode={isDarkMode} toggleTheme={toggleTheme} />}>
              {/* Default redirect */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

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

              <Route path="/approvals" element={
                <ApprovalList />
              } />

              <Route path="/customers" element={
                <ModuleRoute moduleCode="crm">
                  <PermissionRoute permissionCode="crm.view" fallback="/dashboard">
                    <CustomerList />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/quotations" element={
                <ModuleRoute moduleCode="sales">
                  <PermissionRoute permissionCode="sales.view" fallback="/dashboard">
                    <QuotationList />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/orders" element={
                <ModuleRoute moduleCode="orders">
                  <PermissionRoute permissionCode="orders.view" fallback="/dashboard">
                    <OrderList />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/products" element={
                <ModuleRoute moduleCode="products">
                  <PermissionRoute permissionCode="products.view" fallback="/dashboard">
                    <Products />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/inventory" element={
                <ModuleRoute moduleCode="inventory">
                  <PermissionRoute permissionCode="inventory.view" fallback="/dashboard">
                    <Inventory />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/production" element={
                <ModuleRoute moduleCode="production">
                  <PermissionRoute permissionCode="production.view" fallback="/dashboard">
                    <ProductionList />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/delivery" element={
                <ModuleRoute moduleCode="delivery">
                  <PermissionRoute permissionCode="delivery.view" fallback="/dashboard">
                    <DeliveryList />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/warranty" element={
                <ModuleRoute moduleCode="warranty">
                  <PermissionRoute permissionCode="warranty.view" fallback="/dashboard">
                    <WarrantyList />
                  </PermissionRoute>
                </ModuleRoute>
              } />

              {/* Zalo Integration */}
              <Route path="/zalo/inbox" element={
                <ModuleRoute moduleCode="zalo">
                  <PermissionRoute permissionCode="zalo.view" fallback="/dashboard">
                    <ZaloInboxPage />
                  </PermissionRoute>
                </ModuleRoute>
              } />

              <Route path="/settings/zalo" element={
                <ModuleRoute moduleCode="zalo">
                  <PermissionRoute permissionCode="zalo.config" fallback="/dashboard">
                    <ZaloConfigPage />
                  </PermissionRoute>
                </ModuleRoute>
              } />
              <Route path="/settings/zalo-templates" element={
                <ModuleRoute moduleCode="zalo">
                  <PermissionRoute permissionCode={['zalo.config', 'zalo.manage_templates']} fallback="/dashboard">
                    <ZaloTemplatePage />
                  </PermissionRoute>
                </ModuleRoute>
              } />

              {/* Facebook Multi-Page Integration */}
              <Route path="/facebook/inbox" element={
                <ModuleRoute moduleCode="facebook">
                  <PermissionRoute permissionCode="facebook.view_inbox" fallback="/dashboard">
                    <FacebookInboxPage />
                  </PermissionRoute>
                </ModuleRoute>
              } />

              <Route path="/settings/facebook" element={
                <ModuleRoute moduleCode="facebook">
                  <PermissionRoute permissionCode="facebook.manage_config" fallback="/dashboard">
                    <FacebookConfigPage />
                  </PermissionRoute>
                </ModuleRoute>
              } />

              <Route
                path="/settings/website"
                element={
                  <PermissionRoute permissionCode="website_integration.manage" fallback="/dashboard">
                    <WebsiteIntegration />
                  </PermissionRoute>
                }
              />
              <Route
                path="/settings/ai-agents"
                element={
                  <ModuleRoute moduleCode="ai_agent">
                    <PermissionRoute permissionCode={['ai_agent.view_dashboard', 'ai_agent.manage_agents', 'ai_agent.manage_keys', 'ai_agent.manage_knowledge']} fallback="/dashboard">
                      <AiAgentSettings />
                    </PermissionRoute>
                  </ModuleRoute>
                }
              />
              <Route
                path="/settings/ai-knowledge"
                element={
                  <ModuleRoute moduleCode="ai_agent">
                    <PermissionRoute permissionCode="ai_agent.manage_knowledge" fallback="/dashboard">
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
                path="/admin/quotation-templates"
                element={
                  <SuperAdminRoute>
                    <QuotationTemplateManagement />
                  </SuperAdminRoute>
                }
              />
              <Route
                path="/admin/quotation-templates/:id/builder"
                element={
                  <SuperAdminRoute>
                    <QuotationBuilder />
                  </SuperAdminRoute>
                }
              />
            </Route>

            {/* ── Fallback ────────────────────────────────────────── */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
