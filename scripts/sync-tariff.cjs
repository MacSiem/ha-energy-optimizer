'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = fs.readFileSync(path.join(root, 'shared/ha-tools-energy-tariff.js'), 'utf8');
const runtime = canonical.replace(/^'use strict';\n/, '').replace(/^if \(typeof module.*$/m, '').trimEnd();
const sha = digest(canonical);
const manifestPath = path.join(root, 'generated-sources.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const [file, kind] of [['src/optimizer.js', 'optimizer'], ['src/energy-insights.js', 'insights'], ['src/energy-email.js', 'email']]) {
  const target = path.join(root, file), original = fs.readFileSync(target, 'utf8');
  const block = `// HA_TARIFF_V3_START sha256=${sha}\n${runtime}\nconst profile = energyTariffProfileV3(this._config, this._hass?.config, '${kind}');\nconst key = JSON.stringify(profile);\nif (this._tariffV3Model && this._tariffV3Key === key) return this._tariffV3Model;\nthis._tariffV3Key = key;\nreturn (this._tariffV3Model = createEnergyTariffV3(profile));\n// HA_TARIFF_V3_END`;
  if (!original.includes('// HA_TARIFF_V3_START')) throw new Error(`Missing tariff consumer: ${file}`);
  const next = original.replace(/\/\/ HA_TARIFF_V3_START[^\n]*\n[\s\S]*?\/\/ HA_TARIFF_V3_END/, block);
  if (process.argv.includes('--write')) fs.writeFileSync(target, next);
  else if (original !== next) throw new Error(`Tariff source parity failed: ${file}`);
  const source = manifest.sources.find(s => s.path === file);
  if (process.argv.includes('--write')) source.sha256 = digest(next);
}
if (process.argv.includes('--write')) {
  manifest.sharedTariff = { path: 'shared/ha-tools-energy-tariff.js', sha256: sha };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
} else if (manifest.sharedTariff?.sha256 !== sha) throw new Error('Tariff manifest provenance failed');
