/**
 * Copy shared verbatim between the screen report and the PDF document.
 * The screen's wording is authoritative — see the M5c review finding that
 * the two surfaces had drifted apart when the PDF inlined its own text.
 */
export const GENEROSITY_COPY: Record<'breadth' | 'depth' | 'both', string> = {
  breadth:
    'Breadth: your givers are generous — there just aren’t enough of them yet. This routes upstream to connection.',
  depth: 'Depth: most of your people give, but few have been taught why. The opportunity is discipleship around generosity.',
  both: 'Both breadth and depth are low: few givers, and little teaching behind the giving.',
}
