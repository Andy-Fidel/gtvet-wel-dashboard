import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(serverDirectory, '../.env') });

const { verifyMailerConnection } = await import('./utils/mailer.js');

try {
  await verifyMailerConnection();
  console.log('SMTP connection and authentication succeeded.');
} catch (error) {
  console.error(`SMTP verification failed: ${error.code || error.name}: ${error.message}`);
  process.exitCode = 1;
}
