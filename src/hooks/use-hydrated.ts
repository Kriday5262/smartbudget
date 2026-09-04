import { useEffect, useState } from "react";

/** true after client hydration — use to gate browser-only rendering */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(() => typeof window !== "undefined");
  useEffect(() => {
    if (!hydrated) setHydrated(true);
  }, [hydrated]);
  return hydrated;
}
