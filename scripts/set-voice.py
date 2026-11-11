# Write a fitted voicing (a fit script's JSON) into an engine file's `export const <NAME>: … = { … };` block,
# each value rounded to four significant figures: python3 scripts/set-voice.py <file.ts> <NAME> <voice.json>
import json, re, sys
path, name, src = sys.argv[1:4]
v = json.load(open(src))
s = open(path).read()
m = re.search(r'(export const %s: \w+ = \{\n)(.*?)(\n\};)' % name, s, re.S)
body = m.group(2)
def fmt(x):
    return ('%.4g' % x) if isinstance(x, float) else str(x)
out = []
for line in body.split('\n'):
    k = re.match(r'\s*(\w+):', line)
    if k and k.group(1) in v:
        line = '  %s: %s,' % (k.group(1), fmt(float(v[k.group(1)])))
    out.append(line)
open(path, 'w').write(s[:m.start(2)] + '\n'.join(out) + s[m.end(2):])
