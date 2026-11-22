const fs=require('node:fs');
const path=require('node:path');
require('../bundle.cjs');
const out=path.join(__dirname,'public');
fs.mkdirSync(out,{recursive:true});
fs.copyFileSync(path.join(__dirname,'../Open Cell Bench.html'),path.join(out,'wizard.html'));
