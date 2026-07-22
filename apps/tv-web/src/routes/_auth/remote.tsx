import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";

import { LAYER, useKeyLayer } from "../../lib/input";

/**
 * /remote — a remote-key probe (reachable from Settings, like /diagnostic). Press any button on
 * the remote and it shows the raw key event that fired — `keyCode` above all, since that's how
 * webOS surfaces its special keys (Back = 461, and the still-unknown CH▲/▼ / color / etc.). This
 * is the tool that unblocks the remote-channel-navigation arc: we can't guess the C2's CH keycodes
 * (the desktop sim won't tell us), so we read them off the real panel here.
 *
 * It swallows every key (preventDefault + stopPropagation) so nothing navigates away while probing;
 * to LEAVE, double-press Back (each press is still logged), or click Exit with the magic-remote
 * pointer.
 */
export const Route = createFileRoute("/_auth/remote")({
  component: RemoteProbeRoute,
});

type KeyEntry = {
  seq: number;
  type: "keydown" | "keyup";
  key: string;
  code: string;
  keyCode: number;
  which: number;
  location: number;
  repeat: boolean;
};

const MAX_ROWS = 60;

function RemoteProbeRoute() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<KeyEntry[]>([]);
  const seqRef = useRef(0);
  const lastBackRef = useRef(0);

  const exit = useCallback(() => void navigate({ to: "/settings" }), [navigate]);

  const push = useCallback((e: KeyboardEvent, type: "keydown" | "keyup") => {
    seqRef.current += 1;
    const entry: KeyEntry = {
      seq: seqRef.current,
      type,
      key: e.key,
      code: e.code,
      keyCode: e.keyCode,
      which: e.which,
      location: e.location,
      repeat: e.repeat,
    };
    setRows((r) => [entry, ...r].slice(0, MAX_ROWS));
  }, []);

  // MODAL + exclusive: the probe must swallow EVERYTHING so pressing buttons never navigates the
  // app — that's the whole point of the tool. It logs the RAW event (`e.raw`), not our normalized
  // key, because what you're here to inspect is exactly what the device reports.
  //
  // This is the one screen that deliberately has no D-pad navigation: its own Clear/Exit buttons
  // stay pointer-only, because making them focusable would mean not swallowing the keys we're
  // trying to measure. Double-press Back is the keyboard escape hatch.
  useKeyLayer({
    id: "remote-probe",
    priority: LAYER.MODAL,
    mode: "exclusive",
    onKey(e) {
      push(e.raw, "keydown");
      // Exit on a DOUBLE Back (each press is still logged above); a single Back stays so its
      // event is inspectable.
      if (e.key === "back") {
        const now = Date.now();
        if (now - lastBackRef.current < 800) exit();
        else lastBackRef.current = now;
      }
      return true;
    },
    onKeyUp(e) {
      push(e.raw, "keyup");
      return true;
    },
  });

  const last = rows[0];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#060a14", color: "#f1f5f9", display: "flex", flexDirection: "column", padding: 32, gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 700 }}>Remote key probe</h1>
          <div style={{ fontSize: 15, color: "#64748b", marginTop: 4 }}>
            Press any button. Double-press Back to exit.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setRows([])}
            style={{ borderRadius: 10, border: "1px solid rgba(148,163,184,0.2)", background: "transparent", color: "#c3c9d4", padding: "10px 18px", fontSize: 15, cursor: "pointer" }}
          >
            Clear
          </button>
          <button
            onClick={exit}
            style={{ borderRadius: 10, border: "1px solid rgba(59,130,246,0.4)", background: "rgba(59,130,246,0.12)", color: "#dbeafe", padding: "10px 18px", fontSize: 15, cursor: "pointer" }}
          >
            Exit
          </button>
        </div>
      </div>

      {/* Last event — big, keyCode front and center. */}
      <div style={{ borderRadius: 16, border: "1px solid rgba(148,163,184,0.14)", background: "rgba(15,23,42,0.6)", padding: 24, display: "flex", gap: 40, alignItems: "center", minHeight: 132 }}>
        {last ? (
          <>
            <Field label="keyCode" value={String(last.keyCode)} big accent />
            <Field label="key" value={last.key === " " ? "Space" : last.key} big />
            <Field label="code" value={last.code || "—"} />
            <Field label="which" value={String(last.which)} />
            <Field label="type" value={last.type} />
            <Field label="location" value={String(last.location)} />
            <Field label="repeat" value={last.repeat ? "yes" : "no"} />
          </>
        ) : (
          <div style={{ fontSize: 22, color: "#64748b" }}>Waiting for a key…</div>
        )}
      </div>

      {/* Scrolling log, newest first. */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", borderRadius: 16, border: "1px solid rgba(148,163,184,0.14)", background: "rgba(15,23,42,0.35)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "#0b1220", color: "#64748b", textAlign: "left" }}>
              <Th>#</Th><Th>type</Th><Th>keyCode</Th><Th>key</Th><Th>code</Th><Th>which</Th><Th>loc</Th><Th>repeat</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.seq} style={{ borderTop: "1px solid rgba(148,163,184,0.08)", color: r.type === "keydown" ? "#e6eaf1" : "#7c8aa3" }}>
                <Td>{r.seq}</Td>
                <Td>{r.type}</Td>
                <Td style={{ fontWeight: 700, color: r.type === "keydown" ? "#4a9fe0" : "#5b7395" }}>{r.keyCode}</Td>
                <Td>{r.key === " " ? "Space" : r.key}</Td>
                <Td>{r.code || "—"}</Td>
                <Td>{r.which}</Td>
                <Td>{r.location}</Td>
                <Td>{r.repeat ? "yes" : ""}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value, big, accent }: { label: string; value: string; big?: boolean; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 44 : 22, fontWeight: 700, color: accent ? "#4a9fe0" : "#f1f5f9", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th style={{ padding: "10px 16px", fontWeight: 600 }}>{children}</th>
);
const Td = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <td style={{ padding: "8px 16px", ...style }}>{children}</td>
);
