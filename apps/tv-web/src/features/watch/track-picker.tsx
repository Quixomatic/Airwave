import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { LAYER, useKeyLayer } from "../../lib/input";

/**
 * The audio / subtitle / quality picker — a centered, full-screen dialog matching tv-native's picker
 * (a blurred dark card over a dimming backdrop, a title, a scrollable list of rows with a leading check
 * and an accent focus row). It replaces the old base-ui dropdown so the three menus read the same on
 * every client. Rendered through a portal to <body> so the FeaturePanel's slide-up transform doesn't
 * offset it, and it owns the keys at LAYER.MODAL (above the panel's CHROME layer) while open: up/down move
 * the selection, OK selects and closes, Back cancels. Opens focused on the current selection.
 */

export type PickerItem = { value: string; label: string };

export function TrackPicker({
  open,
  title,
  items,
  current,
  accent,
  onValue,
  onClose,
}: {
  open: boolean;
  title: string;
  items: PickerItem[];
  current: string;
  accent: string;
  onValue: (value: string) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState(0);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const apply = (v: string) => {
    onValue(v);
    onClose();
  };

  // Focus the current selection whenever the picker (re)opens.
  useEffect(() => {
    if (!open) return;
    const idx = items.findIndex((it) => it.value === current);
    setSel(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title]);

  // Keep the focused row in view.
  useEffect(() => {
    if (open) rowRefs.current[sel]?.scrollIntoView({ block: "nearest" });
  }, [sel, open]);

  // Owns the keys while open (MODAL > the panel's CHROME). Traps everything so nothing leaks to the panel.
  useKeyLayer({
    id: "track-picker",
    priority: LAYER.MODAL,
    active: open,
    onKey(e) {
      switch (e.key) {
        case "back":
          onClose();
          return true;
        case "up":
          setSel((s) => Math.max(0, s - 1));
          return true;
        case "down":
          setSel((s) => Math.min(items.length - 1, s + 1));
          return true;
        case "ok": {
          const it = items[sel];
          if (it) apply(it.value);
          return true;
        }
      }
      return true; // trap everything else while the picker owns the screen
    },
  });

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
      }}
    >
      {/* Backdrop — click (mouse) dismisses; on the remote, Back closes via the key layer. */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(4,6,12,0.6)" }} />
      <div
        style={{
          position: "relative",
          width: 460,
          maxWidth: "92%",
          borderRadius: 22,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(15,21,35,0.72)",
          backdropFilter: "blur(30px)",
          WebkitBackdropFilter: "blur(30px)",
          boxShadow: "0 20px 44px rgba(0,0,0,0.55)",
          paddingBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.62)",
            padding: "26px 30px 12px",
          }}
        >
          {title}
        </div>
        <div className="track-picker-list" style={{ maxHeight: "56vh", overflowY: "auto", padding: "0 14px 6px" }}>
          {items.length === 0 && (
            <div style={{ color: "#94a3b8", fontSize: 17, padding: "22px 0", textAlign: "center" }}>
              None available
            </div>
          )}
          {items.map((it, i) => {
            const isSel = it.value === current;
            const isFocus = i === sel;
            return (
              <button
                key={it.value}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                onClick={() => apply(it.value)}
                onMouseEnter={() => setSel(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  outline: "none",
                  cursor: "pointer",
                  borderRadius: 14,
                  margin: "3px 0",
                  padding: "15px 18px",
                  background: isFocus ? accent : isSel ? `${accent}29` : "transparent",
                }}
              >
                <span style={{ width: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {isSel && <Check size={20} color={isFocus ? "#04060c" : accent} />}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 18,
                    fontWeight: isFocus || isSel ? 700 : 500,
                    color: isFocus ? "#04060c" : isSel ? accent : "#f1f5f9",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {it.label}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", padding: "10px 30px 8px" }}>
          OK to select · Back to cancel
        </div>
      </div>
    </div>,
    document.body,
  );
}
