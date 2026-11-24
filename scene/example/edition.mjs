import { LITE_PACK_INDEX_SHA256 } from '../../lite/asset-pin.mjs';

const liteBase = new URL('../../lite/packs/', import.meta.url);

/** Whether the address asks for the Lite edition: `edition=lite`, in capitals or not (25 November 2026, DESIGN-DECISIONS
 * section 212: "?edition=Lite" was refused). The launcher and the early pack loader both ask here. */
export function isLiteEdition(params) {
  const v = params && typeof params.get === 'function' ? params.get('edition') : null;
  return typeof v === 'string' && v.toLowerCase() === 'lite';
}

export function editionPacks(params) {
  if (!isLiteEdition(params)) return {};
  return { base: liteBase.href, indexUrl: new URL('PACK-INDEX.json', liteBase).href,
    expectedIndexSha256: LITE_PACK_INDEX_SHA256, codec: 'brotli' };
}
