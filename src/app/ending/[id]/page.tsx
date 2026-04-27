import { notFound } from "next/navigation";
import { cultures, getCulture } from "@/content/cultures";
import { EndingView } from "@/components/ending/EndingView";

export function generateStaticParams() {
  return cultures.map((c) => ({ id: c.id }));
}

export default async function EndingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const culture = getCulture(id);
  if (!culture) notFound();

  return <EndingView culture={culture} />;
}
