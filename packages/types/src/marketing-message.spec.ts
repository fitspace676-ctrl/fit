import { describe, expect, it } from 'vitest';
import { interpolateMarketingMessage } from './marketing';

describe('marketing delivery interpolation', () => {
  it('accepts canonical, legacy automation and camelCase name variables', () => {
    expect(
      interpolateMarketingMessage('{{firstName}}/{{ first_name }}/{{member_first_name}}', {
        first_name: 'Nino',
        member_first_name: 'Nino',
      }),
    ).toBe('Nino/Nino/Nino');
  });
  it('blanks missing, unknown and malformed variable names', () => {
    expect(
      interpolateMarketingMessage('{{phone}}/{{unknown}}/{{bad field}}/{{constructor}}', {}),
    ).toBe('///');
  });
  it('does not interpret replacement strings as substitution syntax', () => {
    expect(interpolateMarketingMessage('{{first_name}}', { first_name: '$& <Nino>' })).toBe(
      '$& <Nino>',
    );
  });
});
