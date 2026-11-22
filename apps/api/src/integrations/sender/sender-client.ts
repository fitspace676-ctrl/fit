import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(SenderClient.name);

  async getBalance(apiKey: string): Promise<BalanceResult> {
    const reply = await this.request('getBalance.php', { apikey: apiKey });
    if (reply === 'unreachable') return { ok: false, reason: 'unreachable' };
    // Documented as a string ("123.45"); a bare number is accepted too so a
    // working key is never reported as a wrong one over the value's type.
    const raw = record(record(reply.body)?.data)?.balance;
    const balance = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : raw;
    if (typeof balance === 'string' && balance.length > 0) return { ok: true, balance };
    this.refused('getBalance', reply);
    return { ok: false, reason: 'bad_key' };
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
    const data = record(reply.body)?.data;
    const raw = Array.isArray(data) ? record(data[0])?.messageId : undefined;
    const messageId = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : raw;
    if (typeof messageId === 'string' && messageId.length > 0) return { ok: true, messageId };
    this.refused('send', reply);
    return { ok: false, reason: 'rejected' };
  }

  /**
   * Why a reply was not a success, for whoever reads the logs: the HTTP status
   * and the reply's SHAPE only (field names and value types). Never a value —
   * no key, phone number, message text or provider wording.
   */
  private refused(operation: string, reply: Reply): void {
    this.logger.warn(
      `Sender ${operation} refused: HTTP ${reply.status}, body ${shape(reply.body)}`,
    );
  }

  private async request(
    path: string,
    params: Record<string, string>,
  ): Promise<Reply | 'unreachable'> {
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
      const text = await response.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = text.length > 0 ? NOT_JSON : null;
      }
      // A refusal's body is never read for success fields.
      return { status: response.status, body: response.ok ? body : refusal(body) };
    } catch {
      return 'unreachable';
    } finally {
      clearTimeout(timer);
    }
  }
}

interface Reply {
  status: number;
  body: unknown;
}

const NOT_JSON = Symbol('not-json');
const REFUSAL = Symbol('refusal');

/** Wraps a non-2xx body so no success field can be read from it, keeping its shape for the log. */
function refusal(body: unknown): { [REFUSAL]: unknown } {
  return { [REFUSAL]: body };
}

/** Field names and value types, three levels deep. Carries no values. */
function shape(value: unknown, depth = 0): string {
  if (value === NOT_JSON) return 'not-json';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `array(${value.length})${value.length > 0 && depth < 3 ? ` of ${shape(value[0], depth + 1)}` : ''}`;
  }
  if (typeof value === 'object') {
    const inner = (value as { [REFUSAL]?: unknown })[REFUSAL];
    if (inner !== undefined || REFUSAL in value) return shape(inner, depth);
    if (depth >= 3) return 'object';
    const fields = Object.entries(value as Record<string, unknown>)
      .slice(0, 12)
      .map(([key, field]) => `${key.slice(0, 24)}:${shape(field, depth + 1)}`);
    return `{${fields.join(',')}}`;
  }
  return typeof value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
