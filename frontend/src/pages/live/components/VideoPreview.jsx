import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Typography, Button, Tooltip } from 'antd'
import {
  VideoCameraOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  ExclamationCircleOutlined,
  SoundOutlined,
  MutedOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons'
import ChromaKeyVideo from './ChromaKeyVideo'

const { Title, Text } = Typography

// ── WHEP (WebRTC-HTTP Egress Protocol) helpers ───────────────────────────────
function buildWhepUrl(streamPath) {
  const base = (import.meta.env.VITE_WEBRTC_URL || 'http://localhost:8889').replace(/\/$/, '')
  return `${base}/${streamPath}/whep`
}

async function startWhepSession(whepUrl, pc) {
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  // Wait for ICE candidates gathering (max 3s)
  await new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(); return }
    const t = setTimeout(resolve, 3000)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve() }
    })
  })

  const resp = await fetch(whepUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: pc.localDescription.sdp,
  })
  if (!resp.ok) throw new Error(`WHEP ${resp.status} ${resp.statusText}`)
  const sdp = await resp.text()
  await pc.setRemoteDescription({ type: 'answer', sdp })
  return resp.headers.get('Location') || null
}

async function stopWhepSession(whepUrl, loc) {
  try {
    const url = loc
      ? (loc.startsWith('http') ? loc : new URL(loc, whepUrl).href)
      : null
    if (url) await fetch(url, { method: 'DELETE' })
  } catch { /* best-effort */ }
}

export default function VideoPreview({
  session,
  streamEvent,
  isMasterMuted = false,
  aiVolume = 100,
  onToggleMute,
}) {
  const videoRef = useRef(null)
  const pcRef = useRef(null)
  const locRef = useRef(null)
  const whepUrlRef = useRef(null)
  const retryRef = useRef(null)
  const connectRef = useRef(null)
  const frameReadyLockRef = useRef(false)
  const hasStartedPlaybackRef = useRef(false)

  // Stream status: 'idle' | 'connecting' | 'live' | 'paused' | 'error'
  const [streamStatus, setStreamStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [deviceTelemetry, setDeviceTelemetry] = useState(null)
  const [hasFirstFrameRendered, setHasFirstFrameRendered] = useState(false)
  const [internalMuted, setInternalMuted] = useState(false)
  const [isAutoMutedByBrowser, setIsAutoMutedByBrowser] = useState(false)
  const [isMockupAvatarLoaded, setIsMockupAvatarLoaded] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [progressStatusText, setProgressStatusText] = useState('Đang thiết lập kết nối...')
  const [showHud, setShowHud] = useState(true)
  const retryCountRef = useRef(0)
  const MAX_RETRY = 5

  const activeMuted = (isMasterMuted !== undefined) ? isMasterMuted : internalMuted
  const activeVolume = Math.max(0, Math.min(1, (aiVolume ?? 100) / 100))

  const streamPath = 'live'
  const isStreamLiveFromEvent = streamEvent?.event_type === 'live.stream.status' &&
    (streamEvent?.payload?.state === 'LIVE' || streamEvent?.payload?.stream_state === 'LIVE')
  const isStreamStarting = streamEvent?.event_type === 'live.stream_start.dispatched'
  const isSessionLive = session?.status === 'running' || session?.status === 'human_takeover' || isStreamLiveFromEvent || isStreamStarting

  // ── Sync initial telemetry from session device ──────────────────────────────
  useEffect(() => {
    if (session?.device?.metadata) {
      const meta = session.device.metadata
      setDeviceTelemetry((prev) => ({
        ...prev,
        cpu_percent: meta.cpu_usage ?? prev?.cpu_percent ?? 24,
        ram_percent: meta.ram_usage ?? prev?.ram_percent ?? 45,
        gpu_model: meta.gpu_model || prev?.gpu_model,
        cpu_model: meta.cpu_model || prev?.cpu_model,
        encoder: meta.encoder || prev?.encoder || 'h264_nvenc',
        encoder_label: meta.encoder_label || prev?.encoder_label || '⚡ NVIDIA NVENC (GPU)',
      }))
    }
  }, [session?.device?.metadata])

  // ── Sync volume & mute state ────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current) {
      const shouldMute = activeMuted || aiVolume === 0 || isAutoMutedByBrowser
      videoRef.current.muted = shouldMute
      videoRef.current.volume = activeVolume
    }
  }, [activeMuted, activeVolume, aiVolume, isAutoMutedByBrowser])

  useEffect(() => {
    setIsMockupAvatarLoaded(false)
  }, [session?.avatar_asset_url, session?.avatar_speaking_asset_url])

  const toggleMute = () => {
    if (onToggleMute) {
      onToggleMute()
    } else if (videoRef.current) {
      const nextMuted = !videoRef.current.muted
      videoRef.current.muted = nextMuted
      setInternalMuted(nextMuted)
    }
  }

  // ── Video frame readiness handler ───────────────────────────────────────────
  const markFrameReady = useCallback(() => {
    const v = videoRef.current
    if (!v) return

    if (v.readyState >= 2 && v.videoWidth > 0 && !frameReadyLockRef.current) {
      frameReadyLockRef.current = true
      hasStartedPlaybackRef.current = true
      setLoadProgress(100)
      setProgressStatusText('Hoàn tất 100%! Đang mở luồng phát...')

      setTimeout(() => {
        setHasFirstFrameRendered(true)
        setStreamStatus('live')
        setErrorMsg('')
        retryCountRef.current = 0
      }, 350)
    }
  }, [])

  // ── WHEP Connect ────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!streamPath || !isSessionLive) return
    const url = buildWhepUrl(streamPath)
    whepUrlRef.current = url

    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    setStreamStatus('connecting')
    setErrorMsg('')
    frameReadyLockRef.current = false
    setLoadProgress((prev) => Math.max(prev, 15))

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        bundlePolicy: 'max-bundle',
      })
      pcRef.current = pc

      pc.ontrack = (evt) => {
        if (videoRef.current && evt.streams?.[0]) {
          videoRef.current.srcObject = evt.streams[0]
          const playPromise = videoRef.current.play()
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(() => {
              markFrameReady()
            }).catch((err) => {
              if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
                if (videoRef.current) {
                  videoRef.current.muted = true
                  setIsAutoMutedByBrowser(true)
                  videoRef.current.play().then(markFrameReady).catch(() => {})
                }
              }
            })
          }
        }
      }

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState
        if (s === 'connected') {
          markFrameReady()
        } else if (s === 'failed' || s === 'disconnected') {
          if (!hasFirstFrameRendered) {
            setStreamStatus('error')
            setErrorMsg('Mất kết nối WebRTC')
            if (retryCountRef.current < MAX_RETRY) {
              const delay = Math.min(2000 * 2 ** retryCountRef.current, 20000)
              retryCountRef.current += 1
              retryRef.current = setTimeout(() => connectRef.current?.(), delay)
            }
          }
        }
      }

      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })

      const loc = await startWhepSession(url, pc)
      locRef.current = loc
    } catch (err) {
      console.warn('[WHEP Connect]', err)
      if (!hasFirstFrameRendered) {
        const isWarmupErr = err.message && (
          err.message.includes('404') ||
          err.message.toLowerCase().includes('not found') ||
          err.message.includes('Failed to fetch')
        )
        const MAX_WARMUP_RETRIES = 25

        if (isWarmupErr && retryCountRef.current < MAX_WARMUP_RETRIES) {
          // Encoder is warming up, MediaMTX waiting for first frame.
          // Keep status 'connecting' so progress radar continues smoothly without flashing error popup.
          retryCountRef.current += 1
          retryRef.current = setTimeout(() => connectRef.current?.(), 1000)
        } else {
          setStreamStatus('error')
          setErrorMsg(err.message || 'Không thể kết nối luồng phát')
          if (retryCountRef.current < MAX_RETRY) {
            const delay = Math.min(2000 * 2 ** retryCountRef.current, 20000)
            retryCountRef.current += 1
            retryRef.current = setTimeout(() => connectRef.current?.(), delay)
          }
        }
      }
    }
  }, [streamPath, isSessionLive, hasFirstFrameRendered, markFrameReady])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  const disconnect = useCallback(async () => {
    clearTimeout(retryRef.current)
    await stopWhepSession(whepUrlRef.current, locRef.current)
    locRef.current = null
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setStreamStatus('idle')
    setHasFirstFrameRendered(false)
    frameReadyLockRef.current = false
    setLoadProgress(0)
  }, [])

  // ── Auto-connect / disconnect when session status changes ────────────────────
  useEffect(() => {
    if (isSessionLive) {
      connect()
    } else {
      disconnect()
    }
    return () => clearTimeout(retryRef.current)
  }, [isSessionLive]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Listen for WebSocket events ─────────────────────────────────────────────
  useEffect(() => {
    if (!streamEvent) return
    const { event_type, payload } = streamEvent

    if (event_type === 'live.stream.status') {
      const state = payload?.state || payload?.stream_state
      if (state === 'LIVE') {
        setTimeout(() => connectRef.current?.(), 1000)
      } else if (['STOPPED', 'IDLE', 'ERROR', 'stopped'].includes(state)) {
        disconnect()
      }
    } else if (event_type === 'live.device.heartbeat') {
      if (payload?.metrics) {
        const m = payload.metrics
        setDeviceTelemetry({
          cpu_percent: m.cpu_percent ?? 24,
          ram_percent: m.ram_percent ?? 45,
          gpu_model: m.gpu_model,
          cpu_model: m.cpu_model,
          encoder: m.encoder || 'h264_nvenc',
          encoder_label: m.encoder_label || (m.encoder?.includes('nvenc') ? '⚡ NVIDIA NVENC (GPU)' : '🖥️ CPU Encoder'),
        })
      }
    }
  }, [streamEvent, disconnect])

  // ── Progressive percentage simulation (0% -> 100%) ──────────────────────────
  useEffect(() => {
    if (!isSessionLive) {
      setLoadProgress(0)
      frameReadyLockRef.current = false
      return
    }

    if (hasFirstFrameRendered) {
      setLoadProgress(100)
      return
    }

    setLoadProgress((prev) => Math.max(prev, 15))

    const progressTimer = setInterval(() => {
      markFrameReady()

      setLoadProgress((prev) => {
        if (frameReadyLockRef.current || prev >= 100) return 100
        if (prev < 45) {
          return prev + Math.floor(Math.random() * 4 + 4)
        }
        if (prev < 80) {
          return prev + Math.floor(Math.random() * 3 + 2)
        }
        if (prev < 95) {
          return prev + 1
        }
        return 95
      })
    }, 240)

    return () => clearInterval(progressTimer)
  }, [isSessionLive, hasFirstFrameRendered, markFrameReady])

  // ── Dynamic progress status text ────────────────────────────────────────────
  useEffect(() => {
    if (!isSessionLive) {
      setProgressStatusText('Đang thiết lập kết nối...')
    } else if (loadProgress >= 100) {
      setProgressStatusText('Hoàn tất 100%! Đang mở luồng phát...')
    } else if (loadProgress >= 85) {
      setProgressStatusText('Đang dựng khung hình & khởi chạy WebRTC...')
    } else if (loadProgress >= 65) {
      setProgressStatusText('Đang nạp bộ đệm phát mượt (0% giật lag)...')
    } else if (loadProgress >= 40) {
      setProgressStatusText('Đang tải luồng phát & đồng bộ âm thanh AI...')
    } else {
      setProgressStatusText('Đang đồng bộ mã hóa hình ảnh & tách phông AI...')
    }
  }, [isSessionLive, loadProgress])

  // ── Manual play if browser blocked autoplay ─────────────────────────────────
  const handleManualPlay = () => {
    if (videoRef.current) {
      videoRef.current.play().then(() => {
        markFrameReady()
        setStreamStatus('live')
      }).catch(() => {})
    }
  }

  // ── Fallback overlay renderer ───────────────────────────────────────────────
  const renderOverlay = (icon, title, subtitle, color = '#d9d9d9', extra = null) => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', width: '100%', height: '100%', padding: 24,
      gap: 12,
    }}>
      <div style={{ fontSize: 52, color }}>{icon}</div>
      <Title level={4} style={{ color, margin: 0, textAlign: 'center' }}>{title}</Title>
      {subtitle && <Text style={{ color: '#8c8c8c', textAlign: 'center', fontSize: 13 }}>{subtitle}</Text>}
      {extra}
    </div>
  )

  // ── Scene composition helper (Offline Mockup Preview) ─────────────────────
  const renderSceneComposition = () => {
    const resolveUrl = (url) => {
      if (!url) return null
      if (url.startsWith('http://') || url.startsWith('https://')) return url
      let base = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')
      if (!base) {
        base = `${window.location.protocol}//${window.location.hostname}:8000`
      }
      return `${base}${url.startsWith('/') ? '' : '/'}${url}`
    }
    const bgUrl = resolveUrl(session?.background_asset_url)
    const avatarUrl = resolveUrl(session?.avatar_asset_url || session?.avatar_speaking_asset_url)
    const avatarPosterUrl = resolveUrl(session?.avatar_asset_thumbnail_url)
    const overlayUrl = resolveUrl(session?.overlay_asset_url)

    return (
      <>
        {bgUrl && (
          bgUrl.match(/\.(mp4|webm)$/i) ? (
            <video
              src={bgUrl}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
            />
          ) : (
            <img
              src={bgUrl}
              alt="Background"
              style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
            />
          )
        )}
        {avatarUrl && (
          avatarUrl.match(/\.(mp4|webm)$/i) ? (
            <ChromaKeyVideo
              src={avatarUrl}
              poster={avatarPosterUrl || undefined}
              onLoaded={() => setIsMockupAvatarLoaded(true)}
              style={{ zIndex: 1 }}
            />
          ) : (
            <img
              src={avatarUrl}
              alt="Avatar"
              style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
            />
          )
        )}
        {overlayUrl && (
          <img
            src={overlayUrl}
            alt="Overlay"
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 3 }}
          />
        )}
      </>
    )
  }

  return (
    <Card
      style={{
        width: '100%',
        minHeight: 540,
        backgroundColor: '#141414',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #262626',
        overflow: 'hidden',
        marginBottom: 16,
      }}
      styles={{
        body: {
          textAlign: 'center',
          width: '100%',
          padding: 0,
          height: '100%',
          minHeight: 540,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }
      }}
    >
      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes pulseRadarGlow {
          0% { transform: scale(0.85); opacity: 0.9; }
          50% { transform: scale(1.3); opacity: 0.25; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes progressShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      {/* ── Connecting Stage: Broadcast Preparation Screen (0% - 100% Progress) ── */}
      {isSessionLive && !hasFirstFrameRendered && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 6,
          background: 'radial-gradient(ellipse at center, #11141e 0%, #07080c 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          boxSizing: 'border-box',
          userSelect: 'none',
        }}>
          {/* Animated Glowing Radar Pulse */}
          <div style={{
            position: 'relative',
            width: 80,
            height: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}>
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: 'rgba(24, 144, 255, 0.18)',
              animation: 'pulseRadarGlow 2s infinite ease-out',
            }} />
            <div style={{
              position: 'absolute',
              width: '72%',
              height: '72%',
              borderRadius: '50%',
              background: 'rgba(24, 144, 255, 0.28)',
            }} />
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1890ff, #096dd9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 24px rgba(24, 144, 255, 0.65)',
              zIndex: 2,
            }}>
              <ThunderboltOutlined style={{ fontSize: 24, color: '#fff' }} />
            </div>
          </div>

          {/* Title & Loading indicator */}
          <div style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 1.1,
            color: '#e6f7ff',
            textTransform: 'uppercase',
            marginBottom: 6,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
          }}>
            <LoadingOutlined spin style={{ color: '#1890ff', fontSize: 15 }} />
            <span>Đang nạp luồng phát trực tiếp (WebRTC ~0s)</span>
          </div>

          <div style={{
            fontSize: 12.5,
            color: '#8c8c8c',
            textAlign: 'center',
            maxWidth: 360,
            lineHeight: 1.5,
            marginBottom: 16,
          }}>
            {progressStatusText}
          </div>

          {/* Progress Bar (0% - 100%) */}
          <div style={{
            width: '100%',
            maxWidth: 370,
            marginBottom: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              fontWeight: 600,
            }}>
              <span style={{ color: '#a0aab8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: loadProgress >= 100 ? '#52c41a' : '#1890ff',
                  boxShadow: `0 0 8px ${loadProgress >= 100 ? 'rgba(82,196,26,0.85)' : 'rgba(24,144,255,0.85)'}`,
                }} />
                {loadProgress >= 100 ? 'Đã tải hoàn tất' : 'Đang xử lý & giải mã WebRTC'}
              </span>
              <span style={{
                color: loadProgress >= 100 ? '#52c41a' : '#40a9ff',
                fontFamily: 'monospace',
                fontSize: 13,
                fontWeight: 700,
              }}>
                {Math.round(loadProgress)}%
              </span>
            </div>

            {/* Track */}
            <div style={{
              width: '100%',
              height: 7,
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 10,
              overflow: 'hidden',
              position: 'relative',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.5)',
            }}>
              <div style={{
                width: `${Math.min(100, Math.max(0, loadProgress))}%`,
                height: '100%',
                background: loadProgress >= 100
                  ? 'linear-gradient(90deg, #52c41a, #73d13d)'
                  : 'linear-gradient(90deg, #096dd9 0%, #1890ff 50%, #69c0ff 100%)',
                borderRadius: 10,
                transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: loadProgress >= 100
                  ? '0 0 12px rgba(82, 196, 26, 0.8)'
                  : '0 0 12px rgba(24, 144, 255, 0.65)',
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent)',
                  animation: 'progressShimmer 1.8s infinite',
                }} />
              </div>
            </div>
          </div>

          {/* Readiness Checklist */}
          <div style={{
            width: '100%',
            maxWidth: 370,
            background: 'linear-gradient(165deg, rgba(255, 255, 255, 0.05) 0%, rgba(18, 22, 31, 0.75) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.09)',
            borderRadius: 14,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            backdropFilter: 'blur(14px)',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          }}>
            {/* Item 1: Trạm Live Studio */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.035)',
            }}>
              <span style={{ color: '#f0f2f5', display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, fontWeight: 500 }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: '#52c41a',
                  boxShadow: '0 0 8px rgba(82, 196, 26, 0.85)',
                  flexShrink: 0,
                }} />
                Trạm Live Studio
              </span>
              <span style={{
                backgroundColor: 'rgba(82, 196, 26, 0.12)',
                border: '1px solid rgba(82, 196, 26, 0.3)',
                color: '#73d13d',
                padding: '2.5px 9px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.2,
                whiteSpace: 'nowrap',
              }}>
                Đã kết nối
              </span>
            </div>

            {/* Item 2: Tách phông xanh & Ghép nền AI */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.035)',
            }}>
              <span style={{ color: '#f0f2f5', display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, fontWeight: 500 }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: loadProgress >= 40 ? '#52c41a' : '#1890ff',
                  boxShadow: `0 0 8px ${loadProgress >= 40 ? 'rgba(82, 196, 26, 0.85)' : 'rgba(24, 144, 255, 0.85)'}`,
                  flexShrink: 0,
                }} />
                Tách phông xanh & Ghép nền AI
              </span>
              <span style={{
                backgroundColor: loadProgress >= 40 ? 'rgba(82, 196, 26, 0.12)' : 'rgba(24, 144, 255, 0.12)',
                border: `1px solid ${loadProgress >= 40 ? 'rgba(82, 196, 26, 0.3)' : 'rgba(24, 144, 255, 0.3)'}`,
                color: loadProgress >= 40 ? '#73d13d' : '#40a9ff',
                padding: '2.5px 9px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.2,
                whiteSpace: 'nowrap',
              }}>
                {loadProgress >= 40 ? 'Hoàn tất ghép nền' : 'Đang kết xuất luồng'}
              </span>
            </div>

            {/* Item 3: Giọng nói AI & Nhạc nền */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.035)',
            }}>
              <span style={{ color: '#f0f2f5', display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, fontWeight: 500 }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: '#52c41a',
                  boxShadow: '0 0 8px rgba(82, 196, 26, 0.85)',
                  flexShrink: 0,
                }} />
                Giọng nói AI & Nhạc nền
              </span>
              <span style={{
                backgroundColor: 'rgba(82, 196, 26, 0.12)',
                border: '1px solid rgba(82, 196, 26, 0.3)',
                color: '#73d13d',
                padding: '2.5px 9px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.2,
                whiteSpace: 'nowrap',
              }}>
                Sẵn sàng
              </span>
            </div>

            {/* Item 4: Kênh WebRTC độ trễ 0s */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.035)',
            }}>
              <span style={{ color: '#f0f2f5', display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, fontWeight: 500 }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: loadProgress >= 100 ? '#52c41a' : '#1890ff',
                  boxShadow: `0 0 8px ${loadProgress >= 100 ? 'rgba(82, 196, 26, 0.85)' : 'rgba(24, 144, 255, 0.85)'}`,
                  flexShrink: 0,
                }} />
                WebRTC Stream (~0s delay)
              </span>
              <span style={{
                backgroundColor: loadProgress >= 100 ? 'rgba(82, 196, 26, 0.12)' : 'rgba(24, 144, 255, 0.12)',
                border: `1px solid ${loadProgress >= 100 ? 'rgba(82, 196, 26, 0.3)' : 'rgba(24, 144, 255, 0.3)'}`,
                color: loadProgress >= 100 ? '#73d13d' : '#40a9ff',
                padding: '2.5px 9px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.2,
                whiteSpace: 'nowrap',
              }}>
                {loadProgress >= 100 ? 'Đã kết nối (100%)' : 'Đang bắt tay WHEP...'}
              </span>
            </div>
          </div>

          <div style={{
            marginTop: 16,
            fontSize: 11.5,
            color: '#6e7687',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>⚡ Video thời gian thực sẽ tự động xuất hiện ngay khi nạp đủ 100% khung hình</span>
          </div>
        </div>
      )}

      {/* ── Live Video Stream Layer: Fades in smoothly with 9:16 vertical ratio ── */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 540,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: '#000',
      }}>
        {/* ── Dedicated HUD Toggle Button (Fixed to top-right corner, always visible, never pushed off-screen) ── */}
        <Tooltip title={showHud ? "Bấm để ẩn thông số trên màn hình" : "Bấm để hiện lại thông số"}>
          <Button
            size="small"
            shape="round"
            icon={showHud ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => setShowHud(!showHud)}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: 35,
              backgroundColor: showHud ? 'rgba(0, 0, 0, 0.78)' : 'rgba(18, 22, 31, 0.92)',
              color: showHud ? '#d9d9d9' : '#52c41a',
              border: showHud ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid rgba(82, 196, 26, 0.75)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.55)',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              height: 28,
              padding: '0 9px',
              cursor: 'pointer',
            }}
          >
            {showHud ? 'Ẩn' : 'Hiện thông tin'}
          </Button>
        </Tooltip>

        {/* ── Floating Top Status Bar (Only shown when showHud is true, stays clear of toggle button) ── */}
        {showHud && (
          <div style={{
            position: 'absolute',
            top: 10,
            left: 10,
            right: 74,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            zIndex: 25,
            pointerEvents: 'none',
          }}>
            {/* Left: LIVE / PREVIEW WebRTC indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              backgroundColor: 'rgba(0, 0, 0, 0.82)',
              padding: '4px 10px',
              borderRadius: 14,
              backdropFilter: 'blur(8px)',
              border: hasFirstFrameRendered
                ? '1px solid rgba(82, 196, 26, 0.5)'
                : '1px solid rgba(24, 144, 255, 0.35)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
              pointerEvents: 'auto',
              flexShrink: 0,
            }}>
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: hasFirstFrameRendered ? '#52c41a' : '#1890ff',
                boxShadow: hasFirstFrameRendered ? '0 0 8px #52c41a' : '0 0 6px #1890ff',
                display: 'inline-block',
              }} />
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                {hasFirstFrameRendered ? 'LIVE' : 'PREVIEW'}
              </span>
              <span style={{ color: hasFirstFrameRendered ? '#52c41a' : '#40a9ff', fontSize: 10.5, fontWeight: 600 }}>
                {hasFirstFrameRendered ? '⚡ WebRTC' : '⚡ WebRTC'}
              </span>
            </div>

            {/* Right: Hardware Telemetry badge (GPU, CPU, Encoder) */}
            <Tooltip
              title={
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <div><b>Mã hóa:</b> {deviceTelemetry?.encoder_label || (deviceTelemetry?.encoder === 'h264_nvenc' ? 'NVIDIA NVENC (GPU)' : (deviceTelemetry?.encoder || 'GPU'))}</div>
                  {deviceTelemetry?.gpu_model && <div><b>Card đồ họa:</b> {deviceTelemetry.gpu_model}</div>}
                  {deviceTelemetry?.cpu_model && <div><b>CPU:</b> {deviceTelemetry.cpu_model}</div>}
                  <div><b>Sử dụng CPU:</b> {deviceTelemetry?.cpu_percent ?? 24}%</div>
                </div>
              }
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                backgroundColor: 'rgba(0, 0, 0, 0.82)',
                padding: '4px 9px',
                borderRadius: 14,
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                fontSize: 10.5,
                pointerEvents: 'auto',
                flexShrink: 0,
                cursor: 'help',
              }}>
                <span style={{ color: '#52c41a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  ● {deviceTelemetry?.encoder === 'h264_nvenc' ? 'NVENC' : (deviceTelemetry?.encoder || 'GPU')}
                </span>
                <span style={{ color: '#d9d9d9', whiteSpace: 'nowrap' }}>
                  | CPU {deviceTelemetry?.cpu_percent ?? 24}%
                </span>
                {deviceTelemetry?.gpu_model && (
                  <span
                    style={{
                      color: '#40a9ff',
                      fontWeight: 500,
                      maxWidth: 90,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    | {deviceTelemetry.gpu_model.split('/')[0].replace(/NVIDIA\s+GeForce\s+/i, '').trim()}
                  </span>
                )}
              </div>
            </Tooltip>
          </div>
        )}

        {/* ── 9:16 Inner Frame Container (Tỉ lệ chuẩn 9:16, vừa vặn không biến dạng) ── */}
        <div style={{
          position: 'relative',
          height: 560,
          maxHeight: '100%',
          aspectRatio: '9/16',
          maxWidth: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
          overflow: 'hidden',
          borderRadius: 10,
          boxShadow: '0 10px 36px rgba(0, 0, 0, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          {/* Base Layer: Scene Composition / Mockup Preview (Offline mode - fits inner frame height) */}
          {!isSessionLive && (
            (session?.background_asset_url || session?.avatar_asset_url || session?.avatar_speaking_asset_url || session?.overlay_asset_url) ? (
              <div style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                zIndex: 2,
              }}>
                {renderSceneComposition()}
                <div style={{
                  position: 'absolute',
                  bottom: 16,
                  right: 16,
                  background: 'rgba(0,0,0,0.8)',
                  padding: '4px 12px',
                  borderRadius: 4,
                  color: 'white',
                  fontSize: 12,
                  border: '1px solid #434343',
                  zIndex: 4,
                }}>
                  Bản xem trước Cảnh
                </div>
              </div>
            ) : (
              <div style={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {renderOverlay(
                  <VideoCameraOutlined />,
                  'STREAM PREVIEW',
                  'Bấm "Thiết kế Cảnh" để thêm Avatar/Background hoặc bấm "Bắt đầu LIVE"',
                  '#595959'
                )}
              </div>
            )
          )}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={activeMuted || (aiVolume === 0) || isAutoMutedByBrowser}
            onClick={() => {
              if (videoRef.current) {
                if (isAutoMutedByBrowser) {
                  videoRef.current.muted = activeMuted || (aiVolume === 0)
                  setIsAutoMutedByBrowser(false)
                }
                if (videoRef.current.paused) {
                  videoRef.current.play().then(() => setStreamStatus('live')).catch(() => {})
                }
              }
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
              top: 0,
              left: 0,
              backgroundColor: '#000',
              opacity: hasFirstFrameRendered ? 1 : 0,
              transition: 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              pointerEvents: hasFirstFrameRendered ? 'auto' : 'none',
              cursor: 'pointer',
              zIndex: 4,
            }}
            onLoadedMetadata={markFrameReady}
            onLoadedData={markFrameReady}
            onTimeUpdate={markFrameReady}
            onPlaying={() => {
              setIsPaused(false)
              markFrameReady()
            }}
            onPlay={() => {
              setIsPaused(false)
              markFrameReady()
            }}
            onPause={() => setIsPaused(true)}
            onCanPlay={markFrameReady}
          />

          {/* Click to unmute banner if browser autoplay policy muted the video */}
          {isAutoMutedByBrowser && !activeMuted && hasFirstFrameRendered && showHud && (
            <div
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.muted = false
                  videoRef.current.volume = activeVolume
                  setIsAutoMutedByBrowser(false)
                }
              }}
              style={{
                position: 'absolute',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                backgroundColor: 'rgba(24, 144, 255, 0.95)',
                color: '#fff',
                padding: '8px 20px',
                borderRadius: 24,
                cursor: 'pointer',
                zIndex: 10,
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                fontWeight: 600,
                fontSize: 13,
                backdropFilter: 'blur(6px)',
              }}
            >
              🔊 Nhấn vào đây để bật âm thanh
            </div>
          )}

          {/* Floating Audio Status & Quick Unmute Button (Controlled by showHud) */}
          {hasFirstFrameRendered && showHud && (
            <div 
              onClick={(e) => {
                e.stopPropagation()
                toggleMute()
                if (videoRef.current && activeMuted) {
                  videoRef.current.muted = false
                  videoRef.current.volume = activeVolume
                  setIsAutoMutedByBrowser(false)
                }
              }}
              title={activeMuted ? "Bấm để bật âm thanh preview" : "Bấm để tắt âm thanh preview"}
              style={{
                position: 'absolute',
                bottom: 16,
                right: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: activeMuted ? 'rgba(255, 77, 79, 0.9)' : 'rgba(0, 0, 0, 0.72)',
                padding: '5px 12px',
                borderRadius: 20,
                zIndex: 11,
                cursor: 'pointer',
                backdropFilter: 'blur(6px)',
                border: activeMuted ? '1px solid #ff4d4f' : '1px solid rgba(255,255,255,0.2)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 500,
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
              }}
            >
              {activeMuted ? (
                <>
                  <MutedOutlined style={{ color: '#fff', fontSize: 14 }} />
                  <span>Đang tắt tiếng</span>
                </>
              ) : (
                <>
                  <SoundOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                  <span>Âm thanh bật</span>
                </>
              )}
            </div>
          )}

          {/* Autoplay blocked — show manual play button */}
          {(streamStatus === 'paused' || (hasFirstFrameRendered && isPaused)) && isSessionLive && (
            <div style={{
              position: 'absolute',
              inset: 0,
              zIndex: 12,
              backgroundColor: 'rgba(0,0,0,0.7)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}>
              <PlayCircleOutlined style={{ cursor: 'pointer', color: '#52c41a', fontSize: 64 }} onClick={handleManualPlay} />
              <Text style={{ color: '#d9d9d9', fontSize: 13 }}>Trình duyệt yêu cầu tương tác để phát video</Text>
              <Button type="primary" size="middle" icon={<PlayCircleOutlined />} onClick={handleManualPlay}>
                Phát Video
              </Button>
            </div>
          )}

          {/* Error state */}
          {streamStatus === 'error' && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 12,
              backgroundColor: 'rgba(20,20,20,0.92)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {renderOverlay(
                <ExclamationCircleOutlined />,
                'LỖI STREAM',
                errorMsg || 'Không thể tải luồng video qua WebRTC.',
                '#ff4d4f',
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    setStreamStatus('connecting')
                    retryCountRef.current = 0
                    connect()
                  }}
                  style={{ marginTop: 8 }}
                >
                  Kết nối lại
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
