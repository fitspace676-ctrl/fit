'use server';

import { activateAccountSchema, loginSchema } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, changeMyPassword } from '@/lib/api';

export async function changePasswordAction(input: { currentPassword: string; password: string }) {
  const session = await getServerSession();
  if (!session || !['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER'].includes(session.role))
    return { ok: false, error: 'error' } as const;
  const parsed = activateAccountSchema
    .pick({ password: true })
    .extend({ currentPassword: loginSchema.shape.password })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: 'weakPassword' } as const;
  try {
    await changeMyPassword(parsed.data);
    return { ok: true } as const;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof ApiError && error.message === 'INVALID_CREDENTIALS'
          ? 'wrongPassword'
          : error instanceof ApiError && error.status === 429
            ? 'rateLimited'
            : 'error',
    } as const;
  }
}
