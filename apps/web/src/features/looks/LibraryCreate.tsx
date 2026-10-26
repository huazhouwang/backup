import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';

/** Create a library of the user's and open it: a look library, or a widget library with `widgets` */
export function LibraryCreate({ widgets }: { widgets?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => api<{ id: string }>(widgets ? '/widget-libraries' : '/libraries', { method: 'POST', json: { name: name.trim() } }),
    onSuccess: r => {
      setName('');
      void qc.invalidateQueries({ queryKey: [widgets ? 'widget-libraries' : 'libraries'] });
      void navigate(widgets ? { to: '/widgets/$libraryId', params: { libraryId: r.id } } : { to: '/looks/$libraryId', params: { libraryId: r.id } });
    },
    onError: e => toast.error(e.message),
  });
  return (
    <form
      className="flex gap-2"
      onSubmit={e => {
        e.preventDefault();
        if (name.trim()) create.mutate();
      }}
    >
      <Input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={widgets ? m.widget_libraries_new_placeholder() : m.libraries_new_placeholder()}
        aria-label={widgets ? m.widget_libraries_new_placeholder() : m.libraries_new_placeholder()}
        className="sm:w-80"
      />
      <Button type="submit" variant="outline" disabled={!name.trim() || create.isPending}>
        <PlusIcon /> {widgets ? m.widget_libraries_new() : m.libraries_new()}
      </Button>
    </form>
  );
}
