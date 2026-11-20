import { createHash, timingSafeEqual } from 'node:crypto';

export type FlittParams = Record<string, string | number | boolean | null | undefined>;

/** Flitt signs UTF-8 values in parameter-name order; zero is not empty. */
export function signFlittParams(secretKey: string, params: FlittParams): string {
  const values = Object.keys(params)
    .filter((key) => key !== 'signature' && key !== 'response_signature_string')
    .sort()
    .map((key) => params[key])
    .filter((value) => value !== '' && value !== null && value !== undefined);
  return createHash('sha1')
    .update([secretKey, ...values].join('|'), 'utf8')
    .digest('hex');
}

/** Accept only a complete SHA-1 digest before the constant-time comparison. */
export function verifyFlittSignature(secretKey: string, payload: FlittParams): boolean {
  const signature = payload.signature;
  if (typeof signature !== 'string' || !/^[a-f0-9]{40}$/.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(signFlittParams(secretKey, payload), 'hex'),
  );
}
