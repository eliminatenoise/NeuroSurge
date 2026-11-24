import { LITE_PACK_INDEX_SHA256 } from '../../lite/asset-pin.mjs';

const liteBase = new URL('../../lite/packs/', import.meta.url);

/** The edition an address asks for (25 November 2026, DESIGN-DECISIONS sections 212 and 217): 'lite', 'full' or
 * 'unknown'. The parameter's name and value are read without regard to capitals and to spaces round the value
 * ("?edition=Lite", "?Edition=lite" and "?edition=lite%20" are Lite); no such parameter, an empty one and "full" are
 * the Full game; any other value is not known. The launcher and the early pack loader both ask here. */
export function editionOf(params) {
  let v = null;
  try { for (const [k, val] of params) if (String(k).toLowerCase() === 'edition') { v = String(val); break; } } catch { v = null; }
  if (v === null) return 'full';
  const t = v.trim().toLowerCase();
  return t === 'lite' ? 'lite' : t === '' || t === 'full' ? 'full' : 'unknown';
}
export function isLiteEdition(params) { return editionOf(params) === 'lite'; }

export function editionPacks(params) {
  if (!isLiteEdition(params)) return {};
  return { base: liteBase.href, indexUrl: new URL('PACK-INDEX.json', liteBase).href,
    expectedIndexSha256: LITE_PACK_INDEX_SHA256, codec: 'brotli' };
}
