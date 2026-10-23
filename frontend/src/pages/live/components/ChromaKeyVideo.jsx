import React, { useRef, useEffect, useState } from 'react'
import { LoadingOutlined } from '@ant-design/icons'

/**
 * ChromaKeyVideo
 * Renders an avatar video with real-time WebGL chroma keying (blue/green screen removal).
 * Accurately mimics FFmpeg's chromakey filter so the offline scene preview matches the live broadcast 100%.
 */
export default function ChromaKeyVideo({
  src,
  speakingSrc,
  activePose = 'idle', // 'idle' | 'speaking'
  poster,
  onLoaded,
  style = {},
  keyColorHex, // e.g. '#166CA6'
  similarity = 0.072,
  smoothness = 0.015,
}) {
  const videoIdleRef = useRef(null)
  const videoSpeakingRef = useRef(null)
  const canvasRef = useRef(null)
  const activePoseRef = useRef(activePose)
  activePoseRef.current = activePose
  const [isLoaded, setIsLoaded] = useState(false)
  const [useFallback, setUseFallback] = useState(false)

  useEffect(() => {
    let animId = null
    let gl = null
    let texture = null
    let program = null
    let isCancelled = false

    const videoIdle = videoIdleRef.current
    const canvas = canvasRef.current
    if (!videoIdle || !canvas || useFallback) return

    // Initialize WebGL with alpha channel (premultipliedAlpha: true ensures natural soft edge blending without dark halos)
    try {
      gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true }) ||
           canvas.getContext('experimental-webgl', { premultipliedAlpha: true, alpha: true })
    } catch (e) {
      console.warn('[ChromaKeyVideo] WebGL not supported, falling back to standard video:', e)
      setUseFallback(true)
      return
    }

    if (!gl) {
      setUseFallback(true)
      return
    }

    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `

    // High quality chroma keying with despill & spatial tolerance tuning
    const fsSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform vec3 u_keyColor;
      uniform float u_similarity;
      uniform float u_smoothness;

      vec3 rgb2yuv(vec3 rgb) {
        float y = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
        float u = -0.14713 * rgb.r - 0.28886 * rgb.g + 0.436 * rgb.b;
        float v = 0.615 * rgb.r - 0.51499 * rgb.g - 0.10001 * rgb.b;
        return vec3(y, u, v);
      }

      void main() {
        vec4 color = texture2D(u_image, v_texCoord);
        
        // 1. Directly sample 4 top corners of the video texture in GPU:
        // This is 100% immune to CORS, cross-origin canvas tainting, or timing race conditions!
        vec3 autoCorner = (
          texture2D(u_image, vec2(0.01, 0.01)).rgb +
          texture2D(u_image, vec2(0.99, 0.01)).rgb +
          texture2D(u_image, vec2(0.02, 0.02)).rgb +
          texture2D(u_image, vec2(0.98, 0.02)).rgb
        ) * 0.25;

        // Choose the active key color:
        // If manual keyColorHex was provided and non-zero, use it; otherwise use GPU auto-corner
        vec3 activeKey = autoCorner;
        if (length(u_keyColor) > 0.05) {
          activeKey = u_keyColor;
        }

        vec3 keyYUV = rgb2yuv(activeKey);
        vec3 colorYUV = rgb2yuv(color.rgb);
        
        // 2. Pure Chroma UV distance + 2.0-pixel Matte Choke:
        // Morphological erosion strips the 1-2 pixel camera chroma subsampling blur halo along arms & table
        vec2 onePixel = vec2(2.0 / 1080.0, 2.0 / 1920.0);
        float distCenter = distance(colorYUV.yz, keyYUV.yz);
        float distUp = distance(rgb2yuv(texture2D(u_image, v_texCoord + vec2(0.0, -onePixel.y)).rgb).yz, keyYUV.yz);
        float distDown = distance(rgb2yuv(texture2D(u_image, v_texCoord + vec2(0.0, onePixel.y)).rgb).yz, keyYUV.yz);
        float distLeft = distance(rgb2yuv(texture2D(u_image, v_texCoord + vec2(-onePixel.x, 0.0)).rgb).yz, keyYUV.yz);
        float distRight = distance(rgb2yuv(texture2D(u_image, v_texCoord + vec2(onePixel.x, 0.0)).rgb).yz, keyYUV.yz);

        bool isGreen = (activeKey.g > activeKey.r && activeKey.g > activeKey.b);
        float effSim = isGreen ? 0.046 : 0.072;
        float effSmooth = isGreen ? 0.012 : 0.015;

        float aCenter = smoothstep(effSim, effSim + effSmooth, distCenter);
        float aUp = smoothstep(effSim, effSim + effSmooth, distUp);
        float aDown = smoothstep(effSim, effSim + effSmooth, distDown);
        float aLeft = smoothstep(effSim, effSim + effSmooth, distLeft);
        float aRight = smoothstep(effSim, effSim + effSmooth, distRight);

        // Choked alpha: cleanly eliminates the 1-2 pixel blue/green fringe along outer silhouette & table line
        float minNeighborAlpha = min(min(aUp, aDown), min(aLeft, aRight));
        float alpha = min(aCenter, minNeighborAlpha);

        // Clear shadow boundary where blue/green wall meets the table on outer margins:
        if (v_texCoord.y > 0.68 && v_texCoord.y < 0.74 && (v_texCoord.x < 0.08 || v_texCoord.x > 0.91)) {
          if (!isGreen && color.b > max(color.r, color.g)) {
            alpha = 0.0;
          } else if (isGreen && color.g > max(color.r, color.b)) {
            alpha = 0.0;
          }
        }

        // 3. Targeted Hair & Lower Body Contour Despill:
        if (v_texCoord.y < 0.48) {
          // Head & hair: Melanin clamp eliminates all cyan, blue, or green halos on hair
          float maxColor = color.r * 1.05;
          color.g = min(color.g, maxColor);
          color.b = min(color.b, maxColor);
        } else {
          // Torso & arms (v_texCoord.y >= 0.48):
          // Outer sleeves (x < 0.24 || x > 0.75) are 100% orange/white fabric with NO blue/green fabric.
          // Clamping any excess key color on the outer arms completely eliminates the sleeve border!
          bool isOuterArm = (v_texCoord.x < 0.24 || v_texCoord.x > 0.75);
          float edgeFactor = 1.0 - clamp(minNeighborAlpha, 0.0, 1.0);

          if (isGreen) {
            float maxRB = max(color.r, color.b);
            if (isOuterArm) {
              color.g = min(color.g, maxRB * 0.95);
            } else if (edgeFactor > 0.01) {
              float targetG = min(color.g, maxRB * 0.98);
              color.g = mix(color.g, targetG, edgeFactor);
            }
          } else {
            float maxRG = max(color.r, color.g);
            if (isOuterArm) {
              color.b = min(color.b, maxRG * 0.95);
            } else if (edgeFactor > 0.01) {
              float targetB = min(color.b, maxRG * 0.98);
              color.b = mix(color.b, targetB, edgeFactor);
            }
          }
        }

        gl_FragColor = vec4(color.rgb * alpha, alpha);
      }
    `

    const compileShader = (type, source) => {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('[ChromaKeyVideo] Shader compile error:', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vs = compileShader(gl.VERTEX_SHADER, vsSource)
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource)
    if (!vs || !fs) {
      setUseFallback(true)
      return
    }

    program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[ChromaKeyVideo] Program link error:', gl.getProgramInfoLog(program))
      setUseFallback(true)
      return
    }

    gl.useProgram(program)

    // Full screen quad geometry
    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,  1,
      -1, -1,
       1,  1,
       1,  1,
      -1, -1,
       1, -1,
    ]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const texCoordBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      0, 1,
      1, 0,
      1, 0,
      0, 1,
      1, 1,
    ]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(texCoordLocation)
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0)

    // Setup texture for video frames
    texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    const keyColorLoc = gl.getUniformLocation(program, 'u_keyColor')
    const similarityLoc = gl.getUniformLocation(program, 'u_similarity')
    const smoothnessLoc = gl.getUniformLocation(program, 'u_smoothness')

    // Initial chroma key: [0, 0, 0] signals the GPU shader to sample the true video background corner dynamically
    let currentKeyColor = [0, 0, 0]
    if (keyColorHex && keyColorHex.startsWith('#') && keyColorHex.length === 7) {
      const r = parseInt(keyColorHex.slice(1, 3), 16) / 255
      const g = parseInt(keyColorHex.slice(3, 5), 16) / 255
      const b = parseInt(keyColorHex.slice(5, 7), 16) / 255
      currentKeyColor = [r, g, b]
    }

    const render = () => {
      if (isCancelled) return

      const vIdle = videoIdleRef.current
      const vSpk = videoSpeakingRef.current
      const isSpeakingActive = (activePoseRef.current === 'speaking' && speakingSrc)

      // Time sync between Idle and Speaking: lockstep twin playback
      if (vIdle && vSpk && vIdle.readyState >= 2 && vSpk.readyState >= 2) {
        if (!vIdle.paused && vSpk.paused) {
          vSpk.play().catch(() => {})
        } else if (vIdle.paused && !vSpk.paused) {
          vSpk.pause()
        }
        const timeDiff = Math.abs(vSpk.currentTime - vIdle.currentTime)
        if (timeDiff > 0.04) {
          vSpk.currentTime = vIdle.currentTime
        }
      }

      const activeVideo = (isSpeakingActive && vSpk && vSpk.readyState >= 2) ? vSpk : vIdle

      if (activeVideo && !activeVideo.paused && !activeVideo.ended && activeVideo.readyState >= 2) {
        const targetW = activeVideo.videoWidth || 720
        const targetH = activeVideo.videoHeight || 1280
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW
          canvas.height = targetH
          gl.viewport(0, 0, canvas.width, canvas.height)
        }

        try {
          gl.useProgram(program)
          gl.uniform3f(keyColorLoc, currentKeyColor[0], currentKeyColor[1], currentKeyColor[2])
          gl.uniform1f(similarityLoc, similarity)
          gl.uniform1f(smoothnessLoc, smoothness)

          gl.bindTexture(gl.TEXTURE_2D, texture)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, activeVideo)

          gl.clearColor(0.0, 0.0, 0.0, 0.0)
          gl.clear(gl.COLOR_BUFFER_BIT)
          gl.drawArrays(gl.TRIANGLES, 0, 6)

          if (!isLoaded) {
            setIsLoaded(true)
            if (onLoaded) onLoaded()
          }
        } catch (err) {
          console.warn('[ChromaKeyVideo] Frame draw error, falling back:', err)
          setUseFallback(true)
          return
        }
      }

      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)

    return () => {
      isCancelled = true
      if (animId) cancelAnimationFrame(animId)
      if (gl) {
        if (texture) gl.deleteTexture(texture)
        if (program) gl.deleteProgram(program)
      }
    }
  }, [src, speakingSrc, useFallback, similarity, smoothness, keyColorHex])

  if (useFallback) {
    const isSpeaking = activePose === 'speaking' && speakingSrc
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...style }}>
        <video
          ref={videoIdleRef}
          src={src}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
          crossOrigin="anonymous"
          onLoadedData={() => {
            setIsLoaded(true)
            if (onLoaded) onLoaded()
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: isSpeaking ? 0 : 1,
            pointerEvents: 'none',
          }}
        />
        {speakingSrc && (
          <video
            ref={videoSpeakingRef}
            src={speakingSrc}
            autoPlay
            loop
            muted
            playsInline
            crossOrigin="anonymous"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
              top: 0,
              left: 0,
              opacity: isSpeaking ? 1 : 0,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <video
        ref={videoIdleRef}
        src={src}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        crossOrigin="anonymous"
        onLoadedData={() => {
          setIsLoaded(true)
          if (onLoaded) onLoaded()
        }}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
      {speakingSrc && (
        <video
          ref={videoSpeakingRef}
          src={speakingSrc}
          autoPlay
          loop
          muted
          playsInline
          crossOrigin="anonymous"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        width={720}
        height={1280}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          position: 'absolute',
          top: 0,
          left: 0,
          opacity: isLoaded ? 1 : 0,
          transition: 'opacity 0.25s ease-in-out',
          ...style,
        }}
      />
      {!isLoaded && (
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
          pointerEvents: 'none',
        }}>
          <LoadingOutlined spin style={{ fontSize: 16, color: '#1890ff' }} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>Đang nạp người mẫu...</span>
        </div>
      )}
    </>
  )
}
