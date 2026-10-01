import { PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'server', 'data');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...\n');

  // ============================================
  // 1. CREATE ADMIN USER
  // ============================================
  console.log('1. Creating admin user...');
  
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required for seeding');
  }

  const passwordHash = await argon2.hash(adminPassword);
  
  const adminUser = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: { passwordHash },
    create: {
      email: adminEmail,
      passwordHash,
    },
  });
  console.log(`   ✓ Admin user created: ${adminUser.email}`);

  // ============================================
  // 2. IMPORT PROCESS STEPS
  // ============================================
  console.log('\n2. Importing process steps...');
  
  const processData = JSON.parse(
    await fs.readFile(path.join(dataDir, 'process.json'), 'utf8')
  );

  // Clear existing and insert new
  await prisma.processStep.deleteMany();
  
  for (const [index, stepTitle] of processData.steps.entries()) {
    await prisma.processStep.create({
      data: {
        stepNumber: index + 1,
        title: stepTitle,
        description: null,
      },
    });
  }
  
  const processSteps = await prisma.processStep.findMany({
    orderBy: { stepNumber: 'asc' },
  });
  console.log(`   ✓ Imported ${processSteps.length} process steps`);

  // ============================================
  // 3. IMPORT SITE SETTINGS
  // ============================================
  console.log('\n3. Importing site settings...');
  
  const settingsData = JSON.parse(
    await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8')
  );

  await prisma.siteSettings.deleteMany();
  
  const siteSettings = await prisma.siteSettings.create({
    data: {
      id: 'default',
      seoTitle: settingsData.seo?.title || 'Open Doors Laundromat | So Fresh, So Clean, So You',
      seoDescription: settingsData.seo?.description || 'Premium laundry and garment care in Kitengela, Kisaju, Isinya and Athi River.',
      businessName: 'Open Doors Laundromat',
      phone: '011 944 4972',
      email: 'opendoorslaundromat@gmail.com',
      address: 'Chuna Mall, Ground Floor, Shop 10, Kitengela',
      businessHours: JSON.stringify({
        mondaySaturday: '8:00 am – 9:00 pm',
        sunday: '2:00 pm – 7:00 pm',
        publicHolidays: '9:00 am – 7:00 pm',
      }),
    },
  });
  console.log(`   ✓ Site settings imported`);

  // ============================================
  // 4. IMPORT PRICING GROUPS AND ITEMS
  // ============================================
  console.log('\n4. Importing pricing...');
  
  await prisma.pricingGroup.deleteMany();
  await prisma.pricingItem.deleteMany();

  const priceGroups = settingsData.priceGroups || [];
  
  for (const [groupIndex, group] of priceGroups.entries()) {
    const createdGroup = await prisma.pricingGroup.create({
      data: {
        title: group.t,
        sortOrder: groupIndex,
      },
    });

    for (const [itemIndex, item] of group.items.entries()) {
      const [serviceName, priceString] = item;
      
      // Parse price string to integer (remove commas and non-digits)
      const numericPrice = parseInt(priceString.replace(/[^\d]/g, ''), 10) || 0;
      
      await prisma.pricingItem.create({
        data: {
          groupId: createdGroup.id,
          serviceName,
          price: priceString,
          unitPrice: numericPrice,
          sortOrder: itemIndex,
        },
      });
    }
    
    console.log(`   ✓ Imported group: ${group.t}`);
  }

  const pricingGroups = await prisma.pricingGroup.findMany({
    include: { items: true },
    orderBy: { sortOrder: 'asc' },
  });
  const totalItems = pricingGroups.reduce((sum, g) => sum + g.items.length, 0);
  console.log(`   ✓ Imported ${pricingGroups.length} pricing groups with ${totalItems} items`);

  // ============================================
  // 5. IMPORT BOOKING REQUESTS
  // ============================================
  console.log('\n5. Importing booking requests...');

  await prisma.bookingRequest.deleteMany();
  await prisma.bookingItem.deleteMany();

  let requestsData = [];
  try {
    const requestsFile = await fs.readFile(path.join(dataDir, 'requests.json'), 'utf8');
    requestsData = JSON.parse(requestsFile);
  } catch (error) {
    console.log('   ⚠ No existing requests to import');
  }

  if (requestsData.length > 0) {
    for (const request of requestsData) {
      // Generate a new receipt token (don't reuse old ones)
      const receiptToken = generateReceiptToken();
      const receiptNumber = generateReceiptNumber();
      
      const createdRequest = await prisma.bookingRequest.create({
        data: {
          id: request.id,
          receiptNumber,
          receiptToken,
          name: request.name,
          phone: request.phone,
          location: request.location || '',
          paymentMethod: request.paymentMethod || 'M-Pesa',
          mpesaPhone: request.mpesaPhone || null,
          notes: request.notes || null,
          estimatedTotal: request.estimatedTotal || 0,
          paymentStatus: request.paymentStatus || 'pending',
          status: request.status || 'new',
          createdAt: new Date(request.createdAt),
          updatedAt: new Date(request.createdAt),
        },
      });

      // Import booking items
      if (request.items && Array.isArray(request.items)) {
        for (const item of request.items) {
          await prisma.bookingItem.create({
            data: {
              requestId: createdRequest.id,
              service: item.service,
              kg: item.kg,
              unitPrice: item.unitPrice || 0,
              priceLabel: item.priceLabel || '0',
              subtotal: item.subtotal || 0,
            },
          });
        }
      }
    }
    
    const bookingRequests = await prisma.bookingRequest.findMany();
    console.log(`   ✓ Imported ${bookingRequests.length} booking requests`);
  }

  console.log('\n✅ Database seed completed successfully!');
}

function generateReceiptToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateReceiptNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `OD-${dateStr}-${randomNum}`;
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
