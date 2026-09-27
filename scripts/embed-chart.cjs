const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const artifact = join(root, 'ha-energy-optimizer.js');
const vendor = join(root, 'node_modules/chart.js/dist/chart.umd.min.js');
const marker = '\n/* HA_ENERGY_CHART_VENDOR_START: generated from chart.js 4.5.1 */\n';
const current = readFileSync(artifact, 'utf8');
const source = current.split(marker)[0];
const chart = readFileSync(vendor, 'utf8').trim();
const bundle = source + marker +
  'const HA_ENERGY_CHART = (() => {\n' +
  '  const module = { exports: {} };\n' +
  '  const exports = module.exports;\n' +
  chart + '\n' +
  '  return module.exports.Chart || module.exports;\n' +
  '})();\n';

if (process.argv.includes('--write')) writeFileSync(artifact, bundle);
else if (current !== bundle) {
  console.error('Bundled Chart.js differs from pinned chart.js 4.5.1; run npm run build:chart');
  process.exitCode = 1;
}
