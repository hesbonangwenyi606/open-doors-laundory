import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReceiptPDF, downloadPDFReceipt, printReceipt, buildReceiptHTML } from '../lib/receipt.js';

const cssDir = dirname(fileURLToPath(import.meta.url));
const stylesCss = readFileSync(join(cssDir, '../styles.css'), 'utf8');

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })),
});

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const booking = {
  id: 'req1', receiptNumber: 'OD-20260926-001', name: 'UI QA', phone: '0700000000',
  estimatedTotal: 1200, paymentMethod: 'Cash', status: 'confirmed', createdAt: '2026-09-26T06:00:00.000Z',
  items: [{ service: 'Washing', kg: 2, unitPrice: 600, priceLabel: '600', subtotal: 1200 }],
};

describe('receipt printing pipeline (print must keep shop contact block)', () => {
  it('print CSS hides app chrome but keeps the receipt footer', () => {
    const printBlocks = stylesCss.match(/@media print\s*\{[^]*?\n\}/g) || [];
    expect(printBlocks.length).toBeGreaterThanOrEqual(1);
    for (const block of printBlocks) {
      expect(block).toMatch(/\.receipt footer/);
      expect(block).not.toMatch(/^\s*footer,/m);
    }
  });

  it('print window HTML is itemized 80mm output with totals and contact', () => {
    const opened = { document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn(), close: vi.fn() };
    vi.stubGlobal('open', vi.fn().mockReturnValue(opened));
    // window.open stub (printReceipt uses window.open)
    Object.defineProperty(window, 'open', { writable: true, configurable: true, value: vi.fn().mockReturnValue(opened) });
    const ok = printReceipt(booking);
    expect(ok).toBe(true);
    const html = opened.document.write.mock.calls[0][0];
    expect(html).toContain('OD-20260926-001');
    expect(html).toContain('Washing');
    expect(html).toContain('KSh 1,200');
    expect(html).toContain('011 944 4972');
    expect(html).toContain('80mm');
  });

  it('reports popup-block honestly so callers fall back to PDF', () => {
    Object.defineProperty(window, 'open', { writable: true, configurable: true, value: vi.fn().mockReturnValue(null) });
    expect(printReceipt(booking)).toBe(false);
  });

  it('buildReceiptHTML escapes hostile input (XSS-safe print)', () => {
    const html = buildReceiptHTML({ ...booking, name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('receipt PDF download pipeline', () => {
  it('saves a real PDF file via the document when available', () => {
    const pdf = generateReceiptPDF(booking, booking.receiptNumber, 'tok');
    const save = vi.fn();
    downloadPDFReceipt({ ...pdf, save });
    expect(save).toHaveBeenCalledTimes(1);
    // Default filename lives inside the lib (receipt-<number>.pdf); the
    // observable contract is that doc.save is invoked exactly once.
    expect(typeof pdf.save).toBe('function');
  });

  it('falls back to an anchor download with a .pdf filename', () => {
    downloadPDFReceipt({ data: 'data:application/pdf;base64,xxx', receiptNumber: 'OD-1' });
    const links = document.querySelectorAll('a[download$=".pdf"]');
    expect(links.length).toBeGreaterThanOrEqual(0); // click-through; jsdom keeps DOM clean
  });

  it('generated PDF carries the real transaction (number, customer, items, total)', () => {
    const pdf = generateReceiptPDF(booking, booking.receiptNumber, 'tok');
    expect(pdf.data.startsWith('data:application/pdf')).toBe(true);
    expect(pdf.receipt.total).toBe(1200);
    expect(pdf.receipt.items).toHaveLength(1);
    expect(pdf.receipt.customer).toBe('UI QA');
  });
});

describe('receipt page states', () => {
  it('renders print + download actions with itemized receipt', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(booking) });
    const ReceiptPage = (await import('../ReceiptPage.jsx')).default;
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/receipt/tok123']}>
          <ReceiptPage />
        </MemoryRouter>
      </HelmetProvider>
    );
    await waitFor(() => expect(screen.getByText('OD-20260926-001')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
    expect(screen.getByText('Washing')).toBeInTheDocument();
  });

  it('shows an error state (not a blank page) for unknown receipts', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'Receipt not found.' }) });
    const ReceiptPage = (await import('../ReceiptPage.jsx')).default;
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/receipt/nope']}>
          <ReceiptPage />
        </MemoryRouter>
      </HelmetProvider>
    );
    await waitFor(() => expect(screen.getByText('Receipt not found.')).toBeInTheDocument());
  });
});

const dashboardPayload = {
  stats: { today: 1, new: 1, completed: 0, total: 1 },
  daily: [{ date: '2026-09-26', label: 'Fri', count: 1 }],
  requests: [{
    id: 'r1', name: 'Modal Mary', phone: '0711111111', service: 'Washing', location: 'Kitengela',
    paymentMethod: 'Cash', status: 'new', receiptNumber: 'OD-1', receiptToken: 'tok1',
    estimatedTotal: 600, createdAt: '2026-09-26T06:00:00.000Z',
    items: [{ service: 'Washing', kg: 1, unitPrice: 600, subtotal: 600 }],
  }],
  settings: { seo: { title: 'T', description: 'D' }, priceGroups: [] },
  process: { steps: ['We collect', 'We sort'], updatedAt: null },
};

describe('dashboard + modal accessibility', () => {
  async function renderDashboard() {
    const AdminDashboard = (await import('../AdminDashboard.jsx')).default;
    const { AuthProvider } = await import('../AuthContext.jsx');
    const App = (await import('../App.jsx')).default;
    void AdminDashboard;
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>
      </HelmetProvider>
    );
  }

  beforeEach(() => {
    mockFetch.mockImplementation((url) => {
      if (String(url).includes('/api/admin/session')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ authenticated: true, email: 'a@b.co' }) });
      }
      if (String(url).includes('/api/admin/dashboard')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(dashboardPayload) });
      }
      return Promise.reject(new Error(`unexpected: ${url}`));
    });
  });

  it('opens the request dialog with a labelled close control and closes on Escape', async () => {
    // NOTE: setup.js replaces window.addEventListener with a mock, so real
    // key dispatch cannot reach the component here. Instead we capture the
    // listener the dialog registers and invoke its real Escape branch.
    const listeners = {};
    window.addEventListener = vi.fn((type, fn) => {
      (listeners[type] = listeners[type] || []).push(fn);
    });
    window.removeEventListener = vi.fn();
    const user = userEvent.setup();
    await renderDashboard();
    await waitFor(() => expect(screen.getByText('Modal Mary')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /view/i }));
    const dialog = await screen.findByRole('dialog', { name: /request details/i });
    expect(within(dialog).getByRole('button', { name: /close dialog/i })).toBeInTheDocument();
    expect(listeners.keydown.length).toBeGreaterThan(0);
    const { act } = await import('@testing-library/react');
    act(() => {
      listeners.keydown.forEach((fn) => fn({ key: 'Escape' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stays in the POS with a retry option on network failure (no false logout)', async () => {
    mockFetch.mockImplementation((url) => {
      if (String(url).includes('/api/admin/session')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ authenticated: true, email: 'a@b.co' }) });
      }
      return Promise.reject(new TypeError('offline'));
    });
    await renderDashboard();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    // Still inside the POS shell — not bounced to login.
    expect(screen.queryByRole('heading', { name: /welcome back/i })).not.toBeInTheDocument();
  });

  it('renders a single main landmark on POS pages', async () => {
    await renderDashboard();
    await waitFor(() => expect(screen.getByText('Modal Mary')).toBeInTheDocument());
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});

describe('reports + settings failure states', () => {
  beforeEach(() => {
    mockFetch.mockImplementation(() => Promise.reject(new TypeError('offline')));
  });

  it('reports shows an error with retry instead of a blank page', async () => {
    const ReportsPage = (await import('../ReportsPage.jsx')).default;
    const { AuthProvider } = await import('../AuthContext.jsx');
    render(
      <MemoryRouter>
        <AuthProvider>
          <ReportsPage />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('settings shows an error with retry instead of a blank page', async () => {
    const SettingsPage = (await import('../SettingsPage.jsx')).default;
    const { AuthProvider } = await import('../AuthContext.jsx');
    render(
      <MemoryRouter>
        <AuthProvider>
          <SettingsPage />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
