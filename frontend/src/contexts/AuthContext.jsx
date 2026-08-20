import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import api from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true) // kiểm tra token lúc khởi động
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const navigate = useNavigate()

  const fetchPublicSettings = useCallback(() => {
    api
      .get('users/public-settings/')
      .then(({ data }) => {
        if (data && typeof data.maintenance_mode === 'boolean') {
          setMaintenanceMode(data.maintenance_mode)
        }
      })
      .catch(() => {})
  }, [])

  // ── Khi khởi động app: tải lại thông tin user từ token đã lưu ─────
  useEffect(() => {
    fetchPublicSettings()
    const token = localStorage.getItem('accessToken')
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get('users/me/')
      .then(({ data }) => setUser(data))
      .catch(() => {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [fetchPublicSettings])

  // ── Đăng nhập ──────────────────────────────────────────────────────
  const login = useCallback(async (workspace_id, username, password) => {
    const { data } = await api.post('users/login/', {
      workspace_id,
      username,
      password,
    })
    localStorage.setItem('accessToken', data.access)
    localStorage.setItem('refreshToken', data.refresh)
    setUser(data.user)
    fetchPublicSettings()
    return data.user
  }, [fetchPublicSettings])

  // ── Đăng xuất ──────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    setUser(null)
    navigate('/login')
  }, [navigate])

  const activeModules = useMemo(() => user?.active_modules || [], [user])
  const isModuleActive = useCallback(
    (moduleCode) => {
      if (user?.is_superuser && !user?.company_id) return true
      return activeModules.includes(moduleCode)
    },
    [activeModules, user]
  )

  // ── Kiểm tra quyền ─────────────────────────────────────────────────
  const hasPermission = useCallback(
    (permissionCode) => {
      if (!user) return false
      
      const firstCode = Array.isArray(permissionCode) ? permissionCode[0] : permissionCode
      const moduleCode = firstCode.split('.')[0]
      const coreModules = ['dashboard', 'settings', 'reports']
      
      // Nếu không phải module cốt lõi, bắt buộc module đó phải đang được kích hoạt
      if (!coreModules.includes(moduleCode) && !isModuleActive(moduleCode)) {
        return false
      }

      if (user.is_superuser || user.is_company_admin) return true
      if (Array.isArray(permissionCode)) {
        return permissionCode.some(code => (user.permissions || []).includes(code))
      }
      return (user.permissions || []).includes(permissionCode)
    },
    [user, isModuleActive],
  )

  const isSuperAdmin = user?.is_superuser === true
  const isCompanyAdmin = user?.is_company_admin === true || user?.is_superuser === true
  const isAuthenticated = !!user

  const pipelineStatusLabels = useMemo(() => {
    const defaults = {
      new: 'Mới (Lead)',
      potential: 'Tiềm năng',
      active: 'Đang giao dịch',
      has_order: 'Đã có đơn hàng',
      repeat_order: 'Mua thêm đơn hàng',
      lost: 'Đã mất',
    }
    return { ...defaults, ...(user?.pipeline_status_labels || {}) }
  }, [user])

  const getPipelineLabel = useCallback(
    (statusKey) => pipelineStatusLabels[statusKey] || statusKey,
    [pipelineStatusLabels]
  )

  // ── Kiểm tra chế độ bảo trì trước khi mở form/nhập liệu ─────────────
  const checkMaintenance = useCallback(() => {
    if (maintenanceMode && !user?.is_superuser) {
      message.warning('⚠️ Hệ thống đang trong chế độ bảo trì dữ liệu. Các chức năng thêm, sửa, xóa dữ liệu tạm thời bị khóa!')
      return true // Bị chặn
    }
    return false // Không bị chặn
  }, [maintenanceMode, user])

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated,
      isSuperAdmin,
      isCompanyAdmin,
      maintenanceMode,
      checkMaintenance,
      login,
      logout,
      hasPermission,
      refreshUser: async () => {
        const { data } = await api.get('users/me/')
        setUser(data)
      },
      patchCompanySettings: async (payload) => {
        const { data } = await api.patch('users/company-settings/', payload)
        const { data: userData } = await api.get('users/me/')
        setUser(userData)
        return data
      },
      refreshSettings: fetchPublicSettings,
      activeModules,
      isModuleActive,
      pipelineStatusLabels,
      getPipelineLabel,
    }),
    [user, loading, isAuthenticated, isSuperAdmin, isCompanyAdmin, maintenanceMode, checkMaintenance, login, logout, hasPermission, fetchPublicSettings, activeModules, isModuleActive, pipelineStatusLabels, getPipelineLabel],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải được dùng bên trong AuthProvider')
  return ctx
}
