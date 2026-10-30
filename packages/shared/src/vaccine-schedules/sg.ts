import type { Vaccine } from '../vaccines'

/**
 * Singapore: MOH's National Childhood Immunisation Schedule (NCIS), updated 1 April 2026,
 * with COVID-19 added from 12 October 2026 for children with a medical indication (left out
 * here). Optional ones are those SingHealth Polyclinics lists as common optional vaccines,
 * at the schedule on their labels.
 */
export const SG: readonly Vaccine[] = [
  {
    id: 'sg-bcg',
    name: '卡介苗',
    local: 'BCG',
    against: '结核病',
    programme: 'routine',
    doses: [{ months: 0 }],
  },
  {
    id: 'sg-hepb',
    name: '乙肝疫苗',
    local: 'HepB',
    // Its second and third doses are in the 6-in-1.
    against: '乙型肝炎（后两剂在六联疫苗里）',
    programme: 'routine',
    doses: [{ months: 0 }],
  },
  {
    id: 'sg-6in1',
    name: '六联疫苗',
    local: '6-in-1',
    against: '白喉、破伤风、百日咳、脊灰、Hib、乙肝',
    programme: 'routine',
    doses: [{ months: 2 }, { months: 6 }],
  },
  {
    id: 'sg-5in1',
    name: '五联疫苗',
    local: '5-in-1',
    against: '白喉、破伤风、百日咳、脊灰、Hib',
    programme: 'routine',
    doses: [{ months: 4 }, { months: 18 }],
  },
  {
    id: 'sg-pcv',
    name: '13 价肺炎疫苗',
    local: 'PCV13',
    against: '肺炎球菌感染',
    programme: 'routine',
    doses: [{ months: 4 }, { months: 6 }, { months: 12 }],
  },
  {
    id: 'sg-flu',
    name: '流感疫苗',
    local: 'Flu',
    against: '流感（6 个月到 5 岁，第一年 2 剂，之后每年 1 剂）',
    programme: 'routine',
    doses: [{ months: 6 }, { months: 7 }],
  },
  {
    id: 'sg-mmr',
    name: '麻腮风疫苗',
    local: 'MMR',
    against: '麻疹、流行性腮腺炎、风疹',
    programme: 'routine',
    doses: [{ months: 12 }],
  },
  {
    id: 'sg-var',
    name: '水痘疫苗',
    local: 'VAR',
    against: '水痘',
    programme: 'routine',
    doses: [{ months: 12 }],
  },
  {
    id: 'sg-mmrv',
    name: '麻腮风水痘疫苗',
    local: 'MMRV',
    // The second dose of MMR and of varicella, in one.
    against: '麻疹、流行性腮腺炎、风疹、水痘（第 2 剂）',
    programme: 'routine',
    doses: [{ months: 15 }],
  },
  {
    id: 'sg-tdap-ipv',
    name: '百白破脊灰加强疫苗',
    local: 'Tdap-IPV',
    against: '破伤风、白喉、百日咳、脊灰（小学五年级）',
    programme: 'routine',
    doses: [{ months: 120, by: 144 }],
  },
  {
    id: 'sg-hpv',
    name: '双价 HPV 疫苗',
    local: 'HPV2',
    against: '人乳头瘤病毒感染（中学一、二年级）',
    programme: 'routine',
    sex: 'female',
    doses: [
      { months: 144, by: 156 },
      { months: 156, by: 168 },
    ],
  },
  {
    id: 'sg-rota',
    name: '轮状病毒疫苗',
    local: 'Rotavirus',
    against: '轮状病毒腹泻',
    programme: 'optional',
    doses: [
      { months: 2, by: 3 },
      { months: 4, by: 6 },
    ],
  },
  {
    id: 'sg-hepa',
    name: '甲肝疫苗',
    local: 'HepA',
    against: '甲型肝炎',
    programme: 'optional',
    doses: [{ months: 12 }, { months: 18 }],
  },
]
