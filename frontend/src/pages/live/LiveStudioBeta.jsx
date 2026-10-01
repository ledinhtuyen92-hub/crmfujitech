import React, { useState, useEffect } from 'react'
import { Card, Typography, Row, Col, Spin, Tag, Badge, Space, Button, message, Popconfirm, Divider } from 'antd'
import { useParams } from 'react-router-dom'
import { DesktopOutlined, PlayCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useLiveWebSocket } from '../../hooks/useLiveWebSocket'
import api from '../../utils/api'
import LiveStatusBadge from './components/LiveStatusBadge'
import AITimeline from './components/AITimeline'

const { Title, Text } = Typography

export default function LiveStudioBeta() {
  const { id } = useParams()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Realtime state
  const { connected, lastEvent } = useLiveWebSocket(id)
  const [deviceHealth, setDeviceHealth] = useState({
    status: 'offline',
    uptime: 0,
    executionState: 'idle'
  })

  useEffect(() => {
    // Fetch initial session details
    const fetchSession = async () => {
      try {
        const res = await api.get(`/live_sessions/sessions/${id}/`)
        setSession(res.data)
      } catch (err) {
        console.error("Failed to load session", err)
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchSession()
  }, [id])

  useEffect(() => {
    // Process real-time events
    if (lastEvent) {
      if (lastEvent.event_type === 'live.device.heartbeat') {
        const p = lastEvent.payload
        setDeviceHealth({
          status: 'online',
          uptime: p.uptime_seconds || 0,
          executionState: p.execution_state || 'idle'
        })
      } else if (lastEvent.event_type === 'live.session.status_changed') {
        const p = lastEvent.payload
        if (p.session_id === id) {
          setSession(prev => prev ? { ...prev, status: p.new_status } : prev)
        }
      }
    }
  }, [lastEvent])

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" /></div>
  if (!session) return <div style={{ padding: 48, textAlign: 'center' }}><Text type="danger">Không tìm thấy phiên Livestream.</Text></div>

  // Format uptime
  const formatUptime = (seconds) => {
    if (!seconds) return '0s'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`
  }

  const handleAction = async (action) => {
    try {
      setActionLoading(true)
      await api.post(`/live_sessions/sessions/${id}/${action}/`)
      message.success('Gửi lệnh thành công')
      // Note: We don't optimistically update state. We wait for WS event.
    } catch (err) {
      console.error(err)
      message.error(err.response?.data?.detail || 'Thao tác thất bại')
      // If error occurs, we might want to reconcile state from backend
      try {
        const res = await api.get(`/live_sessions/sessions/${id}/`)
        setSession(res.data)
      } catch (e) {}
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0, color: '#1f1f1f' }}>Live Studio Workspace</Title>
          <Text type="secondary">Session: {session.id}</Text>
        </div>
        <Space>
          <LiveStatusBadge status={session.status} />
          <Divider type="vertical" />
          
          {['draft', 'ready'].includes(session.status) && (
            <Popconfirm title="Bắt đầu phiên Livestream?" onConfirm={() => handleAction('start')}>
              <Button type="primary" loading={actionLoading} icon={<PlayCircleOutlined />}>Bắt đầu LIVE</Button>
            </Popconfirm>
          )}

          {session.status === 'running' && (
            <>
              <Button onClick={() => handleAction('pause')} loading={actionLoading}>Tạm dừng AI</Button>
              <Button onClick={() => handleAction('human-takeover')} loading={actionLoading}>Người Takeover</Button>
            </>
          )}

          {['paused', 'human_takeover'].includes(session.status) && (
            <Button type="primary" onClick={() => handleAction('resume')} loading={actionLoading}>Tiếp tục LIVE (AI)</Button>
          )}

          {['running', 'paused', 'human_takeover'].includes(session.status) && (
            <Popconfirm title="Bạn có chắc chắn muốn kết thúc phiên Live?" onConfirm={() => handleAction('stop')}>
              <Button danger loading={actionLoading}>Kết thúc</Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <Row gutter={[24, 24]}>
        <Col span={24}>
          <Card 
            title={<span><DesktopOutlined /> Realtime Device Health (1G-1)</span>}
            style={{ borderRadius: 12, border: deviceHealth.status === 'online' ? '1px solid #1890ff' : '1px solid #d9d9d9' }}
            extra={
              <Badge 
                status={connected ? 'success' : 'error'} 
                text={connected ? 'WS Connected' : 'WS Disconnected'} 
              />
            }
          >
            <Row gutter={[24, 24]}>
              <Col span={8}>
                <Text type="secondary">Device Connection</Text>
                <div>
                  <Tag color={deviceHealth.status === 'online' ? 'blue' : 'default'} style={{ marginTop: 8 }}>
                    {deviceHealth.status.toUpperCase()}
                  </Tag>
                </div>
              </Col>
              <Col span={8}>
                <Text type="secondary">Execution State</Text>
                <div>
                  <Tag color={deviceHealth.executionState === 'playing' ? 'green' : 'default'} style={{ marginTop: 8 }}>
                    {deviceHealth.executionState.toUpperCase()}
                  </Tag>
                </div>
              </Col>
              <Col span={8}>
                <Text type="secondary">Uptime</Text>
                <div style={{ marginTop: 8, fontSize: 16, fontWeight: 500 }}>
                  <ClockCircleOutlined style={{ marginRight: 6 }} />
                  {formatUptime(deviceHealth.uptime)}
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col span={24}>
          <AITimeline lastEvent={lastEvent} connected={connected} />
        </Col>
      </Row>
    </div>
  )
}
