import type { Metadata } from 'next'
import { Fraunces, Hanken_Grotesk } from 'next/font/google'
import './globals.css'

const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-fraunces' })
const hanken = Hanken_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-hanken' })

export const metadata: Metadata = {
  title: 'Cairn',
  description: 'Church health, one honest look at a time.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${hanken.variable}`}>
      <body className="min-h-dvh bg-paper text-ink antialiased">{children}</body>
    </html>
  )
}
