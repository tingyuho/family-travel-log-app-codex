import { useState } from "react";

import type { Trip } from "../api";

export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);

  return {
    trips,
    setTrips,
    clearTrips: () => setTrips([]),
  };
}
