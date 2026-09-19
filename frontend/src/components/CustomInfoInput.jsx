import React, { useState, useEffect, useRef } from 'react';
import { AutoComplete, Input, Button, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

export default function CustomInfoInput({ value, onChange, placeholder, style, enableTemplate = true, templateKey = 'default' }) {
  const { user, patchCompanySettings } = useAuth();
  const [adding, setAdding] = useState(false);
  
  const [localValue, setLocalValue] = useState(value ?? '');
  const timerRef = useRef(null);
  const localValueRef = useRef(localValue);

  // Sync when parent value changes
  useEffect(() => {
    const incoming = value ?? '';
    setLocalValue(incoming);
    localValueRef.current = incoming;
  }, [value]);

  const commitValue = (val) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onChange(val);
  };

  const handleChange = (newVal) => {
    setLocalValue(newVal);
    localValueRef.current = newVal;
    
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange(newVal);
    }, 400); // fast debounce
  };

  const handleSelect = (val) => {
    setLocalValue(val);
    localValueRef.current = val;
    commitValue(val);
  };

  const handleBlur = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onChange(localValueRef.current);
  };

  if (enableTemplate === false) {
    return (
      <Input
        placeholder={placeholder}
        style={style}
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
    );
  }
  
  // Handle both old array format and new object format
  const rawTemplates = user?.custom_info_templates;
  const isArray = Array.isArray(rawTemplates);
  let currentKeyOptions = [];
  if (isArray) {
    currentKeyOptions = templateKey === 'default' ? rawTemplates : [];
  } else if (rawTemplates && typeof rawTemplates === 'object') {
    currentKeyOptions = rawTemplates[templateKey] || [];
  }

  const addTemplate = async (text) => {
    if (!text) return;
    const trimmed = text.trim();
    if (!currentKeyOptions.includes(trimmed)) {
      setAdding(true);
      try {
        let newTemplates = isArray ? { default: rawTemplates } : { ...(rawTemplates || {}) };
        newTemplates[templateKey] = [...(newTemplates[templateKey] || []), trimmed];
        
        await patchCompanySettings({ custom_info_templates: newTemplates });
        message.success('Đã lưu mẫu thành công!');
      } catch (err) {
        message.error('Lỗi khi lưu mẫu');
      } finally {
        setAdding(false);
      }
    } else {
        message.info('Mẫu này đã tồn tại!');
    }
  };

  const removeTemplate = async (e, text) => {
    e.stopPropagation();
    try {
      let newTemplates = isArray ? { default: rawTemplates } : { ...(rawTemplates || {}) };
      newTemplates[templateKey] = (newTemplates[templateKey] || []).filter(t => t !== text);
      await patchCompanySettings({ custom_info_templates: newTemplates });
    } catch (err) {
      message.error('Lỗi khi xóa mẫu');
    }
  };

  const options = currentKeyOptions.map(item => ({
    value: item,
    title: '',
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{item}</span>
        <DeleteOutlined 
          style={{ color: '#ff4d4f', fontSize: 13, cursor: 'pointer' }}
          onClick={(e) => removeTemplate(e, item)}
        />
      </div>
    )
  }));

  return (
    <AutoComplete
      style={{ width: '100%', ...style }}
      value={localValue}
      onChange={handleChange}
      onSelect={handleSelect}
      onBlur={handleBlur}
      options={options}
      placeholder={placeholder || "Thêm thông tin..."}
      filterOption={(inputValue, option) => {
        if (!inputValue) return true;
        return (option?.value || '').toUpperCase().includes((inputValue || '').toUpperCase());
      }}
      defaultActiveFirstOption={false}
      notFoundContent={
        <div style={{ padding: 8, textAlign: 'center', color: '#999' }}>
          Không có mẫu nào khớp
        </div>
      }
      dropdownStyle={{ minWidth: 200 }}
      dropdownRender={(menu) => (
        <>
          {menu}
          <div style={{ display: 'flex', flexWrap: 'nowrap', padding: 8, borderTop: '1px solid #f0f0f0' }} onMouseDown={(e) => e.preventDefault()}>
            <Button
              type="dashed"
              block
              icon={<PlusOutlined />}
              loading={adding}
              onClick={() => {
                if (localValueRef.current) {
                  addTemplate(localValueRef.current);
                } else {
                  message.warning('Vui lòng nhập nội dung trước khi lưu');
                }
              }}
            >
              Lưu mẫu
            </Button>
          </div>
        </>
      )}
    />
  );
}
