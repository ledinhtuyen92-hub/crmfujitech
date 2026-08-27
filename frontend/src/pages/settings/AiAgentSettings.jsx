import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Switch, message, Space, Typography, Tag, Collapse, Row, Col, Divider, Alert, Slider, Tooltip, Segmented, Radio, List } from 'antd';
import { PlusOutlined, EditOutlined, RobotOutlined, SettingOutlined, KeyOutlined, SyncOutlined, InfoCircleOutlined, ThunderboltOutlined, DeleteOutlined, BookOutlined } from '@ant-design/icons';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';

const { Title, Text } = Typography;
const { Panel } = Collapse;

export default function AiAgentSettings() {
  const { hasPermission } = useAuth();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [form] = Form.useForm();
  // Template mặc định lấy từ Backend (Single Source of Truth - chỉ sửa tại services.py)
  const [defaultJsonTemplate, setDefaultJsonTemplate] = useState('');
  const DEFAULT_CORE_SYSTEM_RULES = `Nhiệm vụ của bạn là tư vấn tận tình, chuyên nghiệp và hỗ trợ khách hàng.
NGUYÊN TẮC QUAN TRỌNG: 
1. Tuyệt đối KHÔNG gọi đích danh tên khách hàng trong câu trả lời. Chỉ xưng hô chung là "anh" hoặc "chị" (tự suy đoán giới tính hoặc dùng "anh/chị").
2. Luôn ưu tiên trả lời TRỰC TIẾP vào câu hỏi cuối cùng hoặc HÌNH ẢNH cuối cùng khách gửi. Nếu khách gửi ảnh, phải tập trung tư vấn về sản phẩm trong ảnh (dựa vào RAG Context) thay vì bị phân tâm bởi các sản phẩm ở tin nhắn cũ.
3. KHÔNG XIN SỐ ĐIỆN THOẠI liên tục. Chỉ khéo léo xin SĐT khi khách hàng đã thực sự quan tâm, ưng ý sản phẩm.
4. Luôn duy trì cuộc hội thoại bằng cách đặt CÂU HỎI MỞ ở cuối câu trả lời để kích thích khách hàng tương tác (hỏi về sở thích, màu sắc, kích thước, nhu cầu...).
5. DỪNG ĐÚNG LÚC DỰA VÀO NGỮ CẢNH: AI luôn được cung cấp lịch sử chat. Hãy tự phân tích: Nếu tin nhắn cuối của khách chỉ là lời xác nhận ngắn ('Ok', 'Cảm ơn', 'Vâng') hoặc thả tim/like (👍) VÀ bối cảnh trước đó cho thấy cuộc trò chuyện đã kết thúc (bạn đã chào tạm biệt, hứa chuyển thông tin cho Sale, v.v.), hãy điền "[STOP]" vào trường "reply" để giữ im lặng. Tuy nhiên, nếu khách nói 'Ok' mang ý nghĩa đồng ý để chuyển sang bước tiếp theo hoặc vẫn đang trong quá trình tư vấn, hãy tiếp tục trả lời bình thường.`;
  const [defaultCoreSystemRules, setDefaultCoreSystemRules] = useState(DEFAULT_CORE_SYSTEM_RULES);

  useEffect(() => {
    api.get('/ai_agents/agents/default-prompt/').then(res => {
      setDefaultJsonTemplate(res.data.template);
      if (res.data.core_system_rules) {
        setDefaultCoreSystemRules(res.data.core_system_rules);
      }
    }).catch(() => {});
  }, []);
  
  // Company API Settings
  const [companySettings, setCompanySettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [availableProviders, setAvailableProviders] = useState([]);
  const [settingsForm] = Form.useForm();
  
  // Dynamic model fetching
  const [fetchedModels, setFetchedModels] = useState([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedKey, setFetchedKey] = useState("");
  // Company AI Keys (Custom Keys)
  const [keys, setKeys] = useState([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keyModalVisible, setKeyModalVisible] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [keyForm] = Form.useForm();
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  
  // Pricing
  const [pricings, setPricings] = useState([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [syncingPricing, setSyncingPricing] = useState(false);
  const [pricingSearch, setPricingSearch] = useState('');
  const [statsPeriod, setStatsPeriod] = useState('month');
  
  const fetchPricings = async () => {
    setPricingLoading(true);
    try {
      const res = await api.get('ai_agents/pricing/');
      setPricings(Array.isArray(res.data) ? res.data : res.data?.results ?? []);
    } catch (error) {
      console.error(error);
    } finally {
      setPricingLoading(false);
    }
  };
  
  const handleSyncPricing = async () => {
    setSyncingPricing(true);
    try {
      const res = await api.post('ai_agents/pricing/sync/');
      message.success(`Đã đồng bộ thành công! Tạo mới ${res.data.created}, Cập nhật ${res.data.updated} models.`);
      fetchPricings();
    } catch (error) {
      message.error('Lỗi khi đồng bộ giá từ LiteLLM');
    } finally {
      setSyncingPricing(false);
    }
  };
  
  const handleResetPricing = async (id) => {
    try {
      await api.post(`ai_agents/pricing/${id}/reset/`);
      message.success('Đã khôi phục giá về mặc định (sẽ tự động cập nhật trong lần sync tới).');
      fetchPricings();
    } catch (error) {
      message.error('Lỗi khi khôi phục giá');
    }
  };
  
  const handleSavePricing = async (record) => {
    try {
      await api.put(`ai_agents/pricing/${record.id}/`, record);
      message.success('Đã lưu cấu hình giá.');
      fetchPricings();
    } catch (error) {
      message.error('Lỗi khi lưu cấu hình giá');
    }
  };

  const handleDeletePricing = async (id) => {
    try {
      await api.delete(`ai_agents/pricing/${id}/`);
      message.success('Đã xóa model khỏi bảng giá.');
      fetchPricings();
    } catch (error) {
      message.error('Lỗi khi xóa bảng giá');
    }
  };

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('ai_agents/agents/');
      setAgents(Array.isArray(data) ? data : data.results || []);
    } catch (error) {
      message.error('Không thể tải danh sách Trợ lý AI.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableProviders = async () => {
    try {
      const { data } = await api.get('ai_agents/settings/available_providers/');
      setAvailableProviders(data.available_providers || []);
    } catch (error) {
      console.error('Lỗi khi tải danh sách nhà cung cấp có sẵn', error);
    }
  };

  const fetchCompanySettings = async () => {
    setSettingsLoading(true);
    try {
      const { data } = await api.get('ai_agents/settings/mine/');
      setCompanySettings(data);
      settingsForm.setFieldsValue(data);
    } catch (error) {
      console.error(error);
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await api.get(`ai_agents/agents/usage_stats/?period=${statsPeriod}`);
      setStats(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleResetStats = () => {
    Modal.confirm({
      title: 'Xác nhận thiết lập lại',
      content: 'Bạn có chắc chắn muốn xoá toàn bộ thống kê chi phí AI? Dữ liệu đã xoá sẽ không thể khôi phục.',
      okText: 'Xoá thống kê',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await api.post('ai_agents/agents/reset_usage_stats/');
          message.success('Đã làm mới thống kê chi phí.');
          fetchStats();
        } catch (error) {
          message.error('Không thể làm mới thống kê.');
        }
      }
    });
  };


  const handleFetchModels = async (provider) => {
    if (!provider) return;
    setFetchingModels(true);
    setFetchedModels([]);
    setFetchedKey("");
    try {
      const { data } = await api.get(`ai_agents/settings/fetch_models/?provider=${provider}`);
      if (data.models && data.models.length > 0) {
        setFetchedModels(data.models);
        setFetchedKey(data.used_key || "");
        message.success(`✅ Lấy được ${data.count} mô hình từ API Key (${data.used_key})!`);
      } else {
        message.warning('Không tìm thấy mô hình nào hợp lệ.');
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Lỗi khi kết nối tới nhà cung cấp.';
      message.error(`❌ ${errMsg}`);
    } finally {
      setFetchingModels(false);
    }
  };



  const fetchKeys = async () => {
    setKeysLoading(true);
    try {
      const res = await api.get('ai_agents/company-keys/');
      setKeys(Array.isArray(res.data) ? res.data : res.data?.results ?? []);
    } catch (error) {
      message.error('Lỗi khi tải danh sách API Key cá nhân');
    } finally {
      setKeysLoading(false);
    }
  };

  const handleOpenKeyModal = (record = null) => {
    setEditingKey(record);
    if (record) {
      keyForm.setFieldsValue(record);
    } else {
      keyForm.resetFields();
      keyForm.setFieldsValue({ provider: 'openai', is_active: true, priority: 0 });
    }
    setKeyModalVisible(true);
  };

  const handleSaveKey = async (values) => {
    try {
      if (editingKey) {
        await api.put(`ai_agents/company-keys/${editingKey.id}/`, values);
        message.success('Cập nhật API Key thành công');
      } else {
        await api.post('ai_agents/company-keys/', values);
        message.success('Thêm API Key thành công');
      }
      setKeyModalVisible(false);
      fetchKeys();
      fetchAvailableProviders();
    } catch (error) {
      message.error('Có lỗi xảy ra khi lưu API Key');
    }
  };

  const handleDeleteKey = async (id) => {
    try {
      await api.delete(`ai_agents/company-keys/${id}/`);
      message.success('Đã xóa API Key');
      fetchKeys();
      fetchAvailableProviders();
    } catch (error) {
      message.error('Lỗi khi xóa API Key');
    }
  };

  const keyColumns = [
    { title: 'Nhà cung cấp', dataIndex: 'provider', key: 'provider', render: (t) => <Tag color='blue'>{t?.toUpperCase()}</Tag> },
    { title: 'API Key', dataIndex: 'api_key', key: 'api_key', render: (t) => <Text>{t?.substring(0, 8)}...{t?.slice(-4)}</Text> },
    { title: 'Độ ưu tiên', dataIndex: 'priority', key: 'priority' },
    { title: 'Trạng thái', dataIndex: 'is_active', key: 'is_active', render: (isActive) => isActive ? <Tag color='green'>Đang hoạt động</Tag> : <Tag color='red'>Tạm ngưng</Tag> },
    { title: 'Thao tác', key: 'actions', render: (_, record) => (
      <Space>
        <Button type='text' icon={<EditOutlined />} onClick={() => handleOpenKeyModal(record)} />
        <Button type='text' danger icon={<DeleteOutlined />} onClick={() => handleDeleteKey(record.id)} />
      </Space>
    ) }
  ];

  const handleSaveCompanySettings = async (values) => {
    setSettingsLoading(true);
    try {
      await api.put('ai_agents/settings/mine/', values);
      message.success('Cập nhật cấu hình API Key thành công.');
      fetchCompanySettings();
      fetchAvailableProviders();
    } catch (error) {
      message.error('Lỗi khi lưu cấu hình API Key.');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleOpenModal = async (agent = null) => {
    setEditingAgent(agent);

    // Luôn lấy template mới nhất từ Backend trước khi điền vào form
    let currentTemplate = defaultJsonTemplate;
    let currentSystemRules = defaultCoreSystemRules;
    try {
      const res = await api.get('/ai_agents/agents/default-prompt/');
      currentTemplate = res.data.template;
      currentSystemRules = res.data.core_system_rules;
      setDefaultJsonTemplate(currentTemplate);
      setDefaultCoreSystemRules(currentSystemRules);
    } catch (e) {}

    if (agent) {
      form.setFieldsValue({
        ...agent,
        core_prompt_template: agent.core_prompt_template || currentTemplate,
        core_system_rules: agent.core_system_rules || currentSystemRules
      });
    } else {
      form.resetFields();
      
      const defaultProvider = availableProviders.length > 0 ? availableProviders[0] : null;
      let defaultModel = undefined;
      
      if (defaultProvider === 'openai') defaultModel = 'gpt-4o-mini';
      else if (defaultProvider === 'gemini') defaultModel = 'gemini-2.5-flash';
      else if (defaultProvider === 'anthropic') defaultModel = 'claude-3-5-sonnet';

      form.setFieldsValue({ 
        provider: defaultProvider,
        model_name: defaultModel, 
        temperature: 0.7, 
        is_active: true, 
        enable_auto_summary: true, 
        enable_human_typing: false, 
        enable_auto_tagging: false, 
        enable_drip_followup: false,
        drip_followup_hours: 24,
        debounce_delay: 4,
        core_prompt_template: currentTemplate,
        core_system_rules: currentSystemRules
      });
    }
    setModalVisible(true);
  };

  const handleSave = async (values) => {
    try {
      if (editingAgent) {
        await api.put(`ai_agents/agents/${editingAgent.id}/`, values);
        message.success('Cập nhật thành công.');
      } else {
        await api.post('ai_agents/agents/', values);
        message.success('Tạo Trợ lý AI thành công.');
      }
      setModalVisible(false);
      fetchAgents();
    } catch (error) {
      let errMsg = 'Có lỗi xảy ra khi lưu.';
      const data = error.response?.data;
      if (data) {
        if (Array.isArray(data.model_name)) {
          errMsg = data.model_name[0];
        } else if (typeof data.model_name === 'string') {
          errMsg = data.model_name;
        } else if (data.error) {
          errMsg = data.error;
        }
      }
      message.error(errMsg);
    }
  };

  const columns = [
    { title: 'Tên Trợ lý AI', dataIndex: 'name', key: 'name', render: (t) => <Text strong><RobotOutlined /> {t}</Text> },
    { title: 'Nền tảng', dataIndex: 'provider', key: 'provider', render: (t) => <Tag color='purple'>{t?.toUpperCase()}</Tag> },
    { title: 'Mô hình', dataIndex: 'model_name', key: 'model_name', render: (t) => <Tag color='blue'>{t}</Tag> },
    { title: 'Trạng thái', dataIndex: 'is_active', key: 'is_active', render: (isActive) => isActive ? <Tag color='green'>Đang hoạt động</Tag> : <Tag color='red'>Đã tắt</Tag> },
    { title: 'Thao tác', key: 'actions', render: (_, record) => (
      <Space>
        <Button type='text' icon={<EditOutlined />} onClick={() => handleOpenModal(record)} />
      </Space>
    ) }
  ];

  const pricingColumns = [
    { title: 'Hãng', dataIndex: 'provider', key: 'provider', render: (t) => <Tag color='purple'>{t?.toUpperCase()}</Tag> },
    { title: 'Tên Mô Hình', dataIndex: 'model_name', key: 'model_name', render: (t) => <Text strong>{t}</Text> },
    { title: 'Input Price / 1M', dataIndex: 'input_price_per_1m', key: 'input_price_per_1m', render: (val, record) => (
      <InputNumber 
        prefix="$" 
        size="small" 
        value={val} 
        precision={6}
        step={0.01}
        onChange={(v) => { record.input_price_per_1m = v; }}
        onBlur={() => { record.is_custom = true; handleSavePricing(record); }}
      />
    )},
    { title: 'Output Price / 1M', dataIndex: 'output_price_per_1m', key: 'output_price_per_1m', render: (val, record) => (
      <InputNumber 
        prefix="$" 
        size="small" 
        value={val} 
        precision={6}
        step={0.01}
        onChange={(v) => { record.output_price_per_1m = v; }}
        onBlur={() => { record.is_custom = true; handleSavePricing(record); }}
      />
    )},
    { title: 'Tùy chỉnh', dataIndex: 'is_custom', key: 'is_custom', render: (isCustom, record) => (
      <Space>
        {isCustom ? <Tag color='orange'>Tự sửa</Tag> : <Tag color='green'>Auto</Tag>}
        {isCustom && <Button size="small" type="link" onClick={() => handleResetPricing(record.id)}>Khôi phục</Button>}
        <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => handleDeletePricing(record.id)} />
      </Space>
    )},
  ];

  useEffect(() => {
    fetchStats();
  }, [statsPeriod]);

  useEffect(() => { 
    fetchAgents(); 
    fetchCompanySettings();
    fetchKeys();
    fetchAvailableProviders();
    fetchPricings();
  }, []);

  const { isMobile, padding } = useResponsive();

  return (
    <div style={{ padding }}>
      
      {hasPermission('ai_agent.manage_agents') && (
      <Card 
        title={
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 12, width: '100%' }}>
            <Title level={isMobile ? 5 : 4} style={{ margin: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}><RobotOutlined /> Quản lý Đội ngũ Trợ lý AI</Title>
            <Button type='primary' size={isMobile ? 'middle' : 'large'} icon={<PlusOutlined />} onClick={() => handleOpenModal()}>{isMobile ? 'Tạo mới' : 'Tạo Trợ lý AI mới'}</Button>
          </div>
        } 
        style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: 24 }}
      >
        {isMobile ? (
          <List
            dataSource={agents}
            loading={loading}
            pagination={false}
            renderItem={(item) => (
              <List.Item style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                  <Text strong style={{ fontSize: 15, color: '#1677ff' }}>
                    <RobotOutlined /> {item.name}
                  </Text>
                  <Tag color={item.is_active ? 'green' : 'red'} style={{ margin: 0 }}>
                    {item.is_active ? 'Đang hoạt động' : 'Đã tắt'}
                  </Tag>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>Nền tảng: </Text>
                  <Tag color='purple'>{item.provider?.toUpperCase()}</Tag>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>Mô hình: </Text>
                  <Tag color='blue'>{item.model_name}</Tag>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button
                    type="text"
                    icon={<EditOutlined style={{ color: '#d97706' }} />}
                    onClick={() => handleOpenModal(item)}
                  />
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Table scroll={{ x: 'max-content' }} columns={columns} dataSource={agents} rowKey='id' loading={loading} pagination={false} />
        )}
      </Card>
      )}
      {hasPermission('ai_agent.manage_keys') && (
        <Collapse 
          style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: 24, backgroundColor: '#fff' }}
          expandIconPosition="end"
          bordered={false}
        >
          <Panel 
            header={<Title level={isMobile ? 5 : 4} style={{ margin: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}><KeyOutlined style={{color: '#1677ff'}} /> Cấu hình API Key & Phân bổ Quota</Title>} 
            key="keys"
            style={{ border: 'none' }}
          >
          <Form form={settingsForm} layout='vertical' onFinish={handleSaveCompanySettings}>
            <Row gutter={[32, 32]}>
              <Col xs={24} lg={16}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Title level={5} style={{ margin: 0 }}>Kho API Key cá nhân</Title>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenKeyModal()}>Thêm Key Mới</Button>
                </div>
                {isMobile ? (
                  <List
                    dataSource={keys}
                    loading={keysLoading}
                    pagination={false}
                    renderItem={(item) => (
                      <List.Item style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block', background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                          <Tag color='blue'>{item.provider?.toUpperCase()}</Tag>
                          <Tag color={item.is_active ? 'green' : 'red'} style={{ margin: 0 }}>
                            {item.is_active ? 'Đang hoạt động' : 'Tạm ngưng'}
                          </Tag>
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <Text type="secondary" style={{ fontSize: 13 }}>API Key: </Text>
                          <Text>{item.api_key?.substring(0, 8)}...{item.api_key?.slice(-4)}</Text>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <Text type="secondary" style={{ fontSize: 13 }}>Độ ưu tiên: </Text>
                          <Text>{item.priority}</Text>
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <Button type='text' icon={<EditOutlined style={{ color: '#1677ff' }} />} onClick={() => handleOpenKeyModal(item)} />
                          <Button type='text' danger icon={<DeleteOutlined />} onClick={() => handleDeleteKey(item.id)} />
                        </div>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Table 
                    scroll={{ x: 'max-content' }}
                    columns={keyColumns} 
                    dataSource={keys} 
                    rowKey="id" 
                    loading={keysLoading} 
                    pagination={false} 
                    size="small"
                    style={{ border: '1px solid #f0f0f0', borderRadius: 8 }}
                  />
                )}
              </Col>
              
              <Col xs={24} lg={8}>
                <div style={{ 
                  padding: 24, 
                  background: 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%)', 
                  borderRadius: 12,
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <RobotOutlined style={{ fontSize: 20, color: '#1677ff' }} />
                    <Title level={5} style={{ margin: 0 }}>Cơ chế Dự phòng (Fallback)</Title>
                  </div>
                  
                  <Text type='secondary' style={{ display: 'block', marginBottom: 20, lineHeight: '1.6' }}>
                    Nếu Key riêng của bạn bị hết hạn mức (hết tiền), hệ thống sẽ tự động trượt sang dùng kho Key dự phòng của Server (System Quota) để đảm bảo Trợ lý AI luôn hoạt động 24/7.
                  </Text>
                  
                  {!companySettings?.allow_system_keys ? (
                    <Alert
                      message="Tính năng bị khóa"
                      description="Bạn chưa được Admin hệ thống cấp quyền dùng Quota dự phòng. Vui lòng liên hệ Admin để nâng cấp."
                      type="error"
                      showIcon
                      style={{ marginBottom: 20, borderRadius: 8 }}
                    />
                  ) : (
                    <Alert
                      message="Đã được cấp quyền"
                      description="Bạn có thể tự do bật/tắt tính năng sử dụng Quota dự phòng bên dưới."
                      type="success"
                      showIcon
                      style={{ marginBottom: 20, borderRadius: 8 }}
                    />
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <Text strong>Cho phép dùng System Quota</Text>
                    <Form.Item name='use_system_keys' valuePropName='checked' style={{ margin: 0 }}>
                      <Switch 
                        disabled={!companySettings?.allow_system_keys} 
                        checkedChildren="Bật" 
                        unCheckedChildren="Tắt" 
                      />
                    </Form.Item>
                  </div>
                </div>
              </Col>
            </Row>
            
            <Divider style={{ margin: '24px 0' }} />
              
              <div style={{ textAlign: 'right' }}>
                <Button type='primary' htmlType='submit' size='large' style={{ borderRadius: 8, minWidth: 200 }}>
                  Lưu Cơ chế Dự phòng
                </Button>
              </div>
          </Form>
          </Panel>
        </Collapse>
      )}




      {hasPermission('ai_agent.view_dashboard') && (
        <Collapse 
          style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: 24, backgroundColor: '#fff' }}
          expandIconPosition="end"
          bordered={false}
        >
          <Panel 
            header={
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 12, width: '100%' }}>
                <Title level={isMobile ? 5 : 4} style={{ margin: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                  <ThunderboltOutlined style={{color: '#faad14'}} /> Thống kê Chi phí AI 
                  <Text type="secondary" style={{ fontSize: isMobile ? 14 : 16, fontWeight: 'normal', display: isMobile ? 'block' : 'inline', marginLeft: isMobile ? 0 : 8 }}>
                    {statsPeriod === 'today' ? '(Hôm nay)' : statsPeriod === 'week' ? '(Tuần này)' : statsPeriod === 'month' ? '(Tháng này)' : '(Trọn đời)'}
                  </Text>
                </Title>
                <div onClick={e => e.stopPropagation()} style={{ width: isMobile ? '100%' : 'auto', paddingBottom: isMobile ? 4 : 0 }}>
                  {isMobile ? (
                    <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
                      <Select
                        value={statsPeriod}
                        onChange={setStatsPeriod}
                        style={{ width: '100%' }}
                        options={[
                          { label: 'Hôm nay', value: 'today' },
                          { label: 'Tuần này', value: 'week' },
                          { label: 'Tháng này', value: 'month' },
                          { label: 'Trọn đời', value: 'all' },
                        ]}
                      />
                      <Button danger icon={<DeleteOutlined />} onClick={handleResetStats} block>Thiết lập lại</Button>
                    </Space>
                  ) : (
                    <Space>
                      <Segmented 
                        options={[
                          { label: 'Hôm nay', value: 'today' },
                          { label: 'Tuần này', value: 'week' },
                          { label: 'Tháng này', value: 'month' },
                          { label: 'Trọn đời', value: 'all' },
                        ]} 
                        value={statsPeriod} 
                        onChange={setStatsPeriod} 
                      />
                      <Button danger type="text" icon={<DeleteOutlined />} onClick={handleResetStats} title="Thiết lập lại thống kê"></Button>
                    </Space>
                  )}
                </div>
              </div>
            }
            key="stats"
            style={{ border: 'none' }}
          >
          <Row gutter={[24, 24]}>
            <Col xs={24} md={8}>
              <div style={{ 
                background: 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)', 
                padding: '24px', 
                borderRadius: 16, 
                border: '1px solid #b7eb8f', 
                boxShadow: '0 8px 24px rgba(82, 196, 26, 0.15)',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
              }}>
                <Title level={5} style={{ color: '#389e0d', margin: 0, textTransform: 'uppercase', letterSpacing: 1, fontSize: 13 }}>Input Tokens</Title>
                <Title level={2} style={{ margin: '12px 0 0 0', color: '#135200' }}>{stats?.total_input_tokens?.toLocaleString() || 0}</Title>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div style={{ 
                background: 'linear-gradient(135deg, #e6f4ff 0%, #bae0ff 100%)', 
                padding: '24px', 
                borderRadius: 16, 
                border: '1px solid #91caff', 
                boxShadow: '0 8px 24px rgba(22, 119, 255, 0.15)',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
              }}>
                <Title level={5} style={{ color: '#0958d9', margin: 0, textTransform: 'uppercase', letterSpacing: 1, fontSize: 13 }}>Output Tokens</Title>
                <Title level={2} style={{ margin: '12px 0 0 0', color: '#003eb3' }}>{stats?.total_output_tokens?.toLocaleString() || 0}</Title>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div style={{ 
                background: 'linear-gradient(135deg, #fff2e8 0%, #ffbb96 100%)', 
                padding: '24px', 
                borderRadius: 16, 
                border: '1px solid #ff9c6e', 
                boxShadow: '0 8px 24px rgba(250, 84, 28, 0.15)',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
              }}>
                <Title level={5} style={{ color: '#d4380d', margin: 0, textTransform: 'uppercase', letterSpacing: 1, fontSize: 13 }}>Tổng Chi Phí</Title>
                <Title level={2} style={{ margin: '12px 0 0 0', color: '#871400' }}>${parseFloat(stats?.total_cost_usd || 0).toFixed(4)}</Title>
              </div>
            </Col>
          </Row>
        
        {stats?.agent_stats?.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <Title level={5}>Chi tiết theo Trợ lý</Title>
            <Table 
              scroll={{ x: 'max-content' }}
              dataSource={stats.agent_stats} 
              rowKey={(r, i) => i}
              pagination={false}
              size="small"
              columns={[
                { title: 'Tên Trợ lý', dataIndex: 'agent_name', key: 'agent_name' },
                { title: 'Mô hình', dataIndex: 'model_name', key: 'model_name' },
                { title: 'Input Tokens', dataIndex: 'input_tokens', key: 'input_tokens', render: (v) => v.toLocaleString() },
                { title: 'Output Tokens', dataIndex: 'output_tokens', key: 'output_tokens', render: (v) => v.toLocaleString() },
                { title: 'Chi phí ($)', dataIndex: 'total_cost_usd', key: 'total_cost_usd', render: (v) => <Text strong style={{ color: '#fa541c' }}>${parseFloat(v || 0).toFixed(4)}</Text> }
              ]} 
            />
          </div>
        )}
        </Panel>
      </Collapse>
      )}
      
      {hasPermission('ai_agent.sync_pricing') && (
      <Collapse 
        style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: 24, backgroundColor: '#fff' }}
        expandIconPosition="end"
        bordered={false}
      >
        <Panel 
          header={
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 12, width: '100%' }}>
              <Title level={isMobile ? 5 : 4} style={{ margin: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                <InfoCircleOutlined style={{color: '#1677ff'}} /> Bảng Giá AI (Tham chiếu từ LiteLLM)
              </Title>
              <Space onClick={e => e.stopPropagation()} direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : 'auto' }}>
                <Input.Search 
                  placeholder="Tìm tên mô hình..." 
                  allowClear
                  onChange={e => setPricingSearch(e.target.value)} 
                  style={{ width: isMobile ? '100%' : 250 }}
                />
                <Button type="primary" icon={<SyncOutlined spin={syncingPricing} />} loading={syncingPricing} onClick={handleSyncPricing} block={isMobile}>Đồng bộ từ LiteLLM</Button>
              </Space>
            </div>
          } 
          key="pricing"
          style={{ border: 'none' }}
        >
        <Text type='secondary' style={{ display: 'block', marginBottom: 16 }}>
          Bảng giá được đồng bộ tự động hàng ngày. Bạn có thể tự sửa giá (khi sửa sẽ bị đánh dấu "Tự sửa" và không bị tự động ghi đè).
        </Text>
        <Table 
          scroll={{ x: 'max-content' }}
          dataSource={pricings.filter(p => p.model_name.toLowerCase().includes(pricingSearch.toLowerCase()))} 
          rowKey="id"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          size="small"
          columns={pricingColumns} 
          loading={pricingLoading}
        />
        </Panel>
      </Collapse>
      )}

      <Modal 
        title={<Space><RobotOutlined style={{color: '#1677ff', fontSize: 20}} /> <span style={{fontSize: 18, fontWeight: 600}}>{editingAgent ? 'Chỉnh sửa Trợ lý AI' : 'Tạo Trợ lý AI mới'}</span></Space>} 
        open={modalVisible} 
        onCancel={() => setModalVisible(false)} 
        onOk={() => form.submit()} 
        width={850}
        okText="Lưu lại"
        cancelText="Hủy"
        okButtonProps={{ size: 'large', icon: <ThunderboltOutlined /> }}
        cancelButtonProps={{ size: 'large' }}
      >
        <Form form={form} layout='vertical' onFinish={handleSave} style={{ marginTop: 16 }}>
          <Row gutter={24}>
            <Col xs={24} md={16}>
              <Form.Item name='name' label={<Text strong>Tên Trợ lý</Text>} rules={[{required:true}]}>
                <Input size="large" placeholder='VD: AI Sale Facebook, AI CSKH Zalo' />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name='is_active' label={<Text strong>Trạng thái hoạt động</Text>} valuePropName='checked'>
                <Switch checkedChildren="Đang hoạt động" unCheckedChildren="Tạm dừng" style={{ marginTop: 4 }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24} md={10}>
              <Form.Item name='provider' label={<Text strong>Nền tảng AI</Text>} rules={[{required:true}]} help={availableProviders.length === 0 ? "⚠️ Cần nạp API Key trước." : ""}>
                <Select 
                  size="large"
                  onChange={() => form.setFieldsValue({ model_name: undefined })}
                  placeholder={availableProviders.length === 0 ? "Chưa có API Key" : "Chọn nền tảng AI"}
                >
                  <Select.Option value='openai' disabled={!availableProviders.includes('openai')}>OpenAI (ChatGPT) {!availableProviders.includes('openai') && '(Chưa có)'}</Select.Option>
                  <Select.Option value='gemini' disabled={!availableProviders.includes('gemini')}>Google Gemini {!availableProviders.includes('gemini') && '(Chưa có)'}</Select.Option>
                  <Select.Option value='anthropic' disabled={!availableProviders.includes('anthropic')}>Anthropic (Claude) {!availableProviders.includes('anthropic') && '(Chưa có)'}</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={14}>
              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.provider !== curr.provider}>
                {({ getFieldValue }) => {
                  const provider = getFieldValue('provider');
                  const useDynamic = fetchedModels.length > 0;
                  return (
                    <Form.Item 
                      name='model_name' 
                      label={
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Text strong>Mô hình AI (LLM)</Text>
                          {provider && (
                            <Button size='small' type='primary' ghost icon={<SyncOutlined spin={fetchingModels} />} loading={fetchingModels} onClick={() => handleFetchModels(provider)}>
                              Lấy mô hình thực tế
                            </Button>
                          )}
                        </Space>
                      }
                      rules={[{required:true}]}
                    >
                      <Select size="large" disabled={!provider} placeholder="Vui lòng chọn Nền tảng AI trước">
                        {useDynamic
                          ? fetchedModels.map(m => (<Select.Option key={m.id} value={m.id}>{m.name}</Select.Option>))
                          : (<>
                              {provider === 'openai' && (<>
                                <Select.Option value='gpt-4o-mini'>GPT-4o-mini (Nhanh, Rẻ - Khuyên dùng)</Select.Option>
                                <Select.Option value='gpt-4o'>GPT-4o (Thông minh, Phổ biến)</Select.Option>
                                <Select.Option value='gpt-4.5-turbo'>GPT-4.5 Turbo (Nâng cấp lớn)</Select.Option>
                                <Select.Option value='gpt-5'>GPT-5 (Tối tân nhất)</Select.Option>
                                <Select.Option value='o1-mini'>O1 Mini (Lập luận logic)</Select.Option>
                                <Select.Option value='o1'>O1 (Siêu trí tuệ)</Select.Option>
                              </>)}
                              {provider === 'gemini' && (<>
                                <Select.Option value='gemini-flash-lite-latest'>Gemini Flash Lite (Siêu nhẹ)</Select.Option>
                                <Select.Option value='gemini-flash-latest'>Gemini Flash Latest (Khuyên dùng)</Select.Option>
                                <Select.Option value='gemini-pro-latest'>Gemini Pro Latest (Thông minh nhất)</Select.Option>
                              </>)}
                              {provider === 'anthropic' && (<>
                                <Select.Option value='claude-3-5-haiku-20241022'>Claude 3.5 Haiku (Nhanh, Rẻ)</Select.Option>
                                <Select.Option value='claude-3-5-sonnet-20241022'>Claude 3.5 Sonnet (Cân bằng)</Select.Option>
                                <Select.Option value='claude-sonnet-4-5'>Claude Sonnet 4.5 (Thế hệ mới)</Select.Option>
                                <Select.Option value='claude-opus-4-5'>Claude Opus 4.5 (Thông minh nhất)</Select.Option>
                              </>)}
                            </>)
                        }
                      </Select>
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
          </Row>

          {fetchedModels.length > 0 && (
            <div style={{ marginTop: -15, marginBottom: 15 }}>
              <Text type="success" style={{ fontSize: 13 }}>✅ Đang hiển thị {fetchedModels.length} mô hình thực tế từ API Key [{fetchedKey}]</Text>
            </div>
          )}

          <Divider style={{ margin: '12px 0' }} />

          <Row gutter={24}>
            <Col xs={24} md={16}>
              <Form.Item 
                name='system_prompt' 
                label={
                  <Space>
                    <Text strong>Định hình Tính cách (System Prompt)</Text>
                    <Tooltip title='Mô tả tính cách, mục tiêu, và giọng điệu của AI. VD: "Bạn là 1 nữ nhân viên chốt Sale tên Lan Anh, giọng điệu vui vẻ, hay dùng emoji..."'>
                      <InfoCircleOutlined style={{ color: '#888' }} />
                    </Tooltip>
                  </Space>
                }
              >
                <Input.TextArea rows={6} placeholder="Nhập kịch bản, tính cách cho AI tại đây..." style={{ borderRadius: 8 }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item 
                name='temperature' 
                label={
                  <Space>
                    <Text strong>Độ sáng tạo (0 - 1)</Text>
                    <Tooltip title="Giá trị càng gần 1, AI càng sáng tạo và bay bổng. Gần 0 thì AI nghiêm túc và chính xác hơn. Khuyên dùng: 0.7">
                      <InfoCircleOutlined style={{ color: '#888' }} />
                    </Tooltip>
                  </Space>
                }
              >
                <Slider min={0} max={1} step={0.1} marks={{0: '0', 0.5: '0.5', 1: '1'}} />
              </Form.Item>
            </Col>
          </Row>

          <Collapse ghost style={{ background: '#f5f5f5', borderRadius: 8, marginBottom: 12 }}>
            <Panel header={<Text strong style={{ color: '#d9363e' }}>Tùy chỉnh Cốt lõi AI (Dành cho Chuyên gia - Developer Mode)</Text>} key="1">
              <Form.Item 
                name='core_system_rules' 
                label={
                  <Space>
                    <Text strong>Luật ngầm định (Core System Rules)</Text>
                    <Tooltip title="Đây là các nguyên tắc cốt lõi của hệ thống (như cấm gọi tên khách, quy tắc xử lý ảnh/video) được gài cứng ở Backend. Sửa ở đây để ghi đè luật ngầm định cho Agent này.">
                      <InfoCircleOutlined style={{ color: '#888' }} />
                    </Tooltip>
                    <Button 
                      size="small" 
                      type="dashed" 
                      onClick={() => form.setFieldsValue({ core_system_rules: defaultCoreSystemRules })}
                    >
                      ↺ Khôi phục mặc định
                    </Button>
                  </Space>
                }
              >
                <Input.TextArea 
                  autoSize={{ minRows: 10, maxRows: 25 }}
                  style={{ 
                    fontFamily: "'Consolas', 'Menlo', 'Courier New', monospace", 
                    fontSize: 14, 
                    lineHeight: '1.6',
                    backgroundColor: '#1e1e1e', 
                    color: '#e6e6e6',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #333'
                  }} 
                  placeholder="Để trống để sử dụng Luật ngầm định của Backend..." 
                />
              </Form.Item>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 24 }}>
                Lưu ý: Việc xóa hoặc sửa đổi các luật ngầm định (như cấm gọi tên khách hàng, cách xử lý ảnh/video) có thể khiến AI phản hồi sai lệch so với chuẩn của hệ thống.
              </Text>

              <Form.Item 
                name='core_prompt_template' 
                label={
                  <Space>
                    <Text strong>Cấu trúc Dữ liệu JSON (Core Prompt)</Text>
                    <Tooltip title="Mặc định hệ thống đã cấu hình 1 JSON hoàn hảo (trích xuất SĐT, Nhãn, Tóm tắt). Chỉ chỉnh sửa nếu bạn hiểu về JSON và muốn thêm trường tuỳ chỉnh (VD: trích xuất Email, Ngân sách).">
                      <InfoCircleOutlined style={{ color: '#888' }} />
                    </Tooltip>
                    <Button 
                      size="small" 
                      type="dashed" 
                      onClick={() => form.setFieldsValue({ core_prompt_template: defaultJsonTemplate })}
                    >
                      ↺ Khôi phục mặc định
                    </Button>
                  </Space>
                }
              >
                <Input.TextArea 
                  autoSize={{ minRows: 10, maxRows: 25 }}
                  style={{ 
                    fontFamily: "'Consolas', 'Menlo', 'Courier New', monospace", 
                    fontSize: 14, 
                    lineHeight: '1.6',
                    backgroundColor: '#1e1e1e', 
                    color: '#e6e6e6',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #333'
                  }} 
                  placeholder="Để trống để sử dụng JSON thông minh mặc định của hệ thống..." 
                />
              </Form.Item>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Lưu ý: Nếu nhập sai cú pháp JSON, AI có thể không hoạt động đúng. Để trống = dùng JSON mặc định từ Backend. Sửa trực tiếp = chỉ áp dụng riêng cho AI này.
              </Text>
            </Panel>
          </Collapse>


          <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px 20px', marginTop: 8 }}>
            <div style={{ marginBottom: 16 }}>
              <Space>
                <SettingOutlined style={{ fontSize: 16, color: '#1677ff' }} />
                <Text strong style={{ fontSize: 15 }}>Tính năng Nâng cao (Tự động hóa)</Text>
              </Space>
            </div>
            <Row gutter={[24, 16]}>
              <Col xs={24} sm={12}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Form.Item name='enable_human_typing' valuePropName='checked' style={{ marginBottom: 0 }}>
                    <Switch />
                  </Form.Item>
                  <Text style={{ marginLeft: 8 }}>Giả lập người thật (Delay & gõ phím)</Text>
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Form.Item name='enable_auto_summary' valuePropName='checked' style={{ marginBottom: 0 }}>
                    <Switch />
                  </Form.Item>
                  <Text style={{ marginLeft: 8 }}>Tự động tóm tắt hội thoại cho Sale</Text>
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Form.Item name='enable_auto_tagging' valuePropName='checked' style={{ marginBottom: 0 }}>
                    <Switch />
                  </Form.Item>
                  <Text style={{ marginLeft: 8 }}>Tự động dán nhãn (Tag) khách hàng</Text>
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Form.Item name='enable_drip_followup' valuePropName='checked' style={{ marginBottom: 0 }}>
                    <Switch />
                  </Form.Item>
                  <Text style={{ marginLeft: 8 }}>Bám đuổi (Follow-up) tự động sau</Text>
                  <Form.Item name='drip_followup_hours' style={{ marginBottom: 0, marginLeft: 8 }}>
                    <InputNumber min={1} max={720} style={{ width: 65 }} />
                  </Form.Item>
                  <Text style={{ marginLeft: 8 }}>giờ</Text>
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Text style={{ marginRight: 8 }}>Đợi gộp tin nhắn (giây):</Text>
                  <Form.Item name='debounce_delay' style={{ marginBottom: 0 }}>
                    <InputNumber min={0} max={60} style={{ width: 65 }} />
                  </Form.Item>
                </div>
              </Col>
            </Row>
          </div>
        </Form>
      </Modal>

      <Modal title={editingKey ? 'Sửa API Key' : 'Thêm API Key mới'} open={keyModalVisible} onCancel={() => setKeyModalVisible(false)} onOk={() => keyForm.submit()}>
        <Form form={keyForm} layout='vertical' onFinish={handleSaveKey}>
          <Form.Item name='provider' label='Nhà cung cấp AI' rules={[{required: true}]}>
            <Select>
              <Select.Option value='openai'>OpenAI (ChatGPT)</Select.Option>
              <Select.Option value='gemini'>Google Gemini</Select.Option>
              <Select.Option value='anthropic'>Anthropic (Claude)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name='api_key' label='API Key' rules={[{required: true}]}>
            <Input.Password placeholder='Nhập API Key...' />
          </Form.Item>
          <Form.Item name='priority' label='Độ ưu tiên (Ưu tiên cao nhất = 100)' help='Các Key có priority cao hơn sẽ được gọi trước, nếu hết tiền sẽ tự trượt xuống Key có priority thấp hơn.'>
            <Input type='number' />
          </Form.Item>
          <Form.Item name='is_active' valuePropName='checked'>
            <Switch checkedChildren="Đang hoạt động" unCheckedChildren="Tạm ngưng" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}