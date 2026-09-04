import { continueRender, delayRender, staticFile } from "remotion";

// Load the bundled Inter (Bold) so the wordmark renders deterministically, no network.
// Titles use the system display stack; body/desc fall back to system Inter/ui-sans.
const handle = delayRender("Loading Inter");
try {
  const inter = new FontFace("Inter", `url(${staticFile("fonts/Inter-Bold.ttf")}) format("truetype")`, {
    weight: "700",
    style: "normal",
  });
  inter
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
      continueRender(handle);
    })
    .catch(() => continueRender(handle));
} catch {
  continueRender(handle);
}
