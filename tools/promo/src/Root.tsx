import "./styles.css";
import { Composition } from "remotion";
import { Reel, FPS, DURATION_IN_FRAMES } from "./Reel";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="AirwaveHero"
      component={Reel}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
