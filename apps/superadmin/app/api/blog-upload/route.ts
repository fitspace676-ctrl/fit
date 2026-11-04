import { NextResponse } from 'next/server';
import { BLOG_UPLOAD_CONTENT_TYPES } from '@fit/types';
import { ApiError, createBlogUpload } from '@/lib/api';
import { requireOperator } from '@/lib/operator';

/** Largest image the console accepts. The API may cap lower (`R2_MAX_UPLOAD_BYTES`). */
const MAX_BYTES = 10 * 1024 * 1024;

type BlogUploadType = (typeof BLOG_UPLOAD_CONTENT_TYPES)[number];

function isAllowedType(type: string): type is BlogUploadType {
  return (BLOG_UPLOAD_CONTENT_TYPES as readonly string[]).includes(type);
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * `POST /api/blog-upload` — one blog image, as multipart field `file`.
 *
 * The browser cannot PUT to R2 itself (the bucket carries no CORS rule for this
 * host), so the bytes come here and this server relays them: ask the API for a
 * presigned PUT under `platform/blog/`, then PUT the file to it. The answer is
 * the URL the post stores — the public one when R2 has a public base, the bare
 * key otherwise, which the API also accepts as a blog-owned reference.
 *
 * `/api/*` is outside the middleware's matcher, so the operator check is here.
 */
export async function POST(request: Request) {
  if (!(await requireOperator())) {
    return fail(401, 'Not authorized');
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return fail(400, 'Expected a multipart form with a `file` field.');
  }
  if (!(file instanceof File) || file.size === 0) {
    return fail(400, 'No file was sent.');
  }
  if (!isAllowedType(file.type)) {
    return fail(400, 'Only JPEG, PNG, WebP or GIF images can be uploaded.');
  }
  if (file.size > MAX_BYTES) {
    return fail(413, 'Images must be 10 MB or smaller.');
  }

  let signed;
  try {
    signed = await createBlogUpload({
      contentType: file.type,
      contentLength: file.size,
      fileName: file.name || undefined,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // 503 is the API saying storage is not configured — say so plainly.
      const message =
        error.status === 503
          ? 'Image storage is not configured on the API (R2). Uploads are unavailable.'
          : `Could not start the upload (${error.status}): ${error.message}`;
      return fail(error.status === 400 ? 400 : 502, message);
    }
    return fail(502, 'Could not reach the FormaCore API.');
  }

  try {
    const put = await fetch(signed.url, {
      method: 'PUT',
      headers: {
        'content-type': signed.contentType,
        'content-length': String(signed.contentLength),
      },
      body: Buffer.from(await file.arrayBuffer()),
    });
    if (!put.ok) {
      return fail(502, `Storage refused the upload (${put.status}).`);
    }
  } catch {
    return fail(502, 'Could not reach image storage.');
  }

  return NextResponse.json({ url: signed.publicUrl ?? signed.key, key: signed.key });
}
