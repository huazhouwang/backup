import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { UploadIcon } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { m } from '@/lib/i18n';
import { importLibrary } from '@/lib/libraries';
import { importWidgetLibrary } from '@/lib/widget-libraries';

/** Import a library file (*.looklib.json, or *.widgetlib.json with `widgets`) as a new library of the user's, then open it */
export function LibraryImport({ widgets }: { widgets?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const run = useMutation({
    mutationFn: async (f: File) => (widgets ? importWidgetLibrary : importLibrary)(JSON.parse(await f.text())),
    onSuccess: r => {
      void qc.invalidateQueries({ queryKey: [widgets ? 'widget-libraries' : 'libraries'] });
      void navigate(widgets ? { to: '/widgets/$libraryId', params: { libraryId: r.id } } : { to: '/looks/$libraryId', params: { libraryId: r.id } });
    },
    onError: e => toast.error(e instanceof SyntaxError ? m.libraries_import_not_json() : e.message),
  });
  return (
    <>
      <Input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) run.mutate(f);
        }}
      />
      <Button variant="outline" disabled={run.isPending} onClick={() => input.current?.click()}>
        <UploadIcon /> {widgets ? m.widget_libraries_import() : m.libraries_import()}
      </Button>
    </>
  );
}
