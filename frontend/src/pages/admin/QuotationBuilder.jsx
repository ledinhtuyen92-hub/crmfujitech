import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout, Button, message, Space, Typography, Divider } from 'antd';
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

function DroppableCanvas({ blocks, selectedBlockId, setSelectedBlockId, handleDeleteBlock }) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'canvas',
  });

  return (
    <div 
      ref={setNodeRef}
      style={{ 
        width: '210mm', 
        minHeight: '297mm', 
        background: 'white', 
        boxShadow: isOver ? '0 0 0 2px #1677ff' : '0 4px 12px rgba(0,0,0,0.1)', 
        padding: '20mm',
        position: 'relative',
        transition: 'all 0.2s'
      }}
    >
      <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.length === 0 ? (
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 100 }}>
            Kéo thả các thành phần từ cột trái vào đây
          </Text>
        ) : (
          blocks.map((block) => (
            <BlockRenderer 
              key={block.id} 
              block={block} 
              isActive={selectedBlockId === block.id} 
              onSelect={setSelectedBlockId} 
              onDelete={handleDeleteBlock}
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
  const [activeDragType, setActiveDragType] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetchTemplate();
  }, [id]);

  const fetchTemplate = async () => {
    try {
      const res = await api.get(`/sales/quotation-templates/${id}/`);
      setTemplate(res.data);
      if (res.data.layout_config && Array.isArray(res.data.layout_config.blocks) && res.data.layout_config.blocks.length > 0) {
        setBlocks(res.data.layout_config.blocks);
      } else {
        // Preload default blocks
        const defaultBlocks = [
          { id: generateId(), type: BLOCK_TYPES.HEADER_LOGO, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.HEADER_LOGO] } },
          { id: generateId(), type: BLOCK_TYPES.TITLE, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.TITLE] } },
          { id: generateId(), type: BLOCK_TYPES.CUSTOMER_INFO, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.CUSTOMER_INFO] } },
          { id: generateId(), type: BLOCK_TYPES.PRODUCT_TABLE, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.PRODUCT_TABLE] } },
          { id: generateId(), type: BLOCK_TYPES.TOTALS, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.TOTALS] } },
          { id: generateId(), type: BLOCK_TYPES.TERMS, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.TERMS] } },
          { id: generateId(), type: BLOCK_TYPES.SIGNATURES, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.SIGNATURES] } }
        ];
        setBlocks(defaultBlocks);
      }
    } catch (err) {
      message.error('Không tải được mẫu báo giá');
    }
  };

  const handleSave = async () => {
    try {
      await api.patch(`/sales/quotation-templates/${id}/`, {
        layout_config: { blocks },
      });
      message.success('Đã lưu thiết kế thành công');
    } catch (err) {
      message.error('Lỗi khi lưu thiết kế');
    }
  };

  const generateId = () => `block_${Math.random().toString(36).substr(2, 9)}`;

  const handleDragStart = (event) => {
    const { active } = event;
    setActiveDragId(active.id);
    if (active.data.current?.isNew) {
      setActiveDragType(active.data.current.type);
    } else {
      setActiveDragType(null); // It's an existing block being sorted
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveDragId(null);
    setActiveDragType(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Handle dropping a NEW block from sidebar
    if (active.data.current?.isNew) {
      const newBlockType = active.data.current.type;
      const savedProps = active.data.current.savedProps;
      const newBlock = {
        id: generateId(),
        type: newBlockType,
        props: savedProps ? { ...savedProps } : { ...DEFAULT_BLOCK_PROPS[newBlockType] }
      };

      if (overId === 'canvas') {
        // Dropped on empty canvas
        setBlocks([...blocks, newBlock]);
      } else {
        // Dropped over an existing block, insert near it
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
      // TODO: Sidebar will need to refresh, but user can click refresh tab for now
    } catch (err) {
      message.error('Lỗi khi lưu block mẫu');
    }
  };

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCenter} 
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Layout style={{ height: '100vh' }}>
        <Header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/quotation-templates')}>Quay lại</Button>
            <Title level={4} style={{ margin: 0 }}>Thiết kế mẫu: {template?.name}</Title>
          </Space>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>Lưu thiết kế</Button>
        </Header>
        
        <Layout>
          {/* Left Sidebar */}
          <Sider width={250} theme="light" style={{ borderRight: '1px solid #f0f0f0', padding: 16 }}>
            <SidebarPalette />
          </Sider>

          {/* Center Canvas */}
          <Content style={{ background: '#f5f5f5', padding: '24px', overflowY: 'auto', display: 'flex', justifyContent: 'center' }} onClick={() => setSelectedBlockId(null)}>
            <DroppableCanvas blocks={blocks} selectedBlockId={selectedBlockId} setSelectedBlockId={setSelectedBlockId} handleDeleteBlock={handleDeleteBlock} />
          </Content>

          {/* Right Sidebar */}
          <Sider width={300} theme="light" style={{ borderLeft: '1px solid #f0f0f0', padding: 16 }}>
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
                />
                <Divider style={{ margin: '12px 0' }} />
                <Button type="dashed" block onClick={handleSaveBlockTemplate}>
                  ⭐ Lưu thành Block mẫu
                </Button>
              </div>
            )}
          </Sider>
        </Layout>
      </Layout>

      {/* Drag Overlay for smooth visual feedback */}
      <DragOverlay>
        {activeDragId ? (
          <div style={{ background: '#fff', padding: 8, border: '1px solid #1677ff', borderRadius: 4, opacity: 0.8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            {activeDragType ? `Đang thả: ${activeDragType}` : 'Đang di chuyển...'}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
