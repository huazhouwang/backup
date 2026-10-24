import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ProjectPage } from '@/features/editor/ProjectPage';

export const Route = createFileRoute('/p/$projectId')({
  validateSearch: z.object({
    level: z.string().optional(),
    mode: z.enum(['2d', '3d']).optional(),
    focus: z.string().optional(),
    v: z.coerce.number().int().positive().optional(),
  }),
  component: ProjectPage,
});
