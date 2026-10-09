import React, { useState, useEffect, useRef } from 'react'
import { Card, Typography, Avatar, Space } from 'antd'
import { UserOutlined } from '@ant-design/icons'

const { Text } = Typography
const MAX_COMMENTS = 100 // Bounded client-side list

export default function LiveChat({ lastEvent }) {
  const [comments, setComments] = useState([])
  const listRef = useRef(null)
  
  // Auto-scroll to bottom behavior
  const scrollToBottom = () => {
    if (listRef.current) {
      const scrollElement = listRef.current.querySelector('.ant-list-items')
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight
      }
    }
  }

  useEffect(() => {
    if (!lastEvent || lastEvent.event_type !== 'live.comment.received') return

    setComments(prev => {
      const newComment = {
        id: lastEvent.correlation_id || `comment-${Date.now()}`,
        username: lastEvent.payload?.username || 'Viewer',
        text: lastEvent.payload?.text || '',
        timestamp: lastEvent.timestamp || new Date().toISOString()
      }
      
      const updated = [...prev, newComment]
      if (updated.length > MAX_COMMENTS) {
        return updated.slice(updated.length - MAX_COMMENTS)
      }
      return updated
    })
  }, [lastEvent])

  // Scroll on new comments
  useEffect(() => {
    scrollToBottom()
  }, [comments])

  return (
    <Card 
      title="LIVE CHAT & PRODUCTS" 
      size="small"
      style={{ height: '100%', borderRadius: 12, display: 'flex', flexDirection: 'column' }}
      styles={{ body: { flex: 1, overflow: 'hidden', padding: 0 } }}
    >
      <div 
        ref={listRef} 
        style={{ 
          height: '100%', 
          overflowY: 'auto', 
          padding: '12px 16px' 
        }}
      >
        {comments.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#8c8c8c', padding: '20px 0' }}>Chưa có bình luận nào.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {comments.map((item, idx) => (
              <div key={idx} style={{ padding: '8px 0' }}>
                <Space align="start" size={12}>
                  <Avatar size="small" icon={<UserOutlined />} />
                  <div>
                    <Text strong style={{ fontSize: 13, marginRight: 8, color: '#1890ff' }}>
                      {item.username}
                    </Text>
                    <Text style={{ fontSize: 14 }}>{item.text}</Text>
                  </div>
                </Space>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
