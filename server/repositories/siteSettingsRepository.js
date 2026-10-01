import { prisma } from '../db/client.js';

export const siteSettingsRepository = {
  // Get site settings (there should be only one)
  async getSettings() {
    const settings = await prisma.siteSettings.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!settings) return null;
    return {
      ...settings,
      businessHours: settings.businessHours ? JSON.parse(settings.businessHours) : null,
    };
  },

  // Update site settings
  async updateSettings(data) {
    const existing = await this.getSettings();
    
    if (existing) {
      return prisma.siteSettings.update({
        where: { id: existing.id },
        data: {
          seoTitle: data.seo?.title || existing.seoTitle,
          seoDescription: data.seo?.description || existing.seoDescription,
          businessName: data.businessName || existing.businessName,
          phone: data.phone || existing.phone,
          email: data.email || existing.email,
          address: data.address || existing.address,
          businessHours: data.businessHours ? JSON.stringify(data.businessHours) : existing.businessHours,
        },
      });
    }
    
    // Create if doesn't exist
    return prisma.siteSettings.create({
      data: {
        id: 'default',
        seoTitle: data.seo?.title || 'Open Doors Laundromat',
        seoDescription: data.seo?.description || '',
        businessName: data.businessName || 'Open Doors Laundromat',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        businessHours: data.businessHours ? JSON.stringify(data.businessHours) : null,
      },
    });
  },

  // Get SEO settings specifically
  async getSEOSettings() {
    const settings = await this.getSettings();
    return settings ? {
      title: settings.seoTitle,
      description: settings.seoDescription,
    } : null;
  },
};
