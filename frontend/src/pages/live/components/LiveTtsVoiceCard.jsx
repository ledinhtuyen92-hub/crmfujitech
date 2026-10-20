import React, { useState, useEffect, useRef } from 'react'
import { Card, Tag, Typography, Space, Tooltip, Button, Slider, Modal, Input, InputNumber, Select, message } from 'antd'
import {
  SoundOutlined,
  MutedOutlined,
  CustomerServiceOutlined,
  CheckCircleFilled,
  WarningFilled,
  SettingOutlined,
  ThunderboltOutlined,
  EditOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import api from '../../../utils/api'

const { Text } = Typography

const PROVIDER_NAMES = {
  google_studio: 'Google Studio (Gemini)',
  microsoft: 'Microsoft Edge Neural (0đ)',
  elevenlabs: 'ElevenLabs AI',
  openai: 'OpenAI Audio',
  google: 'Google Translate',
}

const VOICE_LABELS = {
  Aoede: 'Aoede (Nữ)',
  Kore: 'Kore (Nữ)',
  Zephyr: 'Zephyr (Nữ)',
  Charon: 'Charon (Nam)',
  Fenrir: 'Fenrir (Nam)',
  Puck: 'Puck (Nam)',
  'vi-VN-HoaiMyNeural': 'Hoài My (Nữ)',
  'vi-VN-NamMinhNeural': 'Nam Minh (Nam)',
  alloy: 'Alloy (Trung tính)',
  nova: 'Nova (Nữ)',
  shimmer: 'Shimmer (Nữ)',
  echo: 'Echo (Nam)',
  fable: 'Fable (Nam)',
  onyx: 'Onyx (Nam)',
}

const getFullMediaUrl = (url) => {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '')
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`
}

export default function LiveTtsVoiceCard({
  session,
  lastEvent,
  isMasterMuted = false,
  onToggleMute,
  aiVolume = 100,
  onAiVolumeChange,
  bgmVolume = 35,
  onBgmVolumeChange,
  onOpenSceneBuilder,
  onSessionUpdate,
}) {
  const [recentTts, setRecentTts] = useState(null)
  const [prevAiVolume, setPrevAiVolume] = useState(100)
  const [prevBgmVolume, setPrevBgmVolume] = useState(35)
  const bgmAudioRef = useRef(null)

  const [tokenStats, setTokenStats] = useState({
    totalTokens: session?.token_usage?.total_tokens || 0,
    costUsd: session?.token_usage?.total_cost_usd || 0.0,
    replies: session?.token_usage?.total_ai_replies || 0,
    lastTokens: 0,
    lastCostUsd: 0.0,
    lastTime: null,
    isTemplate: false,
    model: session?.ai_agent_model || 'gemini-flash'
  })

  const [scriptModalOpen, setScriptModalOpen] = useState(false)
  const [scriptText, setScriptText] = useState(session?.session_prompt || '')
  const [selectedIndustry, setSelectedIndustry] = useState('general')
  const [loadingSuggestion, setLoadingSuggestion] = useState(false)
  const [savingScript, setSavingScript] = useState(false)
  const [idlePauseMin, setIdlePauseMin] = useState(session?.idle_pause_min ?? 4)
  const [idlePauseMax, setIdlePauseMax] = useState(session?.idle_pause_max ?? 9)

  useEffect(() => {
    if (session?.session_prompt !== undefined) {
      setScriptText(session.session_prompt || '')
    }
    if (session?.idle_pause_min !== undefined) {
      setIdlePauseMin(session.idle_pause_min ?? 4)
    }
    if (session?.idle_pause_max !== undefined) {
      setIdlePauseMax(session.idle_pause_max ?? 9)
    }
  }, [session?.session_prompt, session?.idle_pause_min, session?.idle_pause_max])

  const handleLoadSuggestion = async () => {
    setLoadingSuggestion(true)
    try {
      const res = await api.post('/live_sessions/sessions/suggest-script/', {
        product_id: session?.product,
        industry: selectedIndustry
      })
      if (res.data?.script_text) {
        setScriptText(res.data.script_text)
        message.success('Đã nạp kịch bản mẫu thành công!')
      }
    } catch (e) {
      message.error('Không thể lấy kịch bản gợi ý')
    } finally {
      setLoadingSuggestion(false)
    }
  }

  const handleSaveScript = async () => {
    if (!session?.id) return
    setSavingScript(true)
    try {
      const minVal = Math.max(1, parseInt(idlePauseMin) || 4)
      const maxVal = Math.max(minVal, parseInt(idlePauseMax) || 9)
      await api.patch(`/live_sessions/sessions/${session.id}/`, {
        session_prompt: scriptText,
        idle_pause_min: minVal,
        idle_pause_max: maxVal,
      })
      message.success('Đã lưu kịch bản xoay vòng và thời gian ngắt nghỉ!')
      setScriptModalOpen(false)
      if (typeof onSessionUpdate === 'function') {
        onSessionUpdate({
          session_prompt: scriptText,
          idle_pause_min: minVal,
          idle_pause_max: maxVal,
        })
      }
    } catch (e) {
      message.error('Lỗi khi lưu kịch bản: ' + (e.response?.data?.detail || e.message))
    } finally {
      setSavingScript(false)
    }
  }

  // Đồng bộ khi session prop thay đổi
  useEffect(() => {
    if (session?.token_usage) {
      setTokenStats(prev => ({
        ...prev,
        totalTokens: session.token_usage.total_tokens || 0,
        costUsd: session.token_usage.total_cost_usd || 0.0,
        replies: session.token_usage.total_ai_replies || 0,
        model: session.ai_agent_model || prev.model
      }))
    }
  }, [session])

  // Lắng nghe sự kiện realtime TTS và AI Token qua WebSocket
  useEffect(() => {
    if (!lastEvent) return
    const eventType = lastEvent.event_type || lastEvent.type

    if (eventType === 'live.ai.completed') {
      const payload = lastEvent.payload || {}
      setTokenStats(prev => {
        const newTotalTokens = payload.session_total_tokens !== undefined ? payload.session_total_tokens : (prev.totalTokens + (payload.total_tokens || 0))
        const newCostUsd = payload.session_total_cost_usd !== undefined ? payload.session_total_cost_usd : (prev.costUsd + (payload.cost_usd || 0.0))
        const newReplies = payload.session_total_replies !== undefined ? payload.session_total_replies : (prev.replies + 1)
        return {
          totalTokens: newTotalTokens,
          costUsd: newCostUsd,
          replies: newReplies,
          lastTokens: payload.total_tokens || 0,
          lastCostUsd: payload.cost_usd || 0.0,
          lastTime: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
          isTemplate: !!payload.is_template,
          model: payload.model || prev.model
        }
      })
    } else if (eventType === 'live.tts.completed') {
      setRecentTts({
        provider: lastEvent.payload?.provider,
        isFallback: !!lastEvent.payload?.is_fallback,
        fallbackReason: lastEvent.payload?.fallback_reason,
        bytes: lastEvent.payload?.bytes,
        format: lastEvent.payload?.format || 'mp3',
        time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
      })
    } else if (eventType === 'live.tts.fallback') {
      setRecentTts((prev) => ({
        ...prev,
        isFallback: true,
        fallbackReason: lastEvent.payload?.reason,
        provider: lastEvent.payload?.fallback_provider || 'microsoft',
        requestedProvider: lastEvent.payload?.requested_provider,
        time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
      }))
    }
  }, [lastEvent])

  const configuredProvider = session?.ai_agent_tts_provider || 'microsoft'
  const configuredVoice = session?.ai_agent_tts_voice || (configuredProvider === 'google_studio' ? 'Aoede' : 'vi-VN-HoaiMyNeural')
  const configuredSpeed = session?.ai_agent_tts_speed || 1.0

  const activeProvider = recentTts?.provider || configuredProvider
  const isFallback = recentTts?.isFallback || false
  const costVnd = Math.round((tokenStats.costUsd || 0) * 25400)

  const providerLabel = PROVIDER_NAMES[activeProvider] || activeProvider.toUpperCase()
  const voiceLabel = VOICE_LABELS[configuredVoice] || configuredVoice

  // BGM audio resolution
  const rawBgmUrl = session?.audio_asset_url || '/media/live_assets/2026/10/bgm_lofi_livestream.mp3'
  const bgmUrl = getFullMediaUrl(rawBgmUrl)

  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const isSessionLive = session?.status === 'running' || session?.status === 'human_takeover'

  // When live stream is running, stop any local preview so music NEVER duplicates!
  useEffect(() => {
    if (isSessionLive && isPreviewPlaying) {
      setIsPreviewPlaying(false)
      if (bgmAudioRef.current) {
        bgmAudioRef.current.pause()
      }
    }
  }, [isSessionLive, isPreviewPlaying])

  // Update volume of local preview if user is previewing and adjusts slider
  useEffect(() => {
    const audio = bgmAudioRef.current
    if (!audio) return
    if (isPreviewPlaying) {
      if (isMasterMuted || bgmVolume === 0) {
        audio.pause()
        setIsPreviewPlaying(false)
      } else {
        audio.volume = Math.max(0, Math.min(1, bgmVolume / 100))
      }
    }
  }, [isMasterMuted, bgmVolume, isPreviewPlaying])

  const handleTogglePreviewPlay = () => {
    const audio = bgmAudioRef.current
    if (!audio) return
    if (isPreviewPlaying) {
      audio.pause()
      setIsPreviewPlaying(false)
    } else {
      audio.volume = Math.max(0, Math.min(1, bgmVolume / 100))
      audio.play().then(() => {
        setIsPreviewPlaying(true)
      }).catch((err) => {
        console.warn('Cannot play BGM preview:', err)
      })
    }
  }

  const handleToggleAiMute = () => {
    if (aiVolume > 0) {
      setPrevAiVolume(aiVolume)
      onAiVolumeChange?.(0)
    } else {
      onAiVolumeChange?.(prevAiVolume || 100)
    }
  }

  const handleToggleBgmMute = () => {
    if (bgmVolume > 0) {
      setPrevBgmVolume(bgmVolume)
      onBgmVolumeChange?.(0)
    } else {
      onBgmVolumeChange?.(prevBgmVolume || 35)
    }
  }

  return (
    <Card
      size="small"
      style={{
        width: '100%',
        backgroundColor: '#141414',
        border: isFallback ? '1px solid #d46b08' : '1px solid #262626',
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
        marginTop: 10,
      }}
      bodyStyle={{ padding: '10px 14px' }}
    >
      {/* Background Music Preview Audio Element (Chỉ phát khi bấm Nghe thử, tự ngắt khi live) */}
      <audio
        ref={bgmAudioRef}
        src={bgmUrl}
        preload="none"
        onEnded={() => setIsPreviewPlaying(false)}
      />

      {/* Header: Title, Status Badge, and Sound Toggle Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
          <SoundOutlined style={{ color: isMasterMuted ? '#8c8c8c' : (isFallback ? '#faad14' : '#52c41a'), fontSize: 16, flexShrink: 0 }} />
          <Text strong style={{ color: '#fff', fontSize: 13, whiteSpace: 'nowrap' }}>
            Giọng đọc AI Livestream
          </Text>
          {isFallback ? (
            <Tooltip title={recentTts?.fallbackReason || 'Nhà cung cấp chính lỗi, hệ thống tự động chuyển sang giọng dự phòng'}>
              <Tag color="warning" icon={<WarningFilled />} style={{ margin: 0, fontSize: 11, flexShrink: 0 }}>
                Dự phòng
              </Tag>
            </Tooltip>
          ) : (
            <Tag color="success" icon={<CheckCircleFilled />} style={{ margin: 0, fontSize: 11, flexShrink: 0 }}>
              Đang hoạt động
            </Tag>
          )}
        </div>

        {/* Nút bật/tắt âm thanh tổng đưa xuống đây theo yêu cầu người dùng */}
        <Button
          type={isMasterMuted ? 'default' : 'primary'}
          shape="round"
          size="small"
          icon={isMasterMuted ? <MutedOutlined /> : <SoundOutlined />}
          onClick={onToggleMute}
          style={{
            backgroundColor: isMasterMuted ? 'rgba(255, 255, 255, 0.08)' : '#1677ff',
            borderColor: isMasterMuted ? 'rgba(255, 255, 255, 0.25)' : '#1677ff',
            color: '#fff',
            fontWeight: 500,
            fontSize: 12,
            height: 28,
            boxShadow: isMasterMuted ? 'none' : '0 2px 6px rgba(22, 119, 255, 0.35)',
          }}
        >
          {isMasterMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
        </Button>
      </div>

      {/* Provider & Voice Details Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
        <div>
          <span style={{ color: '#8c8c8c' }}>Nguồn phát: </span>
          <span style={{ color: isFallback ? '#faad14' : '#52c41a', fontWeight: 600 }}>
            {providerLabel}
          </span>
        </div>

        <div>
          <span style={{ color: '#8c8c8c' }}>Giọng: </span>
          <span style={{ color: '#fff', fontWeight: 500 }}>
            {voiceLabel}
          </span>
          <span style={{ color: '#1890ff', marginLeft: 6, fontSize: 11 }}>
            ({configuredSpeed}x)
          </span>
        </div>

        <Link to="/settings/ai-agents" style={{ fontSize: 11, color: '#1890ff', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <SettingOutlined /> Đổi giọng
        </Link>
      </div>

      {/* Realtime audio status if speech was recently generated */}
      {recentTts && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #1f1f1f', fontSize: 11, color: '#8c8c8c', display: 'flex', justifyContent: 'space-between' }}>
          <span>
            {recentTts.isFallback ? '⚠️ Đã chuyển Microsoft Edge' : '✓ Phát thành công'} ({recentTts.format.toUpperCase()} {recentTts.bytes ? `• ${(recentTts.bytes / 1024).toFixed(1)} KB` : ''})
          </span>
          <span>{recentTts.time}</span>
        </div>
      )}

      {isFallback && recentTts?.fallbackReason && (
        <div style={{ marginTop: 6, padding: '4px 8px', backgroundColor: 'rgba(250, 173, 20, 0.1)', border: '1px solid rgba(250, 173, 20, 0.25)', borderRadius: 6, color: '#faad14', fontSize: 11 }}>
          <WarningFilled style={{ marginRight: 4 }} />
          Lý do chuyển dự phòng: {recentTts.fallbackReason.length > 90 ? recentTts.fallbackReason.slice(0, 90) + '...' : recentTts.fallbackReason}
        </div>
      )}

      {/* ── Thống kê Tiêu tốn Token & Chi phí AI Phiên Live ── */}
      <div
        style={{
          marginTop: 8,
          padding: '8px 10px',
          backgroundColor: '#191924',
          border: '1px solid #28283c',
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <Space size={5} align="center">
            <ThunderboltOutlined style={{ color: '#faad14', fontSize: 13 }} />
            <Text style={{ color: '#d9d9d9', fontSize: 11, fontWeight: 600 }}>
              Tiêu tốn Token AI phiên live:
            </Text>
          </Space>
          <Tooltip title="Mô hình não AI đang suy nghĩ câu trả lời">
            <Tag color="cyan" style={{ margin: 0, fontSize: 10, padding: '0 6px', height: 18, lineHeight: '18px' }}>
              🧠 {tokenStats.model || 'gemini-flash'}
            </Tag>
          </Tooltip>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <Tooltip title={`Đã thực hiện ${tokenStats.replies || 0} lượt phản hồi AI trong phiên này`}>
            <span style={{ color: '#e6f7ff', fontSize: 12 }}>
              <span style={{ color: '#8c8c8c', fontSize: 11 }}>Đã dùng: </span>
              <strong style={{ color: '#13c2c2', fontSize: 13 }}>
                {(tokenStats.totalTokens || 0).toLocaleString()}
              </strong>
              <span style={{ color: '#8c8c8c', fontSize: 11, marginLeft: 2 }}>tokens</span>
              {(tokenStats.replies || 0) > 0 && (
                <span style={{ color: '#8c8c8c', fontSize: 10, marginLeft: 4 }}>
                  ({tokenStats.replies} câu)
                </span>
              )}
            </span>
          </Tooltip>

          <Tooltip title={`Ước tính theo đơn giá API: $${Number(tokenStats.costUsd || 0).toFixed(4)} USD`}>
            <span style={{ color: '#52c41a', fontSize: 12 }}>
              <span style={{ color: '#8c8c8c', fontSize: 11 }}>Ước tính: </span>
              <strong style={{ color: '#52c41a', fontSize: 13 }}>
                ~{costVnd.toLocaleString()}đ
              </strong>
              <span style={{ color: '#8c8c8c', fontSize: 10, marginLeft: 3 }}>
                (${Number(tokenStats.costUsd || 0).toFixed(3)})
              </span>
            </span>
          </Tooltip>
        </div>

        {/* Cập nhật gần nhất */}
        {tokenStats.lastTokens > 0 && (
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: '#8c8c8c', display: 'flex', justifyContent: 'space-between' }}>
            <span>
              ⚡ Vừa gọi: <strong style={{ color: '#40a9ff' }}>+{tokenStats.lastTokens.toLocaleString()} tokens</strong> (~{Math.round((tokenStats.lastCostUsd || 0) * 25400)}đ)
            </span>
            <span>{tokenStats.lastTime}</span>
          </div>
        )}
        {tokenStats.isTemplate && (
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: '#52c41a', display: 'flex', justifyContent: 'space-between' }}>
            <span>
              💡 Kịch bản xoay vòng tự động: <strong>0 token (0đ)</strong>
            </span>
            <span>{tokenStats.lastTime}</span>
          </div>
        )}
      </div>

      {/* ── Nút mở Modal Chỉnh sửa Kịch bản Xoay vòng Live 0đ ── */}
      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
        <span style={{ fontSize: 11, color: '#8c8c8c' }}>
          Kịch bản nói mồi (0đ):
        </span>
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          style={{ padding: 0, fontSize: 11, color: '#40a9ff', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3 }}
          onClick={() => setScriptModalOpen(true)}
        >
          {session?.session_prompt ? 'Chỉnh sửa kịch bản' : 'Nạp kịch bản xoay vòng'}
        </Button>
      </div>

      {/* ── 2 Thanh kéo điều khiển Âm lượng: Âm thanh AI & Âm thanh nền ── */}
      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid #262626',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Thanh kéo 1: Âm lượng Giọng đọc AI */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <Space size={6} align="center">
              <Button
                type="text"
                size="small"
                onClick={handleToggleAiMute}
                icon={(aiVolume === 0 || isMasterMuted) ? <MutedOutlined style={{ color: '#ff4d4f' }} /> : <SoundOutlined style={{ color: '#52c41a' }} />}
                style={{ padding: '0 2px', height: 'auto', color: '#fff' }}
                title="Bấm để Tắt / Bật nhanh tiếng AI"
              />
              <Text style={{ color: '#d9d9d9', fontSize: 12, fontWeight: 500 }}>
                Âm thanh AI (Giọng đọc)
              </Text>
            </Space>
            <Tag
              color={(aiVolume === 0 || isMasterMuted) ? 'default' : 'success'}
              style={{ margin: 0, fontSize: 11, minWidth: 46, textAlign: 'center', fontWeight: 600 }}
            >
              {(aiVolume === 0 || isMasterMuted) ? 'Tắt' : `${aiVolume}%`}
            </Tag>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={isMasterMuted ? 0 : aiVolume}
            onChange={(val) => onAiVolumeChange?.(val)}
            tooltip={{ formatter: (val) => `${val}%` }}
            style={{ margin: '4px 0 0 0' }}
            trackStyle={{ backgroundColor: '#52c41a' }}
            handleStyle={{ borderColor: '#52c41a' }}
          />
        </div>

        {/* Thanh kéo 2: Âm lượng Nhạc nền (BGM) */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <Space size={6} align="center">
              <Button
                type="text"
                size="small"
                onClick={handleToggleBgmMute}
                icon={(bgmVolume === 0 || isMasterMuted) ? <CustomerServiceOutlined style={{ color: '#8c8c8c' }} /> : <CustomerServiceOutlined style={{ color: '#1890ff' }} />}
                style={{ padding: '0 2px', height: 'auto', color: '#fff' }}
                title="Bấm để Tắt / Bật nhanh nhạc nền"
              />
              <Text style={{ color: '#d9d9d9', fontSize: 12, fontWeight: 500 }}>
                Âm thanh nền (Nhạc BGM)
              </Text>
            </Space>
            <Tag
              color={(bgmVolume === 0 || isMasterMuted) ? 'default' : 'processing'}
              style={{ margin: 0, fontSize: 11, minWidth: 46, textAlign: 'center', fontWeight: 600 }}
            >
              {(bgmVolume === 0 || isMasterMuted) ? 'Tắt' : `${bgmVolume}%`}
            </Tag>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={isMasterMuted ? 0 : bgmVolume}
            onChange={(val) => onBgmVolumeChange?.(val)}
            tooltip={{ formatter: (val) => `${val}%` }}
            style={{ margin: '4px 0 0 0' }}
            trackStyle={{ backgroundColor: '#1890ff' }}
            handleStyle={{ borderColor: '#1890ff' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#8c8c8c', marginTop: 3 }}>
            <span
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}
              title={session?.audio_asset_name || 'Chill Lofi Livestream Vui Tươi (BGM)'}
            >
              🎵 {session?.audio_asset_name || 'Chill Lofi Livestream Vui Tươi (BGM)'}
            </span>
            <Space size={8}>
              {!isSessionLive && (
                <a
                  onClick={handleTogglePreviewPlay}
                  style={{ color: isPreviewPlaying ? '#faad14' : '#52c41a', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500 }}
                  title="Nghe thử bài nhạc nền trước khi phát live"
                >
                  {isPreviewPlaying ? '⏸ Dừng' : '▶ Nghe thử'}
                </a>
              )}
              {onOpenSceneBuilder && (
                <a onClick={onOpenSceneBuilder} style={{ color: '#1890ff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Đổi nhạc
                </a>
              )}
            </Space>
          </div>
        </div>
      </div>

      {/* ── Modal Quản lý Kịch bản Xoay vòng Live 0đ ── */}
      <Modal
        title="Kịch bản Bán hàng Xoay vòng (0đ Token khi Live im lặng)"
        open={scriptModalOpen}
        onCancel={() => setScriptModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setScriptModalOpen(false)}>
            Đóng
          </Button>,
          <Button key="save" type="primary" loading={savingScript} onClick={handleSaveScript}>
            Lưu kịch bản
          </Button>,
        ]}
        width={650}
      >
        <p style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 12 }}>
          💡 <strong>Quy tắc hoạt động:</strong> Mỗi dòng là 1 câu kịch bản. Khi phòng live không có ai hỏi, MC sẽ đọc tuần tự xoay vòng từng câu này (<strong>hoàn toàn 0 token, 0đ</strong>). Khi có khán giả bình luận hỏi thật, AI sẽ ngắt câu để trả lời khách.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Chọn ngành hàng:</span>
          <Select
            size="small"
            value={selectedIndustry}
            onChange={setSelectedIndustry}
            style={{ width: 170 }}
            options={[
              { value: 'smart_lock', label: 'Khóa & Nội thất' },
              { value: 'fashion', label: 'Thời trang' },
              { value: 'cosmetics', label: 'Mỹ phẩm' },
              { value: 'home_appliances', label: 'Gia dụng / Thiết bị' },
              { value: 'general', label: 'Bán lẻ đa ngành' },
            ]}
          />
          <Button
            size="small"
            type="dashed"
            icon={<ThunderboltOutlined />}
            loading={loadingSuggestion}
            onClick={handleLoadSuggestion}
          >
            Nạp mẫu gợi ý
          </Button>
        </div>

        {/* ── Cài đặt thời gian ngắt nghỉ ngẫu nhiên giữa các câu ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          backgroundColor: '#1f1f1f',
          borderRadius: 8,
          marginBottom: 12,
          border: '1px solid #303030',
          flexWrap: 'wrap',
          gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClockCircleOutlined style={{ color: '#52c41a', fontSize: 15 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e6f7ff' }}>
                Thời gian ngắt nghỉ giữa các câu:
              </div>
              <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                AI sẽ ngắt nghỉ ngẫu nhiên trong khoảng này trước khi đọc câu tiếp theo
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#bfbfbf' }}>Từ</span>
            <InputNumber
              min={1}
              max={60}
              value={idlePauseMin}
              onChange={(val) => setIdlePauseMin(val || 1)}
              size="middle"
              style={{ width: 75 }}
              addonAfter="s"
            />
            <span style={{ fontSize: 12, color: '#bfbfbf' }}>đến</span>
            <InputNumber
              min={1}
              max={120}
              value={idlePauseMax}
              onChange={(val) => setIdlePauseMax(val || 1)}
              size="middle"
              style={{ width: 75 }}
              addonAfter="s"
            />
            <Tooltip title="Khoảng nghỉ ngẫu nhiên giúp giọng đọc livestream sống động, tự nhiên như người thật trò chuyện, tránh cảm giác máy móc đọc liên tục không ngừng.">
              <InfoCircleOutlined style={{ color: '#8c8c8c', cursor: 'pointer', fontSize: 13, marginLeft: 4 }} />
            </Tooltip>
          </div>
        </div>

        <Input.TextArea
          rows={8}
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          placeholder="Mỗi dòng là 1 câu kịch bản..."
          style={{ fontFamily: 'inherit', fontSize: 13 }}
        />
      </Modal>
    </Card>
  )
}
