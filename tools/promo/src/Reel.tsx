import { AbsoluteFill, Sequence } from "remotion";
import "./fonts";
import { C, FEATURES_SEC, FPS as FPS_CONST, INTRO_SEC, OUTRO_SEC, TOTAL_SEC } from "./theme";
import { Intro } from "./components/Intro";
import { Features } from "./components/Features";
import { Outro } from "./components/Outro";

export const FPS = FPS_CONST;
export const DURATION_IN_FRAMES = Math.round(TOTAL_SEC * FPS);

const introF = Math.round(INTRO_SEC * FPS);
const featF = Math.round(FEATURES_SEC * FPS);
const outroF = Math.round(OUTRO_SEC * FPS);

export const Reel: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Sequence durationInFrames={introF} layout="none">
        <Intro />
      </Sequence>
      <Sequence from={introF} durationInFrames={featF} layout="none">
        <Features />
      </Sequence>
      <Sequence from={introF + featF} durationInFrames={outroF} layout="none">
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};
