import { jsPDF } from 'jspdf';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatKES(value) {
  return `KSh ${toNumber(value).toLocaleString('en-KE')}`;
}

/**
 * Normalize both server booking receipts and offline-POS orders into one
 * authoritative receipt representation.
 *
 * Server shape: { id, receiptNumber, name, phone, estimatedTotal, paymentMethod,
 *   mpesaPhone, location, notes, status, createdAt, items: [{service, kg, unitPrice, priceLabel, subtotal}] }
 * Offline shape: { id, customerName, customerPhone, totalAmount, service, items: [{name, price}], status, createdAt, notes }
 */
export function normalizeReceiptData(order = {}, receiptNumber = '', receiptToken = '') {
  const items = Array.isArray(order.items) ? order.items : [];
  const normalizedItems = items.map((item, index) => {
    const service = item.service || item.name || 'Item';
    const qty = toNumber(item.kg ?? item.quantity ?? 1, 1);
    const unitPrice = toNumber(item.unitPrice ?? item.price ?? 0, 0);
    const subtotal = toNumber(item.subtotal ?? unitPrice * qty, 0);
    const originalSubtotal = toNumber(item.originalSubtotal ?? unitPrice * qty, unitPrice * qty);
    const discountAllowed = item.discountAllowed === true || item.discountAllowed === 1 || item.discountAllowed === 'true';
    const discountAmount = Math.max(0, originalSubtotal - subtotal);
    const storedPercent = toNumber(item.discountPercent, 0);
    const discountPercent = discountAmount > 0
      ? (storedPercent > 0 ? storedPercent : Math.round(discountAmount / originalSubtotal * 10000) / 100)
      : 0;
    return { index: index + 1, service, qty, unitPrice, originalSubtotal, discountAllowed, discountPercent, discountAmount, subtotal };
  });

  const total = toNumber(
    order.estimatedTotal ?? order.totalAmount ?? normalizedItems.reduce((s, i) => s + i.subtotal, 0),
    0
  );
  const defaultPaid = order.paymentStatus === 'paid' ||
    (!order.paymentStatus && (!order.paymentMethod || order.paymentMethod === 'Cash'))
    ? total
    : 0;
  const paid = toNumber(order.paidAmount ?? order.amountPaid ?? defaultPaid, defaultPaid);
  return {
    receiptNumber: receiptNumber || order.receiptNumber || '',
    receiptToken: receiptToken || order.receiptToken || '',
    orderId: order.id || '',
    customer: order.name || order.customerName || order.customer?.name || 'Walk-in',
    phone: order.phone || order.customerPhone || order.customer?.phone || '',
    servedBy: order.servedBy || order.attendant || '',
    location: order.location || '',
    paymentMethod: order.paymentMethod || order.method || 'Cash',
    mpesaPhone: order.mpesaPhone || '',
    paymentReference: order.paymentReference || order.reference || '',
    items: normalizedItems,
    total,
    paid,
    change: Math.max(0, paid - total),
    balanceDue: Math.max(0, total - paid),
    status: order.status || 'completed',
    notes: order.notes || '',
    createdAt: order.createdAt || new Date().toISOString(),
  };
}

export function generateReceiptPDF(order, receiptNumber, receiptToken) {
  const receipt = normalizeReceiptData(order, receiptNumber, receiptToken);

  const doc = new jsPDF({ unit: 'mm', format: [80, 200] });
  const pageWidth = doc.internal.pageSize.getWidth();
  const cx = pageWidth / 2;
  let y = 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('OPEN DOORS LAUNDROMAT', cx, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Chuna Mall, Ground Floor, Shop 10, Kitengela', cx, y, { align: 'center' });
  y += 4;
  doc.text('011 944 4972', cx, y, { align: 'center' });
  y += 6;

  doc.setFontSize(8);
  doc.text(`Receipt: ${receipt.receiptNumber}`, 6, y);
  y += 4;
  doc.text(`Date: ${new Date(receipt.createdAt).toLocaleString('en-KE')}`, 6, y);
  y += 4;
  doc.text(`Customer: ${receipt.customer}${receipt.phone ? ` (${receipt.phone})` : ''}`, 6, y);
  y += 4;
  doc.text(`Served by: ${receipt.servedBy || 'Not recorded'}`, 6, y);
  y += 4;
  doc.text(`Payment: ${receipt.paymentMethod}${receipt.mpesaPhone ? ` (${receipt.mpesaPhone})` : ''}`, 6, y);
  if (receipt.paymentReference) {
    y += 4;
    doc.text(`M-Pesa code: ${receipt.paymentReference}`, 6, y);
  }
  y += 4;
  doc.text(`Order: ${receipt.status}`, 6, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.text('ITEM', 6, y);
  doc.text('TOTAL', pageWidth - 6, y, { align: 'right' });
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  if (receipt.items.length === 0) {
    doc.text('No items', 6, y);
    y += 4;
  } else {
    receipt.items.forEach((item) => {
      const label = doc.splitTextToSize(`${item.service} x ${item.qty}`, pageWidth - 39);
      doc.setFont('helvetica', 'bold');
      doc.text(label, 6, y);
      doc.text(formatKES(item.subtotal), pageWidth - 6, y, { align: 'right' });
      y += label.length * 3.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(`${item.qty} x ${formatKES(item.unitPrice)}`, 6, y);
      y += 3.5;
      const discountText = item.discountAmount > 0
        ? `Discount (${item.discountPercent}%): -${formatKES(item.discountAmount)}`
        : 'No discount';
      doc.text(discountText, 6, y);
      y += 4;
      doc.setDrawColor(175);
      doc.line(6, y, pageWidth - 6, y);
      y += 3;
      doc.setFontSize(7.5);
      if (y > 180) {
        doc.addPage();
        y = 12;
      }
    });
  }

  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Total: ${formatKES(receipt.total)}`, 6, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Paid: ${formatKES(receipt.paid)}`, 6, y);
  y += 4;
  if (receipt.balanceDue > 0) {
    doc.text(`Balance due: ${formatKES(receipt.balanceDue)}`, 6, y);
  } else {
    doc.text(`Change: ${formatKES(receipt.change)}`, 6, y);
  }
  y += 6;
  if (receipt.paymentReference) {
    doc.setFontSize(7);
    doc.text(`M-Pesa code: ${receipt.paymentReference}`, 6, y);
    y += 4;
  }

  if (receipt.notes) {
    doc.setFontSize(7);
    doc.text(`Notes: ${String(receipt.notes).slice(0, 120)}`, 6, y);
    y += 4;
  }
  doc.setFontSize(7);
  doc.text('Thank you for choosing Open Doors!', cx, y + 2, { align: 'center' });

  const pdfData = doc.output('datauristring');

  return {
    receiptNumber: receipt.receiptNumber,
    receiptToken: receipt.receiptToken,
    data: pdfData,
    format: 'application/pdf',
    receipt,
    doc,
    save: (filename) => doc.save(filename || `receipt-${receipt.receiptNumber || 'receipt'}.pdf`),
  };
}

export function buildReceiptHTML(receiptLike) {
  const receipt = receiptLike?.receipt ? receiptLike : normalizeReceiptData(receiptLike);
  const items = (receipt.items || [])
    .map(
      (item) => `
      <div class="receipt-line">
        <span class="receipt-item-name">${escapeHtml(item.service)} x ${item.qty}<small>${item.qty} x ${escapeHtml(formatKES(item.unitPrice))}</small><small>${item.discountAmount > 0 ? `Discount (${escapeHtml(item.discountPercent)}%): -${escapeHtml(formatKES(item.discountAmount))}` : 'No discount'}</small></span>
        <b>${escapeHtml(formatKES(item.subtotal))}</b>
      </div>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt ${escapeHtml(
    receipt.receiptNumber
  )}</title><style>
    @page { size: 80mm auto; margin: 0; }
    body { font-family: monospace, sans-serif; font-size: 12px; margin: 8px; color: #111; max-width: 72mm; }
    h1 { font-size: 16px; text-align: center; margin: 0; }
    .center { text-align: center; } .small { font-size: 10px; color: #444; }
    .receipt-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 8px; padding: 4px 0; border-bottom: 1px dashed #999; }
    .receipt-item-name { min-width: 0; overflow-wrap: anywhere; }
    .receipt-line small { display: block; font-size: 9px; color: #444; }
    .total { display: flex; justify-content: space-between; font-weight: bold; border-top: 2px solid #111; margin-top: 6px; padding-top: 6px; }
    @media print { button { display: none; } }
  </style></head><body>
    <h1>OPEN DOORS LAUNDROMAT</h1>
    <p class="center small">Chuna Mall, Shop 10, Kitengela<br/>011 944 4972</p>
    <p>Receipt: <b>${escapeHtml(receipt.receiptNumber)}</b><br/>Date: ${escapeHtml(
    new Date(receipt.createdAt).toLocaleString('en-KE')
  )}<br/>Customer: <b>${escapeHtml(receipt.customer)}</b>${receipt.phone ? ` (${escapeHtml(receipt.phone)})` : ''}<br/>Payment: ${escapeHtml(
    receipt.paymentMethod
  )}${receipt.paymentReference ? `<br/>M-Pesa code: ${escapeHtml(receipt.paymentReference)}` : ''}<br/>Served by: ${escapeHtml(receipt.servedBy || 'Not recorded')}<br/>Status: ${escapeHtml(receipt.status)}</p>
    ${items}
    <div class="total"><span>Total</span><b>${escapeHtml(formatKES(receipt.total))}</b></div>
    <p class="center small">Thank you for choosing Open Doors.<br/>So fresh, so clean, so you.</p>
  </body></html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function downloadReceipt(receiptData) {
  const text = receiptData?.receipt
    ? [
        'OPEN DOORS LAUNDROMAT',
        `Receipt: ${receiptData.receipt.receiptNumber}`,
        `Customer: ${receiptData.receipt.customer}`,
        `Total: ${formatKES(receiptData.receipt.total)}`,
      ].join('\n')
    : String(receiptData?.data ?? '');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt-${receiptData?.receiptNumber || 'receipt'}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadPDFReceipt(receiptData) {
  // receiptData is the object returned by generateReceiptPDF
  if (receiptData?.save && typeof receiptData.save === 'function') {
    receiptData.save();
    return;
  }
  const link = document.createElement('a');
  link.href = receiptData.data;
  link.download = `receipt-${receiptData.receiptNumber || 'receipt'}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Thermal-printer friendly: open an 80mm HTML receipt in a print window.
 * Returns false when popups are blocked so callers can fall back to PDF download.
 * Never claims success — the browser print dialog is the source of truth.
 */
export function printReceipt(receiptData) {
  try {
    const html = receiptData?.receipt || receiptData?.receiptNumber ? buildReceiptHTML(receiptData) : null;
    const printWindow = window.open('', '_blank', 'width=320,height=600');
    if (!printWindow) return false;
    printWindow.document.write(html || buildReceiptHTML({ items: [], total: 0 }));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
      } catch {
        // browser blocked print; user still has the window + PDF fallback
      }
    }, 400);
    return true;
  } catch {
    return false;
  }
}
