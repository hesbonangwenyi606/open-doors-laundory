import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import {
  addToCart, setLineQty, removeFromCart, cartTotal, cartCount, buildOfflineOrder, clampQty,
} from '../lib/pos.js';
import { db, addOrderTransaction, upsertServerOrders, upsertServerCustomers } from '../lib/db.js';

const WASH = { serviceName: 'Washing', unitPrice: 600, category: 'Full load services' };
const DRY = { serviceName: 'Drying', unitPrice: 600, category: 'Full load services' };

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })),
});

describe('POS cart (offline, integer KES math)', () => {
  it('adds services and merges repeated adds', () => {
    let cart = [];
    cart = addToCart(cart, WASH, 2);
    cart = addToCart(cart, WASH, 1);
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ qty: 3, subtotal: 1800 });
  });

  it('clamps quantities to 1–25', () => {
    expect(clampQty(0)).toBe(1);
    expect(clampQty(99)).toBe(25);
    expect(clampQty('abc')).toBe(1);
    let cart = addToCart([], DRY, 30);
    expect(cart[0].qty).toBe(25);
    cart = setLineQty(cart, 'Drying', 0);
    expect(cart[0].qty).toBe(1);
  });

  it('removes lines and totals correctly', () => {
    let cart = addToCart([], WASH, 2); // 1200
    cart = addToCart(cart, DRY, 1); // +600
    expect(cartTotal(cart)).toBe(1800);
    expect(cartCount(cart)).toBe(3);
    cart = removeFromCart(cart, 'Washing');
    expect(cartTotal(cart)).toBe(600);
  });

  it('builds an offline order record from cart + customer + payment', () => {
    const cart = addToCart(addToCart([], WASH, 2), DRY, 1);
    const order = buildOfflineOrder({ cart, customerName: 'Jane', paymentMethod: 'Cash', notes: '' });
    expect(order.totalAmount).toBe(1800);
    expect(order.paymentStatus).toBe('paid');
    expect(order.items).toHaveLength(2);
    const mpesa = buildOfflineOrder({ cart, customerName: '', paymentMethod: 'M-Pesa' });
    expect(mpesa.customerName).toBe('Walk-in');
    expect(mpesa.paymentStatus).toBe('pending');
  });
});

describe('atomic sale persistence (order + payment + outbox in one transaction)', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('commits order, payment and both outbox entries together', async () => {
    const cart = addToCart([], WASH, 2);
    const order = buildOfflineOrder({ cart, customerName: 'Atomic QA', paymentMethod: 'Cash' });
    const result = await addOrderTransaction({
      order,
      payment: { amount: 1200, method: 'Cash', reference: 'CASH-1', createdAt: new Date().toISOString() },
    });
    expect(result.orderId).toBeTruthy();
    expect(result.paymentId).toBeTruthy();
    expect(result.outboxIds).toHaveLength(2);
    const saved = await db.orders.get(result.orderId);
    expect(saved.totalAmount).toBe(1200);
    expect(saved.syncStatus).toBe('pending');
    expect(saved.clientId).toBe(result.orderClientId);
    const payments = await db.payments.toArray();
    expect(payments[0].orderId).toBe(result.orderId);
  });

  it('works without a payment (walk-in quote flow)', async () => {
    const cart = addToCart([], DRY, 1);
    const result = await addOrderTransaction({ order: buildOfflineOrder({ cart, customerName: 'Q' }) });
    expect(result.paymentId).toBeNull();
    expect(result.outboxIds).toHaveLength(1);
  });
});

describe('server mirror (local-first lists)', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('mirrors server orders without touching pending local rows', async () => {
    await db.orders.add({
      clientId: 'client_local1', customerName: 'Local', service: 'Washing', totalAmount: 600,
      status: 'pending', syncStatus: 'pending', items: [], createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), lastSyncedAt: null,
    });
    const { mirrored } = await upsertServerOrders([
      { id: 'srv1', name: 'Server Customer', phone: '0700000000', service: 'Washing', estimatedTotal: 600, status: 'confirmed', paymentStatus: 'pending', paymentMethod: 'Cash', items: [{ service: 'Washing', kg: 1, unitPrice: 600, subtotal: 600 }], receiptNumber: 'OD-1', receiptToken: 'tok', createdAt: new Date().toISOString() },
    ]);
    expect(mirrored).toBe(1);
    const all = await db.orders.toArray();
    expect(all).toHaveLength(2);
    expect(all.find((o) => o.clientId === 'client_local1').syncStatus).toBe('pending');
    const mirror = all.find((o) => o.clientId === 'server_srv1');
    expect(mirror.externalId).toBe('srv1');
    expect(mirror.totalAmount).toBe(600);
    // Re-mirror is idempotent (update, not duplicate).
    await upsertServerOrders([
      { id: 'srv1', name: 'Server Customer', phone: '0700000000', service: 'Washing', estimatedTotal: 600, status: 'completed', items: [], createdAt: new Date().toISOString() },
    ]);
    expect(await db.orders.count()).toBe(2);
    expect((await db.orders.where('clientId').equals('server_srv1').first()).status).toBe('completed');
  });

  it('mirrors server customers by phone without duplicating pending locals', async () => {
    await db.customers.add({
      clientId: 'client_c1', name: 'Local Gal', phone: '0711111111', syncStatus: 'pending',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSyncedAt: null,
    });
    await upsertServerCustomers([{ id: 's1', name: 'Srv', phone: '0722222222', location: 'Kitengela', createdAt: new Date().toISOString() }]);
    await upsertServerCustomers([{ id: 's1', name: 'Srv', phone: '0722222222', location: 'Kitengela', createdAt: new Date().toISOString() }]);
    const all = await db.customers.toArray();
    expect(all).toHaveLength(2);
    expect(all.find((c) => c.phone === '0711111111').syncStatus).toBe('pending');
  });
});

describe('POS vs marketing routing separation', () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockImplementation((url) => {
      if (String(url).includes('/api/admin/session')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ authenticated: true, email: 'cashier@test.co' }) });
      }
      if (String(url).includes('/api/site-settings')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ priceGroups: [] }) });
      }
      if (String(url).includes('/api/admin/dashboard')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ requests: [] }) });
      }
      return Promise.reject(new Error(`unexpected: ${url}`));
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POS nav links to an in-POS sale screen, never to marketing /services', async () => {
    const App = (await import('../App.jsx')).default;
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <App />
        </MemoryRouter>
      </HelmetProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'POS' })).toBeInTheDocument();
    });
    const posNav = screen.getByRole('navigation', { name: 'POS' });
    expect(within(posNav).getByRole('link', { name: /new sale/i }).getAttribute('href')).toBe('/new-order');
    expect(within(posNav).queryByRole('link', { name: /^services$/i })).not.toBeInTheDocument();
  });

  it('/new-order renders the POS sale screen inside the POS shell when authenticated', async () => {
    const App = (await import('../App.jsx')).default;
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/new-order']}>
          <App />
        </MemoryRouter>
      </HelmetProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New sale.' })).toBeInTheDocument();
    });
    // Inside POS shell (sidebar brand), not marketing layout.
    expect(screen.getAllByText('OPEN DOORS').length).toBeGreaterThanOrEqual(1);
  });

  it('public /services still renders the marketing page', async () => {
    const App = (await import('../App.jsx')).default;
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/services']}>
          <App />
        </MemoryRouter>
      </HelmetProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Our services.' })).toBeInTheDocument();
    });
  });
});

describe('single theme system (persistence)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('toggles light/dark, persists, and sets data-theme', async () => {
    const { useTheme } = await import('../hooks/useTheme.js');
    const React = await import('react');
    let api = null;
    function Probe() {
      api = useTheme();
      return null;
    }
    render(<Probe />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    const { act } = await import('@testing-library/react');
    act(() => {
      api.toggleTheme();
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('od-theme')).toBe('dark');
    act(() => {
      api.toggleTheme();
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(React).toBeTruthy();
  });
});

describe('POS shell theme toggle (click-level)', () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockImplementation((url) => {
      if (String(url).includes('/api/admin/session')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ authenticated: true, email: 'cashier@test.co' }) });
      }
      if (String(url).includes('/api/site-settings')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ priceGroups: [] }) });
      }
      if (String(url).includes('/api/admin/dashboard')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ requests: [] }) });
      }
      if (String(url).includes('/api/process')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error(`unexpected: ${url}`));
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('toggles theme from the POS header and persists across remount (restart)', async () => {
    const { default: POSLayout } = await import('../POSLayout.jsx');
    const { AuthProvider } = await import('../AuthContext.jsx');
    const user = (await import('@testing-library/user-event')).default.setup();
    const { unmount } = render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/orders']}>
          <AuthProvider>
            <POSLayout><div>probe</div></POSLayout>
          </AuthProvider>
        </MemoryRouter>
      </HelmetProvider>
    );
    const toggle = await screen.findByRole('button', { name: /switch to dark mode/i });
    await user.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('od-theme')).toBe('dark');
    // "Restart": full unmount + fresh mount reads the persisted theme.
    unmount();
    cleanup();
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/orders']}>
          <AuthProvider>
            <POSLayout><div>probe</div></POSLayout>
          </AuthProvider>
        </MemoryRouter>
      </HelmetProvider>
    );
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
    expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument();
  });
});
