import { Input } from "@airwave/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@airwave/ui/components/popover";
import { Skeleton } from "@airwave/ui/components/skeleton";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as React from "react";

import { cn } from "@/lib/utils";

import { ICON_SET, type IconPickerItem } from "./icon-set";

const COLS = 7;
const CELL_SIZE = 36;
const GAP = 4;
const ROW_HEIGHT = CELL_SIZE + GAP;
const VISIBLE_ROWS = 8;
const GRID_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;
const POPOVER_WIDTH = COLS * CELL_SIZE + (COLS - 1) * GAP + 16 + 2 + 8;
const SEARCH_DEBOUNCE_MS = 120;

export function IconPicker({
  value,
  onChange,
  trigger,
}: {
  value?: string;
  onChange: (id: string) => void;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const handleSelect = React.useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="gap-0 p-0"
        style={{ width: POPOVER_WIDTH }}
      >
        {open ? <IconPickerContent value={value} onSelect={handleSelect} /> : null}
      </PopoverContent>
    </Popover>
  );
}

function IconPickerContent({
  value,
  onSelect,
}: {
  value?: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const searchIndex = React.useMemo(
    () =>
      ICON_SET.map((item) => ({
        item,
        key: [item.id, item.label, ...item.keywords].join(" ").toLowerCase(),
      })),
    [],
  );

  const filtered = React.useMemo(() => {
    if (!debounced) return ICON_SET;
    const q = debounced.toLowerCase();
    const matches: IconPickerItem[] = [];
    for (const entry of searchIndex) if (entry.key.includes(q)) matches.push(entry.item);
    return matches;
  }, [debounced, searchIndex]);

  const rows = React.useMemo(() => {
    const result: IconPickerItem[][] = [];
    for (let i = 0; i < filtered.length; i += COLS) result.push(filtered.slice(i, i + COLS));
    return result;
  }, [filtered]);

  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
  });

  const isSearching = query !== debounced;

  return (
    <>
      <div className="border-b p-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons…"
          autoFocus
          className="h-8"
        />
      </div>

      {isSearching ? (
        <IconGridSkeleton />
      ) : filtered.length === 0 ? (
        <div className="text-muted-foreground flex h-[160px] items-center justify-center px-4 text-center text-sm">
          No icons match “{debounced}”.
        </div>
      ) : (
        <div
          ref={parentRef}
          className="overflow-y-auto overflow-x-hidden p-2"
          style={{ height: GRID_HEIGHT, contain: "strict", scrollbarGutter: "stable" }}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                className="grid gap-1"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: CELL_SIZE,
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: `repeat(${COLS}, ${CELL_SIZE}px)`,
                }}
              >
                {rows[virtualRow.index]!.map((item) => (
                  <IconCell
                    key={item.id}
                    item={item}
                    isSelected={item.id === value}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const IconCell = React.memo(function IconCell({
  item,
  isSelected,
  onSelect,
}: {
  item: IconPickerItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const { Icon, id, label } = item;
  return (
    <button
      type="button"
      title={label}
      onClick={() => onSelect(id)}
      className={cn(
        "text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none",
        isSelected && "bg-accent text-accent-foreground ring-primary ring-1",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
});

function IconGridSkeleton() {
  return (
    <div className="p-2" style={{ height: GRID_HEIGHT }}>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLS}, ${CELL_SIZE}px)` }}>
        {Array.from({ length: COLS * VISIBLE_ROWS }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-9 rounded-md" />
        ))}
      </div>
    </div>
  );
}
