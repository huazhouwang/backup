import { HistoryIcon, MessageSquareIcon, MessagesSquareIcon, RulerIcon, InfoIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { m } from '@/lib/i18n';
import { ChatPanel } from '../ChatPanel';
import { AreasPanel, CommentsPanel, PropsPanel, VersionsPanel } from '../panels';
import { svgToPng } from '../plan/Plan2D';
import { ShareDialog } from '../ShareDialog';
import { useEditor } from '../store';
import { download } from '@/lib/download';
import { useIsMobile } from '@/lib/use-is-mobile';
import { Conflict } from './SaveStatus';
import { EditorCanvas } from './EditorCanvas';
import { Thumbnail } from './Thumbnail';
import { Toolbar } from './Toolbar';

type Tab = 'chat' | 'props' | 'areas' | 'comments' | 'versions';
const TABS: { id: Tab; label: () => string; icon: typeof InfoIcon }[] = [
  { id: 'chat', label: m.editor_tab_chat, icon: MessagesSquareIcon },
  { id: 'props', label: m.editor_tab_props, icon: InfoIcon },
  { id: 'areas', label: m.editor_tab_areas, icon: RulerIcon },
  { id: 'comments', label: m.editor_tab_comments, icon: MessageSquareIcon },
  { id: 'versions', label: m.editor_tab_versions, icon: HistoryIcon },
];

function PanelBody() {
  return (
    <>
      <TabsContent value="chat" keepMounted className="min-h-0 flex-1 data-[hidden]:hidden">
        <ChatPanel />
      </TabsContent>
      <TabsContent value="props" className="min-h-0 flex-1 overflow-y-auto">
        <PropsPanel />
      </TabsContent>
      <TabsContent value="areas" className="min-h-0 flex-1 overflow-y-auto">
        <AreasPanel />
      </TabsContent>
      <TabsContent value="comments" className="min-h-0 flex-1">
        <CommentsPanel />
      </TabsContent>
      <TabsContent value="versions" className="min-h-0 flex-1 overflow-y-auto">
        <VersionsPanel />
      </TabsContent>
    </>
  );
}

export function Workspace() {
  const view = useEditor(s => s.view);
  const project = useEditor(s => s.project);
  const setCapture = useEditor(s => s.setCapture);
  const ask = useEditor(s => s.ask);
  const svgRef = useRef<SVGSVGElement>(null);
  const mobile = useIsMobile();
  const [tab, setTab] = useState<Tab>('chat');
  const [sheet, setSheet] = useState(false);
  const [share, setShare] = useState(false);

  // In plan mode the SVG provides the screenshot
  useEffect(() => {
    if (view.mode === '2d') {
      setCapture(() => (svgRef.current ? svgToPng(svgRef.current) : Promise.reject(new Error(m.editor_plan_not_ready()))));
      return () => setCapture(null);
    }
  }, [view.mode]);

  const capture = useEditor(s => s.capture);
  const exportImage = async () => {
    try {
      const r = await capture!();
      const lv = project.levels.find(l => l.id === view.level)?.name ?? '';
      await download(r.dataUrl, `${project.name}-${lv}-${view.mode === '3d' ? m.editor_view_3d() : m.editor_view_2d()}.png`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.editor_export_failed());
    }
  };

  // Something was handed to the agent (e.g. from a comment): show the chat
  useEffect(() => {
    if (ask) setTab('chat');
  }, [ask]);

  // On phones, open the properties panel when an object is selected
  const sel = view.selection[0];
  useEffect(() => {
    if (sel && tab !== 'chat') setTab('props');
  }, [sel]);

  const tabs = (
    <Tabs value={tab} onValueChange={v => setTab(v as Tab)} className="flex h-full min-h-0 flex-col gap-0">
      <TabsList variant="line" className="w-full shrink-0 justify-start border-b px-2">
        {TABS.map(t => (
          <TabsTrigger key={t.id} value={t.id} className="flex-none">
            {t.label()}
          </TabsTrigger>
        ))}
      </TabsList>
      <PanelBody />
    </Tabs>
  );

  return (
    <div className="flex h-dvh flex-col">
      <Toolbar onShare={() => setShare(true)} onExport={exportImage} />
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1" aria-label={m.editor_canvas()}>
          <Conflict />
          <EditorCanvas svgRef={svgRef} />
          {mobile && (
            <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t bg-background/95 pb-[env(safe-area-inset-bottom)]">
              {TABS.slice(0, 4).map(t => (
                <Button
                  key={t.id}
                  variant="ghost"
                  className="h-auto flex-1 flex-col gap-0.5 rounded-none py-2 text-xs font-normal"
                  onClick={() => {
                    setTab(t.id);
                    setSheet(true);
                  }}
                >
                  <t.icon className="size-5" />
                  {t.label()}
                </Button>
              ))}
            </nav>
          )}
        </main>
        {!mobile && <aside className="flex w-[380px] shrink-0 flex-col border-l lg:w-[420px]">{tabs}</aside>}
      </div>
      {mobile && (
        <Sheet open={sheet} onOpenChange={setSheet}>
          {/* The base bottom sheet is h-auto under data-[side=bottom]; the height must use the same variant to win, or the panels grow instead of scrolling */}
          <SheetContent side="bottom" className="gap-0 p-0 data-[side=bottom]:h-[75dvh]">
            <SheetHeader className="sr-only">
              <SheetTitle>{TABS.find(t => t.id === tab)?.label()}</SheetTitle>
            </SheetHeader>
            {tabs}
          </SheetContent>
        </Sheet>
      )}
      <ShareDialog open={share} onOpenChange={setShare} />
      <Thumbnail />
    </div>
  );
}
