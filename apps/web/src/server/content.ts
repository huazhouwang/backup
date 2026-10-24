/** Checks on project content as it is saved and read: size, the current schema (migrating older data) and structure */
import { migrate, validate, type Project, type ValidationIssue } from '@plinth/core';
import { HTTPException } from 'hono/http-exception';
import { m } from '@/lib/i18n';
import * as repo from './repo';

export const MAX_CONTENT = 1_500_000;
export function checkContent(json: unknown): Project {
  try {
    return migrate(json);
  } catch (e) {
    throw new HTTPException(400, { message: e instanceof Error ? e.message : m.server_err_invalid_project_data() });
  }
}

/** Stored project content as the current schema has it: what was saved before a schema change is migrated as it is read */
export const stored = (raw: string): Project => migrate(JSON.parse(raw));

const issueKey = (i: ValidationIssue) => `${i.path}\n${i.message}`;

/**
 * Reject structurally invalid data (duplicate IDs, missing levels, zero-length walls…). Only issues the base version
 * didn't already have are rejected, so a project saved before this check can still be edited.
 */
export async function checkStructure(id: string, base: number, content: Project) {
  const issues = validate(content);
  if (!issues.length) return;
  const prev = await repo.getVersion(id, base);
  const known = new Set(prev ? validate(checkContent(JSON.parse(prev.content))).map(issueKey) : []);
  const fresh = issues.filter(i => !known.has(issueKey(i)));
  if (fresh.length) {
    throw new HTTPException(400, {
      message: m.server_err_project_invalid({
        issues: fresh
          .slice(0, 5)
          .map(i => `${i.path}: ${i.message}`)
          .join('; '),
      }),
    });
  }
}
