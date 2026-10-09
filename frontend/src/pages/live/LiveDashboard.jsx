import React, { useState, useEffect } from 'react'
import { Card, Typography, Space, Row, Col, Statistic, Button, Spin, Empty, Alert } from 'antd'
import { VideoCameraOutlined, ApiOutlined, DesktopOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import StreamCard from './components/StreamCard'
import DeviceStatusWidget from './components/DeviceStatusWidget'
import LiveStatusBadge from './components/LiveStatusBadge'

const { Title, Text } = Typography

export default function LiveDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    sessions: [],
    accounts: [],
    devices: []
  })

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [sessRes, accRes, devRes] = await Promise.all([
          api.get('/live_sessions/sessions/').catch(() => ({ data: [] })),
          api.get('/live_sessions/platform-accounts/').catch(() => ({ data: [] })),
          api.get('/live_sessions/devices/').catch(() => ({ data: [] }))
        ])
        
        setData({
          sessions: Array.isArray(sessRes.data) ? sessRes.data : sessRes.data.results || [],
          accounts: Array.isArray(accRes.data) ? accRes.data : accRes.data.results || [],
          devices: Array.isArray(devRes.data) ? devRes.data : devRes.data.results || []
        })
      } catch (e) {
        console.error("Dashboard fetch error", e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const activeSessions = data.sessions.filter(s => s.status === 'running' || s.status === 'human_takeover')
  const readySessions = data.sessions.filter(s => ['ready', 'draft', 'stopped', 'error'].includes(s.status))
  
  const handleStartSession = async (id) => {
    try {
      await api.post(`/live_sessions/sessions/${id}/start/`)
      window.location.reload()
    } catch (err) {
      const errorDetail = err.response?.data?.detail || err.response?.data?.error || 'Lỗi khi bắt đầu phiên'
      alert(errorDetail)
    }
  }

  const handleStopSession = async (id) => {
    try {
      await api.post(`/live_sessions/sessions/${id}/stop/`)
      window.location.reload()
    } catch (err) {
      const errorDetail = err.response?.data?.detail || err.response?.data?.error || 'Lỗi khi dừng phiên'
      alert(errorDetail)
    }
  }

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" /></div>
  }

  return (
    <div style={{ padding: 24, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#1f1f1f' }}>Live Workspace</Title>
          <Text type="secondary">Tổng quan trạng thái phát sóng toàn hệ thống</Text>
        </div>
        <Space>
          <Button icon={<SettingOutlined />} onClick={() => navigate('/live/platforms')}>Cấu hình</Button>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => navigate('/live/sessions')}
            style={{ backgroundColor: '#1649c9' }}
          >
            Tạo Phiên Mới
          </Button>
        </Space>
      </div>

      <Row gutter={[24, 24]}>
        {/* LEFT COLUMN: 65% - Sessions & Content */}
        <Col xs={24} lg={16}>
          {/* Top Metrics Row */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={8}>
              <Card styles={{ body: { padding: '16px 24px' } }} style={{ borderRadius: 12 }}>
                <Statistic 
                  title="Đang Live" 
                  value={activeSessions.length} 
                  prefix={<VideoCameraOutlined style={{ color: activeSessions.length > 0 ? '#52c41a' : '#d9d9d9' }} />} 
                  valueStyle={{ color: activeSessions.length > 0 ? '#52c41a' : '#000' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8}>
              <Card styles={{ body: { padding: '16px 24px' } }} style={{ borderRadius: 12 }}>
                <Statistic 
                  title="Máy chủ (Online)" 
                  value={data.devices.filter(d => d.is_online).length} 
                  suffix={`/ ${data.devices.length}`}
                  prefix={<DesktopOutlined style={{ color: '#1649c9' }} />} 
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card styles={{ body: { padding: '16px 24px' } }} style={{ borderRadius: 12 }}>
                <Statistic 
                  title="Tổng Viewers" 
                  value="--"
                  prefix={<span style={{ fontSize: 14, marginRight: 8 }}>👀</span>} 
                />
              </Card>
            </Col>
          </Row>

          <Card title="Luồng đang phát (Active Streams)" style={{ borderRadius: 12, marginBottom: 24 }} styles={{ body: { padding: '20px' } }}>
            {activeSessions.length > 0 ? (
              <Row gutter={[16, 16]}>
                {activeSessions.map(session => (
                  <Col xs={24} sm={12} key={session.id}>
                    <StreamCard 
                      session={session} 
                      onStart={handleStartSession}
                      onStop={handleStopSession}
                    />
                  </Col>
                ))}
              </Row>
            ) : (
              <Empty description="Không có phiên nào đang phát" />
            )}
          </Card>

          <Card title="Chuẩn bị lên sóng" style={{ borderRadius: 12 }}>
            {readySessions.length > 0 ? (
              <Row gutter={[16, 16]}>
                {readySessions.slice(0, 4).map(session => (
                  <Col xs={24} sm={12} key={session.id}>
                    <StreamCard 
                      session={session} 
                      onStart={handleStartSession}
                      onStop={handleStopSession}
                    />
                  </Col>
                ))}
              </Row>
            ) : (
              <Empty description="Chưa có phiên nào được lên lịch" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
            {readySessions.length > 4 && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Button type="link" onClick={() => navigate('/live/sessions')}>Xem tất cả</Button>
              </div>
            )}
          </Card>
        </Col>

        {/* RIGHT COLUMN: 35% - Health & Environment */}
        <Col xs={24} lg={8}>
          <Card title="Trạng thái Nền tảng" style={{ borderRadius: 12, marginBottom: 24 }}>
            {data.accounts.length === 0 ? (
              <Alert message="Chưa kết nối nền tảng API nào" type="info" showIcon style={{ marginBottom: 16 }} />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {data.accounts.map(acc => (
                  <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Space>
                      <ApiOutlined style={{ color: acc.platform === 'shopee' ? '#ee4d2d' : '#000' }} />
                      <Text>{acc.display_name}</Text>
                    </Space>
                    <LiveStatusBadge status={acc.status} type="dot" />
                  </div>
                ))}
              </Space>
            )}
            <Button block type="dashed" onClick={() => navigate('/live/platforms')} style={{ marginTop: 12 }}>
              Quản lý Kết nối
            </Button>
          </Card>

          <Card title="Máy chủ phát sóng" style={{ borderRadius: 12 }}>
            {data.devices.length === 0 ? (
              <Empty description="Chưa có máy chủ nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              data.devices.map(dev => (
                <DeviceStatusWidget key={dev.id} device={dev} />
              ))
            )}
            <Button block type="dashed" onClick={() => navigate('/live/devices')} style={{ marginTop: 12 }}>
              Cài đặt Máy chủ
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
