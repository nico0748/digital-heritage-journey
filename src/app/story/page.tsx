import { HorizontalStage } from "@/components/story/HorizontalStage";
import { storyScenes } from "@/content/story";

export default function StoryPage() {
  return (
    <main className="relative w-full bg-washi-100">
      <HorizontalStage scenes={storyScenes} />
    </main>
  );
}
