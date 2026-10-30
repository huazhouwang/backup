import type { Vaccine } from '../vaccines'

/**
 * Canada, as Ontario gives it: Ontario's routine immunization schedule (ontario.ca, updated
 * August 4, 2026), provinces each having their own; rotavirus limits from the Canadian
 * Immunization Guide (NACI). The infant RSV antibody follows Ontario's 2026–27 programme.
 */
export const CA: readonly Vaccine[] = [
  {
    id: 'ca-dtap-ipv-hib',
    name: '五联疫苗',
    local: 'DTaP-IPV-Hib',
    against: '白喉、破伤风、百日咳、脊灰、Hib',
    programme: 'routine',
    doses: [{ months: 2 }, { months: 4 }, { months: 6 }, { months: 18 }],
  },
  {
    id: 'ca-pcv',
    name: '肺炎球菌疫苗',
    local: 'Pneu-C-15',
    against: '肺炎球菌感染',
    programme: 'routine',
    doses: [{ months: 2 }, { months: 4 }, { months: 12 }],
  },
  {
    id: 'ca-rota',
    name: '轮状病毒疫苗',
    local: 'Rotarix',
    against: '轮状病毒腹泻',
    programme: 'routine',
    // The first before 15 weeks, all before 8 months.
    doses: [
      { months: 2, by: 3 },
      { months: 4, by: 8 },
    ],
  },
  {
    id: 'ca-men',
    name: '流脑结合疫苗',
    // Men-C-C until its stock runs out, then Men-C-ACYW (from August 2026).
    local: 'Men-C',
    against: '流行性脑脊髓膜炎',
    programme: 'routine',
    doses: [{ months: 12 }],
  },
  {
    id: 'ca-mmr',
    name: '麻腮风疫苗',
    local: 'MMR',
    against: '麻疹、流行性腮腺炎、风疹',
    programme: 'routine',
    doses: [{ months: 12 }],
  },
  {
    id: 'ca-var',
    name: '水痘疫苗',
    local: 'VAR',
    against: '水痘',
    programme: 'routine',
    doses: [{ months: 15 }],
  },
  {
    id: 'ca-flu',
    name: '流感疫苗',
    local: 'Flu',
    against: '流感（第一年 2 剂，之后每年秋季 1 剂）',
    programme: 'routine',
    doses: [{ months: 6 }, { months: 7 }],
  },
  {
    id: 'ca-mmrv',
    name: '麻腮风水痘疫苗',
    local: 'MMRV',
    against: '麻疹、流行性腮腺炎、风疹、水痘（第 2 剂）',
    programme: 'routine',
    doses: [{ months: 48, by: 72 }],
  },
  {
    id: 'ca-tdap-ipv',
    name: '学龄前加强疫苗',
    local: 'Tdap-IPV',
    against: '破伤风、白喉、百日咳、脊灰',
    programme: 'routine',
    doses: [{ months: 48, by: 72 }],
  },
  {
    id: 'ca-hepb',
    name: '乙肝疫苗',
    local: 'HB',
    against: '乙型肝炎（七年级在学校打）',
    programme: 'routine',
    doses: [{ months: 144 }, { months: 150 }],
  },
  {
    id: 'ca-hpv',
    name: 'HPV 疫苗',
    local: 'HPV-9',
    against: '人乳头瘤病毒感染（七年级在学校打）',
    programme: 'routine',
    doses: [{ months: 144 }, { months: 150 }],
  },
  {
    id: 'ca-menacwy',
    name: 'ACWY 群流脑疫苗',
    local: 'Men-C-ACYW',
    against: '流行性脑脊髓膜炎（A、C、W、Y 群）',
    programme: 'routine',
    doses: [{ months: 144 }],
  },
  {
    id: 'ca-tdap',
    name: '青少年百白破加强疫苗',
    local: 'Tdap',
    against: '破伤风、白喉、百日咳',
    programme: 'routine',
    doses: [{ months: 168, by: 192 }],
  },
  {
    id: 'ca-rsv',
    name: 'RSV 单抗',
    local: 'Beyfortus',
    // For babies born from April 1 and under 8 months, from October to March, unless the
    // mother had the RSV vaccine in pregnancy.
    against: '呼吸道合胞病毒（妈妈孕期没打 RSV 疫苗时）',
    programme: 'optional',
    doses: [{ months: 0, by: 8 }],
  },
]
