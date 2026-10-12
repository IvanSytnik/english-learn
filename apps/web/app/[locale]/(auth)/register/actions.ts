'use server';

import { prisma } from '@englishlearn/db';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { signIn } from '@/lib/auth';
import { redirectAfterAuth } from '@/lib/auth-redirect';

const registerSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(120),
});

export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerUser(formData: FormData): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input' };
  }
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: 'Email already in use' };
  }

  const passwordHash = await hash(password, 10);
  await prisma.user.create({
    data: { name, email, passwordHash },
  });

  await signIn('credentials', { email, password, redirect: false });
  return redirectAfterAuth(formData.get('callbackUrl'));
}
