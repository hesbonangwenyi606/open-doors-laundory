import React from 'react';
import { Helmet } from 'react-helmet-async';
import { faqs, SITE_URL } from './MarketingLayout.jsx';

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": faqs.map((faq) => ({
    "@type": "Question",
    "name": faq.q,
    "acceptedAnswer": { "@type": "Answer", "text": faq.a },
  })),
};

export default function FAQPage() {
  const [openIndex, setOpenIndex] = React.useState(null);

  return (
    <>
      <Helmet>
        <title>FAQ | Open Doors Laundromat</title>
        <meta name="description" content="Frequently asked questions about Open Doors Laundromat laundry services in Kitengela, Kenya." />
        <link rel="canonical" href={`${SITE_URL}/faq`} />
        <meta property="og:title" content="FAQ | Open Doors Laundromat" />
        <meta property="og:description" content="Frequently asked questions about our laundry services." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE_URL}/faq`} />
        <meta property="og:image" content={`${SITE_URL}/assets/laundry-machines.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FAQ | Open Doors Laundromat" />
        <meta name="twitter:description" content="Frequently asked questions about our laundry services." />
        <meta name="twitter:image" content={`${SITE_URL}/assets/laundry-machines.jpg`} />
        <script type="application/ld+json">{JSON.stringify(faqStructuredData)}</script>
      </Helmet>

      <div className="faq-page">
        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Frequently asked</p>
              <h1>Common questions.</h1>
            </div>
            <p>Find answers to the most common questions about our services.</p>
          </div>
          <div className="faq-list">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className={`faq-item ${openIndex === index ? 'open' : ''}`}
              >
                <button
                  className="faq-question"
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  aria-expanded={openIndex === index}
                  aria-controls={`faq-answer-${index}`}
                  id={`faq-question-${index}`}
                >
                  <span>{faq.q}</span>
                  <span className="faq-icon" aria-hidden="true">{openIndex === index ? '−' : '+'}</span>
                </button>
                {openIndex === index && (
                  <div className="faq-answer" id={`faq-answer-${index}`} role="region" aria-labelledby={`faq-question-${index}`}>
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          {faqs.length === 0 && (
            <p className="empty-state">No FAQs available yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
