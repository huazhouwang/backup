/**
 * Built recipes, kept for synchronous use. Scripts evaluate asynchronously (script.ts), but the plan and the 3D view draw
 * synchronously: they read what is built, ask for what isn't, and redraw when the cache says something new is ready. Builds
 * are deterministic, so they are kept per recipe (by identity), size and parameters; a recipe that fails to build stays failed (one that ran out of time
 * on a busy page is tried again a few times).
 */
import { buildRecipe, type Built, type Recipe } from './script.js';
import type { RecipeSize } from './recipe.js';

interface Entry {
  built?: Built;
  error?: string;
  pending?: Promise<Built | undefined>;
  tries?: number;
}

/** A build that ran out of time (a busy page, not a broken recipe) is tried again, up to this many times */
const RETRIES = 3;
const TIMEOUT = /D1012|timeout/i;

const store = new WeakMap<Recipe, Map<string, Entry>>();
const listeners = new Set<() => void>();
let version = 0,
  scheduled = false;

const sortObj = (o: Record<string, unknown>) =>
  Object.keys(o)
    .sort()
    .map(k => [k, o[k]]);
const key = (size: RecipeSize, params: Record<string, unknown>) => JSON.stringify([sortObj(size), sortObj(params)]);

function entry(recipe: Recipe, size: RecipeSize, params: Record<string, unknown>) {
  let m = store.get(recipe);
  if (!m) store.set(recipe, (m = new Map()));
  const k = key(size, params);
  let e = m.get(k);
  if (!e) {
    if (m.size > 2000) m.clear();
    m.set(k, (e = {}));
  }
  return e;
}

function changed() {
  version++;
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    listeners.forEach(f => f());
  }, 0);
}

/** What the recipe built at this size with these parameters, if it is ready (undefined while building or when it failed) */
export function peekBuild(recipe: Recipe, size: RecipeSize, params: Record<string, unknown> = {}): Built | undefined {
  return entry(recipe, size, params).built;
}

/** Why the recipe failed to build at this size with these parameters, if it did */
export function buildError(recipe: Recipe, size: RecipeSize, params: Record<string, unknown> = {}): string | undefined {
  return entry(recipe, size, params).error;
}

/** Build (once) and keep the result; resolves to undefined when the recipe fails */
export function requestBuild(recipe: Recipe, size: RecipeSize, params: Record<string, unknown> = {}): Promise<Built | undefined> {
  const e = entry(recipe, size, params);
  if (e.built || e.error) return Promise.resolve(e.built);
  e.pending ??= buildRecipe(recipe, size, params).then(
    b => ((e.built = b), (e.pending = undefined), changed(), b),
    err => {
      const message = err instanceof Error ? err.message : String(err);
      e.tries = (e.tries ?? 0) + 1;
      // Out of time: leave it unbuilt, so the next request (after the redraw below) tries again
      if (!(TIMEOUT.test(message) && e.tries < RETRIES)) e.error = message;
      e.pending = undefined;
      changed();
      return undefined;
    },
  );
  return e.pending;
}

/** The built result if ready, else undefined after asking for it */
export function getBuild(recipe: Recipe, size: RecipeSize, params: Record<string, unknown> = {}): Built | undefined {
  const e = entry(recipe, size, params);
  if (!e.built && !e.error) void requestBuild(recipe, size, params);
  return e.built;
}

/** Called (batched) whenever builds finish */
export function subscribeBuilds(f: () => void): () => void {
  listeners.add(f);
  return () => void listeners.delete(f);
}

/** Changes whenever builds finish, for redrawing */
export const buildsVersion = () => version;
