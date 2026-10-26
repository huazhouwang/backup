import { createFileRoute } from '@tanstack/react-router';
import { WidgetLibraryPage } from '@/features/widgets/WidgetLibraryPage';

export const Route = createFileRoute('/widgets/$libraryId')({ component: WidgetLibraryPage });
