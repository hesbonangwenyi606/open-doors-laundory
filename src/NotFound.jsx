import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <main className="not-found-page" id="main-content">
      <Helmet>
        <title>404 - Page Not Found | Open Doors Laundromat</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content="The page you are looking for does not exist." />
      </Helmet>
      
      <div className="not-found-content">
        <h1>404</h1>
        <p>Page not found</p>
        <p className="not-found-message">
          The page you are looking for does not exist or has been moved.
        </p>
        <button className="not-found-link" onClick={() => navigate('/')}>
          <ArrowLeft size={18} /> Back to Home
        </button>
      </div>
    </main>
  );
}
