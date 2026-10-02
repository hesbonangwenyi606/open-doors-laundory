import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.jsx';

// Service worker: production only. In dev the SW's cache-first handler for
// .js/.css would serve stale Vite modules and force hard refreshes, so we
// register only for production builds — and actively remove any SW + caches
// a previous run may have left behind on this origin.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
      .catch(() => {});
    if ('caches' in window) {
      caches
        .keys()
        .then((names) => names.forEach((n) => caches.delete(n).catch(() => {})))
        .catch(() => {});
    }
  }
}

// Main entry point for the application
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);
