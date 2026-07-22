import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { LAYER, useKeyLayer } from "../../lib/input";
import { usePlayer } from "./player-ctx";
import { useChannelNav } from "./use-channel-nav";

/**
 * Global channel-number entry (§7.2). Anywhere on the guide / full-screen player / mini feed
 * (all live on the "/" route), typing a digit arms a channel-number buffer shown in a top-right
 * slide-in; **OK** (and only OK — a toddler mashing digits must never tune on its own) commits it,
 * tuning the channel full-screen if it exists, or flashing red briefly if it doesn't. An arrow key
 * breaks out and passes through to normal navigation; Back breaks out and is consumed; and a stretch
 * of inactivity quietly dismisses the buffer WITHOUT tuning (never a commit).
 *
 * Rendered once by PlayerProvider (always mounted, above the router) so it's armed globally. It
 * captures keys in the capture phase and only consumes what it uses — digits while armed, and
 * OK/Back/arrows while a buffer is active — so the guide's and player's own key handlers are
 * untouched otherwise. Guards off text inputs and open dropdown menus.
 */

const DISMISS_MS = 6000; // inactivity → clear the buffer (never commits)
const FLASH_MS = 950; // how long an invalid number flashes red before clearing
const menuOpen = () => !!document.querySelector('[role="menu"],[role="listbox"]');
const inputFocused = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

export function ChannelNumberEntry() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { byNumber, maxNumber, tune } = useChannelNav();
  const { channelStep } = usePlayer();

  const [buffer, setBuffer] = useState("");
  const [flash, setFlash] = useState(false);
  const bufferRef = useRef("");
  const dismissTimer = useRef(0);
  const flashTimer = useRef(0);

  const maxDigits = Math.max(1, String(maxNumber || 0).length);

  const setBuf = (v: string) => {
    bufferRef.current = v;
    setBuffer(v);
  };
  const clearDismiss = () => window.clearTimeout(dismissTimer.current);
  const clearFlash = () => window.clearTimeout(flashTimer.current);
  const cancel = () => {
    clearDismiss();
    clearFlash();
    setFlash(false);
    setBuf("");
  };
  const armDismiss = () => {
    clearDismiss();
    dismissTimer.current = window.setTimeout(cancel, DISMISS_MS);
  };
  const append = (d: string) => {
    if (bufferRef.current.length >= maxDigits) return; // ignore digits past the widest channel number
    clearFlash();
    setFlash(false);
    setBuf(bufferRef.current + d);
    armDismiss();
  };
  const commit = () => {
    clearDismiss();
    const n = parseInt(bufferRef.current, 10);
    const ch = Number.isFinite(n) ? byNumber(n) : null;
    if (ch) {
      setBuf("");
      tune(ch.id); // tune() takes it full-screen
    } else {
      // No such channel — flash the number red briefly, then clear. Never tunes.
      setFlash(true);
      flashTimer.current = window.setTimeout(() => {
        setFlash(false);
        setBuf("");
      }, FLASH_MS);
    }
  };

  // OVERLAY: above the guide and the player chrome, so OK/Back reach ONLY number entry while a
  // number is part-typed — no ref handshake needed, since those layers simply aren't consulted.
  // Channel surf sits ABOVE this (MODAL) and swallows everything, which is what used to be the
  // `surfActiveRef` early-return here.
  useKeyLayer({
    id: "number-entry",
    priority: LAYER.OVERLAY,
    onKey(e) {
      // Armed only while browsing/watching (the "/" route covers guide + full player + mini), and
      // never while a dropdown menu or a text field owns the keys.
      if (pathname !== "/" || menuOpen() || inputFocused()) return false;

      // CH▲/▼: step one channel (clamped, in-flight-locked in the provider). Abandons any
      // in-progress number entry first.
      if (e.key === "chUp" || e.key === "chDown") {
        if (bufferRef.current.length > 0) cancel();
        channelStep(e.key === "chUp" ? 1 : -1);
        return true;
      }

      if (e.key === "digit" && e.digit != null) {
        append(String(e.digit));
        return true;
      }

      if (bufferRef.current.length === 0) return false; // below only applies mid-entry

      if (e.key === "ok") {
        commit();
        return true;
      }
      // Back breaks out and is CONSUMED (peels the overlay like other overlays; a second Back then
      // does its normal thing).
      if (e.key === "back") {
        cancel();
        return true;
      }
      // An arrow breaks out but PASSES THROUGH — you changed your mind and want to navigate.
      if (e.key === "up" || e.key === "down" || e.key === "left" || e.key === "right") {
        cancel();
        return false;
      }
      return false;
    },
  });

  useEffect(() => {
    return () => {
      clearDismiss();
      clearFlash();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pad = "_".repeat(Math.max(0, maxDigits - buffer.length));

  return (
    <AnimatePresence>
      {(buffer.length > 0 || flash) && (
        <motion.div
          key="channel-number-entry"
          initial={{ opacity: 0, y: -30, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -30, x: "-50%" }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{
            // Top-CENTER, dropped the same 28px the full-chrome channel pill is (consistent height
            // from the top edge). `x: -50%` stays constant while `y` animates the slide.
            position: "fixed",
            top: 28,
            left: "50%",
            zIndex: 70,
            pointerEvents: "none",
            minWidth: 220,
            padding: "16px 34px",
            borderRadius: 18,
            // Same glass treatment as the full-chrome channel pill (small element → backdrop-blur is
            // cheap here, unlike a full-screen scrim). Border goes red on an invalid number.
            background: "rgba(18,24,38,0.55)",
            border: `1px solid ${flash ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.12)"}`,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: flash ? "#fca5a5" : "rgba(255,255,255,0.85)" }}>
            Channel
          </div>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, fontVariantNumeric: "tabular-nums", color: flash ? "#ef4444" : "#fff" }}>
            {buffer}
            <span style={{ color: "rgba(255,255,255,0.3)" }}>{pad}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: flash ? "#fca5a5" : "rgba(255,255,255,0.8)", marginTop: 2 }}>
            {flash ? `No channel ${buffer}` : "OK to watch · Back to cancel"}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
