// A draft stays in the dialog until the customer creates the new project.
const batteryWizard=$('batteryWizard'),bwForm=$('bwForm');
const bwPages=[...bwForm.querySelectorAll('section')];
const bwTitles=['What are you starting with?','Point the cell ends','Choose your voltage and capacity','Space and separate the cells','Make room for the BMS','Size the enclosure','Review your pack'];
const bwIntros=[
  'Choose what you know today. You’ll see your pack take shape as you go.',
  'Choose a cell and turn its ends toward the side where you want to make connections.',
  'Series sets the voltage. Cells in parallel add capacity. Each parallel group stays together in one bank.',
  'Watch the preview as you change the row pattern and leave room for dividers.',
  'Reserve space if you know the size of your BMS. You can also choose its position later.',
  'Set the gap between the pack and each inside face of the case.',
  'Check the fit and groups in each bank. You can keep adjusting the pack in the editor.'
];
let bwPage=0,bwPlan=null;
for(const [key,label] of cellChoices)$('bwCell').add(new Option(label,key));
$('bwBanks').add(new Option('Auto · fill the available depth','auto'));
for(let i=1;i<=12;i++)$('bwBanks').add(new Option(i,i));
const bwMeasures=[...bwForm.querySelectorAll('label:has(.bwUnit) input')];
const bwFaces=['Front','Rear','Left','Right','Bottom','Top'];
let bwScale=1;
function bwNumber(id){
  const input=$(id);
  return bwMeasures.includes(input)?Number(input.dataset.mm??(input.valueAsNumber*bwScale)):input.valueAsNumber;
}
function bwConvert(scale){
  for(const input of bwMeasures){
    const mm=bwNumber(input.id);
    input.dataset.mm=mm;
    if(!input.dataset.bounds)input.dataset.bounds=JSON.stringify([+input.min,+input.max]);
    const [min,max]=JSON.parse(input.dataset.bounds);
    input.min=min/scale;input.max=max/scale;
    input.value=Number.isFinite(mm)?(mm===min||mm===max?mm/scale:Number((mm/scale).toFixed(8))):'';
  }
  bwScale=scale;
  for(const label of bwForm.querySelectorAll('.bwUnit'))label.textContent=scale===1?'mm':'in';
}
function bwDimensions(values){
  return values.map(n=>Number((n/bwScale).toFixed(bwScale===1?2:3))).join(' × ')+(bwScale===1?' mm':' in');
}
function bwConfig(){
  const num=bwNumber,cavity=bwForm.elements.bwBasis.value==='cavity';
  const cell=cellSettings($('bwCell').value),voltage=$('bwElectrical').value==='volts';
  const series=voltage?Math.max(1,Math.round(num('bwVolts')/cell.nominal)):num('bwSeries');
  const place=$('bwPlace').value,choice=$('bwMaterial').value,holder=choice.endsWith('Holder'),material=holder||choice==='squiggle'?'none':choice,face=$('bwBms').value;
  return {...defaults,...cell,mode:cavity?'inner':'pack',length:num('bwL'),width:num('bwW'),high:num('bwH'),low:num('bwH'),
    axis:$('bwAxis').value,banks:Number($('bwBanks').value)||1,series,volts:series*cell.nominal,parallel:num('bwParallel'),capacityMode:'parallel',targetMode:'series',
    wall:1.6,base:1.6,...Object.fromEntries(bwFaces.map(f=>[f.toLowerCase(),num('bw'+f)])),
    holder,squiggleOn:choice==='squiggle',sqStyle:'rails',sqRailLength:cell.len,pattern:$('bwPattern').value==='regular'?'regular':'custom',shift:num('bwShift'),gap:num('bwGap'),rowGap:num('bwGap'),
    material,sheet:material==='none'?0:num('bwSheet'),mediaShape:['FR4','printed','card'].includes(material)?'rigid':'flex',
    place:place==='both'?'rows':place,locations:material==='none'?[]:place==='both'?['rows','banks']:[place],
    bmsMode:face==='off'?'off':'mount',bmsMount:'0/'+(face==='off'?'Top':face),bmsL:num('bwBL'),bmsW:num('bwBW'),bmsH:num('bwBH'),
    rx:face==='Right'?-90:0,ry:face==='Rear'?90:0,rz:0,surfaceItems:[]};
}
// Check rectangular interior space, including the centered BMS on its chosen face.
function bwFits(c,size,bms){
  const start=[c.front,c.left,c.bottom],far=[c.rear,c.right,c.top],limit=[c.length,c.width,c.high];
  const box=bms&&surfaceBounds(c,{x:size[0],y:size[1],z:size[2]},c.bmsMount,bms,c.bmsGap);
  return size.every((v,i)=>Math.max(v,box?box[i]+bms[i]:0)+start[i]+far[i]<=limit[i]+1e-7&&(!box||box[i]+start[i]>=-1e-7));
}
function bwLayout(c){
  const inside=c.mode==='inner',total=c.series*c.parallel;
  const metrics=layout({...c,rows:2,cols:2,banks:1}),bms=c.bmsMode==='off'?null:rotationBounds(c).dim;
  const auto=inside&&$('bwBanks').value==='auto';
  let best=null;
  for(let banks=auto?1:c.banks;banks<=(auto?Math.min(12,c.series):c.banks);banks++){
    const axial=banks*(c.len+(c.holder?2*c.lip:0))+(banks-1)*metrics.axialSheet;
    for(let cols=1;cols<=30;cols++){
      const minRows=inside?1:Math.ceil(Math.ceil(c.series/banks)*c.parallel/cols);
      for(let rows=minRows;rows<=(inside?30:minRows)&&rows<=30;rows++){
        const count=cols*rows*banks;
        const u=c.d+(cols-1)*metrics.p+(rows>1?metrics.shift:0),v=c.d+(rows-1)*metrics.rowPitch;
        const size=cellXYZ(c,u+(c.holder?2*c.edgeU:0),v+(c.holder?2*c.edgeV:0),axial);
        if(inside&&!bwFits(c,size,bms))continue;
        const localP=Math.floor(cols*rows/Math.ceil(c.series/banks));
        const score=inside?localP*20000+count:-Math.max(u,v);
        if(!best||score>best.score)best={score,rows,cols,banks,count,localP};
      }
    }
  }
  return best;
}
function bwMakePlan(c,best){
  if(c.series<1||c.series>150)throw Error('Choose a voltage that needs between 1 and 150 series groups.');
  if(!best)throw Error('This layout does not fit. Try another cell direction, fewer banks, or more inside space.');
  const capacity=best.count;
  const parallel=c.mode==='inner'?Math.min(1000,best.localP):c.parallel;
  if(parallel<1)throw Error(capacity+' cells fit. This voltage needs at least '+c.series+'. Try fewer series groups or change the layout.');
  Object.assign(c,{parallel,banks:best.banks,rows:best.rows,cols:best.cols});
  const full=layout(c),skip=new Set(),total=parallel*c.series;
  const quotas=bankGroupCounts(c.series,parallel,full.bankCells);
  for(const [i,cell] of full.grid.entries()){
    for(let bank=0;bank<c.banks;bank++)if(i>=quotas[bank]*parallel)skip.add(cell.id+'/'+bank);
  }
  const m=layout(c,skip);
  if(c.holder&&holderProblem(c,m))throw Error(holderProblem(c,m));
  if(m.count!==total||activeParallel(total,c,m)!==parallel)throw Error('These banks cannot hold complete parallel groups. Try a different bank count.');
  return {c,skip,m,capacity};
}
function bwDrawBank(){
  const {c,m}=bwPlan,bank=Number($('bwReviewBank').value);
  const groups=groupMap(c,m),svg=$('bwReviewMap');
  svg.replaceChildren();svg.setAttribute('viewBox',[m.u0,m.v0,m.uSpan,m.vSpan].join(' '));
  for(const cell of m.bankCells[bank]){
    const group=groups.get(cell.id+'/'+bank);
    const ring=document.createElementNS(svg.namespaceURI,'circle');
    ring.setAttribute('cx',cell.u);ring.setAttribute('cy',cell.v);ring.setAttribute('r',c.d*.47);
    ring.setAttribute('fill','hsl('+((group||0)*137%360)+' 45% 76%)');
    const label=document.createElementNS(svg.namespaceURI,'text');
    label.setAttribute('x',cell.u);label.setAttribute('y',cell.v);label.setAttribute('text-anchor','middle');
    label.setAttribute('dominant-baseline','central');label.setAttribute('font-size',c.d*.38);
    label.setAttribute('fill','#122032');label.textContent=group?'S'+group:'·';svg.append(ring,label);
  }
}
$('bwReviewBank').onchange=bwDrawBank;
function bwRefresh(){
  const cavity=bwForm.elements.bwBasis.value==='cavity',up=$('bwAxis').value==='vertical';
  $('bwDims').hidden=!cavity;
  $('bwCaseControl').hidden=!cavity&&bwPage<5;
  $('bwOpacityValue').value=$('bwOpacity').value+'%';
  $('bwBanks').options[0].disabled=!cavity;
  if(!cavity&&$('bwBanks').value==='auto')$('bwBanks').value='1';
  $('bwBankLabel').firstElementChild.textContent=up?'How many stacks high?':'How many banks end to end?';
  $('bwBankHint').textContent=up?'Each stack adds one cell length in height.':'Each bank adds one cell length in the direction the ends face.';
  const voltage=$('bwElectrical').value==='volts';
  $('bwSeriesLabel').hidden=voltage;$('bwVoltsLabel').hidden=!voltage;$('bwParallelLabel').hidden=cavity;
  $('bwShiftLabel').hidden=$('bwPattern').value==='regular';$('bwSheets').hidden=!['printed','FR4','fish','card'].includes($('bwMaterial').value);$('bwBmsDims').hidden=$('bwBms').value==='off';
  const c=bwConfig();
  $('bwElectricHint').textContent=c.series+' groups in series × '+c.nominal+' V = '+fmt(c.volts)+' V nominal. '+(cavity?'The wizard fills each parallel group equally using the space available.':c.parallel+' cells in each group gives '+fmt(c.parallel*c.cellAh)+' Ah.');
  if(cavity&&bwPage===2&&c.series>0){
    const fit=bwLayout(c),capacity=fit?.count||0,p=Math.min(1000,fit?.localP||0);
    $('bwElectricHint').textContent=fmt(c.volts)+' V nominal needs '+c.series+' groups. '+capacity+' positions fit. '+(p?'That gives '+p+' cells per group ('+fmt(p*c.cellAh)+' Ah), with '+(capacity-p*c.series)+' positions left over.':'Change the bank count or enlarge the cavity to fit complete groups.');
  }
  $('bwFirstFit').textContent='';
  if(bwPage===1&&cavity){
    const fit=bwLayout(c);
    $('bwFirstFit').textContent=fit?fit.count+' positions in '+fit.banks+' '+(up?'stack(s)':'bank(s)')+' with the current spacing.':'No complete cell fits in this direction with the current clearances.';
  }
  bwPages.forEach((p,i)=>p.hidden=i!==bwPage);
  $('bwStep').textContent='Battery pack · '+(bwPage+1)+' of '+bwPages.length;
  $('bwProgress').value=bwPage+1;$('bwIntro').textContent=bwIntros[bwPage];
  $('bwHeading').textContent=bwTitles[bwPage];$('bwBack').hidden=!bwPage;
  queueWizardPreview();
  $('bwNext').textContent=bwPage===6?'Open pack in editor':bwPage===5?'Review pack':'Continue';
}
function openBatteryWizard(){
  bwConvert(1);bwForm.reset();for(const el of bwMeasures)delete el.dataset.mm;bwPage=0;bwPlan=null;$('bwError').textContent='';bwRefresh();batteryWizard.showModal();bwForm.querySelector('[name=bwBasis]:checked').focus();
}
$('batteryWizardMenu').onclick=openBatteryWizard;
$('bwBack').onclick=()=>{bwPage--;bwPlan=null;$('bwError').textContent='';bwRefresh();$('bwHeading').focus();};
$('bwCancel').onclick=()=>batteryWizard.close();
bwForm.noValidate=true;
bwForm.oninput=e=>{
  if(e.target===$('bwOpacity')){
    $('bwOpacityValue').value=e.target.value+'%';wizardView?.shade();return;
  }
  if(bwMeasures.includes(e.target))delete e.target.dataset.mm;
  if(e.target===$('bwUnits'))bwConvert(e.target.value==='mm'?1:25.4);
  if(e.target.name==='bwBasis')$('bwBanks').value=e.target.value==='cavity'?'auto':'1';
  if(e.target===$('bwMaterial')){
    const choice=e.target.value,thickness=({fish:.25,FR4:1.6,printed:1,card:.4})[choice];
    if(thickness){$('bwSheet').dataset.mm=thickness;$('bwSheet').value=thickness/bwScale;}
    if(choice.endsWith('Holder')){$('bwPattern').value=choice==='offsetHolder'?'offset':'regular';$('bwShift').value=50;}
  }
  if(['bwPattern','bwShift'].includes(e.target.id)&&$('bwMaterial').value.endsWith('Holder')){
    $('bwMaterial').value=$('bwPattern').value==='regular'?'regularHolder':'offsetHolder';
  }
  $('bwError').textContent='';bwRefresh();
};
bwForm.onsubmit=e=>{
  e.preventDefault();
  for(const input of bwPages[bwPage].querySelectorAll('input,select'))if(!input.closest('[hidden]')&&!input.reportValidity())return;
  try{
    if(bwPage===5){
      const c=bwConfig();
      bwPlan=bwMakePlan(c,bwLayout(c));
      const {m,capacity}=bwPlan;
      $('bwReviewBank').replaceChildren(...m.bankCells.map((cells,b)=>new Option('Bank '+(b+1)+' · '+cells.length+' cells',b)));
      bwDrawBank();
      $('bwResult').textContent=c.series+'S '+c.parallel+'P · '+m.count+' cells';
      $('bwSummary').textContent=fmt(c.volts)+' V nominal · '+fmt(c.cellAh*c.parallel)+' Ah. '+c.banks+' '+(c.axis==='vertical'?'stack(s)':'bank(s)')+', '+c.rows+' rows per bank, up to '+c.cols+' cells per row.';
      $('bwFitNote').textContent=(c.mode==='inner'?(capacity-m.count)+' spare positions left empty to keep the series groups equal. ':'The enclosure will size around this pack. ')+(c.bmsMode==='off'?'BMS space is still unreserved.':'BMS space included at the '+c.bmsMount.split('/')[1].toLowerCase()+'.');
    }
    if(bwPage<6){bwPage++;bwRefresh();$('bwHeading').focus();return;}
    const {c,skip,m}=bwPlan;
    $('newDesign').click();apply(c);skip.forEach(key=>omitted.add(key));
    for(const [key,group] of groupMap(c,m))if(group&&group%2===0)reversedCells.add(key);
    $('projectName').value=$('bwName').value.trim()||'Battery pack';
    $('scope').value='all';$('layerBanks').replaceChildren();delete $('scope').dataset.key;
    $('showCells').checked=true;$('showBMS').checked=true;$('showSheets').checked=true;
    $('opacity').value=$('bwOpacity').value;$('viewPreset').value='Assembly';render();orbitView?.preset('Assembly',c.axis);scheduleSave();batteryWizard.close();
  }catch(error){$('bwError').textContent=error.message;}
};
