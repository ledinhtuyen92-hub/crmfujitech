import React, { useState } from 'react'
import { Card, Typography, Space, Button, Divider, Tooltip, Row, Col, Dropdown, Modal } from 'antd'
import { PlayCircleOutlined, StopOutlined, RobotOutlined, DesktopOutlined, ShopOutlined, ApiOutlined, MoreOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import LiveStatusBadge from './LiveStatusBadge'

const { Text, Title } = Typography

export default function StreamCard({ session, onStart, onStop, onDelete, onEdit, onClick }) {
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
  const isDeletable = ['draft', 'stopped', 'error'].includes(status)

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
      key: 'edit',
      label: 'Chỉnh sửa',
      icon: <ApiOutlined />,
      disabled: !isDeletable, // Only allow edit when stopped/draft/error
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
    if (platform === 'shopee') return <Text strong style={{ color: '#ee4d2d' }}>Shopee</Text>
    if (platform === 'tiktok') return <Text strong style={{ color: '#000000' }}>TikTok</Text>
    return <Text strong>Custom</Text>
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
      <div style={{ padding: '16px 20px', background: isRunning ? '#f6ffed' : '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          {getPlatformLabel()}
          <Divider orientation="vertical" />
          <LiveStatusBadge status={status} />
        </Space>
        <Space>
          {shopee_connection_mode && (
            <Tooltip title={shopee_connection_mode === 'api' ? 'API Mode' : 'Manual RTMP'}>
              <ApiOutlined style={{ color: '#8c8c8c' }} />
            </Tooltip>
          )}
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} size="small" onClick={(e) => e.stopPropagation()} loading={isDeleting} />
          </Dropdown>
        </Space>
      </div>

      {/* Body */}
      <div style={{ padding: '20px' }}>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Sản phẩm trung tâm</Text>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
              <ShopOutlined style={{ marginRight: 8, color: '#1649c9' }} />
              <Text strong ellipsis>{product_name || 'Chưa thiết lập'}</Text>
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
      <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end' }}>
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
