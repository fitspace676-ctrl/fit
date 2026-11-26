import { describe, expect, it, vi } from 'vitest';
import { assertPublicHost, normalizeBaseUrl, ZkbioUrlError } from './zkbio-url';

describe('base URL normalization', () => {
  it.each([
    ['https://example.com/', 'https://example.com'],
    ['http://example.com:8088/api/', 'http://example.com:8088'],
    ['https://example.com/api', 'https://example.com'],
    ['https://[2606:4700:4700::1111]/api', 'https://[2606:4700:4700::1111]'],
  ])('normalizes %s', (input, expected) => expect(normalizeBaseUrl(input)).toBe(expected));
  it.each([
    'ftp://example.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    '//example.com',
    'not a url',
    'https://user:secret@example.com',
    'https://user@example.com',
    'https://example.com?q=1',
    'https://example.com#fragment',
    'https://example.com?',
    'https://example.com#',
    'https://example.com/proxy/api',
    'https://example.com/api/other',
  ])('rejects %s without echoing it', (input) => {
    expect(() => normalizeBaseUrl(input)).toThrow(ZkbioUrlError);
    try {
      normalizeBaseUrl(input);
    } catch (error) {
      expect(String(error)).not.toContain(input);
    }
  });
});
describe('public host guard', () => {
  it.each([
    '0.0.0.0',
    '0.1.2.3',
    '10.1.2.3',
    '127.0.0.1',
    '127.255.255.255',
    '100.64.0.1',
    '100.127.255.254',
    '169.254.169.254',
    '169.254.0.1',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.0.1',
    '192.168.255.254',
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
    '[::]',
    '[::1]',
    '[fc00::1]',
    '[fdff::1]',
    '[fe80::1]',
    '[febf::1]',
    '[ff02::1]',
    '[::ffff:127.0.0.1]',
    '[::ffff:a00:1]',
    '[::ffff:169.254.169.254]',
    '[::ffff:ac10:1]',
    '[::ffff:c0a8:1]',
    '[::ffff:6440:1]',
    '[::ffff:0:0]',
    '[::ffff:e000:1]',
    '[::127.0.0.1]',
    '[64:ff9b::a00:1]',
    '[2002:7f00:1::]',
    '2130706433',
    '0x7f000001',
    '0177.0.0.1',
    '127.1',
  ])('rejects nonpublic literal %s', async (host) => {
    const lookup = vi.fn();
    await expect(assertPublicHost(`http://${host}:8088`, { lookup })).rejects.toBeInstanceOf(
      ZkbioUrlError,
    );
    expect(lookup).not.toHaveBeenCalled();
  });
  it.each([
    '8.8.8.8',
    '100.63.255.255',
    '100.128.0.1',
    '172.15.0.1',
    '172.32.0.1',
    '[2606:4700:4700::1111]',
    '[::ffff:8.8.8.8]',
  ])('allows public literal %s', async (host) => {
    const addresses = await assertPublicHost(`https://${host}`);
    expect(addresses).toHaveLength(1);
  });
  it('returns all vetted DNS answers for pinning', async () => {
    const answers = [
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ];
    const lookup = vi.fn().mockResolvedValue(answers);
    await expect(assertPublicHost('https://gym.example', { lookup })).resolves.toEqual(answers);
    expect(lookup).toHaveBeenCalledWith('gym.example', { all: true, verbatim: true });
  });
  it.each([
    [
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ],
    [
      { address: '8.8.8.8', family: 4 },
      { address: '::1', family: 6 },
    ],
    [
      { address: '8.8.8.8', family: 4 },
      { address: '::ffff:192.168.1.1', family: 6 },
    ],
    [{ address: '8.8.8.8', family: 6 }],
    [{ address: 'garbage', family: 4 }],
    [],
  ])('rejects mixed/private, invalid or empty DNS responses %#', async (...answers) => {
    const lookup = vi.fn().mockResolvedValue(answers);
    await expect(assertPublicHost('https://gym.example', { lookup })).rejects.toBeInstanceOf(
      ZkbioUrlError,
    );
  });
  it('sanitizes DNS failures and checks the next lookup again', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
      .mockRejectedValueOnce(new Error('secret URL'));
    await assertPublicHost('https://gym.example', { lookup });
    await expect(assertPublicHost('https://gym.example', { lookup })).rejects.toThrow(
      ZkbioUrlError,
    );
    await expect(assertPublicHost('https://gym.example', { lookup })).rejects.toThrow(
      'ZKBio requires a public HTTP(S) server URL',
    );
  });
});
