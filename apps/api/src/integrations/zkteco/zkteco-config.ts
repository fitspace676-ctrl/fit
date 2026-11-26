import {
  DEFAULT_ZKTECO_DEVICE_SETTINGS,
  DEFAULT_ZKTECO_SETTINGS,
  zktecoConnectionInfoSchema,
  zktecoSettingsSchema,
  type ZktecoConnectionInfo,
  type ZktecoConnectionType,
  type ZktecoSettings,
} from '@fit/types';

/**
 * What `GymIntegration.settings` holds for the `zkteco` provider: the non-secret
 * half of the connection and the options chosen on the card. The API token or
 * comm key is the integration's encrypted secret, never part of this object.
 */
export interface StoredZkteco {
  connection: ZktecoConnectionInfo | null;
  options: ZktecoSettings;
}

export function defaultSettings(type: ZktecoConnectionType | null): ZktecoSettings {
  return type === 'device' ? DEFAULT_ZKTECO_DEVICE_SETTINGS : DEFAULT_ZKTECO_SETTINGS;
}

/**
 * Read the stored JSON defensively: a missing or malformed value (an older
 * build, a hand edit) degrades to the defaults rather than failing the card.
 * Unknown keys are dropped by the schemas.
 */
export function readStored(value: unknown): StoredZkteco {
  const record = isRecord(value) ? value : {};
  const connection = zktecoConnectionInfoSchema.safeParse(record.connection);
  const type = connection.success ? connection.data.connectionType : null;
  const options = zktecoSettingsSchema.safeParse({
    ...defaultSettings(type),
    ...(isRecord(record.options) ? record.options : {}),
  });
  return {
    connection: connection.success ? connection.data : null,
    options: options.success ? options.data : defaultSettings(type),
  };
}

/**
 * The first setting the connection type cannot honour, or `null`. The card hides
 * these through the capability flags; this is the API's own refusal for a client
 * that did not.
 */
export function unsupportedSetting(
  type: ZktecoConnectionType,
  options: ZktecoSettings,
): keyof ZktecoSettings | null {
  if (type === 'zkbio') return null;
  if (options.syncPhoto) return 'syncPhoto';
  if (options.onExpiry !== 'delete') return 'onExpiry';
  if (options.accessLevelIds.length > 0) return 'accessLevelIds';
  if (options.entranceLevelIds.length > 0) return 'entranceLevelIds';
  if (options.checkInDoor !== null) return 'checkInDoor';
  if (options.insideZoneCode !== null) return 'insideZoneCode';
  return null;
}

/**
 * Settings carried over when the owner reconnects with another connection type:
 * what the new type cannot do falls back to its default instead of making the
 * stored settings invalid.
 */
export function coerceForType(type: ZktecoConnectionType, options: ZktecoSettings): ZktecoSettings {
  if (type === 'zkbio') return options;
  return {
    ...options,
    syncPhoto: false,
    onExpiry: 'delete',
    accessLevelIds: [],
    entranceLevelIds: [],
    checkInDoor: null,
    insideZoneCode: null,
  };
}

const WALL_FORMAT_CACHE = new Map<string, Intl.DateTimeFormat>();
function wallFormat(timeZone: string): Intl.DateTimeFormat {
  let format = WALL_FORMAT_CACHE.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    WALL_FORMAT_CACHE.set(timeZone, format);
  }
  return format;
}

/** `2026-11-20T09:15:00`: the wall clock in `timeZone` at `at`, without an offset. */
export function localWallTime(at: Date, timeZone: string): string {
  const parts: Record<string, string> = {};
  for (const part of wallFormat(timeZone).formatToParts(at)) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/** Minutes east of UTC for `timeZone` at `at` (Tbilisi: 240). */
export function utcOffsetMinutes(timeZone: string, at: Date): number {
  const seconds = Math.floor(at.getTime() / 1000) * 1000;
  const wall = Date.parse(`${localWallTime(new Date(seconds), timeZone)}Z`);
  return Math.round((wall - seconds) / 60_000);
}

/**
 * The instant a device-local wall clock names. Resolved twice so a reading near
 * a DST change uses the offset in force at that moment; an ambiguous hour takes
 * the first occurrence.
 */
export function wallTimeToInstant(local: string, timeZone: string): Date {
  const naive = Date.parse(`${local}Z`);
  if (!Number.isFinite(naive)) throw new RangeError('Invalid wall time');
  const first = naive - utcOffsetMinutes(timeZone, new Date(naive)) * 60_000;
  return new Date(naive - utcOffsetMinutes(timeZone, new Date(first)) * 60_000);
}

const GEORGIAN_LATIN: Record<string, string> = {
  ა: 'a',
  ბ: 'b',
  გ: 'g',
  დ: 'd',
  ე: 'e',
  ვ: 'v',
  ზ: 'z',
  თ: 't',
  ი: 'i',
  კ: 'k',
  ლ: 'l',
  მ: 'm',
  ნ: 'n',
  ო: 'o',
  პ: 'p',
  ჟ: 'zh',
  რ: 'r',
  ს: 's',
  ტ: 't',
  უ: 'u',
  ფ: 'p',
  ქ: 'k',
  ღ: 'gh',
  ყ: 'q',
  შ: 'sh',
  ჩ: 'ch',
  ც: 'ts',
  ძ: 'dz',
  წ: 'ts',
  ჭ: 'ch',
  ხ: 'kh',
  ჯ: 'j',
  ჰ: 'h',
};

/**
 * A name a standalone device can store and show: its name field is 8 bytes
 * (28-byte records) or 24 bytes (72-byte records) and most screens cannot draw
 * Georgian, so Georgian is transliterated, anything else non-ASCII dropped, and
 * the result cut to fit. Never empty: the PIN stands in.
 */
export function deviceUserName(name: string, pin: string, recordSize: 28 | 72): string {
  const max = recordSize === 28 ? 8 : 24;
  const latin = [...name]
    .map((char) => GEORGIAN_LATIN[char] ?? char)
    .join('')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (latin || pin).slice(0, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
