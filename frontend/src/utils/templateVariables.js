/**
 * Utility functions for parsing template variables in the Quotation Builder.
 */

// Define available variables
export const TEMPLATE_VARIABLES = [
  { tag: '{{company_name}}', label: 'Tên công ty', type: 'company' },
  { tag: '{{company_address}}', label: 'Địa chỉ công ty', type: 'company' },
  { tag: '{{company_phone}}', label: 'SĐT công ty', type: 'company' },
  { tag: '{{company_email}}', label: 'Email công ty', type: 'company' },
  { tag: '{{company_tax_code}}', label: 'Mã số thuế', type: 'company' },
  { tag: '{{company_website}}', label: 'Website công ty', type: 'company' },
  { tag: '{{director_name}}', label: 'Tên giám đốc', type: 'company' },
  { tag: '{{director_title}}', label: 'Chức vụ người ĐD', type: 'company' },
  { tag: '{{company_logo}}', label: 'Logo công ty', type: 'company' },
  { tag: '{{company_stamp}}', label: 'Dấu công ty', type: 'company' },
  { tag: '{{company_signature}}', label: 'Chữ ký giám đốc', type: 'company' },
  
  { tag: '{{customer_name}}', label: 'Tên KH/Đại diện', type: 'customer' },
  { tag: '{{customer_company}}', label: 'Tên công ty KH', type: 'customer' },
  { tag: '{{customer_tax_code}}', label: 'Mã số thuế KH', type: 'customer' },
  { tag: '{{customer_address}}', label: 'Địa chỉ KH', type: 'customer' },
  { tag: '{{customer_phone}}', label: 'SĐT KH', type: 'customer' },
  { tag: '{{customer_email}}', label: 'Email KH', type: 'customer' },
  { tag: '{{customer_signature}}', label: 'Chữ ký khách hàng', type: 'customer' },
  
  { tag: '{{quotation_code}}', label: 'Mã báo giá/Đơn hàng', type: 'quotation' },
  { tag: '{{quotation_date}}', label: 'Ngày báo giá', type: 'quotation' },
  { tag: '{{current_date}}', label: 'Ngày hiện tại', type: 'quotation' },
  { tag: '{{quotation_notes}}', label: 'Ghi chú & Điều khoản chung', type: 'quotation' },
  { tag: '{{delivery_date}}', label: 'Ngày giao hàng/lắp đặt', type: 'quotation' },
  { tag: '{{delivery_time}}', label: 'Thời gian giao/thi công', type: 'quotation' },
  { tag: '{{total_amount}}', label: 'Tổng tiền', type: 'quotation' },
];

/**
 * Parses a string and replaces template variables with actual data.
 * @param {string} text - The text containing variables like {{company_name}}
 * @param {object} quotationData - Data from the quotation
 * @param {object} companyData - Data from the company
 * @param {object} totals - Data of calculated totals (optional)
 * @returns {string} - The parsed string
 */
export const parseVariables = (text, quotationData = {}, companyData = {}, totals = {}) => {
  if (!text || typeof text !== 'string') return text;

  // Prepare replacement dictionary
  const dict = {
    // Company data
    '{{company_name}}': companyData?.name || '[Tên công ty]',
    '{{company_address}}': companyData?.address || '[Địa chỉ công ty]',
    '{{company_phone}}': companyData?.phone || '[SĐT công ty]',
    '{{company_email}}': companyData?.email || '[Email công ty]',
    '{{company_tax_code}}': companyData?.tax_code || '[Mã số thuế]',
    '{{company_website}}': companyData?.website || '[Website công ty]',
    '{{director_name}}': companyData?.director_name || '[Tên giám đốc]',
    '{{director_title}}': companyData?.director_title || 'Giám đốc',
    '{{company_logo}}': companyData?.logo ? `<img src="${companyData.logo}" alt="Logo" style="max-height: 60px; object-fit: contain;" />` : '',
    '{{company_stamp}}': companyData?.stamp_image ? `<img src="${companyData.stamp_image}" alt="Stamp" style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%); max-height: 125px; opacity: 0.85; z-index: 0; object-fit: contain;" />` : '',
    '{{company_signature}}': companyData?.director_signature ? `<img src="${companyData.director_signature}" alt="Signature" style="position: relative; max-height: 70px; z-index: 10; object-fit: contain;" />` : '',
    
    // Customer data — đọc từ nhiều nguồn có thể được truyền vào
    '{{customer_name}}': quotationData?.customer?.name || quotationData?.customer?.representative_name || '',
    '{{customer_company}}': quotationData?.customer?.company_name || quotationData?.customer?.name || '',
    '{{customer_tax_code}}': quotationData?.customer?.tax_code || '',
    '{{customer_address}}': [quotationData?.customer?.address, quotationData?.customer?.city].filter(Boolean).join(' - ') || '',
    '{{customer_phone}}': quotationData?.customer?.phone || '',
    '{{customer_email}}': quotationData?.customer?.email || '',
    '{{customer_signature}}': (quotationData?.status === 'accepted' && quotationData?.signature_image) ? `<img src="${quotationData.signature_image}" alt="Signature" style="max-height: 80px; object-fit: contain;" />` : '',
    
    // Quotation data
    '{{quotation_code}}': quotationData?.code || quotationData?.order_code || quotationData?.order_number || quotationData?.quotation_number || '',
    '{{quotation_date}}': quotationData?.date || (quotationData?.created_at ? new Date(quotationData.created_at).toLocaleDateString('vi-VN') : ''),
    '{{current_date}}': new Date().toLocaleDateString('vi-VN'),
    '{{quotation_notes}}': quotationData?.notes || '',
    '{{delivery_time}}': quotationData?.delivery_time || '',
    '{{delivery_date}}': quotationData?.installation_date ? new Date(quotationData.installation_date).toLocaleDateString('vi-VN') : '',
    '{{total_amount}}': (() => {
      const total = quotationData?.total_amount || totals?.total || 0;
      return `${Number(total).toLocaleString()} đ`;
    })(),
  };

  // Replace all occurrences using regex
  return text.replace(/{{[a-zA-Z0-9_]+}}/g, match => {
    return dict[match] !== undefined ? dict[match] : match;
  });
};
