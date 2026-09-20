"use client";

import { useEffect, useState } from "react";

function remaining(deadline: number) {
  return Math.max(0, deadline - Math.floor(Date.now() / 1000));
}

export function Countdown({ deadline }: { deadline: number }) {
  const [seconds, setSeconds] = useState(() => remaining(deadline));

  useEffect(() => {
    const interval = window.setInterval(() => setSeconds(remaining(deadline)), 1000);
    return () => window.clearInterval(interval);
  }, [deadline]);

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const value = days > 0
    ? `${days}d ${hours.toString().padStart(2, "0")}h`
    : `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;

  return <time dateTime={`PT${seconds}S`}>{value}</time>;
}
