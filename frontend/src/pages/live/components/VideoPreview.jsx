import React, { useState, useEffect, useRef } from 'react'
import { Card, Typography, Button } from 'antd'
import {
  VideoCameraOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'

const { Title, Text } = Typography

export default function VideoPreview({ session, streamEvent }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const retryTimerRef = useRef(null)
  // idle | waiting | loading | paused | live | error
  const [hlsStatus, setHlsStatus] = useState('idle')
  const [hlsUrl, setHlsUrl] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const isSessionLive = session?.status === 'running' || session?.status === 'human_takeover'

  // Build absolute HLS proxy URL with ?token= so HLS.js segments authenticate
  const buildHlsProxyUrl = (sessionId) => {
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '')
    const token = localStorage.getItem('accessToken') || ''
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : ''
    return `${base}/api/live_sessions/sessions/${sessionId}/hls-proxy/live/index.m3u8${tokenParam}`
  }

  // Listen for stream.status events pushed via WebSocket
  useEffect(() => {
    if (!streamEvent) return
    if (streamEvent.event_type === 'live.stream.status') {
      const state = streamEvent.payload?.stream_state || streamEvent.payload?.state
      const url = streamEvent.payload?.hls_url || streamEvent.payload?.url
      if ((state === 'playing' || state === 'LIVE') && url) {
        setHlsUrl(buildHlsProxyUrl(session?.id))
        setHlsStatus('loading')
      } else if (['STOPPED', 'IDLE', 'ERROR', 'stopped'].includes(state)) {
        setHlsUrl(null)
        setHlsStatus('idle')
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      }
    }
  }, [streamEvent]) // eslint-disable-line

  // Auto-probe HLS when session is running
  useEffect(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }

    if (!isSessionLive || !session?.id) {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      if (videoRef.current) videoRef.current.src = ''
      setHlsUrl(null)
      setHlsStatus('idle')
      setErrorMsg(null)
      return
    }

    const proxyUrl = buildHlsProxyUrl(session.id)

    const probeHls = () => {
      fetch(proxyUrl, { method: 'HEAD' })
        .then((resp) => {
          if (resp.ok || resp.status === 200) {
            setHlsUrl(proxyUrl)
            setHlsStatus('loading')
            setErrorMsg(null)
          } else if (resp.status === 401) {
            setHlsStatus('error')
            setErrorMsg(`Lỗi xác thực (401). Thử đăng xuất và đăng nhập lại.`)
          } else {
            setHlsStatus('waiting')
            retryTimerRef.current = setTimeout(probeHls, 3000)
          }
        })
        .catch(() => {
          setHlsStatus('waiting')
          retryTimerRef.current = setTimeout(probeHls, 3000)
        })
    }

    setHlsStatus('waiting')
    probeHls()

    return () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current) }
  }, [isSessionLive, session?.id]) // eslint-disable-line

  // Manual play (bypass autoplay block)
  const handleManualPlay = () => {
    if (videoRef.current) {
      videoRef.current.play()
        .then(() => setHlsStatus('live'))
        .catch((e) => {
          console.error('Manual play failed:', e)
          setErrorMsg(`Không thể phát: ${e.message}`)
          setHlsStatus('error')
        })
    }
  }

  // Load HLS.js when hlsUrl is available
  useEffect(() => {
    if (!hlsUrl || !videoRef.current) return
    const video = videoRef.current
    const absoluteUrl = hlsUrl // already absolute

    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || ''

    // Native HLS (Safari)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = absoluteUrl
      video.play()
        .then(() => setHlsStatus('live'))
        .catch(() => {
          // Autoplay blocked — show play button
          setHlsStatus('paused')
        })
      return
    }

    // HLS.js
    import('hls.js').then(({ default: Hls }) => {
      if (!Hls.isSupported()) {
        setHlsStatus('error')
        setErrorMsg('Trình duyệt không hỗ trợ HLS. Thử dùng Chrome.')
        return
      }
      if (hlsRef.current) hlsRef.current.destroy()

      const hls = new Hls({
        lowLatencyMode: true,
        maxLiveSyncPlaybackRate: 1.5,
        manifestLoadingMaxRetry: 4,
        manifestLoadingRetryDelay: 1500,
        debug: false,
        xhrSetup: (xhr) => {
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        },
      })
      hlsRef.current = hls
      hls.loadSource(absoluteUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play()
          .then(() => setHlsStatus('live'))
          .catch(() => {
            // Autoplay blocked by browser policy
            setHlsStatus('paused')
          })
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        console.warn('[HLS Error]', data.type, data.details, data.fatal)
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // Network error on segment — retry
            setTimeout(() => { if (hlsRef.current) hlsRef.current.startLoad() }, 3000)
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError()
          } else {
            hls.destroy()
            hlsRef.current = null
            setErrorMsg(`Lỗi HLS: ${data.details}`)
            setHlsStatus('error')
          }
        }
      })
    }).catch((e) => {
      setErrorMsg(`Không tải được HLS.js: ${e.message}`)
      setHlsStatus('error')
    })

    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [hlsUrl]) // eslint-disable-line

  // ── Overlays ──────────────────────────────────────────────────────────────
  const renderOverlay = (icon, title, subtitle, color = '#d9d9d9', extra = null) => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', width: '100%', height: '100%', padding: 24,
      gap: 12,
    }}>
      <div style={{ fontSize: 52, color: color === '#faad14' ? '#faad14' : '#595959' }}>{icon}</div>
      <Title level={4} style={{ color, margin: 0, textAlign: 'center' }}>{title}</Title>
      {subtitle && <Text style={{ color: '#8c8c8c', textAlign: 'center', fontSize: 13 }}>{subtitle}</Text>}
      {extra}
    </div>
  )

  return (
    <Card
      style={{
        height: '100%', minHeight: 500, backgroundColor: '#141414',
        borderRadius: 12, display: 'flex', alignItems: 'center',
        justifyContent: 'center', border: '1px solid #262626', overflow: 'hidden',
      }}
      styles={{
        body: {
          textAlign: 'center', width: '100%', padding: 0, height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }
      }}
    >
      {/* Video element - always mounted, hidden unless live */}
      <video
        ref={videoRef}
        style={{
          width: '100%', height: '100%', objectFit: 'contain',
          display: hlsStatus === 'live' ? 'block' : 'none',
          position: 'absolute', top: 0, left: 0, backgroundColor: '#000',
        }}
        muted
        playsInline
      />

      {/* ── Status overlays ── */}
      {hlsStatus === 'idle' && (
        session?.background_asset_url || session?.avatar_asset_url || session?.overlay_asset_url ? (
          <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            {session.background_asset_url && (
              session.background_asset_url.match(/\.(mp4|webm)$/i) ? (
                <video src={session.background_asset_url} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }} />
              ) : (
                <img src={session.background_asset_url} alt="Background" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }} />
              )
            )}
            {session.avatar_asset_url && (
              session.avatar_asset_url.match(/\.(mp4|webm)$/i) ? (
                <video src={session.avatar_asset_url} autoPlay loop muted playsInline style={{ width: 'auto', height: '80%', position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)' }} />
              ) : (
                <img src={session.avatar_asset_url} alt="Avatar" style={{ width: 'auto', height: '80%', position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)' }} />
              )
            )}
            {session.overlay_asset_url && (
              <img src={session.overlay_asset_url} alt="Overlay" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />
            )}
            <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(0,0,0,0.6)', padding: '4px 12px', borderRadius: 4, color: 'white', fontSize: 12 }}>
              Mockup Preview (Scene Builder)
            </div>
          </div>
        ) : (
          renderOverlay(
            <VideoCameraOutlined />,
            'STREAM PREVIEW',
            'Bấm "Thiết kế Cảnh" để thêm Avatar/Background hoặc bấm "Bắt đầu LIVE"',
            '#595959'
          )
        )
      )}

      {hlsStatus === 'waiting' && renderOverlay(
        <LoadingOutlined spin />,
        'ĐANG CHỜ LUỒNG VIDEO',
        'Đang kết nối tới thiết bị... tự động thử lại mỗi 3 giây',
        '#faad14'
      )}

      {hlsStatus === 'loading' && renderOverlay(
        <LoadingOutlined spin />,
        'ĐANG TẢI STREAM',
        'Đang khởi động HLS player...',
        '#1890ff'
      )}

      {/* Autoplay bị chặn — hiện nút play thủ công */}
      {hlsStatus === 'paused' && renderOverlay(
        <PlayCircleOutlined style={{ cursor: 'pointer', color: '#52c41a', fontSize: 72 }} />,
        'NHẤN ĐỂ XEM',
        'Trình duyệt yêu cầu tương tác để phát video',
        '#d9d9d9',
        <Button
          type="primary"
          size="large"
          icon={<PlayCircleOutlined />}
          onClick={handleManualPlay}
          style={{ marginTop: 8 }}
        >
          Phát Video
        </Button>
      )}

      {hlsStatus === 'error' && renderOverlay(
        <ExclamationCircleOutlined />,
        'LỖI STREAM',
        errorMsg || 'Không thể tải luồng video. Kiểm tra console (F12) để biết chi tiết.',
        '#ff4d4f',
        <Button
          size="small"
          onClick={() => {
            setHlsUrl(null)
            setHlsStatus('waiting')
            setTimeout(() => {
              if (session?.id) {
                setHlsUrl(buildHlsProxyUrl(session.id))
                setHlsStatus('loading')
              }
            }, 1000)
          }}
        >
          Thử lại
        </Button>
      )}
    </Card>
  )
}
