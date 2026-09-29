import type { ComponentType } from "react";
import { FaWindows } from "react-icons/fa";
import { SiAndroid, SiApple, SiGooglechrome, SiLg, SiRoku, SiSamsung } from "react-icons/si";
import { Globe, Monitor } from "lucide-react";

/**
 * Map a watch session's device to a brand logo + a human label for the Sessions page.
 *
 * `platform` is the reliable signal (populated on every TvDevice row); `model` refines it (the real panel
 * model for a TV, the stick name for Roku); the user-agent only helps the browser family. A Samsung Tizen TV
 * still reports `platform: "browser"` until the tv-web client learns the `tizen` bucket, so we also sniff the
 * UA for Tizen here as an interim so it shows as Samsung rather than a generic browser.
 */
type SessionDevice = {
  platform?: string | null;
  model?: string | null;
  isTV?: boolean | null;
  userAgent?: string | null;
};

type Brand = { Icon: ComponentType<{ className?: string }>; label: string };

export function deviceBrand(d: SessionDevice | null | undefined): Brand {
  if (!d) return { Icon: Monitor, label: "Unknown" };
  const model = d.model?.trim() || null;

  switch (d.platform) {
    case "webos":
      return { Icon: SiLg, label: model && !/simulator/i.test(model) ? `LG ${model}` : "LG webOS" };
    case "tizen":
      return { Icon: SiSamsung, label: model ? `Samsung ${model}` : "Samsung TV" };
    case "roku":
      return { Icon: SiRoku, label: model ? `Roku ${model}` : "Roku" };
    case "ios":
      return { Icon: SiApple, label: d.isTV ? "Apple TV" : "Apple device" };
    case "android":
      return { Icon: SiAndroid, label: d.isTV ? "Android TV" : "Android device" };
    case "windows":
      return { Icon: FaWindows, label: "Windows" };
    case "browser": {
      // Interim: a Samsung Tizen TV is still bucketed as a browser until the client reports `tizen`.
      if (/tizen|smart-?tv/i.test(d.userAgent ?? "")) return { Icon: SiSamsung, label: "Samsung TV" };
      const name = browserName(d.userAgent);
      return { Icon: name === "Chrome" ? SiGooglechrome : Globe, label: name ?? "Browser" };
    }
    default:
      return { Icon: Monitor, label: model ?? d.platform ?? "Unknown" };
  }
}

function browserName(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (/edg\//i.test(ua)) return "Edge";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/chrome/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari";
  return "Browser";
}
