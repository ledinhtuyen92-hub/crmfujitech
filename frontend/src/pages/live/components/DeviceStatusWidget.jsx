import React from 'react'
import { Card, Typography, Space, Tooltip, Progress } from 'antd'
import { DesktopOutlined } from '@ant-design/icons'
import LiveStatusBadge from './LiveStatusBadge'

const { Text, Title } = Typography

export default function DeviceStatusWidget({ device }) {
  const { name, is_online, last_seen, active_session_id } = device

  const status = is_online ? (active_session_id ? 'running' : 'online') : 'offline'
  
  // Note: CPU/RAM metrics are mocked here as "Chưa có dữ liệu" unless real data arrives.
  const hasMetrics = false 
  const cpuMock = 0
  const ramMock = 0

  return (
    <Card 
      size="small" 
      style={{ borderRadius: 8, border: '1px solid #f0f0f0', marginBottom: 12 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <DesktopOutlined style={{ fontSize: 20, color: is_online ? '#1649c9' : '#d9d9d9' }} />
          <div>
            <Text strong style={{ display: 'block' }}>{name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>Máy chủ phát sóng</Text>
          </div>
        </Space>
        <LiveStatusBadge status={status} />
      </div>

      <div style={{ marginTop: 16, background: '#fafafa', padding: '8px 12px', borderRadius: 6 }}>
        {hasMetrics ? (
          <Space direction="vertical" style={{ width: '100%' }} size={0}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <Text type="secondary">CPU</Text>
              <Text>{cpuMock}%</Text>
            </div>
            <Progress percent={cpuMock} size="small" showInfo={false} strokeColor="#1649c9" />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
              <Text type="secondary">RAM</Text>
              <Text>{ramMock}%</Text>
            </div>
            <Progress percent={ramMock} size="small" showInfo={false} strokeColor="#1649c9" />
          </Space>
        ) : (
          <div style={{ textAlign: 'center', padding: '4px 0' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Chưa có dữ liệu phần cứng</Text>
          </div>
        )}
      </div>
      
      {!is_online && last_seen && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Cập nhật cuối: {new Date(last_seen).toLocaleString()}
          </Text>
        </div>
      )}
    </Card>
  )
}
