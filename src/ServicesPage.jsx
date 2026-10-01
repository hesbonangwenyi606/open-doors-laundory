import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Zap, Truck, Shield, MapPin } from 'lucide-react';
import { services, business, SITE_URL } from './MarketingLayout.jsx';

const structuredData = {
  "@context": "https://schema.org",
  "@type": "Service",
  "name": business.name,
  "description": "Laundry and garment care services including wash & fold, dry cleaning, ironing, and pickup & delivery.",
  "provider": {
    "@type": "Laundromat",
    "name": business.name,
    "address": { "@type": "PostalAddress", "streetAddress": "Chuna Mall, Ground Floor, Shop 10", "addressLocality": "Kitengela", "addressCountry": "KE" },
    "telephone": business.phone
  },
  "serviceType": ["Wash & Fold", "Dry Cleaning", "Ironing", "Pickup & Delivery"],
  "areaServed": ["Kitengela", "Kisaju", "Isinya", "Athi River", "Mlolongo", "Kajiado"]
};

// Fallback matches the admin-managed price list; live data is fetched below.
const fallbackGroups = [
  { t: 'Full load services', items: [['Washing', '600'], ['Drying', '600'], ['Ironing', '700'], ['Wash, dry & fold', '1,200'], ['Wash, dry, iron & hang', '1,700'], ['Excess per kilo', '140']] },
  { t: 'Popular items', items: [['T-shirt', '200'], ['Shirt / blouse / skirt', '200'], ['Trouser / dress', '200'], ['Track suit', '300'], ['Jacket — normal', '300'], ['Suit — two piece', '700']] },
  { t: 'Home essentials', items: [['Duvet cover', '300'], ['Bedsheet — each', '200'], ['Curtains per kg', '300'], ['Pillow', '200'], ['Towel', '200'], ['Duvet / blanket 2kg', '700']] },
];

export default function ServicesPage() {
  const navigate = useNavigate();
  const [priceGroups, setPriceGroups] = useState(fallbackGroups);

  useEffect(() => {
    fetch('/api/site-settings')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (Array.isArray(data.priceGroups) && data.priceGroups.length > 0) {
          setPriceGroups(data.priceGroups);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <Helmet>
        <title>Our Services | Open Doors Laundromat</title>
        <meta name="description" content="Wash & fold, dry cleaning, ironing, and pickup & delivery in Kitengela, Kisaju, Isinya and Athi River." />
        <link rel="canonical" href={`${SITE_URL}/services`} />
        <meta property="og:title" content="Our Services | Open Doors Laundromat" />
        <meta property="og:description" content="Wash & fold, dry cleaning, ironing, and pickup & delivery." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE_URL}/services`} />
        <meta property="og:image" content={`${SITE_URL}/assets/laundry-machines.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Our Services | Open Doors Laundromat" />
        <meta name="twitter:description" content="Wash & fold, dry cleaning, ironing, and pickup & delivery." />
        <meta name="twitter:image" content={`${SITE_URL}/assets/laundry-machines.jpg`} />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <section className="services-page-hero">
        <div className="section-head">
          <div>
            <p className="eyebrow">What we offer</p>
            <h1>Our services.</h1>
          </div>
          <p>From everyday laundry to delicate dry cleaning, we handle it all with care.</p>
        </div>
      </section>

      <section className="services-grid-page">
        {services.map((service) => (
          <article key={service.name} className="service-card-lg">
            <span className="service-icon-lg" aria-hidden="true">{service.icon}</span>
            <h2>{service.name}</h2>
            <p>{service.desc}</p>
            <span className="service-price-lg">{service.price}</span>
            <button className="btn-secondary" onClick={() => navigate('/booking')}>
              Book now <ArrowUpRight size={16} />
            </button>
          </article>
        ))}
      </section>

      <section className="pricing-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Pricing</p>
            <h2>Transparent pricing.</h2>
          </div>
          <p>No hidden fees. Final charges confirmed after garment inspection.</p>
        </div>
        <div className="pricing-grid">
          {priceGroups.map((g) => (
            <div className="pricing-card" key={g.t}>
              <h3>{g.t}</h3>
              <ul>
                {(g.items || []).map((x) => {
                  const [name, price] = Array.isArray(x) ? x : [x.serviceName, x.price];
                  return (
                    <li key={name}><span>{name}</span><span>KSh {price}</span></li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <p className="note">
          Prices in Kenyan shillings. Pay by Cash or M-Pesa — a receipt is issued for every order.
        </p>
      </section>

      <section className="why-choose">
        <div className="section-head">
          <div>
            <p className="eyebrow">Why choose us</p>
            <h2>Reasons to switch.</h2>
          </div>
        </div>
        <div className="why-grid">
          <div className="why-item">
            <Zap size={24} />
            <h3>Express 4-hour wash</h3>
            <p>Get your laundry back the same day with our express service.</p>
          </div>
          <div className="why-item">
            <Truck size={24} />
            <h3>Pickup & delivery</h3>
            <p>Door-to-door convenience across Kitengela, Kisaju, Isinya and Athi River.</p>
          </div>
          <div className="why-item">
            <Shield size={24} />
            <h3>Checked with care</h3>
            <p>Every garment is inspected and handled with care before packaging.</p>
          </div>
          <div className="why-item">
            <MapPin size={24} />
            <h3>Easy to find</h3>
            <p>Visit us at Chuna Mall, Ground Floor, Shop 10, Kitengela.</p>
          </div>
        </div>
      </section>
    </>
  );
}
