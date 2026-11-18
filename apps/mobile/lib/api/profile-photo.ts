import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath } from './endpoints';

// Matches MePhotoController's strict schemas. The size ceiling is configured
// on the server (R2_MAX_UPLOAD_BYTES), so signing remains its source of truth.
export interface ProfilePhotoUploadInput {
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  contentLength: number;
}
export interface ProfilePhotoUpload {
  url: string;
  publicUrl: string;
  contentType: string;
}
export interface ProfilePhotoResponse {
  photoUrl: string | null;
}
export interface LocalProfilePhoto {
  uri: string;
  mimeType?: string | null;
}

export function createProfilePhotoUpload(input: ProfilePhotoUploadInput) {
  return apiJson<ProfilePhotoUpload>(endpointPath(ENDPOINTS.createProfilePhotoUpload), {
    method: ENDPOINTS.createProfilePhotoUpload.method,
    json: input,
  });
}

export function saveProfilePhoto(photoUrl: string) {
  return apiJson<ProfilePhotoResponse>(endpointPath(ENDPOINTS.saveProfilePhoto), {
    method: ENDPOINTS.saveProfilePhoto.method,
    json: { photoUrl },
  });
}

export function removeProfilePhoto() {
  return apiJson<ProfilePhotoResponse>(endpointPath(ENDPOINTS.removeProfilePhoto), {
    method: ENDPOINTS.removeProfilePhoto.method,
  });
}

export class InvalidProfilePhotoTypeError extends Error {}

/** Read the cropped file: its actual byte count, not the original asset size. */
export async function uploadProfilePhoto(input: LocalProfilePhoto) {
  const local = await fetch(input.uri);
  const blob = await local.blob();
  const contentType = blob.type || input.mimeType;
  if (contentType !== 'image/jpeg' && contentType !== 'image/png' && contentType !== 'image/webp') {
    throw new InvalidProfilePhotoTypeError('Unsupported profile photo type');
  }
  const signed = await createProfilePhotoUpload({ contentType, contentLength: blob.size });
  // Never send the API authorization/tenant headers to the signed R2 URL.
  const uploaded = await fetch(signed.url, {
    method: 'PUT',
    headers: { 'Content-Type': signed.contentType },
    body: blob,
  });
  if (!uploaded.ok) throw new Error('Profile photo upload failed');
  return saveProfilePhoto(signed.publicUrl);
}
