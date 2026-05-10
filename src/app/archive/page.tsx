import { prefectures } from "@/content/prefectures";
import { ArchiveView } from "@/components/archive/ArchiveView";
import type { PrefectureId } from "@/types/content";

const PREFECTURE_ID_SET: ReadonlySet<string> = new Set(
  prefectures.map((p) => p.id),
);

function isPrefectureId(value: string | undefined): value is PrefectureId {
  return value !== undefined && PREFECTURE_ID_SET.has(value);
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ prefecture?: string }>;
}) {
  const { prefecture: prefectureParam } = await searchParams;
  const activeId = isPrefectureId(prefectureParam) ? prefectureParam : null;
  return <ArchiveView activeId={activeId} />;
}
