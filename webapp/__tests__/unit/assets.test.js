const assetsHandler = require('../../api/assets');
const { processAssetResults, orientationFromFieldType, computeAssetStateDiff } = assetsHandler._test;

// ─── orientationFromFieldType ─────────────────────────────────────────────────

describe('orientationFromFieldType', () => {
  test.each([
    ['PORTRAIT_MARKETING_IMAGE',  'Portrait'],
    ['PORTRAIT_YOUTUBE_VIDEO',    'Portrait'],
    ['SQUARE_MARKETING_IMAGE',    'Square'],
    ['SQUARE_YOUTUBE_VIDEO',      'Square'],
    ['LANDSCAPE_LOGO',            'Landscape'],
    ['MARKETING_IMAGE',           null],
    ['YOUTUBE_VIDEO',             null],
    ['HEADLINE',                  null],
    [null,                        null],
    [undefined,                   null],
  ])('%s → %s', (fieldType, expected) => {
    expect(orientationFromFieldType(fieldType)).toBe(expected);
  });
});

// ─── processAssetResults helpers ─────────────────────────────────────────────

function mkRow(assetId, fieldType, { view = {}, asset = {}, metrics = {} } = {}) {
  return {
    adGroupAdAssetView: {
      fieldType,
      performanceLabel: 'GOOD',
      enabled: true,
      ...view,
    },
    asset: {
      id:                assetId,
      name:              `Asset ${assetId}`,
      youtubeVideoAsset: { youtubeVideoId: null },
      imageAsset:        { fullSize: { url: null } },
      textAsset:         { text: null },
      ...asset,
    },
    metrics: {
      impressions: '1000',
      clicks:      '50',
      costMicros:  1_000_000,
      conversions: '5',
      ...metrics,
    },
  };
}

// ─── processAssetResults ──────────────────────────────────────────────────────

describe('processAssetResults', () => {
  test('returns empty arrays for no input', () => {
    const { video, image, text } = processAssetResults([]);
    expect(video).toHaveLength(0);
    expect(image).toHaveLength(0);
    expect(text).toHaveLength(0);
  });

  test('categorises YouTube video assets', () => {
    const row = mkRow('1', 'YOUTUBE_VIDEO', { asset: { youtubeVideoAsset: { youtubeVideoId: 'abc123' } } });
    const { video, image, text } = processAssetResults([row]);
    expect(video).toHaveLength(1);
    expect(image).toHaveLength(0);
    expect(text).toHaveLength(0);
    expect(video[0].youtubeId).toBe('abc123');
    expect(video[0].fieldType).toBe('YOUTUBE_VIDEO');
  });

  test('categorises portrait YouTube video', () => {
    const row = mkRow('1', 'PORTRAIT_YOUTUBE_VIDEO', { asset: { youtubeVideoAsset: { youtubeVideoId: 'xyz' } } });
    const { video } = processAssetResults([row]);
    expect(video).toHaveLength(1);
    expect(video[0].orientation).toBe('Portrait');
  });

  test('categorises square YouTube video', () => {
    const row = mkRow('1', 'SQUARE_YOUTUBE_VIDEO');
    const { video } = processAssetResults([row]);
    expect(video).toHaveLength(1);
    expect(video[0].orientation).toBe('Square');
  });

  test('categorises image assets', () => {
    const row = mkRow('2', 'MARKETING_IMAGE', {
      asset: { imageAsset: { fullSize: { url: 'https://example.com/img.jpg' } } },
    });
    const { image } = processAssetResults([row]);
    expect(image).toHaveLength(1);
    expect(image[0].imageUrl).toBe('https://example.com/img.jpg');
  });

  test('categorises logo image assets', () => {
    const row = mkRow('2', 'LANDSCAPE_LOGO');
    const { image } = processAssetResults([row]);
    expect(image).toHaveLength(1);
    expect(image[0].orientation).toBe('Landscape');
  });

  test('categorises headline text assets', () => {
    const row = mkRow('3', 'HEADLINE', { asset: { textAsset: { text: 'Great Headline' } } });
    const { text } = processAssetResults([row]);
    expect(text).toHaveLength(1);
    expect(text[0].text).toBe('Great Headline');
  });

  test('categorises description text assets', () => {
    const row = mkRow('3', 'DESCRIPTION', { asset: { textAsset: { text: 'Buy now!' } } });
    const { text } = processAssetResults([row]);
    expect(text).toHaveLength(1);
  });

  test('categorises BUSINESS_NAME as text', () => {
    const row = mkRow('4', 'BUSINESS_NAME', { asset: { textAsset: { text: 'Urban Heat' } } });
    const { text } = processAssetResults([row]);
    expect(text).toHaveLength(1);
    expect(text[0].text).toBe('Urban Heat');
  });

  test('accumulates metrics across multiple rows for same asset', () => {
    const row1 = mkRow('1', 'YOUTUBE_VIDEO', { metrics: { impressions: '500', clicks: '25', costMicros: 500_000, conversions: '2' } });
    const row2 = mkRow('1', 'YOUTUBE_VIDEO', { metrics: { impressions: '300', clicks: '15', costMicros: 300_000, conversions: '1' } });
    const { video } = processAssetResults([row1, row2]);
    expect(video).toHaveLength(1);
    expect(video[0].impressions).toBe(800);
    expect(video[0].clicks).toBe(40);
    expect(video[0].spend).toBeCloseTo(0.8);
    expect(video[0].conversions).toBeCloseTo(3);
  });

  test('same assetId but different fieldType are separate entries', () => {
    const row1 = mkRow('1', 'YOUTUBE_VIDEO');
    const row2 = mkRow('1', 'PORTRAIT_YOUTUBE_VIDEO');
    const { video } = processAssetResults([row1, row2]);
    expect(video).toHaveLength(2);
  });

  test('computes CTR correctly', () => {
    const row = mkRow('1', 'YOUTUBE_VIDEO', { metrics: { impressions: '1000', clicks: '50', costMicros: 1_000_000, conversions: '5' } });
    const { video } = processAssetResults([row]);
    expect(video[0].ctr).toBeCloseTo((50 / 1000) * 100, 2);
  });

  test('computes CPI correctly', () => {
    const row = mkRow('1', 'YOUTUBE_VIDEO', { metrics: { impressions: '1000', clicks: '50', costMicros: 1_000_000, conversions: '5' } });
    const { video } = processAssetResults([row]);
    expect(video[0].cpi).toBeCloseTo(1 / 5, 2); // spend=1, conv=5 → cpi=0.2
  });

  test('CPI is null when conversions are zero', () => {
    const row = mkRow('1', 'YOUTUBE_VIDEO', { metrics: { impressions: '1000', clicks: '50', costMicros: 1_000_000, conversions: '0' } });
    const { video } = processAssetResults([row]);
    expect(video[0].cpi).toBeNull();
  });

  test('CTR is null when impressions are zero', () => {
    const row = mkRow('1', 'YOUTUBE_VIDEO', { metrics: { impressions: '0', clicks: '0', costMicros: 1_000_000, conversions: '0' } });
    const { video } = processAssetResults([row]);
    expect(video[0].ctr).toBeNull();
  });

  test('prefers non-UNSPECIFIED performance label (last-write-wins)', () => {
    const row1 = mkRow('1', 'YOUTUBE_VIDEO', { view: { performanceLabel: 'UNSPECIFIED' } });
    const row2 = mkRow('1', 'YOUTUBE_VIDEO', { view: { performanceLabel: 'BEST' } });
    const { video } = processAssetResults([row1, row2]);
    expect(video[0].performanceLabel).toBe('BEST');
  });

  test('does not overwrite a good label with UNSPECIFIED', () => {
    const row1 = mkRow('1', 'YOUTUBE_VIDEO', { view: { performanceLabel: 'GOOD' } });
    const row2 = mkRow('1', 'YOUTUBE_VIDEO', { view: { performanceLabel: 'UNSPECIFIED' } });
    const { video } = processAssetResults([row1, row2]);
    expect(video[0].performanceLabel).toBe('GOOD');
  });

  test('sorts each category by spend descending', () => {
    const high = mkRow('1', 'YOUTUBE_VIDEO', { metrics: { impressions: '0', clicks: '0', costMicros: 5_000_000, conversions: '0' } });
    const low  = mkRow('2', 'YOUTUBE_VIDEO', { metrics: { impressions: '0', clicks: '0', costMicros: 1_000_000, conversions: '0' } });
    const { video } = processAssetResults([low, high]);
    expect(video[0].id).toBe('1');
    expect(video[1].id).toBe('2');
  });

  test('skips rows without assetId', () => {
    const row = { adGroupAdAssetView: { fieldType: 'YOUTUBE_VIDEO' }, asset: {}, metrics: {} };
    const { video } = processAssetResults([row]);
    expect(video).toHaveLength(0);
  });

  test('skips rows without fieldType', () => {
    const row = { adGroupAdAssetView: {}, asset: { id: '1' }, metrics: {} };
    const { video, image, text } = processAssetResults([row]);
    expect([...video, ...image, ...text]).toHaveLength(0);
  });

  test('unknown fieldType not placed in any category', () => {
    const row = mkRow('1', 'SOME_UNKNOWN_TYPE');
    const { video, image, text } = processAssetResults([row]);
    expect([...video, ...image, ...text]).toHaveLength(0);
  });
});

// ─── computeAssetStateDiff ────────────────────────────────────────────────────

describe('computeAssetStateDiff', () => {
  const today = '2026-03-31';

  function mkAsset(id, fieldType, overrides = {}) {
    return {
      id, fieldType,
      performanceLabel: 'GOOD',
      name: `Asset ${id}`,
      impressions: 1000, clicks: 50, spend: 10, conversions: 5,
      ...overrides,
    };
  }

  function mkStateAsset(id, fieldType, status, pausedAt, firstSeenAt, overrides = {}) {
    return {
      id, fieldType,
      performanceLabel: 'GOOD',
      name: `Asset ${id}`,
      impressions: 1000, clicks: 50, spend: 10, conversions: 5,
      status, pausedAt, firstSeenAt, lastSeenAt: firstSeenAt,
      ...overrides,
    };
  }

  test('brand new asset gets status live, firstSeenAt = today', () => {
    const result = computeAssetStateDiff(
      { video: [], image: [], text: [] },
      { video: [mkAsset('1', 'YOUTUBE_VIDEO')], image: [], text: [] },
      today
    );
    expect(result.video).toHaveLength(1);
    expect(result.video[0].status).toBe('live');
    expect(result.video[0].pausedAt).toBeNull();
    expect(result.video[0].firstSeenAt).toBe(today);
    expect(result.video[0].lastSeenAt).toBe(today);
  });

  test('existing live asset: metrics updated, firstSeenAt preserved', () => {
    const prev = { video: [mkStateAsset('1', 'YOUTUBE_VIDEO', 'live', null, '2026-03-01')], image: [], text: [] };
    const fresh = { video: [mkAsset('1', 'YOUTUBE_VIDEO', { impressions: 9999, clicks: 200 })], image: [], text: [] };
    const result = computeAssetStateDiff(prev, fresh, today);
    expect(result.video[0].status).toBe('live');
    expect(result.video[0].firstSeenAt).toBe('2026-03-01');
    expect(result.video[0].lastSeenAt).toBe(today);
    expect(result.video[0].impressions).toBe(9999);
    expect(result.video[0].clicks).toBe(200);
  });

  test('live asset that disappears gets paused with pausedAt = today', () => {
    const prev = { video: [mkStateAsset('1', 'YOUTUBE_VIDEO', 'live', null, '2026-03-01')], image: [], text: [] };
    const result = computeAssetStateDiff(prev, { video: [], image: [], text: [] }, today);
    expect(result.video[0].status).toBe('paused');
    expect(result.video[0].pausedAt).toBe(today);
  });

  test('already-paused asset stays paused if still absent, pausedAt unchanged', () => {
    const pausedAt = '2026-03-25';
    const prev = { video: [mkStateAsset('1', 'YOUTUBE_VIDEO', 'paused', pausedAt, '2026-03-01')], image: [], text: [] };
    const result = computeAssetStateDiff(prev, { video: [], image: [], text: [] }, today);
    expect(result.video[0].status).toBe('paused');
    expect(result.video[0].pausedAt).toBe(pausedAt);
  });

  test('paused asset reappears: status live, pausedAt cleared, firstSeenAt preserved', () => {
    const prev = { video: [mkStateAsset('1', 'YOUTUBE_VIDEO', 'paused', '2026-03-25', '2026-03-01')], image: [], text: [] };
    const fresh = { video: [mkAsset('1', 'YOUTUBE_VIDEO')], image: [], text: [] };
    const result = computeAssetStateDiff(prev, fresh, today);
    expect(result.video[0].status).toBe('live');
    expect(result.video[0].pausedAt).toBeNull();
    expect(result.video[0].firstSeenAt).toBe('2026-03-01');
    expect(result.video[0].lastSeenAt).toBe(today);
  });

  test('empty prevState: all fresh assets get status live', () => {
    const fresh = {
      video: [mkAsset('1', 'YOUTUBE_VIDEO')],
      image: [mkAsset('2', 'MARKETING_IMAGE')],
      text:  [mkAsset('3', 'HEADLINE')],
    };
    const result = computeAssetStateDiff({ video: [], image: [], text: [] }, fresh, today);
    expect(result.video[0].status).toBe('live');
    expect(result.image[0].status).toBe('live');
    expect(result.text[0].status).toBe('live');
  });

  test('empty freshAssets: all live prev assets become paused', () => {
    const prev = {
      video: [mkStateAsset('1', 'YOUTUBE_VIDEO', 'live', null, '2026-03-01')],
      image: [mkStateAsset('2', 'MARKETING_IMAGE', 'live', null, '2026-03-01')],
      text:  [],
    };
    const result = computeAssetStateDiff(prev, { video: [], image: [], text: [] }, today);
    expect(result.video[0].status).toBe('paused');
    expect(result.image[0].status).toBe('paused');
  });

  test('video, image, text types handled independently', () => {
    const prev = {
      video: [mkStateAsset('1', 'YOUTUBE_VIDEO', 'live', null, '2026-03-01')],
      image: [],
      text:  [mkStateAsset('3', 'HEADLINE', 'live', null, '2026-03-01')],
    };
    const fresh = {
      video: [],
      image: [mkAsset('2', 'MARKETING_IMAGE')],
      text:  [mkAsset('3', 'HEADLINE')],
    };
    const result = computeAssetStateDiff(prev, fresh, today);
    expect(result.video[0].status).toBe('paused');   // was live, now gone
    expect(result.image[0].status).toBe('live');      // brand new
    expect(result.text[0].status).toBe('live');       // still present
  });

  test('key is assetId_fieldType — same id different fieldType are independent', () => {
    const prev = { video: [mkStateAsset('1', 'YOUTUBE_VIDEO', 'live', null, '2026-03-01')], image: [], text: [] };
    const fresh = { video: [mkAsset('1', 'PORTRAIT_YOUTUBE_VIDEO')], image: [], text: [] };
    const result = computeAssetStateDiff(prev, fresh, today);
    // YOUTUBE_VIDEO gone → paused; PORTRAIT_YOUTUBE_VIDEO → new live
    const paused = result.video.find(a => a.fieldType === 'YOUTUBE_VIDEO');
    const live   = result.video.find(a => a.fieldType === 'PORTRAIT_YOUTUBE_VIDEO');
    expect(paused.status).toBe('paused');
    expect(live.status).toBe('live');
  });
});
