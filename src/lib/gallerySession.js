import { createHash, randomBytes } from 'node:crypto';

export const GALLERY_SESSION_COOKIE = 'metacog_gallery_session';

export function createGallerySessionToken() {
  return randomBytes(32).toString('hex');
}

export function hashGallerySessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
