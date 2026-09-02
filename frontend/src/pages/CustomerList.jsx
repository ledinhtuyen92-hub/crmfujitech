import { useEffect, useState, useCallback } from 'react'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  message,
  Upload,
  Switch,
  Dropdown,
  List,
  Popover,
} from 'antd'
import {
  HistoryOutlined,
  PhoneOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
  UserSwitchOutlined,
  TagsOutlined,
  ExportOutlined,
  ImportOutlined,
  UploadOutlined,
  EditOutlined,
  DeleteOutlined,
  PaperClipOutlined,
  FileAddOutlined,
  FileTextOutlined,
  FileDoneOutlined,
  MessageOutlined,
  SettingOutlined,
  MoreOutlined,
  MailOutlined,
  FireFilled,
  StarFilled,
  InfoCircleFilled,
  MinusCircleFilled,
  FacebookFilled,
  TableOutlined,
  WechatFilled,
  TeamOutlined as ReferralIcon,
  ShopOutlined,
  GlobalOutlined,
  FormOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { useResponsive } from '../hooks/useResponsive'
import dayjs from 'dayjs'

import TagManagementModal from '../components/TagManagementModal'
import ZnsSendModal from '../components/ZnsSendModal'

const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { TextArea } = Input

const STATUS_MAP = {
  new: { label: 'Khách mới', color: 'blue' },
  potential: { label: 'Tìm hiểu nhu cầu', color: 'cyan' },
  active: { label: 'Sắp chốt', color: 'green' },
  lost: { label: 'Không còn nhu cầu', color: 'red' },
  has_order: { label: 'Đã có đơn hàng', color: 'purple' },
  repeat_order: { label: 'Mua thêm đơn hàng', color: 'magenta' },
}

const PRIORITY_MAP = {
  p1: { label: 'Ưu tiên 1 (Rất cao)', color: 'red', icon: <FireFilled style={{ color: '#ef4444' }} /> },
  p2: { label: 'Ưu tiên 2 (Cao)', color: 'volcano', icon: <StarFilled style={{ color: '#f97316' }} /> },
  p3: { label: 'Ưu tiên 3 (TB)', color: 'orange', icon: <InfoCircleFilled style={{ color: '#3b82f6' }} /> },
  p4: { label: 'Ưu tiên 4 (Thấp)', color: 'default', icon: <MinusCircleFilled style={{ color: '#9ca3af' }} /> },
}

const SOURCE_MAP = {
  facebook: 'Facebook',
  zalo: 'Zalo',
  referral: 'Giới thiệu',
  walk_in: 'Khách tự đến',
  website: 'Website',
  other: 'Khác',
}

const SOURCE_ICON = {
  facebook: <FacebookFilled style={{ color: '#1877f2' }} />,
  zalo: <WechatFilled style={{ color: '#0068ff' }} />,
  referral: <ReferralIcon style={{ color: '#10b981' }} />,
  walk_in: <ShopOutlined style={{ color: '#8b5cf6' }} />,
  website: <GlobalOutlined style={{ color: '#06b6d4' }} />,
  other: <FormOutlined style={{ color: '#6b7280' }} />,
}

const INTERACTION_TYPES = {
  call: { label: 'Cuộc gọi', color: 'blue' },
  meeting: { label: 'Gặp mặt', color: 'purple' },
  email: { label: 'Email', color: 'cyan' },
  zalo: { label: 'Zalo / Chat', color: 'green' },
  quotation: { label: 'Báo giá', color: 'orange' },
  care: { label: 'Chăm sóc định kỳ', color: 'magenta' },
}

const INTERACTION_RESULTS = {
  interested: { label: 'Quan tâm', color: 'success' },
  not_interested: { label: 'Không quan tâm', color: 'error' },
  need_follow_up: { label: 'Cần theo dõi thêm', color: 'warning' },
  closed: { label: 'Đã chốt', color: 'processing' },
}

function CustomerList() {
  const { isCompanyAdmin, hasPermission, checkMaintenance, isModuleActive, pipelineStatusLabels = {}, getPipelineLabel, refreshSettings } = useAuth()
  const { isMobile } = useResponsive()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [salesUsers, setSalesUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const getStatusItem = useCallback((key) => {
    const base = STATUS_MAP[key] || { label: key, color: 'gray' }
    return {
      ...base,
      label: getPipelineLabel ? getPipelineLabel(key, base.label) : (pipelineStatusLabels[key] || base.label)
    }
  }, [getPipelineLabel, pipelineStatusLabels])

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isInactiveFilter, setIsInactiveFilter] = useState(false)
  const [assignedToFilter, setAssignedToFilter] = useState('')
  const [isNewUnattendedFilter, setIsNewUnattendedFilter] = useState(false)
  const [tableSort, setTableSort] = useState(null)

  // Column Visibility
  const DEFAULT_COLUMNS = ['name', 'contact', 'source', 'address', 'status', 'priority_level', 'expected_quantity', 'tags', 'assigned_to', 'actions']
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('customerListVisibleColumns')
    return saved ? JSON.parse(saved) : DEFAULT_COLUMNS
  })

  useEffect(() => {
    localStorage.setItem('customerListVisibleColumns', JSON.stringify(visibleColumns))
  }, [visibleColumns])

  // Auto Assign Toggle State
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false)
  const [togglingAutoAssign, setTogglingAutoAssign] = useState(false)

  // Modal Add / Edit Customer
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  // Modal Assign
  const [assignModalVisible, setAssignModalVisible] = useState(false)
  const [assignTargetCustomer, setAssignTargetCustomer] = useState(null)
  const [selectedSaleId, setSelectedSaleId] = useState(null)
  const [assigning, setAssigning] = useState(false)

  // Drawer Details & Timeline
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [currentCustomer, setCurrentCustomer] = useState(null)
  const [contacts, setContacts] = useState([])
  const [interactions, setInteractions] = useState([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [znsModalVisible, setZnsModalVisible] = useState(false)
  const [bulkZnsModalVisible, setBulkZnsModalVisible] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])

  // Modal Add Interaction
  const [interactionModalVisible, setInteractionModalVisible] = useState(false)
  const [interactionForm] = Form.useForm()
  const [submittingInteraction, setSubmittingInteraction] = useState(false)
  const [interactionFiles, setInteractionFiles] = useState([])

  // Modal Add Contact
  const [contactModalVisible, setContactModalVisible] = useState(false)
  const [contactForm] = Form.useForm()
  const [submittingContact, setSubmittingContact] = useState(false)

  // Tags Management
  const [tagModalVisible, setTagModalVisible] = useState(false)

  // Pipeline status customization modal
  const [pipelineModalVisible, setPipelineModalVisible] = useState(false)
  const [pipelineForm] = Form.useForm()
  const [savingPipeline, setSavingPipeline] = useState(false)

  const handleSavePipelineLabels = async (values) => {
    if (checkMaintenance()) return
    setSavingPipeline(true)
    try {
      await api.patch('users/company-settings/', { pipeline_status_labels: values })
      message.success('Cập nhật tên Trạng thái Pipeline thành công!')
      setPipelineModalVisible(false)
      if (refreshSettings) await refreshSettings()
      fetchCustomers()
    } catch {
      message.error('Lỗi khi cập nhật tên Trạng thái Pipeline.')
    } finally {
      setSavingPipeline(false)
    }
  }

  // Import
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting] = useState(false)

  // Tags
  const [allTags, setAllTags] = useState([])
  const [globalHasExpectedQuantity, setGlobalHasExpectedQuantity] = useState(false)

  const fetchCustomers = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (searchQuery) params.search = searchQuery
      if (statusFilter) params.status = statusFilter
      if (isInactiveFilter) params.is_inactive = true
      if (assignedToFilter) params.assigned_to = assignedToFilter
      if (isNewUnattendedFilter) {
          params.status = 'new'
      }
      if (tableSort && tableSort.field) {
          let field = tableSort.field
          if (field === 'name') field = 'created_at'
          params.ordering = tableSort.order === 'ascend' ? field : `-${field}`
      }

      const response = await api.get('/crm/customers/', { params })
      let data = Array.isArray(response.data)
        ? response.data
        : response.data?.results ?? []
      
      if (!Array.isArray(response.data)) {
        setGlobalHasExpectedQuantity(!!response.data?.has_expected_quantity)
      }
      
      if (isNewUnattendedFilter) {
          data = data.filter(c => c.interaction_count === 0)
      }
      setCustomers(data)
    } catch {
      setError('Không thể tải danh sách khách hàng. Vui lòng thử lại sau.')
    } finally {
      setLoading(false)
    }
  }, [searchQuery, statusFilter, isInactiveFilter, assignedToFilter, isNewUnattendedFilter, tableSort])

  const fetchSalesUsers = useCallback(async () => {
    if (!isCompanyAdmin && !hasPermission('crm.assign')) return
    await Promise.resolve()
    try {
      const res = await api.get('/users/users/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setSalesUsers(data.filter((u) => u.is_active))
    } catch {
      // ignore
    }
  }, [isCompanyAdmin, hasPermission])

  const fetchAllTags = useCallback(async () => {
    try {
      const res = await api.get('/crm/tags/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setAllTags(data)
    } catch {
      // ignore
    }
  }, [])

  const fetchCompanySettings = useCallback(async () => {
    if (!isCompanyAdmin) return
    try {
      const res = await api.get('/users/company-settings/')
      if (res.data && res.data.lead_routing === 'round_robin') {
        setAutoAssignEnabled(true)
      } else {
        setAutoAssignEnabled(false)
      }
    } catch {
      // ignore
    }
  }, [isCompanyAdmin])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  useEffect(() => {
    fetchSalesUsers()
    fetchAllTags()
    fetchCompanySettings()
  }, [fetchSalesUsers, fetchAllTags, fetchCompanySettings])

  // ── Handlers: Add / Edit Customer ──────────────────────────────────
  const handleOpenAddModal = () => {
    if (checkMaintenance()) return
    setEditingCustomer(null)
    form.resetFields()
    form.setFieldsValue({ status: 'new', source: 'other' })
    setIsModalVisible(true)
  }

  const handleOpenEditModal = (record, e) => {
    e?.stopPropagation()
    if (checkMaintenance()) return
    setEditingCustomer(record)
    form.setFieldsValue({
      name: record.name,
      company_name: record.company_name || '',
      tax_code: record.tax_code || '',
      phone: record.phone,
      email: record.email,
      address: record.address,
      city: record.city,
      source: record.source || 'other',
      status: record.status || 'new',
      notes: record.notes,
      tag_ids: record.tags?.map(t => t.id) || [],
      birthday: record.birthday ? dayjs(record.birthday) : null,
      priority_level: record.priority_level || 'p4',
      expected_quantity: record.expected_quantity,
    })
    setIsModalVisible(true)
  }

  const handleCreateQuotationFromCustomer = (record, e) => {
    e?.stopPropagation()
    navigate('/quotations', { state: { createForCustomer: record.id } })
  }

  const handleViewQuotations = (record, e) => {
    e?.stopPropagation()
    // Truyền số điện thoại hoặc tên khách hàng qua query URL để tìm kiếm
    navigate(`/quotations?search=${encodeURIComponent(record.phone || record.name)}`)
  }

  const handleViewOrders = (record, e) => {
    e?.stopPropagation()
    navigate(`/orders?search=${encodeURIComponent(record.phone || record.name)}`)
  }

  const handleSaveCustomer = async (values) => {
    setSubmitting(true)
    try {
      const payload = {
        ...values,
        birthday: values.birthday ? values.birthday.format('YYYY-MM-DD') : null,
        expected_quantity: values.expected_quantity ? parseInt(values.expected_quantity) : null,
      }
      if (editingCustomer) {
        await api.patch(`/crm/customers/${editingCustomer.id}/`, payload)
        message.success('Cập nhật khách hàng thành công!')
      } else {
        await api.post('/crm/customers/', payload)
        message.success('Thêm khách hàng thành công!')
      }
      setIsModalVisible(false)
      fetchCustomers()
    } catch (err) {
      const msg = err.response?.data?.phone?.[0] || err.response?.data?.detail || 'Có lỗi xảy ra, vui lòng kiểm tra lại.'
      message.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteCustomer = async (id, e) => {
    e?.stopPropagation()
    if (checkMaintenance()) return
    try {
      await api.delete(`/crm/customers/${id}/`)
      message.success('Đã xóa khách hàng.')
      fetchCustomers()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Không thể xóa khách hàng này.')
    }
  }

  // ── Handlers: Assign Sale ──────────────────────────────────────────
  const handleOpenAssignModal = (record, e) => {
    e?.stopPropagation()
    if (checkMaintenance()) return
    setAssignTargetCustomer(record)
    setSelectedSaleId(record.assigned_to ? record.assigned_to.id : null)
    setAssignModalVisible(true)
  }

  const handleConfirmAssign = async () => {
    if (!selectedSaleId) {
      message.warning('Vui lòng chọn nhân viên Sale.')
      return
    }
    setAssigning(true)
    try {
      await api.post(`/crm/customers/${assignTargetCustomer.id}/assign/`, {
        assigned_to: selectedSaleId,
      })
      message.success('Phân công khách hàng thành công!')
      setAssignModalVisible(false)
      fetchCustomers()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Phân công thất bại.')
    } finally {
      setAssigning(false)
    }
  }

  const handleExportCsv = async () => {
    try {
      const params = {}
      if (selectedRowKeys && selectedRowKeys.length > 0) {
        params.ids = selectedRowKeys.join(',')
      }
      const response = await api.get('/crm/customers/export-csv/', {
        params,
        responseType: 'blob', // Quan trọng để lấy file
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'customers.xlsx')
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
    } catch {
      message.error('Có lỗi xảy ra khi xuất file CSV.')
    }
  }

  const handleImportCsv = async () => {
    if (!importFile) {
      message.warning('Vui lòng chọn file CSV để nhập.')
      return
    }
    setImporting(true)
    const formData = new FormData()
    formData.append('file', importFile)

    try {
      const res = await api.postForm('/crm/customers/import-csv/', formData)
      message.success(res.data.detail || 'Nhập dữ liệu thành công!')
      setImportModalVisible(false)
      setImportFile(null)
      fetchCustomers()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Có lỗi xảy ra khi nhập file CSV.')
    } finally {
      setImporting(false)
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/crm/customers/export-template/', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'mau_nhap_khach_hang.xlsx')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch {
      message.error('Có lỗi xảy ra khi tải file mẫu.')
    }
  }

  const handleRoundRobinAssign = () => {
    if (checkMaintenance()) return
    Modal.confirm({
      title: 'Xác nhận phân bổ khách hàng tự động?',
      content: 'Hệ thống sẽ tự động chia đều toàn bộ Khách hàng & Leads chưa có người phụ trách cho các nhân viên Sale đang đủ điều kiện (Round-robin). Bạn có chắc chắn muốn thực hiện?',
      okText: 'Đồng ý phân bổ',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          const res = await api.post('/crm/customers/round-robin-assign/')
          message.success(res.data.detail || 'Đã phân bổ tự động.')
          fetchCustomers()
        } catch (err) {
          message.error(err.response?.data?.detail || 'Không thể thực hiện Round-robin.')
        }
      },
    })
  }

  const handleToggleAutoAssign = async (checked) => {
    setTogglingAutoAssign(true)
    try {
      await api.patch('/users/company-settings/', {
        lead_routing: checked ? 'round_robin' : 'manual',
      })
      setAutoAssignEnabled(checked)
      message.success(
        checked
          ? 'Đã BẬT chế độ tự động chia khách hàng mới.'
          : 'Đã TẮT chế độ tự động chia khách hàng.'
      )
    } catch {
      message.error('Không thể cập nhật cấu hình tự động phân bổ.')
    } finally {
      setTogglingAutoAssign(false)
    }
  }

  // ── Handlers: Drawer Details & Timeline ────────────────────────────
  const handleOpenDrawer = async (record) => {
    setCurrentCustomer(record)
    setDrawerVisible(true)
    setLoadingDetails(true)
    try {
      const [contactRes, interactRes] = await Promise.all([
        api.get('/crm/contacts/', { params: { customer_id: record.id } }),
        api.get('/crm/interactions/', { params: { customer_id: record.id } }),
      ])
      
      setContacts(Array.isArray(contactRes.data) ? contactRes.data : contactRes.data?.results ?? [])
      
      let allInteractions = Array.isArray(interactRes.data) ? interactRes.data : interactRes.data?.results ?? []

      // Lấy lịch sử gửi ZNS
      try {
        const znsRes = await api.get(`/zalo/logs/?customer_id=${record.id}`)
        const znsLogs = (Array.isArray(znsRes.data) ? znsRes.data : znsRes.data?.results ?? []).map(log => ({
          ...log,
          isZnsLog: true,
          type: 'zalo',
          notes: `[ZNS: ${log.template?.name || 'Thông báo'}] Trạng thái: ${log.status === 'sent' ? 'Thành công' : log.status === 'pending' ? 'Đang gửi' : 'Thất bại'}`,
          created_at: log.sent_at,
          created_by: null // Hệ thống tự động
        }))
        allInteractions = [...allInteractions, ...znsLogs]
        // Sắp xếp lại theo thời gian mới nhất
        allInteractions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      } catch (err) {
        // Module zalo có thể bị disable
      }

      setInteractions(allInteractions)
    } catch {
      message.error('Không thể tải chi tiết khách hàng.')
    } finally {
      setLoadingDetails(false)
    }
  }

  const handleAddInteraction = async (values) => {
    setSubmittingInteraction(true)
    try {
      const resInteraction = await api.post('/crm/interactions/', {
        ...values,
        customer: currentCustomer.id,
      })
      
      const interactionId = resInteraction.data.id;
      
      if (interactionFiles && interactionFiles.length > 0) {
        const formData = new FormData();
        interactionFiles.forEach(file => {
          formData.append('files', file.originFileObj || file);
        });
        
        await api.postForm(`/crm/interactions/${interactionId}/upload-files/`, formData);
      }
      
      message.success('Đã ghi nhận lịch sử chăm sóc!')
      setInteractionModalVisible(false)
      interactionForm.resetFields()
      setInteractionFiles([])
      // reload interactions
      const res = await api.get('/crm/interactions/', { params: { customer_id: currentCustomer.id } })
      setInteractions(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {
      message.error('Có lỗi khi lưu lịch sử chăm sóc.')
    } finally {
      setSubmittingInteraction(false)
    }
  }

  const handleAddContact = async (values) => {
    setSubmittingContact(true)
    try {
      await api.post('/crm/contacts/', {
        ...values,
        customer: currentCustomer.id,
      })
      message.success('Đã thêm đầu mối liên hệ!')
      setContactModalVisible(false)
      contactForm.resetFields()
      // reload contacts
      const res = await api.get('/crm/contacts/', { params: { customer_id: currentCustomer.id } })
      setContacts(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {
      message.error('Có lỗi khi thêm đầu mối liên hệ.')
    } finally {
      setSubmittingContact(false)
    }
  }

  const handleUpdateSalesInfo = async (field, value) => {
    if (!currentCustomer) return
    try {
      const payload = {}
      if (field === 'priority_level') payload.priority_level = value
      else if (field === 'tag_ids') payload.tag_ids = value
      else if (field === 'expected_quantity') payload.expected_quantity = value
      
      const res = await api.patch(`/crm/customers/${currentCustomer.id}/update-sales-info/`, payload)
      setCurrentCustomer(res.data)
      message.success('Cập nhật thông tin thành công!')
      // Update in main list
      setCustomers(prev => prev.map(c => c.id === currentCustomer.id ? res.data : c))
    } catch (err) {
      console.error(err)
      message.error(err.response?.data?.detail || 'Có lỗi khi cập nhật thông tin.')
    }
  }

  // ── Table Columns ──────────────────────────────────────────────────
  const columns = [
    {
      title: 'Khách hàng',
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      render: (text, record) => {
        const isNewUnattended = record.status === 'new' && record.interaction_count === 0;
        return (
          <Space direction="vertical" size={0}>
            <Space>
              <Text
                strong={!isNewUnattended}
                style={{ 
                  color: '#1649c9', 
                  cursor: 'pointer',
                  fontWeight: isNewUnattended ? 800 : 'normal',
                }}
                onClick={() => handleOpenDrawer(record)}
              >
                {text}
              </Text>
              {isNewUnattended && (
                <Tag 
                  color="#ef4444" 
                  style={{ borderRadius: 12, marginInlineStart: 8, border: 'none', fontWeight: 600, padding: '0 8px', fontSize: 11 }}
                  icon={<FireFilled />}
                >
                  MỚI
                </Tag>
              )}
            </Space>
            {record.city && <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{record.city}</Text>}
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {new Date(record.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </Text>
          </Space>
        )
      },
    },
    {
      title: 'Liên hệ',
      key: 'contact',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Space>
            <Text><PhoneOutlined style={{ marginRight: 6, color: '#52c41a' }} />{record.phone}</Text>
            {record.phone && (
              <Button 
                type="primary" 
                size="small" 
                style={{ background: '#0068ff', borderColor: '#0068ff', fontSize: 11, height: 20, padding: '0 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', fontWeight: 600 }}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`https://zalo.me/${record.phone.replace(/\D/g, '')}`, '_blank');
                }}
              >
                Chat Zalo
              </Button>
            )}
          </Space>
          {record.email && <Text type="secondary" style={{ fontSize: 12 }}>{record.email}</Text>}
        </Space>
      ),
    },
    {
      title: 'Nguồn',
      key: 'source',
      render: (_, record) => {
        const sourceLabel = SOURCE_MAP[record.source] || record.source || '—'
        const sourceIcon = SOURCE_ICON[record.source] || '✏️'
        const creator = record.created_by?.full_name || record.created_by?.username
        return (
          <Space direction="vertical" size={0}>
            <Text>
              <span style={{ marginRight: 5 }}>{sourceIcon}</span>
              {sourceLabel}
            </Text>
            <Text type="secondary" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center' }}>
              {creator ? `👤 ${creator}` : <><RobotOutlined style={{ marginRight: 4 }} /> Tự động</>}
            </Text>
          </Space>
        )
      },
    },
    {
      title: 'Địa chỉ',
      key: 'address',
      render: (_, record) => {
        const parts = [record.address, record.city].filter(Boolean)
        return parts.length > 0
          ? <Text style={{ fontSize: 13 }}>{parts.join(', ')}</Text>
          : <Text type="secondary">Chưa có</Text>
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => {
        const item = getStatusItem(status)
        return (
          <Space direction="vertical" size={2}>
            <Tag color={item.color}>{item.label}</Tag>
            {record.is_inactive && (
              <Tag color="error" style={{ marginInlineEnd: 0 }}>Không hoạt động</Tag>
            )}
          </Space>
        )
      },
    },
    {
      title: 'Mức độ ưu tiên',
      dataIndex: 'priority_level',
      key: 'priority_level',
      sorter: true,
      render: (val) => {
        const item = PRIORITY_MAP[val] || PRIORITY_MAP['p4']
        return (
          <Tag color={item.color} style={{ margin: 0 }}>
            {item.icon} {item.label}
          </Tag>
        )
      }
    },
    ...(globalHasExpectedQuantity ? [{
      title: 'Số lượng SP dự kiến',
      dataIndex: 'expected_quantity',
      key: 'expected_quantity',
      sorter: true,
      align: 'center',
      render: (val) => val ? <Text strong>{val} SP</Text> : null
    }] : []),
    ...(allTags.length > 0 ? [{
      title: 'Tags',
      key: 'tags',
      render: (_, record) => (
        <Space size={[0, 4]} wrap style={{ maxWidth: 150 }}>
          {record.tags && record.tags.length > 0 ? (
            record.tags.map((tag) => (
              <Tag color={tag.color} key={tag.id}>
                {tag.name}
              </Tag>
            ))
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>Chưa có</Text>
          )}
        </Space>
      ),
    }] : []),
    {
      title: 'Phụ trách (Sale)',
      key: 'assigned_to',
      render: (_, record) => {
        if (!record.assigned_to) {
          return <Text type="secondary" style={{ fontStyle: 'italic' }}>Chưa có nhân viên phụ trách</Text>
        }
        return (
          <Space size={6}>
            <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#1649c9' }} />
            <Text>{record.assigned_to.full_name || record.assigned_to.username}</Text>
          </Space>
        )
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Tạo báo giá">
            <Button
              size="small"
              icon={<FileAddOutlined />}
              style={{ borderColor: '#4f46e5', color: '#4f46e5' }}
              onClick={(e) => handleCreateQuotationFromCustomer(record, e)}
            />
          </Tooltip>
          {record.quotation_count > 0 && (
            <Tooltip title={`Xem ${record.quotation_count} báo giá`}>
              <Button
                size="small"
                icon={<FileTextOutlined />}
                style={{ color: '#2563eb' }}
                onClick={(e) => handleViewQuotations(record, e)}
              />
            </Tooltip>
          )}
          {record.order_count > 0 && (
            <Tooltip title={`Xem ${record.order_count} đơn hàng`}>
              <Button
                size="small"
                icon={<FileDoneOutlined />}
                style={{ color: '#16a34a' }}
                onClick={(e) => handleViewOrders(record, e)}
              />
            </Tooltip>
          )}
          {(hasPermission('crm.assign')) && (
            <Tooltip title="Phân công Sale">
              <Button
                size="small"
                icon={<UserSwitchOutlined />}
                onClick={(e) => handleOpenAssignModal(record, e)}
              />
            </Tooltip>
          )}
          {(hasPermission('crm.edit')) && (
            <Button size="small" onClick={(e) => handleOpenEditModal(record, e)}>
              Sửa
            </Button>
          )}
          {(hasPermission('crm.delete')) && (
            <Popconfirm
              title="Xóa khách hàng này?"
              onConfirm={(e) => handleDeleteCustomer(record.id, e)}
              onCancel={(e) => e?.stopPropagation()}
              okText="Xóa"
              cancelText="Hủy"
            >
              <Button size="small" danger onClick={(e) => e?.stopPropagation()}>
                Xóa
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  const moreActionItems = [
    (isCompanyAdmin) && {
      key: 'pipeline',
      icon: <SettingOutlined />,
      label: 'Tùy chỉnh Trạng thái Pipeline',
      onClick: () => { if (!checkMaintenance()) setPipelineModalVisible(true) }
    },
    (hasPermission('crm.manage_tags')) && {
      key: 'tags',
      icon: <TagsOutlined />,
      label: 'Quản lý Tags',
      onClick: () => { if (!checkMaintenance()) setTagModalVisible(true) }
    },
    { type: 'divider' },
    (hasPermission('crm.import')) && {
      key: 'import',
      icon: <ImportOutlined />,
      label: 'Nhập Excel',
      onClick: () => { if (!checkMaintenance()) setImportModalVisible(true) }
    },
    (hasPermission('crm.export')) && {
      key: 'export',
      icon: <ExportOutlined />,
      label: 'Xuất Excel',
      onClick: handleExportCsv
    },
    { type: 'divider' },
    (hasPermission('crm.auto_assign')) && {
      key: 'auto_assign',
      icon: <ReloadOutlined />,
      label: 'Phân bổ khách tự động',
      onClick: handleRoundRobinAssign
    }
  ].filter(Boolean);

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div style={{ flexShrink: 0 }}>
          <Title level={2} style={{ margin: 0, whiteSpace: 'nowrap' }}>
            <TeamOutlined style={{ marginRight: 10, color: '#1649c9' }} />
            Quản lý Khách hàng
          </Title>
          <Text type="secondary">Theo dõi và quản lý khách hàng</Text>
        </div>

        <Space wrap style={{ flex: 1, justifyContent: 'flex-end' }}>
          {isCompanyAdmin && (
            <Tooltip title="Khi BẬT, hệ thống tự động chia đều khách hàng mới cho Sale có ít khách nhất">
              <Space style={{ background: '#eff6ff', padding: '4px 12px', borderRadius: 8, border: '1px solid #bfdbfe', marginRight: 4 }}>
                <Text strong style={{ fontSize: 13, color: '#1e40af' }}>Tự động chia khách:</Text>
                <Switch
                  checked={autoAssignEnabled}
                  loading={togglingAutoAssign}
                  onChange={handleToggleAutoAssign}
                  checkedChildren="BẬT"
                  unCheckedChildren="TẮT"
                />
              </Space>
            </Tooltip>
          )}

          {(isModuleActive('zalo') && (isCompanyAdmin || hasPermission('zalo.send_zns'))) && (
            <Button 
              type="primary" 
              style={{ background: '#10b981', borderColor: '#10b981' }}
              icon={<MessageOutlined />}
              disabled={selectedRowKeys.length === 0}
              onClick={() => { if (!checkMaintenance()) setBulkZnsModalVisible(true) }}
            >
              Gửi ZNS {selectedRowKeys.length > 0 ? `(${selectedRowKeys.length})` : ''}
            </Button>
          )}

          {moreActionItems.length > 0 && (
            <Dropdown menu={{ items: moreActionItems }} trigger={['click']}>
              <Button icon={<MoreOutlined />}>Tác vụ khác</Button>
            </Dropdown>
          )}

          {(hasPermission('crm.create')) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenAddModal}
              style={{ backgroundColor: '#1649c9' }}
            >
              Thêm khách hàng
            </Button>
          )}
        </Space>
      </div>

      {error && (
        <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />
      )}

      {/* Filter Bar */}
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: 16 }}>
        <Row gutter={16} align="middle">
          <Col xs={24} sm={12} md={(hasPermission('crm.assign') || hasPermission('crm.auto_assign') || hasPermission('crm.view_all')) ? 5 : 7} style={{ marginBottom: 8 }}>
            <Input
              placeholder="Tìm theo tên hoặc SĐT..."
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={(hasPermission('crm.assign') || hasPermission('crm.auto_assign') || hasPermission('crm.view_all')) ? 4 : 5} style={{ marginBottom: 8 }}>
            <Select
              placeholder="Lọc theo trạng thái"
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              allowClear
            >
              <Option value="">Tất cả trạng thái</Option>
              {Object.entries(STATUS_MAP).map(([key, item]) => {
                const sItem = getStatusItem(key)
                return (
                  <Option key={key} value={key}>
                    <Badge color={sItem.color} text={sItem.label} />
                  </Option>
                )
              })}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4} style={{ marginBottom: 8, display: 'flex', alignItems: 'center' }}>
            <Checkbox 
              checked={isInactiveFilter} 
              onChange={(e) => setIsInactiveFilter(e.target.checked)}
            >
              <Tag color="error" style={{ margin: 0 }}>Không hoạt động</Tag>
            </Checkbox>
          </Col>
          {(hasPermission('crm.assign') || hasPermission('crm.auto_assign') || hasPermission('crm.view_all')) && (
            <Col xs={24} sm={12} md={5} style={{ marginBottom: 8 }}>
              <Select
                placeholder="Lọc theo Sale phụ trách"
                style={{ width: '100%' }}
                value={assignedToFilter}
                onChange={(val) => setAssignedToFilter(val)}
                allowClear
                showSearch
                optionFilterProp="children"
              >
                <Option value="">Tất cả nhân viên</Option>
                {salesUsers.map((u) => (
                  <Option key={u.id} value={u.id}>
                    {u.full_name || u.username}
                  </Option>
                ))}
              </Select>
            </Col>
          )}
          <Col xs={24} sm={12} md={(hasPermission('crm.assign') || hasPermission('crm.auto_assign') || hasPermission('crm.view_all')) ? 6 : 8} style={{ textAlign: isMobile ? 'left' : 'right', marginBottom: 8 }}>
            <Space wrap>
              <Button 
                type={isNewUnattendedFilter ? "primary" : "default"}
                danger={isNewUnattendedFilter}
                icon={<TeamOutlined />} 
                onClick={() => setIsNewUnattendedFilter(!isNewUnattendedFilter)}
              >
                Khách mới chưa chăm
              </Button>
              <Button onClick={fetchCustomers} icon={<ReloadOutlined />}>
                Làm mới
              </Button>
              <Popover 
                placement="bottomRight" 
                title="Tùy chỉnh cột hiển thị" 
                content={
                  <Checkbox.Group 
                    options={[
                      { label: 'Khách hàng', value: 'name' },
                      { label: 'Liên hệ', value: 'contact' },
                      { label: 'Nguồn', value: 'source' },
                      { label: 'Địa chỉ', value: 'address' },
                      { label: 'Trạng thái', value: 'status' },
                      { label: 'Mức độ ưu tiên', value: 'priority_level' },
                      ...(globalHasExpectedQuantity ? [{ label: 'Số lượng SP dự kiến', value: 'expected_quantity' }] : []),
                      ...(allTags.length > 0 ? [{ label: 'Tags', value: 'tags' }] : []),
                      { label: 'Phụ trách (Sale)', value: 'assigned_to' },
                      { label: 'Thao tác', value: 'actions' },
                    ]}
                    value={visibleColumns}
                    onChange={setVisibleColumns}
                    style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                  />
                }
                trigger="click"
              >
                <Button icon={<TableOutlined />} />
              </Popover>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Main Table */}
      {isMobile ? (
        <List
          itemLayout="horizontal"
          dataSource={customers}
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: false, size: "small" }}
          renderItem={(record) => {
            const statusItem = getStatusItem(record.status)
            return (
              <List.Item
                actions={[
                  hasPermission('crm.edit') ? <Button key="edit" type="text" size="small" icon={<EditOutlined style={{color:'#faad14'}}/>} onClick={(e) => handleOpenEditModal(record, e)} /> : null,
                  hasPermission('crm.delete') ? (
                    <Popconfirm key="del" title="Xóa khách hàng này?" onConfirm={(e) => handleDeleteCustomer(record.id, e)} onCancel={(e) => e?.stopPropagation()}>
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={(e) => e?.stopPropagation()} />
                    </Popconfirm>
                  ) : null,
                ].filter(Boolean)}
                style={{ cursor: 'pointer', background: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, border: '1px solid #f0f0f0' }}
                onClick={() => handleOpenDrawer(record)}
              >
                <List.Item.Meta
                  avatar={<Avatar src={record.assigned_to_avatar} icon={<UserOutlined />} />}
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text strong style={{ fontSize: 15, color: '#1649c9' }}>{record.name}</Text>
                      <Badge color={statusItem?.color} text={statusItem?.label} />
                    </div>
                  }
                  description={
                    <div style={{ marginTop: 4 }}>
                      <Space direction="vertical" size={2}>
                        <Text type="secondary"><PhoneOutlined /> {record.phone}</Text>
                        {record.assigned_to && (
                          <Text type="secondary">
                            <UserOutlined /> Sale: {record.assigned_to.full_name || record.assigned_to.username}
                          </Text>
                        )}
                        {record.source && (
                          <Text type="secondary">
                            <span style={{ marginRight: 6 }}>{SOURCE_ICON[record.source] || '✏️'}</span> Nguồn: {SOURCE_MAP[record.source] || record.source}
                          </Text>
                        )}
                        {record.zalo_id && <Tag color="blue" style={{ marginTop: 4 }}>Đã kết nối Zalo</Tag>}
                      </Space>
                    </div>
                  }
                />
              </List.Item>
            )
          }}
        />
      ) : (
        <Table scroll={{ x: 'max-content' }}
          onChange={(pagination, filters, sorter) => setTableSort(sorter)}
          rowSelection={{
            selectedRowKeys,
            onChange: (newSelectedRowKeys) => setSelectedRowKeys(newSelectedRowKeys),
          }}
          columns={columns.filter(col => visibleColumns.includes(col.key))}
          dataSource={customers}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 15, showSizeChanger: false }}
          onRow={(record) => ({
            onClick: () => handleOpenDrawer(record),
            style: { cursor: 'pointer' },
          })}
        />
      )}

      {/* Modal Add/Edit Customer */}
      <Modal
        title={editingCustomer ? 'Cập nhật Khách hàng' : 'Thêm Khách hàng mới'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        okText="Lưu thông tin"
        cancelText="Hủy"
        width={650}
      >
        <Form form={form} layout="vertical" onFinish={handleSaveCustomer}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="name"
                label="Tên khách hàng / Người liên hệ"
                rules={[{ required: true, message: 'Vui lòng nhập tên!' }]}
              >
                <Input placeholder="VD: Nguyễn Văn A" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="phone"
                label="Số điện thoại"
                rules={[{ required: true, message: 'Vui lòng nhập SĐT!' }]}
              >
                <Input placeholder="VD: 0901234567" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={16}>
              <Form.Item
                name="company_name"
                label="Tên công ty (Dành cho khách B2B)"
                extra="Để trống nếu khách hàng cá nhân, không thuộc công ty"
              >
                <Input placeholder="VD: Công ty TNHH ABC" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="tax_code"
                label="Mã số thuế"
              >
                <Input placeholder="VD: 0123456789" allowClear />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" placeholder="email@domain.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="city" label="Thành phố / Tỉnh">
                <Input placeholder="VD: TP. Hồ Chí Minh" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="address" label="Địa chỉ">
                <Input placeholder="Số nhà, đường, phường/xã..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="birthday" label="Ngày sinh">
                <DatePicker 
                  format={['DD/MM/YYYY', 'D/M/YYYY', 'DD/M/YYYY', 'D/MM/YYYY']} 
                  style={{ width: '100%' }} 
                  placeholder="Nhập DD/MM/YYYY" 
                  allowClear 
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="source" label="Nguồn khách hàng" initialValue="other">
                <Select placeholder="Chọn nguồn khách hàng">
                  {Object.entries(SOURCE_MAP).map(([key, label]) => (
                    <Option key={key} value={key}>
                      <Space size={6}>
                        <span>{SOURCE_ICON[key]}</span>
                        <span>{label}</span>
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="status"
                label={
                  <Space>
                    <span>Trạng thái quy trình (Pipeline)</span>
                    {editingCustomer && (editingCustomer.status === 'has_order' || editingCustomer.status === 'repeat_order') && (
                      <Tag color="purple" style={{ fontSize: 11 }}>🔒 Tự động từ Đơn hàng</Tag>
                    )}
                  </Space>
                }
                initialValue="new"
                extra={editingCustomer && (editingCustomer.status === 'has_order' || editingCustomer.status === 'repeat_order') ? "🔒 Khách hàng đã đạt trạng thái Đã có đơn hàng/Mua thêm đơn hàng do hệ thống tự động ghi nhận từ Đơn hàng. KHÔNG ĐƯỢC PHÉP ĐỔI thủ công để tránh sai lệch dữ liệu." : null}
              >
                <Select disabled={editingCustomer && (editingCustomer.status === 'has_order' || editingCustomer.status === 'repeat_order')}>
                  {Object.entries(STATUS_MAP).map(([key, item]) => {
                    const sItem = getStatusItem(key)
                    const isSystemAutomated = key === 'has_order' || key === 'repeat_order'
                    const disabled = isSystemAutomated
                    return (
                      <Option key={key} value={key} disabled={disabled}>
                        <Badge color={sItem.color} text={disabled ? `${sItem.label} 🔒 (Hệ thống tự cập nhật)` : sItem.label} />
                      </Option>
                    )
                  })}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="priority_level" label="Mức độ ưu tiên" initialValue="p4">
                <Select placeholder="Chọn mức độ ưu tiên">
                  {Object.entries(PRIORITY_MAP).map(([key, item]) => (
                    <Option key={key} value={key}>
                      <Space size={6}>
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="expected_quantity" label="Số lượng SP dự kiến">
                <Input type="number" min={0} placeholder="Nhập số lượng..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="tag_ids" label="Gắn Tags">
            <Select
              mode="multiple"
              placeholder="Chọn tag..."
              allowClear
              optionLabelProp="label"
            >
              {allTags.map((tag) => (
                <Option key={tag.id} value={tag.id} label={tag.name}>
                  <Tag color={tag.color}>{tag.name}</Tag>
                </Option>
              ))}
            </Select>
          </Form.Item>
          </Col>
        </Row>

          <Form.Item name="notes" label="Ghi chú thêm">
            <TextArea rows={3} placeholder="Ghi chú về nhu cầu, đặc điểm khách hàng..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Assign Sale */}
      <Modal
        title={`Phân công Sale cho khách hàng: ${assignTargetCustomer?.name || ''}`}
        open={assignModalVisible}
        onCancel={() => setAssignModalVisible(false)}
        onOk={handleConfirmAssign}
        confirmLoading={assigning}
        okText="Xác nhận phân công"
        cancelText="Hủy"
      >
        <div style={{ padding: '10px 0' }}>
          <Text style={{ display: 'block', marginBottom: 8 }}>Chọn nhân viên Sale phụ trách:</Text>
          <Select
            style={{ width: '100%' }}
            placeholder="Chọn nhân viên Sale"
            value={selectedSaleId}
            onChange={(val) => setSelectedSaleId(val)}
            showSearch
            optionFilterProp="children"
          >
            {salesUsers.map((u) => (
              <Option key={u.id} value={u.id}>
                <Space>
                  <Avatar size="small" icon={<UserOutlined />} />
                  <Text>{u.full_name || u.username}</Text>
                  <Text type="secondary">({u.email})</Text>
                </Space>
              </Option>
            ))}
          </Select>
        </div>
      </Modal>

      {/* Drawer Details & Timeline */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <TeamOutlined style={{ color: '#1649c9' }} />
            <Text strong ellipsis={{ tooltip: currentCustomer?.name }} style={{ maxWidth: isMobile ? 180 : '100%' }}>
              {currentCustomer?.name}
            </Text>
            {currentCustomer && (
              <Tag color={getStatusItem(currentCustomer.status).color}>
                {getStatusItem(currentCustomer.status).label}
              </Tag>
            )}
          </div>
        }
        width={700}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        extra={
          currentCustomer && (
            isMobile ? (
              <Dropdown menu={{
                items: [
                  (isModuleActive('zalo') && (isCompanyAdmin || hasPermission('zalo.send_zns'))) && {
                    key: 'zns',
                    icon: <MessageOutlined style={{ color: '#10b981' }}/>,
                    label: 'Gửi ZNS',
                    onClick: () => setZnsModalVisible(true)
                  },
                  {
                    key: 'quote',
                    icon: <FileAddOutlined style={{ color: '#1649c9' }}/>,
                    label: 'Tạo báo giá',
                    onClick: () => handleCreateQuotationFromCustomer(currentCustomer)
                  }
                ].filter(Boolean)
              }} trigger={['click']}>
                <Button type="text" icon={<MoreOutlined style={{ fontSize: 18 }}/>} />
              </Dropdown>
            ) : (
              <Space>
                {(isModuleActive('zalo') && (isCompanyAdmin || hasPermission('zalo.send_zns'))) && (
                  <Button
                    type="primary"
                    icon={<MessageOutlined />}
                    onClick={() => setZnsModalVisible(true)}
                    style={{ background: '#10b981', borderColor: '#10b981' }}
                  >
                    Gửi ZNS
                  </Button>
                )}
                <Button
                  type="primary"
                  icon={<FileAddOutlined />}
                  onClick={() => handleCreateQuotationFromCustomer(currentCustomer)}
                >
                  Tạo báo giá
                </Button>
              </Space>
            )
          )
        }
      >
        {currentCustomer && (
          <Tabs
            defaultActiveKey="timeline"
            size={isMobile ? "small" : "middle"}
            items={[
              {
                key: 'timeline',
                label: (
                  <span>
                    <HistoryOutlined /> {isMobile ? `Lịch sử (${interactions.length})` : `Lịch sử chăm sóc (${interactions.length})`}
                  </span>
                ),
                children: (
                  <div>
                    <div style={{ marginBottom: 16, textAlign: 'right' }}>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          if (!checkMaintenance()) {
                            interactionForm.resetFields()
                            interactionForm.setFieldsValue({ type: 'call', result: 'interested' })
                            setInteractionFiles([])
                            setInteractionModalVisible(true)
                          }
                        }}
                      >
                        Ghi nhận tương tác
                      </Button>
                    </div>

                    {loadingDetails ? (
                      <Paragraph>Đang tải dữ liệu...</Paragraph>
                    ) : interactions.length === 0 ? (
                      <Alert message="Chưa có lịch sử chăm sóc nào được ghi nhận." type="info" />
                    ) : (
                      <Timeline
                        mode="left"
                        items={interactions.map((item) => ({
                          color: item.isZnsLog ? (item.status === 'sent' ? 'green' : item.status === 'pending' ? 'blue' : 'red') : (INTERACTION_TYPES[item.type]?.color || 'blue'),
                          label: new Date(item.created_at || item.sent_at).toLocaleString('vi-VN'),
                          children: (
                            <Card size="small" style={{ marginBottom: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <Tag color={item.isZnsLog ? 'purple' : INTERACTION_TYPES[item.type]?.color}>
                                  {item.isZnsLog ? 'Hệ thống gửi ZNS' : (INTERACTION_TYPES[item.type]?.label || item.type)}
                                </Tag>
                                {!item.isZnsLog && item.result && (
                                  <Tag color={INTERACTION_RESULTS[item.result]?.color}>
                                    {INTERACTION_RESULTS[item.result]?.label || item.result}
                                  </Tag>
                                )}
                              </div>
                              <Paragraph style={{ margin: 0, whiteSpace: 'pre-line', marginBottom: item.attachments?.length > 0 ? 8 : 0 }}>
                                {item.notes || item.content}
                              </Paragraph>
                              
                              {item.isZnsLog && item.error_message && (
                                <Text type="danger" style={{ display: 'block', marginTop: 4 }}>
                                  Lỗi: {item.error_message}
                                </Text>
                              )}

                              {item.attachments && item.attachments.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                  <Space direction="vertical" size={2}>
                                    {item.attachments.map(att => (
                                      <a key={att.id} href={att.file} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                                        <PaperClipOutlined /> {att.file_name}
                                      </a>
                                    ))}
                                  </Space>
                                </div>
                              )}
                              
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                Thực hiện bởi: {item.created_by?.full_name || item.created_by?.username || 'Admin'}
                              </Text>
                            </Card>
                          ),
                        }))}
                      />
                    )}
                  </div>
                ),
              },
              {
                key: 'contacts',
                label: (
                  <span>
                    <UserAddOutlined /> {isMobile ? `Liên hệ (${contacts.length})` : `Đầu mối liên hệ (${contacts.length})`}
                  </span>
                ),
                children: (
                  <div>
                    <div style={{ marginBottom: 16, textAlign: 'right' }}>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          if (!checkMaintenance()) {
                            contactForm.resetFields()
                            setContactModalVisible(true)
                          }
                        }}
                      >
                        Thêm đầu mối
                      </Button>
                    </div>

                    <Table scroll={{ x: 'max-content' }}
                      dataSource={contacts}
                      rowKey="id"
                      pagination={false}
                      size="small"
                      columns={[
                        { title: 'Họ tên', dataIndex: 'name', key: 'name' },
                        { title: 'Chức vụ', dataIndex: 'position', key: 'position' },
                        { 
                          title: 'SĐT', 
                          dataIndex: 'phone', 
                          key: 'phone',
                          render: (text) => (
                            <Space>
                              {text}
                              {text && (
                                <Button 
                                  type="primary" 
                                  size="small" 
                                  style={{ background: '#0068ff', borderColor: '#0068ff', fontSize: 11, height: 20, padding: '0 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', fontWeight: 600, marginLeft: 8 }}
                                  onClick={() => window.open(`https://zalo.me/${text.replace(/\D/g, '')}`, '_blank')}
                                >
                                  Chat Zalo
                                </Button>
                              )}
                            </Space>
                          )
                        },
                        { title: 'Email', dataIndex: 'email', key: 'email' },
                      ]}
                    />
                  </div>
                ),
              },
              {
                key: 'info',
                label: isMobile ? 'Thông tin' : 'Thông tin chi tiết',
                children: (
                  <Form layout="vertical">
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item label="Số điện thoại">
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <Input value={currentCustomer.phone} readOnly />
                            {currentCustomer.phone && (
                              <Button
                                type="primary"
                                style={{ background: '#0068ff', borderColor: '#0068ff', fontWeight: 600 }}
                                onClick={() => window.open(`https://zalo.me/${currentCustomer.phone.replace(/\D/g, '')}`, '_blank')}
                              >
                                Chat Zalo
                              </Button>
                            )}
                          </div>
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item label="Email">
                          <Input value={currentCustomer.email || '—'} readOnly />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col xs={24} md={16}>
                        <Form.Item label="Tên công ty (nếu có)">
                          <Input value={currentCustomer.company_name || '—'} readOnly />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Mã số thuế">
                          <Input value={currentCustomer.tax_code || '—'} readOnly />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item label="Địa chỉ">
                      <Input value={currentCustomer.address || '—'} readOnly />
                    </Form.Item>
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item label="Thành phố">
                          <Input value={currentCustomer.city || '—'} readOnly />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item label="Ngày sinh">
                          <Input value={currentCustomer.birthday ? dayjs(currentCustomer.birthday).format('DD/MM/YYYY') : '—'} readOnly />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item label="Nguồn">
                          <Input value={SOURCE_MAP[currentCustomer.source] || currentCustomer.source || '—'} readOnly />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item label="Ngày tạo">
                          <Input value={new Date(currentCustomer.created_at).toLocaleString('vi-VN')} readOnly />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item label="Mức độ ưu tiên">
                          <Select 
                            value={currentCustomer.priority_level} 
                            onChange={(val) => handleUpdateSalesInfo('priority_level', val)}
                          >
                            {Object.entries(PRIORITY_MAP).map(([key, item]) => (
                              <Option key={key} value={key}>{item.icon} {item.label}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item label="Số lượng SP dự kiến">
                          <Input 
                            key={currentCustomer.id}
                            type="number"
                            min={0}
                            defaultValue={currentCustomer.expected_quantity} 
                            onBlur={(e) => {
                              const val = e.target.value ? parseInt(e.target.value) : null;
                              if (val !== currentCustomer.expected_quantity) {
                                handleUpdateSalesInfo('expected_quantity', val);
                              }
                            }}
                            onPressEnter={(e) => {
                              const val = e.target.value ? parseInt(e.target.value) : null;
                              if (val !== currentCustomer.expected_quantity) {
                                handleUpdateSalesInfo('expected_quantity', val);
                              }
                            }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item label="Tags">
                      <Select
                        mode="multiple"
                        placeholder="Chọn tags..."
                        value={currentCustomer.tags?.map(t => t.id) || []}
                        onChange={(val) => handleUpdateSalesInfo('tag_ids', val)}
                        options={allTags.map(tag => ({ label: tag.name, value: tag.id }))}
                      />
                    </Form.Item>
                    <Form.Item label="Ghi chú">
                      <TextArea value={currentCustomer.notes || 'Không có ghi chú.'} rows={4} readOnly />
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
          />
        )}
      </Drawer>

      {/* Modal Add Interaction */}
      <Modal
        title="Ghi nhận Lịch sử chăm sóc"
        open={interactionModalVisible}
        onCancel={() => {
          setInteractionModalVisible(false)
          setInteractionFiles([])
        }}
        onOk={() => interactionForm.submit()}
        confirmLoading={submittingInteraction}
        okText="Lưu lại"
        cancelText="Hủy"
      >
        <Form form={interactionForm} layout="vertical" onFinish={handleAddInteraction}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="type" label="Hình thức tương tác" rules={[{ required: true }]}>
                <Select>
                  {Object.entries(INTERACTION_TYPES).map(([key, item]) => (
                    <Option key={key} value={key}>{item.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="result" label="Kết quả đánh giá" rules={[{ required: true }]}>
                <Select>
                  {Object.entries(INTERACTION_RESULTS).map(([key, item]) => (
                    <Option key={key} value={key}>{item.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="content" label="Nội dung trao đổi / chi tiết" rules={[{ required: true, message: 'Vui lòng nhập nội dung!' }]}>
            <TextArea rows={4} placeholder="VD: Khách hàng hỏi giá chi tiết sản phẩm X, yêu cầu gửi báo giá qua email..." />
          </Form.Item>
          
          {hasPermission('crm.upload_interaction_files') && (
            <Form.Item label="File đính kèm (Tùy chọn)">
              <Upload
                multiple
                beforeUpload={() => false}
                fileList={interactionFiles}
                onChange={(info) => {
                  setInteractionFiles(info.fileList)
                }}
              >
                <Button icon={<UploadOutlined />}>Chọn file đính kèm</Button>
              </Upload>
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* Modal Add Contact */}
      <Modal
        title="Thêm Đầu mối liên hệ mới"
        open={contactModalVisible}
        onCancel={() => setContactModalVisible(false)}
        onOk={() => contactForm.submit()}
        confirmLoading={submittingContact}
        okText="Thêm mới"
        cancelText="Hủy"
      >
        <Form form={contactForm} layout="vertical" onFinish={handleAddContact}>
          <Form.Item name="name" label="Họ và tên" rules={[{ required: true, message: 'Vui lòng nhập tên!' }]}>
            <Input placeholder="VD: Nguyễn Văn B" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="Số điện thoại">
                <Input placeholder="090..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" placeholder="email@company.com" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="position" label="Chức vụ / Phòng ban">
            <Input placeholder="VD: Trưởng phòng Mua hàng" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Import Excel */}
      <Modal
        title="Nhập khách hàng từ Excel"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        onOk={handleImportCsv}
        confirmLoading={importing}
        okText="Bắt đầu nhập"
        cancelText="Hủy"
      >
        <div style={{ marginBottom: 16 }}>
          <Text>
            Vui lòng chuẩn bị file Excel theo cấu trúc 6 cột: 
            <strong> Tên, SĐT, Email, Địa chỉ, Tỉnh/Thành phố, Tags.</strong>
            <br />
            <Text type="secondary" style={{ fontSize: 13 }}>
              * Chỉ bắt buộc điền <strong>Tên</strong> và <strong>Số điện thoại</strong>. Các cột khác có thể để trống.
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              * Cột Tags có thể chứa nhiều tag cách nhau bởi dấu phẩy (VD: Khách sỉ, VIP). Nếu tag chưa có, hệ thống sẽ tự tạo mới.
            </Text>
          </Text>
          <div style={{ marginTop: 12 }}>
            <Button size="small" type="dashed" onClick={handleDownloadTemplate}>
              Tải file mẫu Excel
            </Button>
          </div>
        </div>
        <Input 
          type="file" 
          accept=".csv" 
          onChange={(e) => setImportFile(e.target.files[0])} 
        />
        {importFile && (
          <div style={{ marginTop: 8 }}>
            <Text type="success">Đã chọn file: {importFile.name}</Text>
          </div>
        )}
      </Modal>

      <Modal
        title="🎯 Tùy chỉnh tên hiển thị Trạng thái Pipeline CRM"
        open={pipelineModalVisible}
        onCancel={() => setPipelineModalVisible(false)}
        onOk={() => pipelineForm.submit()}
        confirmLoading={savingPipeline}
        width={650}
        afterOpenChange={(open) => {
          if (open) {
            pipelineForm.setFieldsValue({
              new: pipelineStatusLabels.new || 'Khách mới',
              potential: pipelineStatusLabels.potential || 'Tiềm năng',
              active: pipelineStatusLabels.active || 'Đang hoạt động',
              has_order: pipelineStatusLabels.has_order || 'Đã có đơn hàng',
              repeat_order: pipelineStatusLabels.repeat_order || 'Mua thêm đơn hàng',
              lost: pipelineStatusLabels.lost || 'Đã mất',
            })
          }
        }}
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Thay đổi tên gọi hiển thị của các bước trong quy trình chăm sóc khách hàng cho phù hợp với đặc thù nghiệp vụ của công ty bạn. Tên mới sẽ tự động cập nhật ngay trên toàn hệ thống.
        </Paragraph>
        <Form form={pipelineForm} layout="vertical" onFinish={handleSavePipelineLabels}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="new" label="1. Khách mới (new)">
                <Input placeholder="VD: Khách mới / Lead nóng" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="potential" label="2. Tiềm năng (potential)">
                <Input placeholder="VD: Tìm hiểu nhu cầu / Đang tìm hiểu" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="active" label="3. Đang hoạt động (active)">
                <Input placeholder="VD: Sắp chốt / Tư vấn mẫu" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="lost" label="4. Đã mất (lost)">
                <Input placeholder="VD: Không còn nhu cầu / Thất bại" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="has_order" label="5. Đã có đơn hàng (has_order) ⚡">
                <Input placeholder="VD: Đã có đơn hàng" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="repeat_order" label="6. Mua thêm đơn hàng (repeat_order) ⚡">
                <Input placeholder="VD: Mua thêm đơn hàng / Khách quen" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <TagManagementModal 
        open={tagModalVisible} 
        onCancel={() => setTagModalVisible(false)} 
      />
      
      {currentCustomer && (
        <ZnsSendModal
          visible={znsModalVisible}
          onCancel={() => setZnsModalVisible(false)}
          customer={currentCustomer}
        />
      )}
      
      <ZnsSendModal
        visible={bulkZnsModalVisible}
        onCancel={() => {
          setBulkZnsModalVisible(false)
          setSelectedRowKeys([])
        }}
        customers={customers.filter(c => selectedRowKeys.includes(c.id))}
      />
    </section>
  )
}

export default CustomerList
