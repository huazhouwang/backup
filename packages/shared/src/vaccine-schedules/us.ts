import type { Vaccine } from '../vaccines'

/**
 * United States: CDC's Child and Adolescent Immunization Schedule by Age, as restored to its
 * July 2, 2025 version after the court stay of March 16, 2026 on the January 2026 revision
 * (cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-age.html, checked October 2026).
 * `by` is the end of each dose's range on the chart. COVID-19 (shared decision for healthy
 * children) and high-risk-only doses are left out.
 */
export const US: readonly Vaccine[] = [
  {
    id: 'us-hepb',
    name: '乙肝疫苗',
    local: 'HepB',
    against: '乙型肝炎',
    programme: 'routine',
    doses: [{ months: 0 }, { months: 1, by: 2 }, { months: 6, by: 18 }],
  },
  {
    id: 'us-rv1',
    name: '轮状病毒疫苗',
    local: 'RV1',
    against: '轮状病毒腹泻',
    programme: 'routine',
    choice: { group: 'us-rv', label: 'Rotarix（2 剂）' },
    // The first by 14 weeks 6 days, the last by 8 months; never started later.
    doses: [
      { months: 2, by: 3 },
      { months: 4, by: 8 },
    ],
  },
  {
    id: 'us-rv5',
    name: '轮状病毒疫苗',
    local: 'RV5',
    against: '轮状病毒腹泻',
    programme: 'routine',
    choice: { group: 'us-rv', label: 'RotaTeq（3 剂）' },
    doses: [{ months: 2, by: 3 }, { months: 4 }, { months: 6, by: 8 }],
  },
  {
    id: 'us-dtap',
    name: '百白破疫苗',
    local: 'DTaP',
    against: '白喉、破伤风、百日咳',
    programme: 'routine',
    doses: [
      { months: 2 },
      { months: 4 },
      { months: 6 },
      { months: 15, by: 18 },
      { months: 48, by: 72 },
    ],
  },
  {
    id: 'us-hib4',
    name: 'Hib 疫苗',
    local: 'Hib',
    against: 'b 型流感嗜血杆菌',
    programme: 'routine',
    choice: { group: 'us-hib', label: '4 剂' },
    doses: [{ months: 2 }, { months: 4 }, { months: 6 }, { months: 12, by: 15 }],
  },
  {
    id: 'us-hib3',
    name: 'Hib 疫苗',
    local: 'PedvaxHIB',
    against: 'b 型流感嗜血杆菌',
    programme: 'routine',
    choice: { group: 'us-hib', label: 'PedvaxHIB（3 剂）' },
    doses: [{ months: 2 }, { months: 4 }, { months: 12, by: 15 }],
  },
  {
    id: 'us-pcv',
    name: '肺炎球菌疫苗',
    local: 'PCV',
    against: '肺炎球菌感染',
    programme: 'routine',
    doses: [{ months: 2 }, { months: 4 }, { months: 6 }, { months: 12, by: 15 }],
  },
  {
    id: 'us-ipv',
    name: '脊灰灭活疫苗',
    local: 'IPV',
    against: '脊髓灰质炎',
    programme: 'routine',
    doses: [{ months: 2 }, { months: 4 }, { months: 6, by: 18 }, { months: 48, by: 72 }],
  },
  {
    id: 'us-flu',
    name: '流感疫苗',
    local: 'Flu',
    against: '流感（第一年 2 剂，之后每年秋季 1 剂）',
    programme: 'routine',
    doses: [{ months: 6 }, { months: 7 }],
  },
  {
    id: 'us-mmr',
    name: '麻腮风疫苗',
    local: 'MMR',
    against: '麻疹、流行性腮腺炎、风疹',
    programme: 'routine',
    doses: [
      { months: 12, by: 15 },
      { months: 48, by: 72 },
    ],
  },
  {
    id: 'us-var',
    name: '水痘疫苗',
    local: 'VAR',
    against: '水痘',
    programme: 'routine',
    doses: [
      { months: 12, by: 15 },
      { months: 48, by: 72 },
    ],
  },
  {
    id: 'us-hepa',
    name: '甲肝疫苗',
    local: 'HepA',
    against: '甲型肝炎',
    programme: 'routine',
    // Two doses at least six months apart, both from 12 to 23 months.
    doses: [
      { months: 12, by: 23 },
      { months: 18, by: 23 },
    ],
  },
  {
    id: 'us-tdap',
    name: '百白破加强疫苗',
    local: 'Tdap',
    against: '破伤风、白喉、百日咳',
    programme: 'routine',
    doses: [{ months: 132, by: 144 }],
  },
  {
    id: 'us-hpv',
    name: 'HPV 疫苗',
    local: 'HPV',
    against: '人乳头瘤病毒感染',
    programme: 'routine',
    doses: [
      { months: 132, by: 144 },
      { months: 138, by: 150 },
    ],
  },
  {
    id: 'us-menacwy',
    name: 'ACWY 群流脑疫苗',
    local: 'MenACWY',
    against: '流行性脑脊髓膜炎（A、C、W、Y 群）',
    programme: 'routine',
    doses: [{ months: 132, by: 144 }, { months: 192 }],
  },
  {
    id: 'us-rsv',
    name: 'RSV 单抗',
    local: 'Nirsevimab',
    // Unless the mother had the RSV vaccine at least 14 days before birth.
    against: '呼吸道合胞病毒（妈妈孕期没打 RSV 疫苗时）',
    programme: 'optional',
    doses: [{ months: 0, by: 8 }],
  },
  {
    id: 'us-menb',
    name: 'B 群流脑疫苗',
    local: 'MenB',
    against: '流行性脑脊髓膜炎（B 群），16 岁时与医生商量',
    programme: 'optional',
    doses: [{ months: 192 }, { months: 193 }],
  },
]
