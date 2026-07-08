import { ShieldIcon } from "@/components/icons";

export function SdkExample() {
  return (
    <section
      id="sdk"
      className="relative py-20 md:py-28"
    >
      <div className="xl:container mx-auto px-4">
        <div className="flex flex-col xl:flex-row xl:items-center gap-8 lg:gap-20">
          <div className="flex-1">
            <span className="text-6xl font-bold text-yellow mb-4 block">03</span>
            <ShieldIcon className="size-5 mb-4 text-yellow" />
            <h2 className="uppercase text-3xl md:text-4xl font-normal text-yellow mb-6">
              ONE SDK CALL
            </h2>
            <p className="text-base md:text-lg text-yellow max-w-xl">
              One master seed. One balance call. One <code className="text-cyan">send()</code> handles routing, privacy, compliance, and gas. No custom crypto.
            </p>
          </div>
          <div className="flex-[1.5] flex justify-end">
            <img src="/assets/sdk-code.png" alt="SDK code example" className="w-full h-auto object-contain" />
          </div>
        </div>
      </div>
    </section>
  );
}
