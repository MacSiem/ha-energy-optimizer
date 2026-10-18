'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const path=require('node:path'),root=path.resolve(__dirname,'..');
const helper=fs.readFileSync(path.join(root,'shared/ha-tools-energy-card-options.js'),'utf8').trimEnd();
const manifestPath=path.join(root,'generated-sources.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
for(const source of manifest.sources.filter(row=>/src\/(optimizer|energy-insights|energy-email)\.js/.test(row.path))){const full=path.join(root,source.path),text=fs.readFileSync(full,'utf8');const next=text.replace(/\/\/ HA_ENERGY_CARD_OPTIONS_V5_START\n[\s\S]*?\/\/ HA_ENERGY_CARD_OPTIONS_V5_END/,`// HA_ENERGY_CARD_OPTIONS_V5_START\n${helper}\n// HA_ENERGY_CARD_OPTIONS_V5_END`);if(!text.includes('// HA_ENERGY_CARD_OPTIONS_V5_START'))throw new Error('Missing options consumer '+source.path);if(process.argv.includes('--write')){fs.writeFileSync(full,next);source.sha256=digest(next);}else if(text!==next)throw new Error('Card options parity '+source.path);}
const entry={path:'shared/ha-tools-energy-card-options.js',sha256:digest(helper+'\n')};
if(process.argv.includes('--write')){manifest.sharedCardOptions=entry;fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');}else if(JSON.stringify(manifest.sharedCardOptions)!==JSON.stringify(entry))throw new Error('Card options provenance mismatch');
