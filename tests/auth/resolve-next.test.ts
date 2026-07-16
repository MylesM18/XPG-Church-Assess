import { describe, expect, it } from 'vitest'
import { resolveNext } from '@/lib/auth/resolve-next'

describe('resolveNext', () => {
  it('returns the default fallback when no next param is present', () => {
    expect(resolveNext('')).toBe('/get-started')
    expect(resolveNext('?foo=bar')).toBe('/get-started')
  })

  it('returns a valid same-origin relative path', () => {
    expect(resolveNext('?next=/app/abc/answer/1')).toBe('/app/abc/answer/1')
    expect(resolveNext('?next=/app/abc')).toBe('/app/abc')
    expect(resolveNext('?next=/')).toBe('/')
  })

  it('rejects protocol-relative URLs (open-redirect guard)', () => {
    expect(resolveNext('?next=//evil.com')).toBe('/get-started')
    expect(resolveNext('?next=/\\evil.com')).toBe('/get-started')
  })

  it('rejects absolute URLs (open-redirect guard)', () => {
    expect(resolveNext('?next=https://evil.com')).toBe('/get-started')
    expect(resolveNext('?next=http://evil.com/app')).toBe('/get-started')
  })

  it('honours a custom fallback', () => {
    expect(resolveNext('', '/home')).toBe('/home')
    expect(resolveNext('?next=//evil.com', '/home')).toBe('/home')
  })
})
