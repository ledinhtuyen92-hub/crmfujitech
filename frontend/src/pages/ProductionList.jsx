import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FilePdfOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  PrinterOutlined,
  SearchOutlined,
  SettingOutlined,
  ToolOutlined,
  UserOutlined,
  EyeOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Descriptions,
  message,
  List,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../utils/api'
import TransactionPrintView from '../components/TransactionPrintView'
import QuotationPrintView from '../components/QuotationPrintView'
import { useResponsive } from '../hooks/useResponsive'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

const statusConfig = {
  pending: { label: 'Chờ sản xuất', color: 'warning', icon: <ClockCircleOutlined /> },
  in_progress: { label: 'Đang sản xuất', color: 'processing', icon: <PlayCircleOutlined /> },
  completed: { label: 'Hoàn thành', color: 'success', icon: <CheckCircleOutlined /> },
  cancelled: { label: 'Đã hủy', color: 'default', icon: <ToolOutlined /> },
}

const stepStatusConfig = {
  pending: { label: 'Chờ thực hiện', color: 'default' },
  in_progress: { label: 'Đang làm', color: 'processing' },
  done: { label: 'Hoàn thành', color: 'success' },
}

export default function ProductionList() {
  const { isCompanyAdmin, hasPermission, checkMaintenance, user } = useAuth()
  const { isMobile } = useResponsive()
  const [messageApi, contextHolder] = message.useMessage()
  const navigate = useNavigate()

  // Data
  const [productionOrders, setProductionOrders] = useState([])
  const [orders, setOrders] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState([])
  const [companyTemplate, setCompanyTemplate] = useState(null)

  // Filters
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Modal Add / Edit Production Order
  const [modalVisible, setModalVisible] = useState(false)
  const [editingPO, setEditingPO] = useState(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  // Drawer Manage Steps
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [selectedPO, setSelectedPO] = useState(null)
  const [stepModalVisible, setStepModalVisible] = useState(false)
  const [editingStep, setEditingStep] = useState(null)
  const [stepForm] = Form.useForm()

  // View Modals/Drawers
  const [viewOrderVisible, setViewOrderVisible] = useState(false)
  const [viewOrderData, setViewOrderData] = useState(null)
  const [viewExportVisible, setViewExportVisible] = useState(false)
  const [viewExportData, setViewExportData] = useState(null)

  const handleViewOrder = async (record) => {
    try {
      setLoading(true)
      const res = await api.get(`/production/orders/${record.id}/order_details/`)
      setViewOrderData(res.data)
      setViewOrderVisible(true)
    } catch (err) {
      messageApi.error(err.response?.data?.detail || 'Không thể lấy thông tin đơn hàng')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDeliveryOrder = async (orderId) => {
    if (checkMaintenance()) return
    try {
      setLoading(true)
      await api.post('/delivery/deliveries/', { order: orderId, status: 'pending' })
      messageApi.success('Đã tạo phiếu giao hàng thành công!')
      fetchProductionOrders()
    } catch (err) {
      messageApi.error(err.response?.data?.detail || 'Lỗi khi tạo phiếu giao hàng')
    } finally {
      setLoading(false)
    }
  }

  const handleViewExport = async (record) => {
    try {
      setLoading(true)
      const res = await api.get(`/production/orders/${record.id}/export_details/`)
      setViewExportData(res.data)
      setViewExportVisible(true)
    } catch (err) {
      messageApi.error(err.response?.data?.detail || 'Không thể lấy thông tin phiếu xuất kho')
    } finally {
      setLoading(false)
    }
  }

  // Permissions
  const canCreate = hasPermission('production.create')
  const canEdit = hasPermission('production.edit')
  const canUpdateStep = hasPermission('production.update_step')
  const canDelete = hasPermission('production.delete')

  // ── Fetch data ────────────────────────────────────────────────────────
  const fetchProductionOrders = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    try {
      const params = {}
      if (statusFilter) params.status = statusFilter
      const res = await api.get('/production/orders/', { params })
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setProductionOrders(data)
    } catch {
      messageApi.error('Không thể tải danh sách lệnh sản xuất.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, messageApi])

  const fetchOrdersAndUsers = useCallback(async () => {
    await Promise.resolve()
    try {
      const [ordRes, usrRes, tmplRes, compTmplRes] = await Promise.all([
        api.get('/orders/orders/', { params: { status: 'approved' } }),
        api.get('/users/users/').catch(() => ({ data: [] })),
        api.get('/sales/quotation-templates/active/').catch(() => ({ data: [] })),
        api.get('/sales/quotation-templates/my-company-template/').catch(() => ({ data: null })),
      ])
      const ordData = Array.isArray(ordRes.data) ? ordRes.data : ordRes.data?.results ?? []
      const usrData = Array.isArray(usrRes.data) ? usrRes.data : usrRes.data?.results ?? []
      const tmplData = Array.isArray(tmplRes.data) ? tmplRes.data : tmplRes.data?.results ?? []
      setOrders(ordData)
      setUsers(usrData)
      setTemplates(tmplData)
      setCompanyTemplate(compTmplRes.data || null)
    } catch {
      // ignore
    }
  }, [])

  const getEffectiveTemplate = (order) => {
    if (order?.custom_data?.template_snapshot?.code) {
      return order.custom_data.template_snapshot
    }
    if (order?.quotation_detail?.custom_data?.template_snapshot?.code) {
      return order.quotation_detail.custom_data.template_snapshot
    }
    if (companyTemplate) {
      return companyTemplate
    }
    const defaultSys = templates.find((t) => t.is_default)
    return defaultSys || null
  }

  const handlePrintOrderPDF = () => {
    if (!viewOrderData) return
    const contentEl = document.querySelector('.printable-quotation-content')
    const dNum = viewOrderData.order_number || 'Don_Hang_SX'
    const effTmpl = getEffectiveTemplate(viewOrderData)
    const isLand = effTmpl?.layout_config?.paper_orientation === 'landscape' || effTmpl?.code === 'production_landscape_a4'

    if (!contentEl) {
      const oldTitle = document.title
      document.title = dNum
      window.print()
      document.title = oldTitle
      return
    }

    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n')

    // Clone DOM và patch inline style để override React styles
    const cloned = contentEl.cloneNode(true)

    // Thu nhỏ margin của tiêu đề/phần mô tả để tiết kiệm không gian
    const titleSection = cloned.querySelector('[style*="textAlign: center"], [style*="text-align: center"]')
    if (titleSection) {
      titleSection.style.margin = '8px 0 12px'
    }

    // Ép signature-block bám vào nội dung, không nhảy trang
    const sigBlock = cloned.querySelector('.signature-block')
    if (sigBlock) {
      sigBlock.style.marginTop = '12px'
      sigBlock.style.pageBreakBefore = 'avoid'
      sigBlock.style.breakBefore = 'avoid'
      sigBlock.style.pageBreakInside = 'avoid'
      sigBlock.style.breakInside = 'avoid'
    }

    // Thu nhỏ khoảng trống placeholder ký tên nếu có (height: 130px → 60px)
    const emptySpacers = cloned.querySelectorAll('[style*="height: 130"]')
    emptySpacers.forEach(el => { el.style.height = '60px' })

    const printWin = window.open('', '_blank', 'width=1280,height=900')
    if (!printWin) {
      const oldTitle = document.title
      document.title = dNum
      window.print()
      document.title = oldTitle
      return
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${dNum}</title>
        ${styleTags}
        <style>
          @page {
            size: A4 landscape;
            margin: 6mm;
          }
          * { box-sizing: border-box; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: Inter, ui-sans-serif, system-ui, Arial, sans-serif !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .printable-quotation-content {
            width: 1060px !important;
            max-width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            margin: 0 auto !important;
            padding: 0 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .signature-block {
            page-break-before: avoid !important;
            break-before: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-top: 12px !important;
          }
          .ant-table-wrapper, .ant-table, .ant-table-container, .ant-table-tbody {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* Scale toàn bộ nội dung để vừa 1 trang nếu quá cao */
          @media print {
            body {
              transform-origin: top left;
            }
          }
        </style>
      </head>
      <body>
        ${cloned.outerHTML}
        <script>
          setTimeout(() => { window.print(); window.close(); }, 600);
        <\/script>
      </body>
      </html>
    `)
    printWin.document.close()
  }

  const handlePrintExportPDF = () => {
    if (!viewExportData) return
    const contentEl = document.querySelector('.printable-transaction-content')
    const dNum = viewExportData.transaction_code || viewExportData.code || 'Phieu_Xuat_Kho'

    if (!contentEl) {
      const oldTitle = document.title
      document.title = dNum
      window.print()
      document.title = oldTitle
      return
    }

    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n')

    const printWin = window.open('', '_blank', 'width=1000,height=800')
    if (!printWin) {
      const oldTitle = document.title
      document.title = dNum
      window.print()
      document.title = oldTitle
      return
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${dNum}</title>
        ${styleTags}
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; }
          html, body {
            margin: 0 !important; padding: 0 !important;
            background: #ffffff !important;
            font-family: "Times New Roman", Times, serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .printable-transaction-content { width: 100% !important; margin: 0 auto !important; }
        </style>
      </head>
      <body>
        ${contentEl.outerHTML}
        <script>
          setTimeout(() => { window.print(); window.close(); }, 400);
        <\/script>
      </body>
      </html>
    `)
    printWin.document.close()
  }

  useEffect(() => {
    fetchProductionOrders()
  }, [fetchProductionOrders])

  useEffect(() => {
    fetchOrdersAndUsers()
  }, [fetchOrdersAndUsers])

  // ── Filtered list ─────────────────────────────────────────────────────
  const filteredPOs = productionOrders.filter((item) => {
    if (!searchText) return true
    const oNum = (item.order_number || '').toLowerCase()
    const query = searchText.toLowerCase()
    return oNum.includes(query)
  })

  // ── Open Modal (PO) ───────────────────────────────────────────────────
  const openModal = (po = null) => {
    if (checkMaintenance()) return
    setEditingPO(po)
    if (po) {
      form.setFieldsValue({
        order: po.order,
        status: po.status,
        start_date: po.start_date ? dayjs(po.start_date) : null,
        end_date: po.end_date ? dayjs(po.end_date) : null,
        notes: po.notes || '',
      })
    } else {
      form.resetFields()
      form.setFieldsValue({ status: 'pending' })
    }
    setModalVisible(true)
  }

  const handleSubmitPO = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const payload = {
        order: values.order,
        status: values.status,
        start_date: values.start_date ? values.start_date.format('YYYY-MM-DD') : null,
        end_date: values.end_date ? values.end_date.format('YYYY-MM-DD') : null,
        notes: values.notes || '',
      }

      if (editingPO) {
        await api.patch(`/production/orders/${editingPO.id}/`, payload)
        messageApi.success('Cập nhật lệnh sản xuất thành công!')
      } else {
        await api.post('/production/orders/', payload)
        messageApi.success('Tạo lệnh sản xuất mới thành công!')
      }

      setModalVisible(false)
      fetchProductionOrders()
    } catch (error) {
      if (error.errorFields) return
      const data = error.response?.data
      let errorMsg = 'Lưu lệnh sản xuất thất bại. Vui lòng kiểm tra dữ liệu.'
      if (data) {
        if (Array.isArray(data.status)) errorMsg = data.status[0]
        else if (typeof data.status === 'string') errorMsg = data.status
        else if (data.detail) errorMsg = data.detail
        else if (Array.isArray(data.non_field_errors)) errorMsg = data.non_field_errors[0]
        else if (Array.isArray(data.order)) errorMsg = data.order[0]
        else if (Object.values(data).length > 0 && Array.isArray(Object.values(data)[0])) errorMsg = Object.values(data)[0][0]
        else if (typeof data === 'string') errorMsg = data
      }
      messageApi.error(errorMsg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeletePO = async (id) => {
    if (checkMaintenance()) return
    try {
      await api.delete(`/production/orders/${id}/`)
      messageApi.success('Đã xoá lệnh sản xuất.')
      fetchProductionOrders()
    } catch {
      messageApi.error('Không thể xoá lệnh sản xuất này.')
    }
  }

  // ── Step Management ───────────────────────────────────────────────────
  const openStepModal = (step = null) => {
    if (checkMaintenance()) return
    setEditingStep(step)
    if (step) {
      stepForm.setFieldsValue({
        step_name: step.step_name,
        sequence: step.sequence,
        assigned_to: step.assigned_to,
        status: step.status,
        notes: step.notes || '',
      })
    } else {
      stepForm.resetFields()
      const nextSeq = (selectedPO?.steps?.length || 0) + 1
      stepForm.setFieldsValue({ sequence: nextSeq, status: 'pending' })
    }
    setStepModalVisible(true)
  }

  const handleSubmitStep = async () => {
    try {
      const values = await stepForm.validateFields()
      setSubmitting(true)

      const payload = {
        ...values,
        production_order: selectedPO.id,
      }

      if (values.status === 'in_progress' && (!editingStep || !editingStep.started_at)) {
        payload.started_at = new Date().toISOString()
      } else if (values.status === 'done' && (!editingStep || !editingStep.completed_at)) {
        payload.completed_at = new Date().toISOString()
        if (!editingStep?.started_at) payload.started_at = new Date().toISOString()
      }

      if (editingStep) {
        await api.patch(`/production/steps/${editingStep.id}/`, payload)
        messageApi.success('Cập nhật công đoạn thành công!')
      } else {
        await api.post('/production/steps/', payload)
        messageApi.success('Thêm công đoạn thành công!')
      }

      setStepModalVisible(false)
      // Refetch current PO details
      const res = await api.get(`/production/orders/${selectedPO.id}/`)
      setSelectedPO(res.data)
      fetchProductionOrders()
    } catch (error) {
      if (error.errorFields) return
      const data = error.response?.data
      let errorMsg = 'Lưu công đoạn thất bại.'
      if (data) {
        if (Array.isArray(data.status)) errorMsg = data.status[0]
        else if (typeof data.status === 'string') errorMsg = data.status
        else if (data.detail) errorMsg = data.detail
        else if (Array.isArray(data.non_field_errors)) errorMsg = data.non_field_errors[0]
        else if (Object.values(data).length > 0 && Array.isArray(Object.values(data)[0])) errorMsg = Object.values(data)[0][0]
        else if (typeof data === 'string') errorMsg = data
      }
      messageApi.error(errorMsg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteStep = async (stepId) => {
    if (checkMaintenance()) return
    try {
      await api.delete(`/production/steps/${stepId}/`)
      messageApi.success('Đã xoá công đoạn.')
      const res = await api.get(`/production/orders/${selectedPO.id}/`)
      setSelectedPO(res.data)
      fetchProductionOrders()
    } catch {
      messageApi.error('Không thể xoá công đoạn này.')
    }
  }

  const handleQuickStepStatus = async (step, newStatus) => {
    if (checkMaintenance()) return
    try {
      const payload = { status: newStatus }
      if (newStatus === 'in_progress' && !step.started_at) {
        payload.started_at = new Date().toISOString()
      } else if (newStatus === 'done' && !step.completed_at) {
        payload.completed_at = new Date().toISOString()
        if (!step.started_at) payload.started_at = new Date().toISOString()
      }
      await api.patch(`/production/steps/${step.id}/`, payload)
      messageApi.success(`Đã chuyển trạng thái bước "${step.step_name}" sang "${stepStatusConfig[newStatus].label}"`)
      const res = await api.get(`/production/orders/${selectedPO.id}/`)
      setSelectedPO(res.data)
      fetchProductionOrders()
    } catch {
      messageApi.error('Lỗi khi cập nhật trạng thái công đoạn.')
    }
  }

  // ── Table Columns ─────────────────────────────────────────────────────
  const renderProductionActions = (record) => (
    <Space wrap size={8}>
      <Tooltip title="Xem đơn hàng">
        <Button
          type="text"
          shape="circle"
          icon={<EyeOutlined style={{ color: '#2563eb' }} />}
          onClick={() => handleViewOrder(record)}
        />
      </Tooltip>

      {record.export_transaction_code && (
        <Tooltip title="Xem phiếu xuất kho">
          <Button
            type="text"
            shape="circle"
            icon={<ExportOutlined style={{ color: '#8b5cf6' }} />}
            onClick={() => handleViewExport(record)}
          />
        </Tooltip>
      )}

      <Button
        type="primary"
        size="small"
        icon={<SettingOutlined />}
        onClick={() => {
          setSelectedPO(record)
          setDrawerVisible(true)
        }}
        style={{ background: '#0284c7' }}
      >
        Công đoạn
      </Button>

      {canEdit && record.status !== 'completed' && (
        <Tooltip title="Đánh dấu Hoàn thành">
          <Popconfirm
            title="Đánh dấu Lệnh Sản Xuất này đã Hoàn thành?"
            onConfirm={async () => {
              try {
                await api.patch(`/production/orders/${record.id}/`, { status: 'completed' })
                messageApi.success('Đã cập nhật trạng thái Hoàn thành')
                fetchProductionOrders()
              } catch (error) {
                messageApi.error('Lỗi khi cập nhật trạng thái')
              }
            }}
            okText="Đồng ý"
            cancelText="Hủy"
          >
            <Button
              type="text"
              shape="circle"
              icon={<CheckCircleOutlined style={{ color: '#10b981' }} />}
            />
          </Popconfirm>
        </Tooltip>
      )}

      {canEdit && (
        <Tooltip title="Sửa lệnh SX">
          <Button
            type="text"
            shape="circle"
            icon={<EditOutlined style={{ color: '#d97706' }} />}
            onClick={() => openModal(record)}
          />
        </Tooltip>
      )}

      {canDelete && (
        <Popconfirm
          title="Xoá lệnh sản xuất?"
          onConfirm={() => handleDeletePO(record.id)}
          okText="Xoá"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" danger shape="circle" icon={<DeleteOutlined />} />
        </Popconfirm>
      )}
    </Space>
  )

  const columns = [
    {
      title: 'Mã Lệnh SX',
      key: 'id',
      render: (_, r) => (
        <Space>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'rgba(2, 132, 199, 0.1)',
              color: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
            }}
          >
            SX
          </div>
          <div>
            <Text
              strong
              style={{ color: '#0284c7', cursor: 'pointer', display: 'block' }}
              onClick={() => {
                setSelectedPO(r)
                setDrawerVisible(true)
              }}
            >
              {r.production_order_code || `LSX-${r.id ? r.id.toString().padStart(4, '0') : '0000'}`}
            </Text>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
              Đơn hàng: <Tag color="blue" style={{ margin: 0 }}>{r.order_number || `DH-${r.order}`}</Tag>
            </Text>
            {r.export_transaction_code && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                Xuất kho: <Tag color="purple" style={{ margin: 0 }}>{r.export_transaction_code}</Tag>
              </Text>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st, r) => {
        const cfg = statusConfig[st] || { label: st, color: 'default' }
        const hasDeliveryPerm = isCompanyAdmin || hasPermission('delivery.create')
        
        return (
          <Space direction="vertical" size={4} align="center">
            <Tag color={cfg.color} icon={cfg.icon} style={{ margin: 0 }}>{cfg.label}</Tag>
            {st === 'completed' && !r.delivery_status && (
              hasDeliveryPerm ? (
                <Tooltip title="Nhấn để tạo Phiếu giao hàng">
                  <Button 
                    type="primary" 
                    danger 
                    size="small" 
                    onClick={() => handleCreateDeliveryOrder(r.order)}
                    style={{ fontSize: 11, height: 22, padding: '0 6px' }}
                  >
                    Hàng chưa được giao
                  </Button>
                </Tooltip>
              ) : (
                <Tag color="error" style={{ margin: 0 }}>Hàng chưa được giao</Tag>
              )
            )}
          </Space>
        )
      },
    },
    {
      title: 'Nhà máy',
      dataIndex: 'factory_name',
      key: 'factory',
      render: (val) => val ? <Text strong style={{ color: '#4b5563' }}>{val}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Tiến độ công đoạn',
      key: 'progress',
      render: (_, r) => {
        const total = r.steps ? r.steps.length : 0
        if (total === 0) return <Text type="secondary">Chưa có công đoạn</Text>
        const done = r.steps.filter((s) => s.status === 'done').length
        const percent = Math.round((done / total) * 100)
        return (
          <div style={{ width: 140 }}>
            <Progress percent={percent} size="small" strokeColor={percent === 100 ? '#10b981' : '#0284c7'} />
            <Text type="secondary" style={{ fontSize: 11 }}>Hoàn thành {done}/{total} bước</Text>
          </div>
        )
      },
    },
    {
      title: 'Thời gian thực hiện',
      key: 'dates',
      render: (_, r) => (
        <div>
          <div><Text type="secondary" style={{ fontSize: 12 }}>Bắt đầu:</Text> <Text strong>{r.start_date ? dayjs(r.start_date).format('DD/MM/YYYY') : '—'}</Text></div>
          <div><Text type="secondary" style={{ fontSize: 12 }}>Dự kiến:</Text> <Text strong style={{ color: '#dc2626' }}>{r.end_date ? dayjs(r.end_date).format('DD/MM/YYYY') : '—'}</Text></div>
        </div>
      ),
    },
    {
      title: 'Ghi chú',
      dataIndex: 'notes',
      key: 'notes',
      render: (v) => <Text type="secondary">{v || '—'}</Text>,
    },
    {
      title: 'Hành động',
      key: 'action',
      align: 'right',
      render: (_, record) => renderProductionActions(record),
    },
  ]

  return (
    <section>
      {contextHolder}

      {/* ── Page Header ────────────────────────────────────────────────── */}
      <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={10}>
          <Title level={3} style={{ margin: 0, fontWeight: 800 }}>
            <ToolOutlined style={{ color: '#0284c7', marginRight: 10 }} />
            Quản lý Lệnh Sản Xuất & Gia Công
          </Title>
          <Text type="secondary">
            Theo dõi tiến độ gia công từng đơn hàng, phân công công đoạn thi công cho kỹ thuật viên.
          </Text>
        </Col>
        <Col xs={24} md={14} style={{ textAlign: isMobile ? 'left' : 'right' }}>
          <Space wrap style={{ justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
            {(isCompanyAdmin || hasPermission('production.manage_factory')) && (
              <Button
                size="large"
                icon={<SettingOutlined />}
                onClick={() => navigate('/settings/factories')}
                style={{ borderRadius: 10 }}
              >
                Cài đặt Nhà máy
              </Button>
            )}
            {canCreate && (
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => openModal()}
                style={{
                  borderRadius: 10,
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
                }}
              >
                Tạo Lệnh Sản Xuất Mới
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {/* ── Search & Filter Bar ────────────────────────────────────────── */}
      <Card style={{ borderRadius: 12, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }} bodyStyle={{ padding: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="Tìm theo mã đơn hàng liên kết..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ borderRadius: 8 }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Select
              placeholder="Lọc theo trạng thái"
              value={statusFilter || undefined}
              onChange={(val) => setStatusFilter(val || '')}
              allowClear
              style={{ width: '100%' }}
            >
              <Option value="pending">Chờ sản xuất</Option>
              <Option value="in_progress">Đang sản xuất</Option>
              <Option value="completed">Hoàn thành</Option>
              <Option value="undelivered">Hàng chưa được giao</Option>
              <Option value="cancelled">Đã hủy</Option>
            </Select>
          </Col>
        </Row>
      </Card>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <Card style={{ borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }} bodyStyle={{ padding: 0 }}>
        {isMobile ? (
          <List
            dataSource={filteredPOs}
            loading={loading}
            pagination={{ pageSize: 10, size: 'small' }}
            renderItem={(record) => {
              const cfg = statusConfig[record.status] || { label: record.status, color: 'default' }
              const total = record.steps?.length || 0
              const done = record.steps ? record.steps.filter((s) => s.status === 'done').length : 0
              const percent = total > 0 ? Math.round((done / total) * 100) : 0
              
              return (
                <List.Item
                  style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                    <Text strong style={{ color: '#2563eb' }}>ĐH: {record.order_number}</Text>
                    <Tag color={cfg.color} icon={cfg.icon} style={{ margin: 0 }}>{cfg.label}</Tag>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>Khách hàng: </Text>
                    <Text strong>{record.customer_name || 'Khách lẻ'}</Text>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>Ngày dự kiến: </Text>
                    <Text strong style={{ color: '#dc2626' }}>{record.end_date ? dayjs(record.end_date).format('DD/MM/YYYY') : '—'}</Text>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <Progress percent={percent} size="small" strokeColor={percent === 100 ? '#10b981' : '#0284c7'} style={{ width: '80%' }} />
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{done}/{total} bước</Text>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {renderProductionActions(record)}
                  </div>
                </List.Item>
              )
            }}
          />
        ) : (
          <Table scroll={{ x: 'max-content' }}
            columns={columns}
            dataSource={filteredPOs}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
          />
        )}
      </Card>

      {/* ── Modal Add / Edit PO ────────────────────────────────────────── */}
      <Modal
        title={<Text strong style={{ fontSize: 18 }}>{editingPO ? 'Chỉnh sửa Lệnh Sản Xuất' : 'Tạo Lệnh Sản Xuất Mới'}</Text>}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmitPO}
        confirmLoading={submitting}
        okText="Lưu Lệnh SX"
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="order" label="Đơn hàng liên kết" rules={[{ required: true, message: 'Vui lòng chọn đơn hàng' }]}>
            <Select showSearch optionFilterProp="children" placeholder="Chọn đơn hàng đã được chấp thuận..." disabled={!!editingPO}>
              {orders.filter(o => editingPO || !o.has_production_order).map((o) => (
                <Option key={o.id} value={o.id}>{o.order_number} — Khách: {o.customer_name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="status" label="Trạng thái">
                <Select disabled={editingPO?.delivery_status === 'delivered'}>
                  <Option value="pending">Chờ sản xuất</Option>
                  <Option value="in_progress">Đang sản xuất</Option>
                  <Option value="completed">Hoàn thành</Option>
                  <Option value="cancelled">Đã hủy</Option>
                </Select>
              </Form.Item>
              {editingPO?.delivery_status === 'delivered' && (
                <div style={{ color: '#ef4444', fontSize: 12, marginTop: -16, marginBottom: 16 }}>
                  Đơn hàng đã được giao thành công, không thể thay đổi trạng thái sản xuất.
                </div>
              )}
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="start_date" label="Ngày bắt đầu">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item 
                name="end_date" 
                label="Ngày kết thúc dự kiến"
                dependencies={['start_date']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const startDate = getFieldValue('start_date');
                      if (!startDate || !value) {
                        return Promise.resolve();
                      }
                      if (value.isBefore(startDate, 'day')) {
                        return Promise.reject(new Error('Ngày kết thúc không được trước ngày bắt đầu!'));
                      }
                      return Promise.resolve();
                    },
                  }),
                ]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Ghi chú kỹ thuật">
            <TextArea rows={3} placeholder="VD: Cắt nhôm chính xác theo bản vẽ, chú ý keo silicone màu đen..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Drawer Manage Steps ────────────────────────────────────────── */}
      <Drawer
        title={
          <Space>
            <ToolOutlined style={{ color: '#0284c7' }} />
            <Text strong>Quản lý Công Đoạn — {selectedPO?.production_order_code || (selectedPO ? `LSX-${selectedPO.id.toString().padStart(4, '0')}` : 'LSX-0000')}</Text>
          </Space>
        }
        width={750}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {selectedPO && (
          <div>
            <Card style={{ marginBottom: 20, background: '#f8fafc', borderRadius: 10 }}>
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Text type="secondary" style={{ fontSize: 12 }}>ĐƠN HÀNG:</Text>
                  <div><Text strong style={{ color: '#0284c7', fontSize: 15 }}>{selectedPO.order_number || `DH-${selectedPO.order}`}</Text></div>
                </Col>
                <Col xs={24} md={8}>
                  <Text type="secondary" style={{ fontSize: 12 }}>TRẠNG THÁI LSX:</Text>
                  <div>{(() => { const c = statusConfig[selectedPO.status] || { label: selectedPO.status }; return <Tag color={c.color}>{c.label}</Tag> })()}</div>
                </Col>
                <Col xs={24} md={8}>
                  <Text type="secondary" style={{ fontSize: 12 }}>NGÀY DỰ KIẾN XONG:</Text>
                  <div><Text strong style={{ color: '#dc2626' }}>{selectedPO.end_date ? dayjs(selectedPO.end_date).format('DD/MM/YYYY') : '—'}</Text></div>
                </Col>
              </Row>
            </Card>

            <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0 }}>Danh sách công đoạn thực hiện</Title>
              {canEdit && (
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openStepModal()} style={{ background: '#0284c7' }}>
                  Thêm công đoạn
                </Button>
              )}
            </Row>

            <Table scroll={{ x: 'max-content' }}
              dataSource={selectedPO.steps || []}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                { title: '#', dataIndex: 'sequence', key: 'sequence', width: 50, align: 'center', render: (v) => <Tag color="blue">{v}</Tag> },
                {
                  title: 'Tên công đoạn',
                  dataIndex: 'step_name',
                  key: 'step_name',
                  render: (v, r) => (
                    <div>
                      <Text strong style={{ fontSize: 14 }}>{v}</Text>
                      {r.notes && <div style={{ fontSize: 12 }}><Text type="secondary">{r.notes}</Text></div>}
                    </div>
                  ),
                },
                {
                  title: 'Phụ trách',
                  dataIndex: 'assigned_to_name',
                  key: 'assigned_to_name',
                  render: (val) => val ? <Tag icon={<UserOutlined />} color="cyan">{val}</Tag> : <Text type="secondary">Chưa gán</Text>,
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  render: (st, r) => (
                    <Select
                      size="small"
                      value={st}
                      style={{ width: 120 }}
                      onChange={(newVal) => handleQuickStepStatus(r, newVal)}
                      disabled={!canEdit && !canUpdateStep}
                    >
                      <Option value="pending">Chờ làm</Option>
                      <Option value="in_progress">Đang làm</Option>
                      <Option value="done">Hoàn thành</Option>
                    </Select>
                  ),
                },
                {
                  title: 'Thời gian',
                  key: 'time',
                  render: (_, r) => (
                    <div style={{ fontSize: 11 }}>
                      {r.started_at && <div>Bắt đầu: {dayjs(r.started_at).format('DD/MM HH:mm')}</div>}
                      {r.completed_at && <div style={{ color: '#16a34a' }}>Xong: {dayjs(r.completed_at).format('DD/MM HH:mm')}</div>}
                    </div>
                  ),
                },
                {
                  title: '',
                  key: 'actions',
                  align: 'right',
                  render: (_, r) => (
                    <Space size="small">
                      {(canEdit || canUpdateStep) && <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openStepModal(r)} />}
                      {canEdit && (
                        <Popconfirm title="Xoá bước này?" onConfirm={() => handleDeleteStep(r.id)} okText="Xoá" cancelText="Hủy">
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Drawer>

      {/* ── Step Modal ─────────────────────────────────────────────────── */}
      <Modal
        title={<Text strong>{editingStep ? 'Chỉnh sửa Công đoạn' : 'Thêm Công đoạn Mới'}</Text>}
        open={stepModalVisible}
        onCancel={() => setStepModalVisible(false)}
        onOk={handleSubmitStep}
        confirmLoading={submitting}
        okText="Lưu Công Đoạn"
        cancelText="Hủy"
      >
        <Form form={stepForm} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={18}>
              <Form.Item name="step_name" label="Tên công đoạn thi công" rules={[{ required: true, message: 'Nhập tên công đoạn' }]}>
                <Input placeholder="VD: Cắt nhôm theo bản vẽ, Lắp ráp khung, Ghép kính..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="sequence" label="Thứ tự" rules={[{ required: true }]}>
                <Input type="number" min={1} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="assigned_to" label="Kỹ thuật viên phụ trách">
                <Select placeholder="Chọn nhân viên..." allowClear>
                  {users.map((u) => (
                    <Option key={u.id} value={u.id}>{u.full_name || u.username}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="status" label="Trạng thái thực hiện">
                <Select>
                  <Option value="pending">Chờ thực hiện</Option>
                  <Option value="in_progress">Đang thực hiện</Option>
                  <Option value="done">Hoàn thành</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={24}>
              <Form.Item name="notes" label="Ghi chú / Yêu cầu kỹ thuật">
                <TextArea rows={2} placeholder="Ghi chú cho kỹ thuật viên thi công bước này..." />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Drawer: View Order Details */}
      <Drawer
        title="Thông tin đơn hàng"
        width={Math.min(900, window.innerWidth < 768 ? window.innerWidth : window.innerWidth * 0.78)}
        open={viewOrderVisible}
        onClose={() => setViewOrderVisible(false)}
        styles={{ body: { padding: window.innerWidth < 768 ? '12px' : '24px' } }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setViewOrderVisible(false)}>Đóng</Button>
            <Button
              type="primary"
              icon={<FilePdfOutlined />}
              onClick={handlePrintOrderPDF}
              style={{ background: '#dc2626', borderColor: '#dc2626' }}
            >
              Tải PDF / In
            </Button>
          </div>
        }
      >
        {viewOrderData && (
          <QuotationPrintView 
            quotation={viewOrderData} 
            type="order" 
            effectiveTemplate={getEffectiveTemplate(viewOrderData)} 
            hidePricing={true}
            hideCustomerInfo={true}
          />
        )}
      </Drawer>

      {/* Modal: View Export Details */}
      <Modal
        title="Chi tiết phiếu xuất kho"
        open={viewExportVisible}
        onCancel={() => setViewExportVisible(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setViewExportVisible(false)}>Đóng</Button>
            <Button
              type="primary"
              icon={<FilePdfOutlined />}
              onClick={handlePrintExportPDF}
              style={{ background: '#dc2626', borderColor: '#dc2626' }}
            >
              Tải PDF / In
            </Button>
          </div>
        }
        width={Math.min(900, window.innerWidth < 768 ? window.innerWidth - 16 : window.innerWidth * 0.78)}
        style={{ top: 20 }}
      >
        <div style={{ maxHeight: '80vh', overflowY: 'auto', paddingRight: 8 }}>
          <TransactionPrintView transaction={viewExportData} company={user?.company} />
        </div>
      </Modal>
    </section>
  )
}
