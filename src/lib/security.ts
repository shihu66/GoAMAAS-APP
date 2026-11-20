// Client-side security utilities: strict URL/scheme sanitization and raster upload validation.

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f-\u009f]/g;
const DANGEROUS_SCHEME_RE = /^(?:javascript|vbscript|data|file|blob|filesystem|about|chrome|ms-its):/i;
const SAFE_RASTER_DATA_URI_RE =
  /^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/i;

export function sanitizeHrefUrl(
  rawUrl?: string | null,
  fallback = '#',
  options?: { allowBareDomain?: boolean; allowMailtoTel?: boolean }
): string {
  const cleaned = String(rawUrl || '')
    .replace(CONTROL_CHARS_RE, '')
    .trim();
  if (!cleaned) return fallback;

  // Reject protocol-relative or backslash-prefixed open redirects (e.g. //evil.com, /\evil.com, \evil.com)
  if (cleaned.startsWith('//') || cleaned.startsWith('/\\') || cleaned.startsWith('\\')) {
    return fallback;
  }

  // Allow safe internal anchors and single-slash relative paths
  if (cleaned.startsWith('#') || (cleaned.startsWith('/') && !cleaned.startsWith('//'))) {
    return cleaned;
  }

  // Allow mailto / tel when permitted
  if (/^tel:/i.test(cleaned)) {
    const safeTel = sanitizePhoneHref(cleaned.slice(4));
    return safeTel || fallback;
  }
  if (/^mailto:/i.test(cleaned)) {
    const safeMail = sanitizeEmailHref(cleaned.slice(7));
    return safeMail || fallback;
  }

  // Allow https:// and http:// URLs only
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch {
      return fallback;
    }
    return fallback;
  }

  // Explicitly block javascript:, vbscript:, data:, file:, blob:, etc. (regardless of case/whitespace)
  if (DANGEROUS_SCHEME_RE.test(cleaned) || cleaned.includes(':')) {
    return fallback;
  }

  // Optionally treat bare domains like "instagram.com/shop" as https://
  if (options?.allowBareDomain && /^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(cleaned)) {
    try {
      const parsed = new URL(`https://${cleaned}`);
      if (parsed.protocol === 'https:') return parsed.href;
    } catch {
      return fallback;
    }
  }

  // Fallback for safe section-anchor words without colons (e.g. "contact", "services")
  if (/^[a-z0-9_-]{1,64}$/i.test(cleaned)) {
    return `#${cleaned}`;
  }

  return fallback;
}

export function sanitizeImageUrl(rawUrl?: string | null): string {
  const cleaned = String(rawUrl || '')
    .replace(CONTROL_CHARS_RE, '')
    .trim();
  if (!cleaned) return '';

  // Reject protocol-relative / backslash paths
  if (cleaned.startsWith('//') || cleaned.startsWith('/\\') || cleaned.startsWith('\\')) {
    return '';
  }

  // Allow safe raster data URIs (strictly excludes data:image/svg+xml and data:text/html)
  if (/^data:/i.test(cleaned)) {
    return SAFE_RASTER_DATA_URI_RE.test(cleaned) ? cleaned : '';
  }

  // Allow single-slash internal asset paths
  if (cleaned.startsWith('/') && !cleaned.startsWith('//')) {
    return cleaned;
  }

  // Allow https:// and http:// URLs (blob: / file: / javascript: blocked)
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.href;
      }
    } catch {
      return '';
    }
  }

  return '';
}

export function sanitizePhoneHref(rawPhone?: string | null): string {
  const cleaned = String(rawPhone || '')
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .replace(/^tel:/i, '')
    .replace(/[^0-9+*#()-]/g, '');
  if (!cleaned || cleaned.replace(/[^0-9]/g, '').length < 3) return '';
  return `tel:${cleaned}`;
}

export function sanitizeEmailHref(rawEmail?: string | null): string {
  const cleaned = String(rawEmail || '')
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .replace(/^mailto:/i, '');
  if (!cleaned || !/^[^\s@<>()[\]\\,;:"']+@[^\s@<>()[\]\\,;:"']+\.[^\s@<>()[\]\\,;:"']+$/.test(cleaned)) {
    return '';
  }
  return `mailto:${cleaned}`;
}

export const ALLOWED_RASTER_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

export const ALLOWED_RASTER_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] as const;

export async function validateImageFileBinaryAndExtension(
  file: File,
  maxBytes = 5 * 1024 * 1024
): Promise<{ ok: true; ext: string; mime: string } | { ok: false; error: string }> {
  if (!file || typeof file.size !== 'number' || file.size <= 0) {
    return { ok: false, error: 'Selected image file is empty.' };
  }
  if (file.size > maxBytes) {
    return { ok: false, error: 'Image size must be 5 MB or less.' };
  }

  const normalizedMime = String(file.type || '').trim().toLowerCase();
  if (!ALLOWED_RASTER_IMAGE_MIMES.includes(normalizedMime as (typeof ALLOWED_RASTER_IMAGE_MIMES)[number])) {
    return {
      ok: false,
      error: 'Only PNG, JPG, WebP, GIF, or AVIF raster images are supported (SVG/HTML uploads are blocked).',
    };
  }

  const rawName = String(file.name || '').trim();
  const extMatch = rawName.toLowerCase().match(/\.([a-z0-9]{2,10})$/);
  const fileExt = extMatch ? extMatch[1] : '';
  if (fileExt && !ALLOWED_RASTER_IMAGE_EXTS.includes(fileExt as (typeof ALLOWED_RASTER_IMAGE_EXTS)[number])) {
    return {
      ok: false,
      error: 'Unsupported image file extension. Please upload a PNG, JPG, WebP, GIF, or AVIF file.',
    };
  }

  // Read magic bytes from header slice when binary API is available to reject spoofed SVG/HTML/script files
  if (typeof file.slice === 'function') {
    const slice = file.slice(0, 256);
    if (slice && typeof slice.arrayBuffer === 'function') {
      const buf = new Uint8Array(await slice.arrayBuffer());
      if (buf.byteLength < 4) {
        return { ok: false, error: 'Image file header is invalid or truncated.' };
      }

      // Reject text-based XML / SVG / HTML / script payloads disguised with image MIME or extension
      let asciiPrefix = '';
      for (let i = 0; i < Math.min(buf.byteLength, 128); i++) {
        asciiPrefix += String.fromCharCode(buf[i]);
      }
      const trimmedPrefix = asciiPrefix.replace(/^\uFEFF/, '').trimStart().toLowerCase();
      if (
        trimmedPrefix.startsWith('<svg') ||
        trimmedPrefix.startsWith('<?xml') ||
        trimmedPrefix.startsWith('<html') ||
        trimmedPrefix.startsWith('<!doctype') ||
        trimmedPrefix.startsWith('<script')
      ) {
        return {
          ok: false,
          error: 'Executable SVG/HTML content detected inside image upload. Upload blocked for security.',
        };
      }

      const isPng =
        buf.byteLength >= 8 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a;
      const isJpeg = buf.byteLength >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      const isGif =
        buf.byteLength >= 6 &&
        buf[0] === 0x47 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x38 &&
        (buf[4] === 0x37 || buf[4] === 0x39) &&
        buf[5] === 0x61;
      const isWebp =
        buf.byteLength >= 12 &&
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50;
      const isAvif =
        buf.byteLength >= 12 &&
        buf[4] === 0x66 &&
        buf[5] === 0x74 &&
        buf[6] === 0x79 &&
        buf[7] === 0x70 &&
        (asciiPrefix.slice(8, 12) === 'avif' || asciiPrefix.slice(8, 12) === 'avis' || asciiPrefix.slice(8, 12) === 'mif1');

      if (!isPng && !isJpeg && !isGif && !isWebp && !isAvif) {
        return {
          ok: false,
          error: 'Uploaded file signature does not match a valid PNG, JPEG, WebP, GIF, or AVIF image.',
        };
      }
    }
  }

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };

  return {
    ok: true,
    ext: extMap[normalizedMime] || 'png',
    mime: normalizedMime === 'image/jpg' ? 'image/jpeg' : normalizedMime,
  };
}
