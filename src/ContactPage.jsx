import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Phone, MapPin, Clock, Mail, MessageCircle } from 'lucide-react';
import { business, SITE_URL } from './MarketingLayout.jsx';

const structuredData = {
  "@context": "https://schema.org",
  "@type": "Laundromat",
  "name": business.name,
  "description": "Contact Open Doors Laundromat in Kitengela, Kenya for laundry services.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Chuna Mall, Ground Floor, Shop 10",
    "addressLocality": "Kitengela",
    "addressCountry": "KE"
  },
  "telephone": business.phone,
  "email": business.email,
  "url": `${SITE_URL}/contact`,
  "image": [`${SITE_URL}/assets/storefront.jpg`],
  "openingHours": ["Mo-Sa 08:00-21:00", "Su 14:00-19:00"]
};

export default function ContactPage() {
  const navigate = useNavigate();
  return (
    <>
      <Helmet>
        <title>Contact Us | Open Doors Laundromat</title>
        <meta name="description" content="Contact Open Doors Laundromat in Kitengela, Kenya. Phone, email, WhatsApp, and location." />
        <link rel="canonical" href={`${SITE_URL}/contact`} />
        <meta property="og:title" content="Contact Us | Open Doors Laundromat" />
        <meta property="og:description" content="Contact Open Doors Laundromat." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE_URL}/contact`} />
        <meta property="og:image" content={`${SITE_URL}/assets/storefront.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Contact Us | Open Doors Laundromat" />
        <meta name="twitter:description" content="Contact Open Doors Laundromat." />
        <meta name="twitter:image" content={`${SITE_URL}/assets/storefront.jpg`} />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <section className="contact-page">
        <div className="section-head">
          <div>
            <p className="eyebrow">Contact us</p>
            <h1>Get in touch.</h1>
          </div>
          <p>We are here to help with your laundry needs.</p>
        </div>
        <div className="contact-grid">
          <div className="contact-info">
            <div className="contact-item">
              <Phone size={20} />
              <div>
                <h4>Phone</h4>
                <a href={`tel:${business.phone}`}>{business.phone}</a>
              </div>
            </div>
            <div className="contact-item">
              <Mail size={20} />
              <div>
                <h4>Email</h4>
                <a href={`mailto:${business.email}`}>{business.email}</a>
              </div>
            </div>
            <div className="contact-item">
              <MessageCircle size={20} />
              <div>
                <h4>WhatsApp</h4>
                <a href={business.whatsapp} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
              </div>
            </div>
            <div className="contact-item">
              <MapPin size={20} />
              <div>
                <h4>Location</h4>
                <a href="https://www.google.com/maps/search/?api=1&query=Chuna+Mall+Kitengela" target="_blank" rel="noopener noreferrer">
                  {business.address}
                </a>
              </div>
            </div>
            <div className="contact-item">
              <Clock size={20} />
              <div>
                <h4>Business Hours</h4>
                <p>{business.hours.weekday}</p>
                <p>{business.hours.sunday}</p>
                <p>{business.hours.holidays}</p>
              </div>
            </div>
            <button className="btn-primary" onClick={() => navigate('/booking')}>
              Book a pickup <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="contact-map">
            <img src="/assets/storefront.jpg" alt="Chuna Mall, home of Open Doors Laundromat, Shop 10" loading="lazy" />
            <div className="map-overlay">
              <p>Chuna Mall, Ground Floor, Shop 10, Kitengela</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
