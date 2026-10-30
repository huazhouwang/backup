import type { Vaccine } from '../vaccines'

/**
 * China: the national programme (国家免疫规划疫苗儿童免疫程序及说明, 2026 edition, National
 * Disease Control and Prevention Administration, June 2026), free; and the common self-paid
 * ones, at the schedule most products give (the clinic has the last word).
 */
export const CN: readonly Vaccine[] = [
  {
    id: 'hepb',
    name: '乙肝疫苗',
    against: '乙型肝炎',
    programme: 'routine',
    doses: [{ months: 0, days: 1 }, { months: 1 }, { months: 6, by: 12 }],
  },
  {
    id: 'bcg',
    name: '卡介苗',
    against: '结核病',
    programme: 'routine',
    doses: [{ months: 0, by: 3 }],
  },
  {
    id: 'ipv',
    name: '脊灰灭活疫苗',
    against: '脊髓灰质炎',
    programme: 'routine',
    doses: [{ months: 2 }, { months: 3 }],
  },
  {
    id: 'bopv',
    name: '脊灰减毒活疫苗',
    against: '脊髓灰质炎',
    programme: 'routine',
    // Doses 3 and 4 of polio, after the two of IPV.
    doses: [
      { months: 4, by: 12 },
      { months: 48, by: 60 },
    ],
  },
  {
    id: 'dtap',
    name: '百白破疫苗',
    against: '百日咳、白喉、破伤风',
    programme: 'routine',
    doses: [
      { months: 2 },
      { months: 4 },
      { months: 6, by: 12 },
      { months: 18, by: 24 },
      { months: 72, by: 84 },
    ],
  },
  {
    id: 'mmr',
    name: '麻腮风疫苗',
    against: '麻疹、风疹、流行性腮腺炎',
    programme: 'routine',
    doses: [
      { months: 8, by: 12 },
      { months: 18, by: 24 },
    ],
  },
  {
    id: 'je-l',
    name: '乙脑减毒活疫苗',
    against: '流行性乙型脑炎',
    programme: 'routine',
    choice: { group: 'je', label: '减毒活疫苗（2 剂）' },
    doses: [
      { months: 8, by: 12 },
      { months: 24, by: 36 },
    ],
  },
  {
    id: 'je-i',
    name: '乙脑灭活疫苗',
    against: '流行性乙型脑炎',
    programme: 'routine',
    choice: { group: 'je', label: '灭活疫苗（4 剂）' },
    doses: [
      { months: 8 },
      // 7 to 10 days after the first.
      { months: 8, days: 7, by: 12 },
      { months: 24, by: 36 },
      { months: 72, by: 84 },
    ],
  },
  {
    id: 'mpsv-a',
    name: 'A 群流脑多糖疫苗',
    against: '流行性脑脊髓膜炎',
    programme: 'routine',
    doses: [
      { months: 6, by: 12 },
      { months: 9, by: 24 },
    ],
  },
  {
    id: 'mpsv-ac',
    name: 'A 群 C 群流脑多糖疫苗',
    against: '流行性脑脊髓膜炎',
    programme: 'routine',
    // Doses 3 and 4 of meningococcal vaccine.
    doses: [
      { months: 36, by: 48 },
      { months: 72, by: 84 },
    ],
  },
  {
    id: 'hepa-l',
    name: '甲肝减毒活疫苗',
    against: '甲型肝炎',
    programme: 'routine',
    choice: { group: 'hepa', label: '减毒活疫苗（1 剂）' },
    doses: [{ months: 18, by: 24 }],
  },
  {
    id: 'hepa-i',
    name: '甲肝灭活疫苗',
    against: '甲型肝炎',
    programme: 'routine',
    choice: { group: 'hepa', label: '灭活疫苗（2 剂）' },
    doses: [
      { months: 18, by: 24 },
      { months: 24, by: 36 },
    ],
  },
  {
    id: 'hpv2',
    name: '双价 HPV 疫苗',
    against: '人乳头瘤病毒感染',
    programme: 'routine',
    sex: 'female',
    doses: [
      { months: 156, by: 168 },
      { months: 162, by: 168 },
    ],
  },
  {
    id: 'pcv13',
    name: '13 价肺炎疫苗',
    against: '肺炎球菌感染',
    programme: 'optional',
    doses: [{ months: 2 }, { months: 4 }, { months: 6 }, { months: 12 }],
  },
  {
    id: 'dtap-ipv-hib',
    name: '五联疫苗',
    against: '百白破、脊灰、b 型流感嗜血杆菌',
    programme: 'optional',
    doses: [{ months: 2 }, { months: 3 }, { months: 4 }, { months: 18 }],
    replaces: { dtap: [1, 2, 3, 4], ipv: [1, 2], bopv: [1], hib: [1, 2, 3, 4] },
  },
  {
    id: 'hib',
    name: 'Hib 疫苗',
    against: 'b 型流感嗜血杆菌',
    programme: 'optional',
    doses: [{ months: 2 }, { months: 3 }, { months: 4 }, { months: 18 }],
  },
  {
    id: 'rota',
    name: '五价轮状病毒疫苗',
    against: '轮状病毒腹泻',
    programme: 'optional',
    // From 6 weeks, 4 to 10 weeks apart, all by 32 weeks.
    doses: [{ months: 2 }, { months: 3 }, { months: 4, by: 7 }],
  },
  {
    id: 'ev71',
    name: '手足口（EV71）疫苗',
    against: '手足口病（EV71）',
    programme: 'optional',
    doses: [{ months: 6 }, { months: 7 }],
  },
  {
    id: 'varicella',
    name: '水痘疫苗',
    against: '水痘',
    programme: 'optional',
    doses: [{ months: 12 }, { months: 48 }],
  },
  {
    id: 'flu',
    name: '流感疫苗',
    against: '流行性感冒',
    programme: 'optional',
    // The first season two doses four weeks apart; after that one each autumn.
    doses: [{ months: 6 }, { months: 7 }],
  },
]
