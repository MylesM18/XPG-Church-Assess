export interface SectionRef {
  id: string
  name: string
}

export interface SectionNav {
  /** 0-based position of the current section in methodology order; -1 if categoryId is unknown. */
  index: number
  total: number
  prev: SectionRef | null
  next: SectionRef | null
}

/**
 * Prev/next navigation across the ordered methodology sections, for the read-only review. The
 * review shows one section at a time (`/app/[churchId]/answer/[categoryId]`); this walks the same
 * order the assessment uses so a reviewer can step section → section. Returns null at each end (and
 * for an unknown categoryId), so the page renders no dead link.
 */
export function sectionNav(
  categories: ReadonlyArray<SectionRef>,
  categoryId: string,
): SectionNav {
  const total = categories.length
  const index = categories.findIndex((c) => c.id === categoryId)
  if (index < 0) return { index: -1, total, prev: null, next: null }
  const at = (i: number): SectionRef | null => {
    const c = categories[i] // out-of-range → undefined → null (no dead link at the ends)
    return c ? { id: c.id, name: c.name } : null
  }
  return { index, total, prev: at(index - 1), next: at(index + 1) }
}
