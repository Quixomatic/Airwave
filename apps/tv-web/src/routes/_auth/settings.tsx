import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { setToken } from "../../lib/auth-client";

/** /settings — sign out + re-run the capability diagnostic. Minimal for now. */
export const Route = createFileRoute("/_auth/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  const navigate = useNavigate();
  const items = [
    { label: "Run capability diagnostic", action: () => void navigate({ to: "/diagnostic" }) },
    {
      label: "Sign out",
      action: () => {
        setToken(null);
        void navigate({ to: "/login" });
      },
    },
    { label: "Back to guide", action: () => void navigate({ to: "/" }) },
  ];
  const [focus, setFocus] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // webOS Back arrives as keyCode 461 (disableBackHistoryAPI) → return to the guide.
      if (e.keyCode === 461 || ["Backspace", "GoBack", "BrowserBack", "XF86Back"].includes(e.key)) {
        e.preventDefault();
        void navigate({ to: "/" });
        return;
      }
      switch (e.key) {
        case "ArrowDown": e.preventDefault(); setFocus((f) => Math.min(items.length - 1, f + 1)); break;
        case "ArrowUp": e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); break;
        case "Enter": e.preventDefault(); items[focus]!.action(); break;
        default: break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#060a14", color: "#f1f5f9" }} className="flex flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-semibold">Settings</h1>
      <div className="flex w-full max-w-md flex-col gap-3">
        {items.map((it, i) => (
          <button
            key={it.label}
            onClick={() => { setFocus(i); it.action(); }}
            onMouseEnter={() => setFocus(i)}
            className="rounded-xl border px-6 py-5 text-left text-xl font-medium transition"
            style={{
              borderColor: i === focus ? "#3b82f6" : "rgba(148,163,184,0.14)",
              background: i === focus ? "rgba(59,130,246,0.10)" : "transparent",
              boxShadow: i === focus ? "0 0 0 2px rgba(59,130,246,0.4)" : "none",
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}
