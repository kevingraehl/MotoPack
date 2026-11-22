// Diameter and length are maximum envelopes, including positive dimensional tolerances.
// The display uses the normalized Molicel STEP mesh for each envelope.
const cellCatalog = [
  // Molicel INR-21700 product data sheets, P42A rev 1.7 and P50B rev 1.1.
  ['p42a','Molicel P42A',4.2,21.55,70.15,3.6,45,70],
  ['p50b','Molicel P50B',5,21.55,70.15,3.6,60,71,'80 °C cutoff'],
  // EVE published 21700/40P, 40PL and 50PL product specifications.
  ['40p','EVE 40P',4,21.25,70.30,3.6,50,70],
  ['40pl','EVE 40PL',4,21.25,70.30,3.65,70,67],
  ['50pl','EVE 50PL',5,21.25,70.30,3.6,70,68],
  // Samsung SDI INR21700-50S v1.0 and INR21700-53G v1.2 (non-tube).
  ['50s','Samsung 50S',5,21.25,70.62,3.6,25,72],
  ['53g','Samsung 53G (bare cell)',5.3,21.35,70.15,3.63,null,72],
  // Tenpower INR21700-50XG and 60XG, no temperature-cutoff current.
  ['50xg','Tenpower 50XG',5,21.50,70.50,3.6,40,75],
  ['60xg','Tenpower 60XG',6,21.50,70.50,3.6,40,76],
  // Reliance INR21700-RS50 A0.
  ['rs50','Reliance RS50',5,21.35,70.30,3.6,70,67,'80 °C cutoff']
].map(([cellModel,name,cellAh,d,len,nominal,amps,grams,condition])=>({cellModel,name,cellAh,d,len,nominal,amps,grams,condition}));
const cellById=new Map(cellCatalog.map(cell=>[cell.cellModel,cell]));
const cellChoices=cellCatalog.map(c=>[c.cellModel,c.name+' · '+c.cellAh+' Ah']);
function cellSettings(id){
  const {cellModel,cellAh,d,len,nominal}=cellById.get(id);
  return {cellModel,cellAh,d,len,nominal};
}
for(const id of ['batteryModel','wCell']){
  const select=document.getElementById(id);
  for(const [value,label] of cellChoices)select.add(new Option(label,value));
  if(id==='wCell')select.add(new Option('Current custom cell','custom'));
}
