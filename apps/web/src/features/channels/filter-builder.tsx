import { Button } from "@airwave/ui/components/button";
import { Input } from "@airwave/ui/components/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@airwave/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { trpc } from "@/utils/trpc";
import { uuid } from "@/lib/uuid";

export type FilterOp = "is" | "isNot" | "gte" | "lte" | "contains" | "notContains";
export type FilterCondition = {
  type: "condition";
  id: string;
  field: string;
  op: FilterOp;
  value: string;
};
export type FilterGroup = {
  type: "group";
  id: string;
  combinator: "and" | "or";
  children: FilterNode[];
};
export type FilterNode = FilterCondition | FilterGroup;

type FieldMeta = { field: string; label: string; kind: string; operators: FilterOp[] };

const uid = () => uuid();
export const emptyGroup = (): FilterGroup => ({
  type: "group",
  id: uid(),
  combinator: "and",
  children: [],
});

/** Give a loaded node a stable `id` (presets/stored filters omit them) and recurse. */
function coerce(node: unknown): FilterNode {
  const n = (node ?? {}) as Record<string, unknown>;
  if (n.type === "group") {
    const children = Array.isArray(n.children) ? n.children : [];
    return {
      type: "group",
      id: typeof n.id === "string" ? n.id : uid(),
      combinator: n.combinator === "or" ? "or" : "and",
      children: children.map(coerce),
    };
  }
  return {
    type: "condition",
    id: typeof n.id === "string" ? n.id : uid(),
    field: typeof n.field === "string" ? n.field : "genre",
    op: (typeof n.op === "string" ? n.op : "is") as FilterOp,
    value: typeof n.value === "string" ? n.value : "",
  };
}

/**
 * Coerce a stored/loaded filter into a valid root FilterGroup for the builder:
 * a bare condition (some presets store one, e.g. `duration ≤ 45`) is wrapped in an
 * AND group, missing `id`s are filled in, and null/undefined yields an empty group.
 * The resolver accepts a condition root too, so this only shapes it for the UI.
 */
export function normalizeFilter(node: unknown): FilterGroup {
  if (node == null || typeof node !== "object") return emptyGroup();
  const root = coerce(node);
  return root.type === "group"
    ? root
    : { type: "group", id: uid(), combinator: "and", children: [root] };
}

const OP_LABEL: Record<FilterOp, string> = {
  is: "is",
  isNot: "is not",
  gte: "≥",
  lte: "≤",
  contains: "contains",
  notContains: "does not contain",
};

type SharedProps = {
  fields: FieldMeta[];
  mediaSourceId: string;
  mediaTypes: ("movie" | "show")[];
};

export function FilterBuilder({
  value,
  onChange,
  mediaSourceId,
  mediaTypes,
}: {
  value: FilterGroup;
  onChange: (g: FilterGroup) => void;
  mediaSourceId: string;
  mediaTypes: ("movie" | "show")[];
}) {
  const fields = useQuery(trpc.channels.filterFields.queryOptions());
  return (
    <GroupEditor
      group={value}
      onChange={onChange}
      isRoot
      fields={fields.data ?? []}
      mediaSourceId={mediaSourceId}
      mediaTypes={mediaTypes}
    />
  );
}

function GroupEditor({
  group,
  onChange,
  onRemove,
  isRoot,
  fields,
  mediaSourceId,
  mediaTypes,
}: SharedProps & {
  group: FilterGroup;
  onChange: (g: FilterGroup) => void;
  onRemove?: () => void;
  isRoot?: boolean;
}) {
  const setChild = (idx: number, node: FilterNode) =>
    onChange({ ...group, children: group.children.map((c, i) => (i === idx ? node : c)) });
  const removeChild = (idx: number) =>
    onChange({ ...group, children: group.children.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          Match
          <Select
            value={group.combinator}
            onValueChange={(v) => onChange({ ...group, combinator: (v ?? "and") as "and" | "or" })}
          >
            <SelectTrigger className="w-32 min-w-0">
              <SelectValue>{(v) => (v === "or" ? "any (OR)" : "all (AND)")}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="and">all (AND)</SelectItem>
              <SelectItem value="or">any (OR)</SelectItem>
            </SelectPopup>
          </Select>
          of:
        </div>
        {onRemove && !isRoot && (
          <Button variant="ghost" size="icon-sm" onClick={onRemove}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="space-y-2 pl-3">
        {group.children.map((child, idx) =>
          child.type === "condition" ? (
            <ConditionEditor
              key={child.id}
              condition={child}
              onChange={(n) => setChild(idx, n)}
              onRemove={() => removeChild(idx)}
              fields={fields}
              mediaSourceId={mediaSourceId}
              mediaTypes={mediaTypes}
            />
          ) : (
            <GroupEditor
              key={child.id}
              group={child}
              onChange={(n) => setChild(idx, n)}
              onRemove={() => removeChild(idx)}
              fields={fields}
              mediaSourceId={mediaSourceId}
              mediaTypes={mediaTypes}
            />
          ),
        )}
        {group.children.length === 0 && (
          <p className="text-muted-foreground text-xs">No conditions yet.</p>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              ...group,
              children: [
                ...group.children,
                { type: "condition", id: uid(), field: fields[0]?.field ?? "genre", op: "is", value: "" },
              ],
            })
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Condition
        </Button>
        {isRoot && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...group, children: [...group.children, emptyGroup()] })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Group
          </Button>
        )}
      </div>
    </div>
  );
}

function ConditionEditor({
  condition,
  onChange,
  onRemove,
  fields,
  mediaSourceId,
  mediaTypes,
}: SharedProps & {
  condition: FilterCondition;
  onChange: (c: FilterCondition) => void;
  onRemove: () => void;
}) {
  const meta = fields.find((f) => f.field === condition.field);
  const isTag = meta?.kind === "tag";
  const values = useQuery({
    ...trpc.channels.filterValues.queryOptions({
      mediaSourceId,
      mediaTypes,
      field: condition.field,
    }),
    enabled: isTag && !!mediaSourceId && mediaTypes.length > 0,
  });

  return (
    <div className="flex items-center gap-2">
      <Select
        value={condition.field}
        onValueChange={(v) => {
          const next = v ?? condition.field;
          const m = fields.find((f) => f.field === next);
          onChange({ ...condition, field: next, op: m?.operators[0] ?? "is", value: "" });
        }}
      >
        <SelectTrigger className="w-44">
          <SelectValue>{(v) => fields.find((f) => f.field === v)?.label ?? "…"}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {fields.map((f) => (
            <SelectItem key={f.field} value={f.field}>
              {f.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>

      <Select
        value={condition.op}
        onValueChange={(v) => onChange({ ...condition, op: (v ?? "is") as FilterOp })}
      >
        <SelectTrigger className="w-36">
          <SelectValue>{(v) => OP_LABEL[v as FilterOp] ?? String(v)}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {(meta?.operators ?? ["is"]).map((op) => (
            <SelectItem key={op} value={op}>
              {OP_LABEL[op]}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>

      {meta?.kind === "bool" ? (
        <Select
          value={condition.value || "true"}
          onValueChange={(v) => onChange({ ...condition, value: v ?? "true" })}
        >
          <SelectTrigger className="min-w-0 flex-1">
            <SelectValue>{(v) => (v === "false" ? "false" : "true")}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="true">true</SelectItem>
            <SelectItem value="false">false</SelectItem>
          </SelectPopup>
        </Select>
      ) : isTag ? (
        <Select
          value={condition.value}
          onValueChange={(v) => onChange({ ...condition, value: v ?? "" })}
        >
          <SelectTrigger className="min-w-0 flex-1">
            <SelectValue>{(v) => (v ? String(v) : "Select…")}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {values.data?.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      ) : meta?.kind === "date" ? (
        <Input
          type="date"
          className="h-8 flex-1"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        />
      ) : (
        <Input
          className="h-8 flex-1"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder={
            meta?.kind === "recency" ? "days" : meta?.kind === "int" ? "number" : "value"
          }
        />
      )}

      <Button variant="ghost" size="icon-sm" onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
