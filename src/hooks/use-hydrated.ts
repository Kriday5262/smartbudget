import { useEffect, useState } from "react";

/** true after client hydration — use to gate browser-only rendering */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
