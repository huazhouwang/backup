import { createFileRoute } from '@tanstack/react-router';
import { WidgetLibrariesPage } from '@/features/widgets/WidgetLibrariesPage';

export const Route = createFileRoute('/widgets/')({ component: WidgetLibrariesPage });
