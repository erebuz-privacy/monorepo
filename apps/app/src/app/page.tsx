import { QuotePanel } from "@/components/quote-panel";

// Public entry: the swap+bridge quote screen. No login needed to get a quote —
// authentication happens at the method step after the user confirms.
export default function Index() {
  return <QuotePanel />;
}
