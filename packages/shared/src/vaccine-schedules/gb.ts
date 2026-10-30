import type { Vaccine } from '../vaccines'

/**
 * United Kingdom (England): UKHSA's Complete routine immunisation schedule from 1 September
 * 2026 (gov.uk/government/publications/the-complete-routine-immunisation-schedule), for a
 * baby born on or after 1 January 2025: MMRV at 1 year and 18 months, the 6-in-1's fourth
 * dose at 18 months. Rotavirus limits from UKHSA's programme information (September 2026).
 */
export const GB: readonly Vaccine[] = [
  {
    id: 'gb-6in1',
    name: '六联疫苗',
    local: '6-in-1',
    against: '白喉、破伤风、百日咳、脊灰、Hib、乙肝',
    programme: 'routine',
    doses: [{ months: 2 }, { months: 3 }, { months: 4 }, { months: 18 }],
  },
  {
    id: 'gb-rota',
    name: '轮状病毒疫苗',
    local: 'Rotavirus',
    against: '轮状病毒腹泻',
    programme: 'routine',
    // The first before 15 weeks, the second before 24 weeks; none after.
    doses: [
      { months: 2, by: 3 },
      { months: 3, by: 5 },
    ],
  },
  {
    id: 'gb-menb',
    name: 'B 群流脑疫苗',
    local: 'MenB',
    against: '流行性脑脊髓膜炎（B 群）',
    programme: 'routine',
    doses: [{ months: 2 }, { months: 3 }, { months: 12 }],
  },
  {
    id: 'gb-pcv',
    name: '肺炎球菌疫苗',
    local: 'PCV',
    against: '肺炎球菌感染',
    programme: 'routine',
    doses: [{ months: 4 }, { months: 12 }],
  },
  {
    id: 'gb-mmrv',
    name: '麻腮风水痘疫苗',
    local: 'MMRV',
    against: '麻疹、流行性腮腺炎、风疹、水痘',
    programme: 'routine',
    doses: [{ months: 12 }, { months: 18 }],
  },
  {
    id: 'gb-flu',
    name: '儿童流感疫苗',
    local: 'Flu',
    against: '流感（2 岁起每年秋季喷鼻）',
    programme: 'routine',
    doses: [{ months: 24 }],
  },
  {
    id: 'gb-4in1',
    name: '学龄前加强疫苗',
    local: '4-in-1',
    against: '白喉、破伤风、百日咳、脊灰',
    programme: 'routine',
    doses: [{ months: 40 }],
  },
  {
    id: 'gb-hpv',
    name: 'HPV 疫苗',
    local: 'HPV',
    against: '人乳头瘤病毒感染',
    programme: 'routine',
    doses: [{ months: 144 }],
  },
  {
    id: 'gb-tdipv',
    name: '青少年加强疫苗',
    local: '3-in-1',
    against: '破伤风、白喉、脊灰',
    programme: 'routine',
    doses: [{ months: 168 }],
  },
  {
    id: 'gb-menacwy',
    name: 'ACWY 群流脑疫苗',
    local: 'MenACWY',
    against: '流行性脑脊髓膜炎（A、C、W、Y 群）',
    programme: 'routine',
    doses: [{ months: 168 }],
  },
  {
    id: 'gb-bcg',
    name: '卡介苗',
    local: 'BCG',
    // Within 28 days of birth, where TB is common or a parent or grandparent was born there.
    against: '结核病（结核高发地区或家庭）',
    programme: 'optional',
    doses: [{ months: 0, by: 1 }],
  },
]
