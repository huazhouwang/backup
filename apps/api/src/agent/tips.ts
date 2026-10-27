import {
  type BabyAge,
  type Stage,
  TIPS,
  type Tip,
  doctorSignsFor,
  milestonesFor,
  stageFor,
} from '@lullabo/shared'

/**
 * The app's tips, for the assistant to answer parenting questions from: the same library
 * the Tips tab shows, so what it says agrees with what the parent read.
 */

/** Every tip in a line, "id：标题（简介）", for the instructions. */
export const tipIndex = () => TIPS.map((tip) => `${tip.id}：${tip.title}（${tip.teaser}）`)

/** A tip in full, as plain text. */
export function tipText(tip: Tip): string {
  return [
    `「${tip.title}」${tip.teaser}`,
    `这是什么：${tip.what}`,
    tip.signs ? `信号：${tip.signs.join('；')}` : '',
    `可以怎么做：${tip.todo.join('；')}`,
    tip.doctor ? `什么时候看医生：${tip.doctor}` : '',
    `来源：${tip.source}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** What a baby of this age is like: the stage, its tips, milestones and doctor signs. */
export function stageText(age: BabyAge): string {
  const stage: Stage = stageFor(age)
  const milestones = milestonesFor(stage)
  return [
    `${stage.label}：${stage.summary}`,
    `这个阶段的贴士：${stage.tips.join('、')}`,
    `${milestones.by} 个月前后多数宝宝会：${milestones.items.join('；')}`,
    `遇到这些要看医生：${doctorSignsFor(stage).items.join('；')}`,
  ].join('\n')
}
