import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type SortDirection = 'asc' | 'desc' | 'none';

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export interface UseTableFilterOptions<T, K extends string> {
  data: T[];
  searchKeys: (keyof T)[];
  sortFns?: Partial<Record<K, (a: T, b: T) => number>>;
  defaultSort?: SortState<K>;
  debounceMs?: number;
}

export interface UseTableFilterReturn<T, K extends string> {
  filtered: T[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sort: SortState<K>;
  toggleSort: (key: K) => void;
  getAriaSortValue: (key: K) => 'ascending' | 'descending' | 'none';
}

// ============================================================================
// HOOK
// ============================================================================

export function useTableFilter<T, K extends string = string>({
  data,
  searchKeys,
  sortFns,
  defaultSort,
  debounceMs = 300,
}: UseTableFilterOptions<T, K>): UseTableFilterReturn<T, K> {
  const [searchQuery, setSearchQueryRaw] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSort] = useState<SortState<K>>(
    defaultSort ?? ({ key: '' as K, direction: 'none' } as SortState<K>),
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSearchQuery = useCallback(
    (q: string) => {
      setSearchQueryRaw(q);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setDebouncedQuery(q);
      }, debounceMs);
    },
    [debounceMs],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const toggleSort = useCallback(
    (key: K) => {
      setSort((prev) => {
        if (prev.key === key) {
          const next: SortDirection =
            prev.direction === 'none' ? 'asc' : prev.direction === 'asc' ? 'desc' : 'none';
          return { key, direction: next };
        }
        return { key, direction: 'asc' };
      });
    },
    [],
  );

  const getAriaSortValue = useCallback(
    (key: K): 'ascending' | 'descending' | 'none' => {
      if (sort.key !== key || sort.direction === 'none') return 'none';
      return sort.direction === 'asc' ? 'ascending' : 'descending';
    },
    [sort],
  );

  const filtered = useMemo(() => {
    let result = [...data];

    // Search filter
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      result = result.filter((item) =>
        searchKeys.some((key) => {
          const val = item[key];
          if (val == null) return false;
          return String(val).toLowerCase().includes(q);
        }),
      );
    }

    // Sort
    if (sort.direction !== 'none' && sort.key && sortFns?.[sort.key]) {
      const compareFn = sortFns[sort.key]!;
      const dir = sort.direction === 'asc' ? 1 : -1;
      result.sort((a, b) => dir * compareFn(a, b));
    }

    return result;
  }, [data, debouncedQuery, searchKeys, sort, sortFns]);

  return {
    filtered,
    searchQuery,
    setSearchQuery,
    sort,
    toggleSort,
    getAriaSortValue,
  };
}
