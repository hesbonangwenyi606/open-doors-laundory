import { prisma } from '../db/client.js';
import argon2 from 'argon2';

export const adminUserRepository = {
  // Find admin user by email
  async findByEmail(email) {
    return prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });
  },

  // Find admin user by ID
  async findById(id) {
    return prisma.adminUser.findUnique({
      where: { id },
    });
  },

  // Verify password
  async verifyPassword(email, password) {
    const user = await this.findByEmail(email);
    if (!user) return null;
    
    const isValid = await argon2.verify(user.passwordHash, password);
    return isValid ? user : null;
  },

  // Create admin user (for seeding)
  async create(email, password) {
    const passwordHash = await argon2.hash(password);
    return prisma.adminUser.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
      },
    });
  },

  // Update password
  async updatePassword(email, newPassword) {
    const passwordHash = await argon2.hash(newPassword);
    return prisma.adminUser.update({
      where: { email: email.toLowerCase() },
      data: { passwordHash },
    });
  },
};
