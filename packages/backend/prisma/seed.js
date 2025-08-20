// prisma/seed.js
const { PrismaClient } = require('../generated/prisma');
const { hashPassword } = require('../utils/password');

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const adminPassword = await hashPassword('admin123');
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      username: 'admin',
      password: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'ADMIN',
      isEmailVerified: true,
      isActive: true
    }
  });
  
  // Create cashier user
  const cashierPassword = await hashPassword('cashier123');
  
  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@example.com' },
    update: {},
    create: {
      email: 'cashier@example.com',
      username: 'cashier',
      password: cashierPassword,
      firstName: 'John',
      lastName: 'Cashier',
      role: 'CASHIER',
      isEmailVerified: true,
      isActive: true
    }
  });
  
  console.log({ admin, cashier });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });