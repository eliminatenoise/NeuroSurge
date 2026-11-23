import { LITE_PACK_INDEX_SHA256 } from '../../lite/asset-pin.mjs';

const liteBase = new URL('../../lite/packs/', import.meta.url);

export function editionPacks(params) {
  if (params.get('edition') !== 'lite') return {};
  return { base: liteBase.href, indexUrl: new URL('PACK-INDEX.json', liteBase).href,
    expectedIndexSha256: LITE_PACK_INDEX_SHA256, codec: 'brotli' };
}
