import React, { useState, useEffect } from 'react'
import { Card, Tag, Typography, Space, Tooltip, Alert } from 'antd'
import {
  SoundOutlined,
  CheckCircleFilled,
  WarningFilled,
  SettingOutlined,
  ThunderboltFilled,
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

export default function LiveTtsVoiceCard({ session, lastEvent }) {
  const [recentTts, setRecentTts] = useState(null)

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Space size={6} align="center">
          <SoundOutlined style={{ color: isFallback ? '#faad14' : '#52c41a', fontSize: 15 }} />
          <Text strong style={{ color: '#fff', fontSize: 13 }}>
            Giọng đọc AI Livestream
          </Text>
        </Space>
        
        {isFallback ? (
          <Tooltip title={recentTts?.fallbackReason || 'Nhà cung cấp chính lỗi, hệ thống tự động chuyển sang giọng dự phòng'}>
            <Tag color="warning" icon={<WarningFilled />} style={{ margin: 0, fontSize: 11 }}>
              Đang phát qua dự phòng
            </Tag>
          </Tooltip>
        ) : (
          <Tag color="success" icon={<CheckCircleFilled />} style={{ margin: 0, fontSize: 11 }}>
            Đang hoạt động
          </Tag>
        )}
      </div>

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
    </Card>
  )
}
