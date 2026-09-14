// @fit/web — shared plumbing for the portal listing fetchers.
//
// `lib/{shop,classes,services,trainers}.ts` run in Server Components and in client
// islands alike. Each goes through {@link requestPortalListing} (a server action
// from the browser), which forwards the member's session so the API can narrow
// the listing to their home branch. This wrapper keeps what the callers relied on
// from a plain `fetch`: an `AbortSignal` that rejects with `AbortError`, and a
// thrown `Error` carrying the API's message on a non-OK status.

import { requestPortalListing, type PortalListing } from './portal-listing';

/** Options for {@link fetchPortalListing}. */
export interface FetchPortalListingOptions {
  /** Cancels the wait: the promise rejects with an `AbortError` `DOMException`. */
  signal?: AbortSignal;
  /** What is being loaded, for the error message (`products`, `classes`, …). */
  label: string;
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * A server action cannot take an `AbortSignal`, so an abort cannot cancel the
 * request itself — it settles the caller's promise instead, which is what the
 * listing islands act on (they ignore an `AbortError` and keep the newer result).
 */
function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(cleanup, cleanup);
    promise.then(resolve, reject);
  });
}

/** Read one portal listing and return its JSON body; a non-OK status throws. */
export async function fetchPortalListing(
  listing: PortalListing,
  query: Record<string, string>,
  { signal, label }: FetchPortalListingOptions,
): Promise<unknown> {
  const { status, body } = await abortable(requestPortalListing(listing, query), signal);
  if (status < 200 || status >= 300) {
    const detail = body as { message?: unknown } | null;
    throw new Error(
      typeof detail?.message === 'string' ? detail.message : `Failed to load ${label} (${status})`,
    );
  }
  return body;
}
