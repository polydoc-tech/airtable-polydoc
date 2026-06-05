/**
 * PolyDoc recipe - URL to screenshot (Airtable automation "Run a script" action).
 *
 * Captures a screenshot of a URL (or inline HTML) and writes the image into an
 * attachment field on the triggering record. Useful for link previews, listing
 * thumbnails, or competitor-page snapshots.
 *
 * SETUP (paid Airtable plan - Team and up):
 *   Input variables:
 *     source            (text)  the URL to capture (or inline HTML)
 *     recordId          (text)  the triggering record's id
 *     attachmentField   (text)  attachment field id or name to write the image to
 *     polydocApiKey     (secret) your PolyDoc API key
 *     airtableToken     (secret) Airtable PAT with the data.records:write scope
 *     imageType         (text, optional) "png" (default), "jpeg", or "webp"
 *     fullPage          (text, optional) "true" to capture the full scrollable page
 *     sandbox           (text, optional) "true" for watermarked sandbox output
 */

const cfg = input.config();
const sandbox = String(cfg.sandbox).toLowerCase() === 'true';
const imageType = cfg.imageType || 'png';

// --- PolyDoc request body (screenshot) ---
const screenshot = { type: imageType };
if (String(cfg.fullPage).toLowerCase() === 'true') screenshot.fullPage = true;
const body = { source: cfg.source, screenshot };

const { bytes, contentType } = await polydocConvert({
  baseUrl: 'https://api.polydoc.tech',
  apiKey: cfg.polydocApiKey,
  sandbox,
  endpoint: '/screenshot/convert',
  body,
});

const ext = imageType === 'jpeg' ? 'jpg' : imageType;
await uploadAttachment({
  token: cfg.airtableToken,
  baseId: base.id,
  recordId: cfg.recordId,
  fieldIdOrName: cfg.attachmentField,
  filename: `screenshot.${ext}`,
  contentType,
  bytes,
});

output.set('sizeBytes', bytes.byteLength);
output.set('contentType', contentType);

// ── helpers (kept in sync with recipes/_shared.js; inlined because the Airtable
//    script editor has no module imports) ───────────────────────────────────
function arrayBufferToBase64(buffer) {
  const bs = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bs.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bs.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function polydocConvert({ baseUrl, apiKey, sandbox, endpoint, body }) {
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
      const p = JSON.parse(detail);
      detail = p.message || p.error || detail;
    } catch {}
    throw new Error(`PolyDoc ${endpoint} failed (${res.status}): ${detail}`);
  }
  return {
    bytes: await res.arrayBuffer(),
    contentType: (res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim(),
  };
}

async function uploadAttachment({ token, baseId, recordId, fieldIdOrName, filename, contentType, bytes }) {
  const url = `https://content.airtable.com/v0/${baseId}/${recordId}/${encodeURIComponent(fieldIdOrName)}/uploadAttachment`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType, filename, file: arrayBufferToBase64(bytes) }),
  });
  if (!res.ok) throw new Error(`Airtable uploadAttachment failed (${res.status}): ${await res.text()}`);
  return res.json();
}
