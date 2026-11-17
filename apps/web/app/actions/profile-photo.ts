'use server';

import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';
import { tenantHeaders } from '@/lib/tenant-headers';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

interface PhotoUpload {
  url: string;
  publicUrl: string;
  contentType: string;
}

type Result<T> = { ok: true; data: T } | { ok: false };

async function request<T>(path: string, method: string, body?: unknown): Promise<Result<T>> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return { ok: false };
  try {
    const response = await fetch(`${API_URL}/me/profile/photo${path}`, {
      method,
      headers: {
        ...(await tenantHeaders()),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false };
  }
}

export async function createProfilePhotoUpload(input: {
  contentType: string;
  contentLength: number;
}) {
  return request<PhotoUpload>('/upload', 'POST', input);
}

export async function setProfilePhoto(photoUrl: string | null) {
  return request<{ photoUrl: string | null }>(
    '',
    photoUrl === null ? 'DELETE' : 'PATCH',
    photoUrl === null ? undefined : { photoUrl },
  );
}
