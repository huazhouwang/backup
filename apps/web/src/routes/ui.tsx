import { Badge } from '@lullabo/ui/badge'
import { Button, type ButtonTone } from '@lullabo/ui/button'
import { Card, CardTitle, NoticeCard } from '@lullabo/ui/card'
import { Input } from '@lullabo/ui/input'
import { RollingText } from '@lullabo/ui/rolling-text'
import { SegmentedControl } from '@lullabo/ui/segmented-control'
import { Sheet } from '@lullabo/ui/sheet'
import { showToast } from '@lullabo/ui/toast'
import { ChipGroup } from '@lullabo/ui/toggle-chip'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useState } from 'react'

import { DeleteConfirmSheet } from '../components/DeleteConfirmSheet'
import { Chevron } from '../components/icons/Chevron'
import { ListRow } from '../components/ListRow'
import { PageHeader } from '../components/PageHeader'
import { SettingsGroup, SettingsRow } from '../features/settings/SettingsLayout'
import { m } from '../paraglide/messages.js'

// Component preview for development; linked from settings in dev builds only.
export const Route = createFileRoute('/ui')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  component: UiPreviewPage,
})

const categories: { tone: ButtonTone; label: () => string }[] = [
  { tone: 'feeding', label: m.categoryFeeding },
  { tone: 'sleep', label: m.categorySleep },
  { tone: 'diaper', label: m.categoryDiaper },
]

function UiPreviewPage() {
  const [side, setSide] = useState<'left' | 'right'>('left')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [count, setCount] = useState(1)
  const [minutes, setMinutes] = useState<number | null>(5)

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={m.settingsUiPreview()} />

      <div className="flex flex-col gap-3">
        <h2 className="text-title font-extrabold">{m.uiButtons()}</h2>
        <Button size="lg" block>
          {m.actionSave()}
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 shrink-0">
            {m.actionCancel()}
          </Button>
          <Button tone="destructive" className="flex-1 shrink-0">
            {m.actionDelete()}
          </Button>
        </div>
        <Button variant="ghost" tone="diaper">
          {m.actionCancel()}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-title font-extrabold">{m.uiCategories()}</h2>
        <div className="grid grid-cols-3 gap-3">
          {categories.map((category) => (
            <Button key={category.tone} tone={category.tone} size="lg">
              {category.label()}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {categories.map((category) => (
            <Button key={category.tone} tone={category.tone} variant="soft">
              {category.label()}
            </Button>
          ))}
        </div>
      </div>

      <Card className="flex flex-col gap-4">
        <SegmentedControl
          label={m.uiSide()}
          options={[
            { value: 'left', label: m.sideLeft() },
            { value: 'right', label: m.sideRight() },
          ]}
          value={side}
          onChange={setSide}
        />
        <ChipGroup<number>
          legend={m.uiChoices()}
          options={[0, 5, 15]}
          value={minutes}
          onChange={setMinutes}
          optionLabel={(value) => m.durationMinutes({ minutes: value })}
        />
        <Input label={m.uiNameLabel()} hint={m.uiNameHint()} />
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-title font-extrabold">{m.uiPills()}</h2>
        <div className="flex items-center gap-3">
          <Badge>{m.roleOwner()}</Badge>
          <Badge tone="primary">{m.growthPercentile({ value: 50 })}</Badge>
          <Badge tone="destructive">{m.timerRunning()}</Badge>
          <Chevron direction="left" />
          <Chevron />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-title font-extrabold">{m.uiCardsAndRows()}</h2>
        <Card as="section" className="flex flex-col gap-1">
          <CardTitle small>{m.uiNameLabel()}</CardTitle>
          <ul className="m-0 flex list-none flex-col p-0">
            <li className="border-b-2 border-border">
              <ListRow title={m.actionSave()} detail={m.uiRowSummary()} trailing={<Chevron />} />
            </li>
            <li>
              <ListRow
                title={
                  <>
                    <span className="truncate">{m.uiNameLabel()}</span>
                    <Badge>{m.roleOwner()}</Badge>
                  </>
                }
                detail={m.uiRowSummary()}
              />
            </li>
          </ul>
        </Card>
        <NoticeCard>{m.uiRowSummary()}</NoticeCard>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-title font-extrabold">{m.uiSettingsList()}</h2>
        <SettingsGroup>
          <SettingsRow link={{ to: '/ui' }} title={m.actionSave()} summary={m.uiRowSummary()} />
          <SettingsRow
            link={{ to: '/ui' }}
            title={m.uiNameLabel()}
            badge={<Badge className="shrink-0">{m.roleOwner()}</Badge>}
            summary={m.uiRowSummary()}
          />
        </SettingsGroup>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-title font-extrabold">{m.uiToasts()}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => showToast(m.uiToastMessage())}>
            {m.uiToastNeutral()}
          </Button>
          <Button
            variant="outline"
            onClick={() => showToast(m.uiToastMessage(), { tone: 'success' })}
          >
            {m.uiToastSuccess()}
          </Button>
          <Button
            variant="outline"
            onClick={() => showToast(m.uiToastMessage(), { tone: 'error' })}
          >
            {m.uiToastError()}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              showToast(m.uiToastMessage(), {
                action: { label: m.actionSave(), onClick: () => undefined },
              })
            }
          >
            {m.uiToastAction()}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-title font-extrabold">{m.uiRolling()}</h2>
        <div className="flex items-center gap-3">
          <span className="text-display font-extrabold">
            <RollingText>{String(count)}</RollingText>
          </span>
          <Button variant="soft" onClick={() => setCount((value) => value + 1)}>
            {m.uiRollingNext()}
          </Button>
        </div>
      </div>

      <Button variant="soft" tone="destructive" onClick={() => setDeleteOpen(true)}>
        {m.uiDeleteConfirm()}
      </Button>
      <DeleteConfirmSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={m.uiDeleteConfirm()}
        emptyMessage={m.uiDeleteItem()}
        consequences={{
          lead: m.deleteLead({ name: m.uiDeleteName() }),
          items: [m.uiDeleteItem()],
          name: m.uiDeleteName(),
          typeLabel: m.uiDeleteType(),
        }}
        onConfirm={() => setDeleteOpen(false)}
      />

      <Button variant="soft" tone="diaper" onClick={() => setSheetOpen(true)}>
        {m.uiOpenSheet()}
      </Button>
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={m.uiSheetTitle()}>
        <Input label={m.uiNameLabel()} inputMode="numeric" />
        <Button size="lg" block onClick={() => setSheetOpen(false)}>
          {m.actionSave()}
        </Button>
      </Sheet>
    </section>
  )
}
