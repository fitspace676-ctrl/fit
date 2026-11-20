import { beforeEach, describe, expect, it, vi } from 'vitest';
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { INTEGRATIONS_ENCRYPTION_KEY: undefined as string | undefined },
}));
vi.mock('../../config/env', () => ({ env: mockEnv }));
import { SecretBox } from './secret-box';

const box = new SecretBox();
beforeEach(() => {
  mockEnv.INTEGRATIONS_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
});
describe('SecretBox', () => {
  it('round-trips UTF-8 with a random nonce and versioned ciphertext', () => {
    const first = box.encrypt('გასაღები');
    expect(first).toMatch(/^v1:/);
    expect(first).not.toContain('გასაღები');
    expect(box.encrypt('გასაღები')).not.toBe(first);
    expect(box.decrypt(first)).toBe('გასაღები');
  });
  it('rejects tampering and a wrong key', () => {
    const encrypted = box.encrypt('secret');
    const parts = encrypted.split(':');
    const tag = Buffer.from(parts[2]!, 'base64');
    tag[0] = tag[0]! ^ 1;
    parts[2] = tag.toString('base64');
    expect(() => box.decrypt(parts.join(':'))).toThrow('Integration secret could not be decrypted');
    mockEnv.INTEGRATIONS_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString('base64');
    expect(() => box.decrypt(encrypted)).toThrow('Integration secret could not be decrypted');
  });
  it.each([undefined, '', 'bad', Buffer.alloc(31).toString('base64')])(
    'fails only on use with missing/malformed key',
    (key) => {
      mockEnv.INTEGRATIONS_ENCRYPTION_KEY = key;
      expect(() => new SecretBox()).not.toThrow();
      expect(() => box.encrypt('secret')).toThrow(
        'Integration secret encryption is not configured',
      );
      expect(() => box.decrypt('v1:a:b:c')).toThrow(
        'Integration secret encryption is not configured',
      );
    },
  );
  it.each(['v2:a:b:c', 'v1:a:b', 'not-ciphertext'])(
    'rejects malformed ciphertext',
    (ciphertext) => {
      expect(() => box.decrypt(ciphertext)).toThrow('Integration secret could not be decrypted');
    },
  );
});
