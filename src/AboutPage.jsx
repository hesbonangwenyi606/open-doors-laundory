import React from 'react';
import { Helmet } from 'react-helmet-async';
import { business, SITE_URL } from './MarketingLayout.jsx';

const structuredData = {
  "@context": "https://schema.org",
  "@type": "Laundromat",
  "name": business.name,
  "description": "Laundry and garment care service in Kitengela, Kenya.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Chuna Mall, Ground Floor, Shop 10",
    "addressLocality": "Kitengela",
    "addressCountry": "KE"
  },
  "telephone": business.phone,
  "url": `${SITE_URL}/about`,
  "email": business.email,
  "image": [`${SITE_URL}/assets/laundry-machines.jpg`]
};

export default function AboutPage() {
  return (
    <>
      <Helmet>
        <title>About Us | Open Doors Laundromat</title>
        <meta name="description" content="Learn about Open Doors Laundromat — laundry service in Kitengela, Kenya." />
        <link rel="canonical" href={`${SITE_URL}/about`} />
        <meta property="og:title" content="About Us | Open Doors Laundromat" />
        <meta property="og:description" content="Learn about Open Doors Laundromat." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE_URL}/about`} />
        <meta property="og:image" content={`${SITE_URL}/assets/laundry-machines.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About Us | Open Doors Laundromat" />
        <meta name="twitter:description" content="Learn about Open Doors Laundromat." />
        <meta name="twitter:image" content={`${SITE_URL}/assets/laundry-machines.jpg`} />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <section className="about-page">
        <div className="section-head">
          <div>
            <p className="eyebrow">About us</p>
            <h1>Who we are.</h1>
          </div>
          <p>We are a professional laundry service dedicated to quality and convenience.</p>
        </div>
        <div className="about-content">
          <div className="about-text">
            <p>
              Open Doors Laundromat is a laundry and garment care service located at Chuna Mall, Ground Floor, Shop 10, Kitengela, Kenya. We serve the communities of Kitengela, Kisaju, Isinya, Athi River, Mlolongo, and Kajiado.
            </p>
            <p>
              Our mission is simple: deliver fresh, clean, and professionally handled laundry to your doorstep. Whether it's everyday clothing, delicate fabrics, or bulky household items, we treat every garment with the same level of care.
            </p>
            <p>
              We offer wash & fold, dry cleaning, ironing & steaming, and pickup & delivery services. Our express wash option returns your laundry in just 4 hours.
            </p>
<div className="about-highlights">
  <div className="about-highlight">
    <h3>Our Process</h3>
    <p>Collect → Sort → Clean → Finish → Deliver</p>
  </div>
  <div className="about-highlight">
    <h3>Service Areas</h3>
    <p>Kitengela, Kisaju, Isinya, Athi River, Mlolongo, Kajiado</p>
  </div>
  <div className="about-highlight">
    <h3>Payment</h3>
    <p>Cash and M-Pesa accepted</p>
  </div>
</div>
          </div>
          <div className="about-visual">
            <img src="/assets/laundry-machines.jpg" alt="Washing machines at Open Doors Laundromat" loading="lazy" />
          </div>
        </div>
      </section>
    </>
  );
}
