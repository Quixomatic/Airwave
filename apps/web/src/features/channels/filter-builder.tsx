import { Button } from "@ChannelGuide/ui/components/button";
import { Input } from "@ChannelGuide/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { trpc } from "@/utils/trpc";

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

const uid = () => crypto.randomUUID();
export const emptyGroup = (): FilterGroup => ({
  type: "group",
  id: uid(),
  combinator: "and",
  children: [],
});

const OP_LABEL: Record<FilterOp, string> = {
  is: "is",
  isNot: "is not",
  gte: "≥",
  lte: "≤",
  contains: "contains",
  notContains: "does not contain",
};
const SELECT =
  "border-input bg-background h-8 rounded-md border px-2 text-sm";

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
          <select
            className={SELECT}
            value={group.combinator}
            onChange={(e) => onChange({ ...group, combinator: e.target.value as "and" | "or" })}
          >
            <option value="and">all (AND)</option>
            <option value="or">any (OR)</option>
          </select>
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
      <select
        className={SELECT}
        value={condition.field}
        onChange={(e) => {
          const m = fields.find((f) => f.field === e.target.value);
          onChange({ ...condition, field: e.target.value, op: m?.operators[0] ?? "is", value: "" });
        }}
      >
        {fields.map((f) => (
          <option key={f.field} value={f.field}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        className={SELECT}
        value={condition.op}
        onChange={(e) => onChange({ ...condition, op: e.target.value as FilterOp })}
      >
        {(meta?.operators ?? ["is"]).map((op) => (
          <option key={op} value={op}>
            {OP_LABEL[op]}
          </option>
        ))}
      </select>

      {meta?.kind === "bool" ? (
        <select
          className={`${SELECT} flex-1`}
          value={condition.value || "true"}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : isTag ? (
        <select
          className={`${SELECT} flex-1`}
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        >
          <option value="">Select…</option>
          {values.data?.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <Input
          className="h-8 flex-1"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder={meta?.kind === "int" ? "number" : "value"}
        />
      )}

      <Button variant="ghost" size="icon-sm" onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
