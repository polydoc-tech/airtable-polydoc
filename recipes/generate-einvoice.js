/**
 * PolyDoc recipe - generate an EU e-invoice (Airtable automation "Run a script").
 *
 * Produces a hybrid PDF (Factur-X / ZUGFeRD, EN 16931) from structured invoice
 * data and writes it into an attachment field on the triggering record.
 *
 * SETUP (paid Airtable plan - Team and up):
 *   Input variables:
 *     invoiceJson       (text)   the invoice object as JSON (seller, buyer, lines,
 *                                totals). Assemble it from fields in a prior step
 *                                or a long-text field. Schema: docs.polydoc.tech.
 *     source            (text)   the human-readable layer: inline HTML or
 *                                "[template:<id>]". The structured XML is embedded.
 *     recordId          (text)   the triggering record's id
 *     attachmentField   (text)   attachment field id or name to write the PDF to
 *     polydocApiKey     (secret) your PolyDoc API key
 *     airtableToken     (secret) Airtable PAT with the data.records:write scope
 *     standard          (text, optional) "zugferd" (default) or "facturx"
 *     profile           (text, optional) "en16931" (default), "basic", "extended", ...
 *     verify            (text, optional) "true" to fail unless EN 16931 / PDF/A validate
 *     filename          (text, optional) output filename, defaults to invoice.pdf
 *     sandbox           (text, optional) "true" for watermarked sandbox output
 *
 * EN 16931 needs (at minimum): dueDate OR paymentTerms (BR-CO-25), a seller taxId
 * for VAT category "S", and net + tax = gross. Include a taxSummary to be safe.
 */

const cfg = input.config();
const sandbox = String(cfg.sandbox).toLowerCase() === 'true';

// --- PolyDoc request body (e-invoice) ---
const eInvoice = {
  standard: cfg.standard || 'zugferd',
  profile: cfg.profile || 'en16931',
  invoice: JSON.parse(cfg.invoiceJson),
};
if (String(cfg.verify).toLowerCase() === 'true') eInvoice.verify = true;
const body = { source: cfg.source, eInvoice };
if (cfg.filename) body.filename = cfg.filename;

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
  filename: cfg.filename || 'invoice.pdf',
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
