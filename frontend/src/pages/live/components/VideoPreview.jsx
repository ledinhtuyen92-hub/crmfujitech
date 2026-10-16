import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Typography, Button } from 'antd'
import {
  VideoCameraOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  ExclamationCircleOutlined,
  SoundOutlined,
  MutedOutlined,
} from '@ant-design/icons'

const { Title, Text } = Typography

export default function VideoPreview({ session, streamEvent }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const retryTimerRef = useRef(null)
  const watchdogTimerRef = useRef(null)
  const hardResetTimerRef = useRef(null)

  // idle | waiting | loading | paused | live | error
  const [hlsStatus, setHlsStatus] = useState('idle')
  const [hlsUrl, setHlsUrl] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [deviceTelemetry, setDeviceTelemetry] = useState(null)
  const [isPlaybackReady, setIsPlaybackReady] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [isMockupAvatarLoaded, setIsMockupAvatarLoaded] = useState(false)
  const hasStartedPlaybackRef = useRef(false)
  const hasJumpedToLiveEdgeRef = useRef(false)

  useEffect(() => {
    setIsMockupAvatarLoaded(false)
  }, [session?.avatar_asset_url, session?.avatar_speaking_asset_url])

  const toggleMute = () => {
    if (videoRef.current) {
      const nextMuted = !videoRef.current.muted
      videoRef.current.muted = nextMuted
      setIsMuted(nextMuted)
    }
  }

  const isSessionLive = session?.status === 'running' || session?.status === 'human_takeover'

  // Build absolute HLS proxy URL with ?token= so HLS.js segments authenticate
  const buildHlsProxyUrl = (sessionId) => {
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '')
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || ''
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : ''
    return `${base}/api/live_sessions/sessions/${sessionId}/hls-proxy/live/index.m3u8${tokenParam}`
  }

  const resolveProxyUrl = (urlStr, baseMasterUrl) => {
    if (!urlStr) return ''
    try {
      const base = new URL(baseMasterUrl)
      const resolved = new URL(urlStr, base)
      if (!resolved.search && base.search) {
        resolved.search = base.search
      }
      return resolved.href
    } catch {
      if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        return urlStr
      }
      const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '')
      if (urlStr.startsWith('/')) {
        return `${apiBase}${urlStr}`
      }
      return urlStr
    }
  }

  const extractVariantUrl = (m3u8Content, masterUrl) => {
    const lines = m3u8Content.split('\n').map(l => l.trim()).filter(Boolean)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('#EXT-X-STREAM-INF') && i + 1 < lines.length) {
        const nextLine = lines[i + 1]
        if (!nextLine.startsWith('#')) {
          return resolveProxyUrl(nextLine, masterUrl)
        }
      }
    }
    return null
  }

  const hasMediaSegments = (content) => {
    return (
      content.includes('#EXTINF') ||
      content.includes('#EXT-X-PART') ||
      content.includes('#EXT-X-MAP')
    )
  }

  // Safe probe that only initializes HLS.js when media segments are genuinely ready
  const probeHls = useCallback(async () => {
    if (!isSessionLive || !session?.id) return

    const proxyUrl = buildHlsProxyUrl(session.id)
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || ''
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {}

    try {
      const masterResp = await fetch(proxyUrl, { method: 'GET', headers })

      if (masterResp.status === 401) {
        setHlsStatus('error')
        setErrorMsg('Lỗi xác thực (401). Vui lòng đăng nhập lại.')
        return
      }

      if (!masterResp.ok && masterResp.status !== 200) {
        setHlsStatus('waiting')
        retryTimerRef.current = setTimeout(probeHls, 400)
        return
      }

      const masterText = await masterResp.text()

      // If masterText itself contains segments (media playlist format)
      if (hasMediaSegments(masterText)) {
        setHlsUrl(proxyUrl)
        setHlsStatus('loading')
        setErrorMsg(null)
        return
      }

      // If masterText has variant streams (EXT-X-STREAM-INF)
      if (masterText.includes('EXT-X-STREAM-INF')) {
        const variantUrl = extractVariantUrl(masterText, proxyUrl)
        if (!variantUrl) {
          setHlsStatus('waiting')
          retryTimerRef.current = setTimeout(probeHls, 400)
          return
        }

        // Verify variant playlist actually contains encoded segments
        try {
          const variantResp = await fetch(variantUrl, { method: 'GET', headers })
          if (variantResp.ok) {
            const variantText = await variantResp.text()
            if (hasMediaSegments(variantText)) {
              // Real video frames are ready!
              setHlsUrl(proxyUrl)
              setHlsStatus('loading')
              setErrorMsg(null)
              return
            }
          }
        } catch (vErr) {
          console.warn('[HLS Probe] Variant check pending:', vErr)
        }

        // Stream connected but waiting for first segment to be muxed
        setHlsStatus('waiting')
        retryTimerRef.current = setTimeout(probeHls, 400)
        return
      }

      // Other playlist status, retry shortly
      setHlsStatus('waiting')
      retryTimerRef.current = setTimeout(probeHls, 400)
    } catch {
      setHlsStatus('waiting')
      retryTimerRef.current = setTimeout(probeHls, 400)
    }
  }, [isSessionLive, session?.id]) // eslint-disable-line

  // Listen for stream.status events pushed via WebSocket
  useEffect(() => {
    if (!streamEvent) return
    if (streamEvent.event_type === 'live.stream.status') {
      const state = streamEvent.payload?.stream_state || streamEvent.payload?.state
      const url = streamEvent.payload?.hls_url || streamEvent.payload?.url
      if ((state === 'playing' || state === 'LIVE') && url) {
        // Stream announced live: probe to verify segments before initializing HLS
        probeHls()
      } else if (['STOPPED', 'IDLE', 'ERROR', 'stopped'].includes(state)) {
        setHlsUrl(null)
        setHlsStatus('idle')
        setIsPlaybackReady(false)
        hasStartedPlaybackRef.current = false
        hasJumpedToLiveEdgeRef.current = false
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      }
    } else if (streamEvent.event_type === 'live.device.heartbeat') {
      if (streamEvent.payload?.metrics) {
        setDeviceTelemetry(streamEvent.payload.metrics)
      }
    }
  }, [streamEvent, probeHls])

  // Auto-probe HLS when session is running
  useEffect(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }

    if (!isSessionLive || !session?.id) {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      if (videoRef.current) videoRef.current.src = ''
      setHlsUrl(null)
      setHlsStatus('idle')
      setIsPlaybackReady(false)
      hasStartedPlaybackRef.current = false
      hasJumpedToLiveEdgeRef.current = false
      setErrorMsg(null)
      return
    }

    setHlsStatus('waiting')
    probeHls()

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [isSessionLive, session?.id, probeHls])

  // Stall watchdog: ONLY active during initial connection before playback has ever started.
  useEffect(() => {
    if (!hlsUrl || isPlaybackReady || hasStartedPlaybackRef.current) {
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current)
      if (hardResetTimerRef.current) clearTimeout(hardResetTimerRef.current)
      return
    }

    watchdogTimerRef.current = setTimeout(() => {
      if (!hasStartedPlaybackRef.current && videoRef.current && hlsRef.current) {
        const v = videoRef.current
        console.warn('[VideoPreview Watchdog] Waiting for frames after 4s. Nudging...')
        try {
          if (v.buffered.length > 0) {
            const bufEnd = v.buffered.end(v.buffered.length - 1)
            v.currentTime = Math.max(v.buffered.start(0), bufEnd - 0.5)
            v.play().catch(() => {})
          } else {
            hlsRef.current.startLoad()
          }
        } catch (_) {}
      }
    }, 4000)

    hardResetTimerRef.current = setTimeout(() => {
      if (!hasStartedPlaybackRef.current && videoRef.current && videoRef.current.readyState < 2) {
        console.warn('[VideoPreview Watchdog] Cold start timed out after 10s. Re-probing...')
        if (hlsRef.current) {
          hlsRef.current.destroy()
          hlsRef.current = null
        }
        setIsPlaybackReady(false)
        hasJumpedToLiveEdgeRef.current = false
        setHlsUrl(null)
        setHlsStatus('waiting')
        probeHls()
      }
    }, 10000)

    return () => {
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current)
      if (hardResetTimerRef.current) clearTimeout(hardResetTimerRef.current)
    }
  }, [hlsUrl, isPlaybackReady, probeHls])

  // Manual play (bypass browser autoplay block)
  const handleManualPlay = () => {
    if (videoRef.current) {
      if (hlsRef.current) {
        hlsRef.current.startLoad()
      }
      videoRef.current.muted = true
      videoRef.current.defaultMuted = true
      videoRef.current.play()
        .then(() => {
          setHlsStatus('live')
          videoRef.current.muted = false
          setIsMuted(false)
        })
        .catch((e) => {
          console.warn('Manual play pending buffer:', e)
          if (hasStartedPlaybackRef.current && e.name === 'NotAllowedError') {
            setHlsStatus('paused')
          } else {
            setHlsStatus('loading')
          }
        })
    }
  }

  // Load HLS.js when verified hlsUrl is available
  useEffect(() => {
    if (!hlsUrl || !videoRef.current) return
    const video = videoRef.current
    const absoluteUrl = hlsUrl
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || ''

    setIsPlaybackReady(false)
    hasStartedPlaybackRef.current = false
    hasJumpedToLiveEdgeRef.current = false

    // Native HLS (Safari)
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = absoluteUrl
      video.play()
        .then(() => setHlsStatus('live'))
        .catch(() => setHlsStatus('paused'))
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
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 6,
        liveDurationInfinity: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
        maxLiveSyncPlaybackRate: 1.25,
        maxBufferLength: 4,
        maxMaxBufferLength: 8,
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 400,
        manifestLoadingMaxRetryTimeout: 10000,
        levelLoadingMaxRetry: 10,
        levelLoadingRetryDelay: 400,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 400,
        startFragPrefetch: true,
        xhrSetup: (xhr) => {
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        },
      })

      hlsRef.current = hls
      hls.loadSource(absoluteUrl)
      hls.attachMedia(video)

      video.muted = true
      video.defaultMuted = true

      // Jump over initial timestamp gap once on cold start
      const jumpToLiveEdgeOnce = () => {
        if (!video || hasJumpedToLiveEdgeRef.current) return
        try {
          if (video.buffered.length > 0) {
            const bufStart = video.buffered.start(0)
            const bufEnd = video.buffered.end(video.buffered.length - 1)
            if (video.currentTime < bufStart || video.currentTime === 0) {
              const target = (hls.liveSyncPosition && hls.liveSyncPosition >= bufStart && hls.liveSyncPosition <= bufEnd)
                ? hls.liveSyncPosition
                : bufStart + 0.1
              video.currentTime = target
              hasJumpedToLiveEdgeRef.current = true
            }
          }
        } catch (_) {}
      }

      const tryPlay = () => {
        if (!video) return
        video.muted = true
        video.defaultMuted = true
        video.playsInline = true
        const p = video.play()
        if (p && typeof p.then === 'function') {
          p.then(() => {
            setHlsStatus('live')
            jumpToLiveEdgeOnce()
          }).catch((err) => {
            // Keep status as loading during initial stream connection
            if (!hasStartedPlaybackRef.current) {
              setHlsStatus('loading')
            } else if (err && err.name === 'NotAllowedError') {
              setHlsStatus('paused')
            }
          })
        }
      }

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        jumpToLiveEdgeOnce()
        tryPlay()
      })

      hls.on(Hls.Events.LEVEL_LOADED, () => {
        jumpToLiveEdgeOnce()
      })

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        jumpToLiveEdgeOnce()
        if (video.paused && !video.seeking) {
          tryPlay()
        }
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        console.warn('[HLS Event]', data.type, data.details, data.fatal)
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL) {
          try {
            if (video && video.buffered.length > 0 && video.currentTime < video.buffered.start(0)) {
              video.currentTime = video.buffered.start(0) + 0.1
              video.play().catch(() => {})
            }
          } catch (_) {}
          return
        }
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR) {
              setTimeout(() => { if (hlsRef.current) hlsRef.current.loadSource(absoluteUrl) }, 2000)
            } else {
              setTimeout(() => { if (hlsRef.current) hlsRef.current.startLoad() }, 2000)
            }
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

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [hlsUrl])

  // Video frame readiness handler: only mark ready when real visual video dimensions exist!
  const markFrameReady = () => {
    if (videoRef.current) {
      const v = videoRef.current
      if (v.videoWidth > 0 && (v.readyState >= 2 || v.currentTime > 0)) {
        hasStartedPlaybackRef.current = true
        setIsPlaybackReady(true)
        setIsBuffering(false)
      }
    }
  }

  // ── Overlays ──────────────────────────────────────────────────────────────
  const renderOverlay = (icon, title, subtitle, color = '#d9d9d9', extra = null) => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', width: '100%', height: '100%', padding: 24,
      gap: 12,
    }}>
      <div style={{ fontSize: 52, color: color === '#faad14' ? '#faad14' : color === '#1890ff' ? '#1890ff' : '#595959' }}>{icon}</div>
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
      {/* Video element - invisible until real frame is decoded to prevent black screen */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          position: 'absolute',
          top: 0,
          left: 0,
          backgroundColor: '#000',
          opacity: (hlsStatus === 'live' && isPlaybackReady) ? 1 : 0,
          transition: 'opacity 0.25s ease-in-out',
          pointerEvents: (hlsStatus === 'live' && isPlaybackReady) ? 'auto' : 'none',
          zIndex: 2,
        }}
        onLoadedMetadata={markFrameReady}
        onLoadedData={markFrameReady}
        onTimeUpdate={markFrameReady}
        onPlaying={() => {
          markFrameReady()
          setIsBuffering(false)
        }}
        onCanPlay={markFrameReady}
        onWaiting={() => {
          if (isPlaybackReady) setIsBuffering(true)
        }}
      />

      {/* Floating Audio Control Button */}
      {hlsStatus === 'live' && isPlaybackReady && (
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 12 }}>
          <Button
            type={isMuted ? 'default' : 'primary'}
            shape="round"
            icon={isMuted ? <MutedOutlined /> : <SoundOutlined />}
            onClick={toggleMute}
            style={{
              backgroundColor: isMuted ? 'rgba(0, 0, 0, 0.7)' : '#1649c9',
              borderColor: isMuted ? 'rgba(255, 255, 255, 0.35)' : '#1649c9',
              color: '#fff',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              fontWeight: 500,
            }}
          >
            {isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          </Button>
        </div>
      )}

      {/* Buffering badge: subtle non-intrusive indicator that never blacks out the video */}
      {hlsStatus === 'live' && isPlaybackReady && isBuffering && (
        <div style={{
          position: 'absolute', top: 16, left: 16,
          display: 'flex', alignItems: 'center', gap: 8,
          backgroundColor: 'rgba(0,0,0,0.65)', padding: '4px 12px', borderRadius: 16,
          zIndex: 10, backdropFilter: 'blur(4px)',
        }}>
          <LoadingOutlined spin style={{ fontSize: 14, color: '#1890ff' }} />
          <span style={{ color: '#fff', fontSize: 12 }}>Đang đồng bộ...</span>
        </div>
      )}

      {/* Synchronizing overlay: shown during stream connect and until first frame appears */}
      {(hlsStatus === 'waiting' || hlsStatus === 'loading' || (hlsStatus === 'live' && !isPlaybackReady) || (hlsStatus === 'paused' && !isPlaybackReady)) && isSessionLive && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#141414', zIndex: 5, gap: 12, padding: 24,
        }}>
          <LoadingOutlined spin style={{ fontSize: 52, color: '#1890ff' }} />
          <Title level={4} style={{ color: '#1890ff', margin: 0 }}>ĐANG KẾT NỐI LUỒNG VIDEO</Title>
          <Text style={{ color: '#8c8c8c', fontSize: 13 }}>Đang kết nối tín hiệu và đồng bộ luồng phát...</Text>
          
          {deviceTelemetry && (
            <div style={{
              marginTop: 10,
              padding: '10px 18px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              textAlign: 'center',
              maxWidth: 380,
              backdropFilter: 'blur(4px)'
            }}>
              <div style={{ color: '#52c41a', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                {deviceTelemetry.encoder_label || deviceTelemetry.encoder}
              </div>
              <div style={{ color: '#bfbfbf', fontSize: 11 }}>
                GPU: {deviceTelemetry.gpu_model?.length > 32 ? deviceTelemetry.gpu_model.substring(0, 32) + '...' : deviceTelemetry.gpu_model} • CPU: {deviceTelemetry.cpu_percent}% • RAM: {deviceTelemetry.ram_used_gb || 0}GB
              </div>
              {deviceTelemetry.last_error && (
                <div style={{ 
                  color: '#ff4d4f', 
                  fontSize: 11, 
                  marginTop: 6, 
                  padding: '4px 8px', 
                  backgroundColor: 'rgba(255, 77, 79, 0.15)', 
                  borderRadius: 4,
                  border: '1px solid rgba(255, 77, 79, 0.3)' 
                }}>
                  ⚠️ Sự cố: {deviceTelemetry.last_error}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Hardware Badge during live playback */}
      {isPlaybackReady && deviceTelemetry && (
        <div style={{
          position: 'absolute', top: 16, right: 16,
          display: 'flex', alignItems: 'center', gap: 6,
          backgroundColor: 'rgba(0,0,0,0.65)', padding: '4px 10px', borderRadius: 14,
          zIndex: 10, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <span style={{ color: '#52c41a', fontSize: 11 }}>● {deviceTelemetry.encoder}</span>
          <span style={{ color: '#8c8c8c', fontSize: 11 }}>| CPU {deviceTelemetry.cpu_percent}%</span>
        </div>
      )}

      {/* ── Status overlays ── */}
      {!isSessionLive && hlsStatus === 'idle' && (
        session?.background_asset_url || session?.avatar_asset_url || session?.avatar_speaking_asset_url || session?.overlay_asset_url ? (
          <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ position: 'relative', height: '100%', aspectRatio: '9/16', backgroundColor: '#000', overflow: 'hidden', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}>
              {(() => {
                const resolveUrl = (url) => {
                  if (!url) return null;
                  if (url.startsWith('http://') || url.startsWith('https://')) return url;
                  let base = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
                  if (!base) {
                    base = `${window.location.protocol}//${window.location.hostname}:8000`;
                  }
                  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
                };
                const bgUrl = resolveUrl(session.background_asset_url);
                const avatarUrl = resolveUrl(session.avatar_asset_url || session.avatar_speaking_asset_url);
                const avatarPosterUrl = resolveUrl(session.avatar_asset_thumbnail_url);
                const overlayUrl = resolveUrl(session.overlay_asset_url);
                return (
                  <>
                    {bgUrl && (
                      bgUrl.match(/\.(mp4|webm)$/i) ? (
                        <video src={bgUrl} autoPlay loop muted playsInline preload="auto" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }} />
                      ) : (
                        <img src={bgUrl} alt="Background" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }} />
                      )
                    )}
                    {avatarUrl && (
                      avatarUrl.match(/\.(mp4|webm)$/i) ? (
                        <>
                          <video
                            src={avatarUrl}
                            poster={avatarPosterUrl || undefined}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="auto"
                            onLoadedData={() => setIsMockupAvatarLoaded(true)}
                            onCanPlay={() => setIsMockupAvatarLoaded(true)}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              opacity: isMockupAvatarLoaded || avatarPosterUrl ? 1 : 0,
                              transition: 'opacity 0.25s ease-in-out',
                              zIndex: 1
                            }}
                          />
                          {!isMockupAvatarLoaded && !avatarPosterUrl && (
                            <div style={{
                              position: 'absolute',
                              top: '45%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              backgroundColor: 'rgba(0,0,0,0.65)',
                              padding: '8px 16px',
                              borderRadius: 20,
                              backdropFilter: 'blur(6px)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: '#fff',
                              zIndex: 2,
                              pointerEvents: 'none'
                            }}>
                              <LoadingOutlined spin style={{ fontSize: 16, color: '#1890ff' }} />
                              <span style={{ fontSize: 12, fontWeight: 500 }}>Đang nạp người mẫu...</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', top: 0, left: 0 }} />
                      )
                    )}
                    {overlayUrl && (
                      <img src={overlayUrl} alt="Overlay" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 3 }} />
                    )}
                  </>
                );
              })()}
              <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(0,0,0,0.8)', padding: '4px 12px', borderRadius: 4, color: 'white', fontSize: 12, border: '1px solid #434343' }}>
                Mockup Preview (Scene Builder)
              </div>
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

      {hlsStatus === 'waiting' && !isSessionLive && renderOverlay(
        <LoadingOutlined spin />,
        'ĐANG KẾT NỐI LUỒNG VIDEO',
        'Đang đồng bộ tín hiệu từ thiết bị... Tự động kết nối ngay khi sẵn sàng',
        '#faad14'
      )}

      {/* Autoplay blocked — ONLY shown when video frame is ready but browser explicitly stopped playback */}
      {hlsStatus === 'paused' && isPlaybackReady && renderOverlay(
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
            if (hlsRef.current) {
              hlsRef.current.destroy()
              hlsRef.current = null
            }
            if (videoRef.current) {
              videoRef.current.src = ''
            }
            setHlsUrl(null)
            setIsPlaybackReady(false)
            hasStartedPlaybackRef.current = false
            hasJumpedToLiveEdgeRef.current = false
            setHlsStatus('waiting')
            setTimeout(probeHls, 600)
          }}
        >
          Thử lại
        </Button>
      )}
    </Card>
  )
}
