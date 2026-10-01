import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Clock, MapPin, Phone, Zap, Shield, Check, PackageCheck } from 'lucide-react';
import { services, processSteps, business, SITE_URL } from './MarketingLayout.jsx';

const structuredData = {
  "@context": "https://schema.org",
  "@type": "Laundromat",
  "name": business.name,
  "description": "Laundry and garment care in Kitengela: wash & fold, dry cleaning, ironing, and pickup & delivery.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Chuna Mall, Ground Floor, Shop 10",
    "addressLocality": "Kitengela",
    "addressCountry": "KE"
  },
  "telephone": business.phone,
  "url": `${SITE_URL}/`,
  "email": business.email,
  "openingHours": [
    "Mo-Sa 08:00-21:00",
    "Su 14:00-19:00"
  ],
  "areaServed": ["Kitengela", "Kisaju", "Isinya", "Athi River", "Mlolongo", "Kajiado"],
  "paymentAccepted": ["Cash", "M-Pesa"],
  "image": [`${SITE_URL}/assets/laundry-machines.jpg`]
};

// Customer-facing order statuses, matching the POS lifecycle
// (new → confirmed → completed; receipts carry a unique number + token).
const orderStatuses = [
  { step: '01', title: 'Drop off', desc: 'Bring laundry to Shop 10, Chuna Mall, or book a pickup.' },
  { step: '02', title: 'Confirmed', desc: 'Your request is confirmed and queued with a receipt number.' },
  { step: '03', title: 'Processing', desc: 'Sorted, washed, dried and finished by fabric type.' },
  { step: '04', title: 'Ready & collected', desc: 'Collect in store or get it delivered when ready.' },
];

export default function HomePage() {
  const navigate = useNavigate();
  return (
    <>
      <Helmet>
        <title>Open Doors Laundromat | Laundry Services in Kitengela</title>
        <meta name="description" content="Laundry and garment care in Kitengela: wash & fold, dry cleaning, ironing, and pickup & delivery from Chuna Mall, Shop 10." />
        <link rel="canonical" href={`${SITE_URL}/`} />
        <meta property="og:title" content="Open Doors Laundromat | Laundry Services in Kitengela" />
        <meta property="og:description" content="Wash & fold, dry cleaning, ironing, and pickup & delivery in Kitengela, Kisaju, Isinya and Athi River." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE_URL}/`} />
        <meta property="og:image" content={`${SITE_URL}/assets/laundry-machines.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Open Doors Laundromat | Laundry Services in Kitengela" />
        <meta name="twitter:description" content="Wash & fold, dry cleaning, ironing, and pickup & delivery in Kitengela, Kisaju, Isinya and Athi River." />
        <meta name="twitter:image" content={`${SITE_URL}/assets/laundry-machines.jpg`} />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <section className="hero">
        <div className="hero-content">
          <p className="eyebrow">Laundry service in Kitengela</p>
          <h1>So fresh, so clean, so you.</h1>
          <p>Professional wash & fold, dry cleaning, ironing, and pickup & delivery from Chuna Mall, Shop 10, Kitengela.</p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => navigate('/booking')}>
              Book a pickup <ArrowUpRight size={18} />
            </button>
            <button className="btn-secondary" onClick={() => navigate('/services')}>
              View services
            </button>
          </div>
          <div className="hero-trust">
            <div className="trust-item"><Check size={16} /> Pickup & delivery available</div>
            <div className="trust-item"><Clock size={16} /> Express 4-hour wash</div>
            <div className="trust-item"><Shield size={16} /> Checked before packaging</div>
          </div>
        </div>
        <div className="hero-visual">
          <img src="/assets/laundry-machines.jpg" alt="Washing machines at Open Doors Laundromat in Kitengela" loading="eager" fetchPriority="high" />
          <div className="hero-badge">
            <Zap size={20} />
            <span>Express wash in 4 hours</span>
          </div>
        </div>
      </section>

      <section className="services-section" id="services">
        <div className="section-head">
          <div>
            <p className="eyebrow">What we do</p>
            <h2>Our services.</h2>
          </div>
          <p>From everyday laundry to delicate dry cleaning, we handle it all with care.</p>
        </div>
        <div className="services-grid">
          {services.map((service) => (
            <article key={service.name} className="service-card">
              <span className="service-icon" aria-hidden="true">{service.icon}</span>
              <h3>{service.name}</h3>
              <p>{service.desc}</p>
              <span className="service-price">{service.price}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="process-section" id="process">
        <div className="section-head">
          <div>
            <p className="eyebrow">How it works</p>
            <h2>Simple as 1-2-3.</h2>
          </div>
          <p>From drop-off to delivery, our process keeps your laundry moving.</p>
        </div>
        <div className="process-steps">
          {processSteps.map((step, i) => (
            <div key={step.step} className="process-step">
              <div className="process-step-num" aria-hidden="true">{step.step}</div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
              {i < processSteps.length - 1 && <div className="process-arrow" aria-hidden="true"><ArrowUpRight size={20} /></div>}
            </div>
          ))}
        </div>
      </section>

      <section className="status-section" id="order-status">
        <div className="section-head">
          <div>
            <p className="eyebrow">Order tracking</p>
            <h2>Know where your laundry is.</h2>
          </div>
          <p>Every booking gets a receipt with a unique number. Your order moves through these stages.</p>
        </div>
        <div className="process-steps">
          {orderStatuses.map((step) => (
            <div key={step.step} className="process-step">
              <div className="process-step-num" aria-hidden="true">{step.step}</div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
        <p className="status-note"><PackageCheck size={16} /> Pay by Cash or M-Pesa. A printed or PDF receipt is issued for every order.</p>
      </section>

      <section className="location-section" id="location">
        <div className="section-head">
          <div>
            <p className="eyebrow">Visit us</p>
            <h2>Find us.</h2>
          </div>
          <p>Drop off your laundry or schedule a pickup from anywhere in the greater Kitengela area.</p>
        </div>
        <div className="location-grid">
          <div className="location-card">
            <h3>Chuna Mall, Kitengela</h3>
            <p><MapPin size={16} /> Ground Floor, Shop 10, Chuna Mall, Kitengela, Kenya</p>
            <p><Phone size={16} /> <a href={`tel:${business.phone.replace(/\s/g, '')}`}>{business.phone}</a></p>
            <p><Clock size={16} /> Mon–Sat: 8am–9pm</p>
            <p><Clock size={16} /> Sun: 2pm–7pm</p>
            <div className="location-actions">
              <a className="btn-secondary" href="https://www.google.com/maps/search/?api=1&query=Chuna+Mall+Kitengela" target="_blank" rel="noopener noreferrer">
                Get directions <ArrowUpRight size={16} />
              </a>
              <a className="btn-secondary" href={business.whatsapp} target="_blank" rel="noopener noreferrer">
                WhatsApp us <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
          <div className="location-map">
            <img src="/assets/storefront.jpg" alt="Chuna Mall area where Open Doors Laundromat is located, Shop 10" loading="lazy" />
            <div className="location-overlay">
              <p>Serving Kitengela, Kisaju, Isinya, Athi River, Mlolongo & Kajiado</p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-content">
          <h2>Ready for a fresh start?</h2>
          <p>Book your pickup today from Chuna Mall, Kitengela.</p>
          <button className="btn-primary" onClick={() => navigate('/booking')}>
            Book a pickup <ArrowUpRight size={18} />
          </button>
        </div>
      </section>
    </>
  );
}
