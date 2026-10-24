import { createFileRoute } from '@tanstack/react-router';
import { LookPage } from '@/features/looks/LookPage';

export const Route = createFileRoute('/looks/$libraryId_/$lookId')({ component: LookPage });
