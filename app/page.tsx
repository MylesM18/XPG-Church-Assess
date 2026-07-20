import { Hero } from '@/components/marketing/hero'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <div className="mx-auto max-w-[1080px] px-[26px]">
          <Hero />
          <HowItWorks />
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
