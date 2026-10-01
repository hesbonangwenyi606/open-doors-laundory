import { prisma } from '../db/client.js';
import { generateReceiptToken, generateReceiptNumber, getTodayDateKey } from '../services/receiptService.js';

export const bookingRepository = {
  // Create a new booking request with items
  async createBooking(bookingData, items) {
    const now = new Date();
    const businessTimeZone = 'Africa/Nairobi';
    
    // Get today's date key for receipt numbering
    const requestDay = getTodayDateKey(now);
    const dayCode = requestDay.replaceAll('-', '');
    
    // Get today's count safely
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    
    // Get today's count safely. NOTE: count-based numbering can collide when
    // rows are deleted (counts drop) or under concurrent requests, so the
    // insert below retries with a bumped suffix on unique-constraint hits.
    const todayCount = await prisma.bookingRequest.count({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    }) + 1;

    // Calculate estimated total from items (server-side, never trust client)
    let estimatedTotal = 0;
    const bookingItemsData = [];

    for (const item of items) {
      const itemName = String(item.service || '').trim();
      const kg = Number(item.kg);

      // Get the price from database
      const pricingItem = await prisma.pricingItem.findFirst({
        where: { serviceName: itemName },
      });

      if (!pricingItem) {
        throw new Error(`Invalid service: ${itemName}`);
      }

      if (!Number.isInteger(kg) || kg < 1 || kg > 25) {
        throw new Error(`Invalid quantity for ${itemName}: ${kg}`);
      }

      const unitPrice = pricingItem.unitPrice;
      const subtotal = unitPrice * kg;
      estimatedTotal += subtotal;

      bookingItemsData.push({
        service: itemName,
        kg,
        unitPrice,
        priceLabel: pricingItem.price,
        subtotal,
      });
    }

    // Create the booking request and items in a transaction.
    // Retry on receiptNumber/receiptToken unique collisions (deletions or
    // concurrent creates can reuse a candidate number).
    const MAX_NUMBER_ATTEMPTS = 5;
    let result = null;
    for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt++) {
      const receiptNumber = generateReceiptNumber(now, todayCount + attempt);
      const receiptToken = generateReceiptToken();
      try {
        result = await prisma.$transaction(async (tx) => {
      const request = await tx.bookingRequest.create({
        data: {
          receiptNumber,
          receiptToken,
          name: bookingData.name.trim().slice(0, 80),
          phone: bookingData.phone.trim().slice(0, 30),
          service: bookingData.service.trim().slice(0, 240),
          location: (bookingData.location || '').trim().slice(0, 120),
          paymentMethod: bookingData.paymentMethod,
          mpesaPhone: bookingData.paymentMethod === 'M-Pesa' && bookingData.mpesaPhone
            ? bookingData.mpesaPhone.trim()
            : null,
          notes: (bookingData.notes || '').trim().slice(0, 500),
          estimatedTotal,
          paymentStatus: 'pending',
          status: 'new',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      });
      
      // Create items
      for (const itemData of bookingItemsData) {
        await tx.bookingItem.create({
          data: {
            requestId: request.id,
            service: itemData.service,
            kg: itemData.kg,
            unitPrice: itemData.unitPrice,
            priceLabel: itemData.priceLabel,
            subtotal: itemData.subtotal,
          },
        });
      }
      
      return { request, bookingItemsData, receiptNumber, receiptToken, estimatedTotal };
        });
        return result;
      } catch (error) {
        const targets = error?.meta?.target || [];
        const isNumberCollision =
          error?.code === 'P2002' &&
          (targets.includes('receiptNumber') || targets.includes('receiptToken'));
        if (!isNumberCollision || attempt === MAX_NUMBER_ATTEMPTS - 1) throw error;
        // Collision: retry with the next sequential suffix.
      }
    }
  },

  // Get a booking request by receipt token (public receipt page)
  async getBookingByToken(token) {
    const request = await prisma.bookingRequest.findUnique({
      where: { receiptToken: token },
      include: { items: true },
    });
    
    if (!request) return null;
    
    // Return without the receipt token for public receipt pages
    const { receiptToken, ...receipt } = request;
    return receipt;
  },

  // Get a booking request by ID (admin)
  async getBookingById(id) {
    return prisma.bookingRequest.findUnique({
      where: { id },
      include: { items: true },
    });
  },

  // Get all booking requests with pagination
  async getAllBookings({ page = 1, limit = 20, status } = {}) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};
    
    const [requests, total] = await Promise.all([
      prisma.bookingRequest.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.bookingRequest.count({ where }),
    ]);
    
    return { requests, total, page, totalPages: Math.ceil(total / limit) };
  },

  // Get recent bookings for dashboard
  async getRecentBookings(limit = 5) {
    return prisma.bookingRequest.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  // Get booking statistics
  async getBookingStats() {
    const now = new Date();
    const businessTimeZone = 'Africa/Nairobi';
    
    // Today's stats
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    
    const [todayCount, newCount, completedCount, totalCount] = await Promise.all([
      prisma.bookingRequest.count({
        where: { createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      prisma.bookingRequest.count({ where: { status: 'new' } }),
      prisma.bookingRequest.count({ where: { status: 'completed' } }),
      prisma.bookingRequest.count(),
    ]);
    
    // Last 7 days stats
    const dailyStats = [];
    for (let offset = 6; offset >= 0; offset--) {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      const count = await prisma.bookingRequest.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      });
      
      const dayName = date.toLocaleDateString('en', {
        weekday: 'short',
        timeZone: businessTimeZone,
      });
      
      dailyStats.push({
        date: date.toISOString().slice(0, 10),
        label: dayName,
        count,
      });
    }
    
    return {
      today: todayCount,
      new: newCount,
      completed: completedCount,
      total: totalCount,
      daily: dailyStats,
    };
  },

  // Update booking status
  async updateBookingStatus(id, status) {
    const allowedStatuses = ['new', 'confirmed', 'completed', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    
    return prisma.bookingRequest.update({
      where: { id },
      data: { status, updatedAt: new Date() },
    });
  },

  // Delete a booking request (only completed ones)
  async deleteBooking(id) {
    const request = await prisma.bookingRequest.findUnique({
      where: { id },
    });
    
    if (!request) {
      throw new Error('Request not found');
    }
    
    if (request.status !== 'completed') {
      throw new Error('Only completed requests can be removed');
    }
    
    return prisma.bookingRequest.delete({
      where: { id },
    });
  },

  // Delete all bookings (for testing/reset)
  async deleteAllBookings() {
    await prisma.bookingItem.deleteMany();
    return prisma.bookingRequest.deleteMany();
  },
};
