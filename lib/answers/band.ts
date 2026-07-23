export type Band = 'lo' | 'mid' | 'hi'

/** Three score bands over the 1–10 scale: 1–3 Low · 4–7 Developing · 8–10 Strong. */
export function band(value: number): Band {
  return value <= 3 ? 'lo' : value <= 7 ? 'mid' : 'hi'
}

export const BANDS: { key: Band; label: string }[] = [
  { key: 'lo', label: 'Low' },
  { key: 'mid', label: 'Developing' },
  { key: 'hi', label: 'Strong' },
]
