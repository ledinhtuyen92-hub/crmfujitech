import React, { useState, useEffect } from 'react'
import { Card, Typography, Row, Col, Spin, Badge, Space, Button, message, Popconfirm, Divider, Alert } from 'antd'
import { useParams } from 'react-router-dom'
import {
  DesktopOutlined,
  PlayCircleOutlined,
  PauseOutlined,
  UserSwitchOutlined,
  RobotOutlined,
  PoweroffOutlined,
} from '@ant-design/icons'
import { useLiveWebSocket } from '../../hooks/useLiveWebSocket'
import api from '../../utils/api'
import LiveStatusBadge from './components/LiveStatusBadge'
import AITimeline from './components/AITimeline'
import StreamHealthRow from './components/StreamHealthRow'
import VideoPreview from './components/VideoPreview'
import LiveChat from './components/LiveChat'

const { Title, Text } = Typography

// ── Safe error message extraction ────────────────────────────────────────────
// Never expose Python exceptions, stack traces, or raw response dumps.
function getErrorMessage(err) {
  const status = err?.response?.status
  if (!status) return 'Mất kết nối. Vui lòng thử lại.'

  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
  if (status === 404) return 'Phiên Live không tồn tại.'
  if (status === 500) return 'Trạng thái hiện tại không cho phép thao tác này.'

  // 400: use safe backend detail if present and is a plain string
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string' && detail.length < 200) return detail

  return 'Thao tác thất bại. Vui lòng thử lại.'
}

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
    executionState: 'idle',
  })
  const [streamState, setStreamState]         = useState(null)
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState(null)
  const [startDispatched, setStartDispatched] = useState(false)
  const [stopDispatched, setStopDispatched]   = useState(false)

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await api.get(`/live_sessions/sessions/${id}/`)
        setSession(res.data)
      } catch (err) {
        console.error('Failed to load session', err)
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchSession()
  }, [id])

  // ── Realtime event handler ─────────────────────────────────────────────────
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
      if (payload.state === 'LIVE')    setStartDispatched(false)
      if (payload.state === 'STOPPED') setStopDispatched(false)

    } else if (event_type === 'live.stream_start.dispatched') {
      setStartDispatched(true)
      setStopDispatched(false)

    } else if (event_type === 'live.stream_stop.dispatched') {
      setStopDispatched(true)
      setStartDispatched(false)

    } else if (event_type === 'live.session.status_changed') {
      if (payload.session_id === id) {
        // Backend WS confirmation = single source of truth for session state
        setSession(prev => prev ? { ...prev, status: payload.new_status } : prev)
        if (['stopped', 'error'].includes(payload.new_status)) {
          setStartDispatched(false)
          setStopDispatched(false)
        }
      }
    }
  }, [lastEvent, id])

  // ── REST reconcile helper ──────────────────────────────────────────────────
  const reconcileSession = async () => {
    try {
      const res = await api.get(`/live_sessions/sessions/${id}/`)
      setSession(res.data)
    } catch (_) {}
  }

  // ── Command handler ────────────────────────────────────────────────────────
  // REST = commands | WS = state confirmation
  // Never optimistically change session.status before WS confirms.
  const handleAction = async (action) => {
    if (actionLoading) return
    try {
      setActionLoading(true)
      await api.post(`/live_sessions/sessions/${id}/${action}/`)
      // REST 200 only means the command was accepted — NOT that the state changed.
      // The live.session.status_changed WS event is the real confirmation.
      message.info('Đã gửi lệnh — đang chờ xác nhận...')
    } catch (err) {
      message.error(getErrorMessage(err))
      // Always reconcile from backend after any command failure.
      await reconcileSession()
    } finally {
      setActionLoading(false)
    }
  }

  // ── Loading / error guards ─────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" /></div>
  if (!session) return <div style={{ padding: 48, textAlign: 'center' }}><Text type="danger">Không tìm thấy phiên Livestream.</Text></div>

  const status = session.status

  // ── Control bar — derived strictly from backend state ─────────────────────
  // Only show controls for transitions the backend will accept.
  const renderControls = () => {
    if (status === 'stopped') return null

    return (
      <Space wrap>
        <LiveStatusBadge status={status} />
        <Divider type="vertical" />

        {/* draft, ready → Bắt đầu LIVE */}
        {['draft', 'ready'].includes(status) && (
          <Popconfirm
            title="Bắt đầu phiên Livestream?"
            okText="Bắt đầu"
            cancelText="Huỷ"
            onConfirm={() => handleAction('start')}
            disabled={actionLoading}
          >
            <Button
              type="primary"
              loading={actionLoading}
              icon={<PlayCircleOutlined />}
              id="btn-start-live"
            >
              Bắt đầu LIVE
            </Button>
          </Popconfirm>
        )}

        {/* running → Tạm dừng AI */}
        {status === 'running' && (
          <Button
            onClick={() => handleAction('pause')}
            loading={actionLoading}
            icon={<PauseOutlined />}
            id="btn-pause-ai"
          >
            Tạm dừng AI
          </Button>
        )}

        {/* running → Người kiểm soát */}
        {status === 'running' && (
          <Button
            onClick={() => handleAction('human-takeover')}
            loading={actionLoading}
            icon={<UserSwitchOutlined />}
            style={{ borderColor: '#fa8c16', color: '#fa8c16' }}
            id="btn-human-takeover"
          >
            Người kiểm soát
          </Button>
        )}

        {/* paused, human_takeover → Tiếp tục / Giao lại cho AI */}
        {status === 'paused' && (
          <Button
            type="primary"
            onClick={() => handleAction('resume')}
            loading={actionLoading}
            icon={<RobotOutlined />}
            id="btn-resume-ai"
          >
            Tiếp tục AI
          </Button>
        )}
        {status === 'human_takeover' && (
          <Button
            type="primary"
            onClick={() => handleAction('resume')}
            loading={actionLoading}
            icon={<RobotOutlined />}
            id="btn-handback-ai"
          >
            Giao lại cho AI
          </Button>
        )}

        {/* running, paused, human_takeover, error → Dừng LIVE (destructive) */}
        {['running', 'paused', 'human_takeover', 'error'].includes(status) && (
          <Popconfirm
            title={
              <div style={{ maxWidth: 280 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Bạn có chắc chắn muốn kết thúc phiên Live?
                </div>
                <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                  Hành động này không thể hoàn tác. Phiên sẽ bị kết thúc vĩnh viễn.
                </div>
              </div>
            }
            okText="Dừng LIVE"
            okButtonProps={{ danger: true }}
            cancelText="Huỷ"
            onConfirm={() => handleAction('stop')}
            disabled={actionLoading}
          >
            <Button
              danger
              loading={actionLoading}
              icon={<PoweroffOutlined />}
              id="btn-stop-live"
            >
              Dừng LIVE
            </Button>
          </Popconfirm>
        )}
      </Space>
    )
  }

  // ── Status banners — for paused and human_takeover states ─────────────────
  const renderStatusBanner = () => {
    if (status === 'paused') {
      return (
        <Alert
          type="info"
          showIcon
          message="AI đang tạm dừng."
          description="Phiên Live vẫn đang tiếp tục. AI sẽ không trả lời cho đến khi bạn tiếp tục."
          style={{ marginBottom: 24, borderRadius: 10 }}
          icon={<PauseOutlined />}
        />
      )
    }
    if (status === 'human_takeover') {
      return (
        <Alert
          type="warning"
          showIcon
          message="Bạn đang kiểm soát thủ công. AI đã bị tắt."
          description='Tất cả phản hồi AI bị tạm dừng. Nhấn "Giao lại cho AI" khi bạn muốn AI tiếp tục.'
          style={{ marginBottom: 24, borderRadius: 10 }}
          icon={<UserSwitchOutlined />}
        />
      )
    }
    if (status === 'stopped') {
      return (
        <Alert
          type="error"
          showIcon
          message="Phiên Live đã kết thúc."
          description="Phiên này không thể được khởi động lại. Tạo một phiên mới để bắt đầu lại."
          style={{ marginBottom: 24, borderRadius: 10 }}
        />
      )
    }
    return null
  }

  return (
    <div style={{ padding: 24, width: '100%', boxSizing: 'border-box' }}>

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0, color: '#1f1f1f' }}>Live Studio Workspace</Title>
          <Text type="secondary">Session: {session.id}</Text>
        </div>
        {renderControls()}
      </div>

      {/* ── Status Banners ─────────────────────────────────────────────────── */}
      {renderStatusBanner()}

      {/* ── 3-Column Studio Layout ─────────────────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ flex: 1, minHeight: 600 }}>
        {/* Left Column: Video Preview */}
        <Col xs={24} lg={8} style={{ display: 'flex', flexDirection: 'column' }}>
          <VideoPreview />
        </Col>

        {/* Center Column: AI Timeline */}
        <Col xs={24} lg={10} style={{ display: 'flex', flexDirection: 'column', height: 600 }}>
          <AITimeline lastEvent={lastEvent} connected={connected} />
        </Col>

        {/* Right Column: Live Chat */}
        <Col xs={24} lg={6} style={{ display: 'flex', flexDirection: 'column', height: 600 }}>
          <LiveChat lastEvent={lastEvent} />
        </Col>
      </Row>

      {/* ── Studio Footer ─────────────────────────────────────────────────── */}
      <Card
        style={{
          marginTop: 16,
          borderRadius: 12,
          border: connected ? '1px solid #1890ff' : '1px solid #d9d9d9',
        }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <Row align="middle" justify="space-between">
          <Col>
            <Space size="large">
              <span style={{ fontWeight: 600 }}>
                <DesktopOutlined style={{ marginRight: 8 }} />
                Realtime Status
              </span>
              <Badge
                status={connected ? 'success' : 'error'}
                text={connected ? 'WS Connected' : 'WS Disconnected'}
              />
              <Divider type="vertical" />
              <Text type="secondary">
                Nền tảng: <Text strong>{session.platform_display || session.platform}</Text>
              </Text>
              <Divider type="vertical" />
              <Text type="secondary">
                AI Host: <Text strong>{session.ai_agent_name || 'Đang tải...'}</Text>
              </Text>
            </Space>
          </Col>
        </Row>

        <Divider style={{ margin: '12px 0' }} />

        <StreamHealthRow
          deviceHealth={deviceHealth}
          lastHeartbeatAt={lastHeartbeatAt}
          streamState={streamState}
          startDispatched={startDispatched}
          stopDispatched={stopDispatched}
          sessionStatus={session?.status}
        />
      </Card>
    </div>
  )
}
