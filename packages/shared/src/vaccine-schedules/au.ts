import type { Vaccine } from '../vaccines'

/**
 * Australia: the National Immunisation Program, as NSW Health's "NSW Immunisation Schedule –
 * Vaccines funded under the National Immunisation Program" (updated October 2026) lists it,
 * with the Australian Immunisation Handbook's age limits. Extra doses only for Aboriginal and
 * Torres Strait Islander children or medical risk, and state programmes (MenB in SA and QLD,
 * the RSV antibody), are left out.
 */
export const AU: readonly Vaccine[] = [
  {
    id: 'au-hepb',
    name: '乙肝疫苗',
    local: 'HepB',
    against: '乙型肝炎（出生 7 天内）',
    programme: 'routine',
    doses: [{ months: 0 }],
  },
  {
    id: 'au-6in1',
    name: '六联疫苗',
    local: '6-in-1',
    against: '白喉、破伤风、百日咳、乙肝、脊灰、Hib',
    programme: 'routine',
    doses: [{ months: 2 }, { months: 4 }, { months: 6 }],
  },
  {
    id: 'au-pcv',
    name: '肺炎球菌疫苗',
    local: 'PCV',
    against: '肺炎球菌感染',
    programme: 'routine',
    doses: [{ months: 2 }, { months: 4 }, { months: 12 }],
  },
  {
    id: 'au-rota',
    name: '轮状病毒疫苗',
    local: 'Rotarix',
    against: '轮状病毒腹泻',
    programme: 'routine',
    // The first before 15 weeks, the second before 25 weeks; none after.
    doses: [
      { months: 2, by: 3 },
      { months: 4, by: 5 },
    ],
  },
  {
    id: 'au-flu',
    name: '流感疫苗',
    local: 'Flu',
    against: '流感（6 个月到 5 岁，第一年 2 剂，之后每年 1 剂）',
    programme: 'routine',
    doses: [{ months: 6 }, { months: 7 }],
  },
  {
    id: 'au-menacwy',
    name: 'ACWY 群流脑疫苗',
    local: 'MenACWY',
    against: '流行性脑脊髓膜炎（A、C、W、Y 群）',
    programme: 'routine',
    doses: [{ months: 12 }, { months: 168 }],
  },
  {
    id: 'au-mmr',
    name: '麻腮风疫苗',
    local: 'MMR',
    against: '麻疹、流行性腮腺炎、风疹',
    programme: 'routine',
    doses: [{ months: 12 }],
  },
  {
    id: 'au-hib',
    name: 'Hib 疫苗',
    local: 'Hib',
    against: 'b 型流感嗜血杆菌',
    programme: 'routine',
    doses: [{ months: 18 }],
  },
  {
    id: 'au-mmrv',
    name: '麻腮风水痘疫苗',
    local: 'MMRV',
    against: '麻疹、流行性腮腺炎、风疹、水痘',
    programme: 'routine',
    doses: [{ months: 18 }],
  },
  {
    id: 'au-dtpa',
    name: '百白破疫苗',
    local: 'DTPa',
    against: '白喉、破伤风、百日咳',
    programme: 'routine',
    doses: [{ months: 18 }],
  },
  {
    id: 'au-dtpa-ipv',
    name: '百白破脊灰疫苗',
    local: 'DTPa-IPV',
    against: '白喉、破伤风、百日咳、脊灰',
    programme: 'routine',
    doses: [{ months: 48 }],
  },
  {
    id: 'au-dtpa-teen',
    name: '青少年百白破加强疫苗',
    local: 'dTpa',
    against: '白喉、破伤风、百日咳',
    programme: 'routine',
    doses: [{ months: 144 }],
  },
  {
    id: 'au-hpv',
    name: 'HPV 疫苗',
    local: 'HPV',
    against: '人乳头瘤病毒感染',
    programme: 'routine',
    doses: [{ months: 144 }],
  },
]
