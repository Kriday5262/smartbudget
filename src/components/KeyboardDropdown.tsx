import {
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type KeyboardDropdownOption = {
  value: string;
  label: string;
  description?: string;
  group?: string;
  trailing?: string;
  icon?: ReactNode;
};

export function KeyboardDropdown({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  searchable = true,
}: {
  value: string;
  onChange: (value: string) => void;
  options: KeyboardDropdownOption[];
  placeholder: string;
  ariaLabel: string;
  searchable?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ""} ${option.group ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = filtered.findIndex((option) => option.value === value);
    setActiveIndex(Math.max(0, selectedIndex));
    window.setTimeout(() => {
      if (searchable) searchRef.current?.focus();
      else listRef.current?.focus();
    }, 0);
  }, [open]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOutside);
    return () => window.removeEventListener("pointerdown", closeOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function focusNextEditorField() {
    const trigger = rootRef.current?.querySelector<HTMLButtonElement>(":scope > button");
    const form = rootRef.current?.closest("form");
    if (!trigger || !form) return;
    const controls = Array.from(form.querySelectorAll<HTMLElement>("[data-entry-control]"));
    const next = controls[controls.indexOf(trigger) + 1];
    next?.focus();
    if (next instanceof HTMLInputElement) next.select();
  }

  function choose(option: KeyboardDropdownOption, advance = false) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
    if (advance) window.setTimeout(focusNextEditorField, 0);
    else rootRef.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
  }

  function handleTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(true);
    }
  }

  function handleListKey(event: KeyboardEvent<HTMLInputElement | HTMLDivElement>) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) =>
        Math.max(0, Math.min(filtered.length - 1, current + direction)),
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const option = filtered[activeIndex];
      if (option) choose(option, true);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0 border-b border-r border-primary/50 bg-primary/5">
      <button
        data-entry-control
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKey}
        className={cn(
          "flex h-10 w-full min-w-0 items-center gap-2 bg-transparent px-2 text-left text-xs font-bold text-foreground outline-none",
          "focus:bg-primary/10 focus:ring-2 focus:ring-inset focus:ring-primary",
        )}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">{selected?.icon}</span>
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[350px] overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          {searchable && (
            <div className="relative border-b border-border p-2">
              <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleListKey}
                placeholder={`Search ${placeholder.toLowerCase()}`}
                className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          )}
          <div
            ref={listRef}
            role="listbox"
            tabIndex={searchable ? -1 : 0}
            onKeyDown={handleListKey}
            className="max-h-64 overflow-y-auto p-1.5"
          >
            {filtered.map((option, index) => {
              const showGroup = option.group && option.group !== filtered[index - 1]?.group;
              return (
                <Fragment key={option.value}>
                  {showGroup && (
                    <div className="px-2.5 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground first:pt-1">
                      {option.group}
                    </div>
                  )}
                  <button
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left",
                      index === activeIndex && "bg-primary/10",
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      {option.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-foreground">
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="block truncate text-[9px] font-semibold text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {option.trailing && (
                      <span className="shrink-0 text-[10px] font-bold tabular-nums text-muted-foreground">
                        {option.trailing}
                      </span>
                    )}
                    {option.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No matches</p>
            )}
          </div>
          <div className="border-t border-border bg-muted px-3 py-1.5 text-[8px] font-semibold text-muted-foreground">
            ↑↓ navigate · Enter select · Esc close
          </div>
        </div>
      )}
    </div>
  );
}
