import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { ApiError, plexLink } from "@/lib/api";
import { getServerUrl, setToken } from "@/lib/auth";
import { authClient } from "@/lib/auth-client";

/**
 * Login — the native port of tv-web's device-code login. The Plex device-link flow
 * (`/api/tv/auth/plex/*`) is pure REST and identical to tv-web's, so it ports 1:1. The
 * ChannelGuide code flow (better-auth device authorization) lands in a follow-up.
 */
type Pending = { heading: string; instruction: string; code: string; qrValue: string };

export default function Login() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };
  const reset = (msg: string | null) => {
    stopPolling();
    setPending(null);
    setError(msg);
  };
  useEffect(() => stopPolling, []);

  const startPlex = useCallback(async () => {
    setError(null);
    try {
      const started = await plexLink.start();
      setPending({
        heading: "Log in with Plex",
        instruction: `Go to ${started.verificationUrl} and enter this code, or scan:`,
        code: started.code,
        qrValue: started.verificationUrl,
      });
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await plexLink.poll(started.pinId);
          if (res.status === "ok") {
            stopPolling();
            await setToken(res.token);
            router.replace("/guide");
          } else if (res.status === "expired") {
            reset("That code expired — try again.");
          } else if (res.status === "unregistered") {
            reset(`No ChannelGuide account for ${res.email}. Ask an admin to import you.`);
          }
        } catch {
          /* transient — keep polling */
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    }
  }, [router]);

  // ChannelGuide device code (better-auth deviceAuthorization) — mirrors tv-web's startDevice.
  const startDevice = useCallback(async () => {
    setError(null);
    const { data, error: codeErr } = await authClient().device.code({ client_id: "channelguide-tv" });
    if (codeErr || !data) {
      setError(codeErr?.error_description ?? "Could not start device login.");
      return;
    }
    setPending({
      heading: "Log in with a code",
      instruction: `Go to ${data.verification_uri} and enter this code, or scan:`,
      code: data.user_code,
      qrValue: data.verification_uri_complete ?? data.verification_uri,
    });
    stopPolling();
    pollRef.current = setInterval(async () => {
      const { data: tok, error: tokErr } = await authClient().device.token({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: data.device_code,
        client_id: "channelguide-tv",
      });
      if (tok?.access_token) {
        stopPolling();
        await setToken(tok.access_token);
        router.replace("/guide");
        return;
      }
      if (tokErr?.error === "expired_token" || tokErr?.error === "access_denied") {
        reset("That code expired or was denied — try again.");
      }
    }, (data.interval ?? 5) * 1000);
  }, [router]);

  return (
    <View className="flex-1 items-center justify-center gap-8 bg-bg p-10">
      <View className="items-center">
        <Text className="text-4xl font-bold tracking-tight text-fg">ChannelGuide</Text>
        <Text className="mt-2 text-muted">Sign in to start watching.</Text>
      </View>

      {pending ? (
        <View className="items-center gap-5 rounded-2xl border border-white/10 bg-card/60 p-8">
          <Text className="text-lg font-semibold text-fg">{pending.heading}</Text>
          <Text className="max-w-sm text-center text-muted">{pending.instruction}</Text>
          <View className="rounded-xl bg-white p-3">
            <QRCode value={pending.qrValue} size={168} />
          </View>
          <Text className="font-mono text-5xl font-bold tracking-[8px] text-fg">{pending.code}</Text>
          <Pressable onPress={() => reset(null)} className="rounded-lg px-4 py-2 active:opacity-60">
            <Text className="text-sm text-muted">← Back</Text>
          </Pressable>
        </View>
      ) : (
        <View className="w-full max-w-md gap-4">
          <Pressable
            onPress={startPlex}
            className="items-center rounded-xl bg-amber-500 px-6 py-5 active:opacity-80"
          >
            <Text className="text-xl font-semibold text-black">Log in with Plex</Text>
          </Pressable>
          <Pressable
            onPress={startDevice}
            className="items-center rounded-xl border border-white/15 px-6 py-5 active:opacity-70"
          >
            <Text className="text-xl font-semibold text-fg">Log in with a code</Text>
          </Pressable>
        </View>
      )}

      {error && <Text className="text-red-400">{error}</Text>}
      <Text className="text-xs text-subtle">Server: {getServerUrl() || "not set"}</Text>
    </View>
  );
}
