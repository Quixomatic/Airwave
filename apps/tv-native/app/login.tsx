import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { Logo } from "@/components/logo";

import { ApiError, plexLink } from "@/lib/api";
import { getServerUrl, setToken } from "@/lib/auth";
import { probeConnection } from "@/lib/plex-connection";
import { authClient } from "@/lib/auth-client";
import { cs, scaled } from "@/features/guide/layout";
import { LAYER, useKeyLayer } from "@/lib/input";
import { C } from "@/lib/theme";

/**
 * Login — the native port of tv-web's device-code login. The Plex device-link flow
 * (`/api/tv/auth/plex/*`) is pure REST and identical to tv-web's, so it ports 1:1. The
 * Airwave code flow (better-auth device authorization) lands in a follow-up.
 */
type Pending = { heading: string; instruction: string; code: string; qrValue: string };

export default function Login() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState(0); // D-pad selection (zone machine — the native focus engine never sees the D-pad on Android TV)
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
            void probeConnection(); // pick the reachable Plex connection for this network
            router.replace("/guide");
          } else if (res.status === "expired") {
            reset("That code expired — try again.");
          } else if (res.status === "unregistered") {
            reset(`No Airwave account for ${res.email}. Ask an admin to import you.`);
          }
        } catch {
          /* transient — keep polling */
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    }
  }, [router]);

  // Airwave device code (better-auth deviceAuthorization) — mirrors tv-web's startDevice.
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
        void probeConnection(); // pick the reachable Plex connection for this network
        router.replace("/guide");
        return;
      }
      if (tokErr?.error === "expired_token" || tokErr?.error === "access_denied") {
        reset("That code expired or was denied — try again.");
      }
    }, (data.interval ?? 5) * 1000);
  }, [router]);

  // D-pad zone machine. On Android TV our native key module consumes the D-pad and routes it here
  // (the native focus engine never sees it), so — like every other screen — we drive selection
  // ourselves: ▲/▼ move between the buttons, OK activates, Back exits the code view.
  const count = pending ? 1 : 2; // pending view = just the Back button
  useEffect(() => setSel(0), [pending]); // reset selection when the view switches
  useKeyLayer({
    id: "login",
    priority: LAYER.BASE,
    onKey(e) {
      if (e.key === "up") return setSel((s) => Math.max(0, s - 1)), true;
      if (e.key === "down") return setSel((s) => Math.min(count - 1, s + 1)), true;
      if (e.key === "ok") {
        if (pending) reset(null);
        else if (sel === 0) void startPlex();
        else void startDevice();
        return true;
      }
      if (e.key === "back" && pending) {
        reset(null);
        return true;
      }
      return false;
    },
  });

  return (
    <View className="flex-1 items-center justify-center bg-bg" style={scaled({ gap: 32, padding: 40 })}>
      <View className="items-center">
        <Logo width={100} wordmark />
        <Text className="text-muted" style={scaled({ marginTop: 8 })}>Sign in to start watching.</Text>
      </View>

      {pending ? (
        // Two columns (16:9 has width to spare, height is tight): text + Back on the left, a vertical
        // separator, then the QR + code on the right.
        <View className="flex-row items-center border border-white/10 bg-card/60" style={scaled({ padding: 32, borderRadius: 16 })}>
          <View className="max-w-sm" style={scaled({ gap: 16, paddingRight: 32 })}>
            <Text className="font-semibold text-fg" style={scaled({ fontSize: 24 })}>{pending.heading}</Text>
            <Text className="text-muted" style={scaled({ fontSize: 17, lineHeight: 25 })}>{pending.instruction}</Text>
            <Pressable
              onPress={() => reset(null)}
              className="self-start rounded-lg px-4 py-2 active:opacity-60"
              style={{ borderWidth: 2, borderColor: sel === 0 ? "#fff" : "transparent" }}
            >
              <Text className="text-muted" style={scaled({ fontSize: 15 })}>← Back</Text>
            </Pressable>
          </View>

          <View className="self-stretch bg-white/10" style={{ width: 1 }} />

          <View className="items-center" style={scaled({ gap: 16, paddingLeft: 32 })}>
            <View className="bg-white" style={scaled({ padding: 12, borderRadius: 12 })}>
              <QRCode value={pending.qrValue} size={cs(190)} />
            </View>
            <Text className="font-mono font-bold text-fg" style={scaled({ fontSize: 40, letterSpacing: 6 })}>{pending.code}</Text>
          </View>
        </View>
      ) : (
        <View className="w-full max-w-md gap-4">
          <Pressable
            onPress={startPlex}
            className="items-center rounded-xl bg-amber-500 px-6 py-5 active:opacity-80"
            style={{ borderWidth: 3, borderColor: sel === 0 ? "#fff" : "transparent" }}
          >
            <Text className="text-xl font-semibold text-black">Log in with Plex</Text>
          </Pressable>
          <Pressable
            onPress={startDevice}
            className="items-center rounded-xl px-6 py-5 active:opacity-70"
            style={{ borderWidth: 2, borderColor: sel === 1 ? C.accent : "rgba(255,255,255,0.15)" }}
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
