import { prisma } from '../db/client.js';
import { randomUUID } from 'node:crypto';

async function ensureCustomerTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "customers" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "clientId" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "phone" TEXT NOT NULL,
      "email" TEXT,
      "servedBy" TEXT,
      "gender" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deletedAt" DATETIME
    )
  `;
  const columns = await prisma.$queryRaw`PRAGMA table_info("customers")`;
  if (!columns.some((column) => column.name === 'deletedAt')) {
    await prisma.$executeRawUnsafe('ALTER TABLE "customers" ADD COLUMN "deletedAt" DATETIME');
  }
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "customers_phone_idx" ON "customers" ("phone")`;
}

export const customerRepository = {
  async upsertCustomer(clientId, data) {
    await ensureCustomerTable();
    const customerData = {
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      servedBy: data.servedBy || null,
      gender: data.gender || null,
    };
    const now = new Date().toISOString();
    await prisma.$executeRaw`
      INSERT INTO "customers" ("id", "clientId", "name", "phone", "email", "servedBy", "gender", "createdAt", "updatedAt", "deletedAt")
      VALUES (${randomUUID()}, ${clientId}, ${customerData.name}, ${customerData.phone}, ${customerData.email}, ${customerData.servedBy}, ${customerData.gender}, ${now}, ${now}, NULL)
      ON CONFLICT("clientId") DO UPDATE SET
        "name" = excluded."name",
        "phone" = excluded."phone",
        "email" = excluded."email",
        "servedBy" = excluded."servedBy",
        "gender" = excluded."gender",
        "updatedAt" = excluded."updatedAt",
        "deletedAt" = NULL
    `;
    const [customer] = await prisma.$queryRaw`
      SELECT "id", "clientId", "name", "phone", "email", "servedBy", "gender", "createdAt", "updatedAt", "deletedAt"
      FROM "customers"
      WHERE "clientId" = ${clientId}
      LIMIT 1
    `;
    return customer;
  },

  async getAllCustomers() {
    await ensureCustomerTable();
    await prisma.$executeRaw`
      INSERT INTO "customers" ("id", "clientId", "name", "phone", "email", "servedBy", "gender", "createdAt", "updatedAt", "deletedAt")
      SELECT lower(hex(randomblob(16))), 'server_' || booking."phone", booking."name", booking."phone", NULL, NULL, NULL, booking."createdAt", booking."updatedAt", NULL
      FROM "booking_requests" AS booking
      WHERE TRIM(booking."phone") <> ''
        AND booking."id" = (
          SELECT latest."id"
          FROM "booking_requests" AS latest
          WHERE latest."phone" = booking."phone"
          ORDER BY latest."createdAt" DESC, latest."id" DESC
          LIMIT 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM "customers" AS existing
          WHERE existing."phone" = booking."phone"
        )
      ON CONFLICT("clientId") DO NOTHING
    `;
    return prisma.$queryRaw`
      SELECT "id", "clientId", "name", "phone", "email", "servedBy", "gender", "createdAt", "updatedAt"
      FROM "customers"
      WHERE "deletedAt" IS NULL
      ORDER BY "createdAt" DESC
    `;
  },

  async deleteCustomer(clientId, data = {}) {
    await ensureCustomerTable();
    const now = new Date().toISOString();
    const updated = await prisma.$executeRaw`
      UPDATE "customers"
      SET "deletedAt" = ${now}, "updatedAt" = ${now}
      WHERE "clientId" = ${clientId}
    `;
    if (updated === 0 && data.phone) {
      await prisma.$executeRaw`
        INSERT INTO "customers" ("id", "clientId", "name", "phone", "email", "servedBy", "gender", "createdAt", "updatedAt", "deletedAt")
        VALUES (${randomUUID()}, ${clientId}, ${data.name || ''}, ${data.phone}, NULL, NULL, NULL, ${now}, ${now}, ${now})
        ON CONFLICT("clientId") DO UPDATE SET "deletedAt" = excluded."deletedAt", "updatedAt" = excluded."updatedAt"
      `;
    }
    return { deleted: true };
  },
};