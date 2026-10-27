import 'server-only';
import { z } from 'zod';

const publicEnvironmentSchema = z.object({
  appUrl: z.url().default('http://localhost:3000'),
});

export function getPublicEnvironment() {
  return publicEnvironmentSchema.parse({ appUrl: process.env.NEXT_PUBLIC_APP_URL || undefined });
}
