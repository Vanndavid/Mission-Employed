import { describe, expect, it } from 'vitest';
import { featureLabel, formatCost, formatTokens } from './usageFormat';

describe('usage formatting', () => {
  it('abbreviates token counts', () => {
    expect([0, 950, 12_500, 12_000, 1_250_000, 3_400_000].map(formatTokens)).toEqual([
      '0', '950', '12.5k', '12k', '1.25M', '3.4M',
    ]);
  });

  it('shows cost in cents, and a tiny cost as under a cent rather than free', () => {
    expect([0, 0.0004, 0.012, 4.2].map(formatCost)).toEqual(['$0.00', '<$0.01', '$0.01', '$4.20']);
  });

  it('names known features and passes unknown ones through', () => {
    expect(featureLabel('ai/mock/live')).toBe('Mock interview (voice)');
    expect(featureLabel('ai/something/new')).toBe('ai/something/new');
  });
});
