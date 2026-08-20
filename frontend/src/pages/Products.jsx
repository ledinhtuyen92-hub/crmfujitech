import {
  AlertOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  InboxOutlined,
  PictureOutlined,
  PlusOutlined,
  SearchOutlined,
  ShopOutlined,
  TagOutlined,
  UploadOutlined,
  MoreOutlined,
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
  Upload,
  message,
  Dropdown,
  List,
  Collapse,
  Menu,
  AutoComplete,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../utils/api'
import ProductTemplateTab from './inventory/ProductTemplateTab'
import { useResponsive } from '../hooks/useResponsive'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

export default function Products() {
  const { hasPermission, checkMaintenance, isCompanyAdmin } = useAuth()
  const { isMobile } = useResponsive()
  const [messageApi, contextHolder] = message.useMessage()
  const fileInputRef = useRef(null)
  
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

  const [activeTab, setActiveTab] = useState('products')

  // Data states
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)

  // Filters
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  // Modals
  const [productModalVisible, setProductModalVisible] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productImageFile, setProductImageFile] = useState(null)
  const [productPreviewImage, setProductPreviewImage] = useState(null)
  const [productForm] = Form.useForm()
  const productCategories = categories.filter(c => c.category_type === 'product' || !c.category_type);
  const serviceCategories = categories.filter(c => c.category_type === 'service');
  const selectedProductType = Form.useWatch('product_type', productForm);

  const [categoryModalVisible, setCategoryModalVisible] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [categoryForm] = Form.useForm()

  const [submitting, setSubmitting] = useState(false)

  // Permissions
  const canCreate = hasPermission('products.create')
  const canEdit = hasPermission('products.edit')
  const canDelete = hasPermission('products.delete')
  const canManageAIKnowledge = hasPermission('ai_agent.manage_knowledge')

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
  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    if (activeTab === 'products') fetchProducts()
    else if (activeTab === 'categories') fetchCategories()
  }, [activeTab, fetchProducts, fetchCategories])

  // ── Filtered Products ─────────────────────────────────────────────────
  const filteredProducts = products.filter((item) => {
    if (!searchText) return true
    const name = (item.name || '').toLowerCase()
    const sku = (item.sku || '').toLowerCase()
    const query = searchText.toLowerCase()
    return name.includes(query) || sku.includes(query)
  })


  // ── Product Handlers ──────────────────────────────────────────────────
  const openProductModal = (prod = null) => {
    if (checkMaintenance()) return
    setEditingProduct(prod)
    setProductImageFile(null)
    if (prod) {
      setProductImageFile(null)
      setProductPreviewImage(prod.image_url || prod.image)
      productForm.setFieldsValue({
        ...prod,
        attributes_str: prod.attributes ? JSON.stringify(prod.attributes) : '',
      })
    } else {
      setProductImageFile(null)
      setProductPreviewImage(null)
      productForm.resetFields()
      productForm.setFieldsValue({ 
        product_type: activeTab === 'services' ? 'service' : 'product',
        category: categoryFilter ? parseInt(categoryFilter) : undefined,
        unit: 'cái', 
        price: 0, 
        cost_price: 0, 
        is_active: true 
      })
    }
    setProductModalVisible(true)
  }

  const handleProductSubmit = async () => {
    try {
      const values = await productForm.validateFields()
      setSubmitting(true)

      const formData = new FormData()
      formData.append('sku', values.sku || '')
      formData.append('name', values.name)
      formData.append('product_type', values.product_type || 'product')
      formData.append('category', values.category)
      formData.append('unit', values.unit || 'cái')
      formData.append('price', values.price || 0)
      formData.append('cost_price', values.cost_price || 0)
      formData.append('description', values.description || '')
      formData.append('ai_knowledge', values.ai_knowledge || '')
      formData.append('is_active', values.is_active !== false)
      if (productImageFile) {
        formData.append('image', productImageFile)
      }

      if (editingProduct) {
        await api.patch(`/inventory/products/${editingProduct.id}/?include_inactive=true`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        messageApi.success('Cập nhật sản phẩm thành công!')
      } else {
        await api.post('/inventory/products/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        messageApi.success('Thêm sản phẩm mới thành công!')
      }
      setProductModalVisible(false)
      fetchProducts()
    } catch (error) {
      if (error.errorFields) return
      const errDetail = error.response?.data?.detail || JSON.stringify(error.response?.data) || 'Vui lòng kiểm tra lại thông tin.'
      messageApi.error(`Lưu sản phẩm thất bại: ${errDetail}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleProductDelete = async (id) => {
    if (checkMaintenance()) return
    try {
      await api.delete(`/inventory/products/${id}/?include_inactive=true`)
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
        await api.post('/inventory/product-categories/', { ...values, category_type: activeTab === 'services' ? 'service' : 'product' })
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

  // ── Import / Export CSV ───────────────────────────────────────────────
  const handleExportCSV = async () => {
    if (checkMaintenance()) return
    try {
      const res = await api.get('/inventory/products/export-csv/', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'products.xlsx')
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
    } catch (error) {
      messageApi.error('Lỗi khi xuất file Excel.')
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/inventory/products/export-template/', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'mau_nhap_san_pham.xlsx')
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
    } catch (error) {
      messageApi.error('Lỗi khi tải file mẫu.')
    }
  }

  const handleImportCSV = async (e) => {
    if (checkMaintenance()) return
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)

    try {
      messageApi.loading({ content: 'Đang xử lý file...', key: 'importing' })
      const res = await api.post('/inventory/products/import-csv/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      messageApi.success({ content: res.data.detail, key: 'importing' })
      fetchProducts()
      fetchCategories()
    } catch (error) {
      messageApi.error({ content: error.response?.data?.detail || 'Lỗi khi nhập file CSV.', key: 'importing' })
    } finally {
      e.target.value = ''
    }
  }

  // ── Columns for Products Table ──────────────────────────────────────────────
  const productColumns = [
    {
      title: 'Mã SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 130,
      render: (val) => <Tag color={val ? "blue" : "default"} style={{ fontWeight: 600 }}>{val || 'Không có mã'}</Tag>,
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

  const moreActionItems = [
    {
      key: 'template',
      icon: <DownloadOutlined />,
      label: 'Tải File Mẫu',
      onClick: handleDownloadTemplate
    },
    {
      key: 'import',
      icon: <UploadOutlined />,
      label: 'Nhập Excel/CSV',
      onClick: () => fileInputRef.current?.click()
    },
    {
      key: 'export',
      icon: <DownloadOutlined />,
      label: 'Xuất Excel',
      onClick: handleExportCSV
    }
  ];

  const renderProductMobileList = (dataSource) => (
    <List
      dataSource={dataSource}
      loading={loading}
      pagination={{ pageSize: 15, showSizeChanger: false, size: "small" }}
      renderItem={(r) => {
        const imgUrl = r.image_url || r.image
        const cat = categories.find((c) => c.id === r.category)
        return (
          <List.Item
            style={{ background: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, border: '1px solid #f0f0f0' }}
          >
            <List.Item.Meta
              avatar={
                imgUrl ? (
                  <img src={imgUrl} alt={r.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                ) : (
                  <div style={{ width: 64, height: 64, background: '#f1f5f9', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 11 }}>
                    No Img
                  </div>
                )
              }
              title={
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
                    <Text strong style={{ display: 'block', fontSize: 14, color: '#0f172a', whiteSpace: 'normal' }}>
                      {r.name || r.template_name || 'Sản phẩm'}
                    </Text>
                    {r.sku && <Tag color="blue" style={{ display: 'inline-block', marginTop: 4 }}>{r.sku}</Tag>}
                  </div>
                  <Space size={0}>
                    {canEdit && <Button type="text" size="small" icon={<EditOutlined style={{ color: '#d97706' }} />} onClick={() => openProductModal(r)} />}
                    {canDelete && (
                      <Popconfirm title="Xoá sản phẩm?" onConfirm={() => handleProductDelete(r.id)} okText="Xoá" cancelText="Hủy" okButtonProps={{ danger: true }}>
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )}
                  </Space>
                </div>
              }
              description={
                <div style={{ marginTop: 6 }}>
                  <Space direction="vertical" size={2}>
                    <Text strong style={{ color: '#16a34a' }}>Giá bán: {Number(r.price || 0).toLocaleString('vi-VN')} đ {r.unit && `/${r.unit}`}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>Vốn: {Number(r.cost_price || 0).toLocaleString('vi-VN')} đ</Text>
                    <Space wrap style={{ marginTop: 4 }}>
                      <Tag color="cyan">{cat ? cat.name : 'Chưa phân loại'}</Tag>
                      {r.is_active ? <Tag color="success">Đang KD</Tag> : <Tag color="default">Ngừng KD</Tag>}
                    </Space>
                  </Space>
                </div>
              }
            />
          </List.Item>
        )
      }}
    />
  )


  const tabItems = [
    {
      key: 'products',
      label: isMobile ? <Text strong>Hàng hóa ({products.filter(p => p.product_type !== 'service').length})</Text> : (
        <Space>
          <InboxOutlined />
          <span>Hàng hóa ({products.filter(p => p.product_type !== 'service').length})</span>
        </Space>
      ),
      children: (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          {/* Sidebar Thư mục */}
          {!isMobile && (
            <div style={{ width: 260, flexShrink: 0, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text strong style={{ fontSize: 14, color: '#334155' }}>Danh mục (Thư mục)</Text>
                <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => openCategoryModal()} style={{ color: '#2563eb' }} />
              </div>
              <Menu
                mode="inline"
                selectedKeys={[categoryFilter ? categoryFilter.toString() : 'all']}
                onClick={(e) => setCategoryFilter(e.key === 'all' ? '' : e.key)}
                style={{ borderRight: 'none', background: 'transparent' }}
                items={[
                  { key: 'all', icon: <InboxOutlined style={{ color: !categoryFilter ? '#2563eb' : '#94a3b8' }} />, label: 'Tất cả sản phẩm' },
                  ...productCategories.map(c => ({
                    key: c.id.toString(),
                    icon: categoryFilter && categoryFilter.toString() === c.id.toString() ? <FolderOpenOutlined style={{ color: '#f59e0b' }} /> : <FolderOutlined style={{ color: '#f59e0b' }} />,
                    label: (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                        {categoryFilter === c.id.toString() && (
                          <Space size={0} onClick={(e) => e.stopPropagation()}>
                            <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 12, color: '#d97706' }} />} onClick={(e) => { e.stopPropagation(); openCategoryModal(c); }} />
                            <Popconfirm title="Xóa thư mục?" onConfirm={(e) => { e.stopPropagation(); handleCategoryDelete(c.id); }} okText="Xóa" cancelText="Hủy">
                              <Button type="text" danger size="small" icon={<DeleteOutlined style={{ fontSize: 12 }} />} onClick={(e) => e.stopPropagation()} />
                            </Popconfirm>
                          </Space>
                        )}
                      </div>
                    )
                  }))
                ]}
              />
            </div>
          )}

          {/* Main content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {isMobile && (
              <div style={{ 
                display: 'flex', 
                overflowX: 'auto', 
                gap: 8, 
                padding: '0 0 12px 0',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
                borderBottom: '1px solid #f1f5f9',
                marginBottom: 12
              }}>
                <style dangerouslySetInnerHTML={{__html: `::-webkit-scrollbar { display: none; }`}} />
                <div 
                  onClick={() => setCategoryFilter('')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 20, whiteSpace: 'nowrap',
                    background: !categoryFilter ? '#eff6ff' : '#f8fafc',
                    border: `1px solid ${!categoryFilter ? '#bfdbfe' : '#e2e8f0'}`,
                    color: !categoryFilter ? '#2563eb' : '#475569',
                    fontWeight: !categoryFilter ? 600 : 400
                  }}
                >
                  <InboxOutlined /> Tất cả
                </div>
                {productCategories.map(c => (
                  <div 
                    key={c.id}
                    onClick={() => setCategoryFilter(c.id.toString())}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 20, whiteSpace: 'nowrap',
                      background: categoryFilter === c.id.toString() ? '#fffbeb' : '#f8fafc',
                      border: `1px solid ${categoryFilter === c.id.toString() ? '#fde68a' : '#e2e8f0'}`,
                      color: categoryFilter === c.id.toString() ? '#d97706' : '#475569',
                      fontWeight: categoryFilter === c.id.toString() ? 600 : 400
                    }}
                  >
                    {categoryFilter === c.id.toString() ? <FolderOpenOutlined style={{ color: '#f59e0b' }} /> : <FolderOutlined style={{ color: '#94a3b8' }} />} 
                    {c.name}
                  </div>
                ))}
                <div 
                  onClick={() => openCategoryModal()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 20, whiteSpace: 'nowrap',
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    color: '#64748b',
                  }}
                >
                  <PlusOutlined /> Thêm
                </div>
              </div>
            )}
            <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
              <Col xs={24} sm={isMobile ? 24 : 14} style={{ marginBottom: isMobile ? 8 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {!isMobile && (
                    <Text strong style={{ fontSize: 16, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {categoryFilter ? productCategories.find(c => c.id.toString() === categoryFilter.toString())?.name : 'Tất cả sản phẩm'}
                    </Text>
                  )}
                  <Input
                    placeholder="Tìm theo tên, mã SKU..."
                    prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                    style={{ borderRadius: 8 }}
                  />
                </div>
              </Col>
            </Row>
            {isMobile ? renderProductMobileList(products.filter(p => p.product_type !== 'service' && (p.name?.toLowerCase().includes(searchText.toLowerCase()) || p.sku?.toLowerCase().includes(searchText.toLowerCase())))) : (
              <Table
                columns={productColumns}
                dataSource={products.filter(p => p.product_type !== 'service' && (p.name?.toLowerCase().includes(searchText.toLowerCase()) || p.sku?.toLowerCase().includes(searchText.toLowerCase())))}
                rowKey="id"
                loading={loading}
                scroll={{ x: 1200 }}
                pagination={{ pageSize: 15 }}
              />
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'services',
      label: isMobile ? <Text strong>Dịch vụ ({products.filter(p => p.product_type === 'service').length})</Text> : (
        <Space>
          <ShopOutlined />
          <span>Dịch vụ ({products.filter(p => p.product_type === 'service').length})</span>
        </Space>
      ),
      children: (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          {/* Sidebar Thư mục */}
          {!isMobile && (
            <div style={{ width: 260, flexShrink: 0, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text strong style={{ fontSize: 14, color: '#334155' }}>Danh mục (Thư mục)</Text>
                <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => openCategoryModal()} style={{ color: '#2563eb' }} />
              </div>
              <Menu
                mode="inline"
                selectedKeys={[categoryFilter ? categoryFilter.toString() : 'all']}
                onClick={(e) => setCategoryFilter(e.key === 'all' ? '' : e.key)}
                style={{ borderRight: 'none', background: 'transparent' }}
                items={[
                  { key: 'all', icon: <InboxOutlined style={{ color: !categoryFilter ? '#2563eb' : '#94a3b8' }} />, label: 'Tất cả dịch vụ' },
                  ...serviceCategories.map(c => ({
                    key: c.id.toString(),
                    icon: categoryFilter && categoryFilter.toString() === c.id.toString() ? <FolderOpenOutlined style={{ color: '#f59e0b' }} /> : <FolderOutlined style={{ color: '#f59e0b' }} />,
                    label: (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                        {categoryFilter === c.id.toString() && (
                          <Space size={0} onClick={(e) => e.stopPropagation()}>
                            <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 12, color: '#d97706' }} />} onClick={(e) => { e.stopPropagation(); openCategoryModal(c); }} />
                            <Popconfirm title="Xóa thư mục?" onConfirm={(e) => { e.stopPropagation(); handleCategoryDelete(c.id); }} okText="Xóa" cancelText="Hủy">
                              <Button type="text" danger size="small" icon={<DeleteOutlined style={{ fontSize: 12 }} />} onClick={(e) => e.stopPropagation()} />
                            </Popconfirm>
                          </Space>
                        )}
                      </div>
                    )
                  }))
                ]}
              />
            </div>
          )}

          {/* Main content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {isMobile && (
              <div style={{ 
                display: 'flex', 
                overflowX: 'auto', 
                gap: 8, 
                padding: '0 0 12px 0',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
                borderBottom: '1px solid #f1f5f9',
                marginBottom: 12
              }}>
                <style dangerouslySetInnerHTML={{__html: `::-webkit-scrollbar { display: none; }`}} />
                <div 
                  onClick={() => setCategoryFilter('')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 20, whiteSpace: 'nowrap',
                    background: !categoryFilter ? '#eff6ff' : '#f8fafc',
                    border: `1px solid ${!categoryFilter ? '#bfdbfe' : '#e2e8f0'}`,
                    color: !categoryFilter ? '#2563eb' : '#475569',
                    fontWeight: !categoryFilter ? 600 : 400
                  }}
                >
                  <InboxOutlined /> Tất cả
                </div>
                {serviceCategories.map(c => (
                  <div 
                    key={c.id}
                    onClick={() => setCategoryFilter(c.id.toString())}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 20, whiteSpace: 'nowrap',
                      background: categoryFilter === c.id.toString() ? '#fffbeb' : '#f8fafc',
                      border: `1px solid ${categoryFilter === c.id.toString() ? '#fde68a' : '#e2e8f0'}`,
                      color: categoryFilter === c.id.toString() ? '#d97706' : '#475569',
                      fontWeight: categoryFilter === c.id.toString() ? 600 : 400
                    }}
                  >
                    {categoryFilter === c.id.toString() ? <FolderOpenOutlined style={{ color: '#f59e0b' }} /> : <FolderOutlined style={{ color: '#94a3b8' }} />} 
                    {c.name}
                  </div>
                ))}
                <div 
                  onClick={() => openCategoryModal()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 20, whiteSpace: 'nowrap',
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    color: '#64748b',
                  }}
                >
                  <PlusOutlined /> Thêm
                </div>
              </div>
            )}
            <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
              <Col xs={24} sm={isMobile ? 24 : 14} style={{ marginBottom: isMobile ? 8 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {!isMobile && (
                    <Text strong style={{ fontSize: 16, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {categoryFilter ? serviceCategories.find(c => c.id.toString() === categoryFilter.toString())?.name : 'Tất cả dịch vụ'}
                    </Text>
                  )}
                  <Input
                    placeholder="Tìm theo tên dịch vụ, mã SKU..."
                    prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                    style={{ borderRadius: 8 }}
                  />
                </div>
              </Col>
            </Row>
          {isMobile ? renderProductMobileList(products.filter(p => p.product_type === 'service' && (p.name?.toLowerCase().includes(searchText.toLowerCase()) || p.sku?.toLowerCase().includes(searchText.toLowerCase())))) : (
            <Table
              columns={productColumns}
              dataSource={products.filter(p => p.product_type === 'service' && (p.name?.toLowerCase().includes(searchText.toLowerCase()) || p.sku?.toLowerCase().includes(searchText.toLowerCase())))}
              rowKey="id"
              loading={loading}
              scroll={{ x: 1200 }}
              pagination={{ pageSize: 15 }}
            />
          )}
          </div>
        </div>
      ),

    },
    {
      key: 'templates',
      label: isMobile ? <Text strong>Mẫu Sản phẩm (Templates)</Text> : (
        <Space>
          <AppstoreOutlined />
          <span>Mẫu Sản phẩm (Templates)</span>
        </Space>
      ),
      children: <ProductTemplateTab categories={categories} />
    },
  ]

  return (
    <section>
      {contextHolder}

      {/* ── Page Header ────────────────────────────────────────────────── */}
      <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={10}>
          <Title level={2} style={{ margin: 0, fontWeight: 800 }}>
            <DatabaseOutlined style={{ color: '#0284c7', marginRight: 10 }} />
            Quản lý Sản Phẩm & Dịch Vụ
          </Title>
          <Text type="secondary">
            Quản lý danh mục hàng hóa, dịch vụ và phân loại sản phẩm.
          </Text>
        </Col>
        <Col xs={24} md={14} style={{ textAlign: isMobile ? 'left' : 'right' }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: isMobile ? 'flex-start' : 'flex-end', width: '100%', flexWrap: isMobile ? 'nowrap' : 'wrap' }}>
            {(activeTab === 'products' || activeTab === 'services') && (
              <>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleImportCSV}
                />
                <Dropdown menu={{ items: moreActionItems }} trigger={['click']}>
                  <Button icon={<MoreOutlined />} style={{ flex: isMobile ? 1 : 'none' }}>Tác vụ khác</Button>
                </Dropdown>
              </>
            )}
            {canCreate && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  if (activeTab === 'categories') {
                    openCategoryModal()
                  } else if (activeTab === 'templates') {
                    // Assuming there's a template modal if needed, else ignore
                  } else {
                    openProductModal()
                  }
                }}
                style={{ background: '#0284c7', fontWeight: 600, borderRadius: 8, flex: isMobile ? 1 : 'none' }}
              >
                Thêm {activeTab === 'categories' ? 'Danh mục' : (activeTab === 'templates' ? (isMobile ? 'Mẫu' : 'Mẫu sản phẩm') : (isMobile ? 'SP/DV' : 'Hàng hóa/Dịch vụ'))}
              </Button>
            )}
          </div>
        </Col>
      </Row>

      {/* ── Tabs / Collapse ───────────────────────────────────────────────────────── */}
      <Card style={{ borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }} bodyStyle={{ padding: 16 }}>
        {isMobile ? (
          <Collapse
            accordion
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key || 'products')}
            items={tabItems}
            style={{ background: 'transparent' }}
            bordered={false}
          />
        ) : (
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            size="middle"
            items={tabItems}
          />
        )}
      </Card>

      {/* ── Modal Product Add / Edit ───────────────────────────────────── */}
      <Modal
        title={<Text strong style={{ fontSize: 18 }}>{editingProduct ? 'Chỉnh sửa' : 'Thêm mới'}</Text>}
        open={productModalVisible}
        onCancel={() => setProductModalVisible(false)}
        onOk={handleProductSubmit}
        confirmLoading={submitting}
        okText="Lưu"
        cancelText="Hủy"
        width={700}
      >
        <Form form={productForm} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="sku" label="Mã SKU">
                <Input placeholder="VD: SP-001..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="Tên hàng hóa/dịch vụ" rules={[{ required: true }]}>
                <Input placeholder="Tên..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="product_type" label="Loại" rules={[{ required: true }]}>
                <Select>
                  <Option value="product">Hàng hóa</Option>
                  <Option value="service">Dịch vụ / Chi phí</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="category" label="Danh mục SP/Dịch vụ" rules={[{ required: true, message: 'Vui lòng chọn danh mục' }]}>
                <Select placeholder="Chọn danh mục...">
                  {(selectedProductType === 'service' ? serviceCategories : productCategories).map((c) => (
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
                <Upload
                  beforeUpload={(file) => {
                    const isImage = file.type.startsWith('image/')
                    if (!isImage) {
                      message.error('Chỉ được tải lên file hình ảnh!')
                      return false
                    }
                    setProductImageFile(file)
                    setProductPreviewImage(URL.createObjectURL(file))
                    return false
                  }}
                  maxCount={1}
                  showUploadList={false}
                >
                  <Button icon={<UploadOutlined />} style={{ marginBottom: 8 }}>
                    Chọn hình ảnh sản phẩm
                  </Button>
                </Upload>
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
                <TextArea rows={3} placeholder="Mô tả quy cách, thông số kỹ thuật (dành cho Báo giá/Đơn hàng)..." />
              </Form.Item>
            </Col>
            
            {canManageAIKnowledge && (
              <Col xs={24} md={24}>
                <Form.Item 
                  name="ai_knowledge" 
                  label={<span style={{ color: '#722ed1', fontWeight: 500 }}>✨ Tài liệu kiến thức AI (Ẩn trên Báo giá)</span>}
                  tooltip="Mô tả chi tiết, kịch bản bán hàng, xuất xứ, tính năng nâng cao chỉ dành riêng cho AI đọc để tư vấn khách hàng."
                >
                  <TextArea rows={4} placeholder="Nhập thông tin chi tiết về sản phẩm để huấn luyện AI tư vấn..." />
                </Form.Item>
              </Col>
            )}

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


    </section>
  )
}
