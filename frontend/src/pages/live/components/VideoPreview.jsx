import React, { useState, useEffect, useRef } from 'react'
import { Card, Typography } from 'antd'
import { VideoCameraOutlined, WifiOutlined, LoadingOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

export default function VideoPreview({ session, streamEvent }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const retryTimerRef = useRef(null)
  const [hlsStatus, setHlsStatus] = useState('idle') // idle | waiting | loading | live | error
  const [hlsUrl, setHlsUrl] = useState(null)

  const isSessionLive = session?.status === 'running' || session?.status === 'human_takeover'

  // Build absolute HLS proxy URL for this session (with ?token= for HLS.js segment auth)
  const buildHlsProxyUrl = (sessionId) => {
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '')
    const token = localStorage.getItem('accessToken') || ''
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : ''
    return `${base}/api/live_sessions/sessions/${sessionId}/hls-proxy/live/index.m3u8${tokenParam}`
  }

  // Listen for stream.status events pushed via WebSocket (streamEvent prop from parent)
  useEffect(() => {
    if (!streamEvent) return
    if (streamEvent.event_type === 'live.stream.status') {
      const state = streamEvent.payload?.stream_state || streamEvent.payload?.state
      const url = streamEvent.payload?.hls_url || streamEvent.payload?.url
      if ((state === 'playing' || state === 'LIVE') && url) {
        setHlsUrl(url)
        setHlsStatus('loading')
      } else if (state === 'STOPPED' || state === 'IDLE' || state === 'ERROR' || state === 'stopped') {
        setHlsUrl(null)
        setHlsStatus('idle')
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      }
    }
  }, [streamEvent])

  // Auto-connect HLS when session is running (even without WS event)
  // This covers page refresh or missed WS events
  useEffect(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }

    if (!isSessionLive || !session?.id) {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      if (videoRef.current) videoRef.current.src = ''
      setHlsUrl(null)
      setHlsStatus('idle')
      return
    }

    const proxyUrl = buildHlsProxyUrl(session.id)
    const token = localStorage.getItem('accessToken') || ''

    const probeHls = () => {
      fetch(proxyUrl, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((resp) => {
          if (resp.ok) {
            setHlsUrl(proxyUrl)
            setHlsStatus('loading')
          } else {
            // 404 = stream not yet live, retry
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

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [isSessionLive, session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load HLS stream when hlsUrl becomes available
  useEffect(() => {
    if (!hlsUrl || !videoRef.current) return
    const video = videoRef.current

    // hlsUrl is always absolute (built by buildHlsProxyUrl)
    const absoluteUrl = hlsUrl

    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || ''

    // Native HLS support (Safari)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = absoluteUrl
      video.play()
        .then(() => setHlsStatus('live'))
        .catch(() => setHlsStatus('live'))
      return
    }

    // HLS.js for Chrome/Firefox
    import('hls.js').then(({ default: Hls }) => {
      if (!Hls.isSupported()) { setHlsStatus('error'); return }
      if (hlsRef.current) hlsRef.current.destroy()

      const hls = new Hls({
        lowLatencyMode: true,
        maxLiveSyncPlaybackRate: 1.5,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 1000,
        xhrSetup: (xhr) => {
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        }
      })
      hlsRef.current = hls
      hls.loadSource(absoluteUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play()
          .then(() => setHlsStatus('live'))
          .catch(() => setHlsStatus('live'))
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.warn('HLS network error, retrying in 3s...', data)
            setTimeout(() => {
              if (hlsRef.current) hlsRef.current.startLoad()
            }, 3000)
          } else {
            console.error('Fatal HLS error:', data)
            hls.destroy()
            hlsRef.current = null
            // Retry probe if still live
            if (isSessionLive) {
              setHlsUrl(null)
              setHlsStatus('waiting')
              retryTimerRef.current = setTimeout(() => {
                const proxyUrl = buildHlsProxyUrl(session.id)
                setHlsUrl(proxyUrl)
                setHlsStatus('loading')
              }, 4000)
            } else {
              setHlsStatus('error')
            }
          }
        }
      })
    }).catch(() => setHlsStatus('error'))

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [hlsUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const renderOverlay = (icon, title, subtitle, color = '#8c8c8c') => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', width: '100%', height: '100%', padding: '20px'
    }}>
      <div style={{ fontSize: 64, color: '#434343', marginBottom: 16 }}>{icon}</div>
      <Title level={4} style={{ color, margin: 0 }}>{title}</Title>
      <Text style={{ color: '#595959', marginTop: 8, textAlign: 'center' }}>{subtitle}</Text>
    </div>
  )

  return (
    <Card
      style={{
        height: '100%', minHeight: 500, backgroundColor: '#000',
        borderRadius: 12, display: 'flex', alignItems: 'center',
        justifyContent: 'center', border: 'none', overflow: 'hidden',
      }}
      bodyStyle={{
        textAlign: 'center', width: '100%', padding: 0, height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
      }}
    >
      {/* Always render video element, hidden when not needed */}
      <video
        ref={videoRef}
        style={{
          width: '100%', height: '100%', objectFit: 'contain',
          display: hlsStatus === 'live' ? 'block' : 'none',
          position: 'absolute', top: 0, left: 0,
        }}
        muted
        playsInline
      />

      {/* Status overlays */}
      {hlsStatus !== 'live' && (
        <>
          {!isSessionLive && renderOverlay(
            <VideoCameraOutlined />,
            'STREAM PREVIEW',
            'Nhấn "Bắt đầu LIVE" hoặc "Chạy thử nghiệm" để xem preview'
          )}
          {isSessionLive && hlsStatus === 'waiting' && renderOverlay(
            <LoadingOutlined spin />,
            'ĐANG CHỜ LUỒNG VIDEO',
            'Đang kết nối tới thiết bị phát sóng... Tự động thử lại mỗi 3 giây',
            '#faad14'
          )}
          {isSessionLive && hlsStatus === 'idle' && renderOverlay(
            <WifiOutlined />,
            'ĐANG KẾT NỐI',
            'Chờ luồng video từ máy trạm...',
            '#faad14'
          )}
          {hlsStatus === 'loading' && renderOverlay(
            <LoadingOutlined spin />,
            'ĐANG TẢI STREAM',
            'Đang khởi động HLS player...',
            '#1890ff'
          )}
          {hlsStatus === 'error' && renderOverlay(
            <VideoCameraOutlined />,
            'LỖI PREVIEW',
            'Không thể tải luồng video. Kiểm tra kết nối thiết bị và MediaMTX.'
          )}
        </>
      )}
    </Card>
  )
}
