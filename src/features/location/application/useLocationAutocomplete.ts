import { useCallback, useEffect, useRef, useState } from "react";
import { searchLocations } from "@/core/services";
import type { SearchResult } from "@/features/location/domain/types";

interface UseLocationAutocompleteReturn {
  locationSuggestions: SearchResult[];
  isLocationSearching: boolean;
  clearLocationSuggestions: () => void;
  searchNow: (query: string) => Promise<void>;
}

const TYPING_SETTLE_MS = 450;
const MIN_QUERY_LENGTH = 2;
const SUGGESTION_COUNT = 6;

export function useLocationAutocomplete(
  locationInput: string,
  isFocused: boolean,
): UseLocationAutocompleteReturn {
  const [locationSuggestions, setLocationSuggestions] = useState<
    SearchResult[]
  >([]);
  const [isLocationSearching, setIsLocationSearching] = useState(false);

  // Guards against stale responses landing after the query moved on
  const activeQueryRef = useRef("");
  const timerRef = useRef<number | undefined>(undefined);
  const controllerRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (rawQuery: string) => {
    const query = String(rawQuery ?? "").trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setLocationSuggestions([]);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    activeQueryRef.current = query;
    setIsLocationSearching(true);

    try {
      const found = await searchLocations(
        query,
        SUGGESTION_COUNT,
        controller.signal,
      );
      if (activeQueryRef.current === query) {
        setLocationSuggestions(found);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      if (activeQueryRef.current === query) {
        setLocationSuggestions([]);
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      if (activeQueryRef.current === query) {
        setIsLocationSearching(false);
      }
    }
  }, []);

  const searchNow = useCallback(
    async (query: string) => {
      // Drop any queued debounce so it can't re-fire behind this search
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
      await runSearch(query);
    },
    [runSearch],
  );

  useEffect(() => {
    const query = String(locationInput ?? "").trim();
    if (!isFocused || query.length < MIN_QUERY_LENGTH) {
      activeQueryRef.current = "";
      setLocationSuggestions([]);
      setIsLocationSearching(false);
      return undefined;
    }

    let disposed = false;
    timerRef.current = window.setTimeout(() => {
      if (!disposed) {
        void runSearch(query);
      }
    }, TYPING_SETTLE_MS);

    return () => {
      disposed = true;
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [locationInput, isFocused, runSearch]);

  const clearLocationSuggestions = useCallback(() => {
    setLocationSuggestions([]);
  }, []);

  return {
    locationSuggestions,
    isLocationSearching,
    clearLocationSuggestions,
    searchNow,
  };
}
