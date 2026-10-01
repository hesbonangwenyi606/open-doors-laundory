import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock jsPDF globally
const mockDoc = {
  setFontSize: vi.fn(),
  setFont: vi.fn(),
  text: vi.fn(),
  line: vi.fn(),
  setLineWidth: vi.fn(),
  output: vi.fn().mockReturnValue('mock-pdf-text'),
  internal: { pageSize: { getWidth: () => 210 } },
};

global.jsPDF = vi.fn().mockImplementation(() => mockDoc);

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

Object.defineProperty(navigator, 'onLine', {
  get: () => true,
  configurable: true,
});

window.addEventListener = vi.fn();
window.removeEventListener = vi.fn();
window.dispatchEvent = vi.fn();
