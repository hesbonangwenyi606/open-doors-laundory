import { prisma } from '../db/client.js';

export const processRepository = {
  // Get all process steps ordered by stepNumber
  async getAllSteps() {
    return prisma.processStep.findMany({
      orderBy: { stepNumber: 'asc' },
    });
  },

  // Get process steps as simple array (for API compatibility)
  async getStepsArray() {
    const steps = await this.getAllSteps();
    return {
      steps: steps.map(s => s.title),
      updatedAt: steps.length > 0 ? steps[0].updatedAt : new Date(),
    };
  },

  // Update all process steps
  async updateSteps(steps) {
    // Delete existing steps
    await prisma.processStep.deleteMany();
    
    // Create new steps
    const createdSteps = [];
    for (const [index, title] of steps.entries()) {
      const step = await prisma.processStep.create({
        data: {
          stepNumber: index + 1,
          title,
        },
      });
      createdSteps.push(step);
    }
    
    return {
      steps: createdSteps.map(s => s.title),
      updatedAt: new Date(),
    };
  },

  // Get a specific step by stepNumber
  async getStepByNumber(stepNumber) {
    return prisma.processStep.findUnique({
      where: { stepNumber },
    });
  },

  // Update a specific step
  async updateStep(stepNumber, title) {
    return prisma.processStep.upsert({
      where: { stepNumber },
      update: { title },
      create: {
        stepNumber,
        title,
      },
    });
  },

  // Delete a step
  async deleteStep(stepNumber) {
    return prisma.processStep.delete({
      where: { stepNumber },
    });
  },
};
