import { PrismaClient } from '@prisma/client';
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
  // Seed intentionally empty: from now on, data should be created through the application flows.
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
