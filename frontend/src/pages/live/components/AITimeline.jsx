import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Card, Typography, Tag, Space, Button, Collapse, Tooltip, Empty, Badge } from 'antd'
import {
  MessageOutlined,
  SearchOutlined,
  ShoppingOutlined,
  RobotOutlined,
  SoundOutlined,
  WifiOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  PauseCircleFilled,
  DownOutlined,
  VerticalAlignBottomOutlined,
} from '@ant-design/icons'

const { Text, Paragraph } = Typography

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const MAX_INTERACTIONS = 50
const SAFE_ERROR_MAX_LENGTH = 120
const BOTTOM_THRESHOLD_PX = 100

// ──────────────────────────────────────────────
// Security helpers
// ──────────────────────────────────────────────
/**
 * Sanitize a Python exception string before display.
 * - Truncates to SAFE_ERROR_MAX_LENGTH
 * - Strips common patterns exposing internals
 */
const sanitizeError = (raw) => {
  if (!raw || typeof raw !== 'string') return 'Đã xảy ra lỗi không xác định.'
  // Strip potential stack trace lines ("  File ...", "Traceback ...")
  const line = raw.split('\n')[0].trim()
  const truncated = line.length > SAFE_ERROR_MAX_LENGTH ? line.slice(0, SAFE_ERROR_MAX_LENGTH) + '…' : line
  return truncated || 'Đã xảy ra lỗi không xác định.'
}

// ──────────────────────────────────────────────
// Stage configuration metadata
// ──────────────────────────────────────────────
const STAGE_META = {
  rag: {
    icon: <SearchOutlined />,
    label: 'RAG',
    labelVi: 'Tìm kiếm tài liệu',
    pendingText: 'Đang tìm kiếm...',
    successText: (d) => d?.context_found ? 'Đã tìm thấy tài liệu liên quan' : 'Không có tài liệu phù hợp',
    errorText: (d) => sanitizeError(d?.error),
    color: '#722ed1',
  },
  productTruth: {
    icon: <ShoppingOutlined />,
    label: 'Product Truth',
    labelVi: 'Đồng bộ thông tin sản phẩm',
    pendingText: 'Đang đồng bộ...',
    successText: (d) => d?.product_name ? `${d.product_name}${d.sku ? ` (${d.sku})` : ''}` : 'Đã tải thông tin sản phẩm',
    errorText: (d) => sanitizeError(d?.error),
    color: '#fa8c16',
  },
  ai: {
    icon: <RobotOutlined />,
    label: 'AI',
    labelVi: 'Tạo câu trả lời',
    pendingText: 'AI đang xử lý...',
    successText: (d) => d?.intent ? `Intent: ${d.intent}` : 'Đã tạo câu trả lời',
    errorText: (d) => sanitizeError(d?.error),
    suppressedText: (d) => d?.reason === 'human_takeover' ? 'Tạm dừng — đang ở chế độ Người kiểm soát' : `Tạm dừng (${sanitizeError(d?.reason)})`,
    color: '#1649c9',
  },
  tts: {
    icon: <SoundOutlined />,
    label: 'TTS',
    labelVi: 'Tổng hợp giọng nói',
    pendingText: 'Đang tổng hợp giọng nói...',
    successText: (d) => d?.format ? `${d.format.toUpperCase()}, ${d.bytes ? (d.bytes / 1024).toFixed(1) + ' KB' : ''}` : 'Đã tổng hợp',
    errorText: (d) => sanitizeError(d?.error),
    color: '#13c2c2',
  },
  speech: {
    icon: <WifiOutlined />,
    label: 'Speech',
    labelVi: 'Phát Audio tới Live Studio',
    pendingText: 'Đang gửi...',
    successText: () => 'Đã gửi tới Live Studio',
    errorText: (d) => sanitizeError(d?.error),
    color: '#52c41a',
  },
}

const PIPELINE_STAGES = ['rag', 'productTruth', 'ai', 'tts', 'speech']

// ──────────────────────────────────────────────
// Single Stage Row
// ──────────────────────────────────────────────
function StageRow({ stageKey, stageData }) {
  const meta = STAGE_META[stageKey]
  if (!meta) return null

  const { status, details } = stageData || {}
  const isPending = !status || status === 'pending'

  let icon, color, text
  if (status === 'success') {
    icon = <CheckCircleFilled style={{ color: meta.color }} />
    color = meta.color
    text = meta.successText(details)
  } else if (status === 'error') {
    icon = <CloseCircleFilled style={{ color: '#ff4d4f' }} />
    color = '#ff4d4f'
    text = meta.errorText(details)
  } else if (status === 'suppressed') {
    icon = <PauseCircleFilled style={{ color: '#faad14' }} />
    color = '#faad14'
    text = meta.suppressedText ? meta.suppressedText(details) : 'Bị tạm dừng'
  } else {
    icon = <LoadingOutlined style={{ color: '#8c8c8c' }} spin />
    color = '#8c8c8c'
    text = meta.pendingText
  }

  const isExpanded = stageKey === 'ai' && status === 'success' && details?.reply_text

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingLeft: 16, marginBottom: 8 }}>
      {/* Vertical connector */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 20, paddingTop: 2 }}>
        <div style={{ fontSize: 14, lineHeight: 1 }}>{icon}</div>
        {!isPending && <div style={{ width: 1, flex: 1, background: '#f0f0f0', marginTop: 4, minHeight: 8 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Space size={4} style={{ flexWrap: 'wrap' }}>
          <Text strong style={{ fontSize: 12, color }}>
            {meta.icon} {meta.labelVi}
          </Text>
          {status === 'error' && <Tag color="error" style={{ fontSize: 11 }}>ERROR</Tag>}
          {status === 'suppressed' && <Tag color="warning" style={{ fontSize: 11 }}>SUPPRESSED</Tag>}
        </Space>
        <div style={{ marginTop: 2 }}>
          <Text type={isPending ? 'secondary' : undefined} style={{ fontSize: 12, color: isPending ? undefined : color }}>
            {text}
          </Text>
        </div>
        {isExpanded && (
          <div style={{
            marginTop: 6,
            padding: '8px 10px',
            background: '#f6f9ff',
            borderRadius: 6,
            border: '1px solid #d6e4ff',
            maxHeight: 120,
            overflowY: 'auto',
          }}>
            <Text style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: '#1f1f1f' }}>
              {details.reply_text.slice(0, 500)}{details.reply_text.length > 500 ? '…' : ''}
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Single Interaction Card
// ──────────────────────────────────────────────
function InteractionCard({ interaction }) {
  const time = interaction.timestamp
    ? new Date(interaction.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : ''

  const isSuppressed = interaction.stages?.ai?.status === 'suppressed'
  const hasError = PIPELINE_STAGES.some(s => interaction.stages?.[s]?.status === 'error')

  let borderColor = '#d9d9d9'
  if (hasError) borderColor = '#ffccc7'
  else if (isSuppressed) borderColor = '#fff7e6'
  else if (interaction.stages?.speech?.status === 'success') borderColor = '#b7eb8f'

  return (
    <div style={{
      marginBottom: 16,
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      background: '#fff',
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      {/* Header: comment + time */}
      <div style={{
        padding: '10px 16px',
        background: '#fafafa',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8,
      }}>
        <Space align="start">
          <MessageOutlined style={{ color: '#1649c9', fontSize: 14, marginTop: 2 }} />
          <div style={{ minWidth: 0 }}>
            <Text strong style={{ fontSize: 13, color: '#1649c9' }}>Khách hàng hỏi:</Text>
            <div>
              <Text style={{ fontSize: 13, color: '#1f1f1f', wordBreak: 'break-word' }}>
                "{interaction.comment?.slice(0, 200)}{interaction.comment?.length > 200 ? '…' : ''}"
              </Text>
            </div>
          </div>
        </Space>
        <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>{time}</Text>
      </div>

      {/* Pipeline stages */}
      <div style={{ padding: '12px 8px 8px 8px' }}>
        {PIPELINE_STAGES.map(s => (
          <StageRow key={s} stageKey={s} stageData={interaction.stages?.[s]} />
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Event → Interaction reducer
// ──────────────────────────────────────────────
function applyEvent(interactions, event) {
  if (!event || !event.event_type) return interactions

  const { event_type, payload, correlation_id, timestamp } = event

  // ─── New interaction ─────────────────────────
  if (event_type === 'live.comment.received') {
    const newInteraction = {
      id: correlation_id || `anon-${Date.now()}`,
      timestamp: timestamp || new Date().toISOString(),
      comment: payload?.text || '',
      stages: {
        rag: { status: 'pending', details: null },
        productTruth: { status: 'pending', details: null },
        ai: { status: 'pending', details: null },
        tts: { status: 'pending', details: null },
        speech: { status: 'pending', details: null },
      },
    }
    const updated = [...interactions, newInteraction]
    // Enforce max 50 interactions — evict oldest
    return updated.length > MAX_INTERACTIONS ? updated.slice(updated.length - MAX_INTERACTIONS) : updated
  }

  // ─── Stage updates – require correlation_id ──
  if (!correlation_id) return interactions

  const idx = interactions.findIndex(i => i.id === correlation_id)
  if (idx === -1) return interactions

  const cloned = [...interactions]
  const interaction = { ...cloned[idx], stages: { ...cloned[idx].stages } }

  switch (event_type) {
    case 'live.rag.completed':
      interaction.stages.rag = { status: 'success', details: payload }
      break
    case 'live.rag.error':
      interaction.stages.rag = { status: 'error', details: payload }
      break
    case 'live.product_truth.loaded':
      interaction.stages.productTruth = { status: 'success', details: payload }
      break
    case 'live.ai.completed':
      interaction.stages.ai = { status: 'success', details: payload }
      break
    case 'live.ai.error':
      interaction.stages.ai = { status: 'error', details: payload }
      break
    case 'live.ai.suppressed':
      interaction.stages.ai = { status: 'suppressed', details: payload }
      // Mark downstream stages as suppressed too
      interaction.stages.tts = { status: 'suppressed', details: null }
      interaction.stages.speech = { status: 'suppressed', details: null }
      break
    case 'live.tts.completed':
      interaction.stages.tts = { status: 'success', details: payload }
      break
    case 'live.tts.error':
      interaction.stages.tts = { status: 'error', details: payload }
      break
    case 'live.speech.dispatched':
      interaction.stages.speech = { status: 'success', details: payload }
      break
    case 'live.speech.error':
      interaction.stages.speech = { status: 'error', details: payload }
      break
    default:
      // Non-pipeline event — ignore
      return interactions
  }

  cloned[idx] = interaction
  return cloned
}

// ──────────────────────────────────────────────
// Main AITimeline Component
// ──────────────────────────────────────────────
const PIPELINE_EVENTS = new Set([
  'live.comment.received',
  'live.rag.completed', 'live.rag.error',
  'live.product_truth.loaded',
  'live.ai.completed', 'live.ai.error', 'live.ai.suppressed',
  'live.tts.completed', 'live.tts.error',
  'live.speech.dispatched', 'live.speech.error',
])

export default function AITimeline({ lastEvent, connected }) {
  const [interactions, setInteractions] = useState([])
  const containerRef = useRef(null)
  const [userScrolled, setUserScrolled] = useState(false)
  const isNearBottomRef = useRef(true)

  // ── Process incoming events ──────────────────
  useEffect(() => {
    if (!lastEvent || !PIPELINE_EVENTS.has(lastEvent.event_type)) return
    setInteractions(prev => applyEvent(prev, lastEvent))
  }, [lastEvent])

  // ── Auto-scroll logic ────────────────────────
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distanceFromBottom < BOTTOM_THRESHOLD_PX
    isNearBottomRef.current = nearBottom
    setUserScrolled(!nearBottom)
  }, [])

  // Scroll to bottom when new interaction arrives (if near bottom)
  useEffect(() => {
    if (!isNearBottomRef.current) return
    const el = containerRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [interactions.length])

  // Also scroll when stages update within the last interaction (if near bottom)
  useEffect(() => {
    if (!isNearBottomRef.current) return
    const el = containerRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [interactions])

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      setUserScrolled(false)
      isNearBottomRef.current = true
    }
  }, [])

  return (
    <Card
      title={
        <Space>
          <RobotOutlined style={{ color: '#1649c9' }} />
          <span>AI Event Timeline</span>
          {interactions.length > 0 && (
            <Tag color="blue" style={{ fontSize: 11 }}>{interactions.length} tương tác</Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          <Badge
            status={connected ? 'success' : 'error'}
            text={<Text style={{ fontSize: 12 }}>{connected ? 'Realtime' : 'Mất kết nối'}</Text>}
          />
          {userScrolled && (
            <Tooltip title="Cuộn xuống dưới cùng">
              <Button
                size="small"
                icon={<VerticalAlignBottomOutlined />}
                onClick={scrollToBottom}
                type="primary"
                ghost
              >
                Xuống cuối
              </Button>
            </Tooltip>
          )}
        </Space>
      }
      style={{ borderRadius: 12 }}
      styles={{ body: { padding: 0 } }}
    >
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          height: 520,
          overflowY: 'auto',
          padding: '16px 16px 8px',
          background: '#fafcff',
        }}
      >
        {interactions.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 12,
          }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {connected
                    ? 'Đang chờ tương tác từ khách hàng...'
                    : 'Chưa kết nối WebSocket — timeline sẽ cập nhật sau khi kết nối.'}
                </Text>
              }
            />
          </div>
        ) : (
          interactions.map(interaction => (
            <InteractionCard key={interaction.id} interaction={interaction} />
          ))
        )}
      </div>

      {/* Footer: buffer info */}
      <div style={{
        borderTop: '1px solid #f0f0f0',
        padding: '6px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fff',
        borderRadius: '0 0 12px 12px',
      }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          Hiển thị tối đa {MAX_INTERACTIONS} tương tác gần nhất
        </Text>
        {userScrolled && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            ↑ Tự động cuộn đang tạm dừng
          </Text>
        )}
      </div>
    </Card>
  )
}
