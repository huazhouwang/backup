import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';

export function LibraryCreate() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => api<{ id: string }>('/libraries', { method: 'POST', json: { name: name.trim() } }),
    onSuccess: r => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['libraries'] });
      void navigate({ to: '/looks/$libraryId', params: { libraryId: r.id } });
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
        placeholder={m.libraries_new_placeholder()}
        aria-label={m.libraries_new_placeholder()}
        className="sm:w-80"
      />
      <Button type="submit" variant="outline" disabled={!name.trim() || create.isPending}>
        <PlusIcon /> {m.libraries_new()}
      </Button>
    </form>
  );
}
