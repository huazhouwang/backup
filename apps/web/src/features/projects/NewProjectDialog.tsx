import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { LoaderIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';

export function NewProject({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState<string>(() => m.projects_default_name());
  const [template, setTemplate] = useState<'blank' | 'sample'>('blank');
  const [floors, setFloors] = useState('2');
  const create = useMutation({
    mutationFn: () => api<{ id: string }>('/projects', { method: 'POST', json: { name, template, floors: Number(floors) } }),
    onSuccess: r => navigate({ to: '/p/$projectId', params: { projectId: r.id } }),
    onError: e => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.projects_new()}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field>
            <FieldLabel htmlFor="pname">{m.projects_name()}</FieldLabel>
            <Input id="pname" value={name} onChange={e => setName(e.target.value)} required maxLength={60} />
          </Field>
          <Field>
            <FieldLabel>{m.projects_start_from()}</FieldLabel>
            <Select value={template} onValueChange={v => setTemplate(v as 'blank' | 'sample')}>
              <SelectTrigger className="w-full">
                <SelectValue>{template === 'blank' ? m.projects_template_blank() : m.projects_template_sample()}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blank">{m.projects_template_blank()}</SelectItem>
                <SelectItem value="sample">{m.projects_template_sample()}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {template === 'blank' && (
            <Field>
              <FieldLabel>{m.projects_floors()}</FieldLabel>
              <Select value={floors} onValueChange={v => setFloors(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{m.projects_floor_count({ n: floors })}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {['1', '2', '3', '4'].map(n => (
                    <SelectItem key={n} value={n}>
                      {m.projects_floor_count({ n })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <DialogFooter>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending && <LoaderIcon className="animate-spin" />}
              {m.projects_create()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
