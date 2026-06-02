import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@fit/db';
import { TokenService, type SessionClaims } from './token.service';
import { PrismaService } from '../prisma/prisma.service';
import { prisma, resetDb, disconnect } from '../test/integration-db';

/**
 * Refresh-token rotation + reuse detection, proven against a real Postgres
 * (T2.3). The unit tests cover the branching with a mocked client; this asserts
 * the persisted lineage really behaves: a rotated token is single-use, and
 * replaying a spent token revokes the *whole* family in the database.
 */

const SCOPE: SessionClaims = { gymId: null, role: Role.MEMBER, tokenVersion: 0 };

describe('TokenService rotation (integration)', () => {
  const tokens = new TokenService(new PrismaService());
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({ data: { email: 'rt@example.com' } });
    userId = user.id;
  });

  afterAll(disconnect);

  it('rotates a refresh token once and persists a successor in the same family', async () => {
    const first = await tokens.issueTokenPair(userId, SCOPE);
    const second = await tokens.rotateRefreshToken(first.refreshToken, SCOPE);

    expect(second.refreshToken).not.toBe(first.refreshToken);

    const rows = await prisma.refreshToken.findMany({ where: { userId } });
    expect(rows).toHaveLength(2); // the spent original + its live successor
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(1); // same lineage
    const live = rows.filter((r) => r.revokedAt === null);
    expect(live).toHaveLength(1);
  });

  it('detects reuse of a spent token and revokes the entire family', async () => {
    const first = await tokens.issueTokenPair(userId, SCOPE);
    await tokens.rotateRefreshToken(first.refreshToken, SCOPE); // spends `first`

    // Replaying the already-spent original is the signature of a stolen token.
    await expect(tokens.rotateRefreshToken(first.refreshToken, SCOPE)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const rows = await prisma.refreshToken.findMany({ where: { userId } });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true); // whole family dead
  });

  it('rejects the (previously live) successor too once the family is revoked', async () => {
    const first = await tokens.issueTokenPair(userId, SCOPE);
    const second = await tokens.rotateRefreshToken(first.refreshToken, SCOPE);
    await tokens.rotateRefreshToken(first.refreshToken, SCOPE).catch(() => undefined); // trips reuse

    await expect(tokens.rotateRefreshToken(second.refreshToken, SCOPE)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an unknown token without touching the table', async () => {
    await expect(tokens.rotateRefreshToken('not-a-real-token', SCOPE)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('logout revokes the presented token family', async () => {
    const pair = await tokens.issueTokenPair(userId, SCOPE);
    await tokens.revokeRefreshToken(pair.refreshToken);

    const rows = await prisma.refreshToken.findMany({ where: { userId } });
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });
});
