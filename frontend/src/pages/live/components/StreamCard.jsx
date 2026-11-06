import React, { useState } from 'react'
import { Card, Typography, Space, Button, Divider, Tooltip, Row, Col, Dropdown, Modal, Tag } from 'antd'
import { PlayCircleOutlined, StopOutlined, RobotOutlined, DesktopOutlined, ShopOutlined, ApiOutlined, MoreOutlined, DeleteOutlined, ExclamationCircleOutlined, ShoppingOutlined, TagOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import LiveStatusBadge from './LiveStatusBadge'

const { Text, Title } = Typography

export default function StreamCard({ session, onStart, onStop, onDelete, onEdit, onOpenBag, onClick }) {
  const navigate = useNavigate()
  const [isDeleting, setIsDeleting] = useState(false)
  
  const { 
    platform, 
    status, 
    device_name, 
    product_name, 
    ai_agent_name, 
    shopee_connection_mode,
    created_at
  } = session

  const isRunning = status === 'running' || status === 'human_takeover'
  const isReady = ['ready', 'draft', 'stopped', 'error'].includes(status)
  // Cho phép chỉnh sửa và xóa khi phiên không đang chạy
  const isDeletable = !isRunning

  const handleDeleteClick = (e) => {
    if (e.domEvent) e.domEvent.stopPropagation()
    Modal.confirm({
      title: 'Bạn có chắc muốn xóa phiên livestream này?',
      icon: <ExclamationCircleOutlined />,
      content: 'Thao tác này không thể hoàn tác.',
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        setIsDeleting(true)
        try {
          if (onDelete) await onDelete(session.id)
        } finally {
          setIsDeleting(false)
        }
      }
    })
  }

  const menuItems = [
    {
      key: 'bag',
      label: `Túi hàng Live (${session.session_products?.length || 0})`,
      icon: <ShoppingOutlined style={{ color: '#ee4d2d' }} />,
      onClick: (e) => {
        if (e.domEvent) e.domEvent.stopPropagation()
        if (onOpenBag) onOpenBag(session)
      }
    },
    {
      key: 'edit',
      label: 'Chỉnh sửa',
      icon: <ApiOutlined />,
      disabled: !isDeletable, // Allow edit whenever session is not running
      onClick: (e) => {
        if (e.domEvent) e.domEvent.stopPropagation()
        if (onEdit) onEdit(session)
      }
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      label: 'Xóa phiên',
      icon: <DeleteOutlined />,
      danger: true,
      disabled: !isDeletable || isDeleting,
      onClick: handleDeleteClick
    }
  ]

  // Determine platform identity
  const getPlatformLabel = () => {
    if (platform === 'shopee') return <Text strong style={{ color: '#ee4d2d', whiteSpace: 'nowrap', flexShrink: 0 }}>Shopee</Text>
    if (platform === 'tiktok') return <Text strong style={{ color: '#000000', whiteSpace: 'nowrap', flexShrink: 0 }}>TikTok</Text>
    return <Text strong style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Custom</Text>
  }

  return (
    <Card 
      hoverable
      onClick={() => onClick ? onClick() : navigate(`/live/studio/${session.id}`)}
      style={{ 
        borderRadius: 12, 
        overflow: 'hidden',
        border: isRunning ? '1px solid #52c41a' : '1px solid #f0f0f0',
        boxShadow: isRunning ? '0 4px 12px rgba(82,196,26,0.1)' : '0 2px 8px rgba(0,0,0,0.04)',
        opacity: isDeleting ? 0.6 : 1
      }}
      styles={{ body: { padding: 0 } }}
    >
      {/* Header */}
      <div style={{ 
        padding: '12px 16px', 
        background: isRunning ? '#f6ffed' : '#fafafa', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 1, overflow: 'hidden' }}>
          {getPlatformLabel()}
          <Divider type="vertical" style={{ margin: '0 2px', height: 14 }} />
          <LiveStatusBadge status={status} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {shopee_connection_mode && (
            <Tooltip title={shopee_connection_mode === 'api' ? 'API Mode' : 'Manual RTMP'}>
              <ApiOutlined style={{ color: '#8c8c8c' }} />
            </Tooltip>
          )}
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} size="small" onClick={(e) => e.stopPropagation()} loading={isDeleting} />
          </Dropdown>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '20px' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {session.session_products?.length > 0 ? 'Túi hàng Live' : 'Sản phẩm trung tâm'}
              </Text>
              {session.session_products?.length > 0 && (
                <Tag color="orange" style={{ margin: 0, fontSize: 11, padding: '0 6px', borderRadius: 10 }}>
                  {session.session_products.length} SP
                </Tag>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
              {session.session_products?.length > 0 ? (
                <>
                  <ShoppingOutlined style={{ marginRight: 8, color: '#ee4d2d' }} />
                  <Text strong ellipsis style={{ color: '#ee4d2d' }}>
                    {session.pinned_product ? `Đang ghim: #${session.pinned_product.item_index} - ${session.pinned_product.name}` : `${session.session_products.length} sản phẩm trong túi live`}
                  </Text>
                </>
              ) : (
                <>
                  <ShopOutlined style={{ marginRight: 8, color: '#1649c9' }} />
                  <Text strong ellipsis>{product_name || 'Chưa thiết lập'}</Text>
                </>
              )}
            </div>
          </div>

          <Row gutter={16}>
            <Col span={12}>
              <Text type="secondary" style={{ fontSize: 12 }}>Máy chủ (Device)</Text>
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
                <DesktopOutlined style={{ marginRight: 6, color: '#8c8c8c' }} />
                <Text ellipsis style={{ fontSize: 13 }}>{device_name || '--'}</Text>
              </div>
            </Col>
            <Col span={12}>
              <Text type="secondary" style={{ fontSize: 12 }}>AI Host</Text>
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
                <RobotOutlined style={{ marginRight: 6, color: '#8c8c8c' }} />
                <Text ellipsis style={{ fontSize: 13 }}>{ai_agent_name || '--'}</Text>
              </div>
            </Col>
          </Row>
          
        </Space>
      </div>

      {/* Footer Actions */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          size="small"
          icon={<ShoppingOutlined />}
          onClick={(e) => { e.stopPropagation(); onOpenBag && onOpenBag(session); }}
          style={{ borderRadius: 6, borderColor: '#ffbb96', color: '#d4380d' }}
        >
          Túi hàng {session.session_products?.length > 0 ? `(${session.session_products.length})` : ''}
        </Button>
        <Space>
          <Button 
            type="primary" 
            size="small"
            icon={<PlayCircleOutlined />}
            disabled={!isReady}
            onClick={(e) => { e.stopPropagation(); onStart && onStart(session.id); }}
            style={{ borderRadius: 6 }}
          >
            Start
          </Button>
          <Button 
            danger 
            size="small"
            icon={<StopOutlined />}
            disabled={!isRunning}
            onClick={(e) => { e.stopPropagation(); onStop && onStop(session.id); }}
            style={{ borderRadius: 6 }}
          >
            Stop
          </Button>
        </Space>
      </div>
    </Card>
  )
}
