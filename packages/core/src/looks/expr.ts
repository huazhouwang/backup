/**
 * A small, safe expression language for recipes (see recipe.ts): numbers, names, + - * / %, comparisons, && || !, the ternary
 * `a ? b : c`, parentheses and a fixed set of functions. Parsed once into a tree and evaluated against a scope; never `eval`.
 * Angles are in degrees (sin, cos, tan take degrees; atan2 returns degrees).
 */

export type ExprNode =
  | { t: 'num'; v: number }
  | { t: 'name'; v: string }
  | { t: 'un'; op: '-' | '!'; a: ExprNode }
  | { t: 'bin'; op: string; a: ExprNode; b: ExprNode }
  | { t: 'cond'; c: ExprNode; a: ExprNode; b: ExprNode }
  | { t: 'call'; fn: string; args: ExprNode[] };

export class ExprError extends Error {}

const DEG = Math.PI / 180;

/** Pseudo-random in [0, 1) from a seed and a key: the same inputs always give the same value */
export function hashRandom(seed: number, key: number) {
  let x = (Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(key * 1000) | 0, 0xc2b2ae35)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 2 ** 32;
}

const FUNCTIONS: Record<string, { n: [number, number]; f: (a: number[], seed: number) => number }> = {
  min: { n: [1, 99], f: a => Math.min(...a) },
  max: { n: [1, 99], f: a => Math.max(...a) },
  abs: { n: [1, 1], f: a => Math.abs(a[0]) },
  sqrt: { n: [1, 1], f: a => Math.sqrt(a[0]) },
  floor: { n: [1, 1], f: a => Math.floor(a[0]) },
  ceil: { n: [1, 1], f: a => Math.ceil(a[0]) },
  round: { n: [1, 1], f: a => Math.round(a[0]) },
  sin: { n: [1, 1], f: a => Math.sin(a[0] * DEG) },
  cos: { n: [1, 1], f: a => Math.cos(a[0] * DEG) },
  tan: { n: [1, 1], f: a => Math.tan(a[0] * DEG) },
  atan2: { n: [2, 2], f: a => Math.atan2(a[0], a[1]) / DEG },
  hypot: { n: [1, 99], f: a => Math.hypot(...a) },
  clamp: { n: [3, 3], f: a => Math.min(Math.max(a[0], a[1]), a[2]) },
  lerp: { n: [3, 3], f: a => a[0] + (a[1] - a[0]) * a[2] },
  /** rnd(k): pseudo-random in [0, 1), fixed per recipe seed and key */
  rnd: { n: [1, 1], f: (a, seed) => hashRandom(seed, a[0]) },
};
export const EXPR_FUNCTIONS = Object.keys(FUNCTIONS);

const TOKEN = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[-+*/%<>!?:(),]))/y;

export function parseExpr(src: string): ExprNode {
  const tokens: string[] = [];
  let pos = 0;
  while (src.slice(pos).trim()) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new ExprError(`cannot read "${src.slice(pos).trim()}" in "${src}"`);
    tokens.push(m[0].trim());
    pos = TOKEN.lastIndex;
  }
  let i = 0;
  const peek = () => tokens[i];
  const take = (t?: string) => {
    const v = tokens[i++];
    if (t && v !== t) throw new ExprError(`expected "${t}" but found ${v === undefined ? 'the end' : `"${v}"`} in "${src}"`);
    return v;
  };
  const LEVELS = [['||'], ['&&'], ['==', '!='], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];
  const ternary = (): ExprNode => {
    const c = binary(0);
    if (peek() !== '?') return c;
    take('?');
    const a = ternary();
    take(':');
    return { t: 'cond', c, a, b: ternary() };
  };
  const binary = (level: number): ExprNode => {
    if (level === LEVELS.length) return unary();
    let a = binary(level + 1);
    while (LEVELS[level].includes(peek())) {
      const op = take();
      a = { t: 'bin', op, a, b: binary(level + 1) };
    }
    return a;
  };
  const unary = (): ExprNode => {
    if (peek() === '-' || peek() === '!') return { t: 'un', op: take() as '-' | '!', a: unary() };
    if (peek() === '+') {
      take();
      return unary();
    }
    return atom();
  };
  const atom = (): ExprNode => {
    const v = take();
    if (v === undefined) throw new ExprError(`unexpected end of "${src}"`);
    if (v === '(') {
      const e = ternary();
      take(')');
      return e;
    }
    if (/^[\d.]/.test(v)) return { t: 'num', v: Number(v) };
    if (/^[A-Za-z_]/.test(v)) {
      if (peek() !== '(') return { t: 'name', v };
      take('(');
      const args: ExprNode[] = [];
      if (peek() !== ')')
        for (;;) {
          args.push(ternary());
          if (peek() !== ',') break;
          take(',');
        }
      take(')');
      const fn = FUNCTIONS[v];
      if (!fn) throw new ExprError(`unknown function "${v}" in "${src}" (known: ${EXPR_FUNCTIONS.join(', ')})`);
      if (args.length < fn.n[0] || args.length > fn.n[1])
        throw new ExprError(`${v}() takes ${fn.n[0] === fn.n[1] ? fn.n[0] : `${fn.n[0]}+`} arguments in "${src}"`);
      return { t: 'call', fn: v, args };
    }
    throw new ExprError(`unexpected "${v}" in "${src}"`);
  };
  const tree = ternary();
  if (i < tokens.length) throw new ExprError(`unexpected "${tokens[i]}" in "${src}"`);
  return tree;
}

export type Scope = Record<string, number>;

export function evalNode(n: ExprNode, scope: Scope, seed: number): number {
  switch (n.t) {
    case 'num':
      return n.v;
    case 'name': {
      if (n.v === 'pi') return Math.PI;
      const v = scope[n.v];
      if (v === undefined) throw new ExprError(`unknown name "${n.v}" (known: ${Object.keys(scope).join(', ')})`);
      return v;
    }
    case 'un': {
      const a = evalNode(n.a, scope, seed);
      return n.op === '-' ? -a : a ? 0 : 1;
    }
    case 'cond':
      return evalNode(n.c, scope, seed) ? evalNode(n.a, scope, seed) : evalNode(n.b, scope, seed);
    case 'call':
      return FUNCTIONS[n.fn].f(
        n.args.map(a => evalNode(a, scope, seed)),
        seed,
      );
    case 'bin': {
      const a = evalNode(n.a, scope, seed);
      if (n.op === '&&') return a ? evalNode(n.b, scope, seed) : a;
      if (n.op === '||') return a ? a : evalNode(n.b, scope, seed);
      const b = evalNode(n.b, scope, seed);
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '%':
          return a % b;
        case '<':
          return +(a < b);
        case '<=':
          return +(a <= b);
        case '>':
          return +(a > b);
        case '>=':
          return +(a >= b);
        case '==':
          return +(a === b);
        case '!=':
          return +(a !== b);
      }
    }
  }
  throw new ExprError('bad expression');
}

const cache = new Map<string, ExprNode>();

/** Evaluate a number or an expression string in a scope */
export function evalExpr(e: number | string, scope: Scope, seed = 1): number {
  if (typeof e === 'number') return e;
  let n = cache.get(e);
  if (!n) {
    n = parseExpr(e);
    if (cache.size > 5000) cache.clear();
    cache.set(e, n);
  }
  const v = evalNode(n, scope, seed);
  if (!Number.isFinite(v)) throw new ExprError(`"${e}" is not a finite number`);
  return v;
}
