export interface ResolvedBrand {
  monogram: string
  tileColor: string
  displayName: string
}

const STOPWORDS = new Set(['the', 'of', 'and', 'a', 'at', 'in', 'on', 'for'])

// 8-tone monogram palette. NEVER berry (#8E2B3E is reserved for constraint/active).
export const TILE_PALETTE = [
  '#1F4E4A', // deep teal
  '#3A4A6B', // slate blue
  '#2E4636', // forest
  '#5A3A55', // plum
  '#1E2A44', // ink-navy
  '#5E3A2E', // oxblood-brown
  '#7A5A2E', // bronze
  '#34423A', // charcoal-green
] as const

function defaultLetters(): 1 | 2 {
  return process.env.MONOGRAM_LETTERS === '2' ? 2 : 1
}

function significantWords(name: string): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const significant = words.filter((w) => !STOPWORDS.has(w.toLowerCase()))
  return significant.length > 0 ? significant : words
}

export function resolveMonogram(name: string, letters: 1 | 2 = defaultLetters()): string {
  const words = significantWords(name)
  return words
    .slice(0, letters)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

// FNV-1a → stable, name-based palette index (independent of palette ordering churn).
function hashName(name: string): number {
  let h = 0x811c9dc5
  const s = name.trim().toLowerCase()
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function resolveTileColor(name: string): string {
  return TILE_PALETTE[hashName(name) % TILE_PALETTE.length]!
}

export function resolveBrand(input: string | { name: string }): ResolvedBrand {
  const name = typeof input === 'string' ? input : input.name
  return {
    monogram: resolveMonogram(name),
    tileColor: resolveTileColor(name),
    displayName: name.trim(),
  }
}
