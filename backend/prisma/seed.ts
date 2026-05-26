import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function loadDatabaseUrlFromEnvFile() {
  if (process.env.DATABASE_URL) {
    return;
  }

  const envPath = resolve(__dirname, '../.env');

  if (!existsSync(envPath)) {
    return;
  }

  const databaseUrlLine = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((line) => line.startsWith('DATABASE_URL='));

  if (!databaseUrlLine) {
    return;
  }

  process.env.DATABASE_URL = databaseUrlLine
    .replace('DATABASE_URL=', '')
    .replace(/^"|"$/g, '');
}

loadDatabaseUrlFromEnvFile();

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Mateus@123', 10);

  await prisma.user.upsert({
    where: { email: 'mateus@example.com' },
    update: {
      name: 'Mateus Nauhan',
      passwordHash,
      role: UserRole.STUDENT,
    },
    create: {
      name: 'Mateus Nauhan',
      email: 'mateus@example.com',
      passwordHash,
      role: UserRole.STUDENT,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
