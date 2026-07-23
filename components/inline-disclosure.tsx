'use client'

import { useId, useState, type ReactNode } from 'react'

/**
 * Native inline disclosure: a trigger button that expands a region IN THE DOCUMENT FLOW.
 * Not a dialog — it never traps or moves focus, has no outside-click/Esc dismissal, no portal.
 * The region uses the `hidden` attribute (not CSS-only) so it leaves the a11y tree and tab order
 * when collapsed. Consumers must NOT put a Tailwind display utility (flex/grid/block) on the region
 * wrapper — it would override `hidden`. Style width/padding/border only; let children lay out.
 */
export function useDisclosure() {
  const [open, setOpen] = useState(false)
  const regionId = useId()
  const toggle = () => setOpen((o) => !o)
  return {
    open,
    toggle,
    triggerProps: {
      type: 'button' as const,
      'aria-expanded': open,
      'aria-controls': regionId,
      onClick: toggle,
    },
    regionProps: { id: regionId, hidden: !open },
  }
}

/** Convenience wrapper for the trigger-then-region-adjacent case (Feature 2). */
export function InlineDisclosure({
  triggerLabel,
  triggerClassName,
  regionClassName,
  children,
}: {
  triggerLabel: ReactNode
  triggerClassName?: string
  regionClassName?: string
  children: ReactNode
}) {
  const { triggerProps, regionProps } = useDisclosure()
  return (
    <>
      <button {...triggerProps} className={triggerClassName}>
        {triggerLabel}
      </button>
      <div {...regionProps} className={regionClassName}>
        {children}
      </div>
    </>
  )
}
