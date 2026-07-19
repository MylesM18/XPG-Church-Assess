import { describe, it, expect } from 'vitest';
import { shareLink } from '@/lib/report/share-link';

describe('shareLink', () => {
  it('builds a /r/<token> url from the app origin', () => {
    expect(shareLink('http://127.0.0.1:3000', 'abc-123')).toBe('http://127.0.0.1:3000/r/abc-123');
  });

  it('does not double the slash when the origin has a trailing one', () => {
    expect(shareLink('https://example.test/', 'abc-123')).toBe('https://example.test/r/abc-123');
  });
});
