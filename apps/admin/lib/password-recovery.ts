import type { ResetPasswordResponse } from '@fit/types';
import { browserTenantHeaders } from './tenant-host';
import { loginGymSlug } from '@/app/login/login-gym-slug';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '/admin';

async function post(path: string, body: unknown, locale?: string): Promise<Response> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      ...browserTenantHeaders(),
      'Content-Type': 'application/json',
      ...(locale ? { 'Accept-Language': locale } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Password recovery failed');
  return response;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const gymSlug = loginGymSlug(window.location.host, process.env.NEXT_PUBLIC_ROOT_DOMAIN);
  await post(
    '/auth/forgot-password',
    {
      email,
      audience: 'staff',
      ...(gymSlug ? { gymSlug } : {}),
    },
    document.documentElement.lang,
  );
}

export async function resetPassword(
  token: string,
  password: string,
): Promise<ResetPasswordResponse> {
  const response = await post('/auth/reset-password', { token, password });
  const result = (await response.json()) as ResetPasswordResponse;
  if (result.sessionIssued) {
    const session = await fetch(`${BASE_PATH}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ accessToken: result.accessToken, refreshToken: result.refreshToken }),
    });
    if (!session.ok) throw new Error('Session could not be saved');
  }
  return result;
}
