import { describe, expect, it } from 'vitest';
import { checkInMethodSchema, recordCheckInSchema } from './check-in';
import { integrationProviderSchema } from './integrations';
import {
  DEFAULT_ZKTECO_DEVICE_SETTINGS,
  DEFAULT_ZKTECO_SETTINGS,
  ZKTECO_CAPABILITIES,
  connectZktecoSchema,
  setMemberAccessCardSchema,
  updateZktecoSettingsSchema,
  zktecoSettingsSchema,
} from './zkteco';

describe('ZKTeco contracts', () => {
  it('connects a ZKBio server with a URL and token', () => {
    expect(
      connectZktecoSchema.parse({
        connectionType: 'zkbio',
        baseUrl: ' https://bio.example.ge:8098 ',
        apiToken: ' token ',
      }),
    ).toEqual({
      connectionType: 'zkbio',
      baseUrl: 'https://bio.example.ge:8098',
      apiToken: 'token',
    });
    expect(
      connectZktecoSchema.safeParse({ connectionType: 'zkbio', baseUrl: 'nope', apiToken: 't' })
        .success,
    ).toBe(false);
  });
  it('defaults a standalone device to port 4370, device 1 and no comm key', () => {
    expect(connectZktecoSchema.parse({ connectionType: 'device', host: '203.0.113.10' })).toEqual({
      connectionType: 'device',
      host: '203.0.113.10',
      port: 4370,
      deviceNumber: 1,
      commKey: 0,
    });
    for (const recordSize of [28, 72]) {
      expect(
        connectZktecoSchema.safeParse({ connectionType: 'device', host: 'h', recordSize }).success,
      ).toBe(true);
    }
    expect(
      connectZktecoSchema.safeParse({ connectionType: 'device', host: 'h', recordSize: 40 })
        .success,
    ).toBe(false);
    expect(
      connectZktecoSchema.safeParse({ connectionType: 'device', host: 'h', port: 70000 }).success,
    ).toBe(false);
  });
  it('ships valid defaults and refuses an unknown time zone', () => {
    expect(zktecoSettingsSchema.parse(DEFAULT_ZKTECO_SETTINGS)).toEqual(DEFAULT_ZKTECO_SETTINGS);
    expect(zktecoSettingsSchema.parse(DEFAULT_ZKTECO_DEVICE_SETTINGS).onExpiry).toBe('delete');
    expect(updateZktecoSettingsSchema.safeParse({ timeZone: 'Mars/Olympus' }).success).toBe(false);
    expect(updateZktecoSettingsSchema.parse({})).toEqual({});
  });
  it('offers a device only what it can do', () => {
    expect(ZKTECO_CAPABILITIES.device).toMatchObject({
      onExpiry: ['delete'],
      syncPhoto: false,
      accessLevels: false,
      whoIsInside: false,
      remoteOpen: true,
    });
    expect(ZKTECO_CAPABILITIES.zkbio.onExpiry).toEqual(['remove_access', 'disable', 'delete']);
  });
  it('takes digit card numbers that fit a device', () => {
    expect(setMemberAccessCardSchema.parse({ cardNumber: ' 0012345 ' })).toEqual({
      cardNumber: '0012345',
    });
    expect(setMemberAccessCardSchema.parse({ cardNumber: null })).toEqual({ cardNumber: null });
    for (const cardNumber of ['', 'A1', '4294967296', '12345678901']) {
      expect(setMemberAccessCardSchema.safeParse({ cardNumber }).success).toBe(false);
    }
  });
  it('adds the provider and the TURNSTILE method without letting the desk send it', () => {
    expect(integrationProviderSchema.parse('zkteco')).toBe('zkteco');
    expect(checkInMethodSchema.parse('TURNSTILE')).toBe('TURNSTILE');
    expect(recordCheckInSchema.safeParse({ gymMemberId: 'm', method: 'TURNSTILE' }).success).toBe(
      false,
    );
  });
});
