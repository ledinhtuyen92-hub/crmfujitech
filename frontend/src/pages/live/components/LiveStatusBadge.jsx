import React from 'react'
import { Tag, Badge } from 'antd'
import { PlayCircleOutlined, CheckCircleOutlined, StopOutlined, SyncOutlined, PauseCircleOutlined, UserOutlined } from '@ant-design/icons'

// Status Colors mapping
export const STATUS_COLORS = {
  running: '#52c41a', // Green
  live: '#52c41a',
  ready: '#1890ff', // Blue
  online: '#1890ff',
  draft: '#d9d9d9', // Grey
  offline: '#d9d9d9',
  stopped: '#ff4d4f', // Red
  error: '#ff4d4f',
  human_takeover: '#722ed1', // Purple
  connected: '#1890ff'
}

export const STATUS_TEXT = {
  running: 'Đang chạy',
  live: 'Live',
  ready: 'Sẵn sàng',
  online: 'Online',
  draft: 'Bản nháp',
  offline: 'Offline',
  stopped: 'Đã dừng',
  error: 'Lỗi',
  human_takeover: 'Người kiểm soát',
  connected: 'Đã kết nối'
}

export const STATUS_ICONS = {
  running: <SyncOutlined spin />,
  live: <PlayCircleOutlined />,
  ready: <CheckCircleOutlined />,
  online: <CheckCircleOutlined />,
  draft: <PauseCircleOutlined />,
  offline: <StopOutlined />,
  stopped: <StopOutlined />,
  error: <StopOutlined />,
  human_takeover: <UserOutlined />,
  connected: <CheckCircleOutlined />
}

export default function LiveStatusBadge({ status, type = 'tag' }) {
  const normalizedStatus = status?.toLowerCase() || 'draft'
  const color = STATUS_COLORS[normalizedStatus] || '#d9d9d9'
  const text = STATUS_TEXT[normalizedStatus] || status
  const icon = STATUS_ICONS[normalizedStatus] || null

  if (type === 'badge') {
    return <Badge color={color} text={text} />
  }

  if (type === 'dot') {
    return <Badge color={color} />
  }

  return (
    <Tag color={color} icon={icon} style={{ borderRadius: 12, padding: '2px 8px' }}>
      {text}
    </Tag>
  )
}
