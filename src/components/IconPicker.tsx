import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

export function IconPicker({
  open,
  onOpenChange,
  value,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value?: string;
  onSelect: (key: string) => void;
}) {
  const [query, setQuery] = useState("");

  const icons = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORY_ICONS;
    return CATEGORY_ICONS.filter((i) => i.key.includes(q));
  }, [query]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
    >
      <DialogContent
        className={cn(
          "max-h-[70vh] overflow-y-auto rounded-3xl no-select sm:max-w-lg",
          "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
          "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
        )}>
        <DialogHeader>
          <DialogTitle className="text-base">Pick an icon</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 rounded-xl pl-9"
              placeholder="Search icons"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-6 gap-2">
            {icons.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => onSelect(i.key)}
                title={i.key}
                className={cn(
                  "tap flex h-11 w-full items-center justify-center rounded-xl border transition-colors",
                  value === i.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-foreground hover:bg-muted",
                )}
              >
                <i.Icon className="h-5 w-5" />
              </button>
            ))}
            {icons.length === 0 && (
              <p className="col-span-6 py-6 text-center text-xs text-muted-foreground">
                No icons found
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
