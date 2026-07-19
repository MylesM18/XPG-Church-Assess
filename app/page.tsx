import { Hero } from '@/components/marketing/hero'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <div className="mx-auto max-w-[1080px] px-[26px]">
          <Hero />
          {/* Task 5 inserts <HowItWorks /> */}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
