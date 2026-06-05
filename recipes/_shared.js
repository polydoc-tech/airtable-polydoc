// Shared helpers for the PolyDoc "Run a script" recipes.
//
// These recipes are COPY-PASTE EXAMPLES for the Airtable automation "Run a
// script" action (paid plans only - Team and up). Airtable's script editor does
// not support imports, so each recipe is self-contained: the relevant helpers
// below are duplicated inline into every recipe file. This file is the readable
// source of truth and is exercised by the test suite; keep the inline copies in
// sync with it.
//
// Why this shape (see ../ROADMAP.md):
//  - The action runs server-side, so calling api.polydoc.tech needs no CORS.
//  - PolyDoc returns the file as binary (delivery "download"). Airtable
//    attachment fields take file bytes via the uploadAttachment endpoint
//    (5 MB cap). For larger files, switch PolyDoc to Cloud Storage delivery and
//    write the resulting URL into the attachment field instead.

/** Convert an ArrayBuffer to a base64 string in chunks (btoa is available in the runtime). */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000; // 32 KiB per btoa call to avoid call-stack limits
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Call a PolyDoc convert endpoint and return { bytes, contentType }. Throws on non-200. */
export async function polydocConvert({ baseUrl, apiKey, sandbox, endpoint, body }) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Sandbox': sandbox ? 'true' : 'false',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = await res.text();
    try {
      const parsed = JSON.parse(detail);
      detail = parsed.message || parsed.error || detail;
    } catch {
      /* keep raw text */
    }
    throw new Error(`PolyDoc ${endpoint} failed (${res.status}): ${detail}`);
  }
  return {
    bytes: await res.arrayBuffer(),
    contentType: (res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim(),
  };
}

/**
 * Upload file bytes into an attachment cell via the Airtable Web API.
 * Needs a personal access token with the data.records:write scope. 5 MB max.
 * Docs: https://airtable.com/developers/web/api/upload-attachment
 */
export async function uploadAttachment({ token, baseId, recordId, fieldIdOrName, filename, contentType, bytes }) {
  const url = `https://content.airtable.com/v0/${baseId}/${recordId}/${encodeURIComponent(fieldIdOrName)}/uploadAttachment`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType, filename, file: arrayBufferToBase64(bytes) }),
  });
  if (!res.ok) {
    throw new Error(`Airtable uploadAttachment failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}
