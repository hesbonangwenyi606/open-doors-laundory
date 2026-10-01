import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Download } from 'lucide-react';
import { generateReceiptPDF, downloadPDFReceipt, printReceipt } from './lib/receipt.js';

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-KE', { dateStyle: 'medium' });
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

export default function ReceiptPage() {
  const navigate = useNavigate();
  const { token } = useParams();
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [printError, setPrintError] = useState('');

  useEffect(() => {
    fetch(`/api/receipts/${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error);
        return response.json();
      })
      .then((data) => {
        setReceipt(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  function handlePrint() {
    if (!receipt) return;
    setPrintError('');
    const opened = printReceipt({
      receiptNumber: receipt.receiptNumber,
      ...receipt,
    });
    if (!opened) {
      setPrintError('Popup blocked — use Download PDF instead, then print the PDF.');
    }
  }

  function handleDownloadPDF() {
    if (!receipt) return;
    try {
      const pdf = generateReceiptPDF(receipt, receipt.receiptNumber, '');
      downloadPDFReceipt({ ...pdf, receiptNumber: receipt.receiptNumber });
    } catch {
      setError('Could not generate the PDF. Please try printing instead.');
    }
  }

  if (loading) return (
    <main className="receipt-state">
      <p>Preparing your receipt…</p>
    </main>
  );

  if (error) return (
    <main className="receipt-state">
      <h1>{error}</h1>
      <button className="receipt-back" onClick={() => navigate('/')}>
        <ArrowLeft size={18} /> Back to website
      </button>
    </main>
  );

  return (
    <main className="receipt-page">
      <div className="receipt-actions">
        <button className="receipt-back" onClick={() => navigate('/')}>
          <ArrowLeft size={18} /> Website
        </button>
        <button onClick={handlePrint}><Printer size={18} /> Print</button>
        <button onClick={handleDownloadPDF}><Download size={18} /> Download PDF</button>
      </div>
      {printError ? <p className="receipt-error" role="alert">{printError}</p> : null}
      <article className="receipt">
        <header>
          <div className="receipt-brand">
            <span className="receipt-logo">
              <img src="/assets/logo.jpg" alt="Open Doors Laundromat logo" />
            </span>
            <div>
              <h1>OPEN DOORS</h1>
              <p>LAUNDROMAT</p>
            </div>
          </div>
          <div className="receipt-title">
            <span>REQUEST RECEIPT</span>
            <b>{receipt.receiptNumber}</b>
          </div>
        </header>
        <section className="receipt-meta">
          <div>
            <small>Issued to</small>
            <b>{receipt.name}</b>
            <span>{receipt.phone}</span>
          </div>
          <div>
            <small>Date issued</small>
            <b>{formatDate(receipt.createdAt)}</b>
            <span>{formatTime(receipt.createdAt)}</span>
          </div>
        </section>
        <section className="receipt-service">
          <div>
            <small>Requested services</small>
            <h2>{(receipt.items || []).length} item{(receipt.items || []).length !== 1 ? 's' : ''}</h2>
          </div>
          <span className={`receipt-status ${receipt.status}`}>{receipt.status}</span>
        </section>
        {(receipt.items || []).length ? (
          <section className="receipt-lines">
            <div className="receipt-line heading">
              <span>Service</span>
              <span>Kg / Qty</span>
              <span>Price</span>
              <span>Subtotal</span>
            </div>
            {(receipt.items || []).map((item, index) => (
              <div className="receipt-line" key={index}>
                <b>{item.service}</b>
                <span>{item.kg}</span>
                <span>KSh {item.priceLabel}</span>
                <b>KSh {item.subtotal.toLocaleString()}</b>
              </div>
            ))}
            <div className="receipt-total">
              <span>Estimated total</span>
              <b>KSh {(receipt.estimatedTotal || 0).toLocaleString()}</b>
            </div>
          </section>
        ) : null}
        <section className="receipt-details">
          <div className="receipt-payment">
            <small>Mode of payment</small>
            <p>
              <b>{receipt.paymentMethod || 'Not selected'}</b>
              {receipt.paymentMethod === 'M-Pesa' && receipt.mpesaPhone ? (
                <span>M-Pesa prompt number: {receipt.mpesaPhone}</span>
              ) : null}
            </p>
          </div>
          <div>
            <small>Pickup area</small>
            <p>{receipt.location || 'To be confirmed'}</p>
          </div>
          <div>
            <small>Additional details</small>
            <p>{receipt.notes || 'No additional details provided.'}</p>
          </div>
        </section>
        <footer>
          <div>
            <b>Thank you for choosing Open Doors.</b>
            <p>
              This receipt confirms your service request. Final charges are confirmed after item
              inspection.
            </p>
          </div>
          <div className="receipt-contact">
            <span>011 944 4972</span>
            <span>Chuna Mall · Shop 10 · Kitengela</span>
          </div>
        </footer>
      </article>
      <p className="receipt-footnote">So fresh, so clean, so you.</p>
    </main>
  );
}
