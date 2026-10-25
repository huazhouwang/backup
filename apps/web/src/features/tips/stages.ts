import type { BabyAge } from '@bobo/shared'

/**
 * What a baby is like at each stage, from birth to 24 months: week by week for the first 12
 * weeks, then month by month. Content written once and checked against its sources (see
 * library.ts); milestones follow the CDC checkpoints (2022), the signs to see a doctor
 * about follow 国家卫健委《0–6 岁儿童心理行为发育预警征象》.
 */
export interface Stage {
  id: string
  label: string
  /** Age in months the stage starts at. */
  from: number
  /** Age in months the stage stands for, for the usual feeding and sleep (ageNorms). */
  months: number
  summary: string
  tips: string[]
}

const DAYS_A_MONTH = 30.44

const week = (n: number, summary: string, tips: string[]): Stage => ({
  id: `w${n}`,
  label: `第 ${n} 周`,
  from: ((n - 1) * 7) / DAYS_A_MONTH,
  months: ((n - 0.5) * 7) / DAYS_A_MONTH,
  summary,
  tips,
})
const month = (n: number, summary: string, tips: string[]): Stage => ({
  id: `m${n}`,
  label: `${n} 个月`,
  from: n,
  months: n + 0.5,
  summary,
  tips,
})

export const STAGES: readonly Stage[] = [
  week(1, '大部分时间都在睡，一天睡 16–17 个小时。体重会先降一点，一般 7–10 天回到出生体重。', [
    'newborn-feeding',
    'safe-sleep',
    'jaundice',
    'cord-care',
  ]),
  week(2, '体重回到出生时左右，醒着的时间多了一点，听到声音会安静下来。', [
    'newborn-feeding',
    'vitamin-d',
    'burping',
    'cord-care',
  ]),
  week(3, '常常迎来第一次猛长期，吃奶突然变勤。哭闹也开始变多。', [
    'growth-spurt',
    'burping',
    'crying',
  ]),
  week(4, '趴着时能短暂抬一下头，喜欢盯着人脸看。', ['tummy-time', 'crying', 'day-night']),
  week(5, '哭闹可能越来越多，傍晚尤其明显，这是正常的高峰期。', [
    'crying',
    'tummy-time',
    'talk-back',
  ]),
  week(6, '可能第一次对你露出真正的微笑，也常有一次猛长期。', [
    'crying',
    'growth-spurt',
    'talk-back',
  ]),
  week(7, '开始发出"啊、哦"的咕咕声，眼睛会跟着人移动。', ['talk-back', 'day-night', 'tummy-time']),
  week(8, '笑得更多了，也更喜欢和人互动。按接种本按时体检打疫苗。', [
    'talk-back',
    'tummy-time',
    'fever',
  ]),
  week(9, '趴着时头抬得更稳，开始盯着自己的小手看。', ['tummy-time', 'day-night', 'talk-back']),
  week(10, '会用咕咕声"回应"你，夜里连续睡的时间可能变长。', [
    'self-settle',
    'talk-back',
    'safe-sleep',
  ]),
  week(11, '开始把手放进嘴里，试着去够眼前的东西。', ['tummy-time', 'self-settle', 'fever']),
  week(12, '哭闹高峰慢慢过去，作息开始有点规律了。', ['self-settle', 'growth-spurt', 'tummy-time']),
  month(3, '能稳稳地抬头，会咯咯笑，开始有自己的作息规律。', [
    'self-settle',
    'tummy-time',
    'fever',
  ]),
  month(4, '趴着能抬头看四周，开始学翻身；听到声音会转头去找，被逗时咯咯笑。', [
    'sleep-regression',
    'rolling-safety',
    'solids-ready',
  ]),
  month(5, '会伸手抓东西往嘴里送，可能已经会从趴着翻到仰躺。', [
    'rolling-safety',
    'solids-ready',
    'teething',
  ]),
  month(6, '扶着能坐，开始准备添加辅食，第一颗牙可能快冒出来了。', [
    'first-foods',
    'teething',
    'cup',
  ]),
  month(7, '能自己坐一会儿，会把玩具从一只手换到另一只手。', [
    'first-foods',
    'teething',
    'babyproof',
  ]),
  month(8, '开始认生，可能会用肚子或手膝爬，喜欢"啪啪"地拍东西。', [
    'separation',
    'babyproof',
    'finger-food',
  ]),
  month(9, '叫名字会回头，会发出"妈妈、爸爸"的音，喜欢找藏起来的东西。', [
    'finger-food',
    'separation',
    'babyproof',
  ]),
  month(10, '扶着家具能站起来，开始用拇指和食指捏小东西。', [
    'finger-food',
    'babyproof',
    'first-words',
  ]),
  month(11, '可能会扶着走几步，开始模仿大人的动作和声音。', [
    'first-words',
    'self-feeding',
    'walking',
  ]),
  month(12, '会挥手再见，有意识地叫爸爸妈妈，可能迈出第一步。', [
    'milk-after-one',
    'walking',
    'first-words',
  ]),
  month(13, '走得越来越多，喜欢把东西放进去再拿出来。', ['walking', 'self-feeding', 'nap-shift']),
  month(14, '能听懂简单的指令，比如"把球给我"。', ['first-words', 'self-feeding', 'nap-shift']),
  month(15, '会说一两个词，会用手指想要的东西。', ['nap-shift', 'picky', 'screens']),
  month(16, '喜欢爬上爬下，会用勺子吃一点东西。', ['picky', 'self-feeding', 'screens']),
  month(17, '词汇在慢慢增加，开始有自己的主意。', ['tantrums', 'first-words', 'picky']),
  month(18, '能说好几个词，会指给你看感兴趣的东西，走得很稳了。', ['tantrums', 'screens', 'potty']),
  month(19, '喜欢模仿做家务，会自己脱袜子。', ['tantrums', 'picky', 'potty']),
  month(20, '会跑了，能听懂更多的话，开始玩简单的假装游戏。', ['potty', 'screens', 'tantrums']),
  month(21, '开始把两个词连起来说，比如"妈妈抱"。', ['first-words', 'potty', 'picky']),
  month(22, '会踢球，能翻书页，喜欢自己的事自己来。', ['tantrums', 'potty', 'self-feeding']),
  month(23, '能指认书里很多东西，会注意到别人难过。', ['potty', 'screens', 'picky']),
  month(24, '能说两三个词的短句，会跑会踢球，越来越有自己的想法。', [
    'potty',
    'tantrums',
    'screens',
  ]),
]

/** The stage for an age: by weeks until 12 weeks, by months after, the last one from 24 months. */
export function stageFor(age: BabyAge): Stage {
  if (age.totalDays < 12 * 7) {
    return STAGES[Math.max(0, Math.floor(age.totalDays / 7))] ?? STAGES[0]!
  }
  const id = `m${Math.min(24, Math.max(3, age.months))}`
  return STAGES.find((stage) => stage.id === id) ?? STAGES.at(-1)!
}

/** What most babies do by each checkpoint (CDC, 2022), shown on the stages leading up to it. */
const MILESTONES: Array<{ by: number; items: string[] }> = [
  { by: 2, items: ['对着你笑', '你说话时会安静下来或看向你', '趴着能抬一下头', '手能张开'] },
  {
    by: 4,
    items: ['被逗时咯咯笑出声', '会用咕咕声回应你', '趴着能用手臂撑起胸口', '能握住放在手里的玩具'],
  },
  {
    by: 6,
    items: ['认得熟悉的人', '会笑出声，和你轮流"说话"', '从趴着翻到仰躺', '伸手去抓想要的东西'],
  },
  {
    by: 9,
    items: [
      '会认生',
      '叫名字会回头',
      '发出"妈妈、爸爸"这样的音',
      '不用扶能坐稳',
      '把东西从一只手换到另一只手',
    ],
  },
  { by: 12, items: ['会挥手再见', '叫"爸爸""妈妈"', '扶着家具走', '用拇指和食指捏起小东西'] },
  { by: 15, items: ['会说一两个词', '用手指想要的东西', '自己走几步', '用手指自己吃东西'] },
  { by: 18, items: ['会说三个以上的词', '指给你看感兴趣的东西', '自己走得稳', '跟着简单的指令做'] },
  { by: 24, items: ['说两个词的短句', '会跑、会踢球', '指认书里的东西', '注意到别人难过'] },
]

/** The milestones of the checkpoint a stage leads up to (or is at). */
export function milestonesFor(stage: Stage) {
  return MILESTONES.find((checkpoint) => checkpoint.by >= stage.from) ?? MILESTONES.at(-1)!
}

/**
 * When to see a doctor: newborn danger signs at first, then the warning signs for the last
 * checkpoint the baby has reached.
 */
const DOCTOR: Array<{ from: number; items: string[] }> = [
  {
    from: 0,
    items: ['体温 38℃ 及以上', '吃奶明显变差、很难叫醒', '呼吸急促或费力', '黄疸越来越重'],
  },
  {
    from: 2.5,
    items: ['对很大的声音没有反应', '不看人脸，眼睛不跟着东西动', '逗他时不笑', '趴着抬不起头'],
  },
  {
    from: 6,
    items: ['很少发声，不会笑出声', '总是紧握拳头不松开', '不会伸手抓东西', '扶着也不能坐'],
  },
  {
    from: 8,
    items: ['听到声音没有反应', '分不清生人和熟人', '不会双手传递玩具', '不会自己坐'],
  },
  {
    from: 12,
    items: [
      '不会挥手再见或拍手欢迎',
      '叫名字没有反应',
      '不会用拇指和食指捏小东西',
      '不会扶着东西站',
    ],
  },
  {
    from: 18,
    items: ['不会有意识地叫爸爸妈妈', '不会按要求指人或东西', '不会自己走', '不和人对视'],
  },
  {
    from: 24,
    items: ['没有有意义的话', '不会扶着栏杆上台阶', '不会跑', '不会用勺子吃饭'],
  },
]

export function doctorSignsFor(stage: Stage) {
  return DOCTOR.findLast((signs) => stage.from >= signs.from) ?? DOCTOR[0]!
}
