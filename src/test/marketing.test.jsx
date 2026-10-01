import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from '../App.jsx';

const mockFetch = vi.fn();
global.fetch = mockFetch;

// jsdom has no matchMedia (used by the theme toggle).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function renderAt(path) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  // Auth session check: logged out. Site settings: realistic price list.
  mockFetch.mockImplementation((url) => {
    if (String(url).includes('/api/admin/session')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ authenticated: false }) });
    }
    if (String(url).includes('/api/site-settings')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            priceGroups: [
              { t: 'Full load services', items: [['Washing', '600']] },
              { t: 'Popular items', items: [['T-shirt', '200']] },
            ],
          }),
      });
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
});

describe('marketing routes render real content (not just header/footer)', () => {
  it.each([
    ['/', 'So fresh, so clean, so you.'],
    ['/services', 'Our services.'],
    ['/process', 'Simple as 1-2-3.'],
    ['/about', 'Who we are.'],
    ['/contact', 'Get in touch.'],
    ['/faq', 'Common questions.'],
    ['/pricing', 'Know before you load.'],
    ['/booking', 'Schedule your pickup.'],
  ])('%s renders its page content', async (path, text) => {
    renderAt(path);
    await waitFor(() => {
      // Headings (not body copy) prove the page component rendered inside
      // the layout route — header/footer alone contain none of these.
      expect(screen.getByRole('heading', { name: text })).toBeInTheDocument();
    });
  });

  it('renders exactly one site header and footer on the homepage (no nested layouts)', async () => {
    renderAt('/');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'So fresh, so clean, so you.' })).toBeInTheDocument();
    });
    // One brand link in header + one in footer = 2; nested layouts would double this.
    const brands = screen.getAllByText('OPEN DOORS');
    expect(brands.length).toBe(2);
  });

  it('shows exactly one h1 per marketing page', async () => {
    renderAt('/services');
    await waitFor(() => {
      expect(screen.getByText('Our services.')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('contains no fabricated testimonials or placeholder links', async () => {
    renderAt('/');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'So fresh, so clean, so you.' })).toBeInTheDocument();
    });
    const main = screen.getByRole('main');
    expect(within(main).queryByText(/Jane W\.|Peter M\.|Best laundromat in Kitengela/)).not.toBeInTheDocument();
    expect(document.querySelectorAll('a[href="#"]')).toHaveLength(0);
  });

  it('keeps the POS behind authentication', async () => {
    renderAt('/dashboard');
    await waitFor(() => {
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('So fresh, so clean, so you.')).not.toBeInTheDocument();
  });
});
