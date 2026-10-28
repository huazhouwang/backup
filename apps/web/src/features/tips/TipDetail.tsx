import { tipById } from '@lullabo/shared'
import { Button } from '@lullabo/ui/button'
import { NoticeCard } from '@lullabo/ui/card'
import { cn } from '@lullabo/ui/utils'
import { Link, useNavigate } from '@tanstack/react-router'

import { ChatIcon } from '../../components/icons/ChatIcon'
import { Chevron } from '../../components/icons/Chevron'
import { TopicIcon } from '../../components/icons/TopicIcon'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { TOPIC_STYLE } from './topic-style'

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-body font-extrabold">{title}</h2>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

/** One tip in full, with a way to ask the AI more about it. */
export function TipDetail({ tipId }: { tipId: string }) {
  const tip = tipById(tipId)
  const { userId } = useAccess()
  const navigate = useNavigate()
  const back = (
    <Link
      to="/tips"
      className="flex min-h-touch items-center gap-1 self-start font-bold text-muted-foreground"
    >
      <Chevron direction="left" />
      {m.tabTips()}
    </Link>
  )
  if (!tip) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <NoticeCard>{m.tipNotFound()}</NoticeCard>
      </div>
    )
  }
  const style = TOPIC_STYLE[tip.topic]
  // Questions about the tip come up ready to tap, so the keyboard stays down.
  const ask = () => void navigate({ to: '/chat', search: { tip: tip.id } })
  return (
    <article className="flex flex-col gap-5">
      {back}
      <header className={cn('flex flex-col gap-2 rounded-xl p-5', style.card)}>
        <TopicIcon topic={tip.topic} className={cn('size-12', style.icon)} />
        <h1 className={cn('m-0 text-title font-extrabold', style.text)}>{tip.title}</h1>
        <p className="m-0 text-muted-foreground">{tip.teaser}</p>
      </header>
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-body font-extrabold">{m.tipWhat()}</h2>
        <p className="m-0">{tip.what}</p>
      </section>
      {tip.signs && <List title={m.tipSigns()} items={tip.signs} />}
      <List title={m.tipTodo()} items={tip.todo} />
      {tip.doctor && (
        <section className="flex flex-col gap-1.5 rounded-xl bg-destructive-soft p-4">
          <h2 className="m-0 text-body font-extrabold text-destructive-text">{m.tipDoctor()}</h2>
          <p className="m-0 text-destructive-text">{tip.doctor}</p>
        </section>
      )}
      {userId && (
        <Button size="lg" block onClick={ask} className="gap-2">
          <ChatIcon className="size-6" />
          {m.tipAskMore()}
        </Button>
      )}
      <p className="m-0 text-caption text-muted-foreground">
        {m.tipSource({ source: tip.source })}
      </p>
    </article>
  )
}
