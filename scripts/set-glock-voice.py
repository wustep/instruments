# Write a fitted glockenspiel voicing (scripts/fit-glock.ts's JSON) into core/glockenspiel.ts's GLOCK_VOICE:
#   python3 scripts/set-glock-voice.py .fit/glock.json
import json, re, sys
v = json.load(open(sys.argv[1]))
path = 'packages/engine/src/core/glockenspiel.ts'
s = open(path).read()
m = re.search(r'(export const GLOCK_VOICE: GlockVoice = \{\n)(.*?)(\n\};)', s, re.S)
order = ['ratio', 'ratioOct', 'level', 'levelOct', 'levelOct2', 'levelDyn', 'levelBrass', 'decay', 'decayOct', 'decayOct2', 'knock', 'knockDyn', 'knockF', 'knockTau', 'hp', 'gainDb']
fmt = lambda x: json.dumps(x).replace(',', ', ') if isinstance(x, list) else json.dumps(x)
body = '\n'.join('  %s: %s,' % (k, fmt(v[k])) for k in order if k in v)
open(path, 'w').write(s[:m.start(2)] + body + s[m.end(2):])
