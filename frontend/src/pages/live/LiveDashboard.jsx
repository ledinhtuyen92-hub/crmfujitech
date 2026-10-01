import React, { useState, useEffect } from 'react'
import { Card, Typography, Space, Row, Col, Statistic, Button } from 'antd'
import { VideoCameraOutlined, ApiOutlined, TeamOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

const { Title } = Typography

export default function LiveDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ activeSessions: 0, connectedPlatforms: 0, totalDevices: 0 })

  useEffect(() => {
    Promise.all([
      api.get('/live_sessions/sessions/').catch(() => ({ data: [] })),
      api.get('/live_sessions/platform-accounts/').catch(() => ({ data: [] })),
      api.get('/live_sessions/devices/').catch(() => ({ data: [] }))
    ]).then(([sessRes, accRes, devRes]) => {
      const sessions = Array.isArray(sessRes.data) ? sessRes.data : sessRes.data.results || []
      const accounts = Array.isArray(accRes.data) ? accRes.data : accRes.data.results || []
      const devices = Array.isArray(devRes.data) ? devRes.data : devRes.data.results || []

      setStats({
        activeSessions: sessions.filter(s => s.status === 'running').length,
        connectedPlatforms: accounts.filter(a => a.status === 'connected').length,
        totalDevices: devices.length
      })
    })
  }, [])

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Live Workspace</Title>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={() => navigate('/live/sessions')}
        >
          Tạo Session Mới
        </Button>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic 
              title="Active Sessions" 
              value={stats.activeSessions} 
              prefix={<VideoCameraOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic 
              title="Connected Platforms" 
              value={stats.connectedPlatforms} 
              prefix={<ApiOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic 
              title="Total Devices" 
              value={stats.totalDevices} 
              prefix={<TeamOutlined />} 
            />
          </Card>
        </Col>
      </Row>
      
      <div style={{ marginTop: 24 }}>
        <Card title="Quick Actions">
          <Space>
            <Button onClick={() => navigate('/live/sessions')}>Quản lý Sessions</Button>
            <Button onClick={() => navigate('/live/platforms')}>Quản lý Kết nối</Button>
          </Space>
        </Card>
      </div>
    </div>
  )
}
