import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Body, Controller, Get, INestApplication, NotFoundException, Post } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { loggerConfig } from '../logging';
import { AllExceptionsFilter, type ErrorResponseBody } from './all-exceptions.filter';

/**
 * Throws the representative exception families so the test can assert that the
 * global filter renders each as the documented `{ code, message, details,
 * requestId }` contract over real HTTP — not just in a unit harness.
 */
@Controller('test-errors')
class TestErrorsController {
  @Post('validation')
  validation(@Body() _body: unknown): never {
    throw new BadRequestException(['email must be an email', 'password is too short']);
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundException('widget not found');
  }

  @Get('boom')
  boom(): never {
    throw new Error('connection string leaked secret');
  }
}

describe('error response contract (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot(loggerConfig())],
      controllers: [TestErrorsController],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('renders a 400 validation error with details and an echoed requestId', async () => {
    const res = await fetch(`${baseUrl}/test-errors/validation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-it-1' },
      body: '{}',
    });
    const body = (await res.json()) as ErrorResponseBody;

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Validation failed');
    expect(body.details).toEqual(['email must be an email', 'password is too short']);
    expect(body.requestId).toBe('req-it-1');
    // 4xx is not reported to Sentry, so no event id is attached.
    expect(body.sentryEventId).toBeUndefined();
    // Wire contract is exactly these keys.
    expect(Object.keys(body).sort()).toEqual(['code', 'details', 'message', 'requestId']);
  });

  it('renders a 404 with a null details payload', async () => {
    const res = await fetch(`${baseUrl}/test-errors/not-found`, {
      headers: { 'x-request-id': 'req-it-2' },
    });
    const body = (await res.json()) as ErrorResponseBody;

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toBe('widget not found');
    expect(body.details).toBeNull();
    expect(body.requestId).toBe('req-it-2');
  });

  it('renders an opaque 500 that never leaks the original message', async () => {
    const res = await fetch(`${baseUrl}/test-errors/boom`, {
      headers: { 'x-request-id': 'req-it-3' },
    });
    const body = (await res.json()) as ErrorResponseBody;

    expect(res.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Internal server error');
    expect(body.message).not.toContain('secret');
    expect(body.requestId).toBe('req-it-3');
  });
});
