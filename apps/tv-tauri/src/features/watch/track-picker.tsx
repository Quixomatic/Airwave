import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { LAYER, useKeyLayer } from "../../lib/input";

/**
 * The audio / subtitle / quality picker for tv-tauri — the tv-web/tv-native dialog style (blurred dark card,
 * a leading check on the current row, an accent focus row) but presented like this app's channel-number
 * entry: a **top-center slide-in** dropping below the custom window titlebar, over a faint dim. Replaces the
 * old base-ui dropdowns so the three menus read the same on every client, sized for a desktop window (not
 * 10-foot). Rendered through a portal to <body> so the FeaturePanel's slide-up transform doesn't offset it,
 * and it owns the keys at LAYER.MODAL (above the panel's CHROME layer) while open: up/down move, OK selects
 * and closes, Back cancels. Mouse hover moves the focus row; click selects; a click on the dim dismisses.
 * Opens focused on the current selection.
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

  // Focus the current selection whenever the picker (re)opens or switches menu.
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

  // Owns the keys while open (MODAL > the panel's CHROME > number entry's OVERLAY). Traps everything so
  // nothing leaks to the panel or the global number-entry buffer.
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

  return createPortal(
    <AnimatePresence>
      {open && (
        // Faint dim + full-screen click-catcher (mouse dismiss); the card slides down from top-center.
        <motion.div
          key="track-picker"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 400,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            background: "rgba(4,6,12,0.35)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            style={{
              // Drop below the custom window titlebar, exactly like the channel-number-entry pill.
              marginTop: "calc(var(--titlebar-h) + 14px)",
              width: 400,
              maxWidth: "92%",
              borderRadius: 18,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(15,21,35,0.72)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: "0 20px 44px rgba(0,0,0,0.5)",
              paddingBottom: 5,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.6)",
                padding: "18px 22px 10px",
              }}
            >
              {title}
            </div>
            <div className="track-picker-list" style={{ maxHeight: "52vh", overflowY: "auto", padding: "0 11px 5px" }} role="listbox">
              {items.length === 0 && (
                <div style={{ color: "#94a3b8", fontSize: 14, padding: "18px 0", textAlign: "center" }}>
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
                      gap: 11,
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      outline: "none",
                      cursor: "pointer",
                      borderRadius: 11,
                      margin: "2px 0",
                      padding: "11px 14px",
                      background: isFocus ? accent : isSel ? `${accent}29` : "transparent",
                    }}
                  >
                    <span style={{ width: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isSel && <Check size={17} color={isFocus ? "#04060c" : accent} />}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 15,
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
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "8px 22px 6px" }}>
              OK to select · Back to cancel
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
