import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext.jsx';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function renderAuth() {
  return render(
    <AuthProvider>
      <TestComponent />
    </AuthProvider>
  );
}

function TestComponent() {
  const { user, loading, error, sessionExpired, login, logout, handleUnauthorized } = useAuth();
  return (
    <div>
      {loading && <span data-testid="loading">Loading...</span>}
      {user && <span data-testid="user">{user.email}</span>}
      {error && <span data-testid="error">{error}</span>}
      {sessionExpired && <span data-testid="session-expired">Session expired</span>}
      <button onClick={() => login('test@test.com', 'password')}>Login</button>
      <button onClick={logout}>Logout</button>
      <button onClick={handleUnauthorized}>Unauthorized</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
  });

  it('initializes with loading state', () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ authenticated: false }) });
    renderAuth();
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('sets user when authenticated', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ authenticated: true, email: 'test@test.com' }) });
    renderAuth();
    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@test.com');
    });
  });

  it('sets no user when not authenticated', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ authenticated: false }) });
    renderAuth();
    await waitFor(() => {
      expect(screen.queryByTestId('user')).not.toBeInTheDocument();
    });
  });

  it('handles login success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ authenticated: false }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ email: 'test@test.com' }) });
    renderAuth();
    await waitFor(() => screen.getByTestId('loading'));
    fireEvent.click(screen.getByText('Login'));
    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@test.com');
    });
  });

  it('handles login failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ authenticated: false }) });
    mockFetch.mockResolvedValueOnce({ ok: false, json: () => ({ error: 'Invalid email or password.' }) });
    renderAuth();
    await waitFor(() => screen.getByTestId('loading'));
    fireEvent.click(screen.getByText('Login'));
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Invalid email or password.');
    });
  });

  it('handles logout', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ authenticated: true, email: 'test@test.com' }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ ok: true }) });
    renderAuth();
    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@test.com');
    });
    fireEvent.click(screen.getByText('Logout'));
    await waitFor(() => {
      expect(screen.queryByTestId('user')).not.toBeInTheDocument();
    });
  });

  it('handles session expiration via handleUnauthorized', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ authenticated: true, email: 'test@test.com' }) });
    renderAuth();
    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@test.com');
    });
    fireEvent.click(screen.getByText('Unauthorized'));
    await waitFor(() => {
      expect(screen.queryByTestId('user')).not.toBeInTheDocument();
    });
  });
});
