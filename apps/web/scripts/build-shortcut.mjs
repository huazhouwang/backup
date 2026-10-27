// Writes the unsigned Siri shortcut (docs/siri.md). On a Mac, sign it, add it to Shortcuts
// (leave the code empty) and share it as an iCloud link, which the app opens:
//
//   node scripts/build-shortcut.mjs [origin] > 记录宝宝.shortcut
//   shortcuts sign --mode anyone --input 记录宝宝.shortcut --output 记录宝宝-signed.shortcut
//
// The shortcut asks "要记录什么？", sends the answer to /api/voice/siri with the code pasted
// on import, and asks the reply back as the next question until the reply has `end`, when it
// says the reply and ends.

import { randomUUID } from 'node:crypto'

const origin = process.argv[2] ?? 'https://bobo.009003.xyz'
const uuid = () => randomUUID().toUpperCase()

// Values inside parameters: a named variable, an earlier action's output, or text with them.
const variable = (name) => ({ Type: 'Variable', VariableName: name })
const output = (id, name) => ({ Type: 'ActionOutput', OutputUUID: id, OutputName: name })
const attachment = (value) => ({ Value: value, WFSerializationType: 'WFTextTokenAttachment' })
const text = (value) =>
  typeof value === 'string'
    ? { Value: { string: value, attachmentsByRange: {} }, WFSerializationType: 'WFTextTokenString' }
    : {
        Value: { string: '￼', attachmentsByRange: { '{0, 1}': value } },
        WFSerializationType: 'WFTextTokenString',
      }
const fields = (pairs) => ({
  Value: {
    WFDictionaryFieldValueItems: pairs.map(([key, value]) => ({
      WFItemType: 0,
      WFKey: text(key),
      WFValue: text(value),
    })),
  },
  WFSerializationType: 'WFDictionaryFieldValue',
})
const action = (id, parameters = {}) => ({
  WFWorkflowActionIdentifier: `is.workflow.actions.${id}`,
  WFWorkflowActionParameters: parameters,
})

const codeText = uuid()
const questionText = uuid()
const asked = uuid()
const fetched = uuid()
const reply = uuid()
const end = uuid()
const repeat = uuid()
const branch = uuid()

const actions = [
  // 0: the code, filled in by the import question.
  action('gettext', { UUID: codeText, WFTextActionText: '' }),
  action('setvariable', { WFVariableName: '口令', WFInput: attachment(output(codeText, 'Text')) }),
  action('gettext', { UUID: questionText, WFTextActionText: '要记录什么？' }),
  action('setvariable', {
    WFVariableName: '问题',
    WFInput: attachment(output(questionText, 'Text')),
  }),
  action('repeat.count', { GroupingIdentifier: repeat, WFControlFlowMode: 0, WFRepeatCount: 20 }),
  action('ask', { UUID: asked, WFInputType: 'Text', WFAskActionPrompt: text(variable('问题')) }),
  action('downloadurl', {
    UUID: fetched,
    WFURL: `${origin}/api/voice/siri`,
    WFHTTPMethod: 'POST',
    ShowHeaders: true,
    WFHTTPHeaders: fields([['Authorization', variable('口令')]]),
    WFHTTPBodyType: 'JSON',
    WFJSONValues: fields([['text', output(asked, 'Provided Input')]]),
  }),
  action('getvalueforkey', {
    UUID: reply,
    WFDictionaryKey: 'reply',
    WFInput: attachment(output(fetched, 'Contents of URL')),
  }),
  action('getvalueforkey', {
    UUID: end,
    WFDictionaryKey: 'end',
    WFInput: attachment(output(fetched, 'Contents of URL')),
  }),
  // Finished: say the last reply and stop.
  // Finished when `end` has any value: the condition compares nothing, so it cannot lose a
  // compared text, as iOS did with "is stop". Current iOS reads WFConditions; the flat keys
  // are the older form.
  action('conditional', {
    GroupingIdentifier: branch,
    WFControlFlowMode: 0,
    WFConditions: {
      Value: {
        WFActionParameterFilterPrefix: 1,
        WFActionParameterFilterTemplates: [
          {
            WFCondition: 100,
            WFInput: { Type: 'Variable', Variable: attachment(output(end, 'Dictionary Value')) },
          },
        ],
        WFContentPredicateBoundedDate: false,
      },
      WFSerializationType: 'WFContentPredicateTableTemplate',
    },
    WFCondition: 100,
    WFInput: { Type: 'Variable', Variable: attachment(output(end, 'Dictionary Value')) },
  }),
  action('speaktext', { WFText: text(output(reply, 'Dictionary Value')) }),
  action('exit'),
  action('conditional', { GroupingIdentifier: branch, WFControlFlowMode: 2 }),
  // Otherwise the reply ("记好了，还有吗？", "要删除…吗？") is the next question. Ask for
  // Input refuses an empty prompt, and speaking the reply first would say it twice.
  action('setvariable', {
    WFVariableName: '问题',
    WFInput: attachment(output(reply, 'Dictionary Value')),
  }),
  action('repeat.count', { GroupingIdentifier: repeat, WFControlFlowMode: 2 }),
]

const shortcut = {
  WFWorkflowActions: actions,
  WFWorkflowClientVersion: '5037.0.19',
  WFWorkflowMinimumClientVersion: 900,
  WFWorkflowMinimumClientVersionString: '900',
  WFWorkflowHasOutputFallback: false,
  WFWorkflowHasShortcutInputVariables: false,
  WFWorkflowIcon: { WFWorkflowIconStartColor: 4292093695, WFWorkflowIconGlyphNumber: 61440 },
  WFWorkflowImportQuestions: [
    {
      ActionIndex: 0,
      Category: 'Parameter',
      DefaultValue: '',
      ParameterKey: 'WFTextActionText',
      Text: '请粘贴 Lullabo 设置里复制的口令',
    },
  ],
  WFWorkflowInputContentItemClasses: [],
  WFWorkflowOutputContentItemClasses: [],
  WFWorkflowTypes: [],
  WFQuickActionSurfaces: [],
}

// XML property list, which `shortcuts sign` reads like the binary form.
const escape = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
function plist(value, indent) {
  const pad = '\t'.repeat(indent)
  if (typeof value === 'string') return `${pad}<string>${escape(value)}</string>`
  if (typeof value === 'boolean') return `${pad}<${value}/>`
  if (typeof value === 'number') return `${pad}<integer>${value}</integer>`
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}<array/>`
    return [
      `${pad}<array>`,
      ...value.map((item) => plist(item, indent + 1)),
      `${pad}</array>`,
    ].join('\n')
  }
  const entries = Object.entries(value)
  if (entries.length === 0) return `${pad}<dict/>`
  return [
    `${pad}<dict>`,
    ...entries.flatMap(([key, item]) => [
      `${pad}\t<key>${escape(key)}</key>`,
      plist(item, indent + 1),
    ]),
    `${pad}</dict>`,
  ].join('\n')
}

process.stdout.write(
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${plist(shortcut, 0)}
</plist>
`,
)
