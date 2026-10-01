import React from 'react';
import { ArrowUpRight, Menu, X, Sun, Moon, LogIn, Phone, MapPin, Mail } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import './MarketingLayout.css';

// Production site URL as configured in sitemap.xml / vercel deployment.
// Used for absolute canonical + Open Graph URLs.
const SITE_URL = 'https://open-doors-laundory.vercel.app';

const business = {
  name: 'Open Doors Laundromat',
  address: 'Chuna Mall, Ground Floor, Shop 10, Kitengela, Kenya',
  phone: '011 944 4972',
  email: 'opendoorslaundromat@gmail.com',
  whatsapp: 'https://wa.me/254119444972',
  hours: {
    weekday: 'Mon – Sat: 8:00 am – 9:00 pm',
    sunday: 'Sun: 2:00 pm – 7:00 pm',
    holidays: 'Public holidays: 9:00 am – 7:00 pm',
  },
  areas: ['Kitengela', 'Kisaju', 'Isinya', 'Athi River', 'Mlolongo', 'Kajiado'],
};

const services = [
  { name: 'Wash & Fold', desc: 'Everyday laundry, expertly sorted, washed, dried and neatly folded.', price: 'From KSh 1,200 / load', icon: '🧺' },
  { name: 'Dry Cleaning', desc: 'Careful treatment for suits, dresses, delicate fabrics and special garments.', price: 'Priced per item', icon: '👔' },
  { name: 'Ironing & Steaming', desc: 'Crisp, polished finishing for your wardrobe, uniforms and linens.', price: 'From KSh 700 / load', icon: '🔥' },
  { name: 'Pickup & Delivery', desc: 'Door-to-door convenience across Kitengela, Kisaju, Isinya and Athi River.', price: 'Available daily', icon: '🚚' },
];

const processSteps = [
  { step: '01', title: 'We Collect', desc: 'Drop off your laundry at Chuna Mall or schedule a pickup from your location.' },
  { step: '02', title: 'We Sort', desc: 'Every item is carefully inspected and sorted by fabric type and care needs.' },
  { step: '03', title: 'We Clean', desc: 'Professional washing, drying, and ironing using premium detergents and equipment.' },
  { step: '04', title: 'We Finish', desc: 'Quality check ensures every garment meets our standards before packaging.' },
  { step: '05', title: 'We Deliver', desc: 'Fresh, clean clothes returned to your doorstep on schedule.' },
];

const faqs = [
  { q: 'Where is Open Doors Laundromat located?', a: 'We are located at Chuna Mall, Ground Floor, Shop 10, Kitengela, Kenya. We serve Kitengela, Kisaju, Isinya, Athi River, Mlolongo, and Kajiado.' },
  { q: 'What laundry services do you offer?', a: 'We offer wash & fold, dry cleaning, ironing & steaming, and pickup & delivery services. See our Services page for details.' },
  { q: 'How does the pickup and delivery work?', a: 'You can schedule a pickup through our website or visit us directly at Chuna Mall. We collect your laundry, clean it, and deliver it back to your doorstep.' },
  { q: 'What are your business hours?', a: 'Monday – Saturday: 8:00 am – 9:00 pm. Sunday: 2:00 pm – 7:00 pm. Public holidays: 9:00 am – 7:00 pm.' },
  { q: 'How do I pay?', a: 'We accept Cash and M-Pesa payments. You can choose your preferred payment method when placing your booking.' },
  { q: 'Can I track my order?', a: 'Yes! Once you place an order, you receive a receipt with a unique number and token. You can check the status through your dashboard.' },
  { q: 'How do I contact customer support?', a: 'Call us at 011 944 4972, email opendoorslaundromat@gmail.com, or chat with us on WhatsApp.' },
];

export function MarketingLayout({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [theme, setTheme] = React.useState(() => {
    return localStorage.getItem('od-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('od-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  const navItems = [
    { path: '/', label: 'Home' },
    { path: '/services', label: 'Services' },
    { path: '/process', label: 'How It Works' },
    { path: '/about', label: 'About' },
    { path: '/contact', label: 'Contact' },
    { path: '/faq', label: 'FAQ' },
  ];

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="topbar">
        <span>Express wash in just 4 hours</span>
        <span>{business.address}</span>
      </div>
      <header>
        <a className="brand" href="/">
          <span className="logo-crop">
            <img src="/assets/logo.jpg" alt="Open Doors Laundromat logo" width="54" height="54" />
          </span>
          <span>
            OPEN DOORS<small>Laundromat</small>
          </span>
        </a>
        <nav className={mobileMenuOpen ? 'open' : ''}>
          {navItems.map(({ path, label }) => (
            <a
              key={path}
              href={path}
              onClick={(e) => { e.preventDefault(); navigate(path); setMobileMenuOpen(false); }}
              className={location.pathname === path ? 'active' : ''}
            >
              {label}
            </a>
          ))}
          {user ? (
            <a className="nav-cta" href="/dashboard" onClick={(e) => { e.preventDefault(); navigate('/dashboard'); setMobileMenuOpen(false); }}>
              Dashboard
            </a>
          ) : (
            <>
              <a className="nav-cta" href="/login" onClick={(e) => { e.preventDefault(); navigate('/login'); setMobileMenuOpen(false); }}>
                <LogIn size={16} /> Sign in
              </a>
              <a className="nav-cta nav-cta-secondary" href="/booking" onClick={(e) => { e.preventDefault(); navigate('/booking'); setMobileMenuOpen(false); }}>
                Get Started
              </a>
            </>
          )}
        </nav>
        <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle navigation menu">
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>
      <main id="main-content">{children ?? <Outlet />}</main>
      <Footer />
    </>
  );
}

function Footer() {
  return (
    <footer>
      <div className="footer-main">
        <div className="footer-intro">
          <div className="brand footer-brand">
            <span className="logo-crop">
              <img src="/assets/logo.jpg" alt="Open Doors Laundromat logo" width="42" height="42" />
            </span>
            <span>
              OPEN DOORS<small>Laundromat</small>
            </span>
          </div>
          <p>Professional laundry and garment care in Kitengela, Kenya. Wash & fold, dry cleaning, ironing, and pickup & delivery.</p>
          <a className="footer-cta" href={business.whatsapp} target="_blank" rel="noopener noreferrer">
            Book a pickup <ArrowUpRight size={18} />
          </a>
        </div>
        <div className="footer-column">
          <h3>Services</h3>
          <a href="/services">Wash & Fold</a>
          <a href="/services">Dry Cleaning</a>
          <a href="/services">Ironing</a>
          <a href="/services">Pickup & Delivery</a>
        </div>
        <div className="footer-column">
          <h3>Business</h3>
          <a href="/">Home</a>
          <a href="/process">How It Works</a>
          <a href="/about">About Us</a>
          <a href="/faq">FAQ</a>
          <a href="/contact">Contact</a>
        </div>
        <div className="footer-column">
          <h3>Contact</h3>
          <a href={`tel:${business.phone.replace(/\s/g, '')}`}><Phone size={16} /> {business.phone}</a>
          <a href={`mailto:${business.email}`}><Mail size={16} /> {business.email}</a>
          <a href={business.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          <a href="https://www.google.com/maps/search/?api=1&query=Chuna+Mall+Kitengela" target="_blank" rel="noopener noreferrer"><MapPin size={16} /> Chuna Mall, Kitengela</a>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© 2026 Open Doors Laundromat</p>
        <p className="footer-tagline">So fresh, so clean, so you.</p>
        <button type="button" className="footer-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          Back to top ↑
        </button>
      </div>
    </footer>
  );
}

export { business, services, processSteps, faqs, SITE_URL };
export default MarketingLayout;
