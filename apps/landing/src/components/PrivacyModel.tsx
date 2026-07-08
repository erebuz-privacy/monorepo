import {
  ShieldIcon,
} from "@/components/icons";
import { ErebuzTee } from "./ErebuzTee";

export function PrivacyModel() {
  return (
    <section
      id="privacy-model"
      className="relative py-20 md:py-28"
    >
      <div className="xl:container mx-auto px-4">
        <div className="flex flex-col xl:flex-row xl:items-center gap-8 lg:gap-20">
          <div className="flex-1">
            <span className="text-6xl font-bold text-yellow mb-4 block">01</span>
            <ShieldIcon className="size-5 mb-4 text-yellow" />
            <h2 className="uppercase text-3xl md:text-4xl font-normal text-yellow mb-6">
              PRIVACY MODEL &amp; TEE
            </h2>
            <p className="text-base md:text-lg text-yellow max-w-xl">
              Each app runs its own TEE, a locked box not even the machine owner can see inside. Keys, compliance, signing, and routing all execute there. Self-host or Erebuz-host
            </p>
          </div>
          <div className="flex-1 flex justify-center">
            <ErebuzTee />
          </div>
        </div>
      </div>
    </section>
  );
}
