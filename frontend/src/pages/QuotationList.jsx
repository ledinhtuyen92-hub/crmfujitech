import { AlertOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, DeleteOutlined, EditOutlined, FileDoneOutlined, FilePdfOutlined, FileTextOutlined, PlusOutlined, PrinterOutlined, SearchOutlined, SendOutlined, SettingOutlined, UserOutlined, CameraOutlined } from '@ant-design/icons'
import { AutoComplete, Badge, Button, Card, Col, DatePicker, Divider, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Table, Tag, Tooltip, Typography, message, theme, Upload, Avatar, Image, List } from 'antd' 
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocation } from 'react-router-dom'

import QuotationPrintView from '../components/QuotationPrintView'
import api from '../utils/api'
import { useResponsive } from '../hooks/useResponsive'
import CustomInfoInput from '../components/CustomInfoInput'

const getProductDisplayName = (p) => p.sku ? `[${p.sku}] ${p.name}` : p.name;

const { Title, Text, Paragraph } = Typography
const { Option } = Select

const groupProducts = (items, withUnit = false) => {
  const grouped = {};
  const ungrouped = [];
  items.forEach(p => {
    const label = withUnit ? `${p.name} (${p.unit || 'cái'})` : p.name;
    const option = { label, value: p.name };
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
const { TextArea } = Input

// Trạng thái báo giá
const statusConfig = {
  draft: { label: 'Nháp', color: 'default', icon: <ClockCircleOutlined /> },
  pending_approval: { label: 'Chờ duyệt', color: 'warning', icon: <ClockCircleOutlined /> },
  approved: { label: 'Đã duyệt', color: 'success', icon: <CheckCircleOutlined /> },
  sent: { label: 'Đã gửi', color: 'blue', icon: <SendOutlined /> },
  accepted: { label: 'Đã chấp nhận', color: 'success', icon: <CheckCircleOutlined /> },
  rejected: { label: 'Đã từ chối', color: 'error', icon: <CloseCircleOutlined /> },
}

export default function QuotationList() {
  const { isMobile } = useResponsive()
  const { token } = theme.useToken()
  const { user, isCompanyAdmin, hasPermission, checkMaintenance } = useAuth()
  const location = useLocation()
  const [messageApi, contextHolder] = message.useMessage()

  // Data states
  const [quotations, setQuotations] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [companyTemplate, setCompanyTemplate] = useState(null)
  const [companySettings, setCompanySettings] = useState(null)
  const [loading, setLoading] = useState(false)

  // Filters
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Modal Add / Edit
  const [modalVisible, setModalVisible] = useState(false)
  const [editingQuotation, setEditingQuotation] = useState(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  // Dynamic products in form
  const [formItems, setFormItems] = useState(() => [
    { key: 'init-1', product: null, width: 0, height: 0, quantity: 1, unit_price: 0, discount_percent: 0 },
  ])
  const [serviceItems, setServiceItems] = useState(() => [])

  // Drawer details
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [selectedQuotation, setSelectedQuotation] = useState(null)

  // Approval Modal
  const [approvalModalVisible, setApprovalModalVisible] = useState(false)
  const [approvers, setApprovers] = useState([])
  const [submittingApproval, setSubmittingApproval] = useState(false)
  const [approvalForm] = Form.useForm()

  // Permissions
  const canCreate = hasPermission('sales.create')
  const canEdit = hasPermission('sales.edit')
  const canDelete = hasPermission('sales.delete')
  const requireApproval = hasPermission('sales.require_approval') && !isCompanyAdmin
  const canExportPdf = isCompanyAdmin || hasPermission('sales.export_pdf')

  // ── Fetch data ────────────────────────────────────────────────────────
  const fetchQuotations = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    try {
      const params = {}
      if (statusFilter) params.status = statusFilter
      const res = await api.get('/sales/quotations/', { params })
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setQuotations(data)
    } catch {
      messageApi.error('Không thể tải danh sách báo giá.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, messageApi])

  const fetchCustomersAndProducts = useCallback(async () => {
    await Promise.resolve()
    try {
      const [custRes, prodRes, tmplRes, settingsRes] = await Promise.all([
        api.get('/crm/customers/').catch(() => ({ data: [] })),
        api.get('/inventory/products/').catch(() => ({ data: [] })),
        api.get('/sales/quotation-templates/my-company-template/').catch(() => ({ data: null })),
        api.get('/users/company-settings/').catch(() => ({ data: null })),
      ])
      const custData = Array.isArray(custRes.data) ? custRes.data : custRes.data?.results ?? []
      const prodData = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data?.results ?? []
      setCustomers(custData)
      setProducts(prodData)
      if (tmplRes?.data) setCompanyTemplate(tmplRes.data)
      if (settingsRes?.data) setCompanySettings(settingsRes.data)
    } catch {
      // ignore silently
    }
  }, [])

  useEffect(() => {
    fetchQuotations()
  }, [fetchQuotations])

  useEffect(() => {
    fetchCustomersAndProducts()
  }, [fetchCustomersAndProducts])

  useEffect(() => {
    const stateCustId = location.state?.createForCustomer
    const params = new URLSearchParams(location.search)
    const queryCustId = params.get('customerId')
    const searchQuery = params.get('search')

    if (searchQuery) {
      setSearchText(searchQuery)
    }

    const targetId = stateCustId || queryCustId
    if (targetId) {
      const numId = Number(targetId) || targetId
      openModal(null, numId)
      window.history.replaceState({}, '', '/quotations')
    }
  }, [location.state, location.search])

  useEffect(() => {
    if (modalVisible && !editingQuotation) {
      const currentNotes = form.getFieldValue('notes')
      const fallback = 'Thanh toán 50% sau khi ký hợp đồng, 50% sau khi nghiệm thu thi công.'
      if (!currentNotes || currentNotes === fallback || currentNotes === companyTemplate?.footer_content || currentNotes === companyTemplate?.company_default_terms) {
        const newNotes = companySettings?.default_quotation_terms || companyTemplate?.company_default_terms || companyTemplate?.footer_content || fallback
        if (newNotes !== currentNotes) {
          form.setFieldsValue({ notes: newNotes })
        }
      }
    }
  }, [companySettings, companyTemplate, modalVisible, editingQuotation, form])

  // ── Filtered list ─────────────────────────────────────────────────────
  const filteredQuotations = quotations.filter((item) => {
    if (!searchText) return true
    const qNum = (item.quotation_number || '').toLowerCase()
    const cName = (item.customer_name || '').toLowerCase()
    const cPhone = (item.customer_phone || '').toLowerCase()
    const query = searchText.toLowerCase()
    return qNum.includes(query) || cName.includes(query) || cPhone.includes(query)
  })

  // ── Stats ─────────────────────────────────────────────────────────────
  const totalDraft = quotations.filter((q) => q.status === 'draft').length
  const totalSent = quotations.filter((q) => q.status === 'sent').length
  const totalAccepted = quotations.filter((q) => q.status === 'accepted').length
  const totalAmountAccepted = quotations
    .filter((q) => q.status === 'accepted')
    .reduce((sum, q) => sum + Number(q.total_amount || 0), 0)

  // ── Helper to compute line total consistently ─────────────────────────
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
    
    // Default: calculate by quantity
    return Number((qty * price * (1 - discount / 100)).toFixed(0));
  }

  const computeServiceLineTotal = (item) => {
    const qty = Number(item.quantity || 1)
    const price = Number(item.unit_price || 0)
    const discount = Number(item.discount_percent || 0)
    return Number((qty * price * (1 - discount / 100)).toFixed(0))
  }

  // ── Helper for Excel rowSpan calculation ──────────────────────────────
  const computeRowSpan = (data, index, field = 'product') => {
    const currentItem = data[index];
    if (!currentItem) return 1;

    const matches = (item1, item2) => {
      if (field === 'product') {
        if (item1.product && item2.product) return item1.product === item2.product;
        if (!item1.product && !item2.product) return item1.product_name === item2.product_name && !!item1.product_name;
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

  const computeProductSTT = (data, index, field = 'product') => {
    let count = 0;
    const matches = (item1, item2) => {
      if (field === 'product') {
        if (item1.product && item2.product) return item1.product === item2.product;
        if (!item1.product && !item2.product) return item1.product_name === item2.product_name && !!item1.product_name;
        return false;
      }
      return item1[field] === item2[field];
    };
    for (let i = 0; i <= index; i++) {
      if (i === 0 || !matches(data[i], data[i - 1])) {
        count++;
      }
    }
    return count;
  }

  // ── Template Snapshot Helper ───────────────────────────────────────────
  // Returns the effective template for a given quotation:
  // 1. If the quotation has a saved template_snapshot in custom_data → use it ("frozen" layout)
  // 2. Otherwise → fall back to the current company template
  const getEffectiveTemplate = (quotation) => {
    if (!quotation) return companyTemplate
    const snap = quotation?.custom_data?.template_snapshot
    if (snap && snap.code) return snap
    
    // Nếu là báo giá cũ không có snapshot, mặc định là STANDARD (Dọc)
    return {
      code: 'STANDARD',
      name: 'Tiêu chuẩn (Cũ)',
      layout_config: { paper_orientation: 'portrait' }
    }
  }

  // Backfill: when opening a quotation with no snapshot, silently save current template as snapshot
  const backfillTemplateSnapshot = async (quotation) => {
    if (!quotation) return
    if (quotation?.custom_data?.template_snapshot?.code) return // already has snapshot
    try {
      const snap = {
        code: 'STANDARD',
        name: 'Tiêu chuẩn (Cũ)',
        layout_config: { paper_orientation: 'portrait' }
      }
      const updated = {
        ...quotation,
        custom_data: { ...(quotation.custom_data || {}), template_snapshot: snap },
      }
      await api.patch(`/sales/quotations/${quotation.id}/`, {
        custom_data: updated.custom_data,
      })
      // Update local state so the current drawer session also benefits
      setSelectedQuotation(updated)
    } catch {
      // Non-critical — silently ignore
    }
  }

  // ── Handlers for modal form items ─────────────────────────────────────
  const handleAddLine = () => {
    setFormItems((prev) => [
      ...prev,
      { key: Date.now(), product: null, width: 0, height: 0, length: 0, thickness: 0, area: 0, spec: '', warranty: '12 tháng', quantity: 1, unit_price: 0, discount_percent: 0, note: '', product_image: '', unit: 'cái', symbol: '', custom_data: {} },
    ])
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
        if (!item1.product && !item2.product) return item1.product_name === item2.product_name && !!item1.product_name;
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

  const handleRemoveLine = (index) => {
    if (formItems.length === 1) return
    setFormItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleLineChange = (index, field, value) => {
    setFormItems((prev) => {
      const updated = [...prev]
      const currentItem = { ...updated[index], [field]: value }
      if (field === 'product') {
        const prod = products.find((p) => p.id === value)
        if (prod) {
          currentItem.unit_price = Number(prod.price || prod.cost_price || 0)
          currentItem.product_name = prod.name || ''
          currentItem.unit = prod.unit || 'cái'
          currentItem.product_image = prod.image_url || prod.image || ''
        }
      }
      if (field === 'width' || field === 'height' || field === 'length') {
        const w = Number(field === 'width' ? value : currentItem.width || 0)
        const h = Number(field === 'height' ? value : currentItem.height || 0)
        const l = Number(field === 'length' ? value : currentItem.length || 0)
        if (w > 0 && h > 0) {
          currentItem.area = Number(((w * h) / 1000000).toFixed(4))
        } else if (l > 0 && w > 0) {
          currentItem.area = Number(((l * w) / 1000000).toFixed(4))
        }
      }
      if (field === 'symbol') {
        currentItem.custom_data = { ...(currentItem.custom_data || {}), symbol: value }
      }
      updated[index] = currentItem
      return updated
    })
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

  // Calculate totals in modal
  const calculateModalTotal = () => {
    let subtotal = 0
    const effTmpl = getEffectiveTemplate(editingQuotation)
    formItems.forEach((item) => {
      subtotal += computeLineTotal(item, effTmpl) || 0
    })
    serviceItems.forEach((item) => {
      subtotal += computeServiceLineTotal(item)
    })
    return subtotal
  }

  // ── Open Modal ────────────────────────────────────────────────────────
  const openModal = (quotation = null, prefillCustomerId = null) => {
    if (checkMaintenance()) return
    setEditingQuotation(quotation)
    const defaultTerms = companySettings?.default_quotation_terms || companyTemplate?.company_default_terms || companyTemplate?.footer_content || 'Thanh toán 50% sau khi ký hợp đồng, 50% sau khi nghiệm thu thi công.'
    const defaultPaymentTerms = 'Thanh toán 50% tạm ứng ngay sau khi xác nhận đơn hàng, 50% còn lại thanh toán sau khi bàn giao nghiệm thu.'
    if (quotation) {
      form.setFieldsValue({
        customer: quotation.customer,
        status: quotation.status,
        installation_date: quotation.installation_date ? dayjs(quotation.installation_date) : null,
        shipping_fee: Number(quotation.shipping_fee || 0),
        installation_fee: Number(quotation.installation_fee || 0),
        delivery_time: quotation.delivery_time || '3-5 ngày làm việc',
        warranty_months: quotation.warranty_months !== undefined ? quotation.warranty_months : 12,
        payment_terms: quotation.payment_terms || defaultPaymentTerms,
        payment_terms_schedule: quotation.payment_terms_schedule && quotation.payment_terms_schedule.length > 0 
          ? quotation.payment_terms_schedule 
          : [{ title: 'Thanh toán đợt 1', percentage: 100, type: 'deposit' }],
        vat_rate: Number(quotation.vat_rate || 0),
        validity_days: Number(quotation.validity_days || 15),
        notes: quotation.notes,
        discount_total: Number(quotation.discount_total || 0),
      })
      if (quotation.items && quotation.items.length > 0) {
        // Sort items by id to ensure they are displayed in the exact order they were inserted
        const sortedItems = [...quotation.items].sort((a, b) => a.id - b.id)
        const mainItems = sortedItems.filter(it => it.item_type !== 'service')
        const srvItems = sortedItems.filter(it => it.item_type === 'service')

        if (mainItems.length > 0) {
          setFormItems(
            mainItems.map((it, idx) => {
              const prodObj = products.find((p) => p.id === it.product)
              return {
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
                product_image: it.product_image || (prodObj ? (prodObj.image_url || prodObj.image) : '') || '',
                unit: it.custom_data?.unit || (prodObj ? prodObj.unit : 'cái'),
                symbol: it.custom_data?.symbol || it.symbol || '',
                custom_data: it.custom_data || {},
                product_name: it.product_name || (prodObj ? prodObj.name : ''),
              }
            })
          )
        } else {
          setFormItems([{ key: Date.now(), product: null, width: 0, height: 0, length: 0, thickness: 0, area: 0, spec: '', warranty: '12 tháng', quantity: 1, unit_price: 0, discount_percent: 0, note: '', product_image: '', unit: 'cái', symbol: '', custom_data: {} }])
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
          { key: Date.now(), product: null, width: 0, height: 0, length: 0, thickness: 0, area: 0, spec: '', warranty: '12 tháng', quantity: 1, unit_price: 0, discount_percent: 0, note: '', product_image: '', unit: 'cái', symbol: '', custom_data: {} },
        ])
        setServiceItems([])
      }
    } else {
      form.resetFields()
      form.setFieldsValue({
        customer: prefillCustomerId || undefined,
        status: 'draft',
        discount_total: 0,
        shipping_fee: 0,
        installation_fee: 0,
        delivery_time: '3-5 ngày làm việc',
        warranty_months: 12,
        payment_terms: defaultPaymentTerms,
        payment_terms_schedule: [{ title: 'Thanh toán đợt 1', percentage: 100, type: 'deposit' }],
        validity_days: 15,
        notes: defaultTerms,
      })
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

      // Validate items
      const validItems = formItems.filter((it) => it.product || it.product_name)
      const validServiceItems = serviceItems.filter((it) => it.product_name)
      if (validItems.length === 0 && validServiceItems.length === 0) {
        messageApi.error('Vui lòng chọn ít nhất 1 sản phẩm hoặc 1 dịch vụ/chi phí cho báo giá.')
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

      // Build template snapshot to freeze the current layout with this quotation
      const effTmpl = getEffectiveTemplate(editingQuotation)
      const templateSnapshot = effTmpl ? {
        id: effTmpl.id,
        code: effTmpl.code,
        name: effTmpl.name,
        layout_config: effTmpl.layout_config,
        layout_style: effTmpl.layout_style,
        footer_content: effTmpl.footer_content,
      } : null

      const payload = {
        customer: values.customer,
        status: values.status,
        installation_date: values.installation_date ? values.installation_date.format('YYYY-MM-DD') : null,
        notes: values.notes || '',
        shipping_fee: Number(values.shipping_fee || 0),
        installation_fee: Number(values.installation_fee || 0),
        delivery_time: values.delivery_time || '',
        warranty_months: Number(values.warranty_months) || 12,
        payment_terms: values.payment_terms || '',
        payment_terms_schedule: values.payment_terms_schedule || [],
        validity_days: Number(values.validity_days || 15),
        subtotal: subtotal,
        vat_rate: Number(values.vat_rate || 0),
        vat_amount: vatAmount,
        discount_total: Number(values.discount_total || 0),
        total_amount: Math.max(0, totalAmt),
        custom_data: {
          ...(editingQuotation?.custom_data || {}),
          ...(templateSnapshot ? { template_snapshot: templateSnapshot } : {}),
        },
      }

      let quotationId
      if (editingQuotation) {
        const res = await api.patch(`/sales/quotations/${editingQuotation.id}/`, payload)
        quotationId = res.data.id
        messageApi.success('Cập nhật báo giá thành công!')
      } else {
        const res = await api.post('/sales/quotations/', payload)
        quotationId = res.data.id
        messageApi.success('Tạo báo giá mới thành công!')
      }

      // Add / replace items
      if (editingQuotation && editingQuotation.items) {
        await Promise.all(
          editingQuotation.items.map((it) => api.delete(`/sales/quotation-items/${it.id}/`).catch(() => {}))
        )
      }

      for (const it of validItems) {
        const prodObj = products.find((p) => p.id === it.product)
        await api.post('/sales/quotation-items/', {
          quotation: quotationId,
          product: it.product,
          product_name: it.product_name || (prodObj ? prodObj.name : 'Sản phẩm'),
          unit_price: Number(it.unit_price || 0),
          width: Math.round(Number(it.width || 0)),
          height: Math.round(Number(it.height || 0)),
          length: Math.round(Number(it.length || 0)),
          thickness: Math.round(Number(it.thickness || 0)),
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
        await api.post('/sales/quotation-items/', {
          quotation: quotationId,
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
      fetchQuotations()
    } catch (error) {
      if (error.errorFields) return
      let detailMsg = error.response?.data?.detail || error.response?.data?.message
      if (!detailMsg && typeof error.response?.data === 'string') {
        detailMsg = error.response.data
      }
      if (!detailMsg && error.response?.data && typeof error.response.data === 'object') {
        const errList = []
        for (const [k, v] of Object.entries(error.response.data)) {
          const valStr = Array.isArray(v) ? v.join(', ') : (typeof v === 'object' ? JSON.stringify(v) : String(v))
          errList.push(`${k}: ${valStr}`)
        }
        if (errList.length > 0) detailMsg = errList.join('; ')
      }
      console.error('Lỗi khi lưu báo giá:', error.response?.data || error)
      messageApi.error(detailMsg || 'Lưu báo giá thất bại. Vui lòng thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete Quotation ──────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (checkMaintenance()) return
    try {
      await api.delete(`/sales/quotations/${id}/`)
      messageApi.success('Đã xoá báo giá.')
      fetchQuotations()
    } catch {
      messageApi.error('Không thể xoá báo giá này.')
    }
  }

  // ── Submit Approval ────────────────────────────────────────────────────
  const openApprovalModal = async (record) => {
    setSelectedQuotation(record)
    setApprovalModalVisible(true)
    approvalForm.resetFields()
    try {
      const res = await api.get('/users/users/')
      const userList = Array.isArray(res.data) ? res.data : (res.data?.results || [])
      const myDeptId = user?.department
      // Chỉ chọn Giám đốc (admin công ty) hoặc Trưởng phòng phụ trách trực tiếp CÓ QUYỀN DUYỆT BÁO GIÁ
      const validApprovers = userList.filter(u => {
        if (u.is_company_admin || u.is_superuser) return true
        const hasApprovePerm = u.permissions && u.permissions.includes('sales.approve')
        if (!hasApprovePerm) return false

        if (myDeptId && u.managed_department_ids && u.managed_department_ids.includes(myDeptId)) return true
        if (myDeptId && u.department === myDeptId && u.id !== user?.id && u.role_name && u.role_name.toLowerCase().includes('trưởng')) return true
        return false
      })
      setApprovers(validApprovers.length > 0 ? validApprovers : userList.filter(u => u.is_company_admin || u.is_superuser))
    } catch {
      messageApi.error('Lỗi tải danh sách người duyệt.')
    }
  }

  const handleSubmitApproval = async () => {
    try {
      const values = await approvalForm.validateFields()
      setSubmittingApproval(true)
      await api.post(`/sales/quotations/${selectedQuotation.id}/submit-approval/`, {
        approver_id: values.approver_id,
        description: values.description
      })
      messageApi.success('Đã gửi yêu cầu phê duyệt thành công!')
      setApprovalModalVisible(false)
      fetchQuotations()
    } catch (err) {
      if (err.errorFields) return
      messageApi.error(err.response?.data?.detail || 'Lỗi gửi duyệt.')
    } finally {
      setSubmittingApproval(false)
    }
  }

  // ── Copy Link & Activate Expiration ─────────────────────────────────────
  const handleCopyLink = async (quotation, isExtending = false) => {
    if (checkMaintenance()) return
    const isExpired = quotation.public_link_expires_at && dayjs(quotation.public_link_expires_at).isBefore(dayjs())
    const needsActivation = !quotation.public_link_expires_at || isExpired || isExtending
    
    try {
      let expires_at = quotation.public_link_expires_at
      if (needsActivation) {
        const res = await api.post(`/sales/quotations/${quotation.id}/activate-link/`)
        expires_at = res.data.public_link_expires_at
        if (selectedQuotation && selectedQuotation.id === quotation.id) {
          setSelectedQuotation({ ...selectedQuotation, public_link_expires_at: expires_at })
        }
        fetchQuotations() // Update list
      }
      const link = `${window.location.origin}/quote/${quotation.public_token}`
      navigator.clipboard.writeText(link)
      messageApi.success(needsActivation ? 'Đã copy link! Hệ thống bắt đầu đếm ngược 24h.' : 'Đã copy link gửi khách hàng!')
    } catch (err) {
      messageApi.error('Lỗi khi kích hoạt link chia sẻ.')
    }
  }

  // ── Print or Export Quotation to PDF (Clean Window with Exact Title) ────
  const handlePrintOrPDF = () => {
    if (!selectedQuotation) return
    const contentEl = document.querySelector('.printable-quotation-content')
    const qNum = selectedQuotation.quotation_number || 'Bao_Gia'

    if (!contentEl) {
      const oldTitle = document.title
      document.title = qNum
      window.print()
      document.title = oldTitle
      return
    }

    const effectiveTmpl = getEffectiveTemplate(selectedQuotation)
    const rawConfig = effectiveTmpl?.layout_config || {}
    const isLand = rawConfig.paper_orientation === 'landscape'
      || effectiveTmpl?.layout_style === 'A4_Landscape'
      || effectiveTmpl?.code === 'production_landscape_a4'
      || selectedQuotation?.layout_style === 'A4_Landscape'

    // A4 kích thước thực (px at 96dpi): Portrait=794x1123, Landscape=1123x794
    const winW = isLand ? 1170 : 840
    const winH = isLand ? 860 : 1160

    // Collect all existing stylesheets from the current document
    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n')

    // Open dedicated printable window sized to A4
    const printWin = window.open('', '_blank', `width=${winW},height=${winH},toolbar=0,menubar=0,scrollbars=1`)
    if (!printWin) {
      const oldTitle = document.title
      document.title = qNum
      window.print()
      document.title = oldTitle
      return
    }

    // Đọc giá trị zoom/scale hiện tại từ DOM (được set bởi QuotationPrintView)
    const currentZoom = parseFloat(contentEl.style.zoom) || 1

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${qNum}</title>
        <!-- Preload Inter font để tránh lệch layout do fallback font -->
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
        ${styleTags}
        <style>
          /* ==== PRINT-WINDOW RESET ==== */
          * { box-sizing: border-box; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: 'Inter', ui-sans-serif, system-ui, Arial, sans-serif !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Áp dụng đúng zoom mà user đã chọn */
          .printable-quotation-content {
            zoom: ${currentZoom} !important;
            transform: none !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Ẩn các nút, thanh toolbar không cần thiết */
          button, .ant-btn, .no-print, .ant-drawer-header,
          .ant-drawer-close, .ant-drawer-mask { display: none !important; }
          /* Bảng */
          .ant-table-wrapper, .ant-spin-nested-loading,
          .ant-spin-container, .ant-table,
          .ant-table-container, .ant-table-content {
            overflow: visible !important;
            height: auto !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          thead { display: table-header-group !important; }
          tfoot { display: table-footer-group !important; }
          /* Giữ layout lưới khi in */
          .ant-col-md-16 { flex: 0 0 66.666666% !important; max-width: 66.666666% !important; }
          .ant-col-md-12 { flex: 0 0 50% !important; max-width: 50% !important; }
          .ant-col-md-8  { flex: 0 0 33.333333% !important; max-width: 33.333333% !important; }
          .ant-col-md-6  { flex: 0 0 25% !important; max-width: 25% !important; }
          .ant-col-md-24 { flex: 0 0 100% !important; max-width: 100% !important; }
          /* Khối ký tên */
          .signature-block {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: flex-start !important;
            width: 100% !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-top: 24px !important;
          }
          .signature-block > div,
          .signature-block > .ant-col {
            width: 45% !important;
            max-width: 45% !important;
            flex: 0 0 45% !important;
          }
          /* ==== @PAGE ==== 
             Để có lề ở tất cả các trang, bắt buộc phải dùng @page margin.
             Người dùng sẽ phải tắt "Header and footers" trong Print Dialog để ẩn ngày/URL. */
          @page {
            size: A4 ${isLand ? 'landscape' : 'portrait'};
            margin: ${isLand ? '10mm 12mm' : '15mm 20mm'};
          }
          @media print {
            tr { page-break-inside: avoid !important; break-inside: avoid !important; }
          }
        </style>
      </head>
      <body>
        ${contentEl.outerHTML}
      </body>
      </html>
    `)

    printWin.document.close()
    printWin.focus()

    // Đợi 1200ms để font Inter load xong → tránh lệch layout logo/thông tin
    setTimeout(() => {
      printWin.print()
      printWin.close()
    }, 1200)
  }

  // ── Convert Quotation to Order ────────────────────────────────────────
  const handleConvertToOrder = async (id) => {
    if (checkMaintenance()) return
    try {
      await api.post(`/sales/quotations/${id}/create-order/`)
      messageApi.success('🎉 Đã chuyển báo giá thành Đơn hàng chính thức!')
      fetchQuotations()
    } catch (error) {
      const msg = error.response?.data?.detail || 'Không thể tạo đơn hàng từ báo giá này.'
      messageApi.error(msg)
    }
  }

  const handleQuickApprove = async (id) => {
    try {
      await api.post(`/sales/quotations/${id}/quick-approve/`)
      messageApi.success('Đã duyệt báo giá thành công!')
      fetchQuotations()
    } catch (err) {
      messageApi.error(err.response?.data?.detail || 'Lỗi khi duyệt báo giá.')
    }
  }

  const handleQuickReject = async (id) => {
    try {
      await api.post(`/sales/quotations/${id}/quick-reject/`)
      messageApi.success('Đã từ chối báo giá!')
      fetchQuotations()
    } catch (err) {
      messageApi.error(err.response?.data?.detail || 'Lỗi khi từ chối báo giá.')
    }
  }

  const handleEditClick = (record) => {
    if (record.status === 'approved' || record.status === 'pending_approval') {
      Modal.confirm({
        title: 'Cảnh báo sửa Báo giá',
        content: 'Báo giá này đã được duyệt (hoặc đang chờ duyệt). Nếu bạn thay đổi dữ liệu, hệ thống sẽ tự động đưa báo giá về trạng thái "Nháp" và bạn phải trình duyệt lại. Bạn có chắc chắn muốn sửa không?',
        okText: 'Sửa Báo Giá',
        cancelText: 'Hủy',
        onOk: () => {
          openModal(record)
        }
      })
    } else {
      openModal(record)
    }
  }

  // ── Table Columns ─────────────────────────────────────────────────────
  const renderQuotationActions = (record) => (
    <Space wrap size={8}>
      {(() => {
        const hasBypass = hasPermission('sales.bypass_customer_signature');
        
        const requireApproval = companySettings?.require_quotation_approval ?? true;
        const canCreateOrder = record.status === 'accepted' || 
          (hasBypass && ['approved', 'sent'].includes(record.status)) ||
          (hasBypass && record.status === 'draft' && !requireApproval);
        
        if (!canCreateOrder) return null;

        if (record.order_status === 'pending') {
          return (
            <Tooltip title="Đơn hàng đang chờ quản lý phê duyệt">
              <Button size="small" disabled style={{ background: '#f1f5f9', color: '#64748b' }}>
                <ClockCircleOutlined /> Đang chờ duyệt ĐH
              </Button>
            </Tooltip>
          )
        }
        if (record.order_status === 'approved' || record.order_status === 'in_production' || record.order_status === 'shipping' || record.order_status === 'completed') {
          return (
            <Tooltip title="Đơn hàng đã được duyệt chính thức">
              <Button size="small" disabled style={{ background: '#dcfce7', color: '#15803d', borderColor: '#86efac' }}>
                <CheckCircleOutlined /> Đã tạo ĐH
              </Button>
            </Tooltip>
          )
        }
        if (record.order_status === 'rejected') {
          return (
            <Tooltip title="Đơn hàng đã bị từ chối. Vui lòng sang phần Đơn hàng để sửa lại.">
              <Button size="small" disabled style={{ background: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' }}>
                <CloseCircleOutlined /> ĐH bị từ chối
              </Button>
            </Tooltip>
          )
        }
        return (
          <Popconfirm
            title="Xác nhận tạo đơn hàng?"
            description={hasBypass && record.status !== 'accepted' 
              ? "Khách hàng chưa ký xác nhận nhưng bạn có quyền Bỏ qua. Xác nhận tạo Đơn hàng?" 
              : "Bạn có chắc chắn muốn chuyển đổi báo giá này thành Đơn hàng chính thức không?"}
            onConfirm={() => handleConvertToOrder(record.id)}
            okText="Đồng ý tạo"
            cancelText="Hủy"
          >
            <Button
              type="primary"
              size="small"
              icon={<FileDoneOutlined />}
              style={{ background: '#16a34a', borderColor: '#16a34a' }}
            >
              Tạo Đơn Hàng
            </Button>
          </Popconfirm>
        )
      })()}
      <Tooltip title="Xem chi tiết & In PDF">
        <Button
          type="text"
          shape="circle"
          icon={<FileTextOutlined style={{ color: '#2563eb' }} />}
          onClick={() => {
            setSelectedQuotation(record)
            setDrawerVisible(true)
            if (!record?.custom_data?.template_snapshot?.code) {
              setTimeout(() => backfillTemplateSnapshot(record), 500)
            }
          }}
        />
      </Tooltip>
      {(record.status === 'draft' || record.status === 'rejected') && hasPermission('sales.require_approval') ? (
        <Button
          type="default"
          size="small"
          onClick={() => openApprovalModal(record)}
        >
          Trình duyệt
        </Button>
      ) : null}
      {record.status === 'pending_approval' && hasPermission('sales.approve') && (
        <Space size={4}>
          <Tooltip title="Duyệt báo giá">
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              style={{ background: '#16a34a', borderColor: '#16a34a' }}
              onClick={() => handleQuickApprove(record.id)}
            >
              Duyệt
            </Button>
          </Tooltip>
          <Tooltip title="Từ chối">
            <Button
              danger
              type="primary"
              size="small"
              icon={<CloseCircleOutlined />}
              onClick={() => handleQuickReject(record.id)}
            >
              Từ chối
            </Button>
          </Tooltip>
        </Space>
      )}
      {canEdit && (isCompanyAdmin || record.status !== 'accepted') && (
        <Tooltip title="Sửa báo giá">
          <Button
            type="text"
            shape="circle"
            icon={<EditOutlined style={{ color: '#d97706' }} />}
            onClick={() => handleEditClick(record)}
          />
        </Tooltip>
      )}
      {canDelete && record.status !== 'pending_approval' && (isCompanyAdmin || record.status !== 'accepted') && (
        <Popconfirm
          title="Xoá báo giá?"
          description="Bạn có chắc chắn muốn xoá báo giá này không?"
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
      title: 'Mã báo giá',
      dataIndex: 'quotation_number',
      key: 'quotation_number',
      render: (val, record) => (
        <Space>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(37, 99, 235, 0.1)',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
            }}
          >
            BG
          </div>
          <div>
            <Text
              strong
              style={{ color: '#2563eb', cursor: 'pointer', display: 'block' }}
              onClick={() => {
                setSelectedQuotation(record)
                setDrawerVisible(true)
                // Backfill snapshot for old quotations (non-blocking)
                if (!record?.custom_data?.template_snapshot?.code) {
                  setTimeout(() => backfillTemplateSnapshot(record), 500)
                }
              }}
            >
              {val || `BG-${record.id}`}
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
      render: (val) => <Text strong>{val || '—'}</Text>,
    },
    {
      title: 'SĐT khách hàng',
      dataIndex: 'customer_phone',
      key: 'customer_phone',
      render: (val) => <Text>{val || '—'}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st) => {
        const cfg = statusConfig[st] || { label: st, color: 'default' }
        return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>
      },
    },
    {
      title: 'Người tạo',
      dataIndex: 'created_by_name',
      key: 'created_by_name',
      render: (val) => <Tag color="blue">{val || 'Hệ thống'}</Tag>,
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
      render: (_, record) => renderQuotationActions(record),
    },
  ]

  // ── Dynamic Editable Table Columns based on Template ──────────────────
  const getServiceItemColumns = () => {
    const effectiveTmpl = getEffectiveTemplate(editingQuotation)
    const serviceTableBlock = effectiveTmpl?.layout_config?.blocks?.find(b => b.type === 'service_table')
    const allowedCategories = serviceTableBlock?.props?.allowedCategories || []
    
    const tmplCode = effectiveTmpl?.code || 'STANDARD'
    const isLandscape = tmplCode === 'production_landscape_a4' || effectiveTmpl?.layout_config?.paper_orientation === 'landscape'

    const serviceBlock = effectiveTmpl?.layout_config?.blocks?.find(b => b.type === 'service_table');
    const enableServiceImage = serviceBlock?.props?.enableProductImage !== false;

    let baseCols = [
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
              options={groupProducts(products.filter((p) => {
                if (p.product_type !== 'service') return false;
                if (allowedCategories.length === 0) return true;
                return allowedCategories.includes(p.category_name);
              }))}
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
                    const res = await api.post('/sales/quotations/upload-item-image/', formData, {
                      headers: { 'Content-Type': 'multipart/form-data' },
                    });
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
          render: (val, record, idx) => <Input style={{ textAlign: 'center', fontWeight: 600, color: '#2563eb' }} placeholder="VD: D1.1" value={record.symbol || ''} onChange={(e) => handleServiceLineChange(idx, 'symbol', e.target.value)} />,
        },
        {
          title: 'GHI CHÚ KỸ THUẬT',
          dataIndex: 'note',
          width: 170,
          render: (val, record, idx) => <Input placeholder="Chi tiết..." value={val || ''} onChange={(e) => handleServiceLineChange(idx, 'note', e.target.value)} />,
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
          render: (val, record, idx) => <Input placeholder="Chi tiết..." value={val || ''} onChange={(e) => handleServiceLineChange(idx, 'note', e.target.value)} />,
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

    return baseCols
  }

  const getItemColumns = () => {
    const effectiveTmpl = getEffectiveTemplate(editingQuotation)
    const productTableBlock = effectiveTmpl?.layout_config?.blocks?.find(b => b.type === 'product_table')
    const allowedCategories = productTableBlock?.props?.allowedCategories || []
    
    const tmplCode = effectiveTmpl?.code || 'STANDARD'
    const isLandscape = tmplCode === 'production_landscape_a4' || effectiveTmpl?.layout_config?.paper_orientation === 'landscape'
    
    const productBlock = effectiveTmpl?.layout_config?.blocks?.find(b => b.type === 'product_table');
    // Only enable image features if explicitly configured in template (default: off)
    const hasTemplate = !!effectiveTmpl?.layout_config;
    const nameColCfg = hasTemplate
      ? (productBlock?.props?.columns || []).find(c => (typeof c === 'object' ? c.id : c) === 'name')
      : null;
    const enableProductImage = hasTemplate
      ? (nameColCfg && typeof nameColCfg === 'object' ? nameColCfg.allowImageUpload === true : productBlock?.props?.enableProductImage !== false)
      : false;
    const enableProductName = productBlock?.props?.enableProductName !== false;
    const enableProductDescription = productBlock?.props?.enableProductDescription !== false;
    const useComplexDimensions = productBlock?.props?.useComplexDimensions !== false;
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
          const fieldVal = getDimVal(record, field);
          return (
            <InputNumber
              min={0}
              step={1}
              precision={0}
              style={{ width: '100%', textAlign: 'center' }}
              value={fieldVal !== undefined && fieldVal !== null && fieldVal !== '' ? Math.round(Number(fieldVal)) : undefined}
              onChange={(v) => setDimVal(idx, record, field, v)}
              placeholder="0"
            />
          );
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
          width: 50,
          align: 'center',
          render: (_, __, idx) => idx + 1,
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
                    <AutoComplete
                      style={{ flex: 1, minWidth: 150 }}
                      value={record.product_name || (prodObj ? prodObj.name : undefined)}
                      onChange={(v) => {
                        const matched = products.find(p => p.name === v && p.product_type !== 'service');
                        if (matched) {
                          handleLineChange(idx, 'product', matched.id);
                          handleLineChange(idx, 'product_name', matched.name);
                          handleLineChange(idx, 'spec', '');
                        } else {
                          handleLineChange(idx, 'product', null);
                          handleLineChange(idx, 'product_name', v);
                        }
                      }}
                      options={groupProducts(products.filter(p => {
                        if (p.product_type === 'service') return false;
                        if (allowedCategories.length === 0) return true;
                        return allowedCategories.includes(p.category_name);
                      }), true)}
                      filterOption={(inputValue, option) => (option?.value || '').toUpperCase().includes(inputValue.toUpperCase())}
                      placeholder="Chọn hoặc nhập mẫu cửa..."
                    />
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
                            const res = await api.post('/sales/quotations/upload-item-image/', formData, {
                              headers: { 'Content-Type': 'multipart/form-data' },
                            });
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
                          type="dashed" 
                          size="small" 
                          icon={<PlusOutlined />} 
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
          render: (val, record, idx) => <CustomInfoInput style={{ textAlign: 'center', fontWeight: 600, color: '#2563eb' }} placeholder="VD: D1.1" value={record.custom_data?.symbol || record.symbol || ''} onChange={(v) => handleLineChange(idx, 'symbol', v)} />,
        },
        {
          title: 'GHI CHÚ KỸ THUẬT',
          dataIndex: 'note',
          width: 170,
          render: (val, record, idx) => <CustomInfoInput style={{ textAlign: 'center' }} placeholder="Khóa, bản lề, kính..." value={val || ''} onChange={(v) => handleLineChange(idx, 'note', v)} />,
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
            const total = computeLineTotal(record, effectiveTmpl)
            return <Text strong style={{ color: '#16a34a', fontSize: 14 }}>{total !== null ? `${total.toLocaleString('vi-VN')} đ` : ''}</Text>
          },
        },
        {
          title: '',
          key: 'action',
          width: 50,
          render: (_, __, idx) => formItems.length > 1 ? (
            <Tooltip title="Xoá dòng"><Button type="text" danger shape="circle" icon={<DeleteOutlined />} onClick={() => handleRemoveLine(idx)} /></Tooltip>
          ) : null,
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
                  <AutoComplete
                    style={{ flex: 1, minWidth: 150 }}
                    value={record.product_name || (prodObj ? prodObj.name : undefined)}
                    onChange={(v) => {
                      const matched = products.find(p => p.name === v && p.product_type !== 'service');
                      if (matched) {
                        handleLineChange(idx, 'product', matched.id);
                        handleLineChange(idx, 'product_name', matched.name);
                        handleLineChange(idx, 'spec', '');
                      } else {
                        handleLineChange(idx, 'product', null);
                        handleLineChange(idx, 'product_name', v);
                      }
                    }}
                    options={groupProducts(products.filter(p => {
                      if (p.product_type === 'service') return false;
                      if (allowedCategories.length === 0) return true;
                      return allowedCategories.includes(p.category_name);
                    }))}
                    filterOption={(inputValue, option) => (option?.value || '').toUpperCase().includes(inputValue.toUpperCase())}
                    placeholder="Chọn hoặc nhập sản phẩm..."
                  />
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
                          const res = await api.post('/sales/quotations/upload-item-image/', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' },
                          });
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
                        type="dashed" 
                        size="small" 
                        icon={<PlusOutlined />} 
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
          render: (val, record, idx) => <CustomInfoInput placeholder="Hệ 55, kính 10mm..." value={val || ''} onChange={(v) => handleLineChange(idx, 'spec', v)} />,
        },
        {
          title: 'Bảo hành',
          dataIndex: 'warranty',
          width: 100,
          render: (val, record, idx) => <CustomInfoInput placeholder="5 năm..." value={val || ''} onChange={(v) => handleLineChange(idx, 'warranty', v)} />,
        }
      )
    } else if (tmplCode === 'SERVICES') {
      baseCols.push(
        {
          title: 'Phạm vi / Mô tả chi tiết',
          dataIndex: 'spec',
          width: 200,
          render: (val, record, idx) => <CustomInfoInput placeholder="Chi tiết phạm vi công việc..." value={val || ''} onChange={(v) => handleLineChange(idx, 'spec', v)} />,
        },
        {
          title: 'Thời gian bảo hành / duy trì',
          dataIndex: 'warranty',
          width: 140,
          render: (val, record, idx) => <CustomInfoInput placeholder="12 tháng / 1 năm..." value={val || ''} onChange={(v) => handleLineChange(idx, 'warranty', v)} />,
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
          render: (val, record, idx) => <CustomInfoInput placeholder="Giấy C250, cán mờ..." value={val || ''} onChange={(v) => handleLineChange(idx, 'spec', v)} />,
        }
      )
    } else {
      baseCols.push(
        {
          title: 'Kích thước / Ghi chú',
          dataIndex: 'note',
          width: 200,
          render: (val, record, idx) => (
            <CustomInfoInput
              placeholder="VD: 800×2000mm, màu vân gỗ, lắp đặt kèm..."
              value={val || ''}
              onChange={(v) => handleLineChange(idx, 'note', v)}
            />
          ),
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
    const customColumns = (productTableBlock?.props?.columns || []).filter(col => typeof col === 'object' && (col.id.startsWith('custom_') || col.id.startsWith('group_')));

    if (customColumns.length > 0) {
      customColumns.forEach(col => {
        if (col.id.startsWith('group_') && col.children && col.children.length > 0) {
          baseCols.push({
            title: col.title,
            key: col.id,
            id: col.id,
            children: col.children.map(child => ({
              title: child.title,
              dataIndex: child.id,
              key: child.id,
              id: child.id,
              width: 100,
              render: (val, record, idx) => (
                <CustomInfoInput 
                  placeholder={`Nhập ${child.title.toLowerCase()}...`}
                  value={record.custom_data?.[child.id] || ''} 
                  onChange={(v) => {
                    const newData = { ...(record.custom_data || {}) };
                    newData[child.id] = v;
                    handleLineChange(idx, 'custom_data', newData);
                  }} 
                />
              ),
            }))
          });
        } else if (col.id.startsWith('custom_')) {
          baseCols.push({
            title: col.title,
            dataIndex: col.id,
            key: col.id,
            id: col.id,
            width: 140,
            render: (val, record, idx) => (
              <CustomInfoInput 
                placeholder={`Nhập ${col.title.toLowerCase()}...`}
                value={record.custom_data?.[col.id] || ''} 
                onChange={(v) => {
                  const newData = { ...(record.custom_data || {}) };
                  newData[col.id] = v;
                  handleLineChange(idx, 'custom_data', newData);
                }} 
              />
            ),
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
          const total = computeLineTotal(record, effectiveTmpl)
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
      
      // legacy support
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
      for (const c of (productTableBlock?.props?.columns || [])) {
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
        
        const canUpload = colCfg.allowImageUpload === true;
        
        let finalWidth = col.width;
        if (canUpload && colId !== 'action' && colId !== 'name') {
          if (!finalWidth || finalWidth < 125) finalWidth = 125;
        }

        return {
          ...col,
          title: finalTitle,
          width: finalWidth,
          render: (val, record, idx) => {
            const { colSpan, isMergedRoot } = getMergeProps(colId, record);
            if (colSpan === 0) return { props: { colSpan: 0 } };
            
            if (isMergedRoot) {
              return {
                children: <CustomInfoInput placeholder="Thêm thông tin..." value={record.custom_data?.custom_size_text || ''} onChange={(val) => {
                  const currentData = record.custom_data || {};
                  handleLineChange(idx, 'custom_data', { ...currentData, custom_size_text: val });
                }} />,
                props: { colSpan }
              };
            }
            
            const origResult = origRender(val, record, idx);
            let innerChildren = origResult;
            let finalProps = { colSpan };
            
            if (origResult && typeof origResult === 'object' && origResult.children !== undefined) {
              innerChildren = origResult.children;
              finalProps = { ...origResult.props, colSpan: (origResult.props?.colSpan !== undefined && origResult.props?.colSpan !== 1) ? origResult.props.colSpan : colSpan };
            }

            // Image Upload Feature - only enable if explicitly set in column config (no legacy fallback)
            const colCfg = getColConfig(colId);
            const canUpload = colCfg.allowImageUpload === true;
            
            if (canUpload && colId !== 'action' && colId !== 'name') { // Ensure not interfering with existing Product/Action logic
              const imgKey = colId === 'note' ? 'note_image' : `img_${colId}`;
              const imgUrl = record.custom_data?.[imgKey];
              
              innerChildren = (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
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
                      const key = `upload-${colId}-${idx}`;
                      messageApi.open({ key, type: 'loading', content: 'Đang tải ảnh lên...', duration: 0 });
                      try {
                        const formData = new FormData();
                        formData.append('image', file);
                        const res = await api.post('/sales/quotations/upload-item-image/', formData, {
                          headers: { 'Content-Type': 'multipart/form-data' },
                        });
                        const cd = record.custom_data || {};
                        handleLineChange(idx, 'custom_data', { ...cd, [imgKey]: res.data.url });
                        messageApi.open({ key, type: 'success', content: 'Tải ảnh thành công!', duration: 2 });
                        onSuccess("ok");
                      } catch (e) {
                        messageApi.open({ key, type: 'error', content: 'Tải ảnh thất bại', duration: 3 });
                        onError(e);
                      }
                    }}
                  >
                    <Button icon={<CameraOutlined />} size="small" type={imgUrl ? "primary" : "dashed"} title="Tải ảnh lên" />
                  </Upload>
                </div>
              );
            }

            return { children: innerChildren, props: finalProps };
          }
        };
      });
    };

    return applyColFeatures(baseCols);
  }

  return (
    <section>
      {contextHolder}

      {/* ── Page Header & Stats ────────────────────────────────────────── */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0, fontWeight: 800 }}>
            <FileTextOutlined style={{ color: '#2563eb', marginRight: 10 }} />
            Quản lý Bán hàng & Báo giá
          </Title>
          <Text type="secondary">
            Tạo, theo dõi và chuyển đổi báo giá thành đơn hàng chính thức một cách chuyên nghiệp.
          </Text>
        </Col>
        <Col>
          {canCreate && (
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={() => openModal()}
              style={{
                borderRadius: 10,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
            >
              Tạo Báo Giá Mới
            </Button>
          )}
        </Col>
      </Row>

      {/* ── Cards Thống Kê (Minimal Premium) ─────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Card 1: Nháp */}
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
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Báo giá nháp</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileTextOutlined style={{ color: '#94a3b8', fontSize: 15 }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1, fontFamily: "'Inter', sans-serif" }}>{totalDraft}</div>
            </div>
          </div>
        </Col>

        {/* Card 2: Đã gửi */}
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
              <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Đã gửi khách hàng</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SendOutlined style={{ color: '#3b82f6', fontSize: 15 }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1d4ed8', lineHeight: 1, fontFamily: "'Inter', sans-serif" }}>{totalSent}</div>
            </div>
          </div>
        </Col>

        {/* Card 3: Đã chấp nhận */}
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
              <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Đã chấp nhận</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 15 }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#15803d', lineHeight: 1, fontFamily: "'Inter', sans-serif" }}>{totalAccepted}</div>
            </div>
          </div>
        </Col>

        {/* Card 4: Tổng doanh số */}
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
              <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Doanh số chốt</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileDoneOutlined style={{ color: '#f59e0b', fontSize: 15 }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: totalAmountAccepted >= 1e9 ? 22 : 26, fontWeight: 700, color: '#fbbf24', lineHeight: 1, fontFamily: "'Inter', sans-serif", letterSpacing: '-0.02em' }}>
                {totalAmountAccepted.toLocaleString('vi-VN')} đ
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
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="Tìm theo mã báo giá, tên, SĐT khách hàng..."
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
              <Option value="draft"><Badge status="default" text="Nháp" /></Option>
              <Option value="sent"><Badge status="processing" text="Đã gửi" /></Option>
              <Option value="accepted"><Badge status="success" text="Đã chấp nhận" /></Option>
              <Option value="rejected"><Badge status="error" text="Đã từ chối" /></Option>
            </Select>
          </Col>
        </Row>
      </Card>

      {/* ── Quotation Table ────────────────────────────────────────────── */}
      <Card
        style={{
          borderRadius: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.05)',
        }}
        bodyStyle={{ padding: 0 }}
      >
        {isMobile ? (
          <List
            dataSource={filteredQuotations}
            loading={loading}
            pagination={{ pageSize: 10, size: 'small', showTotal: (total) => `Tổng cộng ${total} báo giá` }}
            renderItem={(record) => {
              const cfg = statusConfig[record.status] || statusConfig.draft
              return (
                <List.Item
                  style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                    <Text strong style={{ color: '#2563eb' }}>{record.quotation_number}</Text>
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
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                    {renderQuotationActions(record)}
                  </div>
                </List.Item>
              )
            }}
          />
        ) : (
          <Table scroll={{ x: 'max-content' }}
            columns={columns}
            dataSource={filteredQuotations}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: false,
              showTotal: (total) => `Tổng cộng ${total} báo giá`,
            }}
          />
        )}
      </Card>

      {/* ── Modal Add / Edit Quotation ─────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <FileTextOutlined style={{ color: '#2563eb' }} />
            <Text strong style={{ fontSize: 18 }}>
              {editingQuotation ? `Chỉnh sửa Báo giá (${editingQuotation.quotation_number})` : 'Tạo Báo Giá Mới'}
            </Text>
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="Lưu Báo Giá"
        cancelText="Hủy"
        width={1050}
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
                <Select disabled={requireApproval && !['approved', 'sent', 'accepted'].includes(editingQuotation?.status)}>
                  <Option value="draft">Nháp</Option>
                  {(!requireApproval || ['approved', 'sent', 'accepted'].includes(editingQuotation?.status)) && (
                    <Option value="sent">Đã gửi</Option>
                  )}
                  {isCompanyAdmin && <Option value="accepted">Đã chấp nhận</Option>}
                  <Option value="rejected">Đã từ chối</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="installation_date" label="Ngày thi công / lắp đặt">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }}>
            <Space>
              <Text strong>Bảng Tính Chi Tiết Hạng Mục (Mẫu: {getEffectiveTemplate(editingQuotation)?.name || 'Tiêu chuẩn'})</Text>
              <Tag color="blue">{formItems.length} dòng</Tag>
            </Space>
          </Divider>

          <div style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <Table
              dataSource={formItems}
              columns={getItemColumns()}
              rowKey="key"
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
            />
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
            <Table
              dataSource={serviceItems}
              columns={getServiceItemColumns()}
              rowKey="key"
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
            />
          </div>

          <Button type="dashed" onClick={handleAddServiceLine} block icon={<PlusOutlined />} style={{ marginBottom: 20 }}>
            Thêm dịch vụ / chi phí phát sinh
          </Button>

          <Card size="small" style={{ background: '#f8fafc', borderRadius: 8, marginBottom: 16 }}>
            {(() => {
              const effTmpl = getEffectiveTemplate(editingQuotation);
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
            <Col xs={24} sm={8}>
              <Form.Item name="delivery_time" label="Thời gian giao hàng / thi công">
                <Input placeholder="3-5 ngày làm việc..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="warranty_months" label="Thời hạn bảo hành (tháng)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="validity_days" label="Hiệu lực báo giá (ngày)">
                <InputNumber min={1} style={{ width: '100%' }} />
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

          <Form.Item name="notes" label="Ghi chú & Điều khoản chung">
            <TextArea
              rows={3}
              placeholder="VD: Báo giá có hiệu lực trong vòng 15 ngày. Chưa bao gồm thuế VAT..."
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Trình Duyệt */}
      <Modal
        title="Trình duyệt báo giá"
        open={approvalModalVisible}
        onCancel={() => setApprovalModalVisible(false)}
        onOk={handleSubmitApproval}
        confirmLoading={submittingApproval}
        okText="Gửi duyệt"
        cancelText="Hủy"
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            Báo giá sẽ được chuyển sang trạng thái <strong>Chờ duyệt</strong>. Bạn không thể chỉnh sửa hay gửi báo giá cho khách cho đến khi được duyệt.
          </Text>
        </div>
        <Form form={approvalForm} layout="vertical">
          <Form.Item 
            name="approver_id" 
            label="Chọn người duyệt" 
            rules={[{ required: true, message: 'Vui lòng chọn người duyệt' }]}
          >
            <Select placeholder="Chọn quản lý / giám đốc..." showSearch optionFilterProp="children">
              {approvers.map(u => (
                <Option key={u.id} value={u.id}>
                  {u.full_name ? `${u.full_name} (${u.username})` : u.username} {u.role_name ? `- ${u.role_name}` : ''}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="Ghi chú trình duyệt (nếu có)">
            <TextArea rows={3} placeholder="VD: Báo giá này có chiết khấu 15% cho khách hàng VIP, xin sếp duyệt giúp em..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Drawer View Quotation Details ──────────────────────────────── */}
      <Drawer
        title={(() => {
          const et = getEffectiveTemplate(selectedQuotation)
          const isLandEt = et?.layout_config?.paper_orientation === 'landscape' || et?.code === 'production_landscape_a4'
          const expiresAt = selectedQuotation?.public_link_expires_at
          const isExpired = expiresAt && dayjs(expiresAt).isBefore(dayjs())
          const hoursLeft = expiresAt && !isExpired ? dayjs(expiresAt).diff(dayjs(), 'hour') : 0
          
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <Space direction="vertical" size={0} style={{ flex: 1, minWidth: 250 }}>
                <Space wrap>
                  <PrinterOutlined style={{ color: '#2563eb' }} />
                  <Text strong>Chi tiết Báo Giá {selectedQuotation?.quotation_number}</Text>
                  {isLandEt && <Tag color="purple">📐 Khổ Ngang A4</Tag>}
                  {selectedQuotation?.custom_data?.template_snapshot?.code && (
                    <Tag color="cyan" style={{ fontSize: 11 }}>🔒 {selectedQuotation.custom_data.template_snapshot.name}</Tag>
                  )}
                </Space>
                {expiresAt && (
                  <div style={{ marginTop: 4 }}>
                    {isExpired ? (
                      <Text type="danger" style={{ fontSize: 13, fontWeight: 600 }}>
                        <CloseCircleOutlined /> Link gửi khách đã HẾT HẠN. Vui lòng bấm "Gia hạn" để khách có thể xem lại!
                      </Text>
                    ) : (
                      <Text type={hoursLeft <= 6 ? 'danger' : 'warning'} style={{ fontSize: 13, fontWeight: 600 }}>
                        <ClockCircleOutlined /> Link hết hạn lúc {dayjs(expiresAt).format('HH:mm DD/MM/YYYY')} (Còn {hoursLeft} tiếng) - Hãy gọi điện giục khách ký!
                      </Text>
                    )}
                  </div>
                )}
              </Space>

              <Space wrap>
                {selectedQuotation?.public_token && (isCompanyAdmin || !hasPermission('sales.bypass_customer_signature')) && selectedQuotation?.status !== 'pending_approval' && (!requireApproval || ['approved', 'sent', 'accepted'].includes(selectedQuotation?.status)) && (() => {
                  if (isExpired) {
                    return (
                      <Button
                        type="primary"
                        danger
                        icon={<ClockCircleOutlined />}
                        style={{ fontWeight: 600 }}
                        onClick={() => handleCopyLink(selectedQuotation, true)}
                      >
                        Gia hạn Link 24h
                      </Button>
                    )
                  }
                  return (
                    <Button
                      type="dashed"
                      icon={<SendOutlined />}
                      style={{ color: '#059669', borderColor: '#059669', fontWeight: 600 }}
                      onClick={() => handleCopyLink(selectedQuotation, false)}
                    >
                      Copy Link Gửi Khách
                    </Button>
                  )
                })()}
                {canExportPdf && (
                  <Button
                    type="primary"
                    icon={<PrinterOutlined />}
                    style={{ background: '#1d4ed8', fontWeight: 600, padding: '0 20px' }}
                    onClick={handlePrintOrPDF}
                  >
                    In / Xuất PDF Báo Giá
                  </Button>
                )}
              </Space>
            </div>
          )
        })()}
        width={(() => {
          const et = getEffectiveTemplate(selectedQuotation)
          const targetW = (et?.layout_config?.paper_orientation === 'landscape' || et?.code === 'production_landscape_a4') ? 1080 : 920
          return window.innerWidth < targetW ? '100%' : targetW
        })()}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {selectedQuotation && (() => {
          // Use snapshot template frozen at creation time, fallback to current company template
          const effectiveTemplate = getEffectiveTemplate(selectedQuotation)
          const isLand = effectiveTemplate?.layout_config?.paper_orientation === 'landscape' || effectiveTemplate?.code === 'production_landscape_a4'
          const themeColor = effectiveTemplate?.layout_config?.theme_color || '#1649c9'
          return (
          <QuotationPrintView 
            quotation={selectedQuotation} 
            effectiveTemplate={effectiveTemplate} 
            isCompanyAdmin={isCompanyAdmin} 
            products={products} 
            documentType="quotation"
          />
          )
        })()}
      </Drawer>
    </section>
  )
}
