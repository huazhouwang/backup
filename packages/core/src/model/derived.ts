/**
 * Results derived from a project (rule issues, areas, constraint status), computed lazily and cached per project object.
 * Projects are never changed in place outside a transaction, so a project object always has the same derived results;
 * the session and every UI panel share them instead of recomputing. Drafts are computed fresh. Treat results as read-only.
 */
import { isDraft } from 'immer';
import { areaReport, type AreaReport } from '../geometry/area.js';
import { checkConstraints, type ConstraintStatus } from '../rules/constraints.js';
import { checkRules, type Issue } from '../rules/rules.js';
import type { Project } from './schema.js';

export interface Derived {
  readonly rules: Issue[];
  readonly areas: AreaReport;
  readonly constraints: ConstraintStatus[];
}

const COMPUTE: { [K in keyof Derived]: (p: Project) => Derived[K] } = {
  rules: checkRules,
  areas: areaReport,
  constraints: checkConstraints,
};

const cache = new WeakMap<Project, Partial<Derived>>();

export function derived(p: Project): Derived {
  const draft = isDraft(p);
  let slot = draft ? {} : cache.get(p);
  if (!slot) cache.set(p, (slot = {}));
  const s = slot as Record<keyof Derived, unknown>;
  const get = <K extends keyof Derived>(k: K): Derived[K] => (k in s ? s[k] : (s[k] = COMPUTE[k](p))) as Derived[K];
  return {
    get rules() {
      return get('rules');
    },
    get areas() {
      return get('areas');
    },
    get constraints() {
      return get('constraints');
    },
  };
}
