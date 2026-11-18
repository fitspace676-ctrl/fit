import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { StorageService } from '../storage/storage.service';
import type { MediaCleanupService } from '../storage/media-cleanup.service';
import type { RedisService } from '../redis/redis.service';
import { MePhotoService } from './me-photo.service';

const OLD = 'https://images.example/gym-1/memberphotos/old.jpg';
const NEW = 'https://images.example/gym-1/memberphotos/new.jpg';

function setup(userId: string | null = 'user-1') {
  const member = { id: 'member-1', photoUrl: OLD };
  const findFirst = vi.fn().mockResolvedValue(member);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const createSignedUpload = vi.fn().mockResolvedValue({ publicUrl: NEW, expiresIn: 300 });
  const discardUnreferenced = vi.fn().mockResolvedValue(undefined);
  const grants = new Map<string, string>();
  const set = vi.fn((key: string, value: string) => {
    grants.set(key, value);
    return Promise.resolve('OK');
  });
  const getdel = vi.fn((key: string) => {
    const value = grants.get(key) ?? null;
    grants.delete(key);
    return Promise.resolve(value);
  });
  const tenant = { userId, gymId: 'gym-1' };
  const service = new MePhotoService(
    { client: { gymMember: { findFirst, updateMany } } } as unknown as PrismaService,
    tenant as unknown as TenantContext,
    { createSignedUpload, publicUrl: () => 'https://images.example/' } as unknown as StorageService,
    { discardUnreferenced } as unknown as MediaCleanupService,
    { client: { set, getdel } } as unknown as RedisService,
  );
  return { service, findFirst, updateMany, createSignedUpload, discardUnreferenced, tenant, set };
}

const input = { contentType: 'image/jpeg', contentLength: 123 };

describe('MePhotoService', () => {
  it('signs and updates only the caller in the current gym', async () => {
    const s = setup();
    await s.service.createUpload(input);
    expect(s.createSignedUpload).toHaveBeenCalledWith({
      ...input,
      gymId: 'gym-1',
      entity: 'memberphotos',
    });
    expect(s.set).toHaveBeenCalledWith(expect.stringContaining('gym-1:member-1:'), '1', 'EX', 300);
    await expect(s.service.setPhoto(NEW)).resolves.toEqual({ photoUrl: NEW });
    expect(s.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', gymId: 'gym-1', deletedAt: null },
      select: { id: true, photoUrl: true },
    });
    expect(s.updateMany).toHaveBeenCalledWith({
      where: { id: 'member-1', userId: 'user-1', gymId: 'gym-1', deletedAt: null, photoUrl: OLD },
      data: { photoUrl: NEW },
    });
    expect(s.discardUnreferenced).toHaveBeenCalledWith('gym-1', [OLD], [NEW]);
  });

  it.each([
    'https://evil.example/photo.jpg',
    'https://images.example/gym-2/memberphotos/new.jpg',
    NEW,
  ])('rejects a URL without the caller upload grant: %s', async (url) => {
    const s = setup();
    await expect(s.service.setPhoto(url)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.updateMany).not.toHaveBeenCalled();
    expect(s.discardUnreferenced).not.toHaveBeenCalled();
  });

  it('does not transfer an upload grant to another member or gym', async () => {
    const s = setup();
    await s.service.createUpload(input);
    s.tenant.userId = 'user-2';
    s.findFirst.mockResolvedValue({ id: 'member-2', photoUrl: null });
    await expect(s.service.setPhoto(NEW)).rejects.toBeInstanceOf(BadRequestException);
    s.tenant.gymId = 'gym-2';
    s.findFirst.mockResolvedValue({ id: 'member-1', photoUrl: null });
    await expect(s.service.setPhoto(NEW)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.updateMany).not.toHaveBeenCalled();
  });

  it('cannot reattach an already consumed upload', async () => {
    const s = setup();
    await s.service.createUpload(input);
    await s.service.setPhoto(NEW);
    await expect(s.service.setPhoto(NEW)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes the caller photo and cleans it up after the write', async () => {
    const s = setup();
    await expect(s.service.setPhoto(null)).resolves.toEqual({ photoUrl: null });
    expect(s.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { photoUrl: null } }),
    );
    expect(s.discardUnreferenced).toHaveBeenCalledWith('gym-1', [OLD], [null]);
    expect(s.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      s.discardUnreferenced.mock.invocationCallOrder[0]!,
    );
  });

  it('does not delete anything when a concurrent update wins', async () => {
    const s = setup();
    s.updateMany.mockResolvedValue({ count: 0 });
    await expect(s.service.setPhoto(null)).rejects.toBeInstanceOf(ConflictException);
    expect(s.discardUnreferenced).not.toHaveBeenCalled();
  });

  it('requires a session and a non-deleted membership', async () => {
    const signedOut = setup(null);
    await expect(signedOut.service.createUpload(input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(signedOut.findFirst).not.toHaveBeenCalled();
    const missing = setup();
    missing.findFirst.mockResolvedValue(null);
    await expect(missing.service.setPhoto(null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects unsupported MIME types and propagates the shared size limit', async () => {
    const s = setup();
    await expect(
      s.service.createUpload({ ...input, contentType: 'image/svg+xml' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(s.createSignedUpload).not.toHaveBeenCalled();
    s.createSignedUpload.mockRejectedValue(new BadRequestException('File exceeds upload limit'));
    await expect(
      s.service.createUpload({ ...input, contentLength: 999999999 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(s.set).not.toHaveBeenCalled();
  });
});
