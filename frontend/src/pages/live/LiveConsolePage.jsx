import React, { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Select, Button, Form, Input, Timeline, Tag, Spin, Empty, message, Collapse, Typography, Space, Badge, Modal } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, StopOutlined, UserOutlined, SendOutlined, SyncOutlined, PlusOutlined } from '@ant-design/icons';
import api from '../../utils/api';
import { useLiveWebSocket } from '../../hooks/useLiveWebSocket';

const { Title, Text } = Typography;
const { Panel } = Collapse;

// ─── Status Utilities ────────────────────────────────────────────────────────
const getStatusColor = (status) => {
  switch (status) {
    case 'running': return 'green';
    case 'paused': return 'orange';
    case 'human_takeover': return 'purple';
    case 'stopped': return 'red';
    case 'ready': return 'blue';
    case 'error': return 'magenta';
    default: return 'default';
  }
};

const getStatusText = (status) => {
  switch (status) {
    case 'draft': return 'Bản nháp';
    case 'ready': return 'Sẵn sàng';
    case 'running': return 'Đang chạy';
    case 'paused': return 'Tạm dừng';
    case 'human_takeover': return 'Người kiểm soát';
    case 'stopped': return 'Đã dừng';
    case 'error': return 'Lỗi';
    default: return status;
  }
};

// ─── Colocated Components ──────────────────────────────────────────────────
const CreateSessionModal = ({ visible, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [deps, setDeps] = useState({ devices: [], products: [], agents: [] });

  useEffect(() => {
    if (visible) {
      // Fetch dependencies for dropdowns
      Promise.all([
        api.get('/live_sessions/devices/').catch(() => ({ data: [] })),
        api.get('/inventory/products/').catch(() => ({ data: [] })),
        api.get('/ai_agents/agents/').catch(() => ({ data: [] }))
      ]).then(([devRes, prodRes, agentRes]) => {
        setDeps({
          devices: Array.isArray(devRes.data) ? devRes.data : devRes.data.results || [],
          products: Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.results || [],
          agents: Array.isArray(agentRes.data) ? agentRes.data : agentRes.data.results || []
        });
      });
    }
  }, [visible]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const res = await api.post('/live_sessions/sessions/', values);
      message.success('Tạo phiên Live thành công');
      form.resetFields();
      onSuccess(res.data);
    } catch (err) {
      if (err.response) {
        message.error('Lỗi khi tạo phiên Live: ' + JSON.stringify(err.response.data));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Tạo Phiên Livestream Mới" open={visible} onCancel={onClose} onOk={handleCreate} confirmLoading={loading}>
      <Form form={form} layout="vertical">
        <Form.Item name="device" label="Thiết bị" rules={[{ required: true }]}>
          <Select placeholder="Chọn thiết bị">
            {deps.devices.map(d => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="product" label="Sản phẩm" rules={[{ required: true }]}>
          <Select placeholder="Chọn sản phẩm">
            {deps.products.map(p => <Select.Option key={p.id} value={p.id}>{p.code} - {p.name}</Select.Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="ai_agent" label="AI Agent" rules={[{ required: true }]}>
          <Select placeholder="Chọn AI Agent">
            {deps.agents.map(a => <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="platform" label="Nền tảng" rules={[{ required: true }]}>
          <Select placeholder="Chọn nền tảng">
            <Select.Option value="tiktok">TikTok</Select.Option>
            <Select.Option value="shopee">Shopee</Select.Option>
            <Select.Option value="custom">Custom/Web</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};

const SessionControls = ({ session, onStatusChange }) => {
  const [loading, setLoading] = useState(false);

  if (!session) return <Empty description="Chưa chọn phiên Live" />;

  const handleAction = async (action) => {
    setLoading(true);
    try {
      const res = await api.post(`/live_sessions/sessions/${session.id}/${action}/`);
      message.success(`Đã thực hiện lệnh: ${action}`);
      if (onStatusChange && res.data.status) {
        onStatusChange(res.data.status);
      }
    } catch (err) {
      message.error(`Lỗi khi thực hiện lệnh ${action}`);
    } finally {
      setLoading(false);
    }
  };

  const status = session.status;
  
  return (
    <Space wrap>
      <Button 
        type="primary" 
        icon={<PlayCircleOutlined />} 
        loading={loading}
        disabled={!['draft', 'ready'].includes(status)}
        onClick={() => handleAction('start')}
      >
        START
      </Button>
      <Button 
        icon={<PauseCircleOutlined />} 
        loading={loading}
        disabled={status !== 'running'}
        onClick={() => handleAction('pause')}
      >
        PAUSE
      </Button>
      <Button 
        icon={<PlayCircleOutlined />} 
        loading={loading}
        disabled={!['paused', 'human_takeover'].includes(status)}
        onClick={() => handleAction('resume')}
      >
        RESUME
      </Button>
      <Button 
        icon={<UserOutlined />} 
        loading={loading}
        disabled={status !== 'running'}
        onClick={() => handleAction('human-takeover')}
      >
        HUMAN TAKEOVER
      </Button>
      <Button 
        danger 
        icon={<StopOutlined />} 
        loading={loading}
        disabled={['stopped', 'error'].includes(status)}
        onClick={() => handleAction('stop')}
      >
        STOP
      </Button>
    </Space>
  );
};

const SyntheticCommentPanel = ({ sessionId }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    if (!sessionId) {
      message.warning('Vui lòng chọn một phiên Live trước!');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/live_sessions/sessions/${sessionId}/test-comment/`, {
        content: values.content
      });
      message.success('Đã gửi tin nhắn mô phỏng thành công');
      form.resetFields();
    } catch (err) {
      message.error('Lỗi khi gửi tin nhắn mô phỏng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} onFinish={onFinish} layout="inline">
      <Form.Item name="content" rules={[{ required: true, message: 'Nhập nội dung' }]} style={{ flex: 1 }}>
        <Input placeholder="Nhập tin nhắn khách hàng mô phỏng..." disabled={!sessionId} />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={loading} disabled={!sessionId}>
          Gửi Command
        </Button>
      </Form.Item>
    </Form>
  );
};

const LiveEventTimeline = ({ events }) => {
  if (!events || events.length === 0) {
    return <Empty description="Chưa có sự kiện nào được ghi nhận" />;
  }

  const renderEventContent = (eventObj) => {
    const type = eventObj.type || eventObj.event_type || 'unknown_event';
    const payload = eventObj.payload || eventObj.data || {};
    
    let color = 'blue';
    let title = type;
    let details = null;

    if (type.includes('error')) color = 'red';
    else if (type.includes('completed')) color = 'green';
    else if (type.includes('received')) color = 'cyan';
    
    if (type === 'live.ai.completed') {
      details = (
        <div style={{ marginTop: 8 }}>
          <Text strong>Intent:</Text> {payload.intent} <br />
          <Text strong>Action:</Text> {payload.action} <br />
          <Text strong>Reply:</Text> {payload.reply_text}
        </div>
      );
    } else if (type.includes('error')) {
      details = <Text type="danger">{payload.error || payload.message || JSON.stringify(payload)}</Text>;
    }

    return (
      <Timeline.Item color={color} key={eventObj.message_id || Math.random().toString()}>
        <div style={{ marginBottom: 4 }}>
          <Text strong>{title}</Text>
          {eventObj.timestamp && (
            <Text type="secondary" style={{ marginLeft: 8, fontSize: '12px' }}>
              {new Date(eventObj.timestamp).toLocaleTimeString()}
            </Text>
          )}
        </div>
        
        {details}
        
        <Collapse ghost size="small" style={{ marginTop: 4 }}>
          <Panel header="Raw Payload" key="1">
            <pre style={{ fontSize: '11px', background: '#f5f5f5', padding: 8, borderRadius: 4, margin: 0, overflowX: 'auto' }}>
              {JSON.stringify(payload, null, 2)}
            </pre>
          </Panel>
        </Collapse>
      </Timeline.Item>
    );
  };

  return (
    <Timeline mode="left" style={{ marginTop: 24 }}>
      {[...events].reverse().map(renderEventContent)}
    </Timeline>
  );
};

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function LiveConsolePage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/live_sessions/sessions/');
      const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      setSessions(data);
    } catch (err) {
      message.error('Không thể tải danh sách phiên Live');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const selectedSession = useMemo(() => {
    return sessions.find(s => s.id === selectedSessionId);
  }, [sessions, selectedSessionId]);

  const { connected, events, reconnect } = useLiveWebSocket(selectedSessionId);

  const handleStatusChange = (newStatus) => {
    setSessions(prev => prev.map(s => s.id === selectedSessionId ? { ...s, status: newStatus } : s));
  };

  const handleCreateSuccess = (newSession) => {
    setCreateModalVisible(false);
    fetchSessions().then(() => {
      setSelectedSessionId(newSession.id);
    });
  };

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>Live Test Console</Title>
      
      <CreateSessionModal 
        visible={createModalVisible} 
        onClose={() => setCreateModalVisible(false)} 
        onSuccess={handleCreateSuccess} 
      />

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={14}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            
            <Card 
              title="Cấu hình Phiên" 
              size="small" 
              extra={
                <Space>
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>Tạo mới</Button>
                  <Button type="text" icon={<SyncOutlined />} onClick={fetchSessions} />
                </Space>
              }
            >
              <Form layout="vertical">
                <Form.Item label="Chọn Phiên Livestream">
                  <Select
                    placeholder="-- Chọn Live Session --"
                    loading={loading}
                    value={selectedSessionId}
                    onChange={(val) => setSelectedSessionId(val)}
                    options={sessions.map(s => ({
                      label: `${s.id} - ${getStatusText(s.status)}`,
                      value: s.id
                    }))}
                  />
                </Form.Item>
              </Form>
              
              {selectedSession && (
                <div style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
                  <Row gutter={[16, 16]}>
                    <Col span={12}><Text type="secondary">ID:</Text> <Text strong>{selectedSession.id.substring(0,8)}...</Text></Col>
                    <Col span={12}><Text type="secondary">Nền tảng:</Text> <Text strong>{selectedSession.platform}</Text></Col>
                    <Col span={12}><Text type="secondary">Thiết bị (ID):</Text> <Text strong>{selectedSession.device}</Text></Col>
                    <Col span={12}><Text type="secondary">AI Agent (ID):</Text> <Text strong>{selectedSession.ai_agent}</Text></Col>
                    <Col span={24}>
                      <Text type="secondary">Trạng thái:</Text>{' '}
                      <Tag color={getStatusColor(selectedSession.status)}>{getStatusText(selectedSession.status)}</Tag>
                    </Col>
                  </Row>
                </div>
              )}
            </Card>

            <Card title="Điều khiển Phiên (REST API)" size="small">
              <SessionControls session={selectedSession} onStatusChange={handleStatusChange} />
            </Card>

            <Card title="Bơm Comment Giả lập (Test)" size="small">
              <SyntheticCommentPanel sessionId={selectedSessionId} />
            </Card>
          </Space>
        </Col>

        <Col xs={24} lg={10}>
          <Card 
            title="Real-time Event Timeline" 
            size="small"
            extra={
              <Space>
                <Badge status={connected ? "success" : (selectedSessionId ? "error" : "default")} text={connected ? "Connected" : "Disconnected"} />
                {selectedSessionId && <Button size="small" onClick={reconnect}>Reconnect</Button>}
              </Space>
            }
            styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' } }}
          >
            <LiveEventTimeline events={events} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
