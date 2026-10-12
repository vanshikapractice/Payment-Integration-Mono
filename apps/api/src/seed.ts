import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('password123', 10);

  const user1 = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      name: 'Test User',
      password: passwordHash,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      name: 'Alice Johnson',
      password: passwordHash,
    },
  });

  const user3 = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      name: 'Bob Smith',
      password: passwordHash,
    },
  });

  console.log('Created users:', [user1, user2, user3].map(u => u.email));

  const payments = [
    {
      amount: 25.50,
      currency: 'USD',
      status: 'SUCCEEDED' as const,
      description: 'Coffee purchase',
      userId: user1.id,
    },
    {
      amount: 120.00,
      currency: 'USD',
      status: 'SUCCEEDED' as const,
      description: 'Online course',
      userId: user1.id,
    },
    {
      amount: 45.99,
      currency: 'USD',
      status: 'PENDING' as const,
      description: 'Subscription renewal',
      userId: user2.id,
    },
    {
      amount: 200.00,
      currency: 'USD',
      status: 'PROCESSING' as const,
      description: 'Electronics order',
      userId: user2.id,
    },
    {
      amount: 15.00,
      currency: 'USD',
      status: 'FAILED' as const,
      description: 'Failed payment attempt',
      userId: user3.id,
    },
    {
      amount: 75.50,
      currency: 'USD',
      status: 'CANCELLED' as const,
      description: 'Cancelled booking',
      userId: user3.id,
    },
    {
      amount: 300.00,
      currency: 'USD',
      status: 'REFUNDED' as const,
      description: 'Refunded purchase',
      userId: user1.id,
    },
  ];

  for (const payment of payments) {
    await prisma.payment.create({
      data: payment,
    });
  }

  console.log(`Created ${payments.length} payments`);
  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });