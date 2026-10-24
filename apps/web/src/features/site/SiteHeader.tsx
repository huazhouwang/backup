import { Link, useNavigate } from '@tanstack/react-router';
import { LogOutIcon, SettingsIcon, UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';
import { m } from '@/lib/i18n';
import { queryClient, useMe } from '@/lib/query';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-medium tracking-tight">
      <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
        <rect x="4" y="18" width="24" height="10" fill="currentColor" />
        <rect x="9" y="6" width="14" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
      Plinth
    </Link>
  );
}

export function SiteHeader() {
  const me = useMe();
  const navigate = useNavigate();
  const user = me.data?.user;
  const signOut = async () => {
    await authClient.signOut();
    queryClient.clear();
    void navigate({ to: '/' });
  };
  return (
    <header className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4">
      <Logo />
      <div className="flex-1" />
      {user ? (
        <>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/projects" />}>
            {m.site_my_projects()}
          </Button>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/looks" />}>
            {m.nav_libraries()}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={m.site_account()} />}>
              <UserIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal text-muted-foreground">{user.isAnonymous ? m.site_guest() : user.email}</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {user.isAnonymous && (
                <DropdownMenuItem render={<Link to="/login" />}>
                  <UserIcon /> {m.site_sign_in_to_save()}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem render={<Link to="/settings" />}>
                <SettingsIcon /> {m.site_settings()}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut}>
                <LogOutIcon /> {m.site_sign_out()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : (
        <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/login" />}>
          {m.site_sign_in()}
        </Button>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-5xl flex-wrap gap-4 px-4 py-8 text-xs text-muted-foreground">
      <span>Plinth</span>
      <Link to="/privacy" className="hover:underline">
        {m.site_privacy()}
      </Link>
      <Link to="/terms" className="hover:underline">
        {m.site_terms()}
      </Link>
      <span className="flex-1" />
      <span>{m.site_disclaimer()}</span>
    </footer>
  );
}
