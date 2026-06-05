# Airtable PolyDoc connector — implementation roadmap

Living roadmap for the Airtable connector, built per `../../CONNECTOR-PLAYBOOK.md`,
mirroring the n8n reference (`../../n8n-nodes-polydoc`). Fresh standalone repo at
`~/Projects/polydoc/tools/airtable-polydoc/`.

Status legend: ☐ todo · ◐ in progress · ☑ done

---

## 0. Decision record (why this shape)

Airtable has **no third-party automation-action SDK** — you cannot publish a node
that shows up in Airtable's automation builder the way n8n/Make/Pipedream/Zapier
allow. The three real integration surfaces and how the playbook maps onto them:

| Surface | Playbook analog | Verdict |
|---|---|---|
| **Custom Extension (Blocks SDK)** — React app in a base/interface panel, publishable to the Marketplace (reviewed) | Closest thing to a "verified connector" | **Primary deliverable** |
| **"Run a script" automation action** — user-pasted JS, server-side `fetch` | A *script template* (copy-paste recipe), not a published connector | **Secondary deliverable** |
| **Web API** — external code uses Airtable as a datastore | Not an Airtable-side artifact | Skip (already covered by existing n8n/Make Airtable nodes) |

**Converge the product, diverge the content** still holds: ONE extension exposing
all three operations via an operation dropdown (mirrors the n8n `operation` field),
plus three angle-split **example bases / recipes** (PDF / screenshot / e-invoice) —
the direct analog of the n8n connector's three template JSONs.

### Two findings that diverge from the n8n build

1. **CORS — needs a `polydoc-gateway` change (cross-repo, §5 sync point).**
   The n8n node runs server-side, so CORS never applies. A Blocks SDK extension
   runs in a sandboxed browser iframe and uses plain `fetch` — `remoteFetchAsync`
   (the Scripting-extension CORS bypass) is **not available in Blocks**. The
   gateway today sends **no CORS headers** (Fastify, no `@fastify/cors`). So the
   extension cannot call `api.polydoc.tech` until the gateway allows the Airtable
   extension origin. The "Run a script" action is server-side and needs no CORS.

2. **Secret handling — extension is weaker than the script action.**
   The Blocks SDK has only `globalConfig` for storage, which is **readable by any
   base collaborator with read/write access**. There is no per-user secret store.
   So an API key entered in the extension is visible to base collaborators — we
   must show a disclaimer and recommend a sandbox/scoped key. The "Run a script"
   action can use Airtable **Automation Secrets**, which is the secure path.

### Free vs paid (the cost answer)

- **Build the extension code:** free (local tooling).
- **Dev-run the extension in a base (`block run`):** likely works on free (free =
  1 extension/base), but **blocked by CORS until the gateway is fixed** regardless
  of plan. (Verify dev-run on free during Pass 3.)
- **"Run a script" automation action:** **paid only** — Team (~$20/seat/mo) and up,
  not even available on the Team trial.
- **Marketplace submission:** no fee, but review wants a working example base +
  walkthrough video; a Team seat makes this credible.
- **Net:** get **one Team seat** on the dev/test account (`hello@polydoc.tech`
  / `polydoc-tech`). Free is not enough for the full deliverable.

---

## 1. Product model (mirror the n8n node exactly)

PolyDoc API = 2 endpoints: `POST /pdf/convert`, `POST /screenshot/convert`.
Auth: `Authorization: Bearer <API_KEY>`. Sandbox: `X-Sandbox: true` header,
per-request (so the credential test can force sandbox). Field definitions:
`../../polydoc-gateway/src/schemas/{common,pdf,screenshot}.ts` (source of truth).

Operations (single dropdown): **PDF** `/pdf/convert` · **Screenshot**
`/screenshot/convert` · **E-Invoice** `/pdf/convert` with an `eInvoice` payload.
Source mode: URL / inline HTML / Template (`source: "[template:<id>]"` +
`templateData`). Delivery: Download / Cloud Storage (presigned) / Webhook, plus
an **Advanced (JSON)** deep-merge escape hatch. For the extension, **default
delivery = Cloud Storage / Webhook (async)**, not in-browser binary download: the
script action's `fetch` caps at 30s and the extension would have to handle binary
in a sandbox. Write the resulting file URL into an attachment field.

### Airtable-specific value-add: field mapping

The thing that makes this more than a thin wrapper, and the natural fit for a
database product: map **record fields → PolyDoc inputs**.
- PDF/template angle: record fields → `templateData`.
- Screenshot angle: a URL field → `source`.
- E-Invoice angle: an invoice header record + linked line-item records → assemble
  the `invoice` JSON (seller/buyer/lines/totals).

### Three angle-split assets (analog of the n8n templates)

| n8n template | Airtable example base / recipe | Angle |
|---|---|---|
| `invoice-pdf-from-template.json` | "Records → branded PDF" | PDF |
| `url-screenshot-scheduled.json` | "URL list → screenshot thumbnails" | Screenshot |
| `einvoice-webhook-to-pdf.json` | "Invoice + line items → ZUGFeRD/Factur-X PDF" | E-Invoice |

---

## 2. Passes

### Pass 1 — Shared core + script-action recipes (no paid plan, no CORS) ☑ DONE
The testable, zero-cost foundation. Pure body builder ported from the n8n
`GenericFunctions.ts` into framework-agnostic TS shared by both surfaces.
- ☑ Repo scaffold: `package.json` (MIT, name `airtable-polydoc`), `tsconfig`,
  `vitest.config.ts`, `.gitignore`, `LICENSE`, `README.md`.
- ☑ `src/buildRequestBody.ts` — port + 34 unit tests, mirroring
  `../../n8n-nodes-polydoc/test/buildRequestBody.test.ts`. Typecheck clean.
- ☑ `recipes/{html-url-to-pdf,url-to-screenshot,generate-einvoice}.js` — three
  self-contained "Run a script" recipes (one per angle) that read record fields,
  call PolyDoc server-side (no CORS), and push the bytes into an attachment field
  via the Airtable `uploadAttachment` endpoint. `_shared.js` is the canonical,
  tested helper copy; `test/recipes.test.ts` enforces recipe self-containment.
- ☑ Live smoke tests gated on `POLYDOC_API_KEY`, `X-Sandbox: true` — PDF,
  screenshot, e-invoice all return valid output against the live API.
- ☐ `git init` + first commit (deferred — pin the commit identity / remote first,
  see open questions).
- ☐ Verify the recipes on a real paid Airtable base (cannot run "Run a script"
  without a Team seat).

### Pass 2 — Gateway CORS (cross-repo prerequisite for the extension) ☐
Separate PR in `../../polydoc-gateway`. Production service — follow its CLAUDE.md
observability rule (baseline `amtool`/GlitchTip/Loki before + after).
- ☐ Add `@fastify/cors`, allow the Airtable extension origin(s) for the two convert
  routes; confirm the exact origin from `block run` devtools.
- ☐ Preflight (`OPTIONS`) handling; keep auth header allowed.
- ☐ `/security-review` before merge (touches an internet-facing route).

### Pass 3 — Blocks SDK extension (needs Pass 2 merged) ☐
- ☐ `block init`, manifest, React app scaffold.
- ☐ Settings panel: API key (`InputSynced` password → globalConfig) + Sandbox
  toggle + Base URL, **with the collaborator-visibility disclaimer**.
- ☐ "Test API key" button = minimal sandbox screenshot (`source: "<p>x</p>"`,
  `X-Sandbox: true`) → 200 valid / 401 invalid. (Playbook: credential test is
  mandatory for verification; the extension analog is this button.)
- ☐ Operation dropdown + source mode + field-mapping UI + delivery (default async).
- ☐ Verify dev-run works on a **free** plan; record the finding here.

### Pass 4 — Marketplace assets + submission ☐
- ☐ Icon (200–1000px square, from `polydoc-web/landing-page/.../Logo.tsx`),
  descriptions, 1–10 screenshots, support email/URL.
- ☐ Three example bases (read-only invite links) — the angle-split assets above.
- ☐ Walkthrough video showing the "Test API key" button passing + each operation.
- ☐ Scrub em-dashes from all UI/README/listing text (org rule).
- ☐ `block submit`.

---

## 3. Open questions / known unknowns

- **Screenshot latency vs Airtable's 30s fetch cap.** Sandbox screenshots were
  observed at 100-200s on a cold/loaded run (and ~1-7s when warm); PDF is ~1s.
  The "Run a script" action caps `fetch` at 30s. If production screenshots can
  exceed 30s, the synchronous screenshot recipe will time out in Airtable — switch
  that angle to async delivery, or confirm production speed. PDF/e-invoice are fine.
- **Commit identity / remote for the fresh repo.** Playbook §5 says PolyDoc brand
  work uses GitHub `polydoc-tech`, npm `polydoc.tech`, commit author
  `PolyDoc <hello@polydoc.tech>` (sibling: `n8n-nodes-polydoc`). Global §0
  personal-mode says `tobias@tsa-informatics.net` for `tobias-dev/*`. Resolve
  before the first commit; likely the brand identity, mirroring the n8n repo.
- Exact Airtable extension iframe origin to allowlist in the gateway (confirm via
  `block run`).
- Whether a custom dev extension actually runs on a free plan (Pass 3 verify).
- `uploadAttachment` 5 MB cap: large PDFs need Cloud Storage delivery + URL attach.
- Whether to also ship an Interface Extension variant (vs base extension).
