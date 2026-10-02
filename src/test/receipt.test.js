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

  it('shows an unpaid balance for Unpaid and pending payment methods', () => {
    const r = normalizeReceiptData({
      name: 'A',
      estimatedTotal: 540,
      paymentMethod: 'Unpaid',
      paymentStatus: 'pending',
      items: [],
    });
    expect(r.paid).toBe(0);
    expect(r.balanceDue).toBe(540);
    expect(r.change).toBe(0);
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
    const html = buildReceiptHTML({ ...serverBooking, servedBy: 'Miriam', paymentReference: 'QWE123456' });
    expect(html).toContain('OD-20260926-001');
    expect(html).toContain('QA Test Customer');
    expect(html).toContain('Served by: Miriam');
    expect(html).toContain('M-Pesa code: QWE123456');
    expect(html).toContain('1,200');
  });

  it('prints the actual discount percentage and amount in a compact receipt format', () => {
    const html = buildReceiptHTML({
      ...serverBooking,
      estimatedTotal: 1080,
      items: [{
        service: 'Washing',
        kg: 2,
        unitPrice: 600,
        originalSubtotal: 1200,
        discountAllowed: true,
        discountPercent: 10,
        discountAmount: 120,
        subtotal: 1080,
      }, {
        service: 'Drying',
        kg: 1,
        unitPrice: 600,
        originalSubtotal: 600,
        discountAllowed: false,
        discountPercent: 0,
        discountAmount: 0,
        subtotal: 600,
      }],
    });
    expect(html).toContain('2 x KSh 600');
    expect(html).toContain('Discount (10%): -KSh 120');
    expect(html).toContain('No discount');
    expect(html).not.toContain('Discount allowed');

    const pdf = generateReceiptPDF({
      ...serverBooking,
      servedBy: 'Miriam',
      paymentReference: 'QWE123456',
      estimatedTotal: 1080,
      items: [{
        service: 'Washing',
        kg: 2,
        unitPrice: 600,
        originalSubtotal: 1200,
        discountAllowed: true,
        discountPercent: 10,
        discountAmount: 120,
        subtotal: 1080,
      }],
    });
    expect(pdf.doc.output()).toContain('Discount \\(10%\\): -KSh 120');
    expect(pdf.doc.output()).toContain('Served by: Miriam');
    expect(pdf.doc.output()).toContain('M-Pesa code: QWE123456');
  });

  it('derives the applied discount from original and final prices if permission metadata is inconsistent', () => {
    const receipt = normalizeReceiptData({
      estimatedTotal: 2100,
      items: [{
        service: 'Curtains per kg',
        kg: 1,
        unitPrice: 3000,
        originalSubtotal: 3000,
        discountAllowed: false,
        discountPercent: 0,
        discountAmount: 0,
        subtotal: 2100,
      }],
    });
    expect(receipt.items[0]).toMatchObject({ discountPercent: 30, discountAmount: 900, subtotal: 2100 });
    expect(buildReceiptHTML(receipt)).toContain('Discount (30%): -KSh 900');
  });
});
