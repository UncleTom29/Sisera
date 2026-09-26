import { redirect } from "next/navigation";

export default async function IntelligencePage({
  searchParams,
}: { searchParams: Promise<{ universe?: string }> }) {
  const { universe } = await searchParams;
  redirect(universe === "perps" ? "/terminal?venue=hyperliquid" : "/private-markets");
}
