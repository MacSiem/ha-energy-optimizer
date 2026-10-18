'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'generated-sources.json'), 'utf8'));
const expected = ['src/optimizer.js', 'src/energy-insights.js', 'src/energy-email.js', 'src/chart-vendor.js'];
if (manifest.schema !== 1 || JSON.stringify(manifest.sources.map(s => s.path)) !== JSON.stringify(expected)) throw new Error('Unexpected bundle source list');
const sources = manifest.sources.map(source => {
  const text = fs.readFileSync(path.join(root, source.path), 'utf8');
  const digest = crypto.createHash('sha256').update(text).digest('hex');
  if (digest !== source.sha256) throw new Error(`Source provenance mismatch: ${source.path}`);
  return text;
});
const sharedPath = 'shared/ha-tools-email-schedules.js';
const shared = fs.readFileSync(path.join(root, sharedPath), 'utf8');
const inline = shared.replace(/^export function /gm, 'function ').trimEnd() + '\n';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const provenance = { path: sharedPath, sha256: digest(shared), inlineSha256: digest(inline) };
const matches = [...sources[2].matchAll(/\/\/ BEGIN vendored ha-tools-email-schedules factory\n([\s\S]*?)\/\/ END vendored ha-tools-email-schedules factory/g)];
if (matches.length !== 1 || matches[0][1] !== inline || JSON.stringify(manifest.sharedEmailSchedules) !== JSON.stringify(provenance))
  throw new Error('Schedules factory source/provenance mismatch; run scripts/sync-email-schedules.cjs --write');
const optionsPath = 'shared/ha-tools-energy-card-options.js';
const optionsSource = fs.readFileSync(path.join(root, optionsPath), 'utf8');
const optionsProvenance = { path: optionsPath, sha256: digest(optionsSource) };
if (JSON.stringify(manifest.sharedCardOptions) !== JSON.stringify(optionsProvenance)) throw new Error('Card options provenance mismatch; run scripts/sync-card-options.cjs --write');
for (const source of sources.slice(0, 3)) {
  const embedded = source.match(/\/\/ HA_ENERGY_CARD_OPTIONS_V5_START\n([\s\S]*?)\/\/ HA_ENERGY_CARD_OPTIONS_V5_END/);
  if (!embedded || embedded[1] !== optionsSource) throw new Error('Card options source parity mismatch');
}
const bundle = sources.join('');
const artifact = path.join(root, 'ha-energy-optimizer.js');
if (process.argv.includes('--write')) fs.writeFileSync(artifact, bundle);
else if (fs.readFileSync(artifact, 'utf8') !== bundle) throw new Error('Bundle does not match canonical component sources');
