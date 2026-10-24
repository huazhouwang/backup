import { createFileRoute } from '@tanstack/react-router';
import { LibraryPage } from '@/features/looks/LibraryPage';

export const Route = createFileRoute('/looks/$libraryId')({ component: LibraryPage });
