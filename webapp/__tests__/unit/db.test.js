const { getDatesInRange } = require('../../db');

describe('getDatesInRange', () => {
  test('single date returns array of one', () => {
    expect(getDatesInRange('2026-03-15', '2026-03-15')).toEqual(['2026-03-15']);
  });

  test('3-day range is inclusive on both ends', () => {
    expect(getDatesInRange('2026-03-01', '2026-03-03')).toEqual([
      '2026-03-01', '2026-03-02', '2026-03-03',
    ]);
  });

  test('crosses month boundary correctly', () => {
    expect(getDatesInRange('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02',
    ]);
  });

  test('crosses year boundary correctly', () => {
    expect(getDatesInRange('2025-12-30', '2026-01-02')).toEqual([
      '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02',
    ]);
  });

  test('from > to returns empty array', () => {
    expect(getDatesInRange('2026-03-05', '2026-03-01')).toEqual([]);
  });

  test('7-day range has correct length and bounds', () => {
    const result = getDatesInRange('2026-03-01', '2026-03-07');
    expect(result).toHaveLength(7);
    expect(result[0]).toBe('2026-03-01');
    expect(result[6]).toBe('2026-03-07');
  });

  test('handles leap year Feb 29', () => {
    expect(getDatesInRange('2024-02-28', '2024-03-01')).toEqual([
      '2024-02-28', '2024-02-29', '2024-03-01',
    ]);
  });

  test('all dates are in YYYY-MM-DD format', () => {
    const result = getDatesInRange('2026-01-01', '2026-01-31');
    for (const d of result) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(result).toHaveLength(31);
  });
});
