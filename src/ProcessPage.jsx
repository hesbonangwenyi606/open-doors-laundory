import React from 'react';
import { Helmet } from 'react-helmet-async';
import { ArrowUpRight } from 'lucide-react';
import { processSteps, SITE_URL } from './MarketingLayout.jsx';

export default function ProcessPage() {
  return (
    <>
      <Helmet>
        <title>How It Works | Open Doors Laundromat</title>
        <meta name="description" content="Our simple 5-step laundry process: collect, sort, clean, finish, deliver." />
        <link rel="canonical" href={`${SITE_URL}/process`} />
        <meta property="og:title" content="How It Works | Open Doors Laundromat" />
        <meta property="og:description" content="Our simple 5-step laundry process." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE_URL}/process`} />
        <meta property="og:image" content={`${SITE_URL}/assets/process.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="How It Works | Open Doors Laundromat" />
        <meta name="twitter:description" content="Our simple 5-step laundry process." />
        <meta name="twitter:image" content={`${SITE_URL}/assets/process.jpg`} />
      </Helmet>

      <section className="process-page">
        <div className="section-head">
          <div>
            <p className="eyebrow">How it works</p>
            <h1>Simple as 1-2-3.</h1>
          </div>
          <p>From drop-off to delivery, our process keeps your laundry moving.</p>
        </div>
        <div className="process-steps-page">
          {processSteps.map((step, i) => (
            <div key={step.step} className="process-step-card">
              <div className="process-step-circle" aria-hidden="true">{step.step}</div>
              <h2>{step.title}</h2>
              <p>{step.desc}</p>
              {i < processSteps.length - 1 && (
                <div className="process-connector" aria-hidden="true">
                  <div className="process-line"></div>
                  <div className="process-arrow-icon"><ArrowUpRight size={20} /></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
