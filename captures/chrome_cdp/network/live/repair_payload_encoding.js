const fs = require('fs');
const path = require('path');
const live = process.argv[2];
function repair(s) {
  if (typeof s !== 'string') return s;
  if (!/[ÃÂíìëê]/.test(s)) return s;
  return Buffer.from(s, 'latin1').toString('utf8');
}
function walk(v) {
  if (typeof v === 'string') return repair(v);
  if (!v || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(walk);
  for (const k of Object.keys(v)) v[k] = walk(v[k]);
  return v;
}
for (const name of ['request.json', 'response.json']) {
  const p = path.join(live, name);
  if (!fs.existsSync(p)) continue;
  const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
  fs.writeFileSync(p, JSON.stringify(walk(obj), null, 2), 'utf8');
}
console.log(JSON.stringify({ ok: true }, null, 2));
