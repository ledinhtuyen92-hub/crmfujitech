import React from 'react'
import { Card, Typography } from 'antd'
import { VideoCameraOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

export default function VideoPreview() {
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
      }}
      bodyStyle={{ textAlign: 'center', width: '100%' }}
    >
      <VideoCameraOutlined style={{ fontSize: 64, color: '#434343', marginBottom: 16 }} />
      <div>
        <Title level={4} style={{ color: '#8c8c8c', margin: 0 }}>
          STREAM PREVIEW
        </Title>
        <Text type="secondary" style={{ color: '#595959' }}>
          (Phase 1H Integration Placeholder)
        </Text>
      </div>
    </Card>
  )
}
