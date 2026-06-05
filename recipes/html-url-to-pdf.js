/**
 * PolyDoc recipe - HTML / URL to PDF (Airtable automation "Run a script" action).
 *
 * Renders a URL, inline HTML, or a saved PolyDoc template to PDF and writes the
 * file into an attachment field on the triggering record.
 *
 * SETUP (paid Airtable plan - Team and up; the "Run a script" action is not on free):
 *   Add these input variables to the action (gear icon -> "Input variables"):
 *     source            (text)  the URL, the inline HTML, or "[template:<id>]"
 *     recordId          (text)  the triggering record's id   (e.g. {Record (Airtable record ID)})
 *     attachmentField   (text)  attachment field id or name to write the PDF to
 *     polydocApiKey     (secret) your PolyDoc API key (dashboard.polydoc.tech)
 *     airtableToken     (secret) Airtable PAT with the data.records:write scope
 *     templateDataJson  (text, optional) JSON for a template source
 *     filename          (text, optional) output filename, defaults to document.pdf
 *     sandbox           (text, optional) "true" to use watermarked sandbox output
 *
 * Store polydocApiKey and airtableToken as automation Secrets, not plain text.
 */

const cfg = input.config();
const sandbox = String(cfg.sandbox).toLowerCase() === 'true';

// --- PolyDoc request body (PDF) ---
const body = { source: cfg.source };
if (cfg.filename) body.filename = cfg.filename;
if (cfg.templateDataJson) body.templateData = JSON.parse(cfg.templateDataJson);

const { bytes, contentType } = await polydocConvert({
  baseUrl: 'https://api.polydoc.tech',
  apiKey: cfg.polydocApiKey,
  sandbox,
  endpoint: '/pdf/convert',
  body,
});

await uploadAttachment({
  token: cfg.airtableToken,
  baseId: base.id,
  recordId: cfg.recordId,
  fieldIdOrName: cfg.attachmentField,
  filename: cfg.filename || 'document.pdf',
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
