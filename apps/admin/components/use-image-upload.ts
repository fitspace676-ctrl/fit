'use client';

import { useRef, useState } from 'react';
import type { SignedUploadResponse } from '@/lib/api';

/** A server action's result, as the upload flow consumes it. */
export type UploadActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Photograph MIME types for images only a browser or a phone ever paints: JPEG,
 * PNG and WebP. (The brand logo is narrower because invoice PDFs embed it.)
 */
export const PHOTO_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Client-side ceiling (bytes) for a sign-in photograph — checked before signing. */
export const MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024;

/** The translated strings {@link useImageUpload} needs to report a rejected file. */
export interface ImageUploadMessages {
  /** The file is not one of the accepted MIME types. */
  errorType: string;
  /** The file is over the ceiling. */
  errorSize: string;
  /** The signed `PUT` came back non-2xx — takes the HTTP status. */
  errorUpload: (status: number) => string;
  /** Anything threw: offline, DNS, a blocked request. */
  errorNetwork: string;
}

/**
 * The presign → `PUT` → finalise flow, plus the drag-and-drop that feeds it.
 *
 * Shared by every image upload in the console that follows the member portal's
 * pattern, not duplicated per screen: the genuinely fiddly parts (the
 * `relatedTarget` containment below, resetting the input so re-picking the same
 * file re-fires `change`) are exactly the parts that rot when they exist twice.
 * What differs is the accepted formats, the ceiling and where the finalised URL
 * goes, so those are the arguments.
 *
 * The three steps: mint a presigned R2 URL (`POST /uploads`), `PUT` the bytes
 * straight there from the browser, then hand the object key to a server action
 * that checks it belongs to this gym and turns it into a public URL.
 */
export function useImageUpload<T>({
  accept,
  maxBytes,
  messages,
  presign,
  finalize,
  onUploaded,
  busy = false,
}: {
  /** Accepted MIME types — both the `accept` attribute and the client-side gate. */
  accept: readonly string[];
  /** Client-side size ceiling in bytes, checked before anything is signed. */
  maxBytes: number;
  messages: ImageUploadMessages;
  presign: (input: {
    contentType: string;
    contentLength: number;
    fileName?: string;
  }) => Promise<UploadActionResult<SignedUploadResponse>>;
  /** Finalise the uploaded key. */
  finalize: (photoKey: string) => Promise<UploadActionResult<T>>;
  /** Receive what the finalise step returned. */
  onUploaded: (result: T) => void;
  /** Something else on the screen is saving; uploads wait for it. */
  busy?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const disabled = uploading || busy;

  // Clearing the input is what lets the same file be picked twice: without it the
  // second pick sets an identical value and `change` never fires.
  function resetFileInput(): void {
    if (inputRef.current) inputRef.current.value = '';
  }

  /**
   * Validate one file and put it on R2. Shared by the picker and the drop zone so
   * a dropped file cannot take a shorter route than a chosen one — same type and
   * size gates, same presign/PUT/finalise, same error surface.
   */
  async function upload(file: File): Promise<void> {
    setUploadError(null);

    if (!accept.includes(file.type)) {
      setUploadError(messages.errorType);
      resetFileInput();
      return;
    }
    if (file.size > maxBytes) {
      setUploadError(messages.errorSize);
      resetFileInput();
      return;
    }

    setUploading(true);
    try {
      const signed = await presign({
        contentType: file.type,
        contentLength: file.size,
        fileName: file.name,
      });
      if (!signed.ok) {
        setUploadError(signed.error);
        return;
      }
      const put = await fetch(signed.data.url, {
        method: 'PUT',
        headers: { 'content-type': signed.data.contentType },
        body: file,
      });
      if (!put.ok) {
        setUploadError(messages.errorUpload(put.status));
        return;
      }
      const finalized = await finalize(signed.data.key);
      if (!finalized.ok) {
        setUploadError(finalized.error);
        return;
      }
      onUploaded(finalized.data);
    } catch {
      setUploadError(messages.errorNetwork);
    } finally {
      setUploading(false);
      resetFileInput();
    }
  }

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) void upload(file);
  }

  /** Spread onto the block that answers a drop — the whole control, not the thumbnail. */
  const dropHandlers = {
    onDragEnter(event: React.DragEvent<HTMLDivElement>): void {
      if (disabled || !event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragOver(event: React.DragEvent<HTMLDivElement>): void {
      if (disabled || !event.dataTransfer.types.includes('Files')) return;
      // Without this the browser navigates to the dropped file and the drop event
      // never reaches React at all.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    /**
     * `dragleave` also fires each time the pointer crosses onto a CHILD of the
     * zone — the thumbnail, the button, the hint — so it cannot be taken at face
     * value or the highlight flickers off while the file is still over the block.
     *
     * `relatedTarget` is what it is entering. Inside the zone → ignore; outside,
     * or `null` because the drag left the window entirely, → clear. Counting
     * enter/leave pairs instead would be one dropped event away from a highlight
     * that never goes out.
     */
    onDragLeave(event: React.DragEvent<HTMLDivElement>): void {
      const entering = event.relatedTarget;
      if (entering instanceof Node && event.currentTarget.contains(entering)) return;
      setDragging(false);
    },
    onDrop(event: React.DragEvent<HTMLDivElement>): void {
      event.preventDefault();
      setDragging(false);
      if (disabled) return;
      // Only the first file: this is one image, and silently uploading the last
      // of five dropped ones would be a coin toss the user did not call.
      const file = event.dataTransfer.files?.[0];
      if (file) void upload(file);
    },
  };

  return { uploading, uploadError, dragging, disabled, inputRef, onInputChange, dropHandlers };
}
