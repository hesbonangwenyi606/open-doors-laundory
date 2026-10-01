import React, { useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AuthProvider } from './AuthContext.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import LoginPage from './LoginPage.jsx';
import MarketingLayout from './MarketingLayout.jsx';
import POSLayout from './POSLayout.jsx';
import BookingForm from './BookingForm.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import ReceiptPage from './ReceiptPage.jsx';
import FAQPage from './FAQPage.jsx';
import NotFound from './NotFound.jsx';
import OrdersPage from './OrdersPage.jsx';
import CustomersPage from './CustomersPage.jsx';
import PaymentsPage from './PaymentsPage.jsx';
import ReportsPage from './ReportsPage.jsx';
import SettingsPage from './SettingsPage.jsx';
import OfflinePOSPage from './OfflinePOSPage.jsx';
import POSSalePage from './POSSalePage.jsx';
import HomePage from './HomePage.jsx';
import ServicesPage from './ServicesPage.jsx';
import ProcessPage from './ProcessPage.jsx';
import AboutPage from './AboutPage.jsx';
import ContactPage from './ContactPage.jsx';
import './styles.css';

const SITE_URL = 'https://open-doors-laundory.vercel.app';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}


// Page wrappers (inline for POS-specific pages)
function PricingPage() {
  const [siteSettings, setSiteSettings] = useState(null);

  const priceGroups = [
    {
      t: 'Full load services',
      items: [
        ['Washing', '600'], ['Drying', '600'], ['Ironing', '700'],
        ['Wash, dry & fold', '1,200'], ['Wash, dry, iron & hang', '1,700'],
        ['Excess per kilo', '140'],
      ],
    },
    {
      t: 'Popular items',
      items: [
        ['T-shirt', '200'], ['Shirt / blouse / skirt', '200'],
        ['Trouser / dress', '200'], ['Track suit', '300'],
        ['Jacket — normal', '300'], ['Suit — two piece', '700'],
      ],
    },
    {
      t: 'Home essentials',
      items: [
        ['Duvet cover', '300'], ['Bedsheet — each', '200'],
        ['Curtains per kg', '300'], ['Pillow', '200'],
        ['Towel', '200'], ['Duvet / blanket 2kg', '700'],
      ],
    },
  ];

  useEffect(() => {
    fetch('/api/site-settings')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => { setSiteSettings(data); })
      .catch(() => {});
  }, []);

  return (
    <>
      <Helmet>
        <title>Pricing | Open Doors Laundromat</title>
        <meta name="description" content="Clear, honest pricing for all laundry services. Know before you load." />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`${SITE_URL}/pricing`} />
        <meta property="og:title" content="Pricing | Open Doors Laundromat" />
        <meta property="og:description" content="Clear, honest pricing for all laundry services." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE_URL}/pricing`} />
        <meta property="og:image" content={`${SITE_URL}/assets/pricing-guide-full.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Pricing | Open Doors Laundromat" />
        <meta name="twitter:description" content="Clear, honest pricing for all laundry services." />
        <meta name="twitter:image" content={`${SITE_URL}/assets/pricing-guide-full.jpg`} />
      </Helmet>

      <section className="section pricing" id="pricing">
        <div className="section-head">
          <div>
            <p className="eyebrow">Clear, honest pricing</p>
            <h2>Know before you load.</h2>
          </div>
          <p>
            Prices in Kenyan shillings. Final charges are confirmed after garment inspection.
          </p>
        </div>
        <div className="price-grid">
          {(siteSettings?.priceGroups || priceGroups).map((g) => (
            <article key={g.t}>
              <h3>{g.t}</h3>
              {g.items.map((x) => (
                <div className="price-row" key={x[0]}>
                  <span>{x[0]}</span>
                  <b>KSh {x[1]}</b>
                </div>
              ))}
            </article>
          ))}
        </div>
        <figure className="pricing-guide">
          <img src="/assets/pricing-guide-full.jpg" alt="Complete Open Doors Laundromat pricing guide" width="900" height="auto" loading="lazy" />
          <figcaption>Full pricing guide — tap or click to view clearly</figcaption>
        </figure>
        <p className="note">
          Pay by Cash or M-Pesa. A printed or PDF receipt is issued for every order.
        </p>
      </section>
    </>
  );
}

function BookingPageWrapper() {
  return (
    <>
      <Helmet>
        <title>Book a Pickup | Open Doors Laundromat</title>
        <meta name="description" content="Schedule your laundry pickup with Open Doors Laundromat." />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`${SITE_URL}/booking`} />
        <meta property="og:title" content="Book a Pickup | Open Doors Laundromat" />
        <meta property="og:description" content="Schedule your laundry pickup." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE_URL}/booking`} />
        <meta property="og:image" content={`${SITE_URL}/assets/laundry-machines.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Book a Pickup | Open Doors Laundromat" />
        <meta name="twitter:description" content="Schedule your laundry pickup." />
        <meta name="twitter:image" content={`${SITE_URL}/assets/laundry-machines.jpg`} />
      </Helmet>
      <BookingForm />
    </>
  );
}

function AdminPageWrapper() {
  return (
    <>
      <Helmet>
        <title>Admin Dashboard | Open Doors Laundromat</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content="Admin dashboard for managing Open Doors Laundromat." />
      </Helmet>
      <AdminDashboard />
    </>
  );
}

function ReceiptPageWrapper() {
  return (
    <>
      <Helmet>
        <title>Receipt | Open Doors Laundromat</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content="Your Open Doors Laundromat service request receipt." />
      </Helmet>
      <ReceiptPage />
    </>
  );
}

// Main App with AuthProvider and proper routing
export default function App() {
  useEffect(() => {
    const handleUnauthorized = () => {};
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  return (
    <AuthProvider>
      <ScrollToTop />
      <Routes>
        {/* Public routes with MarketingLayout */}
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/process" element={<ProcessPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/booking" element={<BookingPageWrapper />} />
          <Route path="/faq" element={<FAQPage />} />
        </Route>

        {/* Login route (public) */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected POS routes */}
        <Route path="/admin" element={
          <ProtectedRoute>
            <POSLayout><AdminPageWrapper /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/*" element={
          <ProtectedRoute>
            <POSLayout><AdminPageWrapper /></POSLayout>
          </ProtectedRoute>
        } />

        {/* Protected POS routes */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <POSLayout><AdminPageWrapper /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/orders" element={
          <ProtectedRoute>
            <POSLayout><OrdersPage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/new-order" element={
          <ProtectedRoute>
            <POSLayout><POSSalePage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/customers" element={
          <ProtectedRoute>
            <POSLayout><CustomersPage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/payments" element={
          <ProtectedRoute>
            <POSLayout><PaymentsPage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/reports" element={
          <ProtectedRoute>
            <POSLayout><ReportsPage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute>
            <POSLayout><SettingsPage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/offline-pos" element={
          <ProtectedRoute>
            <POSLayout><OfflinePOSPage /></POSLayout>
          </ProtectedRoute>
        } />

        {/* Receipt (public) */}
        <Route path="/receipt/:token" element={<ReceiptPageWrapper />} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
