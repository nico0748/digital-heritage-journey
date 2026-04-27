import { notFound } from "next/navigation";
import { cultures, getCulture } from "@/content/cultures";
import { ExperienceShell } from "@/components/experience/ExperienceShell";

export function generateStaticParams() {
  return cultures.map((c) => ({ id: c.id }));
}

export default async function ExperiencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const culture = getCulture(id);
  if (!culture) notFound();

  return <ExperienceShell culture={culture} />;
}
