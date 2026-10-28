/**
 * Keeping effects within budget (issue 203): everything the shown widgets declare, fitted to the host's limits. Particle counts
 * are scaled down together to the total (and by `density`, which the host lowers when frames run long); lights beyond the limit
 * are dropped; of several skies the darkest wins (night over dusk over overcast), of several fogs the thickest.
 */
import { EFFECT_LIMITS, SKY_MOODS, type EffectItem, type WidgetItem } from './format.js';

export const isEffect = (i: WidgetItem): i is EffectItem => i.type === 'particles' || i.type === 'fog' || i.type === 'light' || i.type === 'sky';

export interface FittedEffects {
  particles: Extract<EffectItem, { type: 'particles' }>[];
  lights: Extract<EffectItem, { type: 'light' }>[];
  fog: Extract<EffectItem, { type: 'fog' }> | null;
  sky: Extract<EffectItem, { type: 'sky' }> | null;
  /** The share of the declared particles drawn, 0–1 */
  scale: number;
}

export function fitEffects(items: WidgetItem[], density = 1): FittedEffects {
  const effects = items.filter(isEffect);
  const particles = effects.filter(e => e.type === 'particles');
  const total = particles.reduce((n, p) => n + p.count, 0);
  const scale = Math.min(1, total ? EFFECT_LIMITS.totalParticles / total : 1) * Math.max(0, Math.min(1, density));
  return {
    particles: particles.map(p => ({ ...p, count: Math.floor(p.count * scale) })).filter(p => p.count > 0),
    lights: effects.filter(e => e.type === 'light').slice(0, EFFECT_LIMITS.lights),
    fog: effects.filter(e => e.type === 'fog').reduce<FittedEffects['fog']>((a, b) => (!a || b.density > a.density ? b : a), null),
    sky: effects
      .filter(e => e.type === 'sky')
      .reduce<FittedEffects['sky']>((a, b) => (!a || SKY_MOODS.indexOf(b.mood) > SKY_MOODS.indexOf(a.mood) ? b : a), null),
    scale,
  };
}
