import {
  AlertOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  InboxOutlined,
  MinusOutlined,
  PictureOutlined,
  PlusOutlined,
  PrinterOutlined,
  SearchOutlined,
  ShopOutlined,
  TagOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
  List,
  Collapse,
  AutoComplete,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../utils/api'
import ProductTemplateTab from './inventory/ProductTemplateTab'
import TransactionPrintView from '../components/TransactionPrintView'
import { useResponsive } from '../hooks/useResponsive'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

export default function Inventory() {
  const { isCompanyAdmin, hasPermission, checkMaintenance, user } = useAuth()
  const { isMobile } = useResponsive()
  const [messageApi, contextHolder] = message.useMessage()

  const [activeTab, setActiveTab] = useState('transactions')

  // Data states
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [factories, setFactories] = useState([])
  const [stockLevels, setStockLevels] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)

  // Filters
  const [searchText, setSearchText] = useState('')
  const location = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const searchQuery = params.get('search')
    if (searchQuery) {
      setSearchText(searchQuery)
      setActiveTab('transactions')
    }
  }, [location.search])
  const [stockSearchText, setStockSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [lowStockThreshold, setLowStockThreshold] = useState(null)
  const [txnSearchText, setTxnSearchText] = useState('')
  const [txnTypeFilter, setTxnTypeFilter] = useState('')
  const [txnStatusFilter, setTxnStatusFilter] = useState('')
  const [txnWarehouseFilter, setTxnWarehouseFilter] = useState('')

  // Modals
  const [productModalVisible, setProductModalVisible] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productImageFile, setProductImageFile] = useState(null)
  const [productPreviewImage, setProductPreviewImage] = useState(null)
  const [productForm] = Form.useForm()

  // Custom unit state
  const [unitOptions, setUnitOptions] = useState(['Cái', 'm²', 'Mét', 'Bộ', 'Lần', 'Chuyến', 'Kg', 'Lít'])
  const [newUnitName, setNewUnitName] = useState('')
  const unitInputRef = useRef(null)

  const onUnitNameChange = (e) => {
    setNewUnitName(e.target.value)
  }
  const addUnitItem = (e) => {
    e.preventDefault()
    const trimmed = newUnitName.trim()
    if (trimmed && !unitOptions.includes(trimmed)) {
      setUnitOptions([...unitOptions, trimmed])
      // Đồng thời cập nhật giá trị vào form để chọn luôn
      productForm.setFieldsValue({ unit: trimmed })
      setNewUnitName('')
      setTimeout(() => {
        unitInputRef.current?.focus()
      }, 0)
    }
  }

  const [categoryModalVisible, setCategoryModalVisible] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [categoryForm] = Form.useForm()

  const [warehouseModalVisible, setWarehouseModalVisible] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState(null)
  const [warehouseForm] = Form.useForm()

  const [transferModalVisible, setTransferModalVisible] = useState(false)
  const [deletingWarehouse, setDeletingWarehouse] = useState(null)
  const [targetWarehouseId, setTargetWarehouseId] = useState(null)

  const [txnModalVisible, setTxnModalVisible] = useState(false)
  const [txnModalMode, setTxnModalMode] = useState('import')
  const [txnForm] = Form.useForm()

  const [exportApproveModalVisible, setExportApproveModalVisible] = useState(false)
  const [selectedExportTxn, setSelectedExportTxn] = useState(null)
  const [approveWarehouseIds, setApproveWarehouseIds] = useState({})
  const [approveFactoryId, setApproveFactoryId] = useState(null)

  const [clearTxnModalVisible, setClearTxnModalVisible] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')

  const [deleteSingleModalVisible, setDeleteSingleModalVisible] = useState(false)
  const [selectedTxnToDelete, setSelectedTxnToDelete] = useState(null)
  const [deleteSingleConfirmText, setDeleteSingleConfirmText] = useState('')

  const [selectedTxnForPrint, setSelectedTxnForPrint] = useState(null)

  // Recreate production order modal
  const [recreateMOTxn, setRecreateMOTxn] = useState(null)
  const [recreateMOLoading, setRecreateMOLoading] = useState(false)

  const [submitting, setSubmitting] = useState(false)

  // Permissions
  const canCreate = hasPermission('inventory.create')
  const canEdit = hasPermission('inventory.edit')
  const canDelete = hasPermission('inventory.delete')
  const canManualExport = hasPermission('inventory.manual_export')

  // ── Fetch Data ────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    try {
      const params = { include_inactive: 'true' }
      if (categoryFilter) params.category_id = categoryFilter
      const res = await api.get('/inventory/products/', { params })
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setProducts(data)
    } catch {
      messageApi.error('Không thể tải danh sách sản phẩm.')
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, messageApi])

  const fetchCategories = useCallback(async () => {
    await Promise.resolve()
    try {
      const res = await api.get('/inventory/product-categories/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setCategories(data)
    } catch {
      // ignore
    }
  }, [])

  const fetchWarehouses = useCallback(async () => {
    await Promise.resolve()
    try {
      const [whRes, facRes] = await Promise.all([
        api.get('/inventory/warehouses/'),
        api.get('/production/factories/')
      ])
      const whData = Array.isArray(whRes.data) ? whRes.data : whRes.data?.results ?? []
      const facData = Array.isArray(facRes.data) ? facRes.data : facRes.data?.results ?? []
      setWarehouses(whData)
      setFactories(facData)
    } catch {
      // ignore
    }
  }, [])

  const fetchStockLevels = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    try {
      const params = {}
      if (warehouseFilter) params.warehouse_id = warehouseFilter
      if (lowStockOnly) {
        params.low_stock = 'true'
        if (lowStockThreshold !== null && lowStockThreshold !== undefined) {
          params.low_stock_threshold = lowStockThreshold
        }
      }
      const res = await api.get('/inventory/stock-levels/', { params })
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setStockLevels(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [warehouseFilter, lowStockOnly, lowStockThreshold])

  const fetchTransactions = useCallback(async () => {
    await Promise.resolve()
    setLoading(true)
    try {
      const res = await api.get('/inventory/transactions/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setTransactions(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  const handleUpdateMinQty = async (stockId, valueStr) => {
    try {
      const val = parseInt(valueStr, 10)
      if (isNaN(val) || val < 0) {
        message.error('Vui lòng nhập số nguyên hợp lệ lớn hơn hoặc bằng 0')
        return
      }
      await api.patch(`/inventory/stock-levels/${stockId}/`, { min_quantity: val })
      message.success('Cập nhật ngưỡng cảnh báo thành công')
      fetchStockLevels()
    } catch (err) {
      console.error(err)
      message.error('Lỗi khi cập nhật ngưỡng cảnh báo')
    }
  }

  useEffect(() => {
    fetchCategories()
    fetchWarehouses()
  }, [fetchCategories, fetchWarehouses])

  useEffect(() => {
    if (activeTab === 'products') fetchProducts()
    else if (activeTab === 'categories') fetchCategories()
    else if (activeTab === 'stock') {
      fetchStockLevels()
      if (products.length === 0) fetchProducts()
    }
    else if (activeTab === 'transactions' || activeTab === 'pending_exports') {
      fetchTransactions()
      if (products.length === 0) fetchProducts()
    }
  }, [activeTab, fetchProducts, fetchCategories, fetchStockLevels, fetchTransactions, products.length])

  // ── Filtered Products ─────────────────────────────────────────────────
  const filteredProducts = products.filter((item) => {
    if (item.product_type === 'service') return false
    if (!searchText) return true
    const name = (item.name || '').toLowerCase()
    const sku = (item.sku || '').toLowerCase()
    const query = searchText.toLowerCase()
    return name.includes(query) || sku.includes(query)
  })

  // ── Filtered Stock Levels ─────────────────────────────────────────────
  const groupedFilteredStockLevels = useMemo(() => {
    const filtered = stockLevels.filter((stk) => {
      if (!stockSearchText.trim()) return true
      const kw = stockSearchText.trim().toLowerCase()
      const prod = products.find((p) => p.id === stk.product)
      const name = (prod?.name || stk.product_name || '').toLowerCase()
      const sku = (prod?.sku || stk.product_sku || '').toLowerCase()
      return name.includes(kw) || sku.includes(kw)
    })

    const groups = {}
    filtered.forEach(stk => {
      if (!groups[stk.product]) {
        groups[stk.product] = {
          ...stk,
          id: `prod_${stk.product}`, // Unique key for the parent row
          items: []
        }
      }
      groups[stk.product].items.push(stk)
    })

    return Object.values(groups)
  }, [stockLevels, stockSearchText, products])

  // ── Filtered Transactions ─────────────────────────────────────────────
  const groupedFilteredTransactions = useMemo(() => {
    const filtered = transactions.filter((txn) => {

      let match = true
      if (txnTypeFilter) {
        match = match && txn.type === txnTypeFilter
      }
      if (txnStatusFilter) {
        if (txnStatusFilter === 'deleted_mo') {
          match = match && txn.type === 'export' && txn.status === 'completed' && txn.reference_order && txn.has_production_order === false
        } else {
          match = match && txn.status === txnStatusFilter
        }
      }
      if (txnWarehouseFilter) {
        match = match && txn.warehouse === txnWarehouseFilter
      }
      if (txnSearchText.trim()) {
        const kw = txnSearchText.trim().toLowerCase()
        const code = (txn.transaction_code || '').toLowerCase()
        const prod = products.find((p) => p.id === txn.product)
        const name = (prod?.name || txn.product_name || '').toLowerCase()
        const sku = (prod?.sku || txn.product_sku || '').toLowerCase()
        const refOrder = (txn.reference_order_number || '').toLowerCase()
        match = match && (code.includes(kw) || name.includes(kw) || sku.includes(kw) || refOrder.includes(kw))
      }
      return match
    })

    const groups = {}
    filtered.forEach(txn => {
      if (!groups[txn.transaction_code]) {
        groups[txn.transaction_code] = {
          ...txn,
          id: txn.transaction_code, // Use transaction_code as unique key for the parent row
          items: []
        }
      }
      groups[txn.transaction_code].items.push(txn)
    })
    return Object.values(groups)
  }, [transactions, txnStatusFilter, txnTypeFilter, txnWarehouseFilter, txnSearchText, products])

  const pendingExports = transactions.filter((txn) => txn.type === 'export' && txn.status === 'pending')
  const pendingOrdersCount = new Set(pendingExports.map(t => t.transaction_code)).size

  // Kiểm tra xem trong lịch sử có phiếu xuất kho nào có nhà máy không
  const hasFactoryInHistory = transactions.some(t => t.factory_name)

  const handleOpenApproveExport = (txn) => {
    setSelectedExportTxn(txn)
    setApproveWarehouseIds({})
    setApproveFactoryId(null)
    fetchStockLevels()
    setExportApproveModalVisible(true)
  }

  const handleApproveExport = async () => {
    const txnsToApprove = selectedExportTxn.items || [selectedExportTxn]
    const missing = txnsToApprove.some(txn => !approveWarehouseIds[txn.id])
    if (missing) {
      messageApi.error('Vui lòng chọn kho xuất cho tất cả sản phẩm.')
      return
    }

    // Validate stock on frontend before any API calls to prevent partial failures
    for (const txn of txnsToApprove) {
      const wId = approveWarehouseIds[txn.id]
      const stock = stockLevels.find(s => Number(s.warehouse) === Number(wId) && Number(s.product) === Number(txn.product))
      const qty = stock ? Number(stock.quantity) : 0
      const reqQty = Number(txn.quantity)
      if (qty < reqQty) {
        const prod = products.find(p => p.id === txn.product)
        messageApi.error(`Sản phẩm ${txn.product_name || prod?.name || ''} không đủ tồn kho ở kho đã chọn!`)
        return
      }
    }
    
    setSubmitting(true)
    try {
      await Promise.all(txnsToApprove.map(txn => 
        api.post(`/inventory/transactions/${txn.id}/approve/`, { 
          warehouse_id: approveWarehouseIds[txn.id],
          factory_id: approveFactoryId
        })
      ))
      messageApi.success('Duyệt xuất kho thành công!')
      setExportApproveModalVisible(false)
      fetchTransactions()
      window.dispatchEvent(new Event('refresh-notifications'))
      fetchStockLevels()
    } catch (err) {
      messageApi.error(err.response?.data?.detail || 'Không đủ tồn kho hoặc lỗi hệ thống.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRejectExport = async (txn) => {
    try {
      const txnsToReject = txn.items || [txn]
      await Promise.all(txnsToReject.map(t => api.post(`/inventory/transactions/${t.id}/reject/`)))
      messageApi.success('Đã từ chối lệnh xuất kho.')
      fetchTransactions()
      window.dispatchEvent(new Event('refresh-notifications'))
    } catch (err) {
      messageApi.error('Từ chối thất bại.')
    }
  }

  const handleRecreateMO = async () => {
    if (!recreateMOTxn) return
    setRecreateMOLoading(true)
    try {
      // Nếu là nhóm phiếu (items), dùng id của phiếu đầu tiên
      const txnId = recreateMOTxn.items ? recreateMOTxn.items[0].id : recreateMOTxn.id
      const res = await api.post(`/inventory/transactions/${txnId}/recreate-production-order/`)
      const poCode = res.data?.production_order_code
      messageApi.success(
        poCode
          ? `✅ Đã tạo lại Lệnh Sản Xuất: ${poCode}`
          : '✅ Đã tạo lại Lệnh Sản Xuất thành công.'
      )
      setRecreateMOTxn(null)
      fetchTransactions()
      window.dispatchEvent(new Event('refresh-notifications'))
    } catch (err) {
      const msg = err.response?.data?.detail || 'Tạo lại lệnh sản xuất thất bại.'
      messageApi.error(msg)
    } finally {
      setRecreateMOLoading(false)
    }
  }

  // ── Product Handlers ──────────────────────────────────────────────────
  const openProductModal = (prod = null) => {
    if (checkMaintenance()) return
    setEditingProduct(prod)
    setProductImageFile(null)
    if (prod) {
      setProductPreviewImage(prod.image_url || prod.image || null)
      productForm.setFieldsValue({
        sku: prod.sku,
        name: prod.name,
        category: prod.category,
        unit: prod.unit || 'cái',
        price: Number(prod.price || 0),
        cost_price: Number(prod.cost_price || 0),
        is_active: prod.is_active !== false,
        description: prod.description || '',
      })
    } else {
      setProductPreviewImage(null)
      productForm.resetFields()
      productForm.setFieldsValue({ unit: 'cái', price: 0, cost_price: 0, is_active: true })
    }
    setProductModalVisible(true)
  }

  const handleProductSubmit = async () => {
    try {
      const values = await productForm.validateFields()
      setSubmitting(true)

      const formData = new FormData()
      formData.append('sku', values.sku)
      formData.append('name', values.name)
      formData.append('category', values.category)
      formData.append('unit', values.unit || 'cái')
      formData.append('price', values.price || 0)
      formData.append('cost_price', values.cost_price || 0)
      formData.append('description', values.description || '')
      formData.append('is_active', values.is_active !== false)
      if (productImageFile) {
        formData.append('image', productImageFile)
      }

      if (editingProduct) {
        await api.patchForm(`/inventory/products/${editingProduct.id}/`, formData)
        messageApi.success('Cập nhật sản phẩm thành công!')
      } else {
        await api.postForm('/inventory/products/', formData)
        messageApi.success('Thêm sản phẩm mới thành công!')
      }
      setProductModalVisible(false)
      fetchProducts()
    } catch (error) {
      if (error.errorFields) return
      messageApi.error('Lưu sản phẩm thất bại. Vui lòng kiểm tra lại mã SKU.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleProductDelete = async (id) => {
    if (checkMaintenance()) return
    try {
      await api.delete(`/inventory/products/${id}/`)
      messageApi.success('Đã xoá sản phẩm.')
      fetchProducts()
    } catch {
      messageApi.error('Không thể xoá sản phẩm này vì đang được sử dụng trong đơn hàng hoặc báo giá.')
    }
  }

  // ── Category Handlers ─────────────────────────────────────────────────
  const openCategoryModal = (cat = null) => {
    if (checkMaintenance()) return
    setEditingCategory(cat)
    if (cat) {
      categoryForm.setFieldsValue({ name: cat.name, description: cat.description || '' })
    } else {
      categoryForm.resetFields()
    }
    setCategoryModalVisible(true)
  }

  const handleCategorySubmit = async () => {
    try {
      const values = await categoryForm.validateFields()
      setSubmitting(true)
      if (editingCategory) {
        await api.patch(`/inventory/product-categories/${editingCategory.id}/`, values)
        messageApi.success('Cập nhật danh mục thành công!')
      } else {
        await api.post('/inventory/product-categories/', values)
        messageApi.success('Thêm danh mục thành công!')
      }
      setCategoryModalVisible(false)
      fetchCategories()
    } catch {
      messageApi.error('Lưu danh mục thất bại. Tên danh mục có thể đã tồn tại.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCategoryDelete = async (id) => {
    if (checkMaintenance()) return
    try {
      await api.delete(`/inventory/product-categories/${id}/`)
      messageApi.success('Đã xoá danh mục.')
      fetchCategories()
    } catch {
      messageApi.error('Không thể xoá danh mục này vì đang chứa sản phẩm.')
    }
  }

  // ── Warehouse Handlers ────────────────────────────────────────────────
  const openWarehouseModal = (wh = null) => {
    if (checkMaintenance()) return
    setEditingWarehouse(wh)
    if (wh) {
      warehouseForm.setFieldsValue({ name: wh.name, location: wh.location || '', is_active: wh.is_active !== false })
    } else {
      warehouseForm.resetFields()
      warehouseForm.setFieldsValue({ is_active: true })
    }
    setWarehouseModalVisible(true)
  }

  const handleWarehouseSubmit = async () => {
    try {
      const values = await warehouseForm.validateFields()
      setSubmitting(true)
      if (editingWarehouse) {
        await api.patch(`/inventory/warehouses/${editingWarehouse.id}/`, values)
        messageApi.success('Cập nhật kho thành công!')
      } else {
        await api.post('/inventory/warehouses/', values)
        messageApi.success('Thêm kho thành công!')
      }
      setWarehouseModalVisible(false)
      fetchWarehouses()
    } catch {
      messageApi.error('Lưu thông tin kho thất bại.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleWarehouseDelete = async (id) => {
    if (checkMaintenance()) return
    try {
      await api.delete(`/inventory/warehouses/${id}/`)
      messageApi.success('Đã xoá kho hàng thành công.')
      fetchWarehouses()
      fetchStockLevels()
    } catch (error) {
      if (error.response?.data?.has_stock) {
        const wh = warehouses.find((w) => w.id === id)
        setDeletingWarehouse(wh || { id, name: `Kho #${id}` })
        setTargetWarehouseId(null)
        setTransferModalVisible(true)
      } else {
        messageApi.error(error.response?.data?.detail || 'Không thể xoá kho hàng này vì đang có sản phẩm tồn kho.')
      }
    }
  }

  const handleConfirmTransferAndDelete = async () => {
    if (checkMaintenance()) return
    if (!targetWarehouseId) {
      messageApi.warning('Vui lòng chọn kho nhận sản phẩm!')
      return
    }
    if (!deletingWarehouse) return
    setSubmitting(true)
    try {
      await api.delete(`/inventory/warehouses/${deletingWarehouse.id}/?target_warehouse_id=${targetWarehouseId}`)
      messageApi.success('Đã chuyển toàn bộ sản phẩm sang kho mới và xoá kho thành công!')
      setTransferModalVisible(false)
      setDeletingWarehouse(null)
      fetchWarehouses()
      fetchStockLevels()
      fetchTransactions()
    } catch (err) {
      messageApi.error(err.response?.data?.detail || 'Chuyển kho và xoá thất bại.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmClearAllTxn = async () => {
    if (checkMaintenance()) return
    if (clearConfirmText !== 'XOA TOAN BO') {
      messageApi.error('Xác nhận không hợp lệ. Vui lòng nhập đúng: XOA TOAN BO')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.delete('/inventory/transactions/clear-history/')
      messageApi.success(res.data?.detail || 'Đã xoá toàn bộ lịch sử giao dịch kho.')
      setClearTxnModalVisible(false)
      setClearConfirmText('')
      fetchTransactions()
    } catch {
      messageApi.error('Không thể xoá toàn bộ lịch sử giao dịch.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSingleTxnClick = (txn) => {
    setSelectedTxnToDelete(txn)
    setDeleteSingleConfirmText('')
    setDeleteSingleModalVisible(true)
  }

  const handleConfirmDeleteSingleTxn = async () => {
    if (checkMaintenance()) return
    if (deleteSingleConfirmText !== 'XOA GIAO DICH') {
      messageApi.error('Xác nhận không hợp lệ. Vui lòng nhập đúng: XOA GIAO DICH')
      return
    }
    setSubmitting(true)
    try {
      await api.delete('/inventory/transactions/delete-by-code/', {
        params: { code: selectedTxnToDelete.transaction_code }
      })
      messageApi.success('Đã xoá giao dịch kho.')
      setDeleteSingleModalVisible(false)
      setSelectedTxnToDelete(null)
      fetchTransactions()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Không thể xoá giao dịch.'
      messageApi.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Transaction (Nhập kho / Điều chỉnh / Xuất kho) Handlers ──────────────────────
  const openTxnModal = (defaultType = 'import') => {
    if (checkMaintenance()) return
    txnForm.resetFields()
    setTxnModalMode(defaultType)
    txnForm.setFieldsValue({ 
      type: defaultType, 
      items: [{ product: null, quantity: 1, unit_cost: 0 }]
    })
    setTxnModalVisible(true)
  }

  const handlePrintTxn = (txn) => {
    setSelectedTxnForPrint(txn)
    setTimeout(() => {
      const contentEl = document.querySelector('.printable-transaction-content')
      if (!contentEl) {
        window.print()
        return
      }

      const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map((el) => el.outerHTML)
        .join('\n')

      const printWin = window.open('', '_blank', 'width=1180,height=850')
      if (!printWin) {
        window.print()
        return
      }

      printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${txn.transaction_code}</title>
          ${styleTags}
          <style>
            @media print {
              body, html, .printable-transaction-content {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                width: 100% !important;
                height: auto !important;
                overflow: visible !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .printable-transaction-content {
                width: 100% !important;
                max-width: 100% !important;
                height: auto !important;
                margin: 0 auto !important;
              }
              /* Prevent page breaks inside important sections */
              .transaction-print-table tr {
                page-break-inside: avoid;
              }
              .signature-section {
                page-break-inside: avoid;
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
    }, 100)
  }

  const handleTxnSubmit = async () => {
    try {
      const values = await txnForm.validateFields()
      setSubmitting(true)
      await api.post('/inventory/transactions/bulk-create/', values)
      messageApi.success('Tạo phiếu kho thành công! Tồn kho đã được tự động cập nhật.')
      setTxnModalVisible(false)
      fetchTransactions()
      fetchStockLevels()
    } catch (error) {
      if (error.errorFields) return
      console.error(error.response?.data)
      const errDetail = error.response?.data ? JSON.stringify(error.response.data) : 'Tạo phiếu kho thất bại.'
      messageApi.error(errDetail)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Columns for Products ──────────────────────────────────────────────
  const productColumns = [
    {
      title: 'Mã SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 130,
      render: (val) => <Tag color="blue" style={{ fontWeight: 600 }}>{val}</Tag>,
    },
    {
      title: 'Hình ảnh',
      key: 'image',
      width: 95,
      align: 'center',
      render: (_, r) => {
        const imgUrl = r.image_url || r.image
        return imgUrl ? (
          <img src={imgUrl} alt={r.name} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
        ) : (
          <div style={{ width: 48, height: 48, background: '#f1f5f9', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 11, margin: '0 auto' }}>
            No Img
          </div>
        )
      },
    },
    {
      title: 'Tên sản phẩm / Dịch vụ',
      dataIndex: 'name',
      key: 'name',
      width: 300,
      render: (val, r) => (
        <div>
          <Text strong style={{ display: 'block', fontSize: 14, color: '#0f172a' }}>{val || r.template_name || 'Sản phẩm'}</Text>
          {r.attributes && Object.keys(r.attributes).length > 0 && (
            <Space size={[0, 4]} wrap style={{ marginTop: 4, marginBottom: 4 }}>
              {Object.entries(r.attributes).map(([k, v]) => (
                <Tag key={k} color="purple">{k}: {v}</Tag>
              ))}
            </Space>
          )}
          {r.description && <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{r.description}</Text>}
        </div>
      ),
    },
    {
      title: 'Loại sản phẩm',
      dataIndex: 'category',
      key: 'category',
      width: 160,
      render: (catId) => {
        const cat = categories.find((c) => c.id === catId)
        return <Tag color="cyan">{cat ? cat.name : 'Chưa phân loại'}</Tag>
      },
    },
    {
      title: 'Đơn vị',
      dataIndex: 'unit',
      key: 'unit',
      width: 90,
      align: 'center',
      render: (v) => <Tag>{v || 'cái'}</Tag>,
    },
    {
      title: 'Giá bán',
      dataIndex: 'price',
      key: 'price',
      width: 140,
      align: 'right',
      render: (v) => (
        <Text strong style={{ color: '#16a34a' }}>
          {Number(v || 0).toLocaleString('vi-VN')} đ
        </Text>
      ),
    },
    {
      title: 'Giá nhập (Vốn)',
      dataIndex: 'cost_price',
      key: 'cost_price',
      width: 140,
      align: 'right',
      render: (v) => <Text type="secondary">{Number(v || 0).toLocaleString('vi-VN')} đ</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 130,
      align: 'center',
      render: (v) =>
        v !== false ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>Kinh doanh</Tag>
        ) : (
          <Tag color="default" icon={<CloseCircleOutlined />}>Ngừng KD</Tag>
        ),
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 110,
      align: 'right',
      fixed: 'right',
      render: (_, record) => (
        <Space>
          {canEdit && (
            <Button
              type="text"
              icon={<EditOutlined style={{ color: '#d97706' }} />}
              onClick={() => openProductModal(record)}
            />
          )}
          {canDelete && (
            <Popconfirm
              title="Xoá sản phẩm?"
              description="Bạn có chắc chắn muốn xoá sản phẩm này không?"
              onConfirm={() => handleProductDelete(record.id)}
              okText="Xoá"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  // ── Columns for Stock Levels ──────────────────────────────────────────
  const stockColumns = [
    {
      title: 'Sản phẩm',
      key: 'product',
      render: (_, r) => {
        const prod = products.find((p) => p.id === r.product)
        return prod ? <Text strong>{prod.name} ({prod.sku})</Text> : <Text>SP #{r.product}</Text>
      },
    },
    {
      title: 'Kho hàng',
      key: 'warehouse',
      render: (_, r) => {
        if (r.items && r.items.length > 1) {
          return <Tag color="geekblue">{r.items.length} kho hàng</Tag>
        }
        const actualWh = r.items ? r.items[0].warehouse : r.warehouse
        const wh = warehouses.find((w) => w.id === actualWh)
        return <Tag color="geekblue" icon={<ShopOutlined />}>{wh ? wh.name : `Kho #${actualWh}`}</Tag>
      },
    },
    {
      title: 'Số lượng tồn kho thực tế',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'center',
      render: (_, r) => {
        const totalQty = r.items ? r.items.reduce((sum, item) => sum + item.quantity, 0) : r.quantity
        const isLow = r.is_low_stock || totalQty <= r.min_quantity
        return (
          <Space>
            <Text strong style={{ fontSize: 16, color: isLow ? '#dc2626' : '#16a34a' }}>
              {totalQty}
            </Text>
            {isLow && <Tag color="error" icon={<AlertOutlined />}>Tồn kho thấp</Tag>}
          </Space>
        )
      },
    },
    {
      title: 'Ngưỡng cảnh báo min',
      dataIndex: 'min_quantity',
      key: 'min_quantity',
      align: 'center',
      render: (_, r) => {
        if (r.items && r.items.length > 1) {
          return <Text type="secondary">-</Text>
        }
        const stockId = r.items ? r.items[0].id : r.id
        const currentVal = r.items ? r.items[0].min_quantity : r.min_quantity
        return (
          <Text 
            type="secondary"
            editable={{
              onChange: (val) => handleUpdateMinQty(stockId, val),
              tooltip: 'Click để sửa ngưỡng'
            }}
          >
            {currentVal || 0}
          </Text>
        )
      },
    },
  ]

  // ── Columns for Transactions ──────────────────────────────────────────
  const pendingTxnColumns = [
    {
      title: 'Mã phiếu',
      dataIndex: 'transaction_code',
      key: 'transaction_code',
      render: (val) => <Tag color="purple" style={{ fontWeight: 600 }}>{val}</Tag>,
    },
    {
      title: 'Sản phẩm',
      dataIndex: 'product',
      key: 'product',
      render: (id) => {
        const p = products.find((item) => item.id === id)
        return p ? <Text strong>{p.name}</Text> : `SP #${id}`
      },
    },
    {
      title: 'Số lượng',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'center',
      render: (v, r) => (
        <Text strong style={{ color: '#0f172a' }}>
          {v} {products.find(p => p.id === r.product)?.unit || 'cái'}
        </Text>
      ),
    },
    {
      title: 'Ghi chú',
      dataIndex: 'note',
      key: 'note',
      width: 250,
    },
    {
      title: 'Hành động',
      key: 'action',
      align: 'right',
      render: (_, record) => (
        <Space>
          {(isCompanyAdmin || hasPermission('inventory.approve_export')) && (
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleOpenApproveExport(record)}
              style={{ background: '#16a34a', borderColor: '#16a34a' }}
            >
              Duyệt xuất
            </Button>
          )}
          {(isCompanyAdmin || hasPermission('inventory.approve_export')) && (
            <Popconfirm
              title="Từ chối lệnh xuất?"
              onConfirm={() => handleRejectExport(record.id)}
              okText="Từ chối"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button danger size="small" icon={<CloseCircleOutlined />}>Từ chối</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  const renderTxnActions = (r) => {
    const canApprove = isCompanyAdmin || hasPermission('inventory.approve_export')
    const isPendingExport = r.status === 'pending' && r.type === 'export'
    
    return (
      <Space wrap size={8}>
        {canApprove && isPendingExport && (
          <Button
            type="primary"
            size="small"
            icon={<CheckCircleOutlined />}
            onClick={() => handleOpenApproveExport(r)}
            style={{ background: '#16a34a', borderColor: '#16a34a' }}
            title="Duyệt xuất"
          />
        )}
        {canApprove && isPendingExport && (
          <Popconfirm
            title="Từ chối lệnh xuất?"
            onConfirm={() => handleRejectExport(r)}
            okText="Từ chối"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button danger size="small" icon={<CloseCircleOutlined />} title="Từ chối" />
          </Popconfirm>
        )}
        <Button
          type="text"
          icon={<PrinterOutlined />}
          onClick={() => handlePrintTxn(r)}
          title="Thông tin chi tiết"
        />
        {hasPermission('inventory.delete_history') && (
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteSingleTxnClick(r)}
            title="Xoá giao dịch"
          />
        )}
      </Space>
    )
  }

  const txnColumns = [
    {
      title: 'Mã phiếu',
      dataIndex: 'transaction_code',
      key: 'transaction_code',
      render: (val, r) => (
        <Space direction="vertical" size={2}>
          <Tag color="purple" style={{ fontWeight: 600, margin: 0 }}>{val}</Tag>
          {r.reference_order_number && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              ĐH: {r.reference_order_number}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status_display',
      key: 'status',
      render: (val, r) => {
        if (r.status === 'pending') return <Tag color="warning">{val || 'Chờ duyệt'}</Tag>
        if (r.status === 'rejected') return <Tag color="default">{val || 'Đã hủy'}</Tag>
        // Phiếu xuất hoàn thành: kiểm tra lệnh SX
        const completedTag = <Tag color="success">{val || 'Hoàn thành'}</Tag>
        if (r.type === 'export' && r.status === 'completed' && r.reference_order && r.has_production_order === false) {
          const canRecreateMO = isCompanyAdmin || hasPermission('production.create')
          return (
            <Space size={4} wrap>
              {completedTag}
              <Tag
                color="red"
                icon={<ExclamationCircleOutlined />}
                style={{
                  cursor: canRecreateMO ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  opacity: canRecreateMO ? 1 : 0.75,
                }}
                title={canRecreateMO ? 'Nhấn để tạo lại Lệnh Sản Xuất' : 'Bạn không có quyền tạo lệnh sản xuất'}
                onClick={() => canRecreateMO && setRecreateMOTxn(r)}
              >
                Lệnh SX bị xóa!
              </Tag>
            </Space>
          )
        }
        return completedTag
      },
    },
    {
      title: 'Loại phiếu',
      dataIndex: 'type',
      key: 'type',
      render: (val) => {
        if (val === 'import') return <Tag color="success">Nhập kho</Tag>
        if (val === 'export') return <Tag color="error">Xuất kho</Tag>
        if (val === 'transfer') return <Tag color="blue">Điều chuyển</Tag>
        return <Tag color="warning">Điều chỉnh</Tag>
      },
    },
    {
      title: 'Sản phẩm',
      dataIndex: 'product',
      key: 'product',
      render: (_, record) => {
        if (record.items && record.items.length > 1) {
          return <Text strong style={{ color: '#0284c7' }}>{record.items.length} sản phẩm</Text>
        }
        const id = record.items ? record.items[0].product : record.product
        const p = products.find((item) => item.id === id)
        const txnName = record.items ? record.items[0].product_name : record.product_name
        return p ? <Text strong>{txnName || p.name}</Text> : `SP #${id}`
      },
    },
    {
      title: 'Kho',
      dataIndex: 'warehouse',
      key: 'warehouse',
      render: (id, record) => {
        const w = warehouses.find((item) => item.id === id)
        const name = w ? w.name : `Kho #${id}`
        
        if (record.type === 'transfer' && record.target_warehouse) {
          const targetW = warehouses.find((item) => item.id === record.target_warehouse)
          const targetName = targetW ? targetW.name : `Kho #${record.target_warehouse}`
          return (
            <Space size={4}>
              <Tag>{name}</Tag> ➔ <Tag color="blue">{targetName}</Tag>
            </Space>
          )
        }
        
        return <Tag>{name}</Tag>
      },
    },
    {
      title: 'Số lượng',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'center',
      render: (_, r) => {
        const totalQty = r.items ? r.items.reduce((sum, item) => sum + item.quantity, 0) : r.quantity
        return (
          <Text strong style={{ color: r.type === 'export' ? '#dc2626' : '#16a34a', fontSize: 15 }}>
            {r.type === 'export' ? `-${totalQty}` : `+${totalQty}`}
          </Text>
        )
      },
    },
    {
      title: 'Ghi chú',
      dataIndex: 'note',
      key: 'note',
      width: 250,
      render: (v) => <Text type="secondary">{v || '—'}</Text>,
    },
    ...(hasFactoryInHistory ? [{
      title: 'Nhà máy sản xuất',
      dataIndex: 'factory_name',
      key: 'factory_name',
      render: (v) => v ? <Tag color="orange">{v}</Tag> : null,
    }] : []),
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val) => dayjs(val).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Thao tác',
      key: 'action',
      align: 'right',
      render: (_, r) => renderTxnActions(r),
    },
  ]

  return (
    <section>
      {contextHolder}

      {/* ── Page Header ────────────────────────────────────────────────── */}
      <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={10}>
          <Title level={3} style={{ margin: 0, fontWeight: 800 }}>
            <DatabaseOutlined style={{ color: '#0284c7', marginRight: 10 }} />
            Quản lý Kho Vận
          </Title>
          <Text type="secondary">
            Kiểm soát tồn kho theo thời gian thực và lịch sử biến động kho.
          </Text>
        </Col>
        <Col xs={24} md={14} style={{ textAlign: isMobile ? 'left' : 'right' }}>
          <Space wrap style={{ justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
            {activeTab === 'transactions' && canCreate && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openTxnModal('import')}
                style={{ background: '#16a34a', fontWeight: 600, borderRadius: 8 }}
              >
                Tạo Phiếu Nhập / Điều Chỉnh
              </Button>
            )}
            {activeTab === 'transactions' && canManualExport && (
              <Button
                type="primary"
                icon={<MinusOutlined />}
                onClick={() => openTxnModal('export')}
                style={{ background: '#ea580c', fontWeight: 600, borderRadius: 8 }}
              >
                Tạo Phiếu Xuất Kho
              </Button>
            )}
            {activeTab === 'transactions' && hasPermission('inventory.transfer') && (
              <Button
                type="primary"
                icon={<TagOutlined />}
                onClick={() => openTxnModal('transfer')}
                style={{ background: '#3b82f6', fontWeight: 600, borderRadius: 8 }}
              >
                Điều chuyển kho
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {/* ── Pending Approvals Notification ───────────────────────────────────────────────────────── */}
      {pendingOrdersCount > 0 && (
        <div style={{ marginBottom: 16, padding: '16px 20px', background: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)', borderRadius: 12, border: '1px solid #fecdd3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(225, 29, 72, 0.1)' }}>
          <Space size={16}>
            <div style={{ background: '#f43f5e', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(244, 63, 94, 0.3)' }}>
              <AlertOutlined style={{ color: '#fff', fontSize: 20 }} />
            </div>
            <Space direction="vertical" size={0}>
              <Text strong style={{ color: '#be123c', fontSize: 16 }}>
                Bạn có {pendingOrdersCount} lệnh xuất kho đang chờ phê duyệt!
              </Text>
              <Text type="secondary" style={{ color: '#9f1239', fontSize: 13 }}>
                Vui lòng kiểm tra và phê duyệt để nhân viên tiến hành xuất kho.
              </Text>
            </Space>
          </Space>
          <Button 
            type="primary" 
            danger 
            size="middle" 
            onClick={() => {
              setActiveTab('transactions')
              setTxnStatusFilter('pending')
            }}
            style={{ fontWeight: 600, borderRadius: 8, padding: '0 24px', height: 40 }}
          >
            Xem danh sách
          </Button>
        </div>
      )}

      {/* ── Tabs / Collapse ───────────────────────────────────────────────────────── */}
      <Card style={{ borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }} bodyStyle={{ padding: 16 }}>
        {(() => {
          const tabItems = [
            {
              key: 'transactions',
              label: (
                <Space>
                  <HistoryOutlined />
                  <span>Lịch Sử Giao Dịch Kho</span>
                </Space>
              ),
              children: (
                <div>
                  <Row gutter={16} align="middle" justify="space-between" style={{ marginBottom: 16 }}>
                    <Col xs={24} lg={18}>
                      <Row gutter={[8, 8]}>
                        <Col xs={24} sm={12} md={8}>
                          <Input
                            placeholder="Tìm mã phiếu, mã ĐH, SP..."
                            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                            value={txnSearchText}
                            onChange={(e) => setTxnSearchText(e.target.value)}
                            allowClear
                            style={{ borderRadius: 8, width: '100%' }}
                          />
                        </Col>
                        <Col xs={12} sm={6} md={4}>
                          <Select
                            placeholder="Loại phiếu"
                            value={txnTypeFilter || undefined}
                            onChange={(val) => setTxnTypeFilter(val || '')}
                            allowClear
                            style={{ width: '100%' }}
                          >
                            <Option value="import">Nhập kho</Option>
                            <Option value="export">Xuất kho</Option>
                            <Option value="adjust">Điều chỉnh</Option>
                          </Select>
                        </Col>
                        <Col xs={12} sm={6} md={4}>
                          <Select
                            placeholder="Trạng thái"
                            value={txnStatusFilter || undefined}
                            onChange={(val) => setTxnStatusFilter(val || '')}
                            allowClear
                            style={{ width: '100%' }}
                          >
                            <Option value="completed">Hoàn thành</Option>
                            <Option value="pending">Chờ duyệt</Option>
                            <Option value="rejected">Đã hủy</Option>
                            <Option value="deleted_mo">Lệnh SX bị xóa!</Option>
                          </Select>
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                          <Select
                            placeholder="Chọn kho hàng..."
                            value={txnWarehouseFilter || undefined}
                            onChange={(val) => setTxnWarehouseFilter(val || '')}
                            allowClear
                            style={{ width: '100%' }}
                          >
                            {warehouses.map((w) => (
                              <Option key={w.id} value={w.id}>{w.name}</Option>
                            ))}
                          </Select>
                        </Col>
                      </Row>
                    </Col>
                     {(isCompanyAdmin || hasPermission('inventory.delete_history')) && transactions.length > 0 && (
                      <Col xs={24} lg={6} style={{ textAlign: isMobile ? 'left' : 'right', marginTop: isMobile ? 8 : 0 }}>
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => setClearTxnModalVisible(true)}
                        >
                          Xoá Toàn Bộ Lịch Sử ({transactions.length})
                        </Button>
                      </Col>
                    )}
                  </Row>
                  {isMobile ? (
                    <List
                      dataSource={groupedFilteredTransactions}
                      loading={loading}
                      pagination={{ pageSize: 10, size: 'small' }}
                      renderItem={(r) => {
                        let statusTag
                        if (r.status === 'pending') statusTag = <Tag color="warning">{r.status_display || 'Chờ duyệt'}</Tag>
                        else if (r.status === 'rejected') statusTag = <Tag color="default">{r.status_display || 'Đã hủy'}</Tag>
                        else {
                          const completedTag = <Tag color="success">{r.status_display || 'Hoàn thành'}</Tag>
                          if (r.type === 'export' && r.status === 'completed' && r.reference_order && r.has_production_order === false) {
                            const canRecreateMO = isCompanyAdmin || hasPermission('production.create')
                            statusTag = (
                              <Space size={4} wrap>
                                {completedTag}
                                <Tag
                                  color="red"
                                  icon={<ExclamationCircleOutlined />}
                                  style={{
                                    cursor: canRecreateMO ? 'pointer' : 'not-allowed',
                                    fontWeight: 600,
                                    opacity: canRecreateMO ? 1 : 0.75,
                                  }}
                                  title={canRecreateMO ? 'Nhấn để tạo lại Lệnh Sản Xuất' : 'Bạn không có quyền tạo lệnh sản xuất'}
                                  onClick={() => canRecreateMO && setRecreateMOTxn(r)}
                                >
                                  Lệnh SX bị xóa!
                                </Tag>
                              </Space>
                            )
                          } else {
                            statusTag = completedTag
                          }
                        }

                        let typeTag
                        if (r.type === 'import') typeTag = <Tag color="success">Nhập kho</Tag>
                        else if (r.type === 'export') typeTag = <Tag color="error">Xuất kho</Tag>
                        else if (r.type === 'transfer') typeTag = <Tag color="blue">Điều chuyển</Tag>
                        else typeTag = <Tag color="warning">Điều chỉnh</Tag>

                        let qtyDisplay
                        const totalQty = r.items ? r.items.reduce((sum, item) => sum + item.quantity, 0) : r.quantity
                        if (r.type === 'export') {
                          qtyDisplay = <Text strong style={{ color: '#dc2626', fontSize: 15 }}>-{totalQty}</Text>
                        } else {
                          qtyDisplay = <Text strong style={{ color: '#16a34a', fontSize: 15 }}>+{totalQty}</Text>
                        }

                        let prodDisplay = ''
                        if (r.items && r.items.length > 1) {
                          prodDisplay = <Text strong style={{ color: '#0284c7' }}>{r.items.length} sản phẩm</Text>
                        } else {
                          const id = r.items ? r.items[0].product : r.product
                          const p = products.find((item) => item.id === id)
                          const txnName = r.items ? r.items[0].product_name : r.product_name
                          prodDisplay = p ? <Text strong>{txnName || p.name}</Text> : `SP #${id}`
                        }

                        return (
                          <List.Item
                            style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                              <Text strong style={{ color: '#2563eb' }}>{r.transaction_code}</Text>
                              {statusTag}
                            </div>
                            <div style={{ marginBottom: 4 }}>
                              <Text type="secondary" style={{ fontSize: 13 }}>Loại phiếu: </Text>
                              {typeTag}
                            </div>
                            <div style={{ marginBottom: 4 }}>
                              <Text type="secondary" style={{ fontSize: 13 }}>Sản phẩm: </Text>
                              {prodDisplay}
                            </div>
                            <div style={{ marginBottom: 12 }}>
                              <Text type="secondary" style={{ fontSize: 13 }}>Số lượng: </Text>
                              {qtyDisplay}
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              {renderTxnActions(r)}
                            </div>
                          </List.Item>
                        )
                      }}
                    />
                  ) : (
                    <Table
                      columns={txnColumns}
                      dataSource={groupedFilteredTransactions}
                      rowKey="id"
                      loading={loading}
                      pagination={{ pageSize: 10 }}
                      scroll={{ x: 'max-content' }}
                      expandable={{
                        expandedRowRender: (record) => {
                          if (!record.items || record.items.length <= 1) return null;
                          return (
                            <Table
                              dataSource={record.items}
                              pagination={false}
                              rowKey="id"
                              size="small"
                              columns={[
                                { 
                                  title: 'Sản phẩm', 
                                  dataIndex: 'product', 
                                  render: (id, r) => {
                                    const p = products.find((item) => item.id === id)
                                    return p ? <Text strong>{r.product_name || p.name} <Text type="secondary" style={{fontWeight: 'normal'}}>({p.sku})</Text></Text> : `SP #${id}`
                                  } 
                                },
                                { 
                                  title: 'Số lượng', 
                                  dataIndex: 'quantity', 
                                  render: (qty) => <Text strong>{qty}</Text> 
                                },
                                { 
                                  title: 'Đơn giá', 
                                  dataIndex: 'unit_cost', 
                                  render: (cost) => <Text>{Number(cost || 0).toLocaleString('vi-VN')} đ</Text> 
                                },
                                { 
                                  title: 'Thành tiền', 
                                  key: 'total', 
                                  render: (_, r) => <Text strong>{Number((r.quantity || 0) * (r.unit_cost || 0)).toLocaleString('vi-VN')} đ</Text> 
                                }
                              ]}
                            />
                          )
                        },
                        rowExpandable: (record) => record.items && record.items.length > 1,
                      }}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'stock',
              label: (
                <Space>
                  <AppstoreOutlined />
                  <span>Tồn Kho Thực Tế</span>
                </Space>
              ),
              children: (
                <div>
                  <Row gutter={[16, 16]} align="middle" justify="space-between" style={{ marginBottom: 16 }}>
                    <Col xs={24} lg={8}>
                      <Input
                        placeholder="Tìm theo tên sản phẩm hoặc mã SKU..."
                        prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                        value={stockSearchText}
                        onChange={(e) => setStockSearchText(e.target.value)}
                        allowClear
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                    <Col xs={24} lg={7}>
                      <Select
                        placeholder="Lọc theo kho hàng..."
                        value={warehouseFilter || undefined}
                        onChange={(val) => setWarehouseFilter(val || '')}
                        allowClear
                        style={{ width: '100%' }}
                      >
                        {warehouses.map((w) => (
                          <Option key={w.id} value={w.id}>{w.name} {w.location ? `(${w.location})` : ''}</Option>
                        ))}
                      </Select>
                    </Col>
                    <Col xs={24} lg={9} style={{ textAlign: 'right' }}>
                      <Space>
                        <Text strong style={{ color: lowStockOnly ? '#dc2626' : 'inherit' }}>Chỉ hiện tồn kho báo động:</Text>
                        <Switch checked={lowStockOnly} onChange={setLowStockOnly} />
                        {lowStockOnly && (
                          <InputNumber 
                            min={0} 
                            value={lowStockThreshold} 
                            onChange={(val) => setLowStockThreshold(val)}
                            style={{ width: 130 }}
                            placeholder="Ngưỡng chung"
                          />
                        )}
                      </Space>
                    </Col>
                  </Row>
                  {isMobile ? (
                    <List
                      dataSource={groupedFilteredStockLevels}
                      loading={loading}
                      pagination={{ pageSize: 10, size: 'small' }}
                      renderItem={(r) => {
                        const isGroup = r.items && r.items.length > 1;
                        return (
                          <List.Item style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block', background: '#fff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'flex-start' }}>
                              <Text strong style={{ color: '#2563eb', fontSize: 15 }}>{r.product_name}</Text>
                              {r.is_low_stock && <Tag color="error">Cảnh báo</Tag>}
                            </div>
                            <div style={{ marginBottom: 4 }}>
                              <Text type="secondary" style={{ fontSize: 13 }}>SKU: </Text>
                              <Text>{r.product_sku || 'N/A'}</Text>
                            </div>
                            <div style={{ marginBottom: 4 }}>
                              <Text type="secondary" style={{ fontSize: 13 }}>Tổng tồn: </Text>
                              <Text strong style={{ color: '#16a34a', fontSize: 15 }}>{r.quantity}</Text> {r.product_unit}
                            </div>
                            {isGroup && (
                              <div style={{ marginTop: 12, padding: '8px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Chi tiết các kho:</Text>
                                {r.items.map(item => {
                                  const wh = warehouses.find(w => w.id === item.warehouse);
                                  return (
                                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                                      <Text>{wh ? wh.name : `Kho #${item.warehouse}`}</Text>
                                      <Text strong>{item.quantity}</Text>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </List.Item>
                        )
                      }}
                    />
                  ) : (
                    <Table
                      columns={stockColumns}
                      dataSource={groupedFilteredStockLevels}
                      rowKey="id"
                      loading={loading}
                      pagination={{ pageSize: 10 }}
                      scroll={{ x: 'max-content' }}
                      expandable={{
                        expandedRowRender: (record) => {
                          if (!record.items || record.items.length <= 1) return null;
                          return (
                            <Table
                              dataSource={record.items}
                              pagination={false}
                              rowKey="id"
                              size="small"
                              columns={[
                                { 
                                  title: 'Kho hàng', 
                                  dataIndex: 'warehouse',
                                  render: (whId) => {
                                    const wh = warehouses.find((w) => w.id === whId)
                                    return <Text strong>{wh ? wh.name : `Kho #${whId}`}</Text>
                                  } 
                                },
                                { 
                                  title: 'Số lượng tồn', 
                                  dataIndex: 'quantity', 
                                  render: (qty) => <Text strong>{qty}</Text> 
                                },
                                { 
                                  title: 'Ngưỡng cảnh báo (Min)', 
                                  dataIndex: 'min_quantity', 
                                  render: (min, record) => (
                                    <Text 
                                      type="secondary"
                                      editable={{
                                        onChange: (val) => handleUpdateMinQty(record.id, val),
                                        tooltip: 'Click để sửa ngưỡng'
                                      }}
                                    >
                                      {min || 0}
                                    </Text>
                                  )
                                }
                              ]}
                            />
                          )
                        },
                        rowExpandable: (record) => record.items && record.items.length > 1,
                      }}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'warehouses',
              label: (
                <Space>
                  <ShopOutlined />
                  <span>Danh Sách Kho Hàng ({warehouses.length})</span>
                </Space>
              ),
              children: (
                <div>
                  {canCreate && (
                    <Row justify="end" style={{ marginBottom: 16 }}>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => openWarehouseModal()}
                        style={{ background: '#4f46e5', fontWeight: 600, borderRadius: 8 }}
                      >
                        + Thêm Kho Hàng Mới
                      </Button>
                    </Row>
                  )}
                  {isMobile ? (
                    <List
                      dataSource={warehouses}
                      pagination={{ pageSize: 10, size: "small" }}
                      renderItem={(w) => (
                        <List.Item style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block', background: '#fff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                            <Text strong style={{ fontSize: 15, color: '#4f46e5' }}>{w.name}</Text>
                            {w.is_active !== false ? <Tag color="success" style={{ margin: 0 }}>Hoạt động</Tag> : <Tag color="default" style={{ margin: 0 }}>Ngừng hoạt động</Tag>}
                          </div>
                          <div style={{ marginBottom: 12 }}>
                            <Text type="secondary" style={{ fontSize: 13 }}>Vị trí: </Text>
                            <Text>{w.location || '—'}</Text>
                          </div>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            {canEdit && (
                              <Button
                                type="text"
                                icon={<EditOutlined style={{ color: '#d97706' }} />}
                                onClick={() => openWarehouseModal(w)}
                                title="Sửa kho hàng"
                              />
                            )}
                            {canDelete && (
                              <Popconfirm
                                title="Xoá kho hàng?"
                                description="Bạn có chắc chắn muốn xoá kho hàng này không?"
                                onConfirm={() => handleWarehouseDelete(w.id)}
                                okText="Xoá"
                                cancelText="Hủy"
                                okButtonProps={{ danger: true }}
                              >
                                <Button type="text" danger icon={<DeleteOutlined />} title="Xoá kho hàng" />
                              </Popconfirm>
                            )}
                          </div>
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Table scroll={{ x: 'max-content' }}
                      dataSource={warehouses}
                      rowKey="id"
                      columns={[
                        { title: 'Tên kho hàng', dataIndex: 'name', key: 'name', render: (v) => <Text strong style={{ fontSize: 15 }}>{v}</Text> },
                        { title: 'Vị trí / Địa chỉ', dataIndex: 'location', key: 'location', render: (v) => <Text type="secondary">{v || '—'}</Text> },
                        {
                          title: 'Trạng thái',
                          dataIndex: 'is_active',
                          key: 'is_active',
                          render: (v) => (v !== false ? <Tag color="success">Hoạt động</Tag> : <Tag color="default">Ngừng hoạt động</Tag>),
                        },
                        {
                          title: 'Hành động',
                          key: 'action',
                          align: 'right',
                          render: (_, r) => (
                            <Space>
                              {canEdit && (
                                <Button
                                  type="text"
                                  icon={<EditOutlined style={{ color: '#d97706' }} />}
                                  onClick={() => openWarehouseModal(r)}
                                  title="Sửa kho hàng"
                                />
                              )}
                              {canDelete && (
                                <Popconfirm
                                  title="Xoá kho hàng?"
                                  description="Bạn có chắc chắn muốn xoá kho hàng này không?"
                                  onConfirm={() => handleWarehouseDelete(r.id)}
                                  okText="Xoá"
                                  cancelText="Hủy"
                                  okButtonProps={{ danger: true }}
                                >
                                  <Button type="text" danger icon={<DeleteOutlined />} title="Xoá kho hàng" />
                                </Popconfirm>
                              )}
                            </Space>
                          ),
                        },
                      ]}
                      pagination={{ pageSize: 10 }}
                    />
                  )}
                </div>
              ),
            },
          ];
          return isMobile ? (
            <Collapse
              accordion
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key || 'transactions')}
              items={tabItems}
              style={{ background: 'transparent' }}
              bordered={false}
            />
          ) : (
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={tabItems}
            />
          );
        })()}
      </Card>

      {/* ── Modal Product Add / Edit ───────────────────────────────────── */}
      <Modal
        title={<Text strong style={{ fontSize: 18 }}>{editingProduct ? 'Chỉnh sửa Sản phẩm' : 'Thêm Sản Phẩm Mới'}</Text>}
        open={productModalVisible}
        onCancel={() => setProductModalVisible(false)}
        onOk={handleProductSubmit}
        confirmLoading={submitting}
        okText="Lưu Sản Phẩm"
        cancelText="Hủy"
        width={700}
      >
        <Form form={productForm} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="sku" label="Mã SKU">
                <Input placeholder="VD: SP-001, NHOM-XINGFA..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="Tên sản phẩm / dịch vụ" rules={[{ required: true, message: 'Vui lòng nhập tên sản phẩm' }]}>
                <Input placeholder="VD: Cửa nhôm Xingfa 4 cánh..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="category" label="Danh mục sản phẩm" rules={[{ required: true, message: 'Vui lòng chọn danh mục' }]}>
                <Select placeholder="Chọn danh mục...">
                  {categories.map((c) => (
                    <Option key={c.id} value={c.id}>{c.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="unit" label="Đơn vị tính">
                <Select
                  placeholder="Chọn đơn vị..."
                  showSearch
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <div style={{ display: 'flex', flexWrap: 'nowrap', padding: 8, borderTop: '1px solid #f0f0f0' }}>
                        <Input
                          placeholder="Thêm đơn vị mới..."
                          ref={unitInputRef}
                          value={newUnitName}
                          onChange={onUnitNameChange}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') addUnitItem(e)
                          }}
                        />
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={addUnitItem}
                          style={{ marginLeft: 4 }}
                        >
                          Thêm
                        </Button>
                      </div>
                    </>
                  )}
                  options={unitOptions.map((item) => ({
                    label: (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{item}</span>
                        {!['Cái', 'm²', 'Mét', 'Bộ', 'Lần', 'Chuyến', 'Kg', 'Lít'].includes(item) && (
                          <div style={{ display: 'flex', gap: 12 }}>
                            <EditOutlined
                              style={{ color: '#1677ff', fontSize: 13, cursor: 'pointer' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setNewUnitName(item);
                                setUnitOptions((prev) => prev.filter((u) => u !== item));
                                if (productForm.getFieldValue('unit') === item) {
                                  productForm.setFieldsValue({ unit: null });
                                }
                                setTimeout(() => unitInputRef.current?.focus(), 0);
                              }}
                            />
                            <DeleteOutlined
                              style={{ color: '#ff4d4f', fontSize: 13, cursor: 'pointer' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setUnitOptions((prev) => prev.filter((u) => u !== item));
                                if (productForm.getFieldValue('unit') === item) {
                                  productForm.setFieldsValue({ unit: null });
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ),
                    value: item,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="price" label="Giá bán (VNĐ)" rules={[{ required: true, message: 'Vui lòng nhập giá bán' }]}>
                <InputNumber min={0} step={10000} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(v) => v.replace(/\$\s?|(,*)/g, '')} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="cost_price" label="Giá nhập / Giá vốn (VNĐ)">
                <InputNumber min={0} step={10000} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(v) => v.replace(/\$\s?|(,*)/g, '')} />
              </Form.Item>
            </Col>
            <Col xs={24} md={24}>
              <Form.Item label="Hình ảnh sản phẩm (Tải lên ảnh mẫu cửa / sản phẩm)">
                <input
                  type="file"
                  accept="image/*"
                  ref={(el) => { if (el) window._invProductImageInputRef = el; }}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)
                    if (!isImage) {
                      message.error('Chỉ được tải lên file hình ảnh (jpg, png, gif)!')
                      e.target.value = ''
                      return
                    }
                    setProductImageFile(file)
                    setProductPreviewImage(URL.createObjectURL(file))
                    e.target.value = ''
                  }}
                />
                <Button icon={<UploadOutlined />} style={{ marginBottom: 8 }} onClick={() => window._invProductImageInputRef?.click()}>
                  Chọn hình ảnh sản phẩm
                </Button>
                {productPreviewImage && (
                  <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                    <img
                      src={productPreviewImage}
                      alt="Preview"
                      style={{ height: 100, borderRadius: 8, border: '1px solid #d9d9d9', objectFit: 'cover' }}
                    />
                    <Button
                      type="text"
                      danger
                      size="small"
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,255,255,0.8)' }}
                      onClick={() => {
                        setProductImageFile(null)
                        setProductPreviewImage(null)
                      }}
                    >
                      Xóa ảnh
                    </Button>
                  </div>
                )}
              </Form.Item>
            </Col>
            <Col xs={24} md={24}>
              <Form.Item name="description" label="Mô tả chi tiết">
                <TextArea rows={3} placeholder="Mô tả quy cách, thông số kỹ thuật..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={24}>
              <Form.Item name="is_active" valuePropName="checked" label="Trạng thái kinh doanh">
                <Switch checkedChildren="Đang kinh doanh" unCheckedChildren="Ngừng kinh doanh" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Modal Category Add / Edit ──────────────────────────────────── */}
      <Modal
        title={<Text strong style={{ fontSize: 18 }}>{editingCategory ? 'Chỉnh sửa Danh mục' : 'Thêm Danh Mục Mới'}</Text>}
        open={categoryModalVisible}
        onCancel={() => setCategoryModalVisible(false)}
        onOk={handleCategorySubmit}
        confirmLoading={submitting}
        okText="Lưu Danh Mục"
        cancelText="Hủy"
      >
        <Form form={categoryForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Tên danh mục" rules={[{ required: true, message: 'Vui lòng nhập tên danh mục' }]}>
            <Input placeholder="VD: Cửa nhôm, Kính cường lực, Phụ kiện..." />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <TextArea rows={2} placeholder="Mô tả ngắn gọn..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal Warehouse Add / Edit ─────────────────────────────────── */}
      <Modal
        title={<Text strong style={{ fontSize: 18 }}>{editingWarehouse ? 'Chỉnh sửa Kho Hàng' : 'Thêm Kho Hàng Mới'}</Text>}
        open={warehouseModalVisible}
        onCancel={() => setWarehouseModalVisible(false)}
        onOk={handleWarehouseSubmit}
        confirmLoading={submitting}
        okText="Lưu Kho"
        cancelText="Hủy"
      >
        <Form form={warehouseForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Tên kho hàng" rules={[{ required: true, message: 'Vui lòng nhập tên kho' }]}>
            <Input placeholder="VD: Kho chính Hóc Môn, Kho xưởng Bình Tân..." />
          </Form.Item>
          <Form.Item name="location" label="Địa chỉ kho">
            <Input placeholder="VD: Số 10 Đường số 1, Q.Bình Tân, TP.HCM..." />
          </Form.Item>
          <Form.Item name="is_active" valuePropName="checked" label="Trạng thái hoạt động">
            <Switch checkedChildren="Hoạt động" unCheckedChildren="Khóa" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal Transaction (Nhập kho / Điều chỉnh) ──────────────────── */}
      <Modal
        title={<Text strong style={{ fontSize: 18 }}>{txnModalMode === 'export' ? 'Tạo Phiếu Xuất Kho' : txnModalMode === 'transfer' ? 'Tạo Phiếu Điều Chuyển Kho' : 'Tạo Phiếu Nhập / Điều Chỉnh Kho'}</Text>}
        open={txnModalVisible}
        onCancel={() => setTxnModalVisible(false)}
        onOk={handleTxnSubmit}
        confirmLoading={submitting}
        okText="Tạo Phiếu Kho"
        cancelText="Hủy"
      >
        <Form form={txnForm} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="type" label="Loại giao dịch" rules={[{ required: true }]}>
                <Select placeholder="Chọn loại giao dịch" disabled={txnModalMode === 'export' || txnModalMode === 'transfer'}>
                  {txnModalMode === 'export' ? (
                    <Option value="export">Xuất kho (-)</Option>
                  ) : txnModalMode === 'transfer' ? (
                    <Option value="transfer">Điều chuyển kho</Option>
                  ) : (
                    <>
                      <Option value="import">Nhập kho (+)</Option>
                      <Option value="adjust">Điều chỉnh (+/-)</Option>
                    </>
                  )}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="warehouse" label={txnModalMode === 'transfer' ? 'Từ kho (Kho xuất)' : 'Kho hàng'} rules={[{ required: true, message: 'Chọn kho' }]}>
                <Select placeholder="Chọn kho...">
                  {warehouses.map((w) => (
                    <Option key={w.id} value={w.id}>{w.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            {txnModalMode === 'transfer' && (
              <Col xs={24} md={12}>
                <Form.Item name="target_warehouse" label="Đến kho (Kho nhập)" rules={[{ required: true, message: 'Chọn kho nhận' }]}>
                  <Select placeholder="Chọn kho...">
                    {warehouses.map((w) => (
                      <Option key={w.id} value={w.id}>{w.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            )}
            <Col xs={24} md={24}>
              <div style={{ marginBottom: 8 }}><Text strong>Danh sách sản phẩm:</Text></div>
              <Form.List name="items">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...restField }) => (
                      <Row key={key} gutter={16} align="middle" style={{ marginBottom: 12, background: '#f8fafc', padding: '12px 8px', borderRadius: 8 }}>
                        <Col xs={24} md={txnModalMode !== 'transfer' ? 9 : 14}>
                          <Form.Item
                            {...restField}
                            name={[name, 'product']}
                            label="Sản phẩm"
                            rules={[{ required: true, message: 'Chọn sản phẩm' }]}
                            style={{ marginBottom: 0 }}
                          >
                            <Select showSearch optionFilterProp="children" placeholder="Chọn sản phẩm...">
                              {products.filter(p => p.product_type !== 'service').map((p) => (
                                <Option key={p.id} value={p.id}>{p.name} ({p.sku})</Option>
                              ))}
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={txnModalMode !== 'transfer' ? 6 : 8}>
                          <Form.Item
                            {...restField}
                            name={[name, 'quantity']}
                            label="Số lượng"
                            style={{ marginBottom: 0 }}
                            dependencies={['warehouse', ['items', name, 'product']]}
                            rules={[
                              { required: true, message: 'Nhập SL' },
                              ({ getFieldValue }) => ({
                                validator(_, value) {
                                  const wId = getFieldValue('warehouse');
                                  const pId = getFieldValue(['items', name, 'product']);
                                  if (value > 0 && wId && pId && (txnModalMode === 'export' || txnModalMode === 'transfer')) {
                                    const stock = stockLevels.find(s => s.warehouse === wId && s.product === pId);
                                    const maxS = stock ? stock.quantity : 0;
                                    if (value > maxS) {
                                      return Promise.reject(new Error(`Tồn kho: ${maxS}`));
                                    }
                                  }
                                  return Promise.resolve();
                                },
                              }),
                            ]}
                          >
                            <InputNumber min={1} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        {txnModalMode !== 'transfer' && (
                          <Col xs={24} md={7}>
                            <Form.Item
                              {...restField}
                              name={[name, 'unit_cost']}
                              label="Đơn giá (VNĐ)"
                              style={{ marginBottom: 0 }}
                            >
                              <InputNumber min={0} step={10000} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(v) => v.replace(/\$\s?|(,*)/g, '')} />
                            </Form.Item>
                          </Col>
                        )}
                        <Col xs={24} md={2} style={{ textAlign: 'center', marginTop: 30 }}>
                          {fields.length > 1 && (
                            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                          )}
                        </Col>
                      </Row>
                    ))}
                    <Form.Item>
                      <Button type="dashed" onClick={() => add({ product: null, quantity: 1, unit_cost: 0 })} block icon={<PlusOutlined />}>
                        Thêm sản phẩm
                      </Button>
                    </Form.Item>
                  </>
                )}
              </Form.List>
            </Col>
            <Col xs={24} md={24}>
              <Form.Item name="note" label="Ghi chú phiếu kho">
                <Input placeholder="VD: Nhập lô hàng từ nhà cung cấp Xingfa Aluminium..." />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Modal Chuyển Tồn Kho Trước Khi Xóa Kho ────────────────────────── */}
      <Modal
        title={
          <Space>
            <AlertOutlined style={{ color: '#d97706' }} />
            <Text strong style={{ fontSize: 17 }}>Chuyển Sản Phẩm & Xóa Kho Hàng</Text>
          </Space>
        }
        open={transferModalVisible}
        onCancel={() => {
          setTransferModalVisible(false)
          setDeletingWarehouse(null)
          setTargetWarehouseId(null)
        }}
        onOk={handleConfirmTransferAndDelete}
        confirmLoading={submitting}
        okText="Xác nhận chuyển kho & Xoá"
        okButtonProps={{ danger: true }}
        cancelText="Hủy"
        width={550}
      >
        <div style={{ marginTop: 12 }}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={
              <span>
                Kho hàng <Text strong>{deletingWarehouse?.name}</Text> hiện đang chứa sản phẩm tồn kho.
              </span>
            }
            description="Để bảo toàn dữ liệu tồn kho, bạn bắt buộc phải chọn một kho hàng khác để chuyển toàn bộ sản phẩm sang trước khi xoá kho này."
          />
          <Form layout="vertical">
            <Form.Item
              label={<Text strong>Chọn kho nhận toàn bộ sản phẩm</Text>}
              required
            >
              <Select
                placeholder="Chọn kho đích nhận sản phẩm..."
                value={targetWarehouseId}
                onChange={setTargetWarehouseId}
                style={{ width: '100%' }}
                size="large"
              >
                {warehouses
                  .filter((w) => w.id !== deletingWarehouse?.id && w.is_active !== false)
                  .map((w) => (
                    <Option key={w.id} value={w.id}>
                      {w.name} {w.location ? `(${w.location})` : ''}
                    </Option>
                  ))}
              </Select>
            </Form.Item>
          </Form>
        </div>
      </Modal>

      {/* ── Clear Transaction History Modal ── */}
      <Modal
        title={
          <Space>
            <DeleteOutlined style={{ color: '#dc2626' }} />
            <span style={{ color: '#dc2626' }}>Cảnh báo: Xoá toàn bộ lịch sử giao dịch</span>
          </Space>
        }
        open={clearTxnModalVisible}
        onCancel={() => {
          setClearTxnModalVisible(false)
          setClearConfirmText('')
        }}
        onOk={handleConfirmClearAllTxn}
        okText="Xác nhận Xoá toàn bộ"
        cancelText="Huỷ"
        okButtonProps={{
          danger: true,
          disabled: clearConfirmText !== 'XOA TOAN BO',
          loading: submitting,
        }}
      >
        <div style={{ padding: '8px 0' }}>
          <Text type="danger" style={{ display: 'block', marginBottom: 12, fontWeight: 500 }}>
            Hành động này sẽ xoá vĩnh viễn toàn bộ lịch sử nhập/xuất/điều chỉnh kho của công ty. Bạn KHÔNG THỂ khôi phục lại dữ liệu sau khi xoá.
          </Text>
          <Text style={{ display: 'block', marginBottom: 8 }}>
            Để xác nhận, vui lòng nhập chính xác dòng chữ: <strong>XOA TOAN BO</strong> vào ô bên dưới:
          </Text>
          <Input
            value={clearConfirmText}
            onChange={(e) => setClearConfirmText(e.target.value)}
            placeholder="XOA TOAN BO"
            style={{ fontWeight: 'bold', color: '#dc2626' }}
            autoFocus
          />
        </div>
      </Modal>

      {/* ── Delete Single Transaction Modal ── */}
      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#dc2626' }} />
            <span style={{ color: '#dc2626' }}>Cảnh báo: Xoá giao dịch kho</span>
          </Space>
        }
        open={deleteSingleModalVisible}
        onOk={handleConfirmDeleteSingleTxn}
        onCancel={() => setDeleteSingleModalVisible(false)}
        confirmLoading={submitting}
        okText="Xoá giao dịch"
        okButtonProps={{ 
          danger: true,
          disabled: deleteSingleConfirmText !== 'XOA GIAO DICH'
        }}
        cancelText="Hủy"
      >
        <div style={{ padding: '8px 0' }}>
          {selectedTxnToDelete && (
            <div style={{ marginBottom: 16 }}>
              <Text>Bạn đang chuẩn bị xoá giao dịch:</Text>
              <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 4, marginTop: 8, border: '1px solid #e2e8f0' }}>
                <Text strong>{selectedTxnToDelete.transaction_code}</Text>
                <br />
                <Text type="secondary">Loại: {selectedTxnToDelete.type_display}</Text>
                <br />
                <Text type="secondary">Sản phẩm: {selectedTxnToDelete.product_name}</Text>
              </div>
            </div>
          )}
          <Text type="danger" style={{ display: 'block', marginBottom: 12 }}>
            Thao tác này sẽ xoá vĩnh viễn giao dịch này khỏi hệ thống. Số lượng tồn kho hiện tại sẽ <Text strong>KHÔNG</Text> được hoàn lại.
          </Text>
          <Text style={{ display: 'block', marginBottom: 8 }}>
            Để xác nhận, vui lòng nhập chính xác dòng chữ: <strong>XOA GIAO DICH</strong> vào ô bên dưới:
          </Text>
          <Input 
            placeholder="XOA GIAO DICH"
            value={deleteSingleConfirmText}
            onChange={(e) => setDeleteSingleConfirmText(e.target.value)}
            onPressEnter={handleConfirmDeleteSingleTxn}
            style={{ fontWeight: 'bold', color: '#dc2626' }}
            autoFocus
          />
        </div>
      </Modal>

      {/* ── Modal Tạo lại Lệnh Sản Xuất ──────────────────────────────── */}
      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#dc2626', fontSize: 20 }} />
            <Text strong style={{ fontSize: 17 }}>Tạo lại Lệnh Sản Xuất</Text>
          </Space>
        }
        open={!!recreateMOTxn}
        onCancel={() => setRecreateMOTxn(null)}
        onOk={handleRecreateMO}
        confirmLoading={recreateMOLoading}
        okText="Tạo lại Lệnh SX"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#dc2626', borderColor: '#dc2626' } }}
      >
        {recreateMOTxn && (
          <div style={{ padding: '8px 0' }}>
            <Alert
              type="warning"
              showIcon
              message="Lệnh Sản Xuất đã bị xóa hoặc chưa tồn tại"
              description="Khi phiếu xuất kho được duyệt, hệ thống sẽ tự tạo Lệnh Sản Xuất liên kết. Tuy nhiên lệnh này đã bị xóa. Bạn có muốn tạo lại không?"
              style={{ marginBottom: 16 }}
            />
            <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
              <Text strong>Phiếu xuất kho: </Text>
              <Tag color="purple">{recreateMOTxn.transaction_code}</Tag>
              <br />
              <Text strong>Đơn hàng liên kết: </Text>
              <Tag color="blue">{recreateMOTxn.reference_order_number || 'N/A'}</Tag>
              {recreateMOTxn.factory_name && (
                <>
                  <br />
                  <Text strong>Nhà máy: </Text>
                  <Tag color="orange">{recreateMOTxn.factory_name}</Tag>
                </>
              )}
            </div>
            <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
              Lệnh SX mới sẽ được tạo tự động với mã phù hợp và liên kết với đơn hàng trên.
            </Text>
          </div>
        )}
      </Modal>

      {/* Modal Approve Export */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#16a34a' }} />
            <Text strong style={{ fontSize: 18 }}>Duyệt Xuất Kho</Text>
          </Space>
        }
        open={exportApproveModalVisible}
        onCancel={() => setExportApproveModalVisible(false)}
        onOk={handleApproveExport}
        confirmLoading={submitting}
        okText="Xác nhận duyệt"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#16a34a', borderColor: '#16a34a' } }}
      >
        {selectedExportTxn && (
          <div style={{ marginTop: 16 }}>
            <Alert
              message={selectedExportTxn.note || "Vui lòng chọn kho để trừ số lượng sản phẩm này."}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            {(() => {
              const txns = selectedExportTxn.items || [selectedExportTxn]
              return (
                <>
                  {txns.length > 1 && (
                    <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                      <Text strong style={{ color: '#166534' }}>Chọn nhanh chung 1 kho xuất cho toàn bộ {txns.length} sản phẩm:</Text>
                      <Select
                        style={{ width: '100%', marginTop: 8 }}
                        placeholder="--- Chọn chung 1 kho ---"
                        onChange={(val) => {
                          const newIds = { ...approveWarehouseIds }
                          txns.forEach(t => {
                            newIds[t.id] = val;
                          })
                          setApproveWarehouseIds(newIds)
                          messageApi.success('Đã áp dụng kho xuất cho tất cả sản phẩm.')
                          
                          // Auto-suggest factory based on linked_warehouse
                          const linkedFactory = factories.find(f => f.linked_warehouse === val)
                          if (linkedFactory) {
                            setApproveFactoryId(linkedFactory.id)
                          }
                        }}
                      >
                        {warehouses.map(w => (
                          <Option key={w.id} value={w.id}>{w.name}</Option>
                        ))}
                      </Select>
                    </div>
                  )}
                  {txns.map((txn, index) => {
                const prod = products.find(p => p.id === txn.product)
                return (
                  <div key={txn.id} style={{ marginBottom: 16, padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <Row gutter={[16, 16]}>
                      <Col xs={24} md={16}>
                        <Text type="secondary">Sản phẩm {index + 1}:</Text>
                        <div>
                          <Text strong style={{ fontSize: 15 }}>{txn.product_name || prod?.name}</Text>
                          <Tag color="blue" style={{ marginLeft: 8 }}>SKU: {txn.product_sku || prod?.sku}</Tag>
                        </div>
                      </Col>
                      <Col xs={24} md={8}>
                        <Text type="secondary">Số lượng cần xuất:</Text>
                        <div>
                          <Text strong style={{ fontSize: 16, color: '#dc2626' }}>{txn.quantity}</Text> {prod?.unit || 'cái'}
                        </div>
                      </Col>
                      <Col xs={24} md={24}>
                        <Text type="secondary">Chọn Kho để xuất hàng:</Text>
                        <Select
                          style={{ width: '100%', marginTop: 8 }}
                          placeholder="--- Chọn kho ---"
                          value={approveWarehouseIds[txn.id]}
                          onChange={(val) => {
                            setApproveWarehouseIds(prev => ({ ...prev, [txn.id]: val }))
                            if (!approveFactoryId) {
                              const linkedFactory = factories.find(f => f.linked_warehouse === val)
                              if (linkedFactory) setApproveFactoryId(linkedFactory.id)
                            }
                          }}
                        >
                          {warehouses.map(w => {
                            const stock = stockLevels.find(s => Number(s.warehouse) === Number(w.id) && Number(s.product) === Number(txn.product))
                            const qty = stock ? Number(stock.quantity) : 0
                            const reqQty = Number(txn.quantity)
                            const isEnough = qty >= reqQty
                            return (
                              <Option key={w.id} value={w.id}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>{w.name}</span>
                                  <span style={{ color: isEnough ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                                    Tồn: {qty} {isEnough ? '' : '(Không đủ)'}
                                  </span>
                                </div>
                              </Option>
                            )
                          })}
                        </Select>
                      </Col>
                    </Row>
                  </div>
                )
              })}
                </>
              )
            })()}

            {selectedExportTxn.reference_order && factories.length > 0 && (
              <div style={{ marginTop: 16, padding: '12px 16px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                <Text strong style={{ color: '#92400e' }}>Nhà máy sản xuất (Nhận lệnh sản xuất & vật tư này):</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder="--- Chọn nhà máy sản xuất ---"
                  value={approveFactoryId}
                  onChange={setApproveFactoryId}
                  allowClear
                >
                  {factories.map(f => (
                    <Option key={f.id} value={f.id}>
                      {f.name} {f.linked_warehouse ? `(Kho liên kết: ${f.linked_warehouse_name})` : ''}
                    </Option>
                  ))}
                </Select>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                  Hệ thống sẽ chuyển vật tư và tự động sinh Lệnh Sản Xuất cho Nhà máy này.
                </Text>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Hidden Print Container */}
      {selectedTxnForPrint && (
        <div style={{ display: 'none' }}>
          <TransactionPrintView
            transaction={selectedTxnForPrint}
            company={user?.company}
          />
        </div>
      )}

    </section>
  )
}
