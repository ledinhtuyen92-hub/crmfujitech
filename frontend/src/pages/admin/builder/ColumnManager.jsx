import React, { useState } from 'react';
import { Select, Button, Typography, Space, Input, Divider } from 'antd';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { HolderOutlined, CloseOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

const PREDEFINED_COLUMNS = [
  { id: 'stt', title: 'STT' },
  { id: 'name', title: 'Tên hàng hóa / Dịch vụ' },
  { id: 'symbol', title: 'Ký hiệu' },
  { id: 'specs', title: 'Quy cách kỹ thuật' },
  { id: 'dimensions', title: 'Kích thước (Cao/Rộng/Dày)' },
  { id: 'note', title: 'Ghi chú' },
  { id: 'unit', title: 'ĐVT' },
  { id: 'qty', title: 'Số lượng' },
  { id: 'price', title: 'Đơn giá' },
  { id: 'total', title: 'Thành tiền' }
];

function SortableItem({ id, title, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    padding: '8px 12px',
    marginBottom: 8,
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'default',
    zIndex: isDragging ? 999 : 'auto',
    position: 'relative'
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Space>
        <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#94a3b8', marginRight: 4, display: 'inline-flex', padding: 4 }}>
          <HolderOutlined />
        </span>
        <Text strong style={{ fontSize: 13, color: '#334155' }}>{title}</Text>
      </Space>
      <CloseOutlined style={{ color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: 4 }} onClick={() => onRemove(id)} />
    </div>
  );
}

export default function ColumnManager({ value = [], onChange }) {
  const [selectedToAdd, setSelectedToAdd] = useState(null);
  const [customTitle, setCustomTitle] = useState('');

  // Normalize value to always be an array of objects
  const normalizedValue = value.map(col => {
    if (typeof col === 'string') {
      const predefined = PREDEFINED_COLUMNS.find(c => c.id === col);
      return predefined || { id: col, title: col };
    }
    return col;
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = normalizedValue.findIndex(c => c.id === active.id);
      const newIndex = normalizedValue.findIndex(c => c.id === over.id);
      onChange(arrayMove(normalizedValue, oldIndex, newIndex));
    }
  };

  const handleRemove = (idToRemove) => {
    onChange(normalizedValue.filter(col => col.id !== idToRemove));
  };

  const handleAdd = () => {
    if (selectedToAdd && !normalizedValue.find(c => c.id === selectedToAdd)) {
      const predefined = PREDEFINED_COLUMNS.find(c => c.id === selectedToAdd);
      if (predefined) {
        onChange([...normalizedValue, predefined]);
      }
      setSelectedToAdd(null);
    }
  };

  const handleAddCustom = () => {
    if (customTitle.trim()) {
      const newId = `custom_${Date.now()}`;
      onChange([...normalizedValue, { id: newId, title: customTitle.trim() }]);
      setCustomTitle('');
    }
  };

  const availableColumns = PREDEFINED_COLUMNS.filter(col => !normalizedValue.find(c => c.id === col.id));

  return (
    <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <div style={{ marginBottom: 12, fontSize: 12, color: '#64748b' }}>Kéo thả (☰) để sắp xếp vị trí hiển thị của các cột từ trái qua phải.</div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={normalizedValue.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {normalizedValue.map(col => {
            return (
              <SortableItem key={col.id} id={col.id} title={col.title} onRemove={handleRemove} />
            );
          })}
        </SortableContext>
      </DndContext>
      
      {availableColumns.length > 0 && (
        <div style={{ display: 'flex', marginTop: 12, gap: 8 }}>
          <Select 
            style={{ flex: 1 }} 
            placeholder="Chọn cột để thêm..." 
            value={selectedToAdd} 
            onChange={setSelectedToAdd}
            size="middle"
          >
            {availableColumns.map(col => (
              <Option key={col.id} value={col.id}>{col.title}</Option>
            ))}
          </Select>
          <Button type="primary" size="middle" onClick={handleAdd} disabled={!selectedToAdd}>Thêm</Button>
        </div>
      )}

      <Divider style={{ margin: '12px 0' }} />
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#334155' }}>Hoặc tự tạo cột mới:</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input 
          placeholder="Nhập tên cột (VD: Màu sắc)" 
          value={customTitle} 
          onChange={e => setCustomTitle(e.target.value)} 
          onPressEnter={handleAddCustom}
        />
        <Button onClick={handleAddCustom} disabled={!customTitle.trim()}>Tạo cột</Button>
      </div>
    </div>
  );
}
