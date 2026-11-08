// Syntax compatibility check for the AudioWorklet bundle. AudioWorklet arrived in Safari 14.1
// (and WKWebView with it), whose parser lacks some later syntax; a worklet module that fails to
// parse makes addModule() reject (or, in some embeddings, never settle). Run after the build:
//   node scripts/check-worklet-syntax.mjs apps/web/dist
// Fails on syntax newer than Safari 14.1 understands, and lists runtime APIs it lacks.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAst } from 'vite';

const dir = join(process.argv[2] ?? 'apps/web/dist', 'assets');
const files = readdirSync(dir).filter((f) => /^processor-.*\.js$/.test(f));
if (!files.length) throw new Error(`no worklet bundle (processor-*.js) in ${dir}`);
let bad = 0;
for (const f of files) {
  const src = readFileSync(join(dir, f), 'utf8');
  const ast = parseAst(src);
  const problems = [];
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;
  const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
  const visit = (n, depth) => {
    if (!n || typeof n.type !== 'string') return;
    const at = `line ${lineOf(n.start ?? 0)}`;
    if (n.type === 'StaticBlock') problems.push(`class static block (Safari 16.4) at ${at}`);
    if (n.type === 'MethodDefinition' && n.key?.type === 'PrivateIdentifier') problems.push(`private method #${n.key.name} (Safari 15) at ${at}`);
    if (n.type === 'BinaryExpression' && n.operator === 'in' && n.left?.type === 'PrivateIdentifier') problems.push(`#x in obj (Safari 15) at ${at}`);
    if (n.type === 'AwaitExpression' && depth === 0) problems.push(`top-level await (Safari 15) at ${at}`);
    if (n.type === 'Literal' && n.regex && /[dv]/.test(n.regex.flags)) problems.push(`RegExp d/v flag at ${at}`);
    const d = depth + (FN.has(n.type) ? 1 : 0);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => visit(c, d));
      else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v, d);
    }
  };
  visit(ast, 0);
  // runtime APIs missing in Safari 14.1 (a call fails only when reached, but a worklet has no console)
  for (const [re, what] of [[/\.at\(/g, 'Array/String .at() (Safari 15.4)'], [/\.findLast(Index)?\(/g, 'findLast (Safari 15.4)'], [/Object\.hasOwn\(/g, 'Object.hasOwn (Safari 15.4)'], [/structuredClone\(/g, 'structuredClone (Safari 15.4)']]) {
    const n = src.match(re)?.length ?? 0;
    if (n) problems.push(`${what}: ${n} use${n > 1 ? 's' : ''}`);
  }
  if (problems.length) {
    bad++;
    console.error(`${f}: not loadable by Safari 14.1 / its WKWebView:\n  ${problems.join('\n  ')}`);
  } else console.log(`${f}: ok for Safari 14.1+ (${(src.length / 1024).toFixed(0)} kB)`);
}
process.exit(bad ? 1 : 0);
