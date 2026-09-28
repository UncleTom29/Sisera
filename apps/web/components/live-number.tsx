"use client";

import { useEffect, useRef, useState } from "react";

/** Renders a formatted live value and flashes green or red for a moment when it moves. */
export function LiveNumber({
  value,
  display,
  className = "",
}: {
  value: number | null | undefined;
  display: string;
  className?: string;
}) {
  const previous = useRef(value);
  const [tick, setTick] = useState<{ direction: "up" | "down"; key: number } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (before == null || value == null || before === value) return;
    setTick({ direction: value > before ? "up" : "down", key: Date.now() });
  }, [value]);

  return (
    <span
      key={tick?.key}
      className={`num ${tick ? (tick.direction === "up" ? "tick-up" : "tick-down") : ""} ${className}`}
    >
      {display}
    </span>
  );
}
