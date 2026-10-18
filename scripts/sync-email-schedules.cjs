// Maintained source/provenance sync only. The owner runs --write before the normal bundle generator.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const modulePath = 'shared/ha-tools-email-schedules.js';
const moduleText = fs.readFileSync(path.join(root, modulePath), 'utf8');
const inline = moduleText.replace(/^export function /gm, 'function ').trimEnd();
const begin = '// BEGIN vendored ha-tools-email-schedules factory';
const end = '// END vendored ha-tools-email-schedules factory';
const targetPath = path.join(root, 'src/energy-email.js');
const original = fs.readFileSync(targetPath, 'utf8');
const expression = /\/\/ BEGIN vendored ha-tools-email-schedules factory\n[\s\S]*?\/\/ END vendored ha-tools-email-schedules factory/g;
if ([...original.matchAll(expression)].length !== 1) throw new Error('Expected one schedules factory consumer');
const next = original.replace(expression, `${begin}\n${inline}\n${end}`);
const provenance = { path: modulePath, sha256: digest(moduleText), inlineSha256: digest(inline + '\n') };
const manifestPath = path.join(root, 'generated-sources.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (process.argv.includes('--write')) {
  fs.writeFileSync(targetPath, next);
  manifest.sources.find(source => source.path === 'src/energy-email.js').sha256 = digest(next);
  manifest.sharedEmailSchedules = provenance;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
} else {
  if (next !== original) throw new Error('Schedules factory source parity failed');
  if (manifest.sources.find(source => source.path === 'src/energy-email.js').sha256 !== digest(next) ||
    JSON.stringify(manifest.sharedEmailSchedules) !== JSON.stringify(provenance))
    throw new Error('Schedules factory provenance failed');
}
