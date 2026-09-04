import { useState, useEffect, useRef } from "react";
import { RefreshCw, ArrowDown } from "lucide-react";
import { refreshDB } from "@/lib/store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PULL_THRESHOLD = 70; // px to trigger refresh

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleTouchStart(e: TouchEvent) {
      if (window.scrollY > 5) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    }

    function handleTouchMove(e: TouchEvent) {
      if (!pullingRef.current || window.scrollY > 5) return;
      const currentY = e.touches[0].clientY;
      const dy = currentY - startYRef.current;

      if (dy > 0) {
        // Apply physics damping curve
        const dampened = Math.min(dy * 0.45, 120);
        setPullY(dampened);
        if (dampened > 10 && e.cancelable) {
          // Prevent native overscroll browser refresh interference if pulling
          // e.preventDefault();
        }
      }
    }

    async function handleTouchEnd() {
      if (!pullingRef.current) return;
      pullingRef.current = false;

      if (pullY >= PULL_THRESHOLD && !refreshing) {
        setRefreshing(true);
        setPullY(PULL_THRESHOLD);
        try {
          await refreshDB();
          toast.success("Updated with latest data", { duration: 1500 });
        } catch {}
        setTimeout(() => {
          setRefreshing(false);
          setPullY(0);
        }, 500);
      } else {
        setPullY(0);
      }
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [pullY, refreshing]);

  const progress = Math.min(pullY / PULL_THRESHOLD, 1);
  const readyToRefresh = pullY >= PULL_THRESHOLD;

  return (
    <div className="relative min-h-screen w-full">
      {/* Floating Refresh Pull Indicator */}
      <div
        className="pointer-events-none fixed top-4 left-1/2 z-50 flex -translate-x-1/2 items-center justify-center transition-transform duration-100 ease-out"
        style={{
          transform: `translate(-50%, ${pullY > 0 ? pullY * 0.8 : -60}px) scale(${
            refreshing ? 1 : 0.6 + progress * 0.4
          })`,
          opacity: pullY > 5 || refreshing ? 1 : 0,
        }}
      >
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full border shadow-lg transition-colors duration-200",
            readyToRefresh || refreshing
              ? "gradient-primary text-primary-foreground border-primary"
              : "bg-card border-border text-primary"
          )}
        >
          <RefreshCw
            className={cn(
              "h-5 w-5 transition-transform duration-200",
              refreshing && "animate-spin",
              !refreshing && readyToRefresh && "rotate-180"
            )}
            style={{
              transform: !refreshing && !readyToRefresh ? `rotate(${progress * 180}deg)` : undefined,
            }}
          />
        </div>
      </div>

      {/* Main Page Content with Pull Translation */}
      <div
        style={{
          transform: pullY > 0 ? `translate3d(0, ${pullY * 0.5}px, 0)` : undefined,
          transition: pullingRef.current ? "none" : "transform 0.3s cubic-bezier(0.1, 0.9, 0.2, 1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
