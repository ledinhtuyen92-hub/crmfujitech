import React, { useState, useEffect, useRef } from 'react'
import { Card, Typography, Avatar, Space, Input, Button, Tag, message } from 'antd'
import { UserOutlined, SendOutlined, CommentOutlined, ThunderboltFilled } from '@ant-design/icons'
import api from '../../../utils/api'

const { Text } = Typography
const MAX_COMMENTS = 100 // Bounded client-side list

const QUICK_TEST_COMMENTS = [
  'Khóa này giá bao nhiêu shop?',
  'Có bảo hành chính hãng không?',
  'Khóa này lắp cho cửa gỗ hay cửa nhôm?',
  'Có miễn phí vận chuyển không shop?',
]

export default function LiveChat({ lastEvent, sessionId }) {
  const [comments, setComments] = useState([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)
  
  // Auto-scroll to bottom behavior
  const scrollToBottom = () => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
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

  const handleSendTestComment = async (textToSend) => {
    const text = (typeof textToSend === 'string' ? textToSend : inputText).trim()
    if (!text) {
      message.warning('Vui lòng nhập nội dung bình luận thử nghiệm')
      return
    }
    if (!sessionId) {
      message.error('Không tìm thấy ID phiên live')
      return
    }

    setSending(true)
    try {
      await api.post(`/live_sessions/sessions/${sessionId}/test-comment/`, { content: text })
      setInputText('')
      // Thêm trực tiếp vào danh sách chat để hiển thị tức thì
      setComments(prev => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          username: 'Bạn (Thử nghiệm)',
          text: text,
          timestamp: new Date().toISOString(),
          isTest: true,
        }
      ])
      message.success('Đã gửi câu hỏi! AI đang soạn câu trả lời và tư vấn...')
    } catch (err) {
      console.error('Failed to send test comment:', err)
      message.error('Không thể gửi bình luận thử nghiệm. Vui lòng kiểm tra lại kết nối.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card 
      title={
        <Space size={8}>
          <CommentOutlined style={{ color: '#1890ff' }} />
          <span>LIVE CHAT & TƯ VẤN</span>
          {comments.length > 0 && (
            <Tag color="blue" style={{ borderRadius: 10, fontSize: 11, padding: '0 6px' }}>
              {comments.length}
            </Tag>
          )}
        </Space>
      }
      size="small"
      style={{ height: '100%', borderRadius: 12, display: 'flex', flexDirection: 'column' }}
      styles={{ body: { flex: 1, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' } }}
    >
      {/* Comments List */}
      <div 
        ref={listRef} 
        style={{ 
          flex: 1,
          overflowY: 'auto', 
          padding: '12px 16px',
          minHeight: 220,
        }}
      >
        {comments.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#8c8c8c', padding: '36px 16px' }}>
            <CommentOutlined style={{ fontSize: 32, marginBottom: 10, color: '#bfbfbf' }} />
            <div style={{ fontWeight: 500, color: '#374151', fontSize: 13 }}>Chưa có bình luận nào</div>
            <div style={{ fontSize: 12, marginTop: 4, color: '#6b7280' }}>
              Bấm vào các câu hỏi gợi ý bên dưới để thử nghiệm AI tư vấn trực tiếp!
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comments.map((item, idx) => (
              <div 
                key={idx} 
                style={{ 
                  padding: '9px 12px', 
                  borderRadius: 8, 
                  backgroundColor: item.isTest ? '#eff6ff' : '#f9fafb',
                  border: item.isTest ? '1px solid #bfdbfe' : '1px solid #e5e7eb',
                }}
              >
                <Space align="start" size={10} style={{ width: '100%' }}>
                  <Avatar 
                    size="small" 
                    icon={<UserOutlined />} 
                    style={{ backgroundColor: item.isTest ? '#2563eb' : '#7c3aed' }} 
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Space size={6}>
                        <Text strong style={{ fontSize: 12, color: item.isTest ? '#1d4ed8' : '#1f2937' }}>
                          {item.username}
                        </Text>
                        {item.isTest && (
                          <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 5px', margin: 0, borderRadius: 4 }}>
                            Test
                          </Tag>
                        )}
                      </Space>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <Text style={{ fontSize: 13, color: '#111827', marginTop: 4, display: 'block', wordBreak: 'break-word', lineHeight: 1.45 }}>
                      {item.text}
                    </Text>
                  </div>
                </Space>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Test Prompt Suggestions */}
      <div style={{ 
        padding: '10px 14px', 
        backgroundColor: '#f8fafc', 
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space size={6}>
            <ThunderboltFilled style={{ color: '#f59e0b', fontSize: 13 }} />
            <Text strong style={{ fontSize: 12, color: '#1e293b' }}>
              Gợi ý câu hỏi thử nghiệm AI:
            </Text>
          </Space>
          <span style={{ fontSize: 11, color: '#64748b' }}>Bấm để gửi nhanh</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_TEST_COMMENTS.map((q, idx) => (
            <button 
              key={idx}
              type="button"
              disabled={sending}
              style={{ 
                cursor: 'pointer', 
                fontSize: 12, 
                fontWeight: 500,
                padding: '5px 11px',
                borderRadius: 16,
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0284c7',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                transition: 'all 0.15s ease',
                textAlign: 'left',
                lineHeight: 1.3
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0284c7'
                e.currentTarget.style.backgroundColor = '#f0f9ff'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#cbd5e1'
                e.currentTarget.style.backgroundColor = '#ffffff'
                e.currentTarget.style.transform = 'none'
              }}
              onClick={() => handleSendTestComment(q)}
            >
              💬 {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input box to send test comments */}
      <div style={{ 
        padding: '10px 14px', 
        backgroundColor: '#ffffff', 
        borderTop: '1px solid #e2e8f0' 
      }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="Nhập câu hỏi test để AI tư vấn..."
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onPressEnter={() => handleSendTestComment()}
            disabled={sending}
            maxLength={200}
            style={{ 
              backgroundColor: '#ffffff', 
              color: '#111827',
              borderColor: '#cbd5e1',
              borderRadius: '6px 0 0 6px',
            }}
          />
          <Button 
            type="primary" 
            icon={<SendOutlined />} 
            loading={sending}
            onClick={() => handleSendTestComment()}
            style={{ borderRadius: '0 6px 6px 0', fontWeight: 500 }}
          >
            Gửi
          </Button>
        </Space.Compact>
      </div>
    </Card>
  )
}
