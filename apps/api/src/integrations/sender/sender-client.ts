import { Injectable } from '@nestjs/common';
import { env } from '../../config/env';

export type BalanceResult =
  | { ok: true; balance: string }
  | { ok: false; reason: 'bad_key' | 'unreachable' };
export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: 'rejected' | 'unreachable' };

/** Stateless transport. Never retries: an uncertain send may already have been accepted. */
@Injectable()
export class SenderClient {
  async getBalance(apiKey: string): Promise<BalanceResult> {
    const reply = await this.request('getBalance.php', { apikey: apiKey });
    if (reply === 'unreachable') return { ok: false, reason: 'unreachable' };
    const balance = record(record(reply)?.data)?.balance;
    return typeof balance === 'string' && balance.length > 0
      ? { ok: true, balance }
      : { ok: false, reason: 'bad_key' };
  }

  async send(
    apiKey: string,
    input: { destination: string; content: string; smsno: 1 | 2 },
  ): Promise<SendResult> {
    const reply = await this.request('send.php', {
      apikey: apiKey,
      ...input,
      smsno: String(input.smsno),
    });
    if (reply === 'unreachable') return { ok: false, reason: 'unreachable' };
    const data = record(reply)?.data;
    const messageId = Array.isArray(data) ? record(data[0])?.messageId : undefined;
    return typeof messageId === 'string' && messageId.length > 0
      ? { ok: true, messageId }
      : { ok: false, reason: 'rejected' };
  }

  private async request(path: string, params: Record<string, string>): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${env.SENDER_API_URL.replace(/\/$/, '')}/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams(params).toString(),
        signal: controller.signal,
        redirect: 'error',
      });
      if (response.status >= 500) return 'unreachable';
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return 'unreachable';
    } finally {
      clearTimeout(timer);
    }
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
