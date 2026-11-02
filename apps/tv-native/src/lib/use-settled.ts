import { useEffect, useState } from "react";

/**
 * `value`, once it has stopped changing for `ms`: it follows a value that changes in bursts (the D-pad stepping down a list) one change at
 * the end of the burst, not at every step. Starts as `value`, so the first render is not late. For work that is too heavy to redo at each step.
 */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(settled, value)) return;
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, settled, ms]);
  return settled;
}
