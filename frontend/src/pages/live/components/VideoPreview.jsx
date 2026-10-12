import React, { useState, useEffect, useRef, useCallback } from 'react'
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
  const watchdogTimerRef = useRef(null)
  const hardResetTimerRef = useRef(null)

  // idle | waiting | loading | paused | live | error
  const [hlsStatus, setHlsStatus] = useState('idle')
  const [hlsUrl, setHlsUrl] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [isPlaybackReady, setIsPlaybackReady] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)

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
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
      return urlStr
    }
    const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '')
    if (urlStr.startsWith('/')) {
      return `${apiBase}${urlStr}`
    }
    const dir = baseMasterUrl ? baseMasterUrl.substring(0, baseMasterUrl.lastIndexOf('/')) : ''
    return dir ? `${dir}/${urlStr}` : urlStr
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
        retryTimerRef.current = setTimeout(probeHls, 1500)
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
          retryTimerRef.current = setTimeout(probeHls, 1500)
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
        retryTimerRef.current = setTimeout(probeHls, 1500)
        return
      }

      // Other playlist status, retry shortly
      setHlsStatus('waiting')
      retryTimerRef.current = setTimeout(probeHls, 1500)
    } catch {
      setHlsStatus('waiting')
      retryTimerRef.current = setTimeout(probeHls, 1500)
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
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
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

  // Stall watchdog: auto-resync if stream attaches but freezes at currentTime = 0
  useEffect(() => {
    if (!hlsUrl || isPlaybackReady) {
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current)
      if (hardResetTimerRef.current) clearTimeout(hardResetTimerRef.current)
      return
    }

    watchdogTimerRef.current = setTimeout(() => {
      if (!isPlaybackReady && hlsRef.current) {
        console.warn('[VideoPreview Watchdog] Stream attached but no frames decoded after 5s. Reloading live edge...')
        try {
          hlsRef.current.stopLoad()
          hlsRef.current.startLoad(-1)
        } catch (err) {
          console.warn('[VideoPreview Watchdog] soft reload error:', err)
        }
      }
    }, 5000)

    hardResetTimerRef.current = setTimeout(() => {
      if (!isPlaybackReady) {
        console.warn('[VideoPreview Watchdog] Stream still not playing after 10s. Auto re-probing...')
        if (hlsRef.current) {
          hlsRef.current.destroy()
          hlsRef.current = null
        }
        setIsPlaybackReady(false)
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
      videoRef.current.play()
        .then(() => setHlsStatus('live'))
        .catch((e) => {
          console.error('Manual play failed:', e)
          setErrorMsg(`Không thể phát: ${e.message}`)
          setHlsStatus('error')
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
        backBufferLength: 30,
        // Live sync tuning: 3 segments buffer gives rock-solid smoothness
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        maxLiveSyncPlaybackRate: 1.2,
        // Manifest & segment retry resilience
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 1000,
        manifestLoadingMaxRetryTimeout: 15000,
        levelLoadingMaxRetry: 10,
        levelLoadingRetryDelay: 1000,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
        startFragPrefetch: true,
        xhrSetup: (xhr) => {
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        },
      })

      hlsRef.current = hls
      hls.loadSource(absoluteUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play()
          .then(() => {
            setHlsStatus('live')
          })
          .catch(() => {
            // Autoplay blocked by browser policy
            setHlsStatus('paused')
          })
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        console.warn('[HLS Event]', data.type, data.details, data.fatal)
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

  // Video frame readiness handler
  const markFrameReady = () => {
    if (videoRef.current && videoRef.current.currentTime > 0) {
      setIsPlaybackReady(true)
      setIsBuffering(false)
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
        muted
        playsInline
        onLoadedData={markFrameReady}
        onTimeUpdate={markFrameReady}
        onPlaying={markFrameReady}
        onCanPlay={markFrameReady}
        onWaiting={() => {
          if (isPlaybackReady) setIsBuffering(true)
        }}
      />

      {/* Buffering overlay when video was playing but stalls */}
      {hlsStatus === 'live' && isPlaybackReady && isBuffering && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10
        }}>
          <LoadingOutlined spin style={{ fontSize: 48, color: '#1890ff' }} />
          <div style={{ color: '#fff', marginTop: 12 }}>Đang đồng bộ luồng...</div>
        </div>
      )}

      {/* Synchronizing overlay: shown during stream connect and until first frame appears */}
      {(hlsStatus === 'loading' || (hlsStatus === 'live' && !isPlaybackReady)) && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#141414', zIndex: 5, gap: 12, padding: 24,
        }}>
          <LoadingOutlined spin style={{ fontSize: 52, color: '#1890ff' }} />
          <Title level={4} style={{ color: '#1890ff', margin: 0 }}>ĐANG ĐỒNG BỘ LUỒNG VIDEO</Title>
          <Text style={{ color: '#8c8c8c', fontSize: 13 }}>Đang tải và hiển thị khung hình đầu tiên...</Text>
        </div>
      )}

      {/* ── Status overlays ── */}
      {hlsStatus === 'idle' && (
        session?.background_asset_url || session?.avatar_asset_url || session?.overlay_asset_url ? (
          <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ position: 'relative', height: '100%', aspectRatio: '9/16', backgroundColor: '#000', overflow: 'hidden', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}>
              {(() => {
                const resolveUrl = (url) => url?.startsWith('/') ? `http://localhost:8000${url}` : url;
                const bgUrl = resolveUrl(session.background_asset_url);
                const avatarUrl = resolveUrl(session.avatar_asset_url);
                const overlayUrl = resolveUrl(session.overlay_asset_url);
                return (
                  <>
                    {bgUrl && (
                      bgUrl.match(/\.(mp4|webm)$/i) ? (
                        <video src={bgUrl} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }} />
                      ) : (
                        <img src={bgUrl} alt="Background" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }} />
                      )
                    )}
                    {avatarUrl && (
                      avatarUrl.match(/\.(mp4|webm)$/i) ? (
                        <video src={avatarUrl} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', top: 0, left: 0 }} />
                      ) : (
                        <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', top: 0, left: 0 }} />
                      )
                    )}
                    {overlayUrl && (
                      <img src={overlayUrl} alt="Overlay" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />
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

      {hlsStatus === 'waiting' && renderOverlay(
        <LoadingOutlined spin />,
        'ĐANG KẾT NỐI LUỒNG VIDEO',
        'Đang đồng bộ tín hiệu từ thiết bị... Tự động kết nối ngay khi sẵn sàng',
        '#faad14'
      )}

      {/* Autoplay blocked — show play button */}
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
            setIsPlaybackReady(false)
            setHlsStatus('waiting')
            setTimeout(probeHls, 800)
          }}
        >
          Thử lại
        </Button>
      )}
    </Card>
  )
}
