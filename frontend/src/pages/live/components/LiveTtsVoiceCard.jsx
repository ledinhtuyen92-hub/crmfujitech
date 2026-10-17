import React, { useState, useEffect, useRef } from 'react'
import { Card, Tag, Typography, Space, Tooltip, Button, Slider } from 'antd'
import {
  SoundOutlined,
  MutedOutlined,
  CustomerServiceOutlined,
  CheckCircleFilled,
  WarningFilled,
  SettingOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'

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
}) {
  const [recentTts, setRecentTts] = useState(null)
  const [prevAiVolume, setPrevAiVolume] = useState(100)
  const [prevBgmVolume, setPrevBgmVolume] = useState(35)
  const bgmAudioRef = useRef(null)

  // Listen to live realtime TTS events via WebSocket
  useEffect(() => {
    if (!lastEvent) return

    if (lastEvent.type === 'live.tts.completed') {
      setRecentTts({
        provider: lastEvent.payload?.provider,
        isFallback: !!lastEvent.payload?.is_fallback,
        fallbackReason: lastEvent.payload?.fallback_reason,
        bytes: lastEvent.payload?.bytes,
        format: lastEvent.payload?.format || 'mp3',
        time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
      })
    } else if (lastEvent.type === 'live.tts.fallback') {
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space size={6} align="center">
          <SoundOutlined style={{ color: isMasterMuted ? '#8c8c8c' : (isFallback ? '#faad14' : '#52c41a'), fontSize: 16 }} />
          <Text strong style={{ color: '#fff', fontSize: 13 }}>
            Giọng đọc AI Livestream
          </Text>
          {isFallback ? (
            <Tooltip title={recentTts?.fallbackReason || 'Nhà cung cấp chính lỗi, hệ thống tự động chuyển sang giọng dự phòng'}>
              <Tag color="warning" icon={<WarningFilled />} style={{ margin: 0, fontSize: 11 }}>
                Dự phòng
              </Tag>
            </Tooltip>
          ) : (
            <Tag color="success" icon={<CheckCircleFilled />} style={{ margin: 0, fontSize: 11 }}>
              Đang hoạt động
            </Tag>
          )}
        </Space>

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
    </Card>
  )
}
