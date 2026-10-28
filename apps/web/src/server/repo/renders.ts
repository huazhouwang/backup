/** Style renders (issue 195): the images made of a design, each with the colour pass it started from */
import type { RenderInfo } from '@/shared/renders';
import { db, newId, now } from './db';

export type RenderRow = RenderInfo;

const COLUMNS = 'id, project_id, user_id, style, style_name, shot, shot_name, provider, public, created_at';

export async function addRender(r: Omit<RenderRow, 'id' | 'created_at'> & { image: string; source: string }) {
  const id = newId('r');
  await db()
    .prepare(
      'insert into render (id, project_id, user_id, style, style_name, shot, shot_name, provider, image, source, public, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(id, r.project_id, r.user_id, r.style, r.style_name, r.shot, r.shot_name, r.provider, r.image, r.source, r.public, now())
    .run();
  return (await getRender(id))!;
}

export const getRender = (id: string) => db().prepare(`select ${COLUMNS} from render where id = ?`).bind(id).first<RenderRow>();

export const listRenders = async (projectId: string) =>
  (await db().prepare(`select ${COLUMNS} from render where project_id = ? order by created_at desc`).bind(projectId).all<RenderRow>()).results;

/** The image itself, or the colour pass it started from */
export const renderImage = (id: string, which: 'image' | 'source') =>
  db()
    .prepare(`select ${which === 'image' ? 'image' : 'source'} as url from render where id = ?`)
    .bind(id)
    .first<{ url: string }>();

export const setRenderPublic = (projectId: string, id: string, pub: boolean) =>
  db()
    .prepare('update render set public = ? where id = ? and project_id = ?')
    .bind(pub ? 1 : 0, id, projectId)
    .run();

export const deleteRender = (projectId: string, id: string) => db().prepare('delete from render where id = ? and project_id = ?').bind(id, projectId).run();
