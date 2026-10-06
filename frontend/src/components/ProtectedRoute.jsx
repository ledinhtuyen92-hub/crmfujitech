import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * SmartRedirect — Tự động tính toán module đầu tiên user có quyền
 * và redirect đến đó thay vì fix cứng về /dashboard.
 */
export function SmartRedirect() {
  const { isSuperAdmin, hasPermission, isModuleActive } = useAuth()
  
  if (isSuperAdmin) return <Navigate to="/admin/dashboard" replace />

  if (hasPermission('dashboard.view')) return <Navigate to="/dashboard" replace />
  if (hasPermission('notifications.view_announcements')) return <Navigate to="/announcements" replace />
  if (isModuleActive('approvals') && hasPermission(['approvals.approve', 'approvals.delete'])) return <Navigate to="/approvals" replace />
  if (isModuleActive('crm') && hasPermission('crm.view')) return <Navigate to="/customers" replace />
  if (isModuleActive('products') && hasPermission('products.view')) return <Navigate to="/products" replace />
  if (isModuleActive('sales') && hasPermission('sales.view')) return <Navigate to="/quotations" replace />
  if (isModuleActive('orders') && hasPermission('orders.view')) return <Navigate to="/orders" replace />
  if (isModuleActive('inventory') && hasPermission('inventory.view')) return <Navigate to="/inventory" replace />
  if (isModuleActive('production') && hasPermission('production.view')) return <Navigate to="/production" replace />
  if (isModuleActive('delivery') && hasPermission('delivery.view')) return <Navigate to="/delivery" replace />
  if (isModuleActive('warranty') && hasPermission('warranty.view')) return <Navigate to="/warranty" replace />
  if (isModuleActive('zalo') && hasPermission('zalo.view')) return <Navigate to="/zalo/inbox" replace />
  if (isModuleActive('facebook') && hasPermission('facebook.view_inbox')) return <Navigate to="/facebook/inbox" replace />
  
  // Trọng tài cuối cùng: nếu user có quyền config settings thì về trang setting general
  if (hasPermission('settings.manage_general')) return <Navigate to="/settings/general" replace />

  // Nếu không có quyền nào cả (trường hợp role trống), về tạm login
  return <Navigate to="/login" replace />
}

/**
 * ProtectedRoute — Bảo vệ routes yêu cầu đăng nhập.
 * Nếu chưa đăng nhập: redirect về /login.
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, isSuperAdmin, loading } = useAuth()
  const location = useLocation()

  // ApplicationLayout đã chặn loading ở cấp cao hơn, nhưng giữ lại để an toàn
  if (loading) return null

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (isSuperAdmin && !location.pathname.startsWith('/admin')) {
    return <Navigate to="/admin/dashboard" replace />
  }

  return children
}

/**
 * ModuleRoute — Bảo vệ các route thuộc về một module cụ thể.
 * Nếu module bị tắt, redirect về /dashboard.
 */
export function ModuleRoute({ children, moduleCode }) {
  const { isAuthenticated, isModuleActive } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!isModuleActive(moduleCode)) {
    return <SmartRedirect />
  }

  return children
}

/**
 * SuperAdminRoute — Chỉ cho phép System Administrator (is_superuser=true).
 * Các tài khoản khác sẽ bị redirect về /dashboard.
 */
export function SuperAdminRoute({ children }) {
  const { isAuthenticated, isSuperAdmin } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!isSuperAdmin) {
    return <SmartRedirect />
  }

  return children
}

/**
 * CompanyAdminRoute — Cho phép Company Admin hoặc System Admin truy cập
 * các trang quản lý công ty (settings/users, settings/roles, ...).
 * Nhân viên thường sẽ bị redirect về /dashboard.
 */
export function CompanyAdminRoute({ children }) {
  const { isAuthenticated, isCompanyAdmin, isSuperAdmin } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (isSuperAdmin && !location.pathname.startsWith('/admin')) {
    return <Navigate to="/admin/dashboard" replace />
  }

  if (!isCompanyAdmin) {
    return <SmartRedirect />
  }

  return children
}

/**
 * Hook kiểm tra permission dùng được bất kỳ đâu trong component tree.
 * @param {string} permissionCode - vd: 'crm.view', 'sales.create'
 * @returns {boolean}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function usePermission(permissionCode) {
  const { hasPermission } = useAuth()
  return hasPermission(permissionCode)
}

/**
 * PermissionRoute — Chỉ cho phép nếu user có quyền tương ứng.
 * fallback mặc định là /dashboard.
 * Lưu ý: dashboard.view phải có trong role để tránh loop ở đây.
 */
export function PermissionRoute({ permissionCode, fallback, children }) {
  const { isAuthenticated, hasPermission } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!hasPermission(permissionCode)) {
    return fallback ? <Navigate to={fallback} replace /> : <SmartRedirect />
  }

  return children
}
