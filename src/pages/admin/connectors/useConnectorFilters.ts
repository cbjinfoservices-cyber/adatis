import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  HEALTH_FILTERS, matchesHealthFilter, matchesSearch, needsRetest, sortConnectors,
  type Connector, type ConnectorSort, type HealthFilter,
} from '@/utils/connectors';

const healthFrom = (params: URLSearchParams): HealthFilter => {
  const raw = params.get('health');
  return raw && (HEALTH_FILTERS as string[]).includes(raw) ? (raw as HealthFilter) : 'all';
};

/**
 * Filtres de la liste des connecteurs. Santé et « à retester » sont dans l'URL
 * (?health=…&retest=1) pour que les liens du tableau de bord ouvrent la bonne vue.
 */
export default function useConnectorFilters(items: Connector[]) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [retestOnly, setRetestOnly] = useState(() => searchParams.get('retest') === '1');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>(() => healthFrom(searchParams));
  const [sortBy, setSortBy] = useState<ConnectorSort>('recent_test');

  useEffect(() => {
    setHealthFilter(healthFrom(searchParams));
    setRetestOnly(searchParams.get('retest') === '1');
  }, [searchParams]);

  /** Modifie la query string sans ajouter d'entrée à l'historique. */
  const updateParams = (edit: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams);
    edit(params);
    const query = params.toString();
    navigate({ search: query ? `?${query}` : '' }, { replace: true });
  };

  const setRetest = (next: boolean) => {
    setRetestOnly(next);
    updateParams((params) => (next ? params.set('retest', '1') : params.delete('retest')));
  };

  const changeHealthFilter = (next: HealthFilter) => {
    setHealthFilter(next);
    updateParams((params) => (next === 'all' ? params.delete('health') : params.set('health', next)));
  };

  const resetFilters = () => {
    setSearch('');
    setRetestOnly(false);
    setHealthFilter('all');
    navigate({ search: '' }, { replace: true });
  };

  const healthCounts = useMemo(() => ({
    all: items.length,
    healthy: items.filter((c) => matchesHealthFilter(c.health, 'healthy')).length,
    degraded: items.filter((c) => matchesHealthFilter(c.health, 'degraded')).length,
    pending: items.filter((c) => matchesHealthFilter(c.health, 'pending')).length,
  }), [items]);

  const retestCount = useMemo(() => items.filter(needsRetest).length, [items]);

  const visibleItems = useMemo(
    () => sortConnectors(
      items.filter((c) => matchesHealthFilter(c.health, healthFilter)
        && (!retestOnly || needsRetest(c))
        && matchesSearch(c, search)),
      sortBy,
    ),
    [items, healthFilter, sortBy, search, retestOnly],
  );

  return {
    searchParams,
    updateParams,
    search,
    setSearch,
    retestOnly,
    setRetest,
    healthFilter,
    changeHealthFilter,
    sortBy,
    setSortBy,
    resetFilters,
    healthCounts,
    retestCount,
    visibleItems,
    filtersActive: search.trim() !== '' || retestOnly || healthFilter !== 'all',
  };
}
