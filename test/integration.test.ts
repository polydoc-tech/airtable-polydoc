import { describe, expect, it } from 'vitest';
import { buildRequestBody, type PolyDocParams } from '../src/buildRequestBody';

// Live smoke test against the real PolyDoc API. Skipped unless POLYDOC_API_KEY
// is set; always uses X-Sandbox so it draws sandbox quota, never production.
// It builds request bodies with the SAME buildRequestBody the connector uses, so
// it validates the builder against the live contract, not just in isolation.
const API_KEY = process.env.POLYDOC_API_KEY;
const BASE = (process.env.POLYDOC_BASE_URL ?? 'https://api.polydoc.tech').replace(/\/+$/, '');
// Optional: only exercise template rendering when a known template id is provided.
const TEMPLATE_ID = process.env.POLYDOC_TEMPLATE_ID;

async function call(params: PolyDocParams): Promise<Response> {
  const { endpoint, body } = buildRequestBody(params);
  return fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      'X-Sandbox': 'true',
    },
    body: JSON.stringify(body),
  });
}

const dl = { mode: 'download' as const, binaryPropertyName: 'data' };

describe.skipIf(!API_KEY)('PolyDoc live API (sandbox)', () => {
  it('PDF from inline HTML returns a PDF', async () => {
    const res = await call({
      operation: 'pdf',
      sourceType: 'html',
      html: '<h1>Smoke</h1>',
      delivery: dl,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  // Sandbox screenshots are slow and variable (observed 100-200s) - far above the
  // PDF path (~1s). The generous timeout reflects that. Note for the recipe: the
  // Airtable "Run a script" action caps fetch at 30s, so the synchronous
  // screenshot recipe needs production-speed conversions or async delivery.
  it(
    'Screenshot of a URL returns a PNG',
    async () => {
      const res = await call({
        operation: 'screenshot',
        sourceType: 'url',
        url: 'https://example.com',
        screenshotOptions: { imageType: 'png' },
        delivery: dl,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('image/png');
    },
    300_000,
  );

  it('E-Invoice (ZUGFeRD / EN 16931) returns a hybrid PDF', async () => {
    const invoice = {
      number: 'INV-SMOKE-1',
      issueDate: '2026-06-04',
      dueDate: '2026-07-04',
      currencyCode: 'EUR',
      seller: {
        name: 'Acme GmbH',
        address: { line1: 'Hauptstr. 1', city: 'Berlin', postalCode: '10115', countryCode: 'DE' },
        taxId: 'DE123456789',
      },
      buyer: {
        name: 'Buyer SARL',
        address: { line1: 'Rue 2', city: 'Paris', postalCode: '75001', countryCode: 'FR' },
      },
      lines: [
        {
          description: 'Widget',
          quantity: 2,
          unitPrice: 10,
          lineTotal: 20,
          vatRate: 19,
          vatCategoryCode: 'S',
        },
      ],
      taxSummary: [{ categoryCode: 'S', rate: 19, taxableAmount: 20, taxAmount: 3.8 }],
      paymentTerms: 'Net 30 days',
      totalNetAmount: 20,
      totalTaxAmount: 3.8,
      totalGrossAmount: 23.8,
    };
    const res = await call({
      operation: 'einvoice',
      sourceType: 'html',
      html: '<h1>Invoice INV-SMOKE-1</h1>',
      eInvoiceStandard: 'zugferd',
      eInvoiceProfile: 'en16931',
      invoice,
      delivery: dl,
    });
    if (res.status !== 200) {
      // Surface the validation detail to make a failure actionable.
      throw new Error(`e-invoice failed (${res.status}): ${await res.text()}`);
    }
    expect(res.headers.get('content-type')).toContain('application/pdf');
  });

  it.skipIf(!TEMPLATE_ID)('PDF from a saved template renders', async () => {
    const res = await call({
      operation: 'pdf',
      sourceType: 'template',
      templateId: TEMPLATE_ID,
      delivery: dl,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
  });
});
