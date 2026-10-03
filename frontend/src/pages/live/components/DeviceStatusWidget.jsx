import React from 'react'
import { Card, Typography, Space, Tooltip, Progress } from 'antd'
import { DesktopOutlined, WindowsOutlined, HddOutlined, CodeOutlined } from '@ant-design/icons'
import LiveStatusBadge from './LiveStatusBadge'

const { Text, Title } = Typography

export default function DeviceStatusWidget({ device }) {
  const { name, is_online, last_seen_at, active_session_id } = device

  const status = is_online ? (active_session_id ? 'running' : 'online') : 'offline'
  
  const cpuUsage = device.metadata?.cpu_usage !== undefined ? device.metadata.cpu_usage : null
  const ramUsage = device.metadata?.ram_usage !== undefined ? device.metadata.ram_usage : null
  const hasMetrics = cpuUsage !== null && ramUsage !== null

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
            {(device.metadata.os_version || device.metadata.cpu_model || device.metadata.gpu_model) && (
              <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 12, borderBottom: '1px dashed #e8e8e8', paddingBottom: 8 }}>
                {device.metadata.os_version && <div style={{ marginBottom: 4 }}><WindowsOutlined style={{marginRight: 4}}/> Hệ điều hành: {device.metadata.os_version}</div>}
                {device.metadata.cpu_model && <div style={{ marginBottom: 4 }}><CodeOutlined style={{marginRight: 4}}/> CPU: {device.metadata.cpu_model}</div>}
                {device.metadata.gpu_model && <div style={{ marginBottom: 4 }}><DesktopOutlined style={{marginRight: 4}}/> GPU: {device.metadata.gpu_model}</div>}
                <div style={{ display: 'flex', gap: 16 }}>
                  {device.metadata.total_ram_gb && <div><HddOutlined style={{marginRight: 4}}/> RAM: {device.metadata.total_ram_gb} GB</div>}
                  {device.metadata.disk_total_gb && <div><HddOutlined style={{marginRight: 4}}/> Ổ cứng: {device.metadata.disk_total_gb} GB</div>}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <Text type="secondary">CPU Mức tải</Text>
              <Text>{cpuUsage}%</Text>
            </div>
            <Progress percent={cpuUsage} size="small" showInfo={false} strokeColor={cpuUsage > 85 ? '#f5222d' : '#1649c9'} />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
              <Text type="secondary">RAM Mức tải</Text>
              <Text>{ramUsage}%</Text>
            </div>
            <Progress percent={ramUsage} size="small" showInfo={false} strokeColor={ramUsage > 85 ? '#f5222d' : '#1649c9'} />
          </Space>
        ) : (
          <div style={{ textAlign: 'center', padding: '4px 0' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Chưa có dữ liệu phần cứng</Text>
          </div>
        )}
      </div>
      
      {!is_online && last_seen_at && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Cập nhật cuối: {new Date(last_seen_at).toLocaleString('vi-VN')}
          </Text>
        </div>
      )}
    </Card>
  )
}
