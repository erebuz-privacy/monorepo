import { Navbar } from "@/components/Navbar";
import { ScrollLine } from "@/components/ScrollLine";
import { HeroSection } from "@/components/HeroSection";
import { CoreSection } from "@/components/CoreSection";
import { PrivacyModel } from "@/components/PrivacyModel";
import { ComparisonSection } from "@/components/ComparisonSection";
import { SdkExample } from "@/components/SdkExample";
import { SupportedChains } from "@/components/SupportedChains";
import { UseErebuz } from "@/components/UseErebuz";
import { GetInvolved } from "@/components/GetInvolved";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <ScrollLine />
      <main>
        <HeroSection />
        <div className="xl:container mx-auto px-4">
          <CoreSection />

            <div id="features-heading" className="mb-0">
            <span className="bg-yellow text-black uppercase px-2 inline-flex text-sm tracking-widest">
              FEATURES
            </span>
          </div>

          <PrivacyModel />
          <ComparisonSection />
          <SdkExample />
          <SupportedChains />
          <UseErebuz />
        </div>
        <GetInvolved />
        <Footer />
      </main>
    </>
  );
}
