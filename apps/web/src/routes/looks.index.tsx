import { createFileRoute } from '@tanstack/react-router';
import { LibrariesPage } from '@/features/looks/LibrariesPage';

export const Route = createFileRoute('/looks/')({ component: LibrariesPage });
