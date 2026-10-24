// Fake LLM for tests (OpenAI Chat Completions streaming API). Follows a script: call tools first, then reply with text.
// Usage: node e2e/fake-llm.mjs [port=8787]
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8787);
export const requests = [];

const chunk = (delta, finish = null, usage) =>
  `data: ${JSON.stringify({ id: 'fake', object: 'chat.completion.chunk', created: 0, model: 'fake', choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;

/** Script: decide the next step from the latest messages */
function next(body) {
  const msgs = body.messages;
  const last = msgs[msgs.length - 1];
  const user = [...msgs].reverse().find(m => m.role === 'user');
  const text = typeof user?.content === 'string' ? user.content : JSON.stringify(user?.content);
  // Count only tool results after the last user message
  const lastUser = msgs.map(m => m.role).lastIndexOf('user');
  const toolsSoFar = msgs.slice(lastUser).filter(m => m.role === 'tool').length;
  // Looks: read the current one, preview a new recipe, add it
  // A JSONata recipe with a parameter (the 方凳 below still sends a part list from before scripts, which is converted)
  const ROUND = {
    params: { top: 'wood' },
    script: `(
      $r := $min([$w, $d]) / 2;
      [
        $cylinder($r, 40, [0, $h - 20, 0], $top, {"seg": 40}),
        $cylinder($r * 0.45, 30, [0, $h + 15, 0], 'woodDark'),
        $cylinder(50, $h - 40, [0, ($h - 40) / 2, 0], 'woodDark'),
        $cylinder($r * 0.5, 20, [0, 10, 0], 'woodDark')
      ]
    )`,
  };
  if (/圆餐桌/.test(text) && toolsSoFar === 0) return { tool: { name: 'look_get', args: { target: 'furniture:dining' } } };
  if (/圆餐桌/.test(text) && toolsSoFar === 1) return { tool: { name: 'look_preview', args: { recipe: ROUND, target: 'furniture:dining' } } };
  if (/圆餐桌/.test(text) && toolsSoFar === 2) {
    const ok = /"floating":\[\]/.test(String(last.content));
    return ok ? { tool: { name: 'look_add', args: { name: '圆餐桌', for: ['furniture:dining'], recipe: ROUND } } } : { text: '预览发现有悬空的零件。' };
  }
  if (/圆餐桌/.test(text) && toolsSoFar === 3) return { text: '做好了：一张带转盘的圆餐桌，桌面按原来的尺寸取圆。' };
  if (/方凳/.test(text) && toolsSoFar === 0)
    return {
      tool: {
        name: 'look_add',
        args: { name: '方凳', for: ['furniture:stool'], recipe: { parts: [{ kind: 'box', mat: 'wood', size: ['w', 'h', 'd'], at: [0, 'h / 2', 0], r: 20 }] } },
      },
    };
  if (/方凳/.test(text) && toolsSoFar === 1) return { text: '做好了一个方凳。' };
  if (Array.isArray(user?.content) && user.content.some(c => c.type === 'image_url')) return { text: '看到图片了：一个两门的柜子。' };
  if (/扩到|调到/.test(text) && toolsSoFar === 0) return { tool: { name: 'space_set_area', args: { space: '一层·老人房一', area: 12.5 } } };
  if (/扩到|调到/.test(text) && toolsSoFar === 1) return { tool: { name: 'view_focus', args: { ids: ['L1-s15'] } } };
  if (/删掉三层|删除三层/.test(text) && toolsSoFar === 0) return { tool: { name: 'level_remove', args: { level: '三层' } } };
  if (/一家四口/.test(text) && toolsSoFar === 0)
    return { tool: { name: 'brief_update', args: { household: ['夫妻', '两个孩子'], rooms: ['客厅', '厨房', '主卧', '次卧', '卫生间'] } } };
  if (/一家四口/.test(text) && toolsSoFar === 1)
    return {
      tool: {
        name: 'batch',
        args: {
          label: '排出一层起始方案',
          calls: [
            {
              name: 'room_add',
              input: {
                level: 'L1',
                name: '客厅',
                rect: [0, 0, 5000, 4500],
                wall_kind: 'bearing',
                wall_thickness: 240,
                floor: 'wood',
                door: { side: 'west', width: 1000 },
              },
            },
            {
              name: 'room_add',
              input: {
                level: 'L1',
                name: '厨房',
                rect: [5000, 0, 3000, 2500],
                wall_kind: 'bearing',
                wall_thickness: 240,
                floor: 'tile',
                door: { side: 'west' },
              },
            },
            { name: 'room_add', input: { level: 'L1', name: '卫生间', rect: [5000, 2500, 3000, 2000], floor: 'antislip', door: { side: 'west', width: 800 } } },
            {
              name: 'room_add',
              input: { level: 'L1', name: '主卧', rect: [0, 4500, 4000, 3600], wall_kind: 'bearing', wall_thickness: 240, door: { side: 'north' } },
            },
            {
              name: 'room_add',
              input: { level: 'L1', name: '次卧', rect: [4000, 4500, 4000, 3600], wall_kind: 'bearing', wall_thickness: 240, door: { side: 'north' } },
            },
            { name: 'opening_add', input: { wall: '主卧南墙', kind: 'window', center_on: '主卧' } },
            { name: 'opening_add', input: { wall: '次卧南墙', kind: 'window', center_on: '次卧' } },
            { name: 'opening_add', input: { wall: '客厅北墙', kind: 'window', center_on: '客厅', width: 2400 } },
          ],
        },
      },
    };
  if (/一家四口/.test(text) && toolsSoFar === 2) return { tool: { name: 'check_rules', args: {} } };
  if (last.role === 'tool') {
    const out = String(last.content);
    if (/扩到|调到/.test(text)) {
      const m = out.match(/"area":([\d.]+)/);
      return {
        text: `好了。老人房一现在约 ${m ? Number(m[1]).toFixed(1) : '12.5'} m²，我把它和老人房二之间的隔墙往西挪了；老人房二相应小了一点。改动的墙在图上跳了一下。`,
      };
    }
    if (/一家四口/.test(text))
      return { text: '好了。按你的需求排了一层起始方案：北边客厅、厨房和卫生间，南边主卧和次卧，卧室都朝南开窗。规则检查没有发现问题。要不要再加二层？' };
    if (/删掉三层|删除三层/.test(text)) return { text: /declined|denied|cancel|拒绝|not approved/i.test(out) ? '好的，三层保留不动。' : '三层已删除。' };
    return { text: `好了。${out.slice(0, 60)}` };
  }
  return { text: '收到。' };
}

createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  requests.push({ url: req.url, body });
  console.log(
    `[fake-llm] ${req.method} ${req.url} messages=${body.messages?.length} tools=${body.tools?.length} last=${(JSON.stringify(body.messages?.at(-1)) ?? '').slice(0, 160)}`,
  );
  if (!req.url.endsWith('/chat/completions')) {
    res.writeHead(404).end();
    return;
  }
  const step = next(body);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const usage = { prompt_tokens: 1200, completion_tokens: 40, total_tokens: 1240 };
  if (step.tool) {
    res.write(
      chunk({
        role: 'assistant',
        content: null,
        tool_calls: [{ index: 0, id: `call_${Date.now()}`, type: 'function', function: { name: step.tool.name, arguments: '' } }],
      }),
    );
    res.write(chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(step.tool.args) } }] }));
    res.write(chunk({}, 'tool_calls'));
  } else {
    res.write(chunk({ role: 'assistant', content: '' }));
    for (const part of step.text.match(/.{1,8}/gsu) ?? []) res.write(chunk({ content: part }));
    res.write(chunk({}, 'stop'));
  }
  res.write(`data: ${JSON.stringify({ id: 'fake', object: 'chat.completion.chunk', created: 0, model: 'fake', choices: [], usage })}\n\n`);
  res.end('data: [DONE]\n\n');
}).listen(port, () => console.log(`[fake-llm] http://127.0.0.1:${port}/v1`));
