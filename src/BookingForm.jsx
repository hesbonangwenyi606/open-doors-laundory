import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Plus, X } from 'lucide-react';

const fallback = [{ name: 'Wash, dry & fold', price: '1,200' }];
const pickupAreas = [
  { value: 'Kitengela', distance: '3 km' },
  { value: 'Kisaju', distance: '8 km' },
  { value: 'Isinya', distance: '14 km' },
  { value: 'Athi River', distance: '18 km' },
  { value: 'Mlolongo', distance: '22 km' },
  { value: 'Kajiado', distance: '27 km' },
];
const numericPrice = (value) =>
  Number(
    String(value)
      .replaceAll(',', '')
      .match(/\d+(?:\.\d+)?/)?.[0] || 0
  );
const emptyCustomer = {
  name: '',
  phone: '',
  location: '',
  paymentMethod: 'M-Pesa',
  mpesaPhone: '',
  notes: '',
};
const rememberedCustomer = () => {
  try {
    return {
      ...emptyCustomer,
      ...JSON.parse(localStorage.getItem('openDoorsCustomer') || '{}'),
      notes: '',
    };
  } catch {
    return emptyCustomer;
  }
};
const normalizeAreaText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export default function BookingForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState(rememberedCustomer),
    [services, setServices] = useState(fallback),
    [items, setItems] = useState([{ service: 'Wash, dry & fold', kg: 1 }]),
    [message, setMessage] = useState(''),
    [receipt, setReceipt] = useState(null),
    [sending, setSending] = useState(false),
    [locating, setLocating] = useState(false);

  useEffect(() => {
    fetch('/api/site-settings')
      .then((r) => r.json())
      .then((data) => {
        const list = data.priceGroups.flatMap((group) =>
          group.items.map((item) => ({ name: item[0], price: item[1] }))
        );
        if (list.length) {
          setServices(list);
          setItems([{ service: list[0].name, kg: 1 }]);
        }
      })
      .catch(() => {});
  }, []);

  const pricedItems = useMemo(
    () =>
      items.map((item) => {
        const match =
          services.find((service) => service.name === item.service) || services[0] || fallback[0];
        const unitPrice = numericPrice(match.price);
        return { ...item, unitPrice, priceLabel: match.price, subtotal: unitPrice * item.kg };
      }),
    [items, services]
  );

  const total = pricedItems.reduce((sum, item) => sum + item.subtotal, 0);

  const locationMatch = useMemo(() => {
    const typed = normalizeAreaText(form.location);
    if (!typed) return null;
    return (
      pickupAreas.find((area) => {
        const areaName = normalizeAreaText(area.value);
        return areaName === typed || areaName.startsWith(typed) || typed.startsWith(areaName);
      }) || null
    );
  }, [form.location]);

  const locationDistanceText = useMemo(() => {
    if (!form.location || !form.location.trim())
      return 'Type your area to estimate the pickup distance.';
    if (form.location.trim().toLowerCase() === 'current location')
      return 'Live location detected. We will use your exact coordinates for pickup.';
    if (locationMatch)
      return `Estimated distance: ${locationMatch.distance} from Chuna Mall · Shop 10 · Kitengela.`;
    return 'Area not found. Type a supported area to estimate the distance automatically.';
  }, [form.location, locationMatch]);

  const locationDistanceValue = useMemo(() => {
    if (!form.location || !form.location.trim()) return '—';
    if (form.location.trim().toLowerCase() === 'current location') return 'Live';
    if (locationMatch) return locationMatch.distance;
    return 'Unknown';
  }, [form.location, locationMatch]);

  const field = (name) => ({
    value: form[name],
    onChange: (e) => setForm({ ...form, [name]: e.target.value }),
  });

  const updateItem = (index, key, value) =>
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    );

  function requestLocation() {
    if (!navigator.geolocation) {
      setMessage('Live location is not supported by this browser. Please type your pickup area.');
      return;
    }
    setLocating(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latitude = coords.latitude.toFixed(6),
          longitude = coords.longitude.toFixed(6);
        setForm((current) => ({ ...current, location: 'Current location' }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setMessage('Location access was not granted. Please type your pickup area instead.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    setMessage('');
    setReceipt(null);

    const paymentPhone = form.paymentMethod === 'M-Pesa' ? form.mpesaPhone || form.phone : '';

    const response = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        mpesaPhone: paymentPhone,
        service: pricedItems.map((item) => item.service).join(', '),
        items: pricedItems.map(({ service, kg }) => ({ service, kg })),
      }),
    });

    const data = await response.json();
    setSending(false);

    if (response.ok) {
      const saved = {
        name: form.name,
        phone: form.phone,
        location: form.location,
        paymentMethod: form.paymentMethod,
        mpesaPhone: paymentPhone,
      };
      localStorage.setItem('openDoorsCustomer', JSON.stringify(saved));
      setReceipt(data);
      setForm({ ...saved, notes: '' });
      setItems([{ service: services[0]?.name || fallback[0].name, kg: 1 }]);
      setMessage('Thank you! We received your request and will contact you shortly.');
    } else {
      setMessage(data.error || 'Something went wrong. Please try again.');
    }
  }

  return (
    <section className="booking">
      <div>
        <p className="eyebrow">Quick request</p>
        <h1>Schedule your pickup.</h1>
        <p>
          Select one or more services, choose the kilograms or quantity, and see your estimated
          price instantly.
        </p>
        <div className="estimate-note">
          <b>Transparent estimate</b>
          <span>Final charges are confirmed after garment inspection.</span>
        </div>
      </div>
      <form onSubmit={submit}>
        <label>
          Your name
          <input {...field('name')} required aria-required="true" />
        </label>
        <label>
          Phone number
          <input {...field('phone')} required aria-required="true" type="tel" />
        </label>
        <div className="wide selected-services">
          <div className="service-table-head">
            <span>Service</span>
            <span>Kg / Qty</span>
            <span>Unit price</span>
            <span>Subtotal</span>
            <i></i>
          </div>
          {pricedItems.map((item, index) => (
            <div className="service-select-row" key={index}>
              <label htmlFor={`service-${index}`} className="visually-hidden">
                Service {index + 1}
              </label>
              <select
                id={`service-${index}`}
                value={item.service}
                onChange={(e) => updateItem(index, 'service', e.target.value)}
                aria-label={`Service ${index + 1}`}
              >
                {services.map((service) => (
                  <option key={service.name} value={service.name}>
                    {service.name}
                  </option>
                ))}
              </select>
              <label htmlFor={`kg-${index}`} className="visually-hidden">
                Kilograms or quantity for {item.service}
              </label>
              <select
                id={`kg-${index}`}
                value={item.kg}
                onChange={(e) => updateItem(index, 'kg', Number(e.target.value))}
                aria-label={`Kilograms or quantity for ${item.service}`}
              >
                {Array.from({ length: 25 }, (_, i) => i + 1).map((value) => (
                  <option value={value} key={value}>
                    {value}
                  </option>
                ))}
              </select>
              <output htmlFor={`kg-${index}`}>KSh {item.priceLabel}</output>
              <output htmlFor={`kg-${index}`}>KSh {item.subtotal.toLocaleString()}</output>
              <button
                type="button"
                disabled={items.length === 1}
                onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                aria-label="Remove service"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            className="add-service"
            type="button"
            onClick={() =>
              setItems((current) => [
                ...current,
                { service: services[0]?.name || fallback[0].name, kg: 1 },
              ])
            }
          >
            <Plus size={18} /> Add another service
          </button>
          <div className="estimate-total">
            <span>Estimated total</span>
            <b>KSh {total.toLocaleString()}</b>
          </div>
        </div>
        <label className="location-field">
          Pickup area / live location
          <input
            {...field('location')}
            onClick={requestLocation}
            placeholder={
              locating
                ? 'Getting your live location...'
                : 'Type your area or click to use live location'
            }
            required
            aria-required="true"
          />
          <small>
            {locating ? 'Please allow location access in your browser.' : locationDistanceText}
          </small>
        </label>
        <label>
          Mode of payment
          <select {...field('paymentMethod')} required aria-required="true">
            <option value="M-Pesa">M-Pesa</option>
            <option value="Cash">Cash</option>
          </select>
        </label>
        {form.paymentMethod === 'M-Pesa' && (
          <label className={form.paymentMethod === 'M-Pesa' ? '' : 'wide'}>
            M-Pesa number to receive prompt
            <input
              type="tel"
              value={form.mpesaPhone || form.phone}
              onChange={(e) => setForm({ ...form, mpesaPhone: e.target.value })}
              placeholder="07XX XXX XXX"
              inputMode="tel"
              required
              aria-required="true"
            />
            <small>We will send the payment prompt to this number.</small>
          </label>
        )}
        <label className={form.paymentMethod === 'M-Pesa' ? '' : 'wide'}>
          Additional details
          <textarea {...field('notes')} rows="3" aria-label="Additional details or notes" />
        </label>
        {message && <p className="wide booking-message" role="alert">{message}</p>}
        {receipt && (
          <button
            className="wide receipt-link"
            onClick={(e) => {
              e.preventDefault();
              navigate(`/receipt/${receipt.receiptToken}`);
            }}
          >
            View receipt {receipt.receiptNumber} <ArrowUpRight size={18} />
          </button>
        )}
        <button className="wide" disabled={sending}>
          {sending ? 'Sending...' : 'Send pickup request'} <ArrowUpRight size={18} />
        </button>
      </form>
    </section>
  );
}
