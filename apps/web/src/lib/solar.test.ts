import { describe, expect, it } from 'vitest';
import { bearingOnPlan, dateOfDay, dayOfYear, sunDirection, sunPosition } from './solar';

// The sample's site, in Wenchang, Hainan (UTC+8)
const site = { lat: 20.55, lon: 109.84, tz: 8 };

describe('the sun', () => {
  it('stands due south at solar noon in the northern winter, as high as 90° less the latitude and the tilt', () => {
    // 21 December, solar noon there is about 12:45 local time
    let best = { azimuth: 0, elevation: -90 };
    for (let min = 11 * 60; min < 14 * 60; min++) {
      const s = sunPosition(site, 355, min);
      if (s.elevation > best.elevation) best = s;
    }
    expect(best.azimuth).toBeGreaterThan(178);
    expect(best.azimuth).toBeLessThan(182);
    expect(best.elevation).toBeCloseTo(90 - 20.55 - 23.44, 0);
  });

  it('rises in the east in the morning and sets in the west, below the horizon at night', () => {
    const morning = sunPosition(site, 80, 8 * 60);
    expect(morning.azimuth).toBeGreaterThan(60);
    expect(morning.azimuth).toBeLessThan(120);
    expect(morning.elevation).toBeGreaterThan(0);
    const evening = sunPosition(site, 80, 17 * 60 + 30);
    expect(evening.azimuth).toBeGreaterThan(240);
    expect(evening.azimuth).toBeLessThan(300);
    expect(sunPosition(site, 80, 0).elevation).toBeLessThan(0);
  });

  it("points by the plan's true north", () => {
    // North up: east is +x; true north turned 90° clockwise: east is +y (down the drawing)
    expect(bearingOnPlan(0, 90).map(v => Math.round(v * 1000) / 1000 + 0)).toEqual([1, 0]);
    expect(bearingOnPlan(90, 90).map(v => Math.round(v * 1000) / 1000 + 0)).toEqual([0, 1]);
    const [x, y, z] = sunDirection(0, { azimuth: 180, elevation: 30 });
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0.5);
    expect(z).toBeCloseTo(Math.cos(Math.PI / 6));
  });

  it('counts days of the year', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365);
    expect(dayOfYear(dateOfDay(298, 2026))).toBe(298);
  });
});
