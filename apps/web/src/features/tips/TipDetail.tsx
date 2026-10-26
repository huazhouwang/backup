import { tipById } from '@bobo/shared'
import { Link, useNavigate } from '@tanstack/react-router'
import { clsx } from 'clsx'

import { Button } from '../../components/ui/Button'
import { NoticeCard } from '../../components/ui/Card'
import { ChatIcon } from '../../components/ui/ChatIcon'
import { Chevron } from '../../components/ui/Chevron'
import { TopicIcon } from '../../components/ui/TopicIcon'
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

/** One tip in full, with a way to ask Bobo more about it. */
export function TipDetail({ tipId }: { tipId: string }) {
  const tip = tipById(tipId)
  const { userId } = useAccess()
  const navigate = useNavigate()
  const back = (
    <Link
      to="/tips"
      className="flex min-h-touch items-center gap-1 self-start font-bold text-fg-muted"
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
      <header className={clsx('flex flex-col gap-2 rounded-xl p-5', style.card)}>
        <TopicIcon topic={tip.topic} className={clsx('size-12', style.icon)} />
        <h1 className={clsx('m-0 text-title font-extrabold', style.text)}>{tip.title}</h1>
        <p className="m-0 text-fg-muted">{tip.teaser}</p>
      </header>
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-body font-extrabold">{m.tipWhat()}</h2>
        <p className="m-0">{tip.what}</p>
      </section>
      {tip.signs && <List title={m.tipSigns()} items={tip.signs} />}
      <List title={m.tipTodo()} items={tip.todo} />
      {tip.doctor && (
        <section className="flex flex-col gap-1.5 rounded-xl bg-danger-soft p-4">
          <h2 className="m-0 text-body font-extrabold text-danger-text">{m.tipDoctor()}</h2>
          <p className="m-0 text-danger-text">{tip.doctor}</p>
        </section>
      )}
      {userId && (
        <Button size="lg" block onClick={ask} className="gap-2">
          <ChatIcon className="size-6" />
          {m.tipAskBobo()}
        </Button>
      )}
      <p className="m-0 text-caption text-fg-muted">{m.tipSource({ source: tip.source })}</p>
    </article>
  )
}
