import React, { useState } from 'react'
import {
  List,
  Typography,
  Tag,
  Button,
  Space,
  Input,
  Badge,
  Empty,
  Image,
  message,
  Card
} from 'antd'
import {
  PushpinOutlined,
  SearchOutlined,
  FullscreenOutlined,
  ShoppingOutlined,
  CheckCircleOutlined
} from '@ant-design/icons'
import api from '../../../utils/api'

const { Text } = Typography

export default function LiveShoppingBagCompact({
  products = [],
  onRefresh,
  onOpenFullDrawer,
  onProductPinnedChange
}) {
  const [searchText, setSearchText] = useState('')
  const [pinningId, setPinningId] = useState(null)

  const filteredProducts = products.filter(p => {
    if (!searchText) return true
    const q = searchText.toLowerCase().trim()
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      String(p.item_index) === q ||
      `#${p.item_index}` === q ||
      `#0${p.item_index}` === q
    )
  })

  const handlePin = async (product) => {
    try {
      setPinningId(product.id)
      await api.post(`/live_sessions/session-products/${product.id}/pin/`)
      message.success(`Đã ghim [Mã ${product.item_index}] ${product.name}`)
      if (onRefresh) onRefresh()
      if (onProductPinnedChange) onProductPinnedChange(product)
    } catch (err) {
      message.error(err?.response?.data?.detail || 'Không thể ghim sản phẩm')
    } finally {
      setPinningId(null)
    }
  }

  const handleUnpin = async (product) => {
    try {
      setPinningId(product.id)
      await api.post(`/live_sessions/session-products/${product.id}/unpin/`)
      message.info(`Đã hủy ghim [Mã ${product.item_index}]`)
      if (onRefresh) onRefresh()
      if (onProductPinnedChange) onProductPinnedChange(null)
    } catch (err) {
      message.error(err?.response?.data?.detail || 'Không thể hủy ghim')
    } finally {
      setPinningId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Search & Action Bar */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input
          placeholder="Tìm mã số hoặc tên SP..."
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          size="small"
          allowClear
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ flex: 1 }}
        />
        <Button
          size="small"
          type="dashed"
          icon={<FullscreenOutlined />}
          onClick={onOpenFullDrawer}
          title="Mở quản lý giỏ hàng đầy đủ"
        >
          Quản lý
        </Button>
      </div>

      {/* Product List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
        {filteredProducts.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có sản phẩm trong giỏ"
            style={{ marginTop: 40 }}
          >
            <Button size="small" type="primary" style={{ backgroundColor: '#ee4d2d' }} onClick={onOpenFullDrawer}>
              + Thêm sản phẩm
            </Button>
          </Empty>
        ) : (
          <List
            size="small"
            dataSource={filteredProducts}
            renderItem={item => (
              <List.Item
                style={{
                  padding: '8px 10px',
                  marginBottom: 6,
                  borderRadius: 8,
                  background: item.is_pinned ? '#fff7e6' : '#fafafa',
                  border: item.is_pinned ? '1px solid #ffd591' : '1px solid #f0f0f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease'
                }}
              >
                <Space size={8} style={{ minWidth: 0, flex: 1 }}>
                  <Tag
                    color={item.is_pinned ? 'orange' : 'default'}
                    style={{ fontWeight: 'bold', margin: 0, padding: '0 6px', fontSize: 12 }}
                  >
                    #{item.item_index < 10 ? `0${item.item_index}` : item.item_index}
                  </Tag>

                  <Image
                    src={item.effective_image_url || 'https://placehold.co/50x50?text=SP'}
                    fallback="https://placehold.co/50x50?text=SP"
                    width={36}
                    height={36}
                    preview={false}
                    style={{ objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                  />

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontWeight: 600,
                      fontSize: 12,
                      color: item.is_pinned ? '#d46b08' : '#262626',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {item.live_price ? (
                        <span style={{ color: '#ee4d2d', fontWeight: 600 }}>
                          {Number(item.live_price).toLocaleString()}đ
                        </span>
                      ) : (
                        <span style={{ color: '#8c8c8c' }}>
                          {item.original_price ? `${Number(item.original_price).toLocaleString()}đ` : '--'}
                        </span>
                      )}
                      {item.is_pinned && (
                        <Tag color="success" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                          Đang ghim
                        </Tag>
                      )}
                    </div>
                  </div>
                </Space>

                <div style={{ marginLeft: 8, flexShrink: 0 }}>
                  {item.is_pinned ? (
                    <Button
                      size="small"
                      danger
                      loading={pinningId === item.id}
                      onClick={() => handleUnpin(item)}
                      style={{ fontSize: 11, height: 24, padding: '0 8px' }}
                    >
                      Hủy
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      icon={<PushpinOutlined />}
                      loading={pinningId === item.id}
                      onClick={() => handlePin(item)}
                      style={{ fontSize: 11, height: 24, padding: '0 8px', borderColor: '#ee4d2d', color: '#ee4d2d' }}
                    >
                      Ghim
                    </Button>
                  )}
                </div>
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  )
}

