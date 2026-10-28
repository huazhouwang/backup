/** Share pages (issue 196): a design published with its style renders, under a token that unpublishing revokes */
import type { RenderInfo } from '@/shared/renders';
import { db, now } from './db';

export interface ShowcaseRow {
  token: string;
  project_id: string;
  created_by: string | null;
  hero: string | null;
  created_at: number;
}

export const getShowcase = (token: string) => db().prepare('select * from showcase where token = ?').bind(token).first<ShowcaseRow>();
export const showcaseOf = (projectId: string) => db().prepare('select * from showcase where project_id = ?').bind(projectId).first<ShowcaseRow>();

/** Publish a design: its images so far go on the page (the owner can take any off) */
export async function publishShowcase(projectId: string, userId: string) {
  const existing = await showcaseOf(projectId);
  if (existing) return existing;
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await db().batch([
    db().prepare('insert into showcase (token, project_id, created_by, created_at) values (?, ?, ?, ?)').bind(token, projectId, userId, now()),
    db().prepare('update render set public = 1 where project_id = ?').bind(projectId),
  ]);
  return (await showcaseOf(projectId))!;
}

export const unpublishShowcase = (projectId: string) => db().prepare('delete from showcase where project_id = ?').bind(projectId).run();
export const setShowcaseHero = (projectId: string, hero: string | null) =>
  db().prepare('update showcase set hero = ? where project_id = ?').bind(hero, projectId).run();

/** The images on a published design's page, newest first */
export const publicRenders = async (projectId: string) =>
  (
    await db()
      .prepare(
        'select id, project_id, user_id, style, style_name, shot, shot_name, provider, public, created_at from render where project_id = ? and public = 1 order by created_at desc',
      )
      .bind(projectId)
      .all<RenderInfo>()
  ).results;
