import React, { useState, useEffect, useRef } from 'react'
import { Card, Typography } from 'antd'
import { VideoCameraOutlined, WifiOutlined, LoadingOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

export default function VideoPreview({ session, streamEvent }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [hlsStatus, setHlsStatus] = useState('idle') // idle | loading | live | error
  const [hlsUrl, setHlsUrl] = useState(null)

  const isSessionLive = session?.status === 'running' || session?.status === 'human_takeover'

  // Listen for stream.status events pushed via WebSocket (streamEvent prop from parent)
  useEffect(() => {
    if (!streamEvent) return
    if (streamEvent.event_type === 'live.stream.status') {
      const state = streamEvent.payload?.state
      const url = streamEvent.payload?.hls_url
      if (state === 'LIVE' && url) {
        setHlsUrl(url)
        setHlsStatus('loading')
      } else if (state === 'STOPPED' || state === 'IDLE' || state === 'ERROR') {
        setHlsUrl(null)
        setHlsStatus('idle')
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      }
    }
  }, [streamEvent])

  // Load HLS stream when hlsUrl becomes available
  useEffect(() => {
    if (!hlsUrl || !videoRef.current) return
    const video = videoRef.current

    // Native HLS support (Safari)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl
      video.play().then(() => setHlsStatus('live')).catch(() => setHlsStatus('error'))
      return
    }

    // HLS.js for Chrome/Firefox
    import('hls.js').then(({ default: Hls }) => {
      if (!Hls.isSupported()) { setHlsStatus('error'); return }
      if (hlsRef.current) hlsRef.current.destroy()
      const hls = new Hls({ lowLatencyMode: true, maxLiveSyncPlaybackRate: 1.5 })
      hlsRef.current = hls
      hls.loadSource(hlsUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().then(() => setHlsStatus('live')).catch(() => setHlsStatus('error'))
      })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) { setHlsStatus('error'); hls.destroy() }
      })
    }).catch(() => setHlsStatus('error'))

    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [hlsUrl])

  const renderOverlay = (icon, title, subtitle, color = '#8c8c8c') => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', padding: '20px' }}>
      <div style={{ fontSize: 64, color: '#434343', marginBottom: 16 }}>{icon}</div>
      <Title level={4} style={{ color, margin: 0 }}>{title}</Title>
      <Text style={{ color: '#595959' }}>{subtitle}</Text>
    </div>
  )

  return (
    <Card
      style={{
        height: '100%', minHeight: 500, backgroundColor: '#000',
        borderRadius: 12, display: 'flex', alignItems: 'center',
        justifyContent: 'center', border: 'none', overflow: 'hidden',
      }}
      bodyStyle={{ textAlign: 'center', width: '100%', padding: 0, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
    >
      {/* Always render video element, hidden when not needed */}
      <video
        ref={videoRef}
        style={{
          width: '100%', height: '100%', objectFit: 'contain',
          display: hlsStatus === 'live' ? 'block' : 'none',
          position: 'absolute', top: 0, left: 0
        }}
        muted
        playsInline
      />

      {/* Status overlays */}
      {hlsStatus !== 'live' && (
        <>
          {!isSessionLive && hlsStatus === 'idle' && renderOverlay(<VideoCameraOutlined />, 'STREAM PREVIEW', 'Chưa bắt đầu')}
          {isSessionLive && hlsStatus === 'idle' && renderOverlay(<WifiOutlined />, 'ĐANG CHỜ', 'Chờ luồng video từ máy trạm...', '#faad14')}
          {hlsStatus === 'loading' && renderOverlay(<LoadingOutlined spin />, 'ĐANG KẾT NỐI', 'Đang tải luồng HLS...', '#1890ff')}
          {hlsStatus === 'error' && renderOverlay(<VideoCameraOutlined />, 'LỖI PREVIEW', 'Không thể tải luồng video')}
        </>
      )}
    </Card>
  )
}
