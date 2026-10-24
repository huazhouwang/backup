/**
 * Part-list recipes (the format before scripts, see recipe.ts) to JSONata scripts (script.ts): what the default set was written
 * in, what designs stored before schema 5, and what the agent may still send. The script builds exactly the same parts: names
 * become variables ($w, $leg), expressions keep their meaning, repeats become ranges, conditions ternaries, parts helper calls.
 */
import { parseExpr, type ExprNode } from './expr.js';
import type { Expr, PartRecipe, ProfileItem, RecipePart } from './recipe.js';
import { DEFAULT_MATERIALS } from './builtin.js';
import { SCRIPT_HELPERS, type ParamDecl, type ParamType, type ParamValue, type Recipe } from './script.js';

/** JSONata operators by precedence (higher binds tighter), as in expr.ts */
const PREC: Record<string, number> = { '?': 0, '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
const JS_OP: Record<string, string> = { '||': 'or', '&&': 'and', '==': '=' };
const LOGICAL = new Set(['||', '&&', '==', '!=', '<', '<=', '>', '>=']);
const VARIADIC = new Set(['min', 'max']);

/** A recipe name as a JSONata variable; names that would hide a helper get an underscore */
const varName = (n: string) => (n === 'pi' ? '$pi' : `$${SCRIPT_HELPERS.includes(n) ? `${n}_` : n}`);

function num(v: number) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e9) / 1e9);
}

/** A node yields a boolean in JSONata (comparisons, and, or, not) */
const isBool = (n: ExprNode) => (n.t === 'bin' && LOGICAL.has(n.op)) || (n.t === 'un' && n.op === '!');

function emit(n: ExprNode, prec = 0): string {
  switch (n.t) {
    case 'num':
      return n.v < 0 ? `(${num(n.v)})` : num(n.v);
    case 'name':
      return varName(n.v);
    case 'un':
      return n.op === '!' ? `$not(${emit(n.a)})` : `-${emit(n.a, 7)}`;
    case 'call': {
      const args = n.args.map(a => emitNum(a));
      return VARIADIC.has(n.fn) ? `$${n.fn}([${args.join(', ')}])` : `$${n.fn}(${args.join(', ')})`;
    }
    case 'cond': {
      const s = `${emit(n.c, 1)} ? ${emit(n.a, 1)} : ${emit(n.b, 0)}`;
      return prec > 0 ? `(${s})` : s;
    }
    case 'bin': {
      const p = PREC[n.op],
        logical = n.op === '||' || n.op === '&&';
      const side = (x: ExprNode, right: boolean) => (logical ? emit(x, p + (right ? 1 : 0)) : emitNum(x, p + (right ? 1 : 0)));
      const s = `${side(n.a, false)} ${JS_OP[n.op] ?? n.op} ${side(n.b, true)}`;
      return p < prec ? `(${s})` : s;
    }
  }
}

/** An expression used as a number: a boolean becomes 1 or 0, as expr.ts treats it */
function emitNum(n: ExprNode, prec = 0) {
  return isBool(n) ? `(${emit(n)} ? 1 : 0)` : emit(n, prec);
}

const e = (x: Expr) => (typeof x === 'number' ? (x < 0 ? `-${num(-x)}` : num(x)) : emitNum(parseExpr(x)));
const v = (xs: Expr[]) => `[${xs.map(e).join(', ')}]`;
const str = (s: string) => `'${s}'`;
const opts = (o: Record<string, string | undefined>) => {
  const entries = Object.entries(o).filter(([, x]) => x !== undefined);
  return entries.length ? `{${entries.map(([k, x]) => `"${k}": ${x}`).join(', ')}}` : '';
};
const args = (...xs: (string | undefined)[]) => {
  while (xs.length && xs[xs.length - 1] === undefined) xs.pop();
  return xs.map(x => x ?? 'null').join(', ');
};

function profile(items: ProfileItem[]) {
  return `[${items.map(it => (Array.isArray(it) ? v(it) : 'arc' in it ? `{"arc": [${it.arc.map((x, i) => (i === 5 ? String(!!x) : e(x as Expr))).join(', ')}]}` : `{"curve": ${v(it.curve)}}`)).join(', ')}]`;
}

function part(p: RecipePart, indent: string): string {
  const inner = indent + '  ';
  const list = (parts: RecipePart[]) => `[\n${parts.map(x => inner + '  ' + part(x, inner + '  ')).join(',\n')}\n${inner}]`;
  let s: string;
  switch (p.kind) {
    case 'repeat': {
      const as = varName(p.as ?? 'i');
      const count = typeof p.count === 'number' ? num(Math.floor(p.count) - 1) : `$floor(${e(p.count)}) - 1`;
      const lets = Object.entries(p.let ?? {})
        .map(([k, x]) => `${inner}${varName(k)} := ${e(x)};\n`)
        .join('');
      return `[0..${count}].(\n${inner}${as} := $;\n${lets}${inner}${list(p.parts)}\n${indent})`;
    }
    case 'if':
      return `${emit(parseExpr(String(p.when)), 1)} ? ${list(p.parts)} : ${p.else ? list(p.else) : '[]'}`;
    case 'base':
      return `$base(${JSON.stringify(p.mats)})`;
    case 'box':
      s = `$box(${args(v(p.size), v(p.at), str(p.mat), p.r !== undefined || p.rot ? e(p.r ?? 0) : undefined, p.rot && v(p.rot))})`;
      break;
    case 'cylinder':
      s = `$cylinder(${args(e(p.r), e(p.h), v(p.at), str(p.mat), opts({ r2: p.r2 === undefined ? undefined : e(p.r2), axis: p.axis && str(p.axis), seg: p.seg === undefined ? undefined : num(p.seg), scale: p.scale && v(p.scale) }) || undefined)})`;
      break;
    case 'sphere':
      s = `$sphere(${args(e(p.r), v(p.at), str(p.mat), p.scale && v(p.scale))})`;
      break;
    case 'lathe':
      s = `$lathe(${args(profile(p.profile), v(p.at), str(p.mat), opts({ scale: p.scale && v(p.scale), seg: p.seg === undefined ? undefined : num(p.seg) }) || undefined)})`;
      break;
    case 'rod':
      s = `$rod(${args(v(p.from), v(p.to), e(p.r), str(p.mat), p.seg === undefined ? undefined : num(p.seg))})`;
      break;
    case 'ring':
      s = `$ring(${args(e(p.R), e(p.r), v(p.at), str(p.mat), p.axis && str(p.axis))})`;
      break;
    case 'tube':
      s = `$tube(${args(`[${p.points.map(v).join(', ')}]`, e(p.r), str(p.mat))})`;
      break;
    case 'panel':
      s = `$panel(${args(v(p.from), v(p.to), e(p.y), e(p.h), e(p.t), str(p.mat))})`;
      break;
    case 'extrude':
      s = `$extrude(${args(str(p.plane), profile(p.profile), e(p.depth), str(p.mat), p.bevel !== undefined || p.at ? e(p.bevel ?? 0) : undefined, p.at && v(p.at))})`;
      break;
  }
  return p.plan === false ? `$noplan(${s})` : s;
}

/** A part-list recipe as a script that builds the same parts */
export function toScript(r: PartRecipe): Recipe {
  const lets = Object.entries(r.let ?? {})
    .map(([k, x]) => `  ${varName(k)} := ${e(x)};\n`)
    .join('');
  const parts = `[\n${r.parts.map(p => '  ' + part(p, '  ')).join(',\n')}\n]`;
  let body: string;
  if (r.plan) {
    const n2 = (p: [Expr, Expr]) => v(p);
    const plan = r.plan.map(it =>
      'line' in it
        ? `{"line": [${it.line.map(n2).join(', ')}]}`
        : 'ring' in it
          ? `{"ring": [${it.ring.map(n2).join(', ')}]${it.fill === false ? ', "fill": false' : ''}}`
          : `{"circle": {"at": ${n2(it.circle.at)}, "r": ${e(it.circle.r)}}${it.fill === false ? ', "fill": false' : ''}}`,
    );
    body = `{\n  "parts": ${parts.replace(/\n/g, '\n  ')},\n  "plan": [${plan.join(', ')}]\n}`;
  } else body = parts;
  return { ...(r.seed !== undefined ? { seed: r.seed } : {}), script: lets ? `(\n${lets}  ${body.replace(/\n/g, '\n  ').trimEnd()}\n)` : body };
}

/**
 * Parameter declarations from before v7 (a bare default, or { default, label, doc, options, min, max }) as JSON Schema
 * declarations: the type from the default and the choices, `format: material` for a material default, `title` from the label
 * (in the language it is written in). Declarations that already have a type are kept.
 */
export function normalizeParams(params: unknown, materials: Record<string, unknown> = {}): Record<string, ParamDecl> | undefined {
  if (!params || typeof params !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(params as Record<string, unknown>).map(([k, d]) => {
      if (d && typeof d === 'object' && 'type' in d) return [k, d as ParamDecl];
      const old = (d !== null && typeof d === 'object' ? d : { default: d }) as {
        default?: ParamValue;
        label?: string;
        doc?: string;
        options?: ParamValue[];
        min?: number;
        max?: number;
      };
      const v = old.default ?? null;
      const seen = new Set<ParamType>(
        [v, ...(old.options ?? [])].filter(x => x !== null).map(x => (typeof x === 'number' ? 'number' : (typeof x as ParamType))),
      );
      if (!seen.size) seen.add('number');
      const types: ParamType[] = [...seen, ...(v === null ? ['null' as const] : [])];
      const isMaterial = typeof v === 'string' && (v in materials || v in DEFAULT_MATERIALS);
      const decl: ParamDecl = {
        type: types.length === 1 ? types[0] : types,
        default: v,
        ...(isMaterial ? { format: 'material' as const } : {}),
        ...(old.options?.length ? { enum: old.options.includes(v) || v === null ? old.options : [v, ...old.options] } : {}),
        ...(typeof old.min === 'number' ? { minimum: old.min } : {}),
        ...(typeof old.max === 'number' ? { maximum: old.max } : {}),
        ...(old.label ? { title: /[\u4e00-\u9fff]/.test(old.label) ? { zh: old.label } : { en: old.label } } : {}),
        ...(old.doc ? { description: old.doc } : {}),
      };
      return [k, decl];
    }),
  );
}

/**
 * A recipe as given (a script, or a part list from before scripts) as a script with JSON Schema parameter declarations;
 * anything else is returned as is, to fail the check
 */
export function normalizeRecipe(input: unknown): unknown {
  let r = input;
  if (r && typeof r === 'object' && 'parts' in r && !('script' in r)) {
    try {
      r = toScript(r as PartRecipe);
    } catch {
      return input;
    }
  }
  if (r && typeof r === 'object' && 'params' in r) {
    const o = r as Recipe;
    return { ...o, params: normalizeParams(o.params, o.materials) };
  }
  return r;
}
