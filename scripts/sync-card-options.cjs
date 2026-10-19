'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const path=require('node:path'),root=path.resolve(__dirname,'..');
const helper=fs.readFileSync(path.join(root,'shared/ha-tools-energy-card-options.js'),'utf8').trimEnd();
const placement=fs.readFileSync(path.join(root,'shared/ha-tools-dashboard-placement.js'),'utf8').trimEnd();
const manifestPath=path.join(root,'generated-sources.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const placementBlock=`// HA_DASHBOARD_PLACEMENT_V53_START\n${placement}\n// HA_DASHBOARD_PLACEMENT_V53_END`;
const optionsBlock=`// HA_ENERGY_CARD_OPTIONS_V5_START\n${helper}\n// HA_ENERGY_CARD_OPTIONS_V5_END`;
for(const source of manifest.sources.filter(row=>/src\/(optimizer|energy-insights|energy-email)\.js/.test(row.path))){
  const full=path.join(root,source.path),text=fs.readFileSync(full,'utf8');
  if(!text.includes('// HA_ENERGY_CARD_OPTIONS_V5_START'))throw new Error('Missing options consumer '+source.path);
  const existing=[...text.matchAll(/\/\/ HA_DASHBOARD_PLACEMENT_V53_START\n[\s\S]*?\/\/ HA_DASHBOARD_PLACEMENT_V53_END\n?/g)];
  if(existing.length>1)throw new Error('Duplicate placement consumer '+source.path);
  // Both factories share the card class's outer scope, outside tariff-constructor runtime.
  const clean=text.replace(/\/\/ HA_DASHBOARD_PLACEMENT_V53_START\n[\s\S]*?\/\/ HA_DASHBOARD_PLACEMENT_V53_END\n?/g,'');
  const next=clean.replace(/\/\/ HA_ENERGY_CARD_OPTIONS_V5_START\n[\s\S]*?\/\/ HA_ENERGY_CARD_OPTIONS_V5_END/,placementBlock+'\n'+optionsBlock);
  if(process.argv.includes('--write')){fs.writeFileSync(full,next);source.sha256=digest(next);}
  else if(text!==next)throw new Error('Card options/placement parity '+source.path);
}
const entry={path:'shared/ha-tools-energy-card-options.js',sha256:digest(helper+'\n')};
const placementEntry={path:'shared/ha-tools-dashboard-placement.js',sha256:digest(placement+'\n')};
if(process.argv.includes('--write')){
  manifest.sharedCardOptions=entry;manifest.sharedDashboardPlacement=placementEntry;
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
}else{
  if(JSON.stringify(manifest.sharedCardOptions)!==JSON.stringify(entry))throw new Error('Card options provenance mismatch');
  if(JSON.stringify(manifest.sharedDashboardPlacement)!==JSON.stringify(placementEntry))throw new Error('Placement provenance mismatch');
}
