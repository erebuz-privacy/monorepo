import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { StatsBar } from "@/components/StatsBar";
import { HowItWorks } from "@/components/HowItWorks";
import { Sdk } from "@/components/Sdk";
import { Chains } from "@/components/Chains";
import { Comparison } from "@/components/Comparison";
import { Faq } from "@/components/Faq";
import { Cta } from "@/components/Cta";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <>
      <Nav />
      <div className="mx-auto max-w-[1400px] border-x border-white/10">
        <main>
          <Hero />
          <StatsBar />
          <HowItWorks />
          <Sdk />
          <Chains />
          <Comparison />
          <Faq />
          <Cta />
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
