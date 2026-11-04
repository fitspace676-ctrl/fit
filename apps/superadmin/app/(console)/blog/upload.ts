/**
 * Send one image to `/api/blog-upload`, which relays it to R2, and return the
 * URL to store on the post. Throws an `Error` carrying the operator-facing
 * reason (storage not configured, too large, wrong type …).
 */
export async function uploadBlogImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);

  let res: Response;
  try {
    res = await fetch('/api/blog-upload', { method: 'POST', body: form });
  } catch {
    throw new Error('Upload failed: the console could not be reached.');
  }

  const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !body?.url) {
    throw new Error(body?.error ?? `Upload failed (${res.status}).`);
  }
  return body.url;
}

/** What the file picker offers — the types the API accepts. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
