import React, { useState, useRef, useEffect } from 'react';
import { Slider, Switch } from 'antd';
import QuotationRenderer from './QuotationRenderer';
import { BLOCK_TYPES, DEFAULT_BLOCK_PROPS } from '../pages/admin/builder/constants';

const DEFAULT_LAYOUT_BLOCKS = [
  { id: 'header_1', type: BLOCK_TYPES.HEADER_LOGO, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.HEADER_LOGO], companyName: 'CÔNG TY CỦA BẠN' } },
  { id: 'title_1', type: BLOCK_TYPES.TITLE, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.TITLE] } },
  { id: 'customer_1', type: BLOCK_TYPES.CUSTOMER_INFO, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.CUSTOMER_INFO], columns: 2 } },
  { id: 'table_1', type: BLOCK_TYPES.PRODUCT_TABLE, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.PRODUCT_TABLE] } },
  { id: 'service_1', type: BLOCK_TYPES.SERVICE_TABLE, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.SERVICE_TABLE] } },
  { id: 'summary_1', type: BLOCK_TYPES.TOTALS, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.TOTALS] } },
  { id: 'payment_1', type: BLOCK_TYPES.PAYMENT_PROGRESS, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.PAYMENT_PROGRESS] } },
  { id: 'terms_1', type: BLOCK_TYPES.TERMS, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.TERMS] } },
  { id: 'signature_1', type: BLOCK_TYPES.SIGNATURES, props: { ...DEFAULT_BLOCK_PROPS[BLOCK_TYPES.SIGNATURES], columns: 2 } },
];

export default function QuotationPrintView({ quotation, type = 'quotation', effectiveTemplate, hidePricing = false, hideCustomerInfo = false }) {
  const [scale, setScale] = useState(1);
  const [showPageBreaks, setShowPageBreaks] = useState(true);
  const [zoomedHeight, setZoomedHeight] = useState(0);
  const contentRef = useRef(null);

  const rawConfig = effectiveTemplate?.layout_config || {};
  const isLegacyArray = Array.isArray(rawConfig);
  
  const layoutConfig = {
    paper_orientation: rawConfig.paper_orientation || (effectiveTemplate?.code === 'production_landscape_a4' ? 'landscape' : 'portrait'),
    blocks: isLegacyArray ? rawConfig : (rawConfig.blocks?.length > 0 ? rawConfig.blocks : DEFAULT_LAYOUT_BLOCKS),
    theme_color: rawConfig.theme_color || '#1649c9',
    table_style: rawConfig.table_style || 'classic_border'
  };

  const isLand = layoutConfig.paper_orientation === 'landscape';
  
  // A4 Printable Dimensions in pixels (chừa thêm margin an toàn cho header/footer của Chrome)
  const A4_PRINTABLE_HEIGHT = isLand ? 650 : 970;

  useEffect(() => {
    if (!contentRef.current) return;
    let timeout;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (contentRef.current) {
          setZoomedHeight(contentRef.current.getBoundingClientRect().height);
        }
      }, 200);
    });
    resizeObserver.observe(contentRef.current);
    if (contentRef.current) {
      setZoomedHeight(contentRef.current.getBoundingClientRect().height);
    }
    return () => {
      clearTimeout(timeout);
      resizeObserver.disconnect();
    };
  }, [scale]);

  const estimatedPages = Math.max(1, Math.ceil(zoomedHeight / A4_PRINTABLE_HEIGHT));

  if (!quotation) return null;

  // Map backend quotation data to QuotationRenderer format
  const companyInfo = quotation.company_info || effectiveTemplate?.company_info || null;
  const customerInfo = quotation.customer_info || {};
  
  const quotationData = {
    ...quotation,
    // Items (sản phẩm)
    items: quotation.items || [],
    // Totals
    totals: {
      subtotal: Number(quotation.subtotal || quotation.sub_total || 0),
      discount: Number(quotation.discount_total || quotation.discount_amount || 0),
      tax: Number(quotation.vat_amount || quotation.tax_amount || 0),
      tax_percent: Number(quotation.vat_rate || quotation.tax_percent || 0),
      shipping_fee: Number(quotation.shipping_fee || 0),
      installation_fee: Number(quotation.installation_fee || 0),
      total: Number(quotation.total_amount || 0),
    },
    // Customer — merge từ nhiều nguồn
    customer: {
      name: customerInfo.name || quotation.customer_name || '',
      phone: customerInfo.phone || quotation.customer_phone || '',
      email: customerInfo.email || quotation.customer_email || '',
      address: customerInfo.address || quotation.customer_address || '',
      city: customerInfo.city || quotation.customer_city || '',
      company_name: customerInfo.company_name || quotation.customer_name || '',
      tax_code: customerInfo.tax_code || '',
      representative_name: customerInfo.representative_name || customerInfo.name || quotation.customer_name || '',
    },
    // Company — từ company_info của API
    company: companyInfo,
  };

  return (
    <div>
      <style>{`
        @media print {
          @page {
            size: ${isLand ? 'A4 landscape' : 'A4 portrait'};
            margin: 12mm;
          }
        }
      `}</style>
      {/* Zoom Controls (No Print) */}
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, background: '#f8fafc', padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <span style={{ fontWeight: 600, color: '#334155' }}>Thu phóng (Scale):</span>
        <Slider 
          min={0.5} max={1.5} step={0.05} value={scale} onChange={setScale} 
          style={{ width: 150, margin: 0 }} 
          tooltip={{ formatter: (val) => `${Math.round(val * 100)}%` }}
        />
        <span style={{ minWidth: 45, textAlign: 'right', fontWeight: 600, color: '#1649c9' }}>
          {Math.round(scale * 100)}%
        </span>
        <span style={{ marginLeft: 16, paddingLeft: 16, borderLeft: '1px solid #cbd5e1', fontWeight: 600, color: '#0f172a' }}>
          Dự kiến in: <span style={{ color: '#16a34a' }}>{estimatedPages} trang A4</span>
        </span>
        <div style={{ marginLeft: 16, paddingLeft: 16, borderLeft: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: '#334155' }}>Xem trước cắt trang:</span>
          <Switch size="small" checked={showPageBreaks} onChange={setShowPageBreaks} />
        </div>
      </div>

      <div 
        ref={contentRef}
        className="printable-quotation-content" 
        style={{ zoom: scale, position: 'relative', background: '#fff' }}
      >
        {/* Draw simulated page breaks */}
        {showPageBreaks && zoomedHeight > 0 && Array.from({ length: estimatedPages - 1 }).map((_, i) => (
          <div 
            key={i}
            className="no-print"
            style={{ position: 'absolute', top: ((i + 1) * A4_PRINTABLE_HEIGHT) / scale, left: -20, right: -20, borderTop: '2px dashed #ef4444', zIndex: 999, opacity: 0.7, pointerEvents: 'none' }}
          >
            <div style={{ position: 'absolute', right: 0, top: -11, background: '#fee2e2', color: '#ef4444', fontSize: 11, padding: '2px 8px', borderRadius: 12, border: '1px solid #ef4444', fontWeight: 600 }}>
              Cắt trang {i + 1}
            </div>
          </div>
        ))}

        <QuotationRenderer 
          layoutConfig={layoutConfig} 
          layoutStyle={effectiveTemplate?.layout_style || quotation.layout_style} 
          data={quotationData} 
        />
      </div>
    </div>
  );
}
