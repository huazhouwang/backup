import { Autocomplete, AutocompleteContent, AutocompleteInput, AutocompleteItem, AutocompleteList } from '@/components/ui/autocomplete';

/** Model name: suggestions for the provider, any other name can be typed */
export function ModelInput({
  id,
  value,
  onChange,
  suggestions,
  className,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  className?: string;
}) {
  return (
    <Autocomplete
      items={suggestions}
      value={value}
      onValueChange={v => onChange(v)}
      // A name picked from the list shows the whole list again, so another one is one click away
      filter={(s: string, q) => !q || suggestions.includes(q) || s.toLowerCase().includes(q.toLowerCase())}
      openOnInputClick
    >
      <AutocompleteInput id={id} className={className} required placeholder={suggestions[0]} />
      <AutocompleteContent>
        <AutocompleteList>
          {(s: string) => (
            <AutocompleteItem key={s} value={s}>
              {s}
            </AutocompleteItem>
          )}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  );
}
