import { cn } from "@/lib/utils";

/** Amber chip shown on transactions still awaiting clearance (surfaced in SmartPay). */
export function PendingBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning",
        className,
      )}
    >
      Pending
    </span>
  );
}
