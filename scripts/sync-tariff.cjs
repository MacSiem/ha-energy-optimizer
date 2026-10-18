'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const modules = ['shared/ha-tools-ui.js', 'shared/ha-tools-energy-tariff.js', 'shared/ha-tools-tariff-guard.js', 'shared/ha-tools-tariff-settings.js', 'shared/ha-tools-energy-backend.js', 'shared/ha-tools-tariff-host.js', 'shared/ha-tools-energy-analysis.js', 'shared/ha-tools-energy-analysis-binding.js', 'shared/ha-tools-energy-analysis-view.js', 'shared/ha-tools-energy-analysis-host.js']
  .map(file => ({ path: file, text: fs.readFileSync(path.join(root, file), 'utf8') }));
const provenance = modules.map(module => ({ path: module.path, sha256: digest(module.text) }));
const runtime = modules.map(module => module.text.replace(/^'use strict';\n/, '').replace(/^if \(typeof module[^\n]*$/gm, '').trimEnd()).join('\n');
const sha = digest(JSON.stringify(provenance));
const manifestPath = path.join(root, 'generated-sources.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const reportPath = 'shared/ha-tools-energy-report.js';
const reportSource = fs.readFileSync(path.join(root, reportPath), 'utf8');
const reportInline = reportSource.replace(/^if \(typeof module[^\n]*$/gm, '').trimEnd();
const reportBlock = '// HA_ENERGY_REPORT_V53_START\n' + reportInline + '\n// HA_ENERGY_REPORT_V53_END';
const reportProvenance = {path:reportPath,sha256:digest(reportSource),inlineSha256:digest(reportInline)};
if (!process.argv.includes('--write') && JSON.stringify(manifest.sharedEnergyReport) !== JSON.stringify(reportProvenance)) throw new Error('Report factory provenance failed');
if (process.argv.includes('--write')) manifest.sharedEnergyReport = reportProvenance;
const formatPath = 'shared/ha-tools-format.js';
const formatSource = fs.readFileSync(path.join(root, formatPath), 'utf8');
const formatInline = formatSource.replace(/^if \(typeof module[^\n]*$/gm, '').trimEnd();
const formatBlock = '// HA_FORMAT_UI_START\n' + formatInline + '\n// HA_FORMAT_UI_END';
const formatProvenance = { path: formatPath, sha256: digest(formatSource), inlineSha256: digest(formatInline) };
if (!process.argv.includes('--write') && JSON.stringify(manifest.sharedFormat) !== JSON.stringify(formatProvenance)) throw new Error('Format factory provenance failed');
if (process.argv.includes('--write')) manifest.sharedFormat = formatProvenance;
for (const [file, kind] of [['src/optimizer.js', 'optimizer'], ['src/energy-insights.js', 'insights'], ['src/energy-email.js', 'email']]) {
  const target = path.join(root, file), original = fs.readFileSync(target, 'utf8');
  const block = `// HA_TARIFF_V3_START sha256=${sha}\n${runtime}\nthis._tariffHostController = createTariffHostV3({ card: this, kind: '${kind}', createModel: createEnergyTariffV3, legacyProfile: energyTariffProfileV3, createSettings: createTariffSettingsV3, createUi: createUiV3, ...this._createTariffConsumerV3(createTariffGuardV3) });\nthis._installTariffConsumerV3();\n// HA_TARIFF_V3_END`;
  if (!original.includes('// HA_TARIFF_V3_START')) throw new Error(`Missing tariff consumer: ${file}`);
  const withReport = kind === 'email' ? original.replace(/\/\/ HA_ENERGY_REPORT_V53_START\n[\s\S]*?\/\/ HA_ENERGY_REPORT_V53_END/, reportBlock) : original;
  if (kind === 'email' && !original.includes('// HA_ENERGY_REPORT_V53_START')) throw new Error('Missing report consumer');
  const formatted = withReport.replace(/\/\/ HA_FORMAT_UI_START\n[\s\S]*?\/\/ HA_FORMAT_UI_END/, formatBlock);
  if (!original.includes('// HA_FORMAT_UI_START')) throw new Error('Missing format factory consumer: ' + file);
  const next = formatted.replace(/\/\/ HA_TARIFF_V3_START[^\n]*\n[\s\S]*?\/\/ HA_TARIFF_V3_END/, block);
  if (process.argv.includes('--write')) fs.writeFileSync(target, next);
  else if (original !== next) throw new Error(`Tariff source parity failed: ${file}`);
  const source = manifest.sources.find(s => s.path === file);
  if (process.argv.includes('--write')) source.sha256 = digest(next);
}
if (process.argv.includes('--write')) {
  manifest.sharedTariff = { sha256: sha, modules: provenance };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
} else if (manifest.sharedTariff?.sha256 !== sha) throw new Error('Tariff manifest provenance failed');
