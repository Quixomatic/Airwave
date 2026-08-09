import { Button } from "@airwave/ui/components/button";
import { Input } from "@airwave/ui/components/input";
import { Label } from "@airwave/ui/components/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@airwave/ui/components/select";
import { Switch } from "@airwave/ui/components/switch";
import { Filter, Plus, X } from "lucide-react";
import { useState } from "react";

import { FilterBuilder, type FilterGroup, emptyGroup, normalizeFilter } from "./filter-builder";

// The engine strategy shape (mirrors ChannelStrategy in api/services/schedule/timeline.ts + the router Zod).
// `filter` is the UI FilterGroup (a FilterNode the engine evaluates locally); React-only ids are stripped by
// the router's schema on save.
export type StrategyRun = number | [number, number] | "all" | { minutes: [number, number] };
export type StrategyRule = { scope: "show" | "movie" | "collection"; run?: StrategyRun; filter?: FilterGroup };
export type ChannelStrategy = {
  rotation: "clustered" | "round_robin";
  rotationOrder?: "shuffle" | "cycle";
  grouping: StrategyRule[];
  constraints?: { noRepeatWithin?: { minutes?: number; count?: number } };
};

const SCOPE_LABEL: Record<StrategyRule["scope"], string> = {
  show: "Each show",
  movie: "Movies",
  collection: "Filtered set",
};

const defaultStrategy = (): ChannelStrategy => ({
  rotation: "round_robin",
  rotationOrder: "shuffle",
  grouping: [{ scope: "show", run: [2, 3] }],
});

// ── run <-> UI mode ───────────────────────────────────────────────────────────

type RunMode = "one" | "block" | "all" | "minutes";
function runMode(run: StrategyRun | undefined): RunMode {
  if (run === "all") return "all";
  if (Array.isArray(run)) return "block";
  if (run && typeof run === "object" && "minutes" in run) return "minutes";
  return typeof run === "number" && run > 1 ? "block" : "one";
}
function runRange(run: StrategyRun | undefined): [number, number] {
  if (Array.isArray(run)) return run;
  if (run && typeof run === "object" && "minutes" in run) return run.minutes;
  if (typeof run === "number") return [run, run];
  return [2, 3];
}
function makeRun(mode: RunMode, [min, max]: [number, number]): StrategyRun {
  if (mode === "one") return 1;
  if (mode === "all") return "all";
  if (mode === "minutes") return { minutes: [min, max] };
  return [min, max];
}

function describeRun(run: StrategyRun | undefined): string {
  const mode = runMode(run);
  const [a, b] = runRange(run);
  if (mode === "all") return "the whole run";
  if (mode === "one") return "one at a time";
  if (mode === "minutes") return a === b ? `~${a} min blocks` : `~${a}–${b} min blocks`;
  return a === b ? `${a} at a time` : `${a}–${b} at a time`;
}
function describeRule(rule: StrategyRule, rotation: ChannelStrategy["rotation"]): string {
  const verb = rotation === "clustered" ? "Play" : "Rotate";
  const scope = rule.scope === "show" ? "across shows" : rule.scope === "movie" ? "movies" : "the filtered set";
  const filtered = rule.filter && rule.filter.children.length > 0 ? " (filtered)" : "";
  return `${verb} ${scope}, ${describeRun(rule.run)}${filtered}`;
}

// ── component ─────────────────────────────────────────────────────────────────

export function StrategyEditor({
  value,
  onChange,
  mediaSourceId,
  mediaTypes,
}: {
  value: ChannelStrategy | null;
  onChange: (s: ChannelStrategy | null) => void;
  mediaSourceId: string;
  mediaTypes: ("movie" | "show")[];
}) {
  const noRepeat = value?.constraints?.noRepeatWithin;
  const noRepeatMode: "off" | "minutes" | "count" = noRepeat?.minutes != null
    ? "minutes"
    : noRepeat?.count != null
      ? "count"
      : "off";

  const setStrategy = (patch: Partial<ChannelStrategy>) => value && onChange({ ...value, ...patch });
  const setRule = (idx: number, rule: StrategyRule) =>
    value && onChange({ ...value, grouping: value.grouping.map((r, i) => (i === idx ? rule : r)) });

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={!!value} onCheckedChange={(v) => onChange(v === true ? defaultStrategy() : null)} />
        Group &amp; rotate this channel&rsquo;s content
      </label>
      <p className="text-muted-foreground text-xs">
        Off plays in the order set above. On clusters or rotates content by show, movies, or a filter — the
        ordering above still decides episode order within each block.
      </p>

      {value && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="srot">Rotation</Label>
              <Select
                value={value.rotation}
                onValueChange={(v) => setStrategy({ rotation: (v ?? "round_robin") as ChannelStrategy["rotation"] })}
              >
                <SelectTrigger id="srot" className="w-full">
                  <SelectValue>{(v) => (v === "clustered" ? "Marathon each group" : "Rotate between groups")}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="round_robin">Rotate between groups</SelectItem>
                  <SelectItem value="clustered">Marathon each group</SelectItem>
                </SelectPopup>
              </Select>
            </div>
            {value.rotation === "round_robin" && (
              <div className="space-y-2">
                <Label htmlFor="sord">Order</Label>
                <Select
                  value={value.rotationOrder ?? "shuffle"}
                  onValueChange={(v) => setStrategy({ rotationOrder: (v ?? "shuffle") as "shuffle" | "cycle" })}
                >
                  <SelectTrigger id="sord" className="w-full">
                    <SelectValue>{(v) => (v === "cycle" ? "Fixed cycle" : "Varied")}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="shuffle">Varied</SelectItem>
                    <SelectItem value="cycle">Fixed cycle</SelectItem>
                  </SelectPopup>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Grouping rules</Label>
            <div className="space-y-2">
              {value.grouping.map((rule, idx) => (
                <RuleEditor
                  // eslint-disable-next-line react/no-array-index-key
                  key={idx}
                  rule={rule}
                  rotation={value.rotation}
                  onChange={(r) => setRule(idx, r)}
                  onRemove={() =>
                    onChange({ ...value, grouping: value.grouping.filter((_, i) => i !== idx) })
                  }
                  canRemove={value.grouping.length > 1}
                  mediaSourceId={mediaSourceId}
                  mediaTypes={mediaTypes}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ ...value, grouping: [...value.grouping, { scope: "show", run: [2, 3] }] })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Rule
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="snorepeat">Don&rsquo;t repeat a show</Label>
            <div className="flex items-center gap-2">
              <Select
                value={noRepeatMode}
                onValueChange={(v) => {
                  const m = (v ?? "off") as "off" | "minutes" | "count";
                  if (m === "off") return setStrategy({ constraints: undefined });
                  const n = m === "minutes" ? (noRepeat?.minutes ?? 60) : (noRepeat?.count ?? 5);
                  setStrategy({ constraints: { noRepeatWithin: m === "minutes" ? { minutes: n } : { count: n } } });
                }}
              >
                <SelectTrigger id="snorepeat" className="w-52">
                  <SelectValue>
                    {(v) => (v === "minutes" ? "Within N minutes" : v === "count" ? "Within N shows" : "No limit")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="off">No limit</SelectItem>
                  <SelectItem value="minutes">Within N minutes</SelectItem>
                  <SelectItem value="count">Within N shows</SelectItem>
                </SelectPopup>
              </Select>
              {noRepeatMode !== "off" && (
                <Input
                  type="number"
                  min={1}
                  className="h-8 w-20"
                  value={String(noRepeatMode === "minutes" ? (noRepeat?.minutes ?? 60) : (noRepeat?.count ?? 5))}
                  onChange={(e) => {
                    const n = Math.max(1, Math.round(Number(e.target.value) || 0));
                    setStrategy({
                      constraints: { noRepeatWithin: noRepeatMode === "minutes" ? { minutes: n } : { count: n } },
                    });
                  }}
                />
              )}
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            Strategy changes take effect the next time this channel&rsquo;s schedule is built — use{" "}
            <span className="font-medium">Generate schedule</span> below to apply now.
          </p>
        </>
      )}
    </div>
  );
}

function RuleEditor({
  rule,
  rotation,
  onChange,
  onRemove,
  canRemove,
  mediaSourceId,
  mediaTypes,
}: {
  rule: StrategyRule;
  rotation: ChannelStrategy["rotation"];
  onChange: (r: StrategyRule) => void;
  onRemove: () => void;
  canRemove: boolean;
  mediaSourceId: string;
  mediaTypes: ("movie" | "show")[];
}) {
  const [showFilter, setShowFilter] = useState(
    !!rule.filter && rule.filter.children.length > 0,
  );
  const mode = runMode(rule.run);
  const [min, max] = runRange(rule.run);
  const setRun = (m: RunMode, range: [number, number]) => onChange({ ...rule, run: makeRun(m, range) });

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Select
          value={rule.scope}
          onValueChange={(v) => onChange({ ...rule, scope: (v ?? "show") as StrategyRule["scope"] })}
        >
          <SelectTrigger className="w-36">
            <SelectValue>{(v) => SCOPE_LABEL[v as StrategyRule["scope"]] ?? "…"}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="show">Each show</SelectItem>
            <SelectItem value="movie">Movies</SelectItem>
            <SelectItem value="collection">Filtered set</SelectItem>
          </SelectPopup>
        </Select>

        <Select value={mode} onValueChange={(v) => setRun((v ?? "block") as RunMode, [min, max])}>
          <SelectTrigger className="w-40">
            <SelectValue>
              {(v) =>
                v === "one" ? "One at a time" : v === "all" ? "Whole run" : v === "minutes" ? "~ Minutes" : "Block of…"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="one">One at a time</SelectItem>
            <SelectItem value="block">Block of…</SelectItem>
            <SelectItem value="minutes">~ Minutes</SelectItem>
            <SelectItem value="all">Whole run</SelectItem>
          </SelectPopup>
        </Select>

        {(mode === "block" || mode === "minutes") && (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              className="h-8 w-16"
              value={String(min)}
              onChange={(e) => setRun(mode, [Math.max(1, Math.round(Number(e.target.value) || 0)), max])}
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              type="number"
              min={1}
              className="h-8 w-16"
              value={String(max)}
              onChange={(e) => setRun(mode, [min, Math.max(min, Math.round(Number(e.target.value) || 0))])}
            />
            <span className="text-muted-foreground text-xs">{mode === "minutes" ? "min" : "eps"}</span>
          </div>
        )}

        <Button
          type="button"
          variant={showFilter ? "secondary" : "ghost"}
          size="icon-sm"
          className="ml-auto"
          title="Only apply this rule to items matching a filter"
          onClick={() => {
            const next = !showFilter;
            setShowFilter(next);
            if (!next) onChange({ ...rule, filter: undefined });
            else if (!rule.filter) onChange({ ...rule, filter: emptyGroup() });
          }}
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
        {canRemove && (
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {showFilter && (
        <FilterBuilder
          value={normalizeFilter(rule.filter)}
          onChange={(g) => onChange({ ...rule, filter: g })}
          mediaSourceId={mediaSourceId}
          mediaTypes={mediaTypes}
        />
      )}

      <p className="text-muted-foreground text-xs">{describeRule(rule, rotation)}</p>
    </div>
  );
}
