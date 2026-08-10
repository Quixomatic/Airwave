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

export default function AudioSettings() {
  const mode = useAudioMode();

  const { sel } = useSettingsPage(OPTIONS.length, (i) => setAudioMode(OPTIONS[i]!.mode));

  return (
    <View>
      <PageHeader title="Audio" subtitle="How this device sends audio to your TV or receiver." />

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
