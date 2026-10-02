import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import OrdersPage from '../OrdersPage.jsx';
import { useOfflineOrders } from '../hooks/useOffline.js';
import { upsertServerOrders } from '../lib/db.js';

vi.mock('../hooks/useOffline.js', () => ({ useOfflineOrders: vi.fn() }));
vi.mock('../lib/db.js', () => ({ upsertServerOrders: vi.fn() }));

const booking = {
  id: 7,
  externalId: 'booking-1',
  clientId: 'server_booking-1',
  receiptNumber: 'OD-20261002-001',
  receiptToken: 'receipt-token',
  customerName: 'Ann Kamau',
  name: 'Ann Kamau',
  phone: '0712345678',
  servedBy: 'Miriam',
  location: 'Kitengela',
  notes: 'Call on arrival',
  service: 'Curtains per kg x1, Duvet cover x2',
  totalAmount: 2700,
  estimatedTotal: 2700,
  paymentStatus: 'pending',
  paymentMethod: 'Unpaid',
  status: 'ironing',
  items: [
    { id: 'item-1', service: 'Curtains per kg', kg: 1, unitPrice: 300, originalSubtotal: 300, subtotal: 300 },
    { id: 'item-2', service: 'Duvet cover', kg: 2, unitPrice: 1200, originalSubtotal: 2400, subtotal: 2400 },
  ],
  createdAt: '2026-10-02T08:00:00.000Z',
};

function jsonResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(data) };
}

describe('booking ready, payment, and receipt workflow', () => {
  const mockFetch = vi.fn();
  const refresh = vi.fn();
  let readyBooking;
  let paidBooking;

  beforeEach(() => {
    mockFetch.mockReset();
    refresh.mockReset();
    readyBooking = { ...booking, status: 'ready_for_collection' };
    paidBooking = { ...readyBooking, paymentStatus: 'paid', paymentMethod: 'M-Pesa', paymentReference: 'QWE123456' };
    useOfflineOrders.mockReturnValue({ orders: [booking], loading: false, refresh });
    upsertServerOrders.mockReset().mockResolvedValue({ mirrored: 1 });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    mockFetch.mockImplementation((url, options = {}) => {
      if (String(url).includes('/api/admin/dashboard')) {
        return Promise.resolve(jsonResponse({ requests: [booking] }));
      }
      if (String(url).endsWith('/api/admin/requests/booking-1/payment')) {
        expect(JSON.parse(options.body)).toEqual({ method: 'M-Pesa', reference: 'QWE123456' });
        return Promise.resolve(jsonResponse(paidBooking));
      }
      if (String(url).endsWith('/api/admin/requests/booking-1')) {
        expect(JSON.parse(options.body)).toEqual({ status: 'ready_for_collection' });
        return Promise.resolve(jsonResponse(readyBooking));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('cancels ready status, then confirms it, records M-Pesa, and offers receipt printing', async () => {
    const user = userEvent.setup();
    const printWindow = {
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(printWindow);
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    await screen.findByText('Ann Kamau');
    expect(screen.getByRole('heading', { name: 'Bookings' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Booking' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Served By' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Action' })).toBeInTheDocument();

    const statusSelect = screen.getByRole('combobox', { name: /booking status/i });
    await user.selectOptions(statusSelect, 'ready_for_collection');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Ready for collection?');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockFetch.mock.calls.some(([url, options]) => String(url).endsWith('/api/admin/requests/booking-1') && options?.method === 'PATCH')).toBe(false);

    await user.selectOptions(statusSelect, 'ready_for_collection');
    await user.click(screen.getByRole('button', { name: 'Yes, Ready for Collection' }));
    const details = await screen.findByRole('dialog', { name: 'Ann Kamau' });
    expect(within(details).getByText('Miriam')).toBeInTheDocument();
    expect(within(details).getByText('Kitengela')).toBeInTheDocument();
    expect(within(details).getByText('Curtains per kg')).toBeInTheDocument();
    expect(within(details).getByText('Duvet cover')).toBeInTheDocument();
    expect(within(details).getByRole('link', { name: /notify customer via whatsapp/i })).toHaveAttribute('href', expect.stringContaining('wa.me/254712345678'));

    await user.selectOptions(within(details).getByLabelText('Payment method'), 'M-Pesa');
    await user.type(within(details).getByLabelText('M-Pesa transaction code'), 'QWE123456');
    await user.click(within(details).getByRole('button', { name: /record payment/i }));
    await waitFor(() => expect(within(details).getByText(/Paid earlier · M-Pesa · QWE123456/)).toBeInTheDocument());
    expect(within(details).getByRole('button', { name: /print receipt/i })).toBeInTheDocument();
    const printPrompt = await screen.findByRole('alertdialog', { name: 'Payment recorded' });
    expect(printPrompt).toHaveTextContent('Would you like to print the receipt');
    await user.click(within(printPrompt).getByRole('button', { name: 'Print Receipt' }));
    expect(screen.queryByRole('alertdialog', { name: 'Payment recorded' })).not.toBeInTheDocument();
    expect(window.open).toHaveBeenCalled();
  });
});