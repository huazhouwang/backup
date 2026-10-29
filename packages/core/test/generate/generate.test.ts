import { describe, expect, it } from 'vitest';
import { areaReport, buildHouse, checkRules, createProject, houseOptions, normalizeProgram, type HouseProgram } from '../../src/index.js';

const r = (type: string, extra: object = {}) => ({ type, ...extra }) as HouseProgram['rooms'][number];

/** Briefs as the interview might produce them: households of all sizes, one to three storeys, some with areas or a plot */
const BRIEFS: Record<string, HouseProgram> = {
  'single, small': { floors: 1, rooms: [r('living'), r('kitchen'), r('master')] },
  'couple with study': { floors: 1, rooms: [r('living'), r('kitchen'), r('dining'), r('master'), r('study')] },
  'couple, two storeys': { floors: 2, rooms: [r('living'), r('kitchen'), r('dining'), r('master'), r('study')] },
  'young family': { floors: 1, rooms: [r('living'), r('kitchen'), r('dining'), r('master'), r('kids'), r('bath')] },
  'family of four, two storeys': { floors: 2, rooms: [r('living'), r('kitchen'), r('dining'), r('master'), r('kids'), r('bedroom')] },
  'three generations': { floors: 2, rooms: [r('living'), r('kitchen'), r('dining'), r('elder'), r('master'), r('kids'), r('bedroom')] },
  'three generations, elders and shrine down': {
    floors: 2,
    rooms: [r('living', { area: 32 }), r('shrine'), r('kitchen'), r('dining'), r('elder'), r('elder'), r('master'), r('kids'), r('kids')],
  },
  'big villa, three storeys': {
    floors: 3,
    rooms: [
      r('living', { area: 35 }),
      r('kitchen'),
      r('dining'),
      r('shrine'),
      r('garage'),
      r('elder'),
      r('master'),
      r('bedroom'),
      r('bedroom'),
      r('kids'),
      r('study'),
      r('family'),
    ],
  },
  'holiday home': { floors: 1, rooms: [r('living'), r('kitchen'), r('bedroom'), r('bedroom'), r('tea')] },
  'tea lover': { floors: 2, rooms: [r('living'), r('tea', { area: 14 }), r('kitchen'), r('master'), r('study')] },
  'with garage': { floors: 2, rooms: [r('living'), r('kitchen'), r('dining'), r('garage'), r('master'), r('kids')] },
  'tight plot': { floors: 2, plot: { width: 13000, depth: 12000 }, rooms: [r('living'), r('kitchen'), r('master'), r('kids'), r('bedroom')] },
  'wide plot, one storey': {
    floors: 1,
    plot: { width: 30000, depth: 16000 },
    rooms: [r('living'), r('kitchen'), r('dining'), r('master'), r('bedroom'), r('elder')],
  },
  'big rooms asked': { floors: 1, rooms: [r('living', { area: 40 }), r('kitchen', { area: 15 }), r('master', { area: 25 })] },
  'tiny rooms asked (raised to the minimum)': { floors: 1, rooms: [r('living', { area: 5 }), r('kitchen', { area: 2 }), r('master', { area: 4 })] },
  'only bedrooms asked': { floors: 1, rooms: [r('bedroom'), r('bedroom'), r('bedroom')] },
  'nothing asked ("you decide")': { floors: 1, rooms: [] },
  'two storeys, nothing asked': { floors: 2, rooms: [] },
  'floors pinned': { floors: 2, rooms: [r('living'), r('kitchen'), r('master', { floor: 0 }), r('study', { floor: 1 }), r('kids', { floor: 1 })] },
  'laundry and storage': { floors: 2, rooms: [r('living'), r('kitchen'), r('dining'), r('laundry'), r('storage'), r('master'), r('kids')] },
};

describe('house generation (issue 187)', () => {
  for (const [name, brief] of Object.entries(BRIEFS))
    it(`${name}: 2–3 options, each free of rule errors, with every program room built`, () => {
      const { program, options } = houseOptions(brief, 'zh');
      expect(options.length, 'options').toBeGreaterThanOrEqual(2);
      expect(options.length).toBeLessThanOrEqual(3);
      for (const o of options) {
        const errors = checkRules(o.project).filter(i => i.severity === 'error');
        expect(errors, `${o.id}: ${errors.map(e => e.message).join('; ')}`).toEqual([]);
        // Every room of the program exists, at a usable size
        for (const room of o.rooms) expect(room.area, `${o.id} ${room.name}`).toBeGreaterThan(Math.min(room.target * 0.6, 3));
        expect(o.rooms.length).toBe(program.rooms.length);
        if (brief.plot && !o.overPlot) expect(o.width * 1000 <= brief.plot.width && o.depth * 1000 <= brief.plot.depth, `${o.id} fits the plot`).toBe(true);
      }
      // Different typologies first
      if (options.length >= 2 && new Set(options.map(o => o.typology)).size < 2) expect(options[0].id).not.toBe(options[1].id);
    });

  it('is deterministic: the same brief gives the same houses', () => {
    const a = houseOptions(BRIEFS['three generations'], 'zh');
    const b = houseOptions(BRIEFS['three generations'], 'zh');
    expect(a.options.map(o => [o.id, o.score])).toEqual(b.options.map(o => [o.id, o.score]));
    expect(JSON.stringify(a.options[0].project)).toBe(JSON.stringify(b.options[0].project));
  });

  it('completes a program: a bathroom on every storey with bedrooms, bedrooms upstairs, numbered names', () => {
    const p = normalizeProgram(BRIEFS['family of four, two storeys'], 'zh');
    expect(p.rooms.filter(x => x.type === 'bath').map(x => x.floor)).toEqual([0, 1]);
    expect(p.rooms.find(x => x.type === 'master')!.floor).toBe(1);
    expect(p.rooms.find(x => x.type === 'living')!.floor).toBe(0);
    const twice = normalizeProgram({ floors: 1, rooms: [r('bedroom'), r('bedroom')] }, 'en');
    expect(twice.rooms.filter(x => x.type === 'bedroom').map(x => x.name)).toEqual(['Bedroom 1', 'Bedroom 2']);
  });

  it('two storeys have a stair with its slab opening, and the stair rooms stack', () => {
    const o = houseOptions(BRIEFS['three generations'], 'zh').options[0];
    expect(o.project.elements.filter(e => e.type === 'stair')).toHaveLength(1);
    expect(o.project.spaces.filter(s => s.kind === 'void')).toHaveLength(1);
  });

  it('still offers houses when none fits the plot, saying how far each overruns it', () => {
    const { options } = houseOptions(
      { floors: 2, plot: { width: 8000, depth: 7000 }, rooms: [r('living'), r('dining'), r('kitchen'), r('bedroom'), r('master'), r('kids')] },
      'zh',
    );
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const o of options) expect((o.overPlot?.width ?? 0) + (o.overPlot?.depth ?? 0)).toBeGreaterThan(0);
  });

  it('builds the picked option into an existing design, replacing its building, in the design language', () => {
    const p = createProject({ id: 'x', name: 'My house', language: 'en' });
    const { program } = buildHouse(p, BRIEFS['young family'], 'bar');
    expect(p.levels.filter(l => !l.roof)).toHaveLength(program.floors);
    const names = areaReport(p).levels[0].spaces.map(s => s.name);
    expect(names).toContain('Living room');
    expect(names).toContain('Hallway');
    expect(p.walls.length).toBeGreaterThan(8);
    expect(checkRules(p).filter(i => i.severity === 'error')).toEqual([]);
    expect(() => buildHouse(p, BRIEFS['young family'], 'pagoda')).toThrow();
  });

  it("finishes the house in the owner's design language, or the default one, recording what each room is for (issue 217)", () => {
    const p = createProject({ id: 'x', name: 'My house', language: 'en' });
    buildHouse(p, BRIEFS['young family'], 'bar');
    const living = p.spaces.find(s => s.name === 'Living room')!;
    expect(living.extras?.room).toBe('living');
    expect(living.floor).toBe('greystone');
    expect(p.spaces.find(s => s.name === 'Main bedroom')!.floor).toBe('naturaloak');
    expect(p.walls.filter(w => w.kind !== 'railing').every(w => w.finish === 'limewash')).toBe(true);
    expect(p.extras?.style).toBe('warm-courtyard');
    const q = createProject({ id: 'y', name: 'My house', language: 'en' });
    q.brief.style = ['japanese'];
    buildHouse(q, BRIEFS['young family'], 'bar');
    expect(q.spaces.find(s => s.name === 'Living room')!.floor).toBe('naturaloak');
    expect(q.extras?.style).toBe('japanese');
  });
});
