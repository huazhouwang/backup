/** Comment rows as the API returns them, shared by the Worker, the comments panel and the agent's comment capabilities. */

export const COMMENT_STATUSES = ['open', 'pending-confirm', 'resolved'] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export interface CommentRow {
  id: string;
  target_id: string | null;
  target_name: string | null;
  parent_id: string | null;
  author_id: string | null;
  author: string | null;
  body: string;
  status: CommentStatus;
  created_at: number;
}
