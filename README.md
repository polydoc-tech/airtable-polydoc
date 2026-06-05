# PolyDoc for Airtable

Generate PDFs, screenshots, and EU e-invoices (Factur-X / ZUGFeRD) from your
Airtable data with [PolyDoc](https://polydoc.tech).

This repo holds two things:

1. **`recipes/`** - copy-paste scripts for the Airtable automation **"Run a
   script"** action. Available now. Three angles, mirroring the PolyDoc product:
   - [`html-url-to-pdf.js`](recipes/html-url-to-pdf.js) - render a URL, inline HTML, or a saved template to PDF
   - [`url-to-screenshot.js`](recipes/url-to-screenshot.js) - capture a screenshot of a URL or HTML
   - [`generate-einvoice.js`](recipes/generate-einvoice.js) - produce a hybrid EN 16931 e-invoice PDF
2. **`src/buildRequestBody.ts`** - the shared, unit-tested PolyDoc request builder.
   Used by the recipes' logic today and by the Blocks SDK Marketplace extension
   (planned, see [`ROADMAP.md`](ROADMAP.md)).

## Which Airtable surface, and what it costs

Airtable has no third-party automation-node SDK, so PolyDoc plugs in two ways:

| | "Run a script" recipe (this repo) | Marketplace extension (planned) |
|---|---|---|
| What | Paste a script into an automation action | Installable UI panel in a base |
| Calls the API | Server-side, **no CORS needed** | Browser sandbox, **needs gateway CORS** |
| API key storage | Automation **Secrets** (secure) | `globalConfig`, visible to base collaborators |
| Plan | **Paid only** (Team ~$20/seat/mo; not on the Team trial) | Dev/build free; review needs a working base |

The "Run a script" action is **not available on the free plan**, so the recipes
require a paid Airtable plan.

## Using a recipe

1. Create a PolyDoc API key at [dashboard.polydoc.tech](https://dashboard.polydoc.tech).
2. Create an Airtable **personal access token** with the `data.records:write`
   scope (used to write the generated file into an attachment field).
3. In your base, add an automation with a trigger (e.g. "When record matches
   conditions") and a **Run a script** action.
4. Paste the recipe for your angle. Add the **input variables** listed at the top
   of that recipe file, mapping record fields and storing the two keys as
   **Secrets**.
5. Add an **attachment field** to hold the output and pass its name/id as
   `attachmentField`.
6. Test the automation. The generated file lands in the attachment field.

### How the file gets into Airtable

The recipe asks PolyDoc for the file as binary, then uploads the bytes straight
into the attachment cell via Airtable's
[upload-attachment endpoint](https://airtable.com/developers/web/api/upload-attachment)
(no external bucket needed). That endpoint caps at **5 MB per file**. For larger
output, switch the PolyDoc request to **Cloud Storage** delivery (a presigned URL
to your own bucket) and write the resulting URL into the attachment field instead.

## Development

```bash
npm install
npm run typecheck          # tsc --noEmit
npm test                   # unit tests (builder + recipe self-containment)
POLYDOC_API_KEY=<key> npm run test:integration   # live sandbox smoke tests
```

The integration tests always send `X-Sandbox: true`, so they draw sandbox quota
(watermarked output) and never touch production. Space them out: the sandbox
rate limit is low (~5/sec). Set `POLYDOC_TEMPLATE_ID` to also exercise template
rendering.

The `recipes/` files are self-contained for copy-paste (the Airtable script
editor has no module imports), so they inline the helpers from
[`recipes/_shared.js`](recipes/_shared.js). `test/recipes.test.ts` enforces that
self-containment and verifies the base64 encoder.

See [`ROADMAP.md`](ROADMAP.md) for the full plan, including the Marketplace
extension and the gateway CORS prerequisite.
