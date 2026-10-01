import React, { useState } from 'react'
import { Card, Typography, Spin } from 'antd'
import { VideoCameraOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

export default function VideoPreview({ session }) {
  const [iframeError, setIframeError] = useState(false)

  // Use a predictable local MediaMTX path based on session.id, or generic 'live' if undefined
  const streamPath = session?.id ? `session_${session.id}` : 'live'
  const whepUrl = `http://localhost:8889/${streamPath}/`

  // Only attempt to show preview if the session is running or in human takeover
  const isLive = session?.status === 'running' || session?.status === 'human_takeover'

  const renderPlaceholder = (message, subMessage) => (
    <div style={{ textAlign: 'center', width: '100%', padding: '20px' }}>
      <VideoCameraOutlined style={{ fontSize: 64, color: '#434343', marginBottom: 16 }} />
      <div>
        <Title level={4} style={{ color: '#8c8c8c', margin: 0 }}>
          {message}
        </Title>
        <Text type="secondary" style={{ color: '#595959' }}>
          {subMessage}
        </Text>
      </div>
    </div>
  )

  return (
    <Card
      style={{
        height: '100%',
        minHeight: 500,
        backgroundColor: '#000',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        overflow: 'hidden',
      }}
      bodyStyle={{ textAlign: 'center', width: '100%', padding: 0, height: '100%' }}
    >
      {!isLive ? (
        renderPlaceholder('STREAM PREVIEW', 'Chưa bắt đầu')
      ) : iframeError ? (
        renderPlaceholder('PREVIEW UNAVAILABLE', 'Không thể kết nối đến luồng Video')
      ) : (
        <iframe
          src={whepUrl}
          title="WebRTC Preview"
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="autoplay; fullscreen"
          onError={() => setIframeError(true)}
        />
      )}
    </Card>
  )
}
