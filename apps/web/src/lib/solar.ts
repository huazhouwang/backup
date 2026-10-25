/**
 * Where the sun stands, from the site's latitude, longitude and time zone, a day of the year and a local clock time (NOAA's
 * general solar position equations, good to a fraction of a degree), and where that puts it over a plan whose true north may be
 * turned (the site's northAngle).
 */

/** The sun's azimuth (degrees clockwise from true north) and elevation above the horizon (degrees) */
export interface SunPosition {
  azimuth: number;
  elevation: number;
}

const RAD = Math.PI / 180;

export function sunPosition(loc: { lat: number; lon: number; tz: number }, day: number, minutes: number): SunPosition {
  const g = ((2 * Math.PI) / 365) * (day - 1 + (minutes / 60 - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const trueSolar = minutes + eqTime + 4 * loc.lon - 60 * loc.tz;
  const ha = (trueSolar / 4 - 180) * RAD;
  const lat = loc.lat * RAD;
  const cosZenith = Math.min(1, Math.max(-1, Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha)));
  const elevation = 90 - Math.acos(cosZenith) / RAD;
  const azimuth = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) / RAD + 180 + 360) % 360;
  return { azimuth, elevation };
}

/** True north on the plan (x east, y south when northAngle is 0): a unit vector */
export function northOnPlan(northAngle: number): [number, number] {
  const r = northAngle * RAD;
  return [Math.sin(r), -Math.cos(r)];
}

/** A direction on the plan for an azimuth (degrees clockwise from true north) */
export function bearingOnPlan(northAngle: number, azimuth: number): [number, number] {
  const [nx, ny] = northOnPlan(northAngle);
  // East is north turned a quarter clockwise (on the plan, y points down)
  const [ex, ey] = [-ny, nx];
  const a = azimuth * RAD;
  return [nx * Math.cos(a) + ex * Math.sin(a), ny * Math.cos(a) + ey * Math.sin(a)];
}

/** Toward the sun in the 3D view (three.js: x east, y up, z the plan's y), a unit vector */
export function sunDirection(northAngle: number, sun: SunPosition): [number, number, number] {
  const [hx, hz] = bearingOnPlan(northAngle, sun.azimuth);
  const e = sun.elevation * RAD;
  return [hx * Math.cos(e), Math.sin(e), hz * Math.cos(e)];
}

/** Day of the year (1–366) of a date, and back */
export function dayOfYear(d: Date): number {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5);
}
export function dateOfDay(day: number, year = new Date().getFullYear()): Date {
  return new Date(year, 0, day);
}
