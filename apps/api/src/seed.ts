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
      providerOrderId: 'mock_seed_coffee',
      amount: 2550,
      currency: 'USD',
      status: 'SUCCEEDED' as const,
      provider: 'mock',
      description: 'Coffee purchase',
      userId: user1.id,
    },
    {
      providerOrderId: 'mock_seed_course',
      amount: 12000,
      currency: 'USD',
      status: 'SUCCEEDED' as const,
      provider: 'mock',
      description: 'Online course',
      userId: user1.id,
    },
    {
      providerOrderId: 'mock_seed_subscription',
      amount: 4599,
      currency: 'USD',
      status: 'PENDING' as const,
      provider: 'mock',
      description: 'Subscription renewal',
      userId: user2.id,
    },
    {
      providerOrderId: 'mock_seed_electronics',
      amount: 20000,
      currency: 'USD',
      status: 'PROCESSING' as const,
      provider: 'mock',
      description: 'Electronics order',
      userId: user2.id,
    },
    {
      providerOrderId: 'mock_seed_failed',
      amount: 1500,
      currency: 'USD',
      status: 'FAILED' as const,
      provider: 'mock',
      description: 'Failed payment attempt',
      userId: user3.id,
    },
    {
      providerOrderId: 'mock_seed_cancelled',
      amount: 7550,
      currency: 'USD',
      status: 'CANCELLED' as const,
      provider: 'mock',
      description: 'Cancelled booking',
      userId: user3.id,
    },
    {
      providerOrderId: 'mock_seed_refunded',
      amount: 30000,
      currency: 'USD',
      status: 'REFUNDED' as const,
      provider: 'mock',
      description: 'Refunded purchase',
      userId: user1.id,
    },
  ];

  for (const payment of payments) {
    await prisma.payment.upsert({
      where: { providerOrderId: payment.providerOrderId },
      update: {},
      create: payment,
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
