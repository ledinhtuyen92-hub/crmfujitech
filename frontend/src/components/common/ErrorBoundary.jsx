import React from 'react'
import { Result, Button } from 'antd'
import { WarningOutlined, ReloadOutlined } from '@ant-design/icons'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: 24,
          }}
        >
          <Result
            status="warning"
            icon={<WarningOutlined style={{ color: '#f59e0b', fontSize: 64 }} />}
            title="Đã xảy ra sự cố hiển thị"
            subTitle="Giao diện gặp lỗi trong quá trình xử lý dữ liệu. Bạn có thể tải lại trang để tiếp tục."
            extra={[
              <Button
                type="primary"
                key="reload"
                icon={<ReloadOutlined />}
                onClick={this.handleReload}
                style={{ background: '#2563eb' }}
              >
                Tải lại trang
              </Button>,
              <Button key="reset" onClick={this.handleReset}>
                Thử lại
              </Button>,
            ]}
          />
        </div>
      )
    }

    return this.props.children
  }
}

