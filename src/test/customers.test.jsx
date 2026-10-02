import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CustomersPage from '../CustomersPage.jsx';
import { useOffline, useOfflineCustomers } from '../hooks/useOffline.js';

vi.mock('../hooks/useOffline.js', () => ({
  useOffline: vi.fn(),
  useOfflineCustomers: vi.fn(),
}));

describe('customer creation form', () => {
  const createCustomerOffline = vi.fn();
  const refresh = vi.fn();

  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    createCustomerOffline.mockReset().mockResolvedValue(1);
    refresh.mockReset();
    useOffline.mockReturnValue({ createCustomerOffline });
    useOfflineCustomers.mockReturnValue({ customers: [], loading: false, refresh });
  });

  afterEach(() => cleanup());

  it('opens the customer form and saves the requested fields', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /create customer/i }));
    const dialog = screen.getByRole('dialog', { name: /create customer/i });
    expect(dialog).toBeInTheDocument();

    await user.type(screen.getByLabelText('Customer Name'), 'Amina Njeri');
    await user.type(screen.getByLabelText('Phone number'), '0712345678');
    await user.type(screen.getByLabelText('Email'), 'amina@example.com');
    await user.type(screen.getByLabelText('Served By'), 'Miriam');
    fireEvent.submit(dialog.querySelector('form'));

    await waitFor(() => {
      expect(createCustomerOffline).toHaveBeenCalledWith({
        name: 'Amina Njeri',
        phone: '0712345678',
        email: 'amina@example.com',
        servedBy: 'Miriam',
      });
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(await screen.findByText('Amina Njeri was added to the customer directory.')).toBeInTheDocument();
  });

  it('shows newest customers first in a table and offers deletion', async () => {
    const deleteCustomerOffline = vi.fn().mockResolvedValue(true);
    const olderCustomer = {
      id: 1,
      clientId: 'client_older',
      name: 'Older Customer',
      phone: '0700000001',
      email: 'older@example.com',
      servedBy: 'Cashier',
      createdAt: '2026-09-01T10:00:00.000Z',
    };
    const newerCustomer = {
      id: 2,
      clientId: 'client_newer',
      name: 'Newest Customer',
      phone: '0700000002',
      email: 'newest@example.com',
      servedBy: 'Miriam',
      createdAt: '2026-10-01T10:00:00.000Z',
    };
    useOffline.mockReturnValue({ createCustomerOffline, deleteCustomerOffline });
    useOfflineCustomers.mockReturnValue({ customers: [olderCustomer, newerCustomer], loading: false, refresh });
    window.confirm = vi.fn().mockReturnValue(true);
    const POSSalePage = (await import('../POSSalePage.jsx')).default;
    useOffline.mockReturnValue({
      createCustomerOffline,
      deleteCustomerOffline,
      isOnline: false,
      backendDown: false,
      pendingCount: 0,
      catalog: [],
      catalogSyncedAt: null,
      processOutbox: vi.fn(),
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/customers']}>
        <Routes>
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/new-order" element={<POSSalePage />} />
        </Routes>
      </MemoryRouter>
    );

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText('Newest Customer')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Older Customer')).toBeInTheDocument();
    expect(within(rows[1]).getByText('newest@example.com')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Miriam')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Older Customer' }));
    await waitFor(() => expect(deleteCustomerOffline).toHaveBeenCalledWith(olderCustomer));

    await user.click(within(rows[1]).getByRole('button', { name: /new booking/i }));
    expect(await screen.findByLabelText('Customer name')).toHaveValue('Newest Customer');
    expect(screen.getByLabelText('Customer phone')).toHaveValue('0700000002');
    expect(screen.getByLabelText('Served by')).toHaveValue('Miriam');
  });
});