// Shareable status page for a single private transfer. Anyone with the link can
// watch its live state (fetched from the TEE by routeId).
import { TxView } from "@/components/tx-view";

export default async function TxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TxView id={id} />;
}
