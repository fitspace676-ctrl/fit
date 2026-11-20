import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../../config/env';

/** Versioned authenticated encryption. No default key: unconfigured APIs still boot. */
@Injectable()
export class SecretBox {
  private key(): Buffer {
    const encoded = env.INTEGRATIONS_ENCRYPTION_KEY;
    if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw unavailable();
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encoded) throw unavailable();
    return key;
  }

  encrypt(plaintext: string): string {
    const key = this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  decrypt(value: string): string {
    const key = this.key();
    try {
      const [version, iv, tag, ciphertext, extra] = value.split(':');
      if (version !== 'v1' || !iv || !tag || ciphertext === undefined || extra !== undefined)
        throw new Error();
      const nonce = decode(iv);
      const authTag = decode(tag);
      if (nonce.length !== 12 || authTag.length !== 16) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(decode(ciphertext)), decipher.final()]).toString(
        'utf8',
      );
    } catch {
      // Never include ciphertext, key, plaintext or the crypto exception.
      throw new ServiceUnavailableException({
        code: 'INTEGRATION_SECRET_UNREADABLE',
        message: 'Integration secret could not be decrypted',
      });
    }
  }
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'INTEGRATIONS_NOT_CONFIGURED',
    message: 'Integration secret encryption is not configured',
  });
}

/** Reject noncanonical base64 instead of silently ignoring tampered characters. */
function decode(value: string): Buffer {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error();
  return bytes;
}
