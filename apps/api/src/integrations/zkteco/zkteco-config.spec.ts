import { describe, expect, it } from 'vitest';
import { DEFAULT_ZKTECO_DEVICE_SETTINGS, DEFAULT_ZKTECO_SETTINGS } from '@fit/types';
import {
  coerceForType,
  deviceUserName,
  localWallTime,
  readStored,
  unsupportedSetting,
  utcOffsetMinutes,
  wallTimeToInstant,
} from './zkteco-config';

const device = {
  connectionType: 'device' as const,
  baseUrl: null,
  host: '203.0.113.10',
  port: 4370,
  deviceNumber: 1,
  recordSize: 72 as const,
};

describe('readStored', () => {
  it('degrades a missing or malformed value to the defaults', () => {
    expect(readStored(null)).toEqual({ connection: null, options: DEFAULT_ZKTECO_SETTINGS });
    expect(readStored('nonsense')).toEqual({ connection: null, options: DEFAULT_ZKTECO_SETTINGS });
    expect(
      readStored({ connection: { connectionType: 'x' }, options: { onExpiry: 'boom' } }),
    ).toEqual({ connection: null, options: DEFAULT_ZKTECO_SETTINGS });
  });
  it('uses the device defaults for a device and merges stored options over them', () => {
    const stored = readStored({ connection: device, options: { importEvents: false } });
    expect(stored.connection).toEqual(device);
    expect(stored.options).toEqual({ ...DEFAULT_ZKTECO_DEVICE_SETTINGS, importEvents: false });
  });
});

describe('capabilities', () => {
  it('accepts everything on zkbio', () => {
    expect(
      unsupportedSetting('zkbio', {
        ...DEFAULT_ZKTECO_SETTINGS,
        syncPhoto: true,
        onExpiry: 'disable',
        accessLevelIds: ['1'],
        checkInDoor: { kind: 'gate', id: 'g1' },
      }),
    ).toBeNull();
  });
  it('names the first setting a standalone device cannot honour', () => {
    const base = DEFAULT_ZKTECO_DEVICE_SETTINGS;
    expect(unsupportedSetting('device', base)).toBeNull();
    expect(unsupportedSetting('device', { ...base, syncPhoto: true })).toBe('syncPhoto');
    expect(unsupportedSetting('device', { ...base, onExpiry: 'disable' })).toBe('onExpiry');
    expect(unsupportedSetting('device', { ...base, accessLevelIds: ['1'] })).toBe('accessLevelIds');
    expect(unsupportedSetting('device', { ...base, insideZoneCode: 'z' })).toBe('insideZoneCode');
  });
  it('coerces zkbio options when the owner switches to a device', () => {
    const coerced = coerceForType('device', {
      ...DEFAULT_ZKTECO_SETTINGS,
      syncPhoto: true,
      onExpiry: 'disable',
      entranceLevelIds: ['e'],
      checkInDoor: { kind: 'door', id: 'd' },
      deviceLocations: { SN1: 'loc' },
    });
    expect(unsupportedSetting('device', coerced)).toBeNull();
    expect(coerced.deviceLocations).toEqual({ SN1: 'loc' });
  });
});

describe('time zones', () => {
  it('computes Tbilisi as UTC+4 and round-trips wall clocks', () => {
    const at = new Date('2026-11-20T08:15:30.000Z');
    expect(utcOffsetMinutes('Asia/Tbilisi', at)).toBe(240);
    expect(localWallTime(at, 'Asia/Tbilisi')).toBe('2026-11-20T12:15:30');
    expect(wallTimeToInstant('2026-11-20T12:15:30', 'Asia/Tbilisi').toISOString()).toBe(
      at.toISOString(),
    );
  });
  it('respects daylight saving where the zone has it', () => {
    expect(utcOffsetMinutes('Europe/Berlin', new Date('2026-07-01T12:00:00Z'))).toBe(120);
    expect(utcOffsetMinutes('Europe/Berlin', new Date('2026-12-01T12:00:00Z'))).toBe(60);
    expect(wallTimeToInstant('2026-07-01T14:00:00', 'Europe/Berlin').toISOString()).toBe(
      '2026-07-01T12:00:00.000Z',
    );
  });
});

describe('deviceUserName', () => {
  it('transliterates Georgian and fits the record layout', () => {
    expect(deviceUserName('ნინო ბერიძე', '20001', 72)).toBe('nino beridze');
    expect(deviceUserName('ნინო ბერიძე', '20001', 28)).toBe('nino ber');
    expect(deviceUserName('შოთა ჭავჭავაძე', '20002', 72)).toBe('shota chavchavadze');
  });
  it('drops what a device cannot draw and never returns an empty name', () => {
    expect(deviceUserName('Анна', '20003', 72)).toBe('20003');
    expect(deviceUserName('  ', '20004', 28)).toBe('20004');
    expect(Buffer.byteLength(deviceUserName('A'.repeat(40), '1', 72))).toBe(24);
  });
});
