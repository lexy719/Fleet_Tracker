import clsx from "clsx";
import { GripVertical } from "lucide-react";
import type { CargoItem, CargoType } from "../../data/types";
import type { CargoDragPayload } from "./dnd";
import { setDragData } from "./dnd";
import { Badge } from "../ui/Badge";

const typeLabel: Record<CargoType, string> = {
  dry: "Dry",
  refrigerated: "Reefer",
  hazmat: "HAZMAT",
  bulk: "Bulk",
  automotive: "Auto",
};

function typeColor(t: CargoType) {
  const map: Record<CargoType, string> = {
    dry:          "border-[#8B6F47]/30 bg-[#F2EBE0] text-[#5C4A30]",
    refrigerated: "border-[#5F8A7D]/30 bg-[#E5F0EC] text-[#2D5F4E]",
    hazmat:       "border-[#A84432]/30 bg-[#F6E3DE] text-[#A84432]",
    bulk:         "border-[#7A6B8A]/30 bg-[#EDE9F2] text-[#4A3B5C]",
    automotive:   "border-[#6B7A52]/30 bg-[#EBF0E0] text-[#4A5538]",
  };
  return map[t];
}

function loadBadge(ls: CargoItem["loadStatus"]) {
  if (ls === "secured") return <Badge variant="ok">Secured</Badge>;
  if (ls === "unbalanced") return <Badge variant="danger">Imbalance</Badge>;
  return <Badge variant="warn">Pending</Badge>;
}

export function CargoUnitCard({
  item,
  from,
  compact,
  onDragStart,
  onDragEnd,
}: {
  item: CargoItem;
  from: CargoDragPayload["from"];
  compact?: boolean;
  onDragStart?: (p: CargoDragPayload) => void;
  onDragEnd?: () => void;
}) {
  const payload: CargoDragPayload = { itemId: item.id, from };

  return (
    <div
      draggable
      onDragStart={(e) => {
        setDragData(e, payload);
        onDragStart?.(payload);
      }}
      onDragEnd={() => onDragEnd?.()}
      className={clsx(
        "group relative cursor-grab rounded-xl border bg-[var(--app-elevated)] shadow-sm transition active:cursor-grabbing",
        "hover:ring-2 hover:ring-brand-500/40",
        compact ? "p-2.5" : "p-3",
      )}
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="flex gap-2">
        <div className="flex shrink-0 flex-col items-center justify-start pt-0.5 text-[var(--app-muted)] opacity-60 group-hover:opacity-100">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className={clsx("font-medium leading-snug", compact ? "text-[13px]" : "text-sm")}>{item.label}</div>
              <div className="mt-0.5 font-mono text-[10px] text-[var(--app-muted)]">{item.sku}</div>
            </div>
            {!compact ? loadBadge(item.loadStatus) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className={clsx("rounded border px-1.5 py-0.5 font-medium", typeColor(item.type))}>{typeLabel[item.type]}</span>
            <span className="text-[var(--app-muted)]">{item.weightKg.toLocaleString()} kg</span>
            {!compact ? <span className="text-[var(--app-muted)]">→ {item.destination}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
