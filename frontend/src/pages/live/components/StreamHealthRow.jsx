import React, { useState, useEffect, useRef } from 'react'
import { Tag, Space, Typography, Tooltip, Badge } from 'antd'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  StopOutlined,
  SyncOutlined,
  PauseCircleOutlined,
  ExclamationCircleOutlined,
  DisconnectOutlined,
  WifiOutlined,
  ClockCircleOutlined,
  DesktopOutlined,
} from '@ant-design/icons'

const { Text } = Typography

// ── Constants ─────────────────────────────────────────────────
const HEARTBEAT_STALE_MS  = 30_000   // >30s → stale
const HEARTBEAT_OFFLINE_MS = 60_000  // >60s → offline
const TIMER_CADENCE_MS = 5_000       // check every 5s

// ── Stream state config ───────────────────────────────────────
const STREAM_STATES = {
  LIVE:         { color: '#52c41a', icon: <CheckCircleFilled />,    label: 'Đang phát LIVE',      spin: false },
  STARTING:     { color: '#1677ff', icon: <LoadingOutlined />,      label: 'Đang khởi động...',   spin: true  },
  STOPPING:     { color: '#fa8c16', icon: <LoadingOutlined />,      label: 'Đang dừng...',        spin: true  },
  STOPPED:      { color: '#8c8c8c', icon: <StopOutlined />,         label: 'Đã dừng',             spin: false },
  ERROR:        { color: '#ff4d4f', icon: <CloseCircleFilled />,    label: 'Lỗi kết nối',         spin: false },
  RECONNECTING: { color: '#faad14', icon: <SyncOutlined />,         label: 'Đang kết nối lại...', spin: true  },
  IDLE:         { color: '#8c8c8c', icon: <PauseCircleOutlined />,  label: 'Chờ lệnh',            spin: false },
}

// ── Device freshness helper ───────────────────────────────────
function getDeviceFreshness(lastHeartbeatAt) {
  if (!lastHeartbeatAt) return { status: 'unknown', secondsAgo: null }
  const elapsed = Date.now() - lastHeartbeatAt
  if (elapsed > HEARTBEAT_OFFLINE_MS) return { status: 'offline', secondsAgo: Math.floor(elapsed / 1000) }
  if (elapsed > HEARTBEAT_STALE_MS)   return { status: 'stale',   secondsAgo: Math.floor(elapsed / 1000) }
  return { status: 'online', secondsAgo: Math.floor(elapsed / 1000) }
}

function formatSecondsAgo(s) {
  if (s === null || s === undefined) return '—'
  if (s < 60)  return `${s}s trước`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s trước`
  return `${Math.floor(s / 3600)}h trước`
}

// ── Subcomponent: Device Row ──────────────────────────────────
function DeviceRow({ deviceHealth, deviceFreshness }) {
  const { status, secondsAgo } = deviceFreshness
  const executionState = deviceHealth?.executionState || 'idle'
  const executionError = executionState === 'error'

  let deviceIcon, deviceColor, deviceLabel
  if (status === 'offline') {
    deviceIcon  = <DisconnectOutlined />
    deviceColor = '#ff4d4f'
    deviceLabel = 'Ngoại tuyến'
  } else if (status === 'stale') {
    deviceIcon  = <ExclamationCircleOutlined />
    deviceColor = '#faad14'
    deviceLabel = 'Không phản hồi'
  } else if (status === 'online') {
    deviceIcon  = <WifiOutlined />
    deviceColor = '#52c41a'
    deviceLabel = 'Online'
  } else {
    deviceIcon  = <ExclamationCircleOutlined />
    deviceColor = '#8c8c8c'
    deviceLabel = 'Chưa kết nối'
  }

  const execColor = executionError ? '#ff4d4f' : (executionState === 'playing' ? '#52c41a' : '#1677ff')
  const execLabel = executionError ? 'Thiết bị gặp lỗi' : executionState.toUpperCase()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Text type="secondary" style={{ fontSize: 12, minWidth: 56 }}>
        <DesktopOutlined style={{ marginRight: 4 }} />Thiết bị
      </Text>

      <Tag
        icon={<span style={{ color: deviceColor, marginRight: 4 }}>{deviceIcon}</span>}
        style={{ fontSize: 12, borderColor: deviceColor, color: deviceColor, background: `${deviceColor}12` }}
      >
        {deviceLabel}
      </Tag>

      {executionError ? (
        <Tag color="error" style={{ fontSize: 12 }}>{execLabel}</Tag>
      ) : (
        <Tag style={{ fontSize: 12, color: execColor, borderColor: execColor, background: `${execColor}12` }}>
          {execLabel}
        </Tag>
      )}

      {secondsAgo !== null && (
        <Tooltip title={`Heartbeat nhận được ${formatSecondsAgo(secondsAgo)}`}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            <ClockCircleOutlined style={{ marginRight: 3 }} />
            {formatSecondsAgo(secondsAgo)}
          </Text>
        </Tooltip>
      )}
    </div>
  )
}

// ── Subcomponent: Stream Row ──────────────────────────────────
function StreamRow({ streamState, startDispatched, stopDispatched }) {
  const cfg = STREAM_STATES[streamState] || STREAM_STATES.IDLE

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Text type="secondary" style={{ fontSize: 12, minWidth: 56 }}>
        <WifiOutlined style={{ marginRight: 4 }} />Stream
      </Text>

      <Tag
        icon={
          <span style={{ color: cfg.color, marginRight: 4 }}>
            {cfg.spin
              ? React.cloneElement(cfg.icon, { spin: true, style: { color: cfg.color } })
              : React.cloneElement(cfg.icon, { style: { color: cfg.color } })
            }
          </span>
        }
        style={{ fontSize: 12, borderColor: cfg.color, color: cfg.color, background: `${cfg.color}12` }}
      >
        {cfg.label}
      </Tag>

      {startDispatched && streamState !== 'LIVE' && streamState !== 'STOPPED' && streamState !== 'ERROR' && (
        <Tag color="blue" style={{ fontSize: 11 }}>Start đã gửi</Tag>
      )}
      {stopDispatched && (streamState === 'STOPPING' || streamState === 'STOPPED') && (
        <Tag color="default" style={{ fontSize: 11 }}>Stop đã gửi</Tag>
      )}
    </div>
  )
}

// ── Subcomponent: Uptime ──────────────────────────────────────
function UptimeRow({ deviceHealth }) {
  const uptime = deviceHealth?.uptime || 0
  if (!uptime) return null
  const h = Math.floor(uptime / 3600)
  const m = Math.floor((uptime % 3600) / 60)
  const s = uptime % 60
  const label = `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`

  return (
    <Text type="secondary" style={{ fontSize: 11 }}>
      <ClockCircleOutlined style={{ marginRight: 4 }} />
      Uptime: {label}
    </Text>
  )
}

// ── Main Export ───────────────────────────────────────────────
/**
 * StreamHealthRow
 *
 * Props:
 *   deviceHealth    - { status, uptime, executionState }  (from live.device.heartbeat)
 *   lastHeartbeatAt - timestamp (ms) of last heartbeat arrival, or null
 *   streamState     - string (StreamState enum value: IDLE|STARTING|LIVE|...) or null
 *   startDispatched - bool, true after live.stream_start.dispatched received
 *   stopDispatched  - bool, true after live.stream_stop.dispatched received
 *   sessionStatus   - LiveSession.status string
 */
export default function StreamHealthRow({
  deviceHealth,
  lastHeartbeatAt,
  streamState,
  startDispatched,
  stopDispatched,
  sessionStatus,
}) {
  const [, forceRefresh] = useState(0)

  // 5s timer to recompute staleness
  useEffect(() => {
    const id = setInterval(() => forceRefresh(n => n + 1), TIMER_CADENCE_MS)
    return () => clearInterval(id)
  }, [])

  const deviceFreshness = getDeviceFreshness(lastHeartbeatAt)

  // Resolve effective stream display state, session overrides stream
  let displayStreamState = streamState || 'IDLE'
  if (sessionStatus === 'stopped') displayStreamState = 'STOPPED'
  if (sessionStatus === 'error')   displayStreamState = 'ERROR'

  return (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      <DeviceRow deviceHealth={deviceHealth} deviceFreshness={deviceFreshness} />
      <StreamRow
        streamState={displayStreamState}
        startDispatched={startDispatched}
        stopDispatched={stopDispatched}
      />
      <UptimeRow deviceHealth={deviceHealth} />
    </Space>
  )
}
