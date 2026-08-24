import React, { useState } from 'react';
import { Select, Button, Typography, Space, Input, Divider, Popover, Checkbox } from 'antd';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { HolderOutlined, CloseOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

const PREDEFINED_COLUMNS = [
  { id: 'stt', title: 'STT' },
  { id: 'name', title: 'Tên hàng hóa / Dịch vụ' },
  { id: 'symbol', title: 'Ký hiệu' },
  { id: 'specs', title: 'Quy cách kỹ thuật' },
  { id: 'dimensions', title: 'Kích thước', children: [{ id: 'height', title: 'Cao' }, { id: 'width', title: 'Rộng' }, { id: 'thickness', title: 'Dày' }] },
  { id: 'note', title: 'Ghi chú' },
  { id: 'unit', title: 'ĐVT' },
  { id: 'qty', title: 'Số lượng' },
  { id: 'price', title: 'Đơn giá' },
  { id: 'total', title: 'Thành tiền' }
];

function SortableItem({ col, onRemove, onAddChild, onRemoveChild, onUpdateCol, onUpdateChild }) {
  const { id, title, children: childrenColumns } = col;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [childTitle, setChildTitle] = useState('');

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    padding: '8px 12px',
    marginBottom: 8,
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    cursor: 'default',
    zIndex: isDragging ? 999 : 'auto',
    position: 'relative'
  };

  const isGroup = id.startsWith('group_') || id === 'dimensions';

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#94a3b8', marginRight: 4, display: 'inline-flex', padding: 4 }}>
            <HolderOutlined />
          </span>
          <Text 
            strong 
            style={{ fontSize: 13, color: '#334155', margin: 0 }}
            editable={{
              text: title,
              onChange: (val) => {
                if (val && val.trim() !== '') {
                  onUpdateCol(id, { title: val.trim() });
                }
              },
              tooltip: 'Sửa tên cột'
            }}
          >
            {title}
          </Text>
          {isGroup && <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>(Cột gộp)</Text>}
        </Space>
        <Space>
          <Popover 
            title="Cài đặt cột" 
            trigger="click" 
            content={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 200 }}>
                  <Checkbox 
                    checked={col.allowImageUpload} 
                    onChange={e => onUpdateCol(id, { allowImageUpload: e.target.checked })}
                  >
                    Cho phép tải ảnh đính kèm
                  </Checkbox>
                  {(id.startsWith('custom_') || id.startsWith('group_') || id === 'note' || id === 'spec' || id === 'warranty' || id === 'symbol') && (
                    <Checkbox 
                      checked={col.enableTemplate !== false} 
                      onChange={e => onUpdateCol(id, { enableTemplate: e.target.checked })}
                    >
                      Bật tính năng Gợi ý / Lưu mẫu chữ
                    </Checkbox>
                  )}
                {/* Additional column settings can be added here */}
              </div>
            }
          >
            <SettingOutlined style={{ color: '#64748b', cursor: 'pointer', fontSize: 13, padding: 4 }} />
          </Popover>
          <CloseOutlined style={{ color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: 4 }} onClick={() => onRemove(id)} />
        </Space>
      </div>

      {isGroup && (
        <div style={{ marginTop: 12, paddingLeft: 28 }}>
          {childrenColumns && childrenColumns.map(child => (
            <div key={child.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '4px 8px', marginBottom: 4, borderRadius: 4, border: '1px dashed #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#475569' }}>-</span>
                <Text 
                  style={{ fontSize: 12, color: '#475569', margin: 0 }}
                  editable={{
                    text: child.title,
                    onChange: (val) => {
                      if (val && val.trim() !== '') {
                        onUpdateChild && onUpdateChild(id, child.id, { title: val.trim() });
                      }
                    },
                    tooltip: 'Sửa tên cột con'
                  }}
                >
                  {child.title}
                </Text>
              </div>
              <Space size={2}>
                <Popover 
                  title="Cài đặt cột con" 
                  trigger="click" 
                  content={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 200 }}>
                      <Checkbox 
                        checked={child.allowImageUpload} 
                        onChange={e => onUpdateChild && onUpdateChild(id, child.id, { allowImageUpload: e.target.checked })}
                      >
                        Cho phép tải ảnh đính kèm
                      </Checkbox>
                      {(child.id.startsWith('custom_') || child.id === 'note' || child.id === 'spec' || child.id === 'warranty' || child.id === 'symbol' || child.id === 'height' || child.id === 'width' || child.id === 'thickness') && (
                        <Checkbox 
                          checked={child.enableTemplate !== false} 
                          onChange={e => onUpdateChild && onUpdateChild(id, child.id, { enableTemplate: e.target.checked })}
                        >
                          Bật tính năng Gợi ý / Lưu mẫu chữ
                        </Checkbox>
                      )}
                    </div>
                  }
                >
                  <SettingOutlined style={{ color: '#64748b', cursor: 'pointer', fontSize: 11, padding: 4 }} />
                </Popover>
                <CloseOutlined style={{ color: '#ef4444', cursor: 'pointer', fontSize: 10, padding: 4 }} onClick={() => onRemoveChild(id, child.id)} />
              </Space>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <Input 
              size="small" 
              placeholder="Nhập tên cột con..." 
              value={childTitle}
              onChange={e => setChildTitle(e.target.value)}
              onPressEnter={() => {
                if(childTitle.trim()) {
                  onAddChild(id, childTitle.trim());
                  setChildTitle('');
                }
              }}
            />
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => {
              if(childTitle.trim()) {
                onAddChild(id, childTitle.trim());
                setChildTitle('');
              }
            }}>Thêm cột con</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ColumnManager({ value = [], onChange }) {
  const [selectedToAdd, setSelectedToAdd] = useState(null);
  const [customTitle, setCustomTitle] = useState('');
  const [groupTitle, setGroupTitle] = useState('');

  // Normalize value to always be an array of objects
  const safeValue = Array.isArray(value) ? value : [];
  const normalizedValue = safeValue.map(col => {
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

  const handleAddGroup = () => {
    if (groupTitle.trim()) {
      const newId = `group_${Date.now()}`;
      onChange([...normalizedValue, { id: newId, title: groupTitle.trim(), children: [] }]);
      setGroupTitle('');
    }
  };

  const handleAddChild = (groupId, childTitle) => {
    const updated = normalizedValue.map(col => {
      if (col.id === groupId) {
        return {
          ...col,
          children: [...(col.children || []), { id: `custom_${Date.now()}_${Math.random().toString(36).substring(7)}`, title: childTitle }]
        };
      }
      return col;
    });
    onChange(updated);
  };

  const handleRemoveChild = (groupId, childId) => {
    const updated = normalizedValue.map(col => {
      if (col.id === groupId) {
        return {
          ...col,
          children: (col.children || []).filter(c => c.id !== childId)
        };
      }
      return col;
    });
    onChange(updated);
  };

  const handleUpdateChild = (groupId, childId, updates) => {
    const updated = normalizedValue.map(col => {
      if (col.id === groupId) {
        return {
          ...col,
          children: (col.children || []).map(c => c.id === childId ? { ...c, ...updates } : c)
        };
      }
      return col;
    });
    onChange(updated);
  };

  const handleUpdateCol = (colId, updates) => {
    const updated = normalizedValue.map(col => {
      if (col.id === colId) {
        return { ...col, ...updates };
      }
      return col;
    });
    onChange(updated);
  };

  const availableColumns = PREDEFINED_COLUMNS.filter(col => !normalizedValue.find(c => c.id === col.id));

  return (
    <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <div style={{ marginBottom: 12, fontSize: 12, color: '#64748b' }}>Kéo thả (☰) để sắp xếp vị trí hiển thị của các cột từ trái qua phải.</div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={normalizedValue.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {normalizedValue.map(col => {
            return (
              <SortableItem 
                key={col.id} 
                col={col}
                onRemove={handleRemove} 
                onAddChild={handleAddChild}
                onRemoveChild={handleRemoveChild}
                onUpdateCol={handleUpdateCol}
                onUpdateChild={handleUpdateChild}
              />
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
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#334155' }}>Hoặc tự tạo cột:</div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input 
            placeholder="Tên cột đơn (VD: Màu sắc)" 
            value={customTitle} 
            onChange={e => setCustomTitle(e.target.value)} 
            onPressEnter={handleAddCustom}
          />
          <Button onClick={handleAddCustom} disabled={!customTitle.trim()}>Tạo cột đơn</Button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Input 
            placeholder="Tên cột gộp cha (VD: Kích thước)" 
            value={groupTitle} 
            onChange={e => setGroupTitle(e.target.value)} 
            onPressEnter={handleAddGroup}
          />
          <Button onClick={handleAddGroup} disabled={!groupTitle.trim()}>Tạo cột gộp</Button>
        </div>
      </div>

    </div>
  );
}
