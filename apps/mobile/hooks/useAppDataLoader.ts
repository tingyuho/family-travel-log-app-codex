import { useState } from "react";

import {
  fetchMe,
  fetchPackingTemplates,
  fetchPeopleProfiles,
  fetchTrips,
  type PackingTemplate,
  type PersonProfile,
  type Trip,
} from "../api";

type LoadAllOptions = {
  requireProfile?: boolean;
  surfacePartialErrors?: boolean;
};

type UseAppDataLoaderArgs = {
  setTrips: (trips: Trip[]) => void;
  setPeople: (people: PersonProfile[]) => void;
  setPackingTemplates: (templates: PackingTemplate[]) => void;
  setProfileEmail: (email: string) => void;
  onRefreshStart?: () => void;
  onError: (error: unknown) => void;
};

export function useAppDataLoader({
  setTrips,
  setPeople,
  setPackingTemplates,
  setProfileEmail,
  onRefreshStart,
  onError,
}: UseAppDataLoaderArgs) {
  const [refreshing, setRefreshing] = useState(false);

  async function loadAll(options: LoadAllOptions = {}) {
    const [tripsResult, peopleResult, packingResult, meResult] = await Promise.allSettled([
      fetchTrips(""),
      fetchPeopleProfiles(),
      fetchPackingTemplates(),
      fetchMe(),
    ]);
    const failures: string[] = [];

    if (tripsResult.status === "fulfilled") {
      setTrips(tripsResult.value);
    } else {
      failures.push("trips");
    }

    if (peopleResult.status === "fulfilled") {
      setPeople(peopleResult.value);
    } else {
      failures.push("people");
    }

    if (packingResult.status === "fulfilled") {
      setPackingTemplates(packingResult.value);
    } else {
      failures.push("packing");
    }

    if (meResult.status === "fulfilled") {
      setProfileEmail(meResult.value.email || "");
    } else {
      failures.push("profile");
      if (options.requireProfile) throw meResult.reason;
    }

    if (failures.length && options.surfacePartialErrors) {
      throw new Error(`Some data could not refresh: ${failures.join(", ")}.`);
    }
  }

  async function refresh() {
    setRefreshing(true);
    onRefreshStart?.();
    try {
      await loadAll({ surfacePartialErrors: true });
    } catch (error) {
      onError(error);
    } finally {
      setRefreshing(false);
    }
  }

  return {
    loadAll,
    refresh,
    refreshing,
  };
}
