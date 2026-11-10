import { describe, expect, it } from 'vitest';
import { normalizeAttachments } from './attachments';

const decode = (data: string) => Buffer.from(data, 'base64').toString('utf8');

describe('normalizeAttachments', () => {
  it('passes the image types both providers take', () => {
    const png = { name: 'a.png', mimeType: 'image/png', data: 'AAAA' };
    expect(normalizeAttachments([png])).toEqual([png]);
  });

  it('turns other images (HEIC, SVG) into a note instead of a provider 400', () => {
    const [heic] = normalizeAttachments([
      { name: 'IMG_1.heic', mimeType: 'image/heic', data: 'AAAA' },
    ]);
    expect(heic?.mimeType).toBe('text/plain');
    expect(decode(heic!.data)).toContain('Unsupported file "IMG_1.heic"');
  });
});
