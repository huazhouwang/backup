/** The old style gallery lives on as the default library's page */
import { DEFAULT_LIBRARY_ID } from '@plinth/core';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute('/gallery')({
  validateSearch: z.object({ p: z.string().optional() }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/looks/$libraryId', params: { libraryId: DEFAULT_LIBRARY_ID }, search });
  },
});
