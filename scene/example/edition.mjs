import * as liteAssets from '../../lite/asset-pin.mjs';

const liteBase = new URL('../../lite/packs/', import.meta.url);

export function editionPacks(params) {
  if (liteAssets.OFFLINE_LITE_ONLY !== true && params.get('edition') !== 'lite') return {};
  return { base: liteBase.href, indexUrl: new URL('PACK-INDEX.json', liteBase).href,
    expectedIndexSha256: liteAssets.LITE_PACK_INDEX_SHA256, codec: 'brotli' };
}
