import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataFile = path.join(__dirname, 'data', 'process.json');
const settingsFile = path.join(__dirname, 'data', 'settings.json');
const requestsFile = path.join(__dirname, 'data', 'requests.json');
const app = express();
const port = Number(process.env.PORT || 3001);
const adminEmail = process.env.ADMIN_EMAIL || 'laundromat@door.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'laundromat@2030';
const sessionSecret = process.env.SESSION_SECRET || 'development-only-change-this-secret';
const sessionMaxAge = 8 * 60 * 60 * 1000;
const businessTimeZone = 'Africa/Nairobi';

app.use(express.json({ limit: '50kb' }));

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: businessTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');
}

function createSession() {
  const payload = Buffer.from(JSON.stringify({ email: adminEmail, expires: Date.now() + sessionMaxAge })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function getSession(req) {
  try {
    const token = parseCookies(req.headers.cookie).od_admin;
    if (!token) return null;
    const [payload, signature] = token.split('.');
    if (!safeEqual(signature, sign(payload))) return null;
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return session.expires > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  if (!getSession(req)) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

async function readProcess() {
  return JSON.parse(await fs.readFile(dataFile, 'utf8'));
}

async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
async function writeJson(file, data) { await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8'); }

app.get('/api/process', async (_req, res, next) => {
  try { res.json(await readProcess()); } catch (error) { next(error); }
});

app.get('/api/site-settings', async (_req, res, next) => {
  try { res.json(await readJson(settingsFile)); } catch (error) { next(error); }
});

app.post('/api/requests', async (req, res, next) => {
  try {
    const { name = '', phone = '', service = '', location = '', paymentMethod = '', mpesaPhone = '', notes = '', items = [] } = req.body || {};
    if (!name.trim() || !phone.trim() || !service.trim()) return res.status(400).json({ error: 'Name, phone and at least one service are required.' });
    if (!Array.isArray(items) || items.length < 1 || items.length > 20) return res.status(400).json({ error: 'Select between 1 and 20 services.' });
    if (!['Cash', 'M-Pesa'].includes(paymentMethod)) return res.status(400).json({ error: 'Select Cash or M-Pesa as the payment method.' });
    const cleanMpesaPhone = String(mpesaPhone).replace(/[\s-]/g, '');
    if (paymentMethod === 'M-Pesa' && !/^(?:\+?254|0)(?:7|1)\d{8}$/.test(cleanMpesaPhone)) return res.status(400).json({ error: 'Enter a valid Kenyan M-Pesa phone number.' });
    const settings = await readJson(settingsFile);
    const priceMap = new Map(settings.priceGroups.flatMap(group => group.items).map(([itemName, price]) => [itemName, price]));
    const pricedItems = items.map(item => {
      const itemName = String(item.service || '').trim(); const kg = Number(item.kg);
      if (!priceMap.has(itemName) || !Number.isInteger(kg) || kg < 1 || kg > 25) throw new Error('INVALID_SERVICE');
      const priceLabel = String(priceMap.get(itemName)); const unitPrice = Number(priceLabel.replaceAll(',','').match(/\d+(?:\.\d+)?/)?.[0] || 0);
      return { service: itemName, kg, unitPrice, priceLabel, subtotal: unitPrice * kg };
    });
    const estimatedTotal = pricedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const requests = await readJson(requestsFile);
    const now = new Date();
    const requestDay = localDateKey(now);
    const dayCode = requestDay.replaceAll('-','');
    const todayCount = requests.filter(item => localDateKey(new Date(item.createdAt)) === requestDay).length + 1;
    const request = { id: crypto.randomUUID(), receiptToken: crypto.randomBytes(18).toString('base64url'), receiptNumber: `OD-${dayCode}-${String(todayCount).padStart(3,'0')}`, name: name.trim().slice(0,80), phone: phone.trim().slice(0,30), service: service.trim().slice(0,240), items: pricedItems, estimatedTotal, location: location.trim().slice(0,120), paymentMethod, mpesaPhone: paymentMethod === 'M-Pesa' ? cleanMpesaPhone : '', paymentStatus: 'pending', notes: notes.trim().slice(0,500), status: 'new', createdAt: now.toISOString() };
    requests.unshift(request); await writeJson(requestsFile, requests.slice(0,1000));
    res.status(201).json({ id: request.id, receiptToken: request.receiptToken, receiptNumber: request.receiptNumber, message: 'Pickup request received.' });
  } catch (error) { if (error.message === 'INVALID_SERVICE') return res.status(400).json({ error: 'One of the selected services or quantities is invalid.' }); next(error); }
});

app.get('/api/receipts/:token', async (req, res, next) => {
  try {
    const requests = await readJson(requestsFile);
    const request = requests.find(item => item.receiptToken === req.params.token);
    if (!request) return res.status(404).json({ error: 'Receipt not found.' });
    const { receiptToken: _privateToken, ...receipt } = request;
    res.json(receipt);
  } catch (error) { next(error); }
});

app.post('/api/admin/login', (req, res) => {
  const { email = '', password = '' } = req.body || {};
  if (!safeEqual(email.toLowerCase(), adminEmail.toLowerCase()) || !safeEqual(password, adminPassword)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `od_admin=${createSession()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionMaxAge / 1000}${secure}`);
  res.json({ email: adminEmail });
});

app.get('/api/admin/session', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, email: session.email });
});

app.post('/api/admin/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'od_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.put('/api/admin/process', requireAdmin, async (req, res, next) => {
  try {
    const steps = req.body?.steps;
    if (!Array.isArray(steps) || steps.length < 2 || steps.length > 12) {
      return res.status(400).json({ error: 'Provide between 2 and 12 process steps.' });
    }
    const cleaned = steps.map(step => String(step).trim()).filter(Boolean);
    if (cleaned.length !== steps.length || cleaned.some(step => step.length > 80)) {
      return res.status(400).json({ error: 'Every step is required and must be under 80 characters.' });
    }
    const data = { steps: cleaned, updatedAt: new Date().toISOString() };
    await fs.writeFile(dataFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    res.json(data);
  } catch (error) { next(error); }
});

app.get('/api/admin/dashboard', requireAdmin, async (_req, res, next) => {
  try {
    const requests = await readJson(requestsFile); const settings = await readJson(settingsFile); const process = await readProcess();
    const today = localDateKey();
    const daily = Array.from({length:7},(_,offset)=>{const date=new Date();date.setDate(date.getDate()-(6-offset));const key=localDateKey(date);return {date:key,label:date.toLocaleDateString('en',{weekday:'short',timeZone:businessTimeZone}),count:requests.filter(r=>localDateKey(new Date(r.createdAt))===key).length};});
    res.json({ requests, settings, process, stats:{today:requests.filter(r=>localDateKey(new Date(r.createdAt))===today).length,new:requests.filter(r=>r.status==='new').length,completed:requests.filter(r=>r.status==='completed').length,total:requests.length},daily });
  } catch (error) { next(error); }
});

app.put('/api/admin/settings', requireAdmin, async (req, res, next) => {
  try {
    const { seo, priceGroups } = req.body || {};
    if (!seo?.title?.trim() || !seo?.description?.trim() || !Array.isArray(priceGroups) || priceGroups.length !== 3) return res.status(400).json({error:'SEO and three pricing groups are required.'});
    const cleaned={seo:{title:String(seo.title).trim().slice(0,70),description:String(seo.description).trim().slice(0,170)},priceGroups:priceGroups.map(group=>({t:String(group.t).trim().slice(0,50),items:group.items.map(item=>[String(item[0]).trim().slice(0,80),String(item[1]).trim().slice(0,20)])}))};
    await writeJson(settingsFile,cleaned); res.json(cleaned);
  } catch(error){next(error);}
});

app.patch('/api/admin/requests/:id', requireAdmin, async (req,res,next)=>{
  try { const allowed=['new','confirmed','completed','cancelled']; if(!allowed.includes(req.body?.status))return res.status(400).json({error:'Invalid status.'}); const requests=await readJson(requestsFile); const request=requests.find(item=>item.id===req.params.id); if(!request)return res.status(404).json({error:'Request not found.'}); request.status=req.body.status; await writeJson(requestsFile,requests); res.json(request); } catch(error){next(error);}
});

app.delete('/api/admin/requests/:id', requireAdmin, async (req,res,next)=>{
  try {
    const requests=await readJson(requestsFile); const index=requests.findIndex(item=>item.id===req.params.id);
    if(index<0)return res.status(404).json({error:'Request not found.'});
    if(requests[index].status!=='completed')return res.status(409).json({error:'Only completed requests can be removed.'});
    requests.splice(index,1); await writeJson(requestsFile,requests); res.json({ok:true});
  } catch(error){next(error);}
});

app.use(express.static(path.join(rootDir, 'dist')));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(rootDir, 'dist', 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

export { app };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(port, () => console.log(`Open Doors server running at http://localhost:${port}`));
}
