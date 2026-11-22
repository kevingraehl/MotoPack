// Rebuild the offline, single-file entry point from the same scripts used by index.html.
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const licenses=['fflate-LICENSE','earcut-LICENSE','three-LICENSE','pdfjs-LICENSE','license.occt-import-js.txt','license.occt.txt'];
const notices=licenses.map(name=>name+'\n'+read('vendor/'+name)).join('\n\n');
let html=read('index.html').replace(/<script src="([^"]+)"><\/script>/g,(_,name)=>
  '<script>\n'+read(name).replace(/<\/script/gi,'<\\/script')+'\n</script>');
html=html.replace('src="website/venmo.png"','src="data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'website/venmo.png')).toString('base64')+'"');
const css=read('motopack.css').replace('examples/conversion-story.webp','data:image/webp;base64,'+
  fs.readFileSync(path.join(__dirname,'examples/conversion-story.webp')).toString('base64'));
html=html.replace('<link rel="stylesheet" href="motopack.css">',()=>'<style>'+css+'</style>');
html=html.replace('<title>',()=>'<script type="text/plain" id="third-party-notices">'+notices+'</script>\n<title>');
const merchant=process.env.MOTOPACK_PAYPAL_MERCHANT_ID;
if(merchant){
  if(!/^[A-Z0-9]{13}$/.test(merchant))throw Error('Use a PayPal merchant ID.');
  html=html.replace('<title>','<meta name="paypal-merchant" content="'+merchant+'"><title>');
}
fs.writeFileSync(path.join(__dirname,'Open Cell Bench.html'),html);
