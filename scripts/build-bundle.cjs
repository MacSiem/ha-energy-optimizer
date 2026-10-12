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
const bundle = sources.join('');
const artifact = path.join(root, 'ha-energy-optimizer.js');
if (process.argv.includes('--write')) fs.writeFileSync(artifact, bundle);
else if (fs.readFileSync(artifact, 'utf8') !== bundle) throw new Error('Bundle does not match canonical component sources');
