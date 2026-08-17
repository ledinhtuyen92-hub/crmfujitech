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
  { tag: '{{customer_address}}', label: 'Địa chỉ KH', type: 'customer' },
  { tag: '{{customer_phone}}', label: 'SĐT KH', type: 'customer' },
  { tag: '{{customer_email}}', label: 'Email KH', type: 'customer' },
  
  { tag: '{{quotation_code}}', label: 'Mã báo giá/Đơn hàng', type: 'quotation' },
  { tag: '{{quotation_date}}', label: 'Ngày báo giá', type: 'quotation' },
  { tag: '{{current_date}}', label: 'Ngày hiện tại', type: 'quotation' },
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
    '{{company_logo}}': companyData?.logo ? `<img src="${companyData.logo}" alt="Logo" style="max-height: 60px; object-fit: contain;" />` : '[Logo công ty]',
    '{{company_stamp}}': companyData?.stamp_image ? `<img src="${companyData.stamp_image}" alt="Stamp" style="max-height: 100px; object-fit: contain;" />` : '[Dấu công ty]',
    '{{company_signature}}': companyData?.director_signature ? `<img src="${companyData.director_signature}" alt="Signature" style="max-height: 80px; object-fit: contain;" />` : '[Chữ ký]',
    
    // Customer data
    '{{customer_name}}': quotationData?.customer?.name || '[Tên khách hàng]',
    '{{customer_company}}': quotationData?.customer?.company_name || quotationData?.customer?.name || '[Tên công ty KH]',
    '{{customer_address}}': quotationData?.customer?.address || '[Địa chỉ khách hàng]',
    '{{customer_phone}}': quotationData?.customer?.phone || '[SĐT khách hàng]',
    '{{customer_email}}': quotationData?.customer?.email || '[Email khách hàng]',
    
    // Quotation data
    '{{quotation_code}}': quotationData?.code || quotationData?.order_code || '[Mã báo giá/đơn hàng]',
    '{{quotation_date}}': quotationData?.date || '[Ngày báo giá]',
    '{{current_date}}': new Date().toLocaleDateString('vi-VN'),
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
