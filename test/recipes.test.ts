import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arrayBufferToBase64 } from '../recipes/_shared.js';

const recipesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'recipes');
const recipeFiles = readdirSync(recipesDir).filter((f) => f.endsWith('.js') && f !== '_shared.js');

describe('arrayBufferToBase64', () => {
  it('matches Node base64 for a short buffer', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 hello');
    expect(arrayBufferToBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('matches Node base64 across the 0x8000 chunk boundary', () => {
    // 100000 bytes forces multiple btoa chunks; a wrong boundary would corrupt the output.
    const bytes = new Uint8Array(100_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff;
    expect(arrayBufferToBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('handles an empty buffer', () => {
    expect(arrayBufferToBase64(new Uint8Array(0).buffer)).toBe('');
  });
});

describe('recipe files are self-contained copy-paste scripts', () => {
  it('ships the three angles', () => {
    expect(recipeFiles.sort()).toEqual([
      'generate-einvoice.js',
      'html-url-to-pdf.js',
      'url-to-screenshot.js',
    ]);
  });

  for (const file of recipeFiles) {
    describe(file, () => {
      const src = readFileSync(join(recipesDir, file), 'utf8');

      it('has no import/export (Airtable script editor has no modules)', () => {
        expect(src).not.toMatch(/^\s*import\s/m);
        expect(src).not.toMatch(/^\s*export\s/m);
      });

      it('inlines every helper it calls', () => {
        for (const fn of ['arrayBufferToBase64', 'polydocConvert', 'uploadAttachment']) {
          expect(src).toContain(`function ${fn}(`);
        }
      });

      it('reads inputs and posts to PolyDoc', () => {
        expect(src).toContain('input.config()');
        expect(src).toContain('api.polydoc.tech');
        expect(src).toContain('uploadAttachment');
      });
    });
  }
});
