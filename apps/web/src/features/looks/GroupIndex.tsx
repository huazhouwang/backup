import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item';
import { m } from '@/lib/i18n';

/**
 * The index of a library's groups: a list beside the looks on wide screens; on phones, a row of chips above them that stays at the
 * top while scrolling (left out when there are only one or two groups, whose headings are enough)
 */
export function GroupIndex({ entries }: { entries: { href: string; name: string; count: number }[] }) {
  return (
    <>
      {entries.length >= 3 && (
        <nav
          aria-label={m.libraries_groups()}
          className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-background px-4 py-2 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
        >
          {entries.map(e => (
            <Button key={e.href} size="sm" variant="outline" className="shrink-0" nativeButton={false} render={<a href={e.href} />}>
              {e.name} <span className="text-muted-foreground">{e.count}</span>
            </Button>
          ))}
        </nav>
      )}
      <nav aria-label={m.libraries_groups()} className="hidden md:sticky md:top-4 md:block md:self-start">
        <ItemGroup className="gap-1">
          {entries.map(e => (
            <Item key={e.href} size="xs" render={<a href={e.href} />} className="hover:bg-muted">
              <ItemContent>
                <ItemTitle>
                  {e.name} <span className="text-muted-foreground">{e.count}</span>
                </ItemTitle>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </nav>
    </>
  );
}
