import React from 'react'
import { Card, Typography, Result, Button } from 'antd'
import { VideoCameraOutlined, ExperimentOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const { Title, Text } = Typography

export default function LiveStudioBeta() {
  const navigate = useNavigate()

  return (
    <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
      <Card style={{ width: '100%', maxWidth: 800, textAlign: 'center', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <Result
          icon={<ExperimentOutlined style={{ color: '#1649c9' }} />}
          title={<Title level={2}>Live Studio (Beta)</Title>}
          subTitle={
            <div style={{ maxWidth: 500, margin: '0 auto' }}>
              <Text type="secondary" style={{ fontSize: 16 }}>
                Giao diện điều khiển luồng phát trực tiếp (Live Studio) hiện đang trong quá trình thử nghiệm (Beta).
                Tính năng này sẽ cung cấp một môi trường tương tác thời gian thực với AI Agent, quản lý bình luận và giám sát trạng thái phần cứng.
              </Text>
            </div>
          }
          extra={[
            <Button 
              type="primary" 
              key="sessions" 
              icon={<VideoCameraOutlined />}
              onClick={() => navigate('/live/sessions')}
              size="large"
            >
              Quản lý Phiên Livestream
            </Button>
          ]}
        />
        
        <div style={{ marginTop: 48, padding: 24, background: '#fafafa', borderRadius: 8, textAlign: 'left' }}>
          <Title level={5}>Sắp ra mắt:</Title>
          <ul style={{ color: '#595959', lineHeight: '2' }}>
            <li><b>Real-time Video Feed:</b> Xem trực tiếp luồng phát (WebRTC/HLS) với độ trễ siêu thấp.</li>
            <li><b>AI Copilot:</b> Giám sát và can thiệp thủ công vào kịch bản phản hồi của AI.</li>
            <li><b>Comment Moderation:</b> Quản lý, ghim, hoặc ẩn bình luận đa nền tảng trong một màn hình.</li>
            <li><b>Hardware Metrics:</b> Theo dõi trạng thái OBS/Thiết bị ảo (CPU, RAM, Bitrate).</li>
          </ul>
        </div>
      </Card>
    </div>
  )
}
