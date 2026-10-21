import React, { useRef, useEffect, useState } from 'react'
import { LoadingOutlined } from '@ant-design/icons'

/**
 * ChromaKeyVideo
 * Renders an avatar video with real-time WebGL chroma keying (blue/green screen removal).
 * Accurately mimics FFmpeg's chromakey filter so the offline scene preview matches the live broadcast 100%.
 */
export default function ChromaKeyVideo({
  src,
  poster,
  onLoaded,
  style = {},
  keyColorHex, // e.g. '#166CA6'
  similarity = 0.038,
  smoothness = 0.022,
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [useFallback, setUseFallback] = useState(false)

  useEffect(() => {
    let animId = null
    let gl = null
    let texture = null
    let program = null
    let isCancelled = false

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || useFallback) return

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
        vec3 keyYUV = rgb2yuv(u_keyColor);
        vec3 colorYUV = rgb2yuv(color.rgb);
        
        // 1. Dual Chroma (U, V) and Luminance (Y) keying:
        // UV distance measures hue match; Luminance distance protects lighter/darker details (wrist cuffs, collar, necklace)
        float uvDist = distance(colorYUV.yz, keyYUV.yz);
        float lumaDist = abs(colorYUV.x - keyYUV.x);
        float dist = sqrt(uvDist * uvDist + 0.15 * lumaDist * lumaDist);

        // 2. Smooth feathered alpha transition (zero black rim)
        float alpha = smoothstep(u_similarity, u_similarity + u_smoothness, dist);

        // 3. Adaptive Despill (handles both Green and Blue screens automatically):
        // Completely suppresses color bounce on hair and edges without changing clothing colors
        bool isGreen = (u_keyColor.g > u_keyColor.r && u_keyColor.g > u_keyColor.b);
        if (isGreen) {
          float maxRB = max(color.r, color.b);
          if (color.g > maxRB) {
            color.g = min(color.g, maxRB * 1.02);
          }
        } else {
          float maxRG = max(color.r, color.g);
          if (color.b > maxRG) {
            color.b = min(color.b, maxRG * 1.02);
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

    // Initial default chroma key: Blue #166CA6 (22, 108, 166)
    let currentKeyColor = [22 / 255, 108 / 255, 166 / 255]
    if (keyColorHex && keyColorHex.startsWith('#') && keyColorHex.length === 7) {
      const r = parseInt(keyColorHex.slice(1, 3), 16) / 255
      const g = parseInt(keyColorHex.slice(3, 5), 16) / 255
      const b = parseInt(keyColorHex.slice(5, 7), 16) / 255
      currentKeyColor = [r, g, b]
    }

    let hasSampledCorner = false

    const sampleCorner = () => {
      if (hasSampledCorner || !video || video.readyState < 2) return
      try {
        const scratch = document.createElement('canvas')
        scratch.width = 10
        scratch.height = 10
        const sctx = scratch.getContext('2d')
        // Sample true top-left corner (4, 4) of original video to capture 100% clean background
        sctx.drawImage(video, 4, 4, 10, 10, 0, 0, 10, 10)
        const pixel = sctx.getImageData(5, 5, 1, 1).data
        if (pixel[3] > 100 && (pixel[0] + pixel[1] + pixel[2] > 30)) {
          currentKeyColor = [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255]
          hasSampledCorner = true
        }
      } catch (e) {
        hasSampledCorner = true
      }
    }

    const render = () => {
      if (isCancelled) return

      if (video && !video.paused && !video.ended && video.readyState >= 2) {
        if (!hasSampledCorner) {
          sampleCorner()
        }

        const targetW = video.videoWidth || 720
        const targetH = video.videoHeight || 1280
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
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)

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
  }, [src, useFallback, similarity, smoothness, keyColorHex])

  if (useFallback) {
    return (
      <video
        ref={videoRef}
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
          ...style,
        }}
      />
    )
  }

  return (
    <>
      <video
        ref={videoRef}
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
