import React, { useState, useRef } from 'react';
import { AutoComplete, Input, Button, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

export default function CustomInfoInput({ value, onChange, placeholder, style, enableTemplate = true, templateKey = 'default' }) {
  const { user, patchCompanySettings } = useAuth();
  const [adding, setAdding] = useState(false);

  if (enableTemplate === false) {
    return (
      <Input
        placeholder={placeholder}
        style={style}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  
  // Xử lý cả dạng mảng (cũ) và dạng object (mới)
  const rawTemplates = user?.custom_info_templates;
  const isArray = Array.isArray(rawTemplates);
  let currentKeyOptions = [];
  if (isArray) {
    // Nếu vẫn là array cũ, gán tạm cho key 'default'
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
    title: '', // Ẩn tooltip mặc định của Ant Design
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
      value={value}
      onChange={onChange}
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
                if (value) {
                  addTemplate(value);
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
