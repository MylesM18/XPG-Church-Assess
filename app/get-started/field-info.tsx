'use client'

import type { ReactNode } from 'react'
import { useDisclosure } from '@/components/inline-disclosure'

const INFO_ICON_CLASS =
  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line font-body text-[11px] leading-none text-ink-soft hover:bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

/**
 * A field label with a clickable "i" that reveals help in-flow (above the input, pushing the rest
 * of the form down). The region wrapper is `w-full` with NO display utility, so it wraps to its own
 * line inside the flex-wrap row and `hidden` stays authoritative. The trigger is a real <button>,
 * kept OUT of the <label> (a label may not contain a second interactive element).
 */
export function FieldInfo({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string
  label: string
  children: ReactNode
}) {
  const { triggerProps, regionProps } = useDisclosure()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label htmlFor={htmlFor} className="font-body text-sm text-ink-soft">
        {label}
      </label>
      <button {...triggerProps} aria-label={`About ${label}`} className={INFO_ICON_CLASS}>
        i
      </button>
      <div
        {...regionProps}
        className="w-full rounded-md border border-line bg-sand p-3 font-body text-sm text-ink-soft"
      >
        {children}
      </div>
    </div>
  )
}
