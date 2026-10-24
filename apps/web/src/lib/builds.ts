/** Redraw when recipe builds finish (recipes build asynchronously, see packages/core/src/looks/cache.ts) */
import { buildsVersion, subscribeBuilds } from '@plinth/core';
import { useSyncExternalStore } from 'react';

export const useBuildsVersion = () => useSyncExternalStore(subscribeBuilds, buildsVersion);
