import { type AudioOutputInfo, mpvAudio } from "@airwave/mpv-player";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { scaled } from "@/features/guide/layout";
import { PageHeader, Pill, SectionLabel, SettingRow, useSettingsPage } from "@/features/settings/settings-ui";
import { type AudioMode, setAudioMode, useAudioMode } from "@/lib/audio-pref";

/**
 * /settings/audio — how this device sends audio to your TV / receiver. The native player (mpv) decodes
 * everything; this only chooses the OUTPUT channel layout (mpv `audio-channels`). Multichannel sends real
 * 5.1/7.1 LPCM to a capable AVR/soundbar; Stereo folds everything down to two channels. A per-device pref
 * (see `lib/audio-pref.ts`) — changing it reloads the current program at the same spot.
 */
const OPTIONS: { mode: AudioMode; label: string; sublabel: string }[] = [
  {
    mode: "auto",
    label: "Multichannel (recommended)",
    sublabel: "Send surround (5.1 / 7.1) to a receiver or soundbar that supports it. Stereo content stays stereo; on plain TV speakers it folds down automatically.",
  },
  {
    mode: "stereo",
    label: "Stereo",
    sublabel: "Always fold surround down to two channels. Use this for plain TV speakers, or if a receiver mishandles multichannel and dialogue sounds wrong.",
  },
];

/** "6 channels" → "5.1", etc. — a friendly label for a raw output channel count. */
function channelLabel(n: number): string {
  if (n >= 8) return "7.1";
  if (n >= 6) return "5.1";
  if (n === 2) return "Stereo";
  if (n === 1) return "Mono";
  return `${n} channels`;
}

export default function AudioSettings() {
  const mode = useAudioMode();

  // Live probe of what the current output route advertises — NOT a cached diagnostic (it changes when a
  // soundbar/receiver is plugged in or switched). If maxChannels ≥ 6 in Multichannel mode, real surround
  // is reaching the sink; if it reports 2 (stereo), that's why there's no surround.
  const [out, setOut] = useState<AudioOutputInfo | null>(null);
  useEffect(() => {
    let alive = true;
    mpvAudio.getOutputInfo().then((info) => { if (alive) setOut(info); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const { sel } = useSettingsPage(OPTIONS.length, (i) => setAudioMode(OPTIONS[i]!.mode));

  return (
    <View>
      <PageHeader title="Audio" subtitle="How this device sends audio to your TV or receiver." />

      {out && out.maxChannels > 0 && (
        <View style={scaled({ flexDirection: "row", flexWrap: "wrap", gap: 28, paddingVertical: 16, paddingHorizontal: 22, borderRadius: 14, backgroundColor: "rgba(148,163,184,0.06)", marginBottom: 8 })}>
          <Info label="Detected output" value={out.routeName || out.routeType || "Output"} />
          <Info label="Supports" value={`${channelLabel(out.maxChannels)} (${out.maxChannels} ch)`} />
          {out.currentChannels > 0 && <Info label="Now playing" value={channelLabel(out.currentChannels)} />}
        </View>
      )}

      <SectionLabel>Audio output</SectionLabel>
      {OPTIONS.map((o, i) => (
        <SettingRow
          key={o.mode}
          label={o.label}
          sublabel={o.sublabel}
          focused={sel === i}
          onPress={() => setAudioMode(o.mode)}
          right={mode === o.mode ? <Pill tone="accent">Selected</Pill> : undefined}
        />
      ))}

      <Text style={scaled({ marginTop: 22, fontSize: 14, lineHeight: 21, color: "#64748b", maxWidth: 640 })}>
        The player streams directly from your server and decodes the audio on-device — this setting only
        changes the speaker layout it outputs, so switching it never forces a transcode or breaks a track.
      </Text>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 0 }}>
      <Text style={scaled({ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", marginBottom: 3 })}>{label}</Text>
      <Text style={scaled({ fontSize: 17, fontWeight: "600", color: "#f1f5f9" })}>{value}</Text>
    </View>
  );
}
