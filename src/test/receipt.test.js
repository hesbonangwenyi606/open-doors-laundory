import { describe, it, expect } from 'vitest';
import { normalizeReceiptData, generateReceiptPDF, buildReceiptHTML } from '../lib/receipt.js';

const serverBooking = {
  id: 'req_123',
  receiptNumber: 'OD-20260926-001',
  name: 'QA Test Customer',
  phone: '0700000000',
  estimatedTotal: 1200,
  paymentMethod: 'Cash',
  status: 'new',
  createdAt: '2026-09-26T06:00:00.000Z',
  items: [{ service: 'Washing', kg: 2, unitPrice: 600, priceLabel: '600', subtotal: 1200 }],
};

describe('receipt normalization (single authoritative representation)', () => {
  it('normalizes a server booking receipt', () => {
    const r = normalizeReceiptData(serverBooking, 'OD-20260926-001', 'tok123');
    expect(r.customer).toBe('QA Test Customer');
    expect(r.total).toBe(1200);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].subtotal).toBe(1200);
    expect(r.change).toBe(0);
  });

  it('normalizes an offline order shape', () => {
    const r = normalizeReceiptData(
      { id: 7, customerName: 'Walk-in', totalAmount: 600, service: 'Drying', items: [{ name: 'Drying', price: 600 }] },
      'OD-20260926-007',
      'tok7'
    );
    expect(r.total).toBe(600);
    expect(r.items[0].service).toBe('Drying');
  });

  it('handles orders with no items without crashing', () => {
    const r = normalizeReceiptData({ id: 'x', name: 'A', estimatedTotal: 0, items: [] }, 'OD-1', 't');
    expect(r.total).toBe(0);
    expect(r.items).toHaveLength(0);
  });
});

describe('receipt PDF generation (real transaction data)', () => {
  it('generates a PDF data URI from a real booking', () => {
    const pdf = generateReceiptPDF(serverBooking, 'OD-20260926-001', 'tok123');
    expect(pdf.data.startsWith('data:application/pdf')).toBe(true);
    expect(pdf.receipt.receiptNumber).toBe('OD-20260926-001');
    expect(pdf.receipt.total).toBe(1200);
  });

  it('generates a PDF for an item-less order without crashing', () => {
    const pdf = generateReceiptPDF({ id: 'x', name: 'A', estimatedTotal: 0, items: [] }, 'OD-1', 't');
    expect(pdf.data.startsWith('data:application/pdf')).toBe(true);
  });

  it('builds thermal-printer HTML containing authoritative totals', () => {
    const html = buildReceiptHTML(serverBooking);
    expect(html).toContain('OD-20260926-001');
    expect(html).toContain('QA Test Customer');
    expect(html).toContain('1,200');
  });
});
