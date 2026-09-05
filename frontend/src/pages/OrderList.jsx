import { AlertOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, DeleteOutlined, EditOutlined, FileDoneOutlined, FileTextOutlined, MessageOutlined, MinusCircleOutlined, PlusOutlined, PrinterOutlined, SearchOutlined, UploadOutlined, PictureOutlined, CameraOutlined, TableOutlined } from '@ant-design/icons'
import {
  AutoComplete,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Drawer,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
  Upload,
  Avatar,
  List,
  Radio,
  Checkbox,
  Popover,
} from 'antd' 
import dayjs from 'dayjs'
import React, { useCallback, useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../utils/api'
import QuotationPrintView from '../components/QuotationPrintView'
import ReceiptPrintView from '../components/ReceiptPrintView'
import ZnsSendModal from '../components/ZnsSendModal'
import { useResponsive } from '../hooks/useResponsive'
import CustomInfoInput from '../components/CustomInfoInput'
import { MenuOutlined } from '@ant-design/icons';
import { DndContext, PointerSensor, useSensor, useSensors, KeyboardSensor } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
const groupProducts = (items, withUnit = false) => {
  const grouped = {};
  const ungrouped = [];
  items.forEach(p => {
    const text = withUnit ? `${p.name} (${p.unit || 'cái'})` : p.name;
    // Dùng JSX label với title="" để chặn tooltip đen tự động của browser/Ant Design
    const option = { label: <span title="">{text}</span>, value: p.name, title: '' };
    if (p.category_name) {
      if (!grouped[p.category_name]) grouped[p.category_name] = [];
      grouped[p.category_name].push(option);
    } else {
      ungrouped.push(option);
    }
  });
  const res = Object.keys(grouped).map(cat => ({
    label: (
      <span style={{ fontWeight: 'bold', color: '#1677ff' }}>
        {cat}
      </span>
    ),
    options: grouped[cat]
  }));
  if (ungrouped.length > 0) {
    res.push({
      label: (
        <span style={{ fontWeight: 'bold', color: '#1677ff' }}>
          Khác
        </span>
      ),
      options: ungrouped
    });
  }
  return res;
};

const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { TextArea } = Input

const RowContext = React.createContext({});

const DragHandle = () => {
  const { setActivatorNodeRef, listeners } = React.useContext(RowContext);
  return (
    <div
      ref={setActivatorNodeRef}
      {...listeners}
      style={{ cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
    >
      <MenuOutlined style={{ color: '#94a3b8', fontSize: 16 }} />
    </div>
  );
};

const DraggableBodyRow = (props) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props['data-row-key'],
  });
  const style = {
    ...props.style,
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, background: '#f8fafc', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' } : {}),
  };
  return (
    <RowContext.Provider value={{ setActivatorNodeRef, listeners }}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes} />
    </RowContext.Provider>
  );
};

// Trạng thái đơn hàng
const statusConfig = {
  pending: { label: 'Chờ duyệt', color: 'warning', icon: <ClockCircleOutlined /> },
  approved: { label: 'Đã được duyệt', color: 'processing', icon: <CheckCircleOutlined /> },
  rejected: { label: 'Đã từ chối', color: 'error', icon: <CloseCircleOutlined /> },
  cancelled: { label: 'Đã hủy', color: 'default', icon: <MinusCircleOutlined /> },
  completed: { label: 'Hoàn thành', color: 'success', icon: <CheckCircleOutlined /> },
}

export default function OrderList() {
  const { isMobile } = useResponsive()
  const { token } = theme.useToken()
  const { user, isCompanyAdmin, hasPermission, checkMaintenance, isModuleActive } = useAuth()
  const [messageApi, contextHolder] = message.useMessage()
  const location = useLocation()

  // Data states
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [znsModalVisible, setZnsModalVisible] = useState(false)
  const [printingOrder, setPrintingOrder] = useState(null)
  const [printingReceipt, setPrintingReceipt] = useState(null)
  const [receiptPrintVisible, setReceiptPrintVisible] = useState(false)
  const [previewAttachments, setPreviewAttachments] = useState([])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState([])
  const [companyTemplate, setCompanyTemplate] = useState(null)

  // Column Visibility
  const DEFAULT_COLUMNS = ['order_number', 'customer_name', 'status', 'financial_status', 'payment_target', 'people', 'total_amount', 'action']
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('orderListVisibleColumns')
    return saved ? JSON.parse(saved) : DEFAULT_COLUMNS
  })

  useEffect(() => {
    localStorage.setItem('orderListVisibleColumns', JSON.stringify(visibleColumns))
  }, [visibleColumns])

  // Filters
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [financialFilter, setFinancialFilter] = useState('')
  const [paymentTargetFilter, setPaymentTargetFilter] = useState('')
  const [exportFilter, setExportFilter] = useState('')

  // Modal Add / Edit
  const [modalVisible, setModalVisible] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  // Dynamic products in form
  const [formItems, setFormItems] = useState(() => [
    { key: Date.now(), product: null, width: 0, height: 0, length: 0, thickness: 0, area: 0, spec: '', warranty: '12 tháng', quantity: 1, unit_price: 0, discount_percent: 0, note: '', product_image: '', unit: 'cái' },
  ])
  const [serviceItems, setServiceItems] = useState(() => [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event, items, setItems) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setItems((prev) => {
        const activeIndex = prev.findIndex((i) => i.key === active.id);
        const overIndex = prev.findIndex((i) => i.key === over?.id);
        return arrayMove(prev, activeIndex, overIndex);
      });
    }
  };
  // Drawer details
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [companySettings, setCompanySettings] = useState(null)

  // Finance modal
  const [receiptModalVisible, setReceiptModalVisible] = useState(false)
  const [receiptSubmitting, setReceiptSubmitting] = useState(false)
  const [receiptForm] = Form.useForm()
  const [receiptFileList, setReceiptFileList] = useState([])
  const [receiptUploading, setReceiptUploading] = useState(false)

  const [approvers, setApprovers] = useState([])
  const [approverModalVisible, setApproverModalVisible] = useState(false)
  const [approverForm] = Form.useForm()

  const [resubmitModalVisible, setResubmitModalVisible] = useState(false)
  const [resubmitApprovers, setResubmitApprovers] = useState([])
  const [submittingResubmit, setSubmittingResubmit] = useState(false)
  const [resubmitForm] = Form.useForm()

  const [selectedReceiptForPrint, setSelectedReceiptForPrint] = useState(null)
  const receiptPrintRef = useRef(null)

  const handlePrintReceipt = (receipt) => {
    setSelectedReceiptForPrint(receipt)
    setTimeout(() => {
      const contentEl = document.querySelector('.printable-receipt-content')
      if (!contentEl) {
        window.print()
        return
      }
      
      const printWin = window.open('', '_blank', 'width=900,height=700')
      if (!printWin) {
        window.print() // Fallback if popup blocked
        return
      }

      printWin.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${receipt.receipt_code || 'Phieu_Thu'}</title>
            <style>
            body { font-family: "Times New Roman", Times, serif; }
            @media print {
              body, html {
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
              }
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .printable-receipt-content {
                width: 100% !important;
                margin: 0 auto !important;
              }
            }
            </style>
          </head>
          <body>
            ${contentEl.outerHTML}
            <script>
              setTimeout(() => {
                window.print();
                window.close();
              }, 300);
            </script>
          </body>
        </html>
      `)
      printWin.document.close()
    }, 100)
  }

  const openReceiptModal = () => {
    if (checkMaintenance()) return
    setReceiptFileList([])
    receiptForm.resetFields()
    setReceiptModalVisible(true)
    
    let defaultMilestoneId = null
    let defaultAmount = selectedOrder?.remaining_debt || selectedOrder?.total_amount || 0
    let note = `Thanh toán cho Đơn hàng ${selectedOrder?.order_number}`

    if (selectedOrder?.payment_milestones?.length > 0) {
      const adjusted = getAdjustedMilestones(selectedOrder.payment_milestones)
      const pendingMilestone = adjusted.find(m => m.status !== 'paid' && m.adjusted_needed > 0)
      if (pendingMilestone) {
        defaultMilestoneId = pendingMilestone.id
        defaultAmount = pendingMilestone.adjusted_needed
        note = `Thanh toán ${pendingMilestone.title} - Đơn hàng ${selectedOrder?.order_number}`
      }
    }

    receiptForm.setFieldsValue({
      milestone: defaultMilestoneId,
      amount: defaultAmount,
      payment_method: 'transfer',
      note: note,
      payment_target: selectedOrder?.payment_target || undefined,
    })
    setReceiptModalVisible(true)
  }

  const getAdjustedMilestones = (milestones) => {
    if (!milestones) return []
    let totalOverpaid = 0
    milestones.forEach(m => {
      const diff = Number(m.paid_amount || 0) - Number(m.amount || 0)
      if (diff > 0) totalOverpaid += diff
    })
    return milestones.map(m => {
      let needed = Number(m.amount || 0) - Number(m.paid_amount || 0)
      if (needed > 0 && totalOverpaid > 0) {
        const deduct = Math.min(needed, totalOverpaid)
        needed -= deduct
        totalOverpaid -= deduct
      }
      return { ...m, adjusted_needed: Math.max(0, needed) }
    })
  }

  const handleMilestoneChange = (milestoneId) => {
    const adjusted = getAdjustedMilestones(selectedOrder?.payment_milestones)
    const milestone = adjusted?.find(m => m.id === milestoneId)
    if (milestone) {
      receiptForm.setFieldsValue({
        amount: milestone.adjusted_needed,
        note: `Thanh toán ${milestone.title} - Đơn hàng ${selectedOrder?.order_number}`
      })
    }
  }

  const handleUploadReceipt = async (file) => {
    setReceiptUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await api.postForm('/core/upload/', formData)
      if (res.data && res.data.url) {
        setReceiptFileList(prev => [...prev, {
          uid: file.uid,
          name: file.name,
          status: 'done',
          url: res.data.url
        }])
      } else {
        messageApi.error('Lỗi khi tải ảnh lên.')
      }
    } catch {
      messageApi.error('Lỗi khi tải ảnh lên.')
    } finally {
      setReceiptUploading(false)
    }
    return false // Prevent default upload behavior
  }
  
  const handleRemoveReceiptFile = (file) => {
    setReceiptFileList(prev => prev.filter(item => item.uid !== file.uid))
  }

  const handleCreateReceipt = async (values) => {
    setReceiptSubmitting(true)
    try {
      if (!selectedOrder.payment_target && values.payment_target) {
        await api.patch(`/orders/orders/${selectedOrder.id}/`, { payment_target: values.payment_target })
      }
      await api.post('/finance/receipts/', {
        order: selectedOrder.id,
        milestone: values.milestone || null,
        amount: values.amount,
        payment_method: values.payment_method,
        note: values.note,
        attachments: receiptFileList.map(f => f.url)
      })
      messageApi.success('Lập phiếu thu thành công! Hệ thống đã tự động cập nhật cổng kiểm soát.')
      setReceiptModalVisible(false)
      fetchOrders()
      const { data } = await api.get(`/orders/orders/${selectedOrder.id}/`)
      setSelectedOrder(data)
    } catch (err) {
      let msg = 'Lỗi khi lập phiếu thu!'
      if (err.response?.data) {
        if (typeof err.response.data === 'string') msg = err.response.data
        else if (err.response.data.amount) msg = err.response.data.amount[0]
        else if (err.response.data.milestone) msg = err.response.data.milestone[0]
        else if (err.response.data.detail) msg = err.response.data.detail
        else if (Array.isArray(err.response.data)) msg = err.response.data[0]
        else if (err.response.data.non_field_errors) msg = err.response.data.non_field_errors[0]
        else if (typeof err.response.data === 'object') {
          // If it's another field error
          const firstKey = Object.keys(err.response.data)[0]
          if (firstKey && Array.isArray(err.response.data[firstKey])) {
            msg = err.response.data[firstKey][0]
          }
        }
      }
      messageApi.error(msg)
    } finally {
      setReceiptSubmitting(false)
    }
  }

  const handleDeleteReceipt = async (receiptId) => {
    if (checkMaintenance()) return
    try {
      await api.delete(`/finance/receipts/${receiptId}/`)
      messageApi.success('Đã xóa phiếu thu thành công. Công nợ đã được cập nhật lại.')
      fetchOrders()
      if (selectedOrder) {
        const { data } = await api.get(`/orders/orders/${selectedOrder.id}/`)
        setSelectedOrder(data)
      }
    } catch (err) {
      messageApi.error('Lỗi khi xóa phiếu thu!')
    }
  }

  const openApproverModal = async () => {
    if (checkMaintenance()) return
    try {
      const res = await api.get('/users/users/')
      const userList = res.data.results || res.data || []
      const validApprovers = userList.filter(u => u.is_company_admin || u.is_superuser || (u.permissions && u.permissions.includes('finance.approve_credit')))
      setApprovers(validApprovers.length > 0 ? validApprovers : userList.filter(u => u.is_company_admin || u.is_superuser))
      approverForm.resetFields()
      setApproverModalVisible(true)
    } catch (err) {
      messageApi.error('Lỗi tải danh sách người duyệt.')
    }
  }

  const handleRequestCreditApproval = async (values) => {
    if (checkMaintenance()) return
    try {
      await api.post(`/orders/orders/${selectedOrder.id}/request_credit_approval/`, {
        approver_id: values.approver_id,
      })
      messageApi.success('Đã gửi yêu cầu phê duyệt xuất kho nợ tới người duyệt!')
      setApproverModalVisible(false)
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, has_pending_credit_request: true } : o)))
      setSelectedOrder((prev) => ({ ...prev, has_pending_credit_request: true }))
    } catch (err) {
      const msg = err.response?.data?.detail || 'Lỗi khi trình duyệt xuất kho nợ!'
      messageApi.error(msg)
    }
  }

  const handleReRequestExport = async (orderId) => {
    if (checkMaintenance()) return
    try {
      await api.post(`/orders/orders/${orderId}/re-request-export/`)
      messageApi.success('Đã gửi lại yêu cầu xuất kho thành công!')
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, needs_export_request: false, has_pending_export: true } : o)))
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) => ({ ...prev, needs_export_request: false, has_pending_export: true }))
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Lỗi khi yêu cầu xuất kho lại!'
      messageApi.error(msg)
    }
  }

  // Permissions
  const canCreate = hasPermission('orders.create')
  const canEdit = hasPermission('orders.edit') || hasPermission('orders.create')
  const canDelete = hasPermission('orders.delete') || hasPermission('orders.create')
  const canCancel = hasPermission('orders.cancel')
  const canRequestCredit = hasPermission('finance.request_credit')
  const canApprove = hasPermission('orders.approve')
  const canExportPdf = isCompanyAdmin || hasPermission('orders.export_pdf')

  // ── Fetch data ────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    try {
      const params = {}
      if (statusFilter) params.status = statusFilter
      if (financialFilter) params.financial_status = financialFilter
      if (paymentTargetFilter) params.payment_target = paymentTargetFilter
      if (exportFilter) params.export_status = exportFilter
      const res = await api.get('/orders/orders/', { params })
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setOrders(data)
    } catch {
      messageApi.error('Không thể tải danh sách đơn hàng.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, financialFilter, paymentTargetFilter, exportFilter, messageApi])

  const fetchCustomersAndProducts = useCallback(async () => {
    await Promise.resolve()
    try {
      const [custRes, prodRes, tmplRes, myCompTmplRes, settingsRes] = await Promise.all([
        api.get('/crm/customers/').catch(() => ({ data: [] })),
        api.get('/inventory/products/').catch(() => ({ data: [] })),
        api.get('/sales/quotation-templates/active/').catch(() => ({ data: [] })),
        api.get('/sales/quotation-templates/my-company-template/').catch(() => ({ data: null })),
        api.get('/users/company/settings/').catch(() => ({ data: null })),
      ])
      const custData = Array.isArray(custRes.data) ? custRes.data : custRes.data?.results ?? []
      const prodData = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data?.results ?? []
      setCustomers(custData)
      setProducts(prodData)
      setTemplates(tmplRes.data || [])
      if (myCompTmplRes?.data) {
        setCompanyTemplate(myCompTmplRes.data)
      } else {
        setCompanyTemplate((tmplRes.data || []).find(t => t.is_default) || null)
      }
      if (settingsRes?.data) setCompanySettings(settingsRes.data)
    } catch {
      // ignore silently
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

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

  const handlePrintOrPDF = () => {
    if (!selectedOrder) return
    const contentEl = document.querySelector('.printable-quotation-content')
    const dNum = selectedOrder.order_number || 'Don_Hang'

    if (!contentEl) {
      const oldTitle = document.title
      document.title = dNum
      window.print()
      document.title = oldTitle
      return
    }

    const effectiveTmpl = getEffectiveTemplate(selectedOrder)
    const isLand = effectiveTmpl?.layout_config?.paper_orientation === 'landscape' || effectiveTmpl?.code === 'production_landscape_a4'

    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n')

    const printWin = window.open('', '_blank', 'width=1180,height=850')
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
          @media print {
            body, html, .printable-quotation-content {
              display: block !important;
              visibility: visible !important;
              opacity: 1 !important;
            }
          }
          @page {
            size: ${isLand ? 'landscape' : 'portrait'};
            margin: 8mm;
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
            width: 100% !important;
            min-width: 1024px !important;
            max-width: none !important;
            height: auto !important;
            overflow: visible !important;
            margin: 0 auto !important;
            padding: 0 !important;
          }
          @media print {
            .print-row-nowrap {
               flex-wrap: nowrap !important;
            }
            .print-row-nowrap > .ant-col {
               flex: 1 1 50% !important;
               max-width: 50% !important;
            }
          }
        </style>
      </head>
      <body>
        ${contentEl.outerHTML}
        <script>
          setTimeout(() => {
            window.print();
            window.close();
          }, 500);
        </script>
      </body>
      </html>
    `)
    printWin.document.close()
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const searchQuery = params.get('search')
    if (searchQuery) {
      setSearchText(searchQuery)
    }
  }, [location.search])

  useEffect(() => {
    fetchCustomersAndProducts()
  }, [fetchCustomersAndProducts])

  // ── Filtered list ─────────────────────────────────────────────────────
  const filteredOrders = orders.filter((item) => {
    if (!searchText) return true
    const oNum = (item.order_number || '').toLowerCase()
    const cName = (item.customer_name || '').toLowerCase()
    const cPhone = (item.customer_phone || '').toLowerCase()
    const query = searchText.toLowerCase()
    return oNum.includes(query) || cName.includes(query) || cPhone.includes(query)
  })

  // ── Stats ─────────────────────────────────────────────────────────────
  const totalPending = orders.filter((q) => q.status === 'pending').length
  const totalApproved = orders.filter((q) => q.status === 'approved').length
  const totalCompleted = orders.filter((q) => q.status === 'completed').length
  const totalRevenue = orders
    .filter((q) => q.status === 'approved' || q.status === 'completed')
    .reduce((sum, q) => sum + Number(q.total_amount || 0), 0)

  // ── Handlers for modal form items ─────────────────────────────────────
  const handleAddLine = () => {
    setFormItems((prev) => [
      ...prev,
      {
        key: `line-${prev.length + 1}-${Math.random()}`,
        product: null,
        width: 0,
        height: 0,
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
      },
    ])
  }

  const handleRemoveLine = (index) => {
    if (formItems.length === 1) return
    setFormItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleLineChange = (index, field, value) => {
    setFormItems((prev) => {
      const updated = [...prev]
      const oldItem = prev[index]
      
      const matches = (item1, item2) => {
        if (item1.product && item2.product) return item1.product === item2.product;
        if (!item1.product && !item2.product) return item1.product_name === item2.product_name && (!!item1.product_name || item1.custom_data?.is_custom_size !== undefined || item1.custom_data?.is_child || item2.custom_data?.is_custom_size !== undefined || item2.custom_data?.is_child);
        return false;
      };

      let groupSize = 1;
      const isRoot = index === 0 || !matches(prev[index - 1], oldItem);
      if (isRoot) {
        for (let i = index + 1; i < prev.length; i++) {
          if (matches(prev[i], oldItem)) {
            groupSize++;
          } else {
            break;
          }
        }
      }

      const updateItem = (idx, isChild) => {
        const currentItem = { ...updated[idx], [field]: value }
        if (field === 'product') {
          const prod = products.find((p) => p.id === value)
          if (prod) {
            if (!isChild || !currentItem.custom_data?.is_custom_size) {
              currentItem.unit_price = Number(prod.price || prod.cost_price || 0)
              currentItem.unit = prod.unit || 'cái'
            }
            currentItem.product_name = prod.name || ''
            currentItem.product_image = prod.image_url || prod.image || ''
          }
        }
        updated[idx] = currentItem
      };

      updateItem(index, false);
      
      if (groupSize > 1 && (field === 'product' || field === 'product_name' || field === 'product_image')) {
        for (let i = index + 1; i < index + groupSize; i++) {
          updateItem(i, true);
        }
      }

      return updated
    })
  }



  const computeLineTotal = (item, templateOverride) => {
    if (item.quantity === null || item.quantity === '' || item.quantity === undefined ||
        item.unit_price === null || item.unit_price === '' || item.unit_price === undefined) {
      return null;
    }
    const qty = Number(item.quantity)
    const price = Number(item.unit_price)
    const discount = Number(item.discount_percent || 0)
    const tmpl = templateOverride || companyTemplate
    const tmplCode = tmpl?.code || 'STANDARD'
    const isLandscape = tmplCode === 'production_landscape_a4' || tmpl?.layout_config?.paper_orientation === 'landscape'
    if (isLandscape) {
      return Number((qty * price * (1 - discount / 100)).toFixed(0))
    }
    const unit = (item.unit || item.custom_data?.unit || '').toLowerCase();
    const isAreaUnit = unit === 'm²' || unit === 'm2' || unit === 'mét vuông';
    const area = Number(item.area || 0);

    if (isAreaUnit && area > 0) {
      return Number((area * qty * price * (1 - discount / 100)).toFixed(0));
    }
    
    return Number((qty * price * (1 - discount / 100)).toFixed(0));
  }

  const computeServiceLineTotal = (item) => {
    const qty = Number(item.quantity || 1)
    const price = Number(item.unit_price || 0)
    const discount = Number(item.discount_percent || 0)
    return Number((qty * price * (1 - discount / 100)).toFixed(0))
  }

  const computeRowSpan = (data, index, field = 'product') => {
    const currentItem = data[index];
    if (!currentItem) return 1;

    const matches = (item1, item2) => {
      if (field === 'product') {
        if (item1.product && item2.product) return item1.product === item2.product;
        if (!item1.product && !item2.product) return item1.product_name === item2.product_name && (!!item1.product_name || item1.custom_data?.is_custom_size !== undefined || item1.custom_data?.is_child || item2.custom_data?.is_custom_size !== undefined || item2.custom_data?.is_child);
        return false;
      }
      return item1[field] === item2[field];
    };

    if (index > 0 && matches(data[index - 1], currentItem)) {
      return 0;
    }
    let count = 1;
    for (let i = index + 1; i < data.length; i++) {
      if (matches(data[i], currentItem)) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  const handleAddSameProduct = (index, actionConfig = null) => {
    setFormItems((prev) => {
      const currentItem = prev[index]
      if (!currentItem) return prev
      
      const isCustomSize = actionConfig?.mergeColumns?.length > 0;
      const mergeColumns = actionConfig?.mergeColumns || [];

      const newItem = {
        key: Date.now(),
        product: currentItem.product,
        product_name: currentItem.product_name,
        product_image: currentItem.product_image,
        unit: isCustomSize ? '' : (currentItem.unit || 'cái'),
        unit_price: isCustomSize ? null : (currentItem.unit_price || 0),
        quantity: isCustomSize ? null : 1,
        width: isCustomSize ? null : 0,
        height: isCustomSize ? null : 0,
        length: isCustomSize ? null : 0,
        thickness: isCustomSize ? null : 0,
        area: isCustomSize ? null : 0,
        spec: isCustomSize ? '' : (currentItem.spec || ''),
        note: '',
        symbol: '',
        custom_data: { 
          ...(currentItem.custom_data || {}), 
          symbol: '', 
          is_custom_size: isCustomSize, 
          custom_size_text: '',
          merge_columns: mergeColumns
        },
        discount_percent: currentItem.discount_percent || 0,
      }
      let rowSpan = 1;
      const matches = (item1, item2) => {
        if (item1.product && item2.product) return item1.product === item2.product;
        if (!item1.product && !item2.product) return item1.product_name === item2.product_name && (!!item1.product_name || item1.custom_data?.is_custom_size !== undefined || item1.custom_data?.is_child || item2.custom_data?.is_custom_size !== undefined || item2.custom_data?.is_child);
        return false;
      };
      for (let i = index + 1; i < prev.length; i++) {
        if (matches(prev[i], prev[i - 1])) {
          rowSpan++;
        } else {
          break;
        }
      }
      const insertIndex = index + rowSpan;
      const updated = [...prev]
      updated.splice(insertIndex, 0, newItem)
      return updated
    })
  }

  const getItemColumns = () => {
    const et = getEffectiveTemplate(editingOrder)
    const tmplCode = et?.code || 'STANDARD'
    const isLandscape = tmplCode === 'production_landscape_a4' || et?.layout_config?.paper_orientation === 'landscape'
    
    const productBlock = et?.layout_config?.blocks?.find(b => b.type === 'product_table');
    
    const assignProductImage = (matchedProduct, currentCustomData, sourceColId) => {
      if (!matchedProduct || (!matchedProduct.image_url && !matchedProduct.image)) return currentCustomData;
      const img = matchedProduct.image_url || matchedProduct.image;
      
      const colsToCheck = [];
      const addCols = (cols) => {
        for (const c of cols) {
          if (typeof c === 'object') {
            colsToCheck.push(c);
            if (c.children) addCols(c.children);
          }
        }
      };
      addCols(productBlock?.props?.columns || []);
      
      // Columns that handle images via their own mechanism (product_image), not via custom_data
      const excludeFromFallback = ['name', 'action'];
      
      // 1. Try source column first
      const sourceCol = colsToCheck.find(c => c.id === sourceColId);
      if (sourceCol?.allowImageUpload && !excludeFromFallback.includes(sourceColId)) {
        const key = sourceColId === 'note' ? 'note_image' : `img_${sourceColId}`;
        return { ...currentCustomData, [key]: img };
      }
      
      // 2. Try any other column that allows image upload (skip name/action)
      const fallbackCol = colsToCheck.find(c => c.allowImageUpload && !excludeFromFallback.includes(c.id));
      if (fallbackCol) {
        const key = fallbackCol.id === 'note' ? 'note_image' : `img_${fallbackCol.id}`;
        return { ...currentCustomData, [key]: img };
      }
      
      return currentCustomData;
    };
    const serviceBlock = et?.layout_config?.blocks?.find(b => b.type === 'service_table');
    
    // Only enable image features if explicitly configured in template (default: off)
    const hasTemplate = !!et?.layout_config;
    const nameColCfg = hasTemplate
      ? (productBlock?.props?.columns || []).find(c => (typeof c === 'object' ? c.id : c) === 'name')
      : null;
    const noteColCfg = hasTemplate
      ? (productBlock?.props?.columns || []).find(c => (typeof c === 'object' ? c.id : c) === 'note')
      : null;
    const specColCfg = hasTemplate
      ? (productBlock?.props?.columns || []).find(c => (typeof c === 'object' ? c.id : c) === 'spec')
      : null;
    const nameAllowedCategories = (nameColCfg && typeof nameColCfg === 'object') ? nameColCfg.allowedCategories : null;
    const hasCategoryFilter = nameAllowedCategories && nameAllowedCategories.length > 0;
    
    const noteAllowedCategories = (noteColCfg && typeof noteColCfg === 'object') ? (noteColCfg.allowedCategories || []) : [];
    const hasNoteCategoryFilter = noteAllowedCategories && noteAllowedCategories.length > 0;
    
    // enableProductSuggest: "Bật tính năng Ghi nhớ / Lưu mẫu chữ" - independent of category filter
    // If nameColCfg not found (old template), default to true
    const enableProductSuggest = nameColCfg && typeof nameColCfg === 'object' ? nameColCfg.enableTemplate !== false : true;
    // Priority for name column:
    //  1. hasCategoryFilter → AutoComplete filtered by selected categories
    //  2. enableProductSuggest (no filter) → CustomInfoInput with template/save feature
    //  3. neither → plain CustomInfoInput

    let mainProductOptions = [];
    if (hasCategoryFilter) {
      mainProductOptions = products.filter(p => p.product_type !== 'service' && nameAllowedCategories.includes(p.category_name));
    }
    const mainProductGroupedOptions = groupProducts(mainProductOptions, true);
    const showProductAutoComplete = hasCategoryFilter;

    const enableProductImage = hasTemplate
      ? (nameColCfg && typeof nameColCfg === 'object' && 'allowImageUpload' in nameColCfg ? nameColCfg.allowImageUpload === true : productBlock?.props?.enableProductImage !== false)
      : false;
    const enableProductName = productBlock?.props?.enableProductName !== false;
    const enableProductDescription = productBlock?.props?.enableProductDescription !== false;
    const enableNoteImage = hasTemplate
      ? (productBlock?.props?.columns?.find(c => (typeof c === 'object' ? c.id : c) === 'note')?.allowImageUpload === true)
      : false;
    const useComplexDimensions = productBlock?.props?.useComplexDimensions !== false;
    const enableServiceImage = hasTemplate
      ? serviceBlock?.props?.enableProductImage !== false
      : false;
    const enableServiceName = serviceBlock?.props?.enableProductName !== false;

    const dimCol = productBlock?.props?.columns?.find(c => (typeof c === 'object' ? c.id : c) === 'dimensions');
    const dimensionFieldsRaw = dimCol?.children || [];
    const dimensionFields = dimensionFieldsRaw.length > 0
      ? dimensionFieldsRaw.map(c => ({ id: c.id, label: c.title, width: 85 }))
      : [{ id: 'height', label: 'Cao', width: 85 }, { id: 'width', label: 'Rộng', width: 85 }, { id: 'thickness', label: 'Dày', width: 85 }];
    const BUILTIN_DIM = ['height', 'width', 'thickness'];
    const getDimVal = (record, field) => BUILTIN_DIM.includes(field.id) ? record[field.id] : record.custom_data?.[`dim_${field.id}`];
    const setDimVal = (idx, record, field, v) => {
      if (BUILTIN_DIM.includes(field.id)) {
        handleLineChange(idx, field.id, v !== null && v !== undefined ? Math.round(Number(v)) : 0);
      } else {
        const cd = record.custom_data || {};
        handleLineChange(idx, 'custom_data', { ...cd, [`dim_${field.id}`]: v });
      }
    };

    const dimensionColumnGroup = useComplexDimensions ? [{
      title: 'KÍCH THƯỚC Ô CHỜ (mm)',
      key: 'dimensions',
      children: dimensionFields.map((field, fi) => ({
        title: field.label,
        dataIndex: field.id,
        key: field.id,
        width: field.width || 85,
        align: 'center',
        render: (val, record, idx) => {
          if (record.custom_data?.is_custom_size) {
            if (fi === 0) {
              return {
                children: <CustomInfoInput placeholder="Thêm thông tin..." style={{ textAlign: 'left' }} value={record.custom_data?.custom_size_text || ''} onChange={(val) => {
                  const currentData = record.custom_data || {};
                  handleLineChange(idx, 'custom_data', { ...currentData, custom_size_text: val });
                }} />,
                props: { colSpan: dimensionFields.length }
              };
            }
            return { children: null, props: { colSpan: 0 } };
          }
          const fieldVal = getDimVal(record, field);
          return {
            children: (
              <InputNumber
                min={0}
                step={1}
                precision={0}
                style={{ width: '100%', textAlign: 'center' }}
                value={fieldVal !== undefined && fieldVal !== null && fieldVal !== '' ? Math.round(Number(fieldVal)) : undefined}
                onChange={(v) => setDimVal(idx, record, field, v)}
                placeholder="0"
              />
            ),
            props: { colSpan: 1 }
          };
        },
      })),
    }] : [{
      title: 'KÍCH THƯỚC',
      dataIndex: 'dimensions',
      key: 'dimensions',
      width: 150,
      render: (val, record, idx) => {
        const currentData = record.custom_data || {};
        let initialText = currentData.custom_size_text || '';
        if (!initialText && !currentData.is_custom_size) {
          const parts = [];
          if (record.height) parts.push(record.height);
          if (record.width) parts.push(record.width);
          if (record.thickness) parts.push(record.thickness);
          initialText = parts.join(' x ');
        }
        return (
          <CustomInfoInput placeholder="Thêm thông tin..." style={{ textAlign: 'center' }} value={initialText} onChange={(val) => {
            handleLineChange(idx, 'custom_data', { ...currentData, custom_size_text: val, is_custom_size: true });
          }} />
        );
      }
    }];

    let baseCols = [];

    if (isLandscape) {
      baseCols = [
        {
          title: 'STT',
          key: 'stt',
          width: 70,
          align: 'center',
          render: (_, __, idx) => (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <DragHandle />
              <span>{idx + 1}</span>
            </div>
          ),
        },
        {
          title: 'MẪU CỬA / SẢN PHẨM',
          dataIndex: 'product',
          key: 'product',
          width: 260,
          render: (val, record, idx) => {
            const prodObj = products.find((p) => p.id === val)
            const imgUrl = record.product_image || (prodObj ? (prodObj.image_url || prodObj.image) : null)
            const rowSpan = computeRowSpan(formItems, idx, 'product')
            return {
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
                    {enableProductImage && imgUrl && (
                      <div style={{ position: 'relative', flexShrink: 0, width: 32, height: 32 }}>
                        <Image src={imgUrl} style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', border: '1px solid #cbd5e1' }} />
                        {record.product_image && (
                          <CloseCircleOutlined 
                            style={{ position: 'absolute', top: -6, right: -6, color: '#ef4444', cursor: 'pointer', background: '#fff', borderRadius: '50%', fontSize: 12 }} 
                            onClick={(e) => {
                               e.stopPropagation();
                               handleLineChange(idx, 'product_image', null);
                            }} 
                          />
                        )}
                      </div>
                    )}
                    {showProductAutoComplete ? (
                      <AutoComplete
                        style={{ flex: 1, minWidth: 150 }}
                        value={record.product_name || (prodObj ? prodObj.name : undefined)}
                        onChange={(v) => {
                          const matched = products.find(p => p.name === v && p.product_type !== 'service');
                          setFormItems(prev => {
                            const updated = [...prev];
                            const item = { ...updated[idx] };
                            if (matched) {
                              item.product = matched.id;
                              item.product_name = matched.name;
                              item.product_image = matched.image_url || matched.image || '';
                              item.unit = item.unit || matched.unit || 'cái';
                              item.unit_price = item.unit_price || Number(matched.price || matched.cost_price || 0);
                              item.spec = '';
                            } else {
                              item.product = null;
                              item.product_name = v;
                              item.product_image = '';
                            }
                            updated[idx] = item;
                            // sync children in same group
                            for (let i = idx + 1; i < prev.length; i++) {
                              const ni = prev[i];
                              const sameGroup = (ni.product && ni.product === prev[idx].product) ||
                                (!ni.product && !prev[idx].product && ni.product_name === prev[idx].product_name && (!!ni.product_name || ni.custom_data?.is_custom_size !== undefined || ni.custom_data?.is_child));
                              if (!sameGroup) break;
                              updated[i] = { ...updated[i], product: item.product, product_name: item.product_name, product_image: item.product_image };
                            }
                            return updated;
                          });
                        }}
                        options={mainProductGroupedOptions}
                        filterOption={(inputValue, option) => (option?.value || '').toUpperCase().includes(inputValue.toUpperCase())}
                        placeholder="Chọn hoặc nhập mẫu cửa..."
                      />
                    ) : (
                      <CustomInfoInput
                        enableTemplate={enableProductSuggest}
                        style={{ flex: 1, minWidth: 150 }}
                        value={record.product_name || (prodObj ? prodObj.name : undefined)}
                        onChange={(v) => {
                          handleLineChange(idx, 'product', null);
                          handleLineChange(idx, 'product_name', v);
                        }}
                        placeholder="Nhập mẫu cửa..."
                      />
                    )}
                    {enableProductImage && (
                      <Upload
                        fileList={[]}
                        showUploadList={false}
                        customRequest={async ({ file, onSuccess, onError }) => {
                          const key = `upload-prod-${idx}`;
                          messageApi.open({ key, type: 'loading', content: 'Đang tải ảnh lên...', duration: 0 });
                          try {
                            const formData = new FormData();
                            formData.append('image', file);
                            const res = await api.postForm('/sales/quotations/upload-item-image/', formData);
                            handleLineChange(idx, 'product_image', res.data.url);
                            messageApi.open({ key, type: 'success', content: 'Đã tải ảnh thành công!', duration: 2 });
                            onSuccess("ok");
                          } catch (e) {
                            const errDetail = e.response?.data?.error || "Vui lòng thử lại";
                            messageApi.open({ key, type: 'error', content: `Tải ảnh thất bại: ${errDetail}`, duration: 3 });
                            onError(e);
                          }
                        }}
                      >
                        <Button icon={<CameraOutlined />} size="small" type="dashed" title="Tải ảnh lên" />
                      </Upload>
                    )}
                  </div>
                  {(val || record.product_name) && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', gap: 6 }}>
                      {enableProductImage && (
                        imgUrl ? (
                          <img src={imgUrl} alt="product" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }} />
                        ) : (
                          <div style={{ width: 80, height: 80, background: '#e2e8f0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#64748b' }}>Không có ảnh</div>
                        )
                      )}
                      {enableProductName && (
                        <Text strong style={{ fontSize: 13, textAlign: 'left', color: '#0f172a', lineHeight: 1.3 }}>
                          {record.product_name || (prodObj ? prodObj.name : '')}
                        </Text>
                      )}
                    {enableProductDescription && (
                      !record.product ? (
                        <TextArea 
                          size="small"
                          placeholder="Mô tả sản phẩm (tùy chọn)..."
                          autoSize={{ minRows: 1, maxRows: 3 }}
                          value={record.spec || ''}
                          onChange={(e) => handleLineChange(idx, 'spec', e.target.value)}
                          style={{ fontSize: 11.5, textAlign: 'left', marginTop: 4 }}
                        />
                      ) : (
                        (record.spec || (prodObj && prodObj.description)) && (
                          <div style={{ fontSize: 11.5, color: '#475569', textAlign: 'left', lineHeight: 1.4, fontStyle: 'italic', whiteSpace: 'pre-wrap', marginTop: 4, display: 'inline-block', maxWidth: '100%' }}>
                            {record.spec || (prodObj && prodObj.description)}
                          </div>
                        )
                      )
                    )}
                      {(productBlock?.props?.actionButtons || [
                        { id: 'btn_add_dim', label: 'Thêm kích thước', mergeColumns: [] },
                        { id: 'btn_add_merged', label: 'Thêm gộp kích thước', mergeColumns: ['height', 'width', 'thickness'] }
                      ]).map((btn, bidx) => (
                        <Button
                          key={btn.id || bidx}
                          type="dashed" size="small" icon={<PlusOutlined />}
                          onClick={() => handleAddSameProduct(idx, btn)}
                          style={{ marginTop: 4, borderColor: btn.mergeColumns?.length ? '#059669' : '#2563eb', color: btn.mergeColumns?.length ? '#059669' : '#2563eb', width: '100%' }}
                          title={btn.mergeColumns?.length ? "Thêm dòng phụ và gộp ô" : "Thêm dòng phụ"}
                        >
                          {btn.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ),
              props: { rowSpan },
            }
          },
        },
        ...dimensionColumnGroup,
        {
          title: 'KÝ HIỆU',
          dataIndex: 'symbol',
          width: 100,
          align: 'center',
          render: (val, record, idx) => <CustomInfoInput templateKey="symbol" style={{ textAlign: 'center', fontWeight: 600, color: '#2563eb' }} placeholder="VD: D1.1" value={record.custom_data?.symbol || record.symbol || ''} onChange={(v) => handleLineChange(idx, 'symbol', v)} />,
        },
        {
          title: 'GHI CHÚ KỸ THUẬT',
          dataIndex: 'note',
          width: 170,
          render: (val, record, idx) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {enableNoteImage && record.custom_data?.note_image && (
                  <div style={{ position: 'relative', flexShrink: 0, width: 32, height: 32 }}>
                    <Image src={record.custom_data.note_image} alt="note" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid #cbd5e1' }} />
                    <CloseCircleOutlined 
                      style={{ position: 'absolute', top: -6, right: -6, color: '#ef4444', cursor: 'pointer', background: '#fff', borderRadius: '50%', fontSize: 12 }} 
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentData = record.custom_data || {};
                        handleLineChange(idx, 'custom_data', { ...currentData, note_image: null });
                      }} 
                    />
                  </div>
                )}
                {
                  hasNoteCategoryFilter ? (
                    <AutoComplete
                      style={{ textAlign: 'center', width: '100%' }}
                      placeholder="Khóa, bản lề, kính..."
                      value={val || ''}
                      onChange={(v) => {
                        handleLineChange(idx, 'note', v);
                        const matched = products.find(p => p.name === v);
                        if (matched) {
                          const cd = record.custom_data || {};
                          const updatedCd = assignProductImage(matched, cd, 'note');
                          handleLineChange(idx, 'custom_data', updatedCd);
                        }
                      }}
                      options={groupProducts(products.filter(p => noteAllowedCategories.includes(p.category_name)), false)}
                      filterOption={(inputValue, option) => (option?.value || '').toUpperCase().includes(inputValue.toUpperCase())}
                    />
                  ) : (
                    <CustomInfoInput templateKey="note" style={{ textAlign: 'center' }} placeholder="Khóa, bản lề, kính..." value={val || ''} onChange={(v) => handleLineChange(idx, 'note', v)} enableTemplate={noteColCfg?.enableTemplate !== false} />
                  )
                }
                {enableNoteImage && (
                  <Upload fileList={[]} showUploadList={false}
                    customRequest={async ({ file, onSuccess, onError }) => {
                      const key = `upload-note-${idx}`;
                      messageApi.open({ key, type: 'loading', content: 'Đang tải ảnh lên...', duration: 0 });
                      try {
                        const formData = new FormData();
                        formData.append('image', file);
                        const res = await api.postForm('/sales/quotations/upload-item-image/', formData);
                        const currentData = record.custom_data || {};
                        handleLineChange(idx, 'custom_data', { ...currentData, note_image: res.data.url });
                        messageApi.open({ key, type: 'success', content: 'Đã tải ảnh ghi chú!', duration: 2 });
                        onSuccess("ok");
                      } catch (e) {
                        messageApi.open({ key, type: 'error', content: 'Tải ảnh thất bại', duration: 3 });
                        onError(e);
                      }
                    }}>
                    <Button icon={<CameraOutlined />} size="small" type={record.custom_data?.note_image ? "primary" : "dashed"} title="Tải ảnh lên" />
                  </Upload>
                )}
              </div>
            </div>
          ),
        },
        {
          title: 'SL',
          dataIndex: 'quantity',
          width: 70,
          align: 'center',
          render: (val, record, idx) => <InputNumber style={{ width: '100%', textAlign: 'center' }} value={val} onChange={(v) => handleLineChange(idx, 'quantity', v)} />,
        },
        {
          title: 'ĐVT',
          dataIndex: 'unit',
          width: 70,
          align: 'center',
          render: (val, record, idx) => <Input style={{ textAlign: 'center' }} value={val ?? 'bộ'} onChange={(e) => handleLineChange(idx, 'unit', e.target.value)} />,
        },
        {
          title: 'ĐƠN GIÁ/BỘ',
          dataIndex: 'unit_price',
          width: 130,
          align: 'right',
          render: (val, record, idx) => <InputNumber min={0} step={1000} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(v) => v.replace(/\$\s?|(,*)/g, '')} value={val} onChange={(v) => handleLineChange(idx, 'unit_price', v)} />,
        },
        {
          title: 'TỔNG TIỀN',
          key: 'total',
          width: 130,
          align: 'right',
          render: (_, record) => {
            const total = computeLineTotal(record)
            return <Text strong style={{ color: '#16a34a', fontSize: 14 }}>{total !== null ? `${total.toLocaleString('vi-VN')} đ` : ''}</Text>
          },
        },
        {
          title: '',
          key: 'action',
          width: 70,
          render: (_, __, idx) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <DragHandle />
              {formItems.length > 1 && (
                <Tooltip title="Xoá dòng">
                  <Button type="text" danger shape="circle" icon={<DeleteOutlined />} onClick={() => handleRemoveLine(idx)} />
                </Tooltip>
              )}
            </div>
          ),
        },
      ]
    } else {
      baseCols = [
        {
          title: 'Sản phẩm / Dịch vụ',
        dataIndex: 'product',
        key: 'product',
        width: 220,
        render: (val, record, idx) => {
          const prodObj = products.find((p) => p.id === val);
          const imgUrl = record.product_image || (prodObj ? (prodObj.image_url || prodObj.image) : null);
          const rowSpan = computeRowSpan(formItems, idx, 'product');
          if (rowSpan === 0) return { children: null, props: { rowSpan: 0 } };

          return {
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
                  {enableProductImage && imgUrl && (
                    <div style={{ position: 'relative', flexShrink: 0, width: 32, height: 32 }}>
                      <Image src={imgUrl} style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', border: '1px solid #cbd5e1' }} />
                      {record.product_image && (
                        <CloseCircleOutlined 
                          style={{ position: 'absolute', top: -6, right: -6, color: '#ef4444', cursor: 'pointer', background: '#fff', borderRadius: '50%', fontSize: 12 }} 
                          onClick={(e) => {
                             e.stopPropagation();
                             handleLineChange(idx, 'product_image', null);
                          }} 
                        />
                      )}
                    </div>
                  )}
                  {showProductAutoComplete ? (
                    <AutoComplete
                      style={{ flex: 1, minWidth: 150 }}
                      value={record.product_name || (prodObj ? prodObj.name : undefined)}
                      onChange={(v) => {
                        const matched = products.find(p => p.name === v && p.product_type !== 'service');
                        setFormItems(prev => {
                          const updated = [...prev];
                          const item = { ...updated[idx] };
                          if (matched) {
                            item.product = matched.id;
                            item.product_name = matched.name;
                            item.product_image = matched.image_url || matched.image || '';
                            item.unit = item.unit || matched.unit || 'cái';
                            item.unit_price = item.unit_price || Number(matched.price || matched.cost_price || 0);
                            item.spec = '';
                          } else {
                            item.product = null;
                            item.product_name = v;
                            item.product_image = '';
                          }
                          updated[idx] = item;
                          // sync children in same group
                          for (let i = idx + 1; i < prev.length; i++) {
                            const ni = prev[i];
                            const sameGroup = (ni.product && ni.product === prev[idx].product) ||
                              (!ni.product && !prev[idx].product && ni.product_name === prev[idx].product_name && (!!ni.product_name || ni.custom_data?.is_custom_size !== undefined || ni.custom_data?.is_child));
                            if (!sameGroup) break;
                            updated[i] = { ...updated[i], product: item.product, product_name: item.product_name, product_image: item.product_image };
                          }
                          return updated;
                        });
                      }}
                      options={mainProductGroupedOptions}
                      filterOption={(inputValue, option) => (option?.value || '').toUpperCase().includes(inputValue.toUpperCase())}
                      placeholder="Chọn hoặc nhập sản phẩm..."
                    />
                  ) : (
                    <CustomInfoInput
                      enableTemplate={enableProductSuggest}
                      style={{ flex: 1, minWidth: 150 }}
                      value={record.product_name || (prodObj ? prodObj.name : undefined)}
                      onChange={(v) => {
                        handleLineChange(idx, 'product', null);
                        handleLineChange(idx, 'product_name', v);
                      }}
                      placeholder="Nhập mẫu cửa..."
                    />
                  )}
                  {enableProductImage && (
                    <Upload
                      fileList={[]}
                      showUploadList={false}
                      customRequest={async ({ file, onSuccess, onError }) => {
                        const key = `upload-prod-${idx}`;
                        messageApi.open({ key, type: 'loading', content: 'Đang tải ảnh lên...', duration: 0 });
                        try {
                          const formData = new FormData();
                          formData.append('image', file);
                          const res = await api.postForm('/sales/quotations/upload-item-image/', formData);
                          handleLineChange(idx, 'product_image', res.data.url);
                          messageApi.open({ key, type: 'success', content: 'Đã tải ảnh thành công!', duration: 2 });
                          onSuccess("ok");
                        } catch (e) {
                          const errDetail = e.response?.data?.error || "Vui lòng thử lại";
                          messageApi.open({ key, type: 'error', content: `Tải ảnh thất bại: ${errDetail}`, duration: 3 });
                          onError(e);
                        }
                      }}
                    >
                      <Button icon={<CameraOutlined />} size="small" type="dashed" title="Tải ảnh lên" />
                    </Upload>
                  )}
                </div>
                {(val || record.product_name) && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', gap: 6 }}>
                    {enableProductImage && (
                      imgUrl ? (
                        <img src={imgUrl} alt="product" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }} />
                      ) : (
                        <div style={{ width: 80, height: 80, background: '#e2e8f0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#64748b' }}>Không có ảnh</div>
                      )
                    )}
                    {enableProductName && (
                      <Text strong style={{ fontSize: 13, textAlign: 'left', color: '#0f172a', lineHeight: 1.3 }}>
                        {record.product_name || (prodObj ? prodObj.name : '')}
                      </Text>
                    )}
                    {enableProductDescription && (
                      !record.product ? (
                        <TextArea 
                          size="small"
                          placeholder="Mô tả sản phẩm (tùy chọn)..."
                          autoSize={{ minRows: 1, maxRows: 3 }}
                          value={record.spec || ''}
                          onChange={(e) => handleLineChange(idx, 'spec', e.target.value)}
                          style={{ fontSize: 11.5, textAlign: 'left', marginTop: 4 }}
                        />
                      ) : (
                        (record.spec || (prodObj && prodObj.description)) && (
                          <div style={{ fontSize: 11.5, color: '#475569', textAlign: 'left', lineHeight: 1.4, fontStyle: 'italic', whiteSpace: 'pre-wrap', marginTop: 4, display: 'inline-block', maxWidth: '100%' }}>
                            {record.spec || (prodObj && prodObj.description)}
                          </div>
                        )
                      )
                    )}
                    {(productBlock?.props?.actionButtons || [
                      { id: 'btn_add_dim', label: 'Thêm kích thước', mergeColumns: [] },
                      { id: 'btn_add_merged', label: 'Thêm gộp ô chờ', mergeColumns: ['height', 'width', 'thickness'] }
                    ]).map((btn, bidx) => (
                      <Button
                        key={btn.id || bidx}
                        type="dashed" size="small" icon={<PlusOutlined />}
                        onClick={() => handleAddSameProduct(idx, btn)}
                        style={{ marginTop: 4, borderColor: btn.mergeColumns?.length ? '#059669' : '#2563eb', color: btn.mergeColumns?.length ? '#059669' : '#2563eb', width: '100%' }}
                        title={btn.mergeColumns?.length ? "Thêm dòng phụ và gộp ô" : "Thêm dòng phụ"}
                      >
                        {btn.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ),
            props: { rowSpan },
          }
        },
      },
    ]

    if (tmplCode === 'CURTAIN') {
      baseCols.push(
        {
          title: 'Rộng (m)',
          dataIndex: 'width',
          width: 90,
          render: (val, record, idx) => <InputNumber min={0} step={0.1} style={{ width: '100%' }} value={val} onChange={(v) => handleLineChange(idx, 'width', v)} />,
        },
        {
          title: 'Cao (m)',
          dataIndex: 'height',
          width: 90,
          render: (val, record, idx) => <InputNumber min={0} step={0.1} style={{ width: '100%' }} value={val} onChange={(v) => handleLineChange(idx, 'height', v)} />,
        },
        {
          title: 'D.Tích (m²)',
          dataIndex: 'area',
          width: 90,
          render: (val, record, idx) => <InputNumber min={0} step={0.1} style={{ width: '100%' }} value={val} onChange={(v) => handleLineChange(idx, 'area', v)} />,
        }
      )
    } else if (tmplCode === 'GLASS_ALUMINUM') {
      baseCols.push(
        {
          title: 'Rộng (m)',
          dataIndex: 'width',
          width: 80,
          render: (val, record, idx) => <InputNumber min={0} step={0.1} style={{ width: '100%' }} value={val} onChange={(v) => handleLineChange(idx, 'width', v)} />,
        },
        {
          title: 'Cao (m)',
          dataIndex: 'height',
          width: 80,
          render: (val, record, idx) => <InputNumber min={0} step={0.1} style={{ width: '100%' }} value={val} onChange={(v) => handleLineChange(idx, 'height', v)} />,
        },
        {
          title: 'Quy cách / Hệ nhôm',
          dataIndex: 'spec',
          width: 160,
          render: (val, record, idx) => <CustomInfoInput templateKey="spec" placeholder="Hệ 55, kính 10mm..." value={val || ''} onChange={(v) => handleLineChange(idx, 'spec', v)} />,
        },
        {
          title: 'Bảo hành',
          dataIndex: 'warranty',
          width: 100,
          render: (val, record, idx) => <CustomInfoInput templateKey="warranty" placeholder="5 năm..." value={val || ''} onChange={(v) => handleLineChange(idx, 'warranty', v)} />,
        }
      )
    } else if (tmplCode === 'SERVICES') {
      baseCols.push(
        {
          title: 'Phạm vi / Mô tả chi tiết',
          dataIndex: 'spec',
          width: 200,
          render: (val, record, idx) => <CustomInfoInput templateKey="spec" placeholder="Chi tiết phạm vi công việc..." value={val || ''} onChange={(v) => handleLineChange(idx, 'spec', v)} />,
        },
        {
          title: 'Thời gian bảo hành / duy trì',
          dataIndex: 'warranty',
          width: 140,
          render: (val, record, idx) => <CustomInfoInput templateKey="warranty" placeholder="12 tháng / 1 năm..." value={val || ''} onChange={(v) => handleLineChange(idx, 'warranty', v)} />,
        }
      )
    } else if (tmplCode === 'PRINTING') {
      baseCols.push(
        {
          title: 'Dài (cm)',
          dataIndex: 'length',
          width: 80,
          render: (val, record, idx) => <InputNumber min={0} style={{ width: '100%' }} value={val} onChange={(v) => handleLineChange(idx, 'length', v)} />,
        },
        {
          title: 'Rộng (cm)',
          dataIndex: 'width',
          width: 80,
          render: (val, record, idx) => <InputNumber min={0} style={{ width: '100%' }} value={val} onChange={(v) => handleLineChange(idx, 'width', v)} />,
        },
        {
          title: 'Cao (cm)',
          dataIndex: 'height',
          width: 80,
          render: (val, record, idx) => <InputNumber min={0} style={{ width: '100%' }} value={val} onChange={(v) => handleLineChange(idx, 'height', v)} />,
        },
        {
          title: 'Chất liệu / Quy cách',
          dataIndex: 'spec',
          width: 150,
          render: (val, record, idx) => <CustomInfoInput templateKey="spec" placeholder="Giấy C250, cán mờ..." value={val || ''} onChange={(v) => handleLineChange(idx, 'spec', v)} />,
        }
      )
    } else {
      baseCols.push(
        {
          title: 'Kích thước / Ghi chú',
          dataIndex: 'note',
          width: 200,
          render: (val, record, idx) => {
            if (hasNoteCategoryFilter) {
              return (
                <AutoComplete
                  style={{ width: '100%' }}
                  placeholder="VD: 800×2000mm, màu vân gỗ..."
                  value={val || ''}
                  onChange={(v) => {
                    handleLineChange(idx, 'note', v);
                    const matched = products.find(p => p.name === v);
                    if (matched) {
                      const cd = record.custom_data || {};
                      const updatedCd = assignProductImage(matched, cd, 'note');
                      handleLineChange(idx, 'custom_data', updatedCd);
                    }
                  }}
                  options={groupProducts(products.filter(p => noteAllowedCategories.includes(p.category_name)), false)}
                  filterOption={(inputValue, option) => (option?.value || '').toUpperCase().includes(inputValue.toUpperCase())}
                />
              );
            }
            return (
              <CustomInfoInput templateKey="note"
                placeholder="VD: 800×2000mm, màu vân gỗ, lắp đặt kèm..."
                value={val || ''}
                onChange={(v) => handleLineChange(idx, 'note', v)}
                enableTemplate={noteColCfg?.enableTemplate !== false}
              />
            );
          },
        },
        {
          title: 'ĐVT',
          dataIndex: 'unit',
          width: 75,
          align: 'center',
          render: (val, record, idx) => (
            <Input
              style={{ textAlign: 'center' }}
              value={val ?? record.custom_data?.unit ?? 'cái'}
              onChange={(e) => handleLineChange(idx, 'unit', e.target.value)}
            />
          ),
        }
      )
    }
    } // End of else block for non-landscape

    // --- Inject Custom Columns from Template ---
    const productTableBlock = et?.layout_config?.blocks?.find(b => b.type === 'product_table');
    const customColumns = (productTableBlock?.props?.columns || []).filter(col => typeof col === 'object' && (col.id.startsWith('custom_') || col.id.startsWith('group_')));

    const renderCustomCell = (colDef, val, record, idx) => {
      if (colDef.allowedCategories && colDef.allowedCategories.length > 0) {
        const filteredProducts = products.filter(p => colDef.allowedCategories.includes(p.category_name));
        const options = groupProducts(filteredProducts, false);
        return (
          <AutoComplete
            options={options}
            style={{ width: '100%', minWidth: 100 }}
            value={record.custom_data?.[colDef.id] || ''}
            onChange={(v) => {
              const newData = { ...(record.custom_data || {}) };
              newData[colDef.id] = v;
              const matched = products.find(p => p.name === v);
              const finalData = matched ? assignProductImage(matched, newData, colDef.id) : newData;
              handleLineChange(idx, 'custom_data', finalData);
            }}
            placeholder={`Chọn ${colDef.title.toLowerCase()}...`}
            filterOption={(inputValue, option) =>
              (option.value || '').toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
            }
          />
        );
      }
      return (
        <CustomInfoInput 
          placeholder={`Nhập ${colDef.title.toLowerCase()}...`}
          value={record.custom_data?.[colDef.id] || ''} 
          onChange={(v) => {
            const newData = { ...(record.custom_data || {}) };
            newData[colDef.id] = v;
            handleLineChange(idx, 'custom_data', newData);
          }} 
          enableTemplate={colDef.enableTemplate !== false}
        />
      );
    };

    if (customColumns.length > 0) {
      customColumns.forEach(col => {
        if (col.id.startsWith('group_') && col.children && col.children.length > 0) {
          baseCols.push({
            title: col.title,
            children: col.children.map(child => ({
              title: child.title,
              dataIndex: child.id,
              width: 100,
              render: (val, record, idx) => renderCustomCell(child, val, record, idx),
            }))
          });
        } else if (col.id.startsWith('custom_')) {
          baseCols.push({
            title: col.title,
            dataIndex: col.id,
            width: 140,
            render: (val, record, idx) => renderCustomCell(col, val, record, idx),
          });
        }
      });
    }

    if (!isLandscape) {
      baseCols.push(
      {
        title: 'SL',
        dataIndex: 'quantity',
        width: 70,
        render: (val, record, idx) => <InputNumber style={{ width: '100%' }} value={val} onChange={(v) => handleLineChange(idx, 'quantity', v)} />,
      },
      {
        title: 'Đơn giá (VNĐ)',
        dataIndex: 'unit_price',
        width: 130,
        render: (val, record, idx) => <InputNumber min={0} step={1000} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(v) => v.replace(/\$\s?|(,*)/g, '')} value={val} onChange={(v) => handleLineChange(idx, 'unit_price', v)} />,
      },
      {
        title: 'CK(%)',
        dataIndex: 'discount_percent',
        width: 70,
        render: (val, record, idx) => <InputNumber min={0} max={100} style={{ width: '100%' }} value={val} onChange={(v) => handleLineChange(idx, 'discount_percent', v)} />,
      },
      {
        title: 'Thành tiền',
        key: 'total',
        width: 130,
        align: 'right',
        render: (_, record) => {
          const total = computeLineTotal(record)
          return <Text strong style={{ color: '#16a34a' }}>{total !== null ? `${total.toLocaleString('vi-VN')} đ` : ''}</Text>
        },
      },
      {
        title: '',
        key: 'action',
        width: 50,
        render: (_, __, idx) => formItems.length > 1 ? (
          <Tooltip title="Xoá dòng"><Button type="text" danger shape="circle" icon={<DeleteOutlined />} onClick={() => handleRemoveLine(idx)} /></Tooltip>
        ) : null,
      }
      )
    }

    // --- Sort columns based on Template config ---
    const tmplCols = (productTableBlock?.props?.columns || []).map(c => typeof c === 'object' ? c.id : c);
    
    const getColId = (col) => {
       if (col.key === 'stt') return 'stt';
       if (col.key === 'product' || col.dataIndex === 'product') return 'name';
       if (col.key === 'dimensions' || col.title === 'KÍCH THƯỚC Ô CHỜ (mm)') return 'dimensions';
       if (col.dataIndex === 'symbol') return 'symbol';
       if (col.dataIndex === 'note') return 'note';
       if (col.dataIndex === 'quantity') return 'qty';
       if (col.dataIndex === 'unit') return 'unit';
       if (col.dataIndex === 'unit_price') return 'price';
       if (col.key === 'total') return 'total';
       if (col.key === 'action') return 'action';
       return col.dataIndex || col.key || col.id;
    };

    baseCols.sort((a, b) => {
       const idA = getColId(a);
       const idB = getColId(b);
       
       if (idA === 'action') return 1;
       if (idB === 'action') return -1;
       
       const idxA = tmplCols.indexOf(idA);
       const idxB = tmplCols.indexOf(idB);
       
       if (idxA === -1 && idxB === -1) return 0;
       if (idxA === -1) return 1;
       if (idxB === -1) return -1;
       
       return idxA - idxB;
    });

    const getMergeProps = (colId, record) => {
      const merges = record?.custom_data?.merge_columns;
      const hasMerges = merges && Array.isArray(merges) && merges.length > 1;
      
      if (hasMerges) {
        const idx = merges.indexOf(colId);
        if (idx === 0) return { colSpan: merges.length, isMergedRoot: true };
        if (idx > 0) return { colSpan: 0, isMergedRoot: false };
      }
      
      if (record?.custom_data?.is_custom_size && !hasMerges) {
        const dimIds = dimensionFields.map(f => f.id);
        const idx = dimIds.indexOf(colId);
        if (idx === 0) return { colSpan: dimIds.length, isMergedRoot: true };
        if (idx > 0) return { colSpan: 0, isMergedRoot: false };
      }
      return { colSpan: 1, isMergedRoot: false };
    };

    const getColConfig = (colId) => {
      let found = null;
      for (const c of (productBlock?.props?.columns || [])) {
        if (typeof c === 'object') {
          if (c.id === colId) { found = c; break; }
          if (c.children && Array.isArray(c.children)) {
            const child = c.children.find(ch => ch.id === colId);
            if (child) { found = child; break; }
          }
        } else if (c === colId) {
          found = { id: c };
          break;
        }
      }
      return found || {};
    };

    const applyColFeatures = (cols) => {
      return cols.map(col => {
        const colId = getColId(col);
        const colCfg = getColConfig(colId);
        let finalTitle = col.title;
        if (colCfg && colCfg.title) {
          finalTitle = colCfg.title;
        }

        if (col.children) {
          return { ...col, title: finalTitle, children: applyColFeatures(col.children) };
        }
        const origRender = col.render;
        if (!origRender) return { ...col, title: finalTitle };
        
        return {
          ...col,
          title: finalTitle,
          render: (val, record, idx) => {
            const { colSpan, isMergedRoot } = getMergeProps(colId, record);
            if (colSpan === 0) return { props: { colSpan: 0 } };
            
            let innerChildren;
            let finalProps = { colSpan };
            
            if (isMergedRoot) {
              const dimParentCfg = getColConfig('dimensions');
              if (dimParentCfg?.allowedCategories && dimParentCfg.allowedCategories.length > 0) {
                const filteredProducts = products.filter(p => dimParentCfg.allowedCategories.includes(p.category_name));
                const options = groupProducts(filteredProducts, false);
                innerChildren = (
                  <AutoComplete
                    options={options}
                    style={{ width: '100%', minWidth: 100 }}
                    value={record.custom_data?.custom_size_text || ''}
                    onChange={(val) => {
                      const currentData = record.custom_data || {};
                      const matched = products.find(p => p.name === val);
                      let updates = { custom_size_text: val, actual_product_id: matched ? matched.id : null };
                      
                      let finalData = { ...currentData, ...updates };
                      if (matched) {
                        finalData = assignProductImage(matched, finalData, 'dimensions');
                      }
                      
                      handleLineChange(idx, 'custom_data', finalData);
                      
                      if (matched) {
                        handleLineChange(idx, 'unit', matched.unit || 'cái');
                        handleLineChange(idx, 'unit_price', Number(matched.price || matched.cost_price || 0));
                        if (!record.quantity || record.quantity === 0) {
                          handleLineChange(idx, 'quantity', 1);
                        }
                      }
                    }}
                    placeholder="Chọn thông tin..."
                    filterOption={(inputValue, option) => (option.value || '').toUpperCase().includes(inputValue.toUpperCase())}
                  />
                );
              } else {
                innerChildren = <CustomInfoInput templateKey="custom_size" enableTemplate={colCfg?.enableTemplate !== false} placeholder="Thêm thông tin..." value={record.custom_data?.custom_size_text || ''} onChange={(val) => {
                  const currentData = record.custom_data || {};
                  const matched = products.find(p => p.name === val);
                  
                  let finalData = { ...currentData, custom_size_text: val, actual_product_id: matched ? matched.id : null };
                  if (matched) {
                    finalData = assignProductImage(matched, finalData, 'dimensions');
                  }
                  
                  handleLineChange(idx, 'custom_data', finalData);
                  
                  if (matched) {
                    handleLineChange(idx, 'unit', matched.unit || 'cái');
                    handleLineChange(idx, 'unit_price', Number(matched.price || matched.cost_price || 0));
                    if (!record.quantity || record.quantity === 0) {
                      handleLineChange(idx, 'quantity', 1);
                    }
                  }
                }} />;
              }
            } else {
              const origResult = origRender(val, record, idx);
              innerChildren = origResult;
              
              if (origResult && typeof origResult === 'object' && origResult.children !== undefined) {
                innerChildren = origResult.children;
                finalProps = { ...origResult.props, colSpan: (origResult.props?.colSpan !== undefined && origResult.props?.colSpan !== 1) ? origResult.props.colSpan : colSpan };
              }
  
              if (React.isValidElement(innerChildren) && innerChildren.type === CustomInfoInput) {
                innerChildren = React.cloneElement(innerChildren, { enableTemplate: colCfg?.enableTemplate !== false });
              }
            }

            const canUpload = colCfg.allowImageUpload === true;
            
            if (canUpload && colId !== 'action' && colId !== 'name' && colId !== 'note') {
              const imgKey = `img_${colId}`;
              const imgUrl = record.custom_data?.[imgKey];
              
              innerChildren = (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {imgUrl && (
                    <div style={{ position: 'relative', flexShrink: 0, width: 32, height: 32 }}>
                      <Image src={imgUrl} alt="uploaded" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid #cbd5e1' }} />
                      <CloseCircleOutlined 
                        style={{ position: 'absolute', top: -6, right: -6, color: '#ef4444', cursor: 'pointer', background: '#fff', borderRadius: '50%', fontSize: 12 }} 
                        onClick={(e) => {
                          e.stopPropagation();
                          const cd = record.custom_data || {};
                          handleLineChange(idx, 'custom_data', { ...cd, [imgKey]: null });
                        }} 
                      />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>{innerChildren}</div>
                  <Upload
                    fileList={[]}
                    showUploadList={false}
                    customRequest={async ({ file, onSuccess, onError }) => {
                      const key = `upload-img-${idx}-${colId}`;
                      messageApi.open({ key, type: 'loading', content: 'Đang tải ảnh lên...', duration: 0 });
                      try {
                        const formData = new FormData();
                        formData.append('image', file);
                        const res = await api.postForm('/sales/quotations/upload-item-image/', formData);
                        const currentData = record.custom_data || {};
                        handleLineChange(idx, 'custom_data', { ...currentData, [imgKey]: res.data.url });
                        messageApi.open({ key, type: 'success', content: 'Đã tải ảnh thành công!', duration: 2 });
                        onSuccess("ok");
                      } catch (e) {
                        messageApi.open({ key, type: 'error', content: 'Tải ảnh thất bại', duration: 3 });
                        onError(e);
                      }
                    }}
                  >
                    <Button icon={<CameraOutlined />} size="small" type={imgUrl ? "primary" : "dashed"} title="Tải ảnh đính kèm" />
                  </Upload>
                </div>
              );
            }
            
            return {
              children: innerChildren,
              props: finalProps
            };
          }
        };
      });
    };

    return applyColFeatures(baseCols);
  };

  const getServiceItemColumns = () => {
    const effectiveTmpl = getEffectiveTemplate(editingOrder)
    const tmplCode = effectiveTmpl?.code || 'STANDARD'
    const isLandscape = tmplCode === 'production_landscape_a4' || effectiveTmpl?.layout_config?.paper_orientation === 'landscape'

    const serviceBlock = effectiveTmpl?.layout_config?.blocks?.find(b => b.type === 'service_table');
    const enableServiceImage = serviceBlock?.props?.enableProductImage !== false;

    let baseCols = [
      {
        title: '',
        key: 'sort',
        width: 40,
        align: 'center',
        render: () => <DragHandle />,
      },
      {
        title: 'STT',
        key: 'stt',
        width: 60,
        align: 'center',
        render: (_, __, idx) => idx + 1,
      },
      {
        title: 'TÊN DỊCH VỤ / CHI PHÍ',
        dataIndex: 'product_name',
        key: 'product_name',
        width: 250,
        render: (text, record, index) => (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
            {enableServiceImage && record.product_image && (
              <Image width={32} height={32} style={{ borderRadius: 4, objectFit: 'cover' }} src={record.product_image} />
            )}
            <AutoComplete
              style={{ flex: 1, minWidth: 150 }}
              value={text}
              onChange={(val) => handleServiceLineChange(index, 'product_name', val)}
              options={groupProducts(products.filter(p => p.product_type === 'service'))}
              filterOption={(inputValue, option) => (option?.value || '').toUpperCase().includes(inputValue.toUpperCase())}
              placeholder="Chọn hoặc nhập tên dịch vụ"
            />
            {enableServiceImage && (
              <Upload
                fileList={[]}
                showUploadList={false}
                customRequest={async ({ file, onSuccess, onError }) => {
                  try {
                    const formData = new FormData();
                    formData.append('image', file);
                    const res = await api.postForm('/sales/quotations/upload-item-image/', formData);
                    handleServiceLineChange(index, 'product_image', res.data.url);
                    messageApi.success("Đã tải ảnh thành công!");
                    onSuccess("ok");
                  } catch (e) {
                    const errDetail = e.response?.data?.error || "Vui lòng thử lại";
                    messageApi.error(`Tải ảnh thất bại: ${errDetail}`);
                    onError(e);
                  }
                }}
              >
                <Button icon={<CameraOutlined />} size="small" type="dashed" title="Tải ảnh lên" />
              </Upload>
            )}
          </div>
        ),
      }
    ]

    if (isLandscape) {
      baseCols.push(
        {
          title: 'KÝ HIỆU',
          dataIndex: 'symbol',
          width: 100,
          align: 'center',
          render: (val, record, idx) => <CustomInfoInput templateKey="symbol" style={{ textAlign: 'center', fontWeight: 600, color: '#2563eb' }} placeholder="VD: D1.1" value={record.symbol || ''} onChange={(v) => handleServiceLineChange(idx, 'symbol', v)} />,
        },
        {
          title: 'GHI CHÚ KỸ THUẬT',
          dataIndex: 'note',
          width: 170,
          render: (val, record, idx) => <CustomInfoInput templateKey="note" placeholder="Chi tiết..." value={val || ''} onChange={(v) => handleServiceLineChange(idx, 'note', v)} />,
        },
        {
          title: 'SL',
          dataIndex: 'quantity',
          width: 70,
          align: 'center',
          render: (val, record, idx) => <InputNumber style={{ width: '100%', textAlign: 'center' }} value={val} onChange={(v) => handleServiceLineChange(idx, 'quantity', v)} />,
        },
        {
          title: 'ĐVT',
          dataIndex: 'unit',
          width: 70,
          align: 'center',
          render: (val, record, idx) => <Input style={{ textAlign: 'center' }} value={val ?? 'lần'} onChange={(e) => handleServiceLineChange(idx, 'unit', e.target.value)} />,
        }
      )
    } else {
      baseCols.push(
        {
          title: 'GHI CHÚ',
          dataIndex: 'note',
          width: 170,
          render: (val, record, idx) => <CustomInfoInput templateKey="note" placeholder="Chi tiết..." value={val || ''} onChange={(v) => handleServiceLineChange(idx, 'note', v)} />,
        },
        {
          title: 'ĐVT',
          dataIndex: 'unit',
          width: 70,
          align: 'center',
          render: (val, record, idx) => <Input style={{ textAlign: 'center' }} value={val ?? 'lần'} onChange={(e) => handleServiceLineChange(idx, 'unit', e.target.value)} />,
        },
        {
          title: 'SL',
          dataIndex: 'quantity',
          width: 70,
          align: 'center',
          render: (val, record, idx) => <InputNumber style={{ width: '100%', textAlign: 'center' }} value={val} onChange={(v) => handleServiceLineChange(idx, 'quantity', v)} />,
        }
      )
    }

    baseCols.push(
      {
        title: 'ĐƠN GIÁ',
        dataIndex: 'unit_price',
        width: 130,
        align: 'right',
        render: (val, record, idx) => <InputNumber min={0} step={1000} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(v) => v.replace(/\$\s?|(,*)/g, '')} value={val} onChange={(v) => handleServiceLineChange(idx, 'unit_price', v)} />,
      }
    )

    if (!isLandscape) {
      baseCols.push(
        {
          title: 'CK (%)',
          dataIndex: 'discount_percent',
          width: 75,
          align: 'center',
          render: (val, record, idx) => <InputNumber min={0} max={100} style={{ width: '100%', textAlign: 'center' }} value={val} onChange={(v) => handleServiceLineChange(idx, 'discount_percent', v)} />,
        }
      )
    }

    baseCols.push(
      {
        title: 'TỔNG TIỀN',
        key: 'total',
        width: 130,
        align: 'right',
        render: (_, record) => {
          const total = computeServiceLineTotal(record)
          return <Text strong style={{ color: '#16a34a', fontSize: 14 }}>{total.toLocaleString('vi-VN')} đ</Text>
        },
      },
      {
        title: '',
        key: 'action',
        width: 50,
        align: 'center',
        render: (_, __, index) => (
          <Tooltip title="Xoá dòng"><Button type="text" danger shape="circle" icon={<DeleteOutlined />} onClick={() => handleRemoveServiceLine(index)} /></Tooltip>
        ),
      }
    )

    const getColId = (col) => col.key || col.dataIndex;
    const getColConfig = (colId) => {
      let found = null;
      for (const c of (serviceBlock?.props?.columns || [])) {
        if (typeof c === 'object') {
          if (c.id === colId) { found = c; break; }
        } else if (c === colId) {
          found = { id: c }; break;
        }
      }
      return found || {};
    };

    const applyServiceColFeatures = (cols) => {
      return cols.map(col => {
        const colId = getColId(col);
        const colCfg = getColConfig(colId);
        let finalTitle = col.title;
        if (colCfg && colCfg.title) {
          finalTitle = colCfg.title;
        }

        const origRender = col.render;
        return { 
          ...col, 
          title: finalTitle,
          render: origRender ? (val, record, idx) => {
            const origResult = origRender(val, record, idx);
            if (React.isValidElement(origResult) && origResult.type === CustomInfoInput) {
              return React.cloneElement(origResult, { enableTemplate: colCfg?.enableTemplate !== false });
            }
            return origResult;
          } : undefined
        };
      });
    };

    return applyServiceColFeatures(baseCols)
  }

  const handleAddServiceLine = () => {
    setServiceItems((prev) => [
      ...prev,
      { key: Date.now(), product: null, product_name: '', quantity: 1, unit_price: 0, discount_percent: 0, note: '', product_image: '' },
    ])
  }

  const handleRemoveServiceLine = (index) => {
    setServiceItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleServiceLineChange = (index, field, value) => {
    setServiceItems((prev) => {
      const updated = [...prev]
      const currentItem = { ...updated[index], [field]: value }
      if (field === 'product_name') {
        const prod = products.find((p) => p.name === value && p.product_type === 'service')
        if (prod) {
          currentItem.product = prod.id
          currentItem.unit_price = Number(prod.price || prod.cost_price || 0)
          currentItem.unit = prod.unit || 'lần'
        } else {
          currentItem.product = null
        }
      }
      updated[index] = currentItem
      return updated
    })
  }

  const calculateModalTotal = () => {
    let subtotal = 0
    const effTmpl = getEffectiveTemplate(editingOrder)
    formItems.forEach((item) => {
      subtotal += computeLineTotal(item, effTmpl) || 0
    })
    serviceItems.forEach((item) => {
      subtotal += computeServiceLineTotal(item)
    })
    return subtotal
  }

  // ── Open Modal ────────────────────────────────────────────────────────
  const openModal = (order = null) => {
    if (checkMaintenance()) return
    setEditingOrder(order)
    if (order) {
      form.setFieldsValue({
        customer: order.customer,
        status: order.status,
        installation_date: order.installation_date ? dayjs(order.installation_date) : null,
        notes: order.notes,
        discount_total: Number(order.discount_total || 0),
        shipping_fee: Number(order.shipping_fee || 0),
        installation_fee: Number(order.installation_fee || 0),
        delivery_time: order.delivery_time || '3-5 ngày làm việc',
        warranty_months: order.warranty_months !== undefined ? order.warranty_months : 12,
        validity_days: order.validity_days || 30,
        payment_terms_schedule: order.payment_terms_schedule && order.payment_terms_schedule.length > 0 
          ? order.payment_terms_schedule 
          : [{ title: 'Thanh toán đợt 1', percentage: 100, type: 'deposit' }],
        vat_rate: Number(order.vat_rate || 0),
        payment_target: order.payment_target || undefined,
      })
      if (order.items && order.items.length > 0) {
        // Sort items by id to ensure they are displayed in the exact order they were inserted
        const sortedItems = [...order.items].sort((a, b) => a.id - b.id)
        const mainItems = sortedItems.filter(it => it.item_type !== 'service')
        const srvItems = sortedItems.filter(it => it.item_type === 'service')

        if (mainItems.length > 0) {
          setFormItems(
            mainItems.map((it, idx) => ({
              key: it.id || idx,
              id: it.id,
              product: it.product,
              width: Math.round(Number(it.width || 0)),
              height: Math.round(Number(it.height || 0)),
              length: Math.round(Number(it.length || 0)),
              thickness: Math.round(Number(it.thickness || it.custom_data?.thickness || 0)),
              area: Number(it.area || 0),
              spec: it.spec || '',
              warranty: it.warranty || '12 tháng',
              quantity: Number(it.quantity || 1),
              unit_price: Number(it.unit_price || 0),
              discount_percent: Number(it.discount_percent || 0),
              note: it.note || '',
              product_image: it.product_image || (products.find(p => p.id === it.product)?.image_url || products.find(p => p.id === it.product)?.image) || '',
              unit: it.custom_data?.unit || (products.find(p => p.id === it.product)?.unit || 'cái'),
              symbol: it.custom_data?.symbol || it.symbol || '',
              custom_data: it.custom_data || {},
              product_name: it.product_name || (products.find(p => p.id === it.product)?.name || ''),
            }))
          )
        } else {
          setFormItems([{ key: Date.now(), product: null, width: 0, height: 0, length: 0, thickness: 0, area: 0, spec: '', warranty: '12 tháng', quantity: 1, unit_price: 0, discount_percent: 0, note: '', product_image: '', unit: 'cái' }])
        }

        if (srvItems.length > 0) {
          setServiceItems(
            srvItems.map((it, idx) => ({
              key: it.id || `srv-${idx}`,
              id: it.id,
              product: it.product,
              product_name: it.product_name || '',
              unit_price: Number(it.unit_price || 0),
              quantity: Number(it.quantity || 1),
              discount_percent: Number(it.discount_percent || 0),
              note: it.note || '',
              product_image: it.product_image || '',
            }))
          )
        } else {
          setServiceItems([])
        }
      } else {
        setFormItems([
          { key: Date.now(), product: null, width: 0, height: 0, length: 0, thickness: 0, area: 0, spec: '', warranty: '12 tháng', quantity: 1, unit_price: 0, discount_percent: 0, note: '', product_image: '', unit: 'cái' },
        ])
        setServiceItems([])
      }
    } else {
      form.resetFields()
      const defaultTerms = companySettings?.default_quotation_terms || companyTemplate?.company_default_terms || companyTemplate?.footer_content || ''
      form.setFieldsValue({ status: 'pending', discount_total: 0,
        shipping_fee: 0,
        installation_fee: 0,
        delivery_time: '3-5 ngày làm việc',
        warranty_months: 12,
        validity_days: 30,
        notes: defaultTerms,
        payment_terms_schedule: [{ title: 'Thanh toán đợt 1', percentage: 100, type: 'deposit' }],
        vat_rate: 0 })
      setFormItems([
        { key: Date.now(), product: null, width: 0, height: 0, length: 0, thickness: 0, area: 0, spec: '', warranty: '12 tháng', quantity: 1, unit_price: 0, discount_percent: 0, note: '', product_image: '', unit: 'cái' },
      ])
      setServiceItems([])
    }
    setModalVisible(true)
  }

  // ── Submit Form (Create / Edit) ───────────────────────────────────────
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const validItems = formItems.filter((it) => it.product || it.product_name)
      const validServiceItems = serviceItems.filter((it) => it.product_name)
      if (validItems.length === 0 && validServiceItems.length === 0) {
        messageApi.error('Vui lòng chọn ít nhất 1 sản phẩm hoặc 1 dịch vụ/chi phí cho đơn hàng.')
        setSubmitting(false)
        return
      }

      const pt = values.payment_terms_schedule || []
      const totalPercentage = pt.reduce((sum, item) => sum + Number(item.percentage || 0), 0)
      if (pt.length > 0 && Math.abs(totalPercentage - 100) > 0.01) {
        messageApi.error('Tổng % của các đợt thanh toán phải bằng đúng 100%.')
        setSubmitting(false)
        return
      }

      const subtotal = calculateModalTotal()
      const vatAmount = (subtotal * Number(values.vat_rate || 0)) / 100.0
      const totalAmt = subtotal + vatAmount + Number(values.shipping_fee || 0) + Number(values.installation_fee || 0) - Number(values.discount_total || 0)

      const effectiveTmpl = getEffectiveTemplate(editingOrder)
      const templateSnapshot = effectiveTmpl ? {
        id: effectiveTmpl.id,
        code: effectiveTmpl.code,
        name: effectiveTmpl.name,
        layout_config: effectiveTmpl.layout_config,
        layout_style: effectiveTmpl.layout_style,
        footer_content: effectiveTmpl.footer_content,
      } : null

      const payload = {
        customer: values.customer,
        status: values.status,
        installation_date: values.installation_date ? values.installation_date.format('YYYY-MM-DD') : null,
        notes: values.notes || '',
        shipping_fee: Number(values.shipping_fee || 0),
        installation_fee: Number(values.installation_fee) || 0,
        delivery_time: values.delivery_time || '',
        warranty_months: Number(values.warranty_months) || 12,
        validity_days: Number(values.validity_days) || 30,
        payment_terms_schedule: values.payment_terms_schedule || [],
        subtotal: subtotal,
        vat_rate: Number(values.vat_rate || 0),
        vat_amount: vatAmount,
        discount_total: Number(values.discount_total || 0),
        total_amount: Math.max(0, totalAmt),
        custom_data: {
          ...(editingOrder?.custom_data || {}),
          ...(templateSnapshot ? { template_snapshot: templateSnapshot } : {}),
        },
        payment_target: values.payment_target || null,
      }

      let orderId
      if (editingOrder) {
        const res = await api.patch(`/orders/orders/${editingOrder.id}/`, payload)
        orderId = res.data.id
        messageApi.success('Cập nhật đơn hàng thành công!')
      } else {
        const res = await api.post('/orders/orders/', payload)
        orderId = res.data.id
        messageApi.success('Tạo đơn hàng mới thành công!')
      }

      if (editingOrder && editingOrder.items) {
        await Promise.all(
          editingOrder.items.map((it) => api.delete(`/orders/order-items/${it.id}/`).catch(() => {}))
        )
      }

      for (const it of validItems) {
        const prodObj = products.find((p) => p.id === it.product)
        await api.post('/orders/order-items/', {
          order: orderId,
          product: it.product,
          product_name: it.product_name || (prodObj ? prodObj.name : 'Sản phẩm'),
          unit_price: Number(it.unit_price || 0),
          width: Number(it.width || 0),
          height: Number(it.height || 0),
          length: Number(it.length || 0),
          thickness: Number(it.thickness || 0),
          area: Number(Number(it.area || 0).toFixed(2)),
          spec: it.spec || (prodObj ? prodObj.description : '') || '',
          warranty: it.warranty || '12 tháng',
          product_image: it.product_image || (prodObj ? (prodObj.image_url || prodObj.image) : '') || '',
          custom_data: {
            ...(it.custom_data || {}),
            unit: it.unit || (prodObj ? prodObj.unit : 'cái'),
            thickness: Math.round(Number(it.thickness || 0)),
            symbol: it.custom_data?.symbol || it.symbol || '',
          },
          quantity: Number(it.quantity || 1),
          discount_percent: Number(it.discount_percent || 0),
          note: it.note || '',
        })
      }

      for (const srv of validServiceItems) {
        let prodId = null
        if (typeof srv.product === 'number') {
          prodId = srv.product
        }
        await api.post('/orders/order-items/', {
          order: orderId,
          product: prodId,
          item_type: 'service',
          product_name: srv.product_name,
          unit_price: Number(srv.unit_price || 0),
          width: 0,
          height: 0,
          length: 0,
          thickness: 0,
          area: 0,
          spec: '',
          warranty: '',
          product_image: srv.product_image || '',
          custom_data: { unit: 'lần' },
          quantity: Number(srv.quantity || 1),
          discount_percent: Number(srv.discount_percent || 0),
          note: srv.note || '',
        })
      }

      setModalVisible(false)
      fetchOrders()
    } catch (error) {
      if (error.errorFields) return
      messageApi.error('Lưu đơn hàng thất bại. Vui lòng thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete Order ──────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (checkMaintenance()) return
    try {
      await api.delete(`/orders/orders/${id}/`)
      messageApi.success('Đã xoá đơn hàng.')
      fetchOrders()
    } catch (err) {
      let msg = 'Không thể xoá đơn hàng này.'
      if (err.response?.data) {
        if (typeof err.response.data === 'string') msg = err.response.data
        else if (err.response.data.detail) msg = err.response.data.detail
        else if (Array.isArray(err.response.data)) msg = err.response.data[0]
        else if (err.response.data.non_field_errors) msg = err.response.data.non_field_errors[0]
      }
      messageApi.error(msg)
    }
  }

  // ── Approve & Reject Order ────────────────────────────────────────────
  const handleApprove = async (id) => {
    if (checkMaintenance()) return
    try {
      await api.post(`/orders/orders/${id}/approve/`)
      messageApi.success('✅ Đã duyệt đơn hàng! Hệ thống đã tự động xuất kho & tạo lệnh sản xuất.')
      fetchOrders()
    } catch (error) {
      const msg = error.response?.data?.detail || 'Không thể duyệt đơn hàng này.'
      messageApi.error(msg)
    }
  }

  const handleReject = async (id) => {
    if (checkMaintenance()) return
    try {
      await api.post(`/orders/orders/${id}/reject/`)
      messageApi.warning('Đã từ chối đơn hàng.')
      fetchOrders()
    } catch (error) {
      const msg = error.response?.data?.detail || 'Không thể từ chối đơn hàng này.'
      messageApi.error(msg)
    }
  }

  const openResubmitModal = async (record) => {
    if (checkMaintenance()) return
    setSelectedOrder(record)
    setResubmitModalVisible(true)
    resubmitForm.resetFields()
    try {
      const res = await api.get('/users/users/')
      const userList = Array.isArray(res.data) ? res.data : (res.data?.results || [])
      const myDeptId = user?.department
      
      const validApprovers = userList.filter(u => {
        if (u.is_company_admin || u.is_superuser) return true
        if (u.permissions && u.permissions.includes('orders.approve')) return true
        
        if (myDeptId && u.managed_department_ids && u.managed_department_ids.includes(myDeptId)) return true
        if (myDeptId && u.department === myDeptId && u.id !== user?.id && u.role_name && u.role_name.toLowerCase().includes('trưởng')) return true
        
        return false
      })
      setResubmitApprovers(validApprovers.length > 0 ? validApprovers : userList.filter(u => u.is_company_admin || u.is_superuser))
    } catch {
      messageApi.error('Lỗi tải danh sách người duyệt đơn hàng.')
    }
  }

  const handleSubmitResubmit = async () => {
    if (checkMaintenance()) return
    try {
      const values = await resubmitForm.validateFields()
      setSubmittingResubmit(true)
      await api.post(`/orders/orders/${selectedOrder.id}/resubmit/`, {
        approver_id: values.approver_id,
        description: values.description
      })
      messageApi.success('Đã trình duyệt lại đơn hàng.')
      setResubmitModalVisible(false)
      fetchOrders()
    } catch (error) {
      if (error.errorFields) return
      const msg = error.response?.data?.detail || 'Không thể trình duyệt lại đơn hàng này.'
      messageApi.error(msg)
    } finally {
      setSubmittingResubmit(false)
    }
  }

  const handleCancelOrder = async (id) => {
    if (checkMaintenance()) return
    try {
      await api.post(`/orders/orders/${id}/cancel/`)
      messageApi.success('Đã hủy đơn hàng thành công.')
      fetchOrders()
    } catch (error) {
      const msg = error.response?.data?.detail || 'Không thể hủy đơn hàng này.'
      messageApi.error(msg)
    }
  }

  // ── Table Columns ─────────────────────────────────────────────────────
  const renderOrderActions = (record) => (
    <Space wrap size={8}>
      {record.status === 'pending' && canApprove && (
        <>
          <Popconfirm
            title="Duyệt đơn hàng?"
            description="Sau khi duyệt, hệ thống sẽ tự động xuất kho và tạo lệnh sản xuất."
            onConfirm={() => handleApprove(record.id)}
            okText="Duyệt đơn"
            cancelText="Hủy"
          >
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              style={{ background: '#16a34a', borderColor: '#16a34a' }}
            >
              Duyệt
            </Button>
          </Popconfirm>

          <Popconfirm
            title="Từ chối đơn hàng?"
            description="Bạn có chắc chắn muốn từ chối đơn hàng này không?"
            onConfirm={() => handleReject(record.id)}
            okText="Từ chối"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<CloseCircleOutlined />}>
              Từ chối
            </Button>
          </Popconfirm>
        </>
      )}

      <Tooltip title="Xem chi tiết & In PDF">
        <Button
          type="text"
          shape="circle"
          icon={<FileTextOutlined style={{ color: '#2563eb' }} />}
          onClick={() => {
            setSelectedOrder(record)
            setDrawerVisible(true)
          }}
        />
      </Tooltip>

      {canEdit && record.status !== 'cancelled' && record.status !== 'completed' && (
        <Tooltip title="Sửa đơn hàng">
          <Button
            type="text"
            shape="circle"
            icon={<EditOutlined style={{ color: '#d97706' }} />}
            onClick={() => openModal(record)}
          />
        </Tooltip>
      )}

      {(canEdit || record.created_by === user?.id) && record.status === 'rejected' && (
        <Tooltip title="Trình duyệt lại">
          <Button 
            type="text" 
            shape="circle" 
            icon={<CheckCircleOutlined style={{ color: '#0284c7' }} />} 
            onClick={(e) => {
              e.stopPropagation()
              openResubmitModal(record)
            }}
          />
        </Tooltip>
      )}

      {canCancel && record.status !== 'cancelled' && record.status !== 'completed' && (
        <Popconfirm
          title="Hủy đơn hàng?"
          description="Bạn có chắc chắn muốn hủy đơn hàng này không? Các lệnh kho và sản xuất liên quan cũng sẽ bị hủy."
          onConfirm={() => handleCancelOrder(record.id)}
          okText="Đồng ý hủy"
          cancelText="Không"
          okButtonProps={{ danger: true }}
        >
          <Tooltip title="Hủy đơn hàng"><Button type="text" shape="circle" icon={<CloseCircleOutlined style={{ color: '#dc2626' }} />} /></Tooltip>
        </Popconfirm>
      )}

      {canDelete && (
        <Popconfirm
          title="Xoá đơn hàng?"
          description="Bạn có chắc chắn muốn xoá đơn hàng này không?"
          onConfirm={() => handleDelete(record.id)}
          okText="Xoá"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
        >
          <Tooltip title="Xoá"><Button type="text" danger shape="circle" icon={<DeleteOutlined />} /></Tooltip>
        </Popconfirm>
      )}
    </Space>
  )

  const columns = [
    {
      title: 'Mã đơn hàng',
      dataIndex: 'order_number',
      key: 'order_number',
      render: (val, record) => (
        <Space>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
            }}
          >
            ĐH
          </div>
          <div>
            <Text
              strong
              style={{ color: '#2563eb', cursor: 'pointer', display: 'block' }}
              onClick={() => {
                setSelectedOrder(record)
                setDrawerVisible(true)
              }}
            >
              {val || `DH-${record.id}`}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {dayjs(record.created_at).format('DD/MM/YYYY')}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Khách hàng',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (val, r) => (
        <div>
          <Text strong style={{ display: 'block' }}>{val || '—'}</Text>
          {r.customer_phone && <Text type="secondary" style={{ fontSize: 12 }}>{r.customer_phone}</Text>}
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st, r) => {
        const cfg = statusConfig[st] || { label: st, color: 'default' }
        return (
          <Space direction="vertical" size={2}>
            <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>
            {r.needs_export_request && ['fully_paid', 'deposit_paid', 'credit_approved'].includes(r.financial_status) && (
              <Tag color="error" style={{ fontSize: 11, cursor: 'pointer' }} onClick={(e) => {
                e.stopPropagation()
                setSelectedOrder(r)
                setDrawerVisible(true)
              }}>
                ⚠️ Chưa có lệnh XK
              </Tag>
            )}
            {r.has_pending_export && (
              <Tag color="error" style={{ fontSize: 11, cursor: 'pointer' }} onClick={(e) => {
                e.stopPropagation()
                setSelectedOrder(r)
                setDrawerVisible(true)
              }}>
                ⚠️ Đang đợi duyệt xuất kho
              </Tag>
            )}
          </Space>
        )
      },
    },
    {
      title: 'Thanh toán & Công nợ',
      key: 'financial_status',
      render: (_, r) => {
        if (!r.financial_status) return '-'
        return (
          <Tag color={r.financial_status === 'fully_paid' ? 'success' : r.financial_status === 'deposit_paid' ? 'processing' : 'warning'} style={{ fontSize: 11 }}>
            {r.has_pending_credit_request 
              ? 'Chờ duyệt kho nợ' 
              : (r.financial_status === 'deposit_paid' && Number(r.paid_amount) > 0 
                  ? `Đã thu ${r.total_amount ? Math.round((Number(r.paid_amount) / Number(r.total_amount)) * 100) : 0}% (${Number(r.paid_amount).toLocaleString()}đ)` 
                  : r.financial_status_display || 'Chờ cọc')}
          </Tag>
        )
      }
    },
    {
      title: 'Đối tượng TT',
      dataIndex: 'payment_target',
      key: 'payment_target',
      render: (val) => val === 'company' ? 'Công ty' : (val === 'personal' ? 'Cá nhân' : '-'),
    },
    {
      title: 'Người tạo / duyệt',
      key: 'people',
      render: (_, r) => (
        <div>
          <div><Text type="secondary" style={{ fontSize: 12 }}>Tạo:</Text> <Tag color="blue">{r.created_by_name || '—'}</Tag></div>
          {r.approved_by_name && (
            <div style={{ marginTop: 2 }}><Text type="secondary" style={{ fontSize: 12 }}>Duyệt:</Text> <Tag color="green">{r.approved_by_name}</Tag></div>
          )}
        </div>
      ),
    },
    {
      title: 'Tổng tiền',
      dataIndex: 'total_amount',
      key: 'total_amount',
      align: 'right',
      render: (val) => (
        <Text strong style={{ color: '#16a34a', fontSize: 15 }}>
          {Number(val || 0).toLocaleString('vi-VN')} đ
        </Text>
      ),
    },
    {
      title: 'Hành động',
      key: 'action',
      align: 'right',
      render: (_, record) => renderOrderActions(record),
    },
  ]

  return (
    <section>
      {contextHolder}

      {/* ── Page Header & Stats ────────────────────────────────────────── */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0, fontWeight: 800 }}>
            <FileDoneOutlined style={{ color: '#10b981', marginRight: 10 }} />
            Quản lý Đơn hàng
          </Title>
          <Text type="secondary">
            Điều phối đơn hàng, xét duyệt tự động kích hoạt xuất kho và phát lệnh sản xuất.
          </Text>
        </Col>
        <Col>
          <Space>
            <Popover 
              placement="bottomRight" 
              title="Tùy chỉnh cột hiển thị" 
              content={
                <Checkbox.Group 
                  options={[
                    { label: 'Mã đơn hàng', value: 'order_number' },
                    { label: 'Khách hàng', value: 'customer_name' },
                    { label: 'Trạng thái', value: 'status' },
                    { label: 'Thanh toán & Công nợ', value: 'financial_status' },
                    { label: 'Đối tượng TT', value: 'payment_target' },
                    { label: 'Người tạo / duyệt', value: 'people' },
                    { label: 'Tổng tiền', value: 'total_amount' },
                    { label: 'Hành động', value: 'action' },
                  ]}
                  value={visibleColumns}
                  onChange={setVisibleColumns}
                  style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                />
              }
              trigger="click"
            >
              <Button size="large" icon={<TableOutlined />} />
            </Popover>
            {canCreate && (
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => openModal()}
                style={{
                  borderRadius: 10,
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                }}
              >
                Tạo Đơn Hàng Mới
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {/* ── Cards Thống Kê (Minimal Premium) ─────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Card 1: Chờ xét duyệt */}
        <Col xs={24} sm={12} md={6}>
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
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#fcd34d'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(245,158,11,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Chờ xét duyệt</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ClockCircleOutlined style={{ color: '#f59e0b', fontSize: 15 }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#b45309', lineHeight: 1, fontFamily: "'Inter', sans-serif" }}>{totalPending}</div>
            </div>
          </div>
        </Col>

        {/* Card 2: Đã duyệt / Đang SX */}
        <Col xs={24} sm={12} md={6}>
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
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Đã duyệt / Đang SX</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileTextOutlined style={{ color: '#3b82f6', fontSize: 15 }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1d4ed8', lineHeight: 1, fontFamily: "'Inter', sans-serif" }}>{totalApproved}</div>
            </div>
          </div>
        </Col>

        {/* Card 3: Hoàn thành */}
        <Col xs={24} sm={12} md={6}>
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
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#86efac'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(34,197,94,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Hoàn thành</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 15 }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#15803d', lineHeight: 1, fontFamily: "'Inter', sans-serif" }}>{totalCompleted}</div>
            </div>
          </div>
        </Col>

        {/* Card 4: Doanh thu ghi nhận */}
        <Col xs={24} sm={12} md={6}>
          <div style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            borderRadius: 12,
            padding: '16px 20px',
            border: '1px solid #334155',
            boxShadow: '0 4px 12px rgba(15,23,42,0.15)',
            display: 'flex',
            flexDirection: 'column',
            transition: 'all 0.2s ease',
            cursor: 'default',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(15,23,42,0.25)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.15)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Doanh thu ghi nhận</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileDoneOutlined style={{ color: '#f59e0b', fontSize: 15 }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: totalRevenue >= 1e9 ? 22 : 26, fontWeight: 700, color: '#fbbf24', lineHeight: 1, fontFamily: "'Inter', sans-serif", letterSpacing: '-0.02em' }}>
                {totalRevenue.toLocaleString('vi-VN')} đ
              </div>
            </div>
          </div>
        </Col>
      </Row>

      {/* ── Search & Filter Bar ────────────────────────────────────────── */}
      <Card
        style={{
          borderRadius: 12,
          marginBottom: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
        bodyStyle={{ padding: 16 }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="Tìm theo mã đơn hàng, tên khách hàng..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ borderRadius: 8 }}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="Tình trạng Đơn hàng"
              value={statusFilter || undefined}
              onChange={(val) => setStatusFilter(val || '')}
              allowClear
              style={{ width: '100%' }}
            >
              <Option value="pending"><Badge status="warning" text="Chờ duyệt" /></Option>
              <Option value="approved"><Badge status="processing" text="Đã được duyệt" /></Option>
              <Option value="rejected"><Badge status="error" text="Đã từ chối" /></Option>
              <Option value="cancelled"><Badge status="default" text="Đã hủy" /></Option>
              <Option value="completed"><Badge status="success" text="Hoàn thành" /></Option>
            </Select>
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Select
              placeholder="Thanh toán & Công nợ"
              value={financialFilter || undefined}
              onChange={(val) => setFinancialFilter(val || '')}
              allowClear
              style={{ width: '100%' }}
            >
              <Option value="unpaid"><Badge status="default" text="Chờ thanh toán / Chờ cọc" /></Option>
              <Option value="deposit_paid"><Badge status="processing" text="Đã cọc" /></Option>
              <Option value="fully_paid"><Badge status="success" text="Đã thanh toán đủ" /></Option>
              <Option value="credit_approved"><Badge status="warning" text="Duyệt xuất nợ ngoại lệ" /></Option>
              <Option value="pending_credit"><Badge status="error" text="Đang chờ duyệt kho nợ" /></Option>
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="Đối tượng TT"
              value={paymentTargetFilter || undefined}
              onChange={(val) => setPaymentTargetFilter(val || '')}
              allowClear
              style={{ width: '100%' }}
            >
              <Option value="personal">Cá nhân</Option>
              <Option value="company">Công ty</Option>
            </Select>
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Select
              placeholder="Vận hành Kho"
              value={exportFilter || undefined}
              onChange={(val) => setExportFilter(val || '')}
              allowClear
              style={{ width: '100%' }}
            >
              <Option value="rejected"><Badge status="error" text="Chưa có lệnh XK" /></Option>
              <Option value="pending_export"><Badge status="error" text="Đang đợi duyệt xuất kho" /></Option>
            </Select>
          </Col>
        </Row>
      </Card>

      {/* ── Order Table ────────────────────────────────────────────────── */}
      <Card
        style={{
          borderRadius: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.05)',
        }}
        bodyStyle={{ padding: 0 }}
      >
        {isMobile ? (
          <List
            dataSource={filteredOrders}
            loading={loading}
            pagination={{ pageSize: 10, size: 'small', showTotal: (total) => `Tổng cộng ${total} đơn hàng` }}
            renderItem={(record) => {
              const cfg = statusConfig[record.status] || { label: record.status, color: 'default' }
              return (
                <List.Item
                  style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                    <Text strong style={{ color: '#2563eb' }}>{record.order_number}</Text>
                    <Tag color={cfg.color} icon={cfg.icon} style={{ margin: 0 }}>{cfg.label}</Tag>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>Khách hàng: </Text>
                    <Text strong>{record.customer_name || 'Khách lẻ'}</Text>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>Ngày tạo: </Text>
                    <Text>{dayjs(record.created_at).format('DD/MM/YYYY')}</Text>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>Tổng tiền: </Text>
                    <Text strong style={{ color: '#16a34a', fontSize: 15 }}>{Number(record.total_amount || 0).toLocaleString('vi-VN')} đ</Text>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {renderOrderActions(record)}
                  </div>
                </List.Item>
              )
            }}
          />
        ) : (
          <Table
            columns={columns.filter(col => visibleColumns.includes(col.key))}
            dataSource={filteredOrders}
            rowKey="id"
            loading={loading}
            scroll={{ x: 'max-content' }}
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              showTotal: (total) => `Tổng cộng ${total} đơn hàng`,
            }}
          />
        )}
      </Card>

      {/* ── Modal Add / Edit Order ─────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <FileDoneOutlined style={{ color: '#10b981' }} />
            <Text strong style={{ fontSize: 18 }}>
              {editingOrder ? `Chỉnh sửa Đơn hàng (${editingOrder.order_number})` : 'Tạo Đơn Hàng Mới'}
            </Text>
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="Lưu Đơn Hàng"
        cancelText="Hủy"
        width={(() => {
          const et = getEffectiveTemplate(editingOrder)
          const isLand = et?.code === 'production_landscape_a4' || et?.layout_config?.paper_orientation === 'landscape'
          return isLand ? 1050 : 850
        })()}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="customer"
                label="Khách hàng"
                rules={[{ required: true, message: 'Vui lòng chọn khách hàng' }]}
              >
                <Select
                  showSearch
                  placeholder="Chọn hoặc tìm kiếm khách hàng..."
                  optionFilterProp="children"
                >
                  {customers.map((c) => (
                    <Option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="status" label="Trạng thái">
                <Select disabled={!canApprove || ['pending', 'rejected'].includes(editingOrder?.status)}>
                  <Option value="pending">Chờ duyệt</Option>
                  <Option value="approved">Đã được duyệt</Option>
                  <Option value="rejected">Đã từ chối</Option>
                  <Option value="cancelled">Đã hủy</Option>
                  <Option value="completed">Hoàn thành</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="installation_date" label="Ngày lắp đặt dự kiến">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }}>
            <Space>
              <Text strong>Bảng Tính Chi Tiết Hạng Mục (Mẫu: {companyTemplate?.name || 'Tiêu chuẩn'})</Text>
              <Tag color="blue">{formItems.length} dòng</Tag>
            </Space>
          </Divider>

          <div style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <DndContext sensors={sensors} modifiers={[restrictToVerticalAxis]} onDragEnd={(e) => handleDragEnd(e, formItems, setFormItems)}>
              <SortableContext items={formItems.map(i => i.key)} strategy={verticalListSortingStrategy}>
                <Table
                  components={{ body: { row: DraggableBodyRow } }}
                  dataSource={formItems}
                  columns={getItemColumns()}
                  rowKey="key"
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content' }}
                />
              </SortableContext>
            </DndContext>
          </div>


          <Button type="dashed" onClick={handleAddLine} block icon={<PlusOutlined />} style={{ marginBottom: 20 }}>
            Thêm dòng sản phẩm / hạng mục mới
          </Button>

          <Divider style={{ margin: '12px 0' }}>
            <Space>
              <Text strong>Dịch Vụ & Chi Phí Phát Sinh</Text>
              <Tag color="blue">{serviceItems.length} dịch vụ</Tag>
            </Space>
          </Divider>

          <div style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <DndContext sensors={sensors} modifiers={[restrictToVerticalAxis]} onDragEnd={(e) => handleDragEnd(e, serviceItems, setServiceItems)}>
              <SortableContext items={serviceItems.map(i => i.key)} strategy={verticalListSortingStrategy}>
                <Table
                  components={{ body: { row: DraggableBodyRow } }}
                  dataSource={serviceItems}
                  columns={getServiceItemColumns()}
                  rowKey="key"
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content' }}
                />
              </SortableContext>
            </DndContext>
          </div>

          <Button type="dashed" onClick={handleAddServiceLine} block icon={<PlusOutlined />} style={{ marginBottom: 20 }}>
            Thêm dịch vụ / chi phí phát sinh
          </Button>

          <Card size="small" style={{ background: '#f8fafc', borderRadius: 8, marginBottom: 16 }}>
            {(() => {
              const effTmpl = getEffectiveTemplate(editingOrder);
              const totalsBlock = effTmpl?.layout_config?.blocks?.find(b => b.type === 'totals')?.props || {};
              const showShipping = totalsBlock.showShippingFee !== false;
              const showInstallation = totalsBlock.showInstallationFee !== false;
              const showDiscount = totalsBlock.showDiscount !== false;
              const showVAT = totalsBlock.showVAT !== false;
              return (
                <Row gutter={16} align="bottom" justify="end">
                  {showShipping && (
                    <Col xs={24} sm={4}>
                      <Form.Item name="shipping_fee" label="Phí vận chuyển" style={{ marginBottom: 8 }}>
                        <InputNumber min={0} step={50000} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(v) => v.replace(/\$\s?|(,*)/g, '')} />
                      </Form.Item>
                    </Col>
                  )}
                  {showInstallation && (
                    <Col xs={24} sm={4}>
                      <Form.Item name="installation_fee" label="Phí thi công" style={{ marginBottom: 8 }}>
                        <InputNumber min={0} step={50000} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(v) => v.replace(/\$\s?|(,*)/g, '')} />
                      </Form.Item>
                    </Col>
                  )}
                  {showDiscount && (
                    <Col xs={24} sm={4}>
                      <Form.Item name="discount_total" label="Chiết khấu" style={{ marginBottom: 8 }}>
                        <InputNumber min={0} step={10000} style={{ width: '100%' }} formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(val) => val.replace(/\$\s?|(,*)/g, '')} />
                      </Form.Item>
                    </Col>
                  )}
                  {showVAT && (
                    <Col xs={24} sm={4}>
                      <Form.Item name="vat_rate" label="% VAT" style={{ marginBottom: 8 }}>
                        <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  )}
                  <Col xs={24} sm={8}>
                    <Form.Item shouldUpdate noStyle>
                      {() => {
                        const shipping = Number(form.getFieldValue('shipping_fee') || 0)
                        const install = Number(form.getFieldValue('installation_fee') || 0)
                        const discount = Number(form.getFieldValue('discount_total') || 0)
                        const vatRate = Number(form.getFieldValue('vat_rate') || 0)
                        const subtotal = calculateModalTotal()
                        const vatAmount = (subtotal * vatRate) / 100.0
                        const total = Math.max(0, subtotal + vatAmount + shipping + install - discount)
                        return (
                          <div style={{ textAlign: 'right', paddingRight: 8, marginBottom: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Tổng Trước Thuế: {subtotal.toLocaleString('vi-VN')} đ</Text>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Tiền VAT: {vatAmount.toLocaleString('vi-VN')} đ</Text>
                            <Text strong style={{ fontSize: 18, color: '#e11d48', display: 'block', marginTop: 4 }}>
                              Tổng: {total.toLocaleString('vi-VN')} đ
                            </Text>
                          </div>
                        )
                      }}
                    </Form.Item>
                  </Col>
                </Row>
              );
            })()}
          </Card>

          <Row gutter={16}>
            <Col xs={24} sm={6}>
              <Form.Item name="delivery_time" label="Thời gian giao hàng">
                <Input placeholder="3-5 ngày..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item name="warranty_months" label="Bảo hành (tháng)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item name="validity_days" label="Hiệu lực giá (ngày)">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item name="payment_target" label="Đối tượng thanh toán">
                <Radio.Group>
                  <Radio value="personal">Cá nhân</Radio>
                  <Radio value="company">Công ty</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>

          <Card size="small" title="Tiến độ thanh toán (Tự động chuyển sang Công nợ)" style={{ marginBottom: 16 }}>
            <Form.List name="payment_terms_schedule">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Row key={key} gutter={16} align="middle" style={{ marginBottom: 8 }}>
                      <Col xs={24} sm={8}>
                        <Form.Item
                          {...restField}
                          name={[name, 'title']}
                          rules={[{ required: true, message: 'Nhập tên đợt' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="VD: Đặt cọc lần 1" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={6}>
                        <Form.Item
                          {...restField}
                          name={[name, 'percentage']}
                          rules={[{ required: true, message: 'Nhập %' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber placeholder="%" min={0} max={100} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item
                          {...restField}
                          name={[name, 'type']}
                          rules={[{ required: true, message: 'Chọn loại' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select>
                            <Option value="deposit">Đặt cọc</Option>
                            <Option value="before_delivery">Trước giao hàng</Option>
                            <Option value="after_delivery">Sau giao hàng / Lắp đặt</Option>
                            <Option value="warranty">Bảo hành</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={2}>
                        {fields.length > 1 && (
                          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                        )}
                      </Col>
                    </Row>
                  ))}
                  <Button type="dashed" onClick={() => add({ title: '', percentage: 0, type: 'deposit' })} block icon={<PlusOutlined />} style={{ marginTop: 8 }}>
                    Thêm đợt thanh toán
                  </Button>
                  <Form.Item shouldUpdate noStyle>
                    {() => {
                      const pt = form.getFieldValue('payment_terms_schedule') || []
                      const totalPercentage = pt.reduce((sum, item) => sum + Number(item?.percentage || 0), 0)
                      if (pt.length > 0 && Math.abs(totalPercentage - 100) > 0.01) {
                        return (
                          <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #f87171', borderRadius: 4 }}>
                            <Text type="danger" strong>
                              <AlertOutlined style={{ marginRight: 8 }} /> 
                              Cảnh báo: Tổng % các đợt thanh toán hiện tại là {totalPercentage}%. (Bắt buộc phải đúng 100%)
                            </Text>
                          </div>
                        )
                      }
                      return null
                    }}
                  </Form.Item>
                </>
              )}
            </Form.List>
          </Card>


          <Form.Item name="notes" label="Ghi chú thi công & giao hàng">
            <TextArea
              rows={3}
              placeholder="VD: Giao hàng tận công trình, kiểm tra số đo thực tế trước khi cắt nhôm..."
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Drawer View Order Details ──────────────────────────────────── */}
      <Drawer
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <Space style={{ flex: 1, minWidth: 250 }}>
              <PrinterOutlined style={{ color: '#10b981' }} />
              <Text strong>Chi tiết Đơn Hàng {selectedOrder?.order_number}</Text>
            </Space>

            <Space wrap>
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
              {canExportPdf && (
                <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrintOrPDF} style={{ background: '#10b981', borderColor: '#10b981' }}>
                  In Đơn Hàng
                </Button>
              )}
            </Space>
          </div>
        }
        width={(() => {
          const et = getEffectiveTemplate(selectedOrder)
          const targetW = (et?.layout_config?.paper_orientation === 'landscape' || et?.code === 'production_landscape_a4') ? 1080 : 920
          return window.innerWidth < targetW ? '100%' : targetW
        })()}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {selectedOrder && (
          <div>
            <div style={{ marginBottom: 24, border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, background: '#fff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
              <QuotationPrintView
                quotation={selectedOrder}
                type="order"
                effectiveTemplate={getEffectiveTemplate(selectedOrder)}
                isCompanyAdmin={isCompanyAdmin}
                products={products}
              />
            </div>

            <div style={{ padding: '16px', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderRadius: '12px', border: '1px solid #bbf7d0', marginBottom: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <Row align="middle" justify="space-between">
                <Col xs={24} md={8}>
                  <Space direction="vertical" size={0}>
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tình trạng thanh toán</Text>
                    <Tag color={selectedOrder.financial_status === 'fully_paid' ? 'green' : selectedOrder.financial_status === 'deposit_paid' ? 'blue' : 'orange'} style={{ marginTop: 4, fontWeight: 700, padding: '4px 12px', borderRadius: '6px', fontSize: 13, border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                      {selectedOrder.has_pending_credit_request 
                        ? 'Chờ duyệt kho nợ' 
                        : (selectedOrder.financial_status === 'deposit_paid' && Number(selectedOrder.paid_amount) > 0 
                            ? `Đã thu ${selectedOrder.total_amount ? Math.round((Number(selectedOrder.paid_amount) / Number(selectedOrder.total_amount)) * 100) : 0}% (${Number(selectedOrder.paid_amount).toLocaleString()}đ)` 
                            : selectedOrder.financial_status_display || 'Chờ cọc')}
                    </Tag>
                  </Space>
                </Col>
                <Col xs={24} md={6}>
                  <Space direction="vertical" size={0}>
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Đã thu</Text>
                    <Text strong style={{ color: '#15803d', fontSize: 18, textShadow: '0 1px 2px rgba(21, 128, 61, 0.1)' }}>
                      {Number(selectedOrder.paid_amount || 0).toLocaleString('vi-VN')} <span style={{fontSize: 14, fontWeight: 500}}>đ</span>
                    </Text>
                  </Space>
                </Col>
                <Col xs={24} md={6}>
                  <Space direction="vertical" size={0}>
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Còn nợ</Text>
                    <Text strong style={{ color: selectedOrder.remaining_debt > 0 ? '#b91c1c' : '#15803d', fontSize: 18, textShadow: '0 1px 2px rgba(185, 28, 28, 0.1)' }}>
                      {Number(selectedOrder.remaining_debt || 0).toLocaleString('vi-VN')} <span style={{fontSize: 14, fontWeight: 500}}>đ</span>
                    </Text>
                  </Space>
                </Col>
                <Col xs={24} md={4} style={{ textAlign: 'right' }}>
                  {hasPermission('finance.create_receipt') && selectedOrder.remaining_debt > 0 && (
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderColor: '#059669', fontWeight: 600, borderRadius: '8px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
                      onClick={openReceiptModal}
                    >
                      Thu tiền
                    </Button>
                  )}
                </Col>
              </Row>
            </div>

            {/* CỔNG XUẤT KHO (DO GATE) */}
            {isModuleActive('inventory') && (
              <div style={{ padding: '16px', background: selectedOrder.financial_status === 'fully_paid' || selectedOrder.financial_status === 'credit_approved' ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)', borderRadius: '12px', border: selectedOrder.financial_status === 'fully_paid' || selectedOrder.financial_status === 'credit_approved' ? '1px solid #bbf7d0' : '1px solid #fecdd3', marginBottom: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <Row align="middle" justify="space-between">
                  <Col xs={24} md={16}>
                    <Space align="center" size={12}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: selectedOrder.financial_status === 'fully_paid' || selectedOrder.financial_status === 'credit_approved' ? '#22c55e' : '#f43f5e', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                        {selectedOrder.financial_status === 'fully_paid' || selectedOrder.financial_status === 'credit_approved' ? <CheckCircleOutlined style={{color: '#fff', fontSize: 20}} /> : <CloseCircleOutlined style={{color: '#fff', fontSize: 20}} />}
                      </div>
                      <Space direction="vertical" size={0}>
                        <Text strong style={{ fontSize: 15, color: selectedOrder.financial_status === 'fully_paid' || selectedOrder.financial_status === 'credit_approved' ? '#15803d' : '#be123c' }}>
                          CỔNG WORKFLOW: {selectedOrder.financial_status === 'fully_paid' || selectedOrder.financial_status === 'credit_approved' ? 'ĐÃ MỞ' : 'ĐÃ KHÓA'}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 13, color: selectedOrder.financial_status === 'fully_paid' || selectedOrder.financial_status === 'credit_approved' ? '#16a34a' : '#e11d48' }}>
                          {selectedOrder.financial_status === 'fully_paid' || selectedOrder.financial_status === 'credit_approved' ? 'Đơn hàng đủ điều kiện chuyển qua các bộ phận tiếp theo.' : 'Chờ thanh toán đủ hoặc cần Giám đốc phê duyệt nợ.'}
                        </Text>
                      </Space>
                    </Space>
                  </Col>
                  <Col xs={24} md={8} style={{ textAlign: 'right' }}>
                    {selectedOrder.financial_status !== 'fully_paid' && selectedOrder.financial_status !== 'credit_approved' && canRequestCredit && (
                      <Button
                        danger={!selectedOrder.has_pending_credit_request}
                        type={selectedOrder.has_pending_credit_request ? 'default' : 'primary'}
                        size="middle"
                        disabled={selectedOrder.has_pending_credit_request}
                        onClick={openApproverModal}
                        style={{ borderRadius: '8px', fontWeight: 600, boxShadow: selectedOrder.has_pending_credit_request ? 'none' : '0 4px 12px rgba(225, 29, 72, 0.3)' }}
                      >
                        {selectedOrder.has_pending_credit_request ? '⏳ Đang chờ duyệt nợ' : '🛡️ Trình Duyệt Nợ'}
                      </Button>
                    )}
                  </Col>
                </Row>
              </div>
            )}

            {(isCompanyAdmin || selectedOrder.created_by === user?.id) && isModuleActive('inventory') && selectedOrder.needs_export_request && ['fully_paid', 'deposit_paid', 'credit_approved'].includes(selectedOrder.financial_status) && (
              <div style={{ padding: '16px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fca5a5', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={12}>
                  <AlertOutlined style={{ color: '#ef4444', fontSize: 20 }} />
                  <Space direction="vertical" size={0}>
                    <Text strong style={{ color: '#b91c1c' }}>Đơn hàng bị thiếu lệnh xuất kho!</Text>
                    <Text type="secondary" style={{ color: '#991b1b', fontSize: 13 }}>Kho đã từ chối xuất hàng hoặc dữ liệu giao dịch đã bị xóa. Vui lòng yêu cầu lại.</Text>
                  </Space>
                </Space>
                <Button 
                  type="primary" 
                  danger 
                  onClick={() => handleReRequestExport(selectedOrder.id)}
                  style={{ fontWeight: 600, borderRadius: '8px', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)' }}
                >
                  Yêu cầu xuất lại
                </Button>
              </div>
            )}

            {/* LỊCH SỬ THU TIỀN */}
            {(selectedOrder.payment_milestones?.flatMap(m => m.receipts || []) || []).length > 0 && (
              <div style={{ marginTop: 16, marginBottom: 16 }}>
                <Text strong style={{ fontSize: 14, textTransform: 'uppercase', color: '#475569', marginBottom: 8, display: 'block' }}>
                  Lịch sử thu tiền
                </Text>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <Table scroll={{ x: 'max-content' }}
                    dataSource={selectedOrder.payment_milestones?.flatMap(m => m.receipts || []) || []}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    columns={[
                      { title: 'Ngày thu', dataIndex: 'payment_date', key: 'payment_date', render: d => dayjs(d).format('DD/MM/YYYY') },
                      { title: 'Số phiếu', dataIndex: 'receipt_code', key: 'receipt_code', render: c => <Text strong>{c}</Text> },
                      { title: 'Số tiền', dataIndex: 'amount', key: 'amount', render: a => <Text strong style={{color: '#15803d'}}>{Number(a).toLocaleString('vi-VN')} đ</Text> },
                      { title: 'Hình thức', dataIndex: 'payment_method_display', key: 'payment_method' },
                      {
                        title: '',
                        key: 'action',
                        render: (_, record) => (
                          <Space>
                            {hasPermission('finance.print_receipt') && (
                              <Button type="link" size="small" icon={<PrinterOutlined />} onClick={() => handlePrintReceipt(record)}>
                                In phiếu
                              </Button>
                            )}
                            {record.attachments && record.attachments.length > 0 && (
                              <Button
                                type="link"
                                size="small"
                                icon={<PictureOutlined />}
                                onClick={() => {
                                  setPreviewAttachments(record.attachments)
                                  setPreviewVisible(true)
                                }}
                              >
                                Xem chứng từ ({record.attachments.length})
                              </Button>
                            )}
                            {hasPermission('finance.delete') && (
                              <Popconfirm
                                title="Xác nhận xóa phiếu thu này?"
                                description="Thao tác này sẽ cập nhật lại công nợ của đơn hàng. Bạn có chắc chắn?"
                                onConfirm={() => handleDeleteReceipt(record.id)}
                                okText="Xóa"
                                cancelText="Hủy"
                                okButtonProps={{ danger: true }}
                              >
                                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                                  Xóa
                                </Button>
                              </Popconfirm>
                            )}
                          </Space>
                        )
                      }
                    ]}
                  />
                </div>
              </div>
            )}

            {selectedOrder.notes && (
              <div style={{ padding: '16px', background: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)', borderRadius: '12px', border: '1px solid #fde047', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Space align="center">
                    <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(234, 179, 8, 0.3)' }}>
                      <FileTextOutlined style={{color: '#fff', fontSize: 16}} />
                    </div>
                    <Text strong style={{ color: '#854d0e', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ghi chú thi công / Thanh toán</Text>
                  </Space>
                  <Paragraph style={{ margin: '4px 0 0 40px', color: '#713f12', fontSize: 14, lineHeight: '1.6' }}>
                    {selectedOrder.notes}
                  </Paragraph>
                </Space>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ── Modal Lập Phiếu Thu Tiền ──────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <Tag color="green">KẾ TOÁN</Tag>
            <Text strong>Lập Phiếu Thu Tiền - {selectedOrder?.order_number}</Text>
          </Space>
        }
        open={receiptModalVisible}
        onCancel={() => setReceiptModalVisible(false)}
        onOk={() => receiptForm.submit()}
        confirmLoading={receiptSubmitting}
        okText="Xác nhận thu tiền & Mở Cổng"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#10b981', borderColor: '#10b981' } }}
      >
        <Form form={receiptForm} layout="vertical" onFinish={handleCreateReceipt}>
          {selectedOrder?.payment_milestones?.length > 0 && (
            <Form.Item name="milestone" label="Kỳ thanh toán" rules={[{ required: true, message: 'Vui lòng chọn kỳ thanh toán' }]}>
              <Select placeholder="Chọn kỳ thanh toán" onChange={handleMilestoneChange} allowClear>
                {getAdjustedMilestones(selectedOrder.payment_milestones)
                  .filter(m => m.status !== 'paid' && m.adjusted_needed > 0)
                  .map(m => (
                    <Option key={m.id} value={m.id}>
                      {m.title} - Cần thu: {Number(m.adjusted_needed).toLocaleString('vi-VN')} đ
                    </Option>
                ))}
              </Select>
            </Form.Item>
          )}
          <Form.Item
            name="amount"
            label="Số tiền thu (VNĐ)"
            rules={[{ required: true, message: 'Vui lòng nhập số tiền thu' }]}
          >
            <InputNumber
              min={1000}
              style={{ width: '100%' }}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>
          <Form.Item
            name="payment_method"
            label="Hình thức thanh toán"
            rules={[{ required: true }]}
          >
            <Select>
              <Option value="transfer">Chuyển khoản ngân hàng</Option>
              <Option value="cash">Tiền mặt</Option>
              <Option value="card">Thẻ / POS</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="payment_target"
            label="Đối tượng thanh toán (Hóa đơn)"
            rules={[{ required: true, message: 'Vui lòng chọn Đối tượng thanh toán' }]}
          >
            <Radio.Group disabled={!!selectedOrder?.payment_target}>
              <Radio value="personal">Cá nhân</Radio>
              <Radio value="company">Công ty</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="note" label="Ghi chú Kế toán">
            <TextArea rows={2} placeholder="Nhập ghi chú giao dịch, số UNC..." />
          </Form.Item>
          <Form.Item label="Chứng từ đính kèm (Ảnh UNC, v.v...)">
            <Upload
              listType="picture-card"
              multiple
              fileList={receiptFileList}
              beforeUpload={handleUploadReceipt}
              onRemove={handleRemoveReceiptFile}
              accept="image/*,.pdf"
            >
              {receiptUploading ? <Spin /> : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>Tải lên</div>
                </div>
              )}
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Chọn người duyệt nợ */}
      <Modal
        title="Chọn người duyệt nợ"
        open={approverModalVisible}
        onCancel={() => setApproverModalVisible(false)}
        onOk={() => approverForm.submit()}
        okText="Gửi yêu cầu"
        cancelText="Hủy"
      >
        <Form form={approverForm} layout="vertical" onFinish={handleRequestCreditApproval}>
          <Form.Item 
            name="approver_id" 
            label="Người duyệt (Giám đốc / Kế toán trưởng)"
            rules={[{ required: true, message: 'Vui lòng chọn người duyệt!' }]}
          >
            <Select placeholder="Chọn người duyệt...">
              {approvers.map(u => (
                <Option key={u.id} value={u.id}>{u.full_name ? `${u.full_name} (${u.username})` : u.username} {u.role_name ? `- ${u.role_name}` : ''}</Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <div style={{ display: 'none' }}>
        <ReceiptPrintView
          ref={receiptPrintRef}
          receipt={selectedReceiptForPrint}
          company={selectedOrder?.company_info}
          order={selectedOrder}
        />
      </div>

      <div style={{ display: 'none' }}>
        <Image.PreviewGroup
          preview={{
            visible: previewVisible,
            onVisibleChange: (vis) => setPreviewVisible(vis),
          }}
        >
          {previewAttachments.map((url, i) => (
            <Image key={i} src={url} />
          ))}
        </Image.PreviewGroup>
      </div>

      {selectedOrder && selectedOrder.customer && (
        <ZnsSendModal
          visible={znsModalVisible}
          onCancel={() => setZnsModalVisible(false)}
          customer={customers.find(c => c.id === selectedOrder.customer) || { id: selectedOrder.customer, name: selectedOrder.customer_name, phone: selectedOrder.customer_phone }}
          defaultTemplateType="order_confirm"
          defaultParams={{
            ma_don_hang: selectedOrder.order_number,
            so_tien: selectedOrder.total_amount
          }}
        />
      )}

      {/* Modal Trình Duyệt Lại */}
      <Modal
        title="Trình duyệt lại Đơn hàng"
        open={resubmitModalVisible}
        onCancel={() => setResubmitModalVisible(false)}
        onOk={handleSubmitResubmit}
        confirmLoading={submittingResubmit}
        okText="Trình duyệt lại"
        cancelText="Hủy"
      >
        <div style={{ marginBottom: 16 }}>
            <Text type="secondary">
                Đơn hàng sẽ được chuyển lại trạng thái Chờ duyệt.
            </Text>
        </div>
        <Form form={resubmitForm} layout="vertical">
          <Form.Item
            name="approver_id"
            label="Chọn người duyệt đơn hàng"
            rules={[{ required: true, message: 'Vui lòng chọn người duyệt' }]}
          >
            <Select placeholder="Chọn quản lý / giám đốc..." showSearch optionFilterProp="children">
              {resubmitApprovers.map(a => (
                <Select.Option key={a.id} value={a.id}>
                  {a.full_name || a.username} ({a.username}) {a.is_company_admin ? ' - Giám đốc' : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="Ghi chú trình duyệt lại (nếu có)">
            <Input.TextArea rows={3} placeholder="Ghi chú thêm khắc phục lỗi..." />
          </Form.Item>
        </Form>
      </Modal>

    </section>
  )
}

