import { prisma } from '../db/client.js';

export const pricingRepository = {
  // Get all pricing groups with their items
  async getAllPricing() {
    const groups = await prisma.pricingGroup.findMany({
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    
    return groups.map(group => ({
      t: group.title,
      items: group.items.map(item => [item.serviceName, item.price]),
    }));
  },

  // Get pricing groups and items as structured data
  async getPricingStructure() {
    const groups = await prisma.pricingGroup.findMany({
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    
    return {
      priceGroups: groups.map(group => ({
        id: group.id,
        t: group.title,
        items: group.items.map(item => ({
          id: item.id,
          name: item.serviceName,
          price: item.price,
          unitPrice: item.unitPrice,
        })),
      })),
    };
  },

  // Get all pricing items as flat list for booking form
  async getPricingItemsList() {
    const items = await prisma.pricingItem.findMany({
      orderBy: [{ sortOrder: 'asc' }, { serviceName: 'asc' }],
    });
    
    return items.map(item => ({
      name: item.serviceName,
      price: item.price,
      unitPrice: item.unitPrice,
    }));
  },

  // Get a pricing item by name
  async getPricingItemByName(serviceName) {
    return prisma.pricingItem.findFirst({
      where: { serviceName },
    });
  },

  // Update all pricing groups
  async updatePricingGroups(priceGroups) {
    // Delete existing
    await prisma.pricingItem.deleteMany();
    await prisma.pricingGroup.deleteMany();
    
    // Create new
    for (const [groupIndex, group] of priceGroups.entries()) {
      const createdGroup = await prisma.pricingGroup.create({
        data: {
          title: group.t,
          sortOrder: groupIndex,
        },
      });
      
      for (const [itemIndex, item] of group.items.entries()) {
        const [serviceName, priceString] = item;
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
    }
    
    return this.getPricingStructure();
  },

  // Create a pricing group
  async createPricingGroup(title, sortOrder = 0) {
    return prisma.pricingGroup.create({
      data: {
        title,
        sortOrder,
      },
    });
  },

  // Update a pricing group
  async updatePricingGroup(id, data) {
    return prisma.pricingGroup.update({
      where: { id },
      data,
    });
  },

  // Delete a pricing group
  async deletePricingGroup(id) {
    return prisma.pricingGroup.delete({
      where: { id },
    });
  },

  // Create a pricing item
  async createPricingItem(data) {
    return prisma.pricingItem.create({
      data,
    });
  },

  // Update a pricing item
  async updatePricingItem(id, data) {
    return prisma.pricingItem.update({
      where: { id },
      data,
    });
  },

  // Delete a pricing item
  async deletePricingItem(id) {
    return prisma.pricingItem.delete({
      where: { id },
    });
  },
};
