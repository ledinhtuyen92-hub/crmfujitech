import React, { useState, useEffect } from 'react'
import { Card, Typography, Row, Col, Spin, Badge, Space, Button, message, Popconfirm, Divider } from 'antd'
import { useParams } from 'react-router-dom'
import { DesktopOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { useLiveWebSocket } from '../../hooks/useLiveWebSocket'
import api from '../../utils/api'
import LiveStatusBadge from './components/LiveStatusBadge'
import AITimeline from './components/AITimeline'
import StreamHealthRow from './components/StreamHealthRow'

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
  const [streamState, setStreamState]       = useState(null)          // IDLE|STARTING|LIVE|...
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState(null)        // ms timestamp
  const [startDispatched, setStartDispatched] = useState(false)
  const [stopDispatched, setStopDispatched]   = useState(false)

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
    if (!lastEvent) return
    const { event_type, payload } = lastEvent

    if (event_type === 'live.device.heartbeat') {
      setDeviceHealth({
        status: 'online',
        uptime: payload.uptime_seconds || 0,
        executionState: payload.execution_state || 'idle',
      })
      setLastHeartbeatAt(Date.now())

    } else if (event_type === 'live.stream.status') {
      setStreamState(payload.state || null)
      // Receiving LIVE means a successful start → clear pending flag
      if (payload.state === 'LIVE')    setStartDispatched(false)
      // Receiving STOPPED means stop confirmed → clear pending flag
      if (payload.state === 'STOPPED') setStopDispatched(false)

    } else if (event_type === 'live.stream_start.dispatched') {
      setStartDispatched(true)
      setStopDispatched(false)

    } else if (event_type === 'live.stream_stop.dispatched') {
      setStopDispatched(true)
      setStartDispatched(false)

    } else if (event_type === 'live.session.status_changed') {
      if (payload.session_id === id) {
        setSession(prev => prev ? { ...prev, status: payload.new_status } : prev)
        // Session terminal states reset dispatched flags
        if (['stopped', 'error'].includes(payload.new_status)) {
          setStartDispatched(false)
          setStopDispatched(false)
        }
      }
    }
  }, [lastEvent, id])

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" /></div>
  if (!session) return <div style={{ padding: 48, textAlign: 'center' }}><Text type="danger">Không tìm thấy phiên Livestream.</Text></div>


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
            title={<span><DesktopOutlined /> Realtime Status</span>}
            style={{
              borderRadius: 12,
              border: connected ? '1px solid #1890ff' : '1px solid #d9d9d9',
            }}
            extra={
              <Badge
                status={connected ? 'success' : 'error'}
                text={connected ? 'WS Connected' : 'WS Disconnected'}
              />
            }
          >
            <StreamHealthRow
              deviceHealth={deviceHealth}
              lastHeartbeatAt={lastHeartbeatAt}
              streamState={streamState}
              startDispatched={startDispatched}
              stopDispatched={stopDispatched}
              sessionStatus={session?.status}
            />
          </Card>
        </Col>

        <Col span={24}>
          <AITimeline lastEvent={lastEvent} connected={connected} />
        </Col>
      </Row>
    </div>
  )
}
