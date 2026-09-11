import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from 'antd';
import { MenuOutlined } from '@ant-design/icons';

const SortableColumnOption = ({ id, label, checked, onChange }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    opacity: isDragging ? 0.5 : 1,
    padding: '4px 0',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#fff',
    zIndex: isDragging ? 99 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <div {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex', alignItems: 'center' }}>
        <MenuOutlined style={{ color: '#94a3b8' }} />
      </div>
      <Checkbox checked={checked} onChange={(e) => onChange(id, e.target.checked)}>
        {label}
      </Checkbox>
    </div>
  );
};

export default SortableColumnOption;
