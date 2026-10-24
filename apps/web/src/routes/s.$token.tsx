import { createFileRoute } from '@tanstack/react-router';
import { AcceptSharePage } from '@/features/projects/AcceptSharePage';

export const Route = createFileRoute('/s/$token')({ component: AcceptSharePage });
