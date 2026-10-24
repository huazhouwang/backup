// E2E: the agent makes looks (#80): words → recipe → preview (self-check) → add → preview card → use; discard; a photo reaches the
// model; look options (#89) change one object from the properties panel
import { writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('looks', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const api = (path, init) =>
    page.evaluate(
      async ([p, i]) => {
        const r = await fetch(`/api${p}`, { ...i, headers: { 'Content-Type': 'application/json' } });
        return { status: r.status, body: await r.json() };
      },
      [path, init],
    );
  await api('/keys', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'compatible',
      model: 'fake-model',
      apiKey: 'sk-test-12345678',
      baseUrl: process.env.FAKE_LLM ?? 'http://127.0.0.1:8787/v1',
    }),
  });
  await page.reload();
  await page.waitForFunction(() => window.artifact?.ready);

  const box = page.getByPlaceholder('说说想怎么改…');
  const project = () => page.evaluate(() => window.artifact.project());

  // Words → look_get → look_preview → look_add, then the preview card
  await box.fill('把餐桌换成圆餐桌');
  await box.press('Enter');
  await page.getByText('做好了：一张带转盘的圆餐桌').waitFor({ timeout: 40000 });
  let p = await project();
  const id = Object.entries(p.library.looks ?? {}).find(([, l]) => l.name === '圆餐桌')?.[0];
  check(!!id, 'the agent added the look after previewing it');
  check(await page.getByText('新外观：圆餐桌').isVisible(), 'the chat shows the new look with a preview card');
  await page.getByRole('img', { name: /圆餐桌的预览/ }).waitFor({ timeout: 20000 });
  check(true, 'the card shows a still of the look');
  await page.screenshot({ path: `${OUT}/looks-1-card.png` });
  await page.getByRole('button', { name: '采用，用于所有同类' }).click();
  await page.waitForTimeout(500);
  p = await project();
  check(p.library.use?.['furniture:dining'] === id, 'using it draws every dining table with it');

  // Discard: the new look is removed again
  await box.fill('做一个方凳');
  await box.press('Enter');
  await page.getByText('做好了一个方凳').waitFor({ timeout: 30000 });
  await page.getByText('新外观：方凳').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '丢弃' }).click();
  await page.waitForTimeout(500);
  p = await project();
  check(!Object.values(p.library.looks ?? {}).some(l => l.name === '方凳'), 'discarding removes the new look');

  // A photo goes to the model as an image
  const png = `${OUT}/looks-photo.png`;
  writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64'));
  await page.locator('input[type=file]').setInputFiles(png);
  await page.getByRole('img', { name: '要发送的图片' }).waitFor({ timeout: 5000 });
  await box.fill('照这张图做个柜子');
  await box.press('Enter');
  await page.getByText('看到图片了').waitFor({ timeout: 30000 });
  check(true, 'a photo attached in the chat reaches the model');
  await page.screenshot({ path: `${OUT}/looks-2-photo.png` });

  // Look options: one sofa gets white linen from the properties panel; its look, and the other sofas, stay the same
  p = await project();
  const sofa = p.furniture.find(f => f.type === 'sofa' && f.level === 'L1') ?? p.furniture.find(f => f.type === 'sofa');
  await page.frameLocator('iframe[title="画布"]').locator(`[data-id="${sofa.id}"]`).first().dispatchEvent('click');
  await page.getByRole('tab', { name: '属性' }).click();
  await page.getByText('外观参数').waitFor({ timeout: 10000 });
  await page.getByRole('combobox', { name: '布面' }).click();
  await page.getByRole('option', { name: '白色亚麻' }).click();
  await page.waitForTimeout(800);
  const others = pp => JSON.stringify(pp.furniture.filter(f => f.id !== sofa.id).map(f => f.lookParams ?? null));
  const before = others(p);
  p = await project();
  check(p.furniture.find(f => f.id === sofa.id).lookParams?.fabric === 'linen' && others(p) === before, 'a look option changes only that object');
  await page.screenshot({ path: `${OUT}/looks-3-params.png` });
  await page.getByRole('button', { name: '恢复默认' }).click();
  await page.waitForTimeout(500);
  p = await project();
  check(!p.furniture.find(f => f.id === sofa.id).lookParams, 'its default comes back');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
});
