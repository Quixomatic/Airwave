import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { Logo } from "@/components/logo";

import { checkHealth } from "@/lib/api";
import { normalizeServerUrl, setServerUrl } from "@/lib/auth";
import { LAYER, useKeyLayer } from "@/lib/input";
import { scanForServers } from "@/lib/server-scan";
import { C } from "@/lib/theme";

/**
 * First-launch onboarding — the native port of tv-web's `ServerSetup`. Point the app at a
 * self-hosted ChannelGuide server: scan the LAN or type the address, validate against `/api/health`,
 * store it, and continue to login. Touch-first for iPad; TV D-pad focus comes with the TV targets
 * (the native focus engine handles it — no hand-rolled dispatcher like webOS needed).
 */
export default function Setup() {
  const router = useRouter();
  const [url, setUrl] = useState("http://");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [progress, setProgress] = useState(0);
  const [found, setFound] = useState<string[]>([]);
  const [sel, setSel] = useState(0); // D-pad selection (zone machine — native focus is starved by our key capture)
  const inputRef = useRef<TextInput>(null);

  const save = async (target: string) => {
    await setServerUrl(target);
    router.replace("/login");
  };

  const connect = async () => {
    const target = normalizeServerUrl(url);
    if (!target) {
      setError("Enter your server's address.");
      return;
    }
    setChecking(true);
    setError(null);
    const ok = await checkHealth(target);
    if (ok) {
      await save(target);
    } else {
      setChecking(false);
      setError("Couldn't reach that address — check it, and that the server is running.");
    }
  };

  const runScan = async () => {
    setScanning(true);
    setScanned(false);
    setFound([]);
    setProgress(0);
    setError(null);
    const results = await scanForServers(setProgress);
    setFound(results);
    setScanning(false);
    setScanned(true);
  };

  // D-pad zone machine. The native focus engine never sees the D-pad on Android TV (our key module
  // consumes it), so we drive selection: the address field, Connect, then whatever scan control is
  // currently shown (Scan / found servers / Scan again). OK on the field opens the keyboard.
  const items = useMemo(() => {
    const list: { key: string; run: () => void }[] = [
      { key: "input", run: () => inputRef.current?.focus() },
      { key: "connect", run: () => void connect() },
    ];
    if (!scanning) {
      if (scanned) {
        for (const s of found) list.push({ key: `srv:${s}`, run: () => void save(s) });
        list.push({ key: "scanagain", run: () => void runScan() });
      } else {
        list.push({ key: "scan", run: () => void runScan() });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, scanned, found]);
  const cur = items[sel]?.key;
  useEffect(() => setSel((s) => Math.min(s, items.length - 1)), [items.length]);
  useKeyLayer({
    id: "setup",
    priority: LAYER.BASE,
    onKey(e) {
      if (e.key === "up") return setSel((s) => Math.max(0, s - 1)), true;
      if (e.key === "down") return setSel((s) => Math.min(items.length - 1, s + 1)), true;
      if (e.key === "ok") {
        items[sel]?.run();
        return true;
      }
      return false;
    },
  });

  return (
    <View className="flex-1 items-center justify-center bg-bg p-10">
      <View className="w-full max-w-xl">
        <View className="mb-8 items-center">
          <Logo width={100} wordmark />
          <Text className="mt-5 text-3xl font-extrabold tracking-tight text-fg">Connect to your server</Text>
          <Text className="mt-2 text-center text-base leading-6 text-muted">
            Scan your network, or enter the address of your ChannelGuide server — a local IP like{" "}
            <Text className="font-mono text-[#c3c9d4]">192.168.1.50:3000</Text>, or a domain.
          </Text>
        </View>

        <TextInput
          ref={inputRef}
          value={url}
          onChangeText={setUrl}
          onSubmitEditing={() => void connect()}
          placeholder="http://192.168.1.50:3000"
          placeholderTextColor={C.subtleFg}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          editable={!checking}
          keyboardType="url"
          className="rounded-2xl bg-card px-5 py-4 text-center text-2xl text-fg"
          style={{ borderWidth: 2, borderColor: cur === "input" ? C.accent : error ? "#f87171" : "rgba(148,163,184,0.25)" }}
        />

        <Pressable
          onPress={() => void connect()}
          disabled={checking}
          className="mt-4 items-center rounded-2xl bg-accent px-6 py-4 active:opacity-80"
          style={{ opacity: checking ? 0.6 : 1, borderWidth: 3, borderColor: cur === "connect" ? "#fff" : "transparent" }}
        >
          <Text className="text-xl font-bold text-[#04060c]">{checking ? "Connecting…" : "Connect"}</Text>
        </Pressable>

        <View className="mt-3 h-6 items-center">
          {error && <Text className="text-base text-red-400">{error}</Text>}
        </View>

        {/* Divider */}
        <View className="my-3 flex-row items-center gap-3">
          <View className="h-px flex-1 bg-white/10" />
          <Text className="text-xs text-subtle">OR</Text>
          <View className="h-px flex-1 bg-white/10" />
        </View>

        {scanning ? (
          <View>
            <View className="h-2 overflow-hidden rounded-full bg-white/15">
              <View className="h-full rounded-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
            </View>
            <Text className="mt-2 text-center text-muted">Scanning your network… {Math.round(progress * 100)}%</Text>
          </View>
        ) : scanned ? (
          <View className="gap-2.5">
            {found.length > 0 ? (
              <>
                <Text className="text-center text-sm text-muted">Found on your network</Text>
                {found.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => void save(s)}
                    className="items-center rounded-xl bg-card px-5 py-3.5 active:opacity-70"
                    style={{ borderWidth: 2, borderColor: cur === `srv:${s}` ? C.accent : "rgba(255,255,255,0.2)" }}
                  >
                    <Text className="font-mono text-lg text-fg">{s}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => void runScan()} className="mt-1 items-center rounded-xl px-6 py-3 active:opacity-70" style={{ borderWidth: 2, borderColor: cur === "scanagain" ? C.accent : "rgba(255,255,255,0.2)" }}>
                  <Text className="font-semibold text-fg">Scan again</Text>
                </Pressable>
              </>
            ) : (
              <View className="items-center gap-3">
                <Text className="text-center text-muted">No servers found automatically — enter the address above.</Text>
                <Pressable onPress={() => void runScan()} className="items-center rounded-xl px-6 py-3 active:opacity-70" style={{ borderWidth: 2, borderColor: cur === "scanagain" ? C.accent : "rgba(255,255,255,0.2)" }}>
                  <Text className="font-semibold text-fg">Scan again</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <Pressable onPress={() => void runScan()} className="items-center rounded-xl px-6 py-3.5 active:opacity-70" style={{ borderWidth: 2, borderColor: cur === "scan" ? C.accent : "rgba(255,255,255,0.2)" }}>
            <Text className="font-semibold text-fg">Scan for servers on my network</Text>
          </Pressable>
        )}
      </View>

      {checking && (
        <View className="absolute bottom-10">
          <ActivityIndicator color={C.accent} />
        </View>
      )}
    </View>
  );
}
