import React, { useState, useEffect } from 'react'
import {
  Drawer,
  Tabs,
  Table,
  Button,
  Form,
  Input,
  InputNumber,
  Space,
  Tag,
  Typography,
  Popconfirm,
  message,
  Modal,
  Row,
  Col,
  Badge,
  Empty,
  Image,
  Card,
  Tooltip
} from 'antd'
import {
  ShoppingOutlined,
  PushpinOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  TagOutlined,
  ReloadOutlined,
  LinkOutlined,
  CheckCircleOutlined
} from '@ant-design/icons'
import api from '../../../utils/api'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

export default function LiveShoppingBagDrawer({
  visible,
  onClose,
  sessionId,
  onProductPinnedChange
}) {
  const [activeTab, setActiveTab] = useState('products')
  const [products, setProducts] = useState([])
  const [vouchers, setVouchers] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Modals
  const [productModalVisible, setProductModalVisible] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [batchModalVisible, setBatchModalVisible] = useState(false)
  const [voucherModalVisible, setVoucherModalVisible] = useState(false)
  
  const [form] = Form.useForm()
  const [batchForm] = Form.useForm()
  const [voucherForm] = Form.useForm()

  const fetchProducts = async () => {
    if (!sessionId) return
    try {
      setLoading(true)
      const res = await api.get(`/live_sessions/session-products/?session=${sessionId}`)
      const items = Array.isArray(res.data) ? res.data : (res.data?.results || [])
      setProducts(items)
    } catch (err) {
      console.error('Lỗi tải danh sách sản phẩm:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchVouchers = async () => {
    if (!sessionId) return
    try {
      const res = await api.get(`/live_sessions/session-vouchers/?session=${sessionId}`)
      const items = Array.isArray(res.data) ? res.data : (res.data?.results || [])
      setVouchers(items)
    } catch (err) {
      console.error('Lỗi tải vouchers:', err)
    }
  }

  useEffect(() => {
    if (visible && sessionId) {
      fetchProducts()
      fetchVouchers()
    }
  }, [visible, sessionId])

  // ── Pin / Unpin Product ─────────────────────────────────────────────────────
  const handlePinProduct = async (product) => {
    try {
      await api.post(`/live_sessions/session-products/${product.id}/pin/`)
      message.success(`Đã ghim [Mã ${product.item_index}] ${product.name} lên live!`)
      fetchProducts()
      if (onProductPinnedChange) onProductPinnedChange(product)
    } catch (err) {
      message.error(err?.response?.data?.detail || 'Không thể ghim sản phẩm')
    }
  }

  const handleUnpinProduct = async (product) => {
    try {
      await api.post(`/live_sessions/session-products/${product.id}/unpin/`)
      message.info(`Đã hủy ghim [Mã ${product.item_index}]`)
      fetchProducts()
      if (onProductPinnedChange) onProductPinnedChange(null)
    } catch (err) {
      message.error(err?.response?.data?.detail || 'Không thể hủy ghim')
    }
  }

  // ── Delete Product ──────────────────────────────────────────────────────────
  const handleDeleteProduct = async (productId) => {
    try {
      await api.delete(`/live_sessions/session-products/${productId}/`)
      message.success('Đã xóa sản phẩm khỏi giỏ live')
      fetchProducts()
    } catch (err) {
      message.error('Không thể xóa sản phẩm')
    }
  }

  // ── Save (Create / Update) Product ──────────────────────────────────────────
  const handleSaveProduct = async () => {
    try {
      const values = await form.validateFields()
      const payload = { ...values, session: sessionId }
      
      if (editingProduct) {
        await api.patch(`/live_sessions/session-products/${editingProduct.id}/`, payload)
        message.success('Đã cập nhật thông tin sản phẩm')
      } else {
        await api.post('/live_sessions/session-products/', payload)
        message.success('Đã thêm sản phẩm vào giỏ live')
      }
      
      setProductModalVisible(false)
      setEditingProduct(null)
      form.resetFields()
      fetchProducts()
    } catch (err) {
      if (err.errorFields) return
      message.error(err?.response?.data?.detail || err?.response?.data?.item_index || 'Lỗi khi lưu sản phẩm')
    }
  }

  // ── Batch Import Products ───────────────────────────────────────────────────
  const handleBatchImport = async () => {
    try {
      const values = await batchForm.validateFields()
      let parsedProducts = []

      if (values.import_type === 'json') {
        try {
          parsedProducts = JSON.parse(values.json_data)
        } catch {
          message.error('Dữ liệu JSON không đúng cú pháp.')
          return
        }
      } else {
        // Multi-line text format: Tên | Giá gốc | Giá live | Shopee ID | USP
        const lines = values.text_data.split('\n').filter(l => l.trim())
        parsedProducts = lines.map((line, idx) => {
          const parts = line.split('|').map(p => p.trim())
          return {
            name: parts[0] || `Sản phẩm ${idx + 1}`,
            original_price: parts[1] ? Number(parts[1].replace(/\D/g, '')) : null,
            live_price: parts[2] ? Number(parts[2].replace(/\D/g, '')) : null,
            platform_item_id: parts[3] || null,
            selling_points: parts[4] || ''
          }
        })
      }

      if (!parsedProducts || parsedProducts.length === 0) {
        message.warning('Không có sản phẩm nào để nạp')
        return
      }

      await api.post('/live_sessions/session-products/batch_create/', {
        session_id: sessionId,
        products: parsedProducts
      })

      message.success(`Đã nạp thành công ${parsedProducts.length} sản phẩm vào giỏ live!`)
      setBatchModalVisible(false)
      batchForm.resetFields()
      fetchProducts()
    } catch (err) {
      message.error(err?.response?.data?.detail || 'Không thể nạp danh sách sản phẩm')
    }
  }

  // ── Voucher Actions ─────────────────────────────────────────────────────────
  const handlePinVoucher = async (voucher) => {
    try {
      await api.post(`/live_sessions/session-vouchers/${voucher.id}/pin/`)
      message.success(`Đã ghim voucher ${voucher.voucher_code} lên phiên live!`)
      fetchVouchers()
    } catch (err) {
      message.error('Không thể ghim voucher')
    }
  }

  const handleUnpinVoucher = async (voucher) => {
    try {
      await api.post(`/live_sessions/session-vouchers/${voucher.id}/unpin/`)
      message.info(`Đã hủy ghim voucher ${voucher.voucher_code}`)
      fetchVouchers()
    } catch (err) {
      message.error('Không thể hủy ghim voucher')
    }
  }

  const handleSaveVoucher = async () => {
    try {
      const values = await voucherForm.validateFields()
      await api.post('/live_sessions/session-vouchers/', {
        ...values,
        session: sessionId
      })
      message.success('Đã thêm voucher vào phiên live')
      setVoucherModalVisible(false)
      voucherForm.resetFields()
      fetchVouchers()
    } catch (err) {
      message.error('Không thể lưu voucher')
    }
  }

  const handleDeleteVoucher = async (voucherId) => {
    try {
      await api.delete(`/live_sessions/session-vouchers/${voucherId}/`)
      message.success('Đã xóa voucher')
      fetchVouchers()
    } catch (err) {
      message.error('Không thể xóa voucher')
    }
  }

  // ── Table Columns ───────────────────────────────────────────────────────────
  const productColumns = [
    {
      title: 'Mã Live',
      dataIndex: 'item_index',
      key: 'item_index',
      width: 80,
      align: 'center',
      render: (val) => (
        <Tag color="orange" style={{ fontWeight: 'bold', fontSize: 13, padding: '2px 8px' }}>
          #{val < 10 ? `0${val}` : val}
        </Tag>
      )
    },
    {
      title: 'Ảnh',
      dataIndex: 'effective_image_url',
      key: 'image',
      width: 70,
      render: (url) => (
        <Image
          src={url || 'https://placehold.co/80x80?text=SP'}
          fallback="https://placehold.co/80x80?text=SP"
          width={50}
          height={50}
          style={{ objectFit: 'cover', borderRadius: 6 }}
        />
      )
    },
    {
      title: 'Tên Sản Phẩm & USP',
      key: 'name_desc',
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 14 }}>{r.name}</Text>
          {r.sku && <Tag style={{ marginLeft: 8, fontSize: 11 }}>SKU: {r.sku}</Tag>}
          {r.platform_item_id && <Tag color="blue" style={{ fontSize: 11 }}>Shopee ID: {r.platform_item_id}</Tag>}
          {r.selling_points && (
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              💡 {r.selling_points}
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Giá Bán',
      key: 'price',
      width: 140,
      render: (_, r) => (
        <div>
          {r.live_price ? (
            <div>
              <Text strong style={{ color: '#ee4d2d', fontSize: 14 }}>
                {Number(r.live_price).toLocaleString()}đ
              </Text>
              {r.original_price && (
                <div style={{ fontSize: 11, color: '#8c8c8c', textDecoration: 'line-through' }}>
                  {Number(r.original_price).toLocaleString()}đ
                </div>
              )}
            </div>
          ) : (
            <Text>{r.original_price ? `${Number(r.original_price).toLocaleString()}đ` : '--'}</Text>
          )}
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>Kho: {r.stock}</div>
        </div>
      )
    },
    {
      title: 'Ghim trên Sóng',
      key: 'pin_status',
      width: 130,
      align: 'center',
      render: (_, r) => (
        <div>
          {r.is_pinned ? (
            <Space direction="vertical" size={4}>
              <Badge status="processing" color="#52c41a" text={<Text strong style={{ color: '#52c41a', fontSize: 12 }}>ĐANG GHIM</Text>} />
              <Button size="small" danger onClick={() => handleUnpinProduct(r)}>Hủy ghim</Button>
            </Space>
          ) : (
            <Button
              type="primary"
              size="small"
              icon={<PushpinOutlined />}
              style={{ backgroundColor: '#ee4d2d' }}
              onClick={() => handlePinProduct(r)}
            >
              Ghim ngay
            </Button>
          )}
        </div>
      )
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 90,
      align: 'center',
      render: (_, r) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EditOutlined />}
            size="small"
            onClick={() => {
              setEditingProduct(r)
              form.setFieldsValue(r)
              setProductModalVisible(true)
            }}
          />
          <Popconfirm
            title="Xóa sản phẩm này khỏi túi hàng Live?"
            okText="Xóa"
            cancelText="Hủy"
            okType="danger"
            onConfirm={() => handleDeleteProduct(r.id)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const voucherColumns = [
    {
      title: 'Mã Voucher',
      dataIndex: 'voucher_code',
      key: 'voucher_code',
      render: (code) => <Tag color="volcano" style={{ fontWeight: 'bold' }}>{code}</Tag>
    },
    {
      title: 'Nội dung Khuyến mãi',
      dataIndex: 'discount_text',
      key: 'discount_text',
      render: (text) => <Text strong>{text}</Text>
    },
    {
      title: 'Đơn Tối Thiểu',
      dataIndex: 'min_order_value',
      key: 'min_order_value',
      render: (val) => val ? `${Number(val).toLocaleString()}đ` : 'Không giới hạn'
    },
    {
      title: 'Trạng thái Ghim',
      key: 'is_pinned',
      align: 'center',
      render: (_, v) => (
        v.is_pinned ? (
          <Space>
            <Tag color="success">Đang ghim</Tag>
            <Button size="small" danger onClick={() => handleUnpinVoucher(v)}>Hủy</Button>
          </Space>
        ) : (
          <Button size="small" type="primary" ghost icon={<TagOutlined />} onClick={() => handlePinVoucher(v)}>
            Ghim Voucher
          </Button>
        )
      )
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'center',
      render: (_, v) => (
        <Popconfirm title="Xóa voucher này?" onConfirm={() => handleDeleteVoucher(v.id)}>
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      )
    }
  ]

  return (
    <Drawer
      title={
        <Space>
          <ShoppingOutlined style={{ color: '#ee4d2d', fontSize: 20 }} />
          <span>Túi Hàng Livestream (Live Shopping Bag) & Vouchers</span>
        </Space>
      }
      styles={{ wrapper: { width: 850 } }}
      open={visible}
      onClose={onClose}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => { fetchProducts(); fetchVouchers(); }}>Làm mới</Button>
          <Button onClick={onClose}>Đóng</Button>
        </Space>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'products',
            label: (
              <span>
                <ShoppingOutlined style={{ marginRight: 6 }} />
                Danh Sách Sản Phẩm ({products.length})
              </span>
            ),
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <Text type="secondary">
                      💡 Số thứ tự <b>#01, #02...</b> sẽ được AI nhắc trên live. Khi khách comment "mã 1", AI sẽ tự động ghim sản phẩm đó!
                    </Text>
                  </div>
                  <Space>
                    <Button
                      icon={<ThunderboltOutlined />}
                      onClick={() => {
                        batchForm.resetFields()
                        setBatchModalVisible(true)
                      }}
                    >
                      Nạp hàng loạt (Batch)
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      style={{ backgroundColor: '#ee4d2d' }}
                      onClick={() => {
                        setEditingProduct(null)
                        form.resetFields()
                        setProductModalVisible(true)
                      }}
                    >
                      Thêm sản phẩm
                    </Button>
                  </Space>
                </div>

                <Table
                  dataSource={products}
                  columns={productColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                  size="middle"
                />
              </div>
            )
          },
          {
            key: 'vouchers',
            label: (
              <span>
                <TagOutlined style={{ marginRight: 6 }} />
                Voucher & Khuyến Mãi ({vouchers.length})
              </span>
            ),
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text type="secondary">
                    Ghim voucher độc quyền của shop để kích thích khách xem live lưu mã chốt đơn ngay lập tức.
                  </Text>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    style={{ backgroundColor: '#ee4d2d' }}
                    onClick={() => {
                      voucherForm.resetFields()
                      setVoucherModalVisible(true)
                    }}
                  >
                    Thêm Voucher
                  </Button>
                </div>

                <Table
                  dataSource={vouchers}
                  columns={voucherColumns}
                  rowKey="id"
                  pagination={{ pageSize: 5 }}
                  size="middle"
                />
              </div>
            )
          }
        ]}
      />

      {/* ── Modal Thêm / Sửa Sản Phẩm ────────────────────────────────────── */}
      <Modal
        title={editingProduct ? "Chỉnh Sửa Sản Phẩm Live" : "Thêm Sản Phẩm Mới Vào Giỏ Live"}
        open={productModalVisible}
        onCancel={() => setProductModalVisible(false)}
        onOk={handleSaveProduct}
        okText={editingProduct ? "Cập nhật" : "Thêm vào giỏ"}
        cancelText="Hủy"
        width={620}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                name="item_index"
                label="Mã số gọi (Live)"
                help="Để trống hệ thống tự tăng"
              >
                <InputNumber min={1} max={999} style={{ width: '100%' }} placeholder="Tự động" />
              </Form.Item>
            </Col>
            <Col span={18}>
              <Form.Item
                name="name"
                label="Tên sản phẩm"
                rules={[{ required: true, message: 'Vui lòng nhập tên sản phẩm' }]}
              >
                <Input placeholder="Ví dụ: Nồi chiên không dầu Lock&Lock 5.5L" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="original_price" label="Giá gốc (Niêm yết)">
                <InputNumber
                  style={{ width: '100%' }}
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value.replace(/\$\s?|(,*)/g, '')}
                  placeholder="2,500,000"
                  addonAfter="VND"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="live_price" label="Giá sốc trên Live (Flash Sale)">
                <InputNumber
                  style={{ width: '100%' }}
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value.replace(/\$\s?|(,*)/g, '')}
                  placeholder="1,490,000"
                  addonAfter="VND"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="platform_item_id" label="Shopee Item ID (Nếu có)">
                <Input placeholder="Ví dụ: 1827463821" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sku" label="Mã SKU (Tùy chọn)">
                <Input placeholder="Ví dụ: LOCK-AIR-01" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="image_url" label="Link ảnh sản phẩm trực tuyến">
            <Input placeholder="https://cf.shopee.vn/file/..." />
          </Form.Item>

          <Form.Item name="product_url" label="Link sản phẩm Shopee/Sàn">
            <Input placeholder="https://shopee.vn/product/..." />
          </Form.Item>

          <Form.Item
            name="selling_points"
            label="Luận điểm bán hàng / Điểm nổi bật (USP)"
            help="AI sẽ sử dụng thông tin này để tư vấn tính năng và công dụng cho khách"
          >
            <TextArea
              rows={3}
              placeholder="Ví dụ: Dung tích 5.5L chiên cả con gà, chống dính ceramic bền bỉ, công nghệ Rapid Air giảm 80% mỡ thừa, bảo hành 2 năm chính hãng..."
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="stock" label="Số lượng tồn kho trong live" initialValue={100}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="duration_minutes" label="Thời lượng nói kịch bản (phút)" initialValue={2}>
                <InputNumber min={1} max={30} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Modal Nạp Hàng Loạt (Batch Import) ────────────────────────────── */}
      <Modal
        title="Nạp Hàng Loạt Sản Phẩm Vào Giỏ Live"
        open={batchModalVisible}
        onCancel={() => setBatchModalVisible(false)}
        onOk={handleBatchImport}
        okText="Nạp vào giỏ"
        cancelText="Hủy"
        width={680}
      >
        <Form form={batchForm} layout="vertical" initialValues={{ import_type: 'text' }} style={{ marginTop: 16 }}>
          <Form.Item name="import_type" label="Định dạng nhập liệu">
            <Tabs
              type="card"
              items={[
                { key: 'text', label: 'Dạng bảng phân cách (|)' },
                { key: 'json', label: 'Dạng JSON' }
              ]}
              onChange={(k) => batchForm.setFieldsValue({ import_type: k })}
            />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.import_type !== cur.import_type}>
            {() => {
              const type = batchForm.getFieldValue('import_type')
              if (type === 'json') {
                return (
                  <Form.Item
                    name="json_data"
                    label="Dữ liệu JSON"
                    rules={[{ required: true, message: 'Vui lòng dán mảng JSON' }]}
                    help='Định dạng: [{"name": "Áo polo", "live_price": 189000, "original_price": 250000, "platform_item_id": "123", "selling_points": "Vải cotton cá sấu"}]'
                  >
                    <TextArea rows={8} placeholder='[{"name": "Áo Polo Nam", "live_price": 189000, "original_price": 250000}]' />
                  </Form.Item>
                )
              }
              return (
                <Form.Item
                  name="text_data"
                  label="Dán danh sách sản phẩm (Mỗi dòng một sản phẩm)"
                  rules={[{ required: true, message: 'Vui lòng nhập danh sách sản phẩm' }]}
                  help="Cú pháp mỗi dòng: Tên sản phẩm | Giá gốc | Giá Live | Shopee Item ID | Đặc điểm USP"
                >
                  <TextArea
                    rows={8}
                    placeholder="Áo Polo Nam Cao Cấp | 250000 | 189000 | 11111 | Cotton 100% thấm hút mồ hôi&#10;Quần Short Kaki Co Giãn | 220000 | 149000 | 22222 | Phom đứng dáng trẻ trung&#10;Bình Giữ Nhiệt 500ml | 350000 | 199000 | 33333 | Giữ nóng 12h giữ lạnh 24h"
                  />
                </Form.Item>
              )
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal Thêm Voucher ────────────────────────────────────────────── */}
      <Modal
        title="Thêm Voucher Khuyến Mãi Phiên Live"
        open={voucherModalVisible}
        onCancel={() => setVoucherModalVisible(false)}
        onOk={handleSaveVoucher}
        okText="Thêm Voucher"
        cancelText="Hủy"
      >
        <Form form={voucherForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="voucher_code"
            label="Mã Voucher"
            rules={[{ required: true, message: 'Vui lòng nhập mã voucher' }]}
          >
            <Input placeholder="Ví dụ: GIAM30K, FREESHIP50..." />
          </Form.Item>
          <Form.Item
            name="discount_text"
            label="Nội dung ưu đãi"
            rules={[{ required: true, message: 'Vui lòng nhập nội dung ưu đãi' }]}
            help="Ví dụ: Giảm 30K cho đơn từ 200K, hoặc Giảm 15% tối đa 50K"
          >
            <Input placeholder="Ví dụ: Giảm 30K cho đơn từ 200K" />
          </Form.Item>
          <Form.Item name="min_order_value" label="Đơn hàng tối thiểu (Tùy chọn)">
            <InputNumber
              style={{ width: '100%' }}
              formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/\$\s?|(,*)/g, '')}
              placeholder="200,000"
              addonAfter="VND"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  )
}

