import { StoryStage } from "@/components/story/StoryStage";
import { StorySettingsMenu } from "@/components/story/StorySettingsMenu";
import { storyScenes } from "@/content/story";

export default function StoryPage() {
  return (
    <main className="relative w-full bg-washi-100">
      <StoryStage scenes={storyScenes} />
      <StorySettingsMenu />
    </main>
  );
}
