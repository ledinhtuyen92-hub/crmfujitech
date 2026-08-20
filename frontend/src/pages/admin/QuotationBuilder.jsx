import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout, Button, message, Space, Typography, Divider, Tabs, Form, Input, Select, Row, Col, Splitter } from 'antd';
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, DragOverlay, useSensor, useSensors, PointerSensor, KeyboardSensor, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import api from '../../utils/api';

import { BLOCK_TYPES, DEFAULT_BLOCK_PROPS } from './builder/constants';
import SidebarPalette from './builder/SidebarPalette';
import BlockRenderer from './builder/BlockRenderer';
import SettingsPanel from './builder/SettingsPanel';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

function DroppableCanvas({ blocks, selectedBlockId, setSelectedBlockId, handleDeleteBlock, paperOrientation, themeColor, tableStyle, layoutStyle }) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'canvas',
  });

  const rootBlocks = blocks.filter(b => !b.parentId || b.parentId === 'canvas');

  return (
    <div 
      ref={setNodeRef}
      style={{ 
        width: paperOrientation === 'landscape' ? '297mm' : '210mm', 
        minHeight: paperOrientation === 'landscape' ? '210mm' : '297mm', 
        background: 'white', 
        boxShadow: isOver ? '0 0 0 2px #1677ff' : '0 4px 12px rgba(0,0,0,0.1)', 
        padding: '20mm',
        position: 'relative',
        transition: 'all 0.2s',
        marginBottom: '20mm',
        margin: '0 auto'
      }}
    >
      <SortableContext items={rootBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        {rootBlocks.length === 0 ? (
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 100 }}>
            Kéo thả các thành phần từ cột trái vào đây
          </Text>
        ) : (
          rootBlocks.map((block) => (
            <BlockRenderer 
              key={block.id} 
              block={block} 
              allBlocks={blocks}
              isActive={selectedBlockId === block.id} 
              onSelect={setSelectedBlockId} 
              onDelete={handleDeleteBlock}
              globalThemeColor={themeColor}
              globalTableStyle={tableStyle}
              globalLayoutStyle={layoutStyle}
            />
          ))
        )}
      </SortableContext>
    </div>
  );
}

export default function QuotationBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [activeDragId, setActiveDragId] = useState(null);
  const [categories, setCategories] = useState([]);
  
  // Global form settings
  const [form] = Form.useForm();
  const paperOrientation = Form.useWatch('paper_orientation', form) || 'portrait';
  const themeColor = Form.useWatch('theme_color', form) || '#1649c9';
  const tableStyle = Form.useWatch('table_style', form) || 'classic_border';
  const layoutStyle = Form.useWatch('layout_style', form) || 'modern_navy';

  useEffect(() => {
    fetchTemplate();
    api.get('/inventory/product-categories/').then(res => {
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
      setCategories(data);
    }).catch(() => {});
  }, [id]);

  const fetchTemplate = async () => {
    try {
      const res = await api.get(`/sales/quotation-templates/${id}/`);
      setTemplate(res.data);
      if (res.data.layout_config && Array.isArray(res.data.layout_config.blocks) && res.data.layout_config.blocks.length > 0) {
        const loadedBlocks = res.data.layout_config.blocks.map(b => {
          if (b.type === BLOCK_TYPES.SIGNATURES) {
            if (!b.props) b.props = {};
            if (!b.props.signatures || b.props.signatures.length === 0) {
              // Smart detect order based on titles
              if (b.props.titles && b.props.titles[0] && b.props.titles[0].toUpperCase().includes('CÔNG TY')) {
                b.props.signatures = [
                  '{{company_signature}}\n{{company_stamp}}\n\n<b>{{director_name}}</b>',
                  '{{customer_signature}}\n\n\n<b>{{customer_name}}</b>'
                ];
              } else {
                b.props.signatures = DEFAULT_BLOCK_PROPS[BLOCK_TYPES.SIGNATURES].signatures;
              }
            } else {
              // Upgrade existing signatures that were auto-filled earlier but missing director_name or having too much space
              if (b.props.signatures[0] === '{{company_signature}}<br>{{company_stamp}}' || b.props.signatures[0] === '{{company_signature}}\n{{company_stamp}}' || b.props.signatures[0] === '{{company_signature}}\n{{company_stamp}}\n\n\n<b>{{director_name}}</b>') {
                b.props.signatures[0] = '{{company_signature}}\n{{company_stamp}}\n\n<b>{{director_name}}</b>';
                if (b.props.signatures[1] === '{{customer_signature}}' || b.props.signatures[1] === '{{customer_signature}}\n\n\n\n<b>{{customer_name}}</b>') {
                  b.props.signatures[1] = '{{customer_signature}}\n\n\n<b>{{customer_name}}</b>';
                }
              } else if (b.props.signatures[1] === '{{company_signature}}<br>{{company_stamp}}' || b.props.signatures[1] === '{{company_signature}}\n{{company_stamp}}' || b.props.signatures[1] === '{{company_signature}}\n{{company_stamp}}\n\n\n<b>{{director_name}}</b>') {
                b.props.signatures[1] = '{{company_signature}}\n{{company_stamp}}\n\n<b>{{director_name}}</b>';
                if (b.props.signatures[0] === '{{customer_signature}}' || b.props.signatures[0] === '{{customer_signature}}\n\n\n\n<b>{{customer_name}}</b>') {
                  b.props.signatures[0] = '{{customer_signature}}\n\n\n<b>{{customer_name}}</b>';
                }
              }
            }
          }
          return b;
        });
        setBlocks(loadedBlocks);
      } else {
        // Load default blocks if empty
        const defaultBlocks = [
          { id: 'header_1', type: BLOCK_TYPES.HEADER_LOGO, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.HEADER_LOGO] } },
          { id: 'title_1', type: BLOCK_TYPES.TITLE, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.TITLE] } },
          { id: 'customer_1', type: BLOCK_TYPES.CUSTOMER_INFO, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.CUSTOMER_INFO] } },
          { id: 'table_1', type: BLOCK_TYPES.PRODUCT_TABLE, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.PRODUCT_TABLE] } },
          { id: 'service_1', type: BLOCK_TYPES.SERVICE_TABLE, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.SERVICE_TABLE] } },
          { id: 'summary_1', type: BLOCK_TYPES.TOTALS, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.TOTALS] } },
          { id: 'terms_1', type: BLOCK_TYPES.TERMS, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.TERMS], content: '1. Báo giá có hiệu lực trong vòng 15 ngày.\n2. Thanh toán: Tạm ứng 50% ngay sau khi xác nhận.' } },
          { id: 'signature_1', type: BLOCK_TYPES.SIGNATURES, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.SIGNATURES], columns: 2 } },
        ];
        setBlocks(defaultBlocks);
      }

      // Set global form data
      const cfg = res.data.layout_config || {};
      form.setFieldsValue({
        name: res.data.name,
        code: res.data.code,
        layout_style: res.data.layout_style || 'modern_navy',
        description: res.data.description,
        footer_content: res.data.footer_content,
        paper_orientation: cfg.paper_orientation || 'portrait',
        table_style: cfg.table_style || 'classic_border',
        theme_color: cfg.theme_color || '#1649c9',
      });
    } catch (err) {
      message.error('Không tải được template');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      const payload = {
        name: values.name,
        code: values.code,
        layout_style: values.layout_style,
        description: values.description,
        footer_content: values.footer_content,
        layout_config: {
          ...template.layout_config, // preserve other things if any
          paper_orientation: values.paper_orientation,
          table_style: values.table_style,
          theme_color: values.theme_color,
          blocks: blocks
        }
      };

      await api.patch(`/sales/quotation-templates/${id}/`, payload);
      message.success('Đã lưu thiết kế báo giá thành công!');
      // Update template state with new name
      setTemplate(prev => ({ ...prev, name: values.name }));
    } catch (err) {
      if (err.errorFields) return; // form validation error
      message.error('Lỗi khi lưu thiết kế');
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event) => {
    setActiveDragId(event.active.id);
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    // Is the item new from the palette? We don't have it in state yet, handled in dragEnd
    if (active.data.current?.isNew) return;

    const activeBlock = blocks.find(b => b.id === activeId);
    if (!activeBlock) return;

    // Find what we are dragging over
    const overBlock = blocks.find(b => b.id === overId);
    
    // Determine the target container ID
    // If overId is a string ending in _col_*, or 'canvas', it's a droppable container
    let overContainerId = 'canvas';
    if (String(overId).includes('_col_')) {
      overContainerId = overId;
    } else if (overId === 'canvas') {
      overContainerId = 'canvas';
    } else if (overBlock) {
      overContainerId = overBlock.parentId || 'canvas';
    }

    const activeContainerId = activeBlock.parentId || 'canvas';

    if (activeContainerId !== overContainerId) {
      setBlocks((prev) => {
        const activeIndex = prev.findIndex(b => b.id === activeId);
        const overIndex = prev.findIndex(b => b.id === overId);
        
        let newIndex;
        if (String(overId).includes('_col_') || overId === 'canvas') {
          newIndex = prev.length + 1;
        } else {
          const isBelowOverItem =
            over &&
            active.rect.current.translated &&
            active.rect.current.translated.top >
              over.rect.top + over.rect.height;
          const modifier = isBelowOverItem ? 1 : 0;
          newIndex = overIndex >= 0 ? overIndex + modifier : prev.length + 1;
        }

        const newBlocks = [...prev];
        newBlocks[activeIndex] = { 
          ...newBlocks[activeIndex], 
          parentId: overContainerId === 'canvas' ? undefined : overContainerId 
        };
        
        return arrayMove(newBlocks, activeIndex, newIndex);
      });
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over) return;
    
    const activeId = active.id;
    const overId = over.id;
    
    // Handle DROPPING new block from palette
    if (active.data.current?.isNew) {
      let overContainerId = 'canvas';
      if (String(overId).includes('_col_')) {
        overContainerId = overId;
      } else if (overId === 'canvas') {
        overContainerId = 'canvas';
      } else {
        const overBlock = blocks.find(b => b.id === overId);
        overContainerId = overBlock ? (overBlock.parentId || 'canvas') : 'canvas';
      }

      // Prevent nesting layout blocks
      if (active.data.current.type === BLOCK_TYPES.LAYOUT_ROW && overContainerId !== 'canvas') {
        message.warning('Không thể đặt Khối Layout bên trong một Khối Layout khác');
        return;
      }

      const newBlock = {
        id: `block_${Date.now()}`,
        type: active.data.current.type,
        props: active.data.current.savedProps || active.data.current.props || DEFAULT_BLOCK_PROPS[active.data.current.type] || {},
        parentId: overContainerId === 'canvas' ? undefined : overContainerId
      };
      
      if (String(overId).includes('_col_') || overId === 'canvas') {
        setBlocks([...blocks, newBlock]);
      } else {
        const overIndex = blocks.findIndex((b) => b.id === overId);
        if (overIndex !== -1) {
          const newBlocks = [...blocks];
          newBlocks.splice(overIndex, 0, newBlock);
          setBlocks(newBlocks);
        } else {
          setBlocks([...blocks, newBlock]);
        }
      }
      setSelectedBlockId(newBlock.id);
      return;
    }

    // Handle SORTING existing blocks
    if (activeId !== overId) {
      const oldIndex = blocks.findIndex((b) => b.id === activeId);
      const newIndex = blocks.findIndex((b) => b.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        setBlocks(arrayMove(blocks, oldIndex, newIndex));
      }
    }
  };

  const handleDeleteBlock = (blockId) => {
    setBlocks(blocks.filter((b) => b.id !== blockId));
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
  };

  const handleBlockChange = (blockId, newProps) => {
    setBlocks(blocks.map(b => 
      b.id === blockId ? { ...b, props: { ...b.props, ...newProps } } : b
    ));
  };

  const handleSaveBlockTemplate = async () => {
    if (!selectedBlockId) return;
    const block = blocks.find(b => b.id === selectedBlockId);
    if (!block) return;
    
    const blockName = prompt('Nhập tên cho Block mẫu này:', 'Khối mới');
    if (!blockName) return;

    try {
      await api.post('/sales/saved-template-blocks/', {
        name: blockName,
        block_type: block.type,
        props: block.props
      });
      message.success('Đã lưu thành Block mẫu thành công!');
    } catch (err) {
      message.error('Lỗi khi lưu block mẫu');
    }
  };

  const tabItems = [
    {
      key: '1',
      label: 'Thêm khối',
      children: (
        <div style={{ padding: 16 }}>
          <SidebarPalette />
        </div>
      )
    },
    {
      key: '2',
      label: 'Cài đặt chung',
      forceRender: true,
      children: (
        <div style={{ padding: '0 16px' }}>
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="Tên mẫu báo giá" rules={[{ required: true, message: 'Vui lòng nhập tên mẫu' }]}>
              <Input placeholder="VD: Mẫu Hiện Đại" />
            </Form.Item>
            
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="code" label="Mã định danh">
                  <Input disabled />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="layout_style" label="Nhóm phong cách">
                  <Select>
                    <Option value="modern_navy">Hiện đại</Option>
                    <Option value="classic_border">Cổ điển</Option>
                    <Option value="minimal_clean">Tối giản</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="paper_orientation" label="Khổ giấy">
                  <Select>
                    <Option value="portrait">Dọc (Portrait)</Option>
                    <Option value="landscape">Ngang (Landscape)</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="table_style" label="Kiểu viền bảng">
                  <Select>
                    <Option value="classic_border">Viền cổ điển</Option>
                    <Option value="modern_navy">Không viền</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="theme_color" label="Màu chủ đạo (Theme Color)">
              <Input type="color" style={{ width: '100%', padding: '0 4px', height: 40 }} />
            </Form.Item>

            <Form.Item name="description" label="Mô tả mẫu">
              <Input.TextArea rows={2} placeholder="Nhập mô tả..." />
            </Form.Item>
          </Form>
        </div>
      )
    }
  ];

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCenter} 
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <Layout style={{ height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
        <Header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', height: 64, flexShrink: 0 }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/quotation-templates')}>Quay lại</Button>
            <Title level={4} style={{ margin: 0 }}>Thiết kế mẫu: {template?.name}</Title>
          </Space>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>Lưu thiết kế</Button>
        </Header>
        
        <Splitter style={{ height: 'calc(100% - 64px)' }}>
          {/* Left Sidebar */}
          <Splitter.Panel defaultSize={320} min={200} max="50%" collapsible>
            <div style={{ height: '100%', background: '#fff', borderRight: '1px solid #f0f0f0', overflowY: 'auto' }}>
              <Tabs defaultActiveKey="1" centered items={tabItems} style={{ height: '100%' }} />
            </div>
          </Splitter.Panel>

          {/* Center Content */}
          <Splitter.Panel>
            <div style={{ height: '100%', background: '#f5f5f5', padding: '24px', overflow: 'auto' }} onClick={() => setSelectedBlockId(null)}>
              <DroppableCanvas 
                blocks={blocks} 
                selectedBlockId={selectedBlockId} 
                setSelectedBlockId={setSelectedBlockId} 
                handleDeleteBlock={handleDeleteBlock} 
                paperOrientation={paperOrientation} 
                themeColor={themeColor}
                tableStyle={tableStyle}
                layoutStyle={layoutStyle}
              />
            </div>
          </Splitter.Panel>

          {/* Right Sidebar */}
          <Splitter.Panel defaultSize={320} min={250} max="50%" collapsible>
            <div style={{ height: '100%', background: '#fff', borderLeft: '1px solid #f0f0f0', padding: 16, overflowY: 'auto' }}>
              <Title level={5}>Tùy chỉnh (Settings)</Title>
              {!selectedBlockId ? (
                <Text type="secondary">Chọn một khối trên giấy để tùy chỉnh</Text>
              ) : (
                <div>
                  <Text strong>Khối: {blocks.find(b => b.id === selectedBlockId)?.type}</Text>
                  <Divider style={{ margin: '12px 0' }} />
                  <SettingsPanel 
                    block={blocks.find(b => b.id === selectedBlockId)} 
                    onChange={handleBlockChange} 
                    categories={categories}
                  />
                  <Divider style={{ margin: '12px 0' }} />
                  <Button type="dashed" block onClick={handleSaveBlockTemplate}>
                    ⭐ Lưu thành Block mẫu
                  </Button>
                </div>
              )}
            </div>
          </Splitter.Panel>
        </Splitter>
      </Layout>
      <DragOverlay>
        {activeDragId ? (
          <div style={{ background: '#fafafa', border: '1px dashed #d9d9d9', padding: '16px', opacity: 0.8 }}>
            Đang di chuyển...
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
