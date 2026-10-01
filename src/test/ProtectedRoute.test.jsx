import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../AuthContext.jsx';
import ProtectedRoute from '../ProtectedRoute.jsx';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function renderProtected() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <ProtectedRoute>
          <div data-testid="protected-content">Protected Content</div>
        </ProtectedRoute>
      </AuthProvider>
    </BrowserRouter>
  );
}

function renderUnprotected() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <div>
          <span>App rendered</span>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('redirects to login when not authenticated', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ authenticated: false }) });
    renderProtected();
    await waitFor(() => {
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  it('shows loading state while checking session', () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ authenticated: true }) });
    renderProtected();
    expect(screen.getByText('Verifying session…')).toBeInTheDocument();
  });

  it('renders children when authenticated', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ authenticated: true, email: 'test@test.com' }) });
    renderProtected();
    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });
});

describe('AuthContext - Session Handling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('verifies session on app load', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => ({ authenticated: true, email: 'test@test.com' }) });
    renderUnprotected();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/session');
    });
  });

  it('handles 401 from session check', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: () => ({ authenticated: false }) });
    renderUnprotected();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/session');
    });
  });
});
