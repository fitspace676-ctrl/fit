/** Appendix 3.1. Provider text is deliberately not retained: it may echo credentials. */
export type ZkbioErrorReason =
  | 'person_not_found'
  | 'card_in_use'
  | 'level_not_found'
  | 'invalid_photo'
  | 'door_not_found'
  | 'area_not_found'
  | 'page_size'
  | 'time_format'
  | 'unauthorized'
  | 'unknown';

export function errorReason(code: number): ZkbioErrorReason {
  if (code <= -5001 && code >= -5018) return 'invalid_photo';
  const reasons: Record<number, ZkbioErrorReason> = {
    [-22]: 'person_not_found',
    [-23]: 'card_in_use',
    [-24]: 'level_not_found',
    [-27]: 'invalid_photo',
    [-47]: 'door_not_found',
    [-80]: 'area_not_found',
    [-90]: 'page_size',
    [-91]: 'page_size',
    [-92]: 'page_size',
    [-100]: 'time_format',
    [-101]: 'time_format',
  };
  return reasons[code] ?? 'unknown';
}
export class ZkbioApiError extends Error {
  readonly reason: ZkbioErrorReason;
  constructor(readonly code: number) {
    super(`ZKBio request failed (${code})`);
    this.name = 'ZkbioApiError';
    this.reason = errorReason(code);
  }
}
export class ZkbioTransportError extends Error {
  constructor(readonly reason: 'unauthorized' | 'unreachable' | 'not_zkbio' | 'timeout') {
    super(`ZKBio transport failed (${reason})`);
    this.name = 'ZkbioTransportError';
  }
}
