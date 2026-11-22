// A draft stays in the dialog until the customer creates the new project.
const batteryWizard=$('batteryWizard'),bwForm=$('bwForm');
const bwPages=[...bwForm.querySelectorAll('section')];
const bwTitles=['What are you starting with?','Point the cell ends','Choose your voltage and capacity','Space and separate the cells','Make room for the BMS','Review your pack'];
let bwPage=0,bwPlan=null;
for(const [key,label] of cellChoices)$('bwCell').add(new Option(label,key));
$('bwBanks').add(new Option('Auto · fill the available depth','auto'));
for(let i=1;i<=12;i++)$('bwBanks').add(new Option(i,i));
function bwConfig(){
  const num=id=>Number($(id).value),cavity=$('bwStart').value==='cavity';
  const cell=cellSettings($('bwCell').value),voltage=$('bwElectrical').value==='volts';
  const series=voltage?Math.max(1,Math.round(num('bwVolts')/cell.nominal)):num('bwSeries');
  const place=$('bwPlace').value,material=$('bwMaterial').value,face=$('bwBms').value;
  return {...defaults,...cell,mode:cavity?'inner':'pack',length:num('bwL'),width:num('bwW'),high:num('bwH'),low:num('bwH'),
    axis:$('bwAxis').value,banks:Number($('bwBanks').value)||1,series,volts:series*cell.nominal,parallel:num('bwParallel'),capacityMode:'parallel',targetMode:'series',
    holder:false,pattern:$('bwPattern').value==='regular'?'regular':'custom',shift:num('bwShift'),gap:num('bwGap'),rowGap:num('bwGap'),
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
    const axial=banks*c.len+(banks-1)*metrics.axialSheet;
    for(let cols=1;cols<=30;cols++){
      const minRows=inside?1:Math.ceil(Math.ceil(c.series/banks)*c.parallel/cols);
      for(let rows=minRows;rows<=(inside?30:minRows)&&rows<=30;rows++){
        const count=cols*rows*banks;
        const u=c.d+(cols-1)*metrics.p+(rows>1?metrics.shift:0),v=c.d+(rows-1)*metrics.rowPitch;
        const size=cellXYZ(c,u,v,axial);
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
  const cavity=$('bwStart').value==='cavity',up=$('bwAxis').value==='vertical';
  $('bwDims').hidden=!cavity;
  $('bwBanks').options[0].disabled=!cavity;
  if(!cavity&&$('bwBanks').value==='auto')$('bwBanks').value='1';
  $('bwBankLabel').firstElementChild.textContent=up?'How many stacks high?':'How many banks end to end?';
  $('bwBankHint').textContent=up?'Each stack adds one cell length in height.':'Each bank adds one cell length in the direction the ends face.';
  const voltage=$('bwElectrical').value==='volts';
  $('bwSeriesLabel').hidden=voltage;$('bwVoltsLabel').hidden=!voltage;$('bwParallelLabel').hidden=cavity;
  $('bwShiftLabel').hidden=$('bwPattern').value==='regular';$('bwSheets').hidden=$('bwMaterial').value==='none';$('bwBmsDims').hidden=$('bwBms').value==='off';
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
  $('bwHeading').textContent=bwTitles[bwPage];$('bwBack').hidden=!bwPage;
  queueWizardPreview();
  $('bwNext').textContent=bwPage===5?'Create pack in 3D':'Continue';
}
function openBatteryWizard(){
  bwForm.reset();bwPage=0;bwPlan=null;$('bwError').textContent='';bwRefresh();batteryWizard.showModal();$('bwStart').focus();
}
$('batteryWizardMenu').onclick=openBatteryWizard;
$('bwBack').onclick=()=>{bwPage--;bwPlan=null;$('bwError').textContent='';bwRefresh();};
$('bwCancel').onclick=()=>batteryWizard.close();
bwForm.noValidate=true;
bwForm.oninput=e=>{
  if(e.target===$('bwStart'))$('bwBanks').value=e.target.value==='cavity'?'auto':'1';
  if(e.target===$('bwMaterial'))$('bwSheet').value=({fish:.25,FR4:1.6,printed:1,card:.4,none:0})[e.target.value];
  $('bwError').textContent='';bwRefresh();
};
bwForm.onsubmit=e=>{
  e.preventDefault();
  for(const input of bwPages[bwPage].querySelectorAll('input,select'))if(!input.closest('[hidden]')&&!input.reportValidity())return;
  try{
    if(bwPage===4){
      const c=bwConfig();
      bwPlan=bwMakePlan(c,bwLayout(c));
      const {m,capacity}=bwPlan;
      $('bwReviewBank').replaceChildren(...m.bankCells.map((cells,b)=>new Option('Bank '+(b+1)+' · '+cells.length+' cells',b)));
      bwDrawBank();
      $('bwResult').textContent=c.series+'S '+c.parallel+'P · '+m.count+' cells';
      $('bwSummary').textContent=fmt(c.volts)+' V nominal · '+fmt(c.cellAh*c.parallel)+' Ah. '+c.banks+' '+(c.axis==='vertical'?'stack(s)':'bank(s)')+', '+c.rows+' rows per bank, up to '+c.cols+' cells per row.';
      $('bwFitNote').textContent='Cell array measures '+[m.x,m.y,m.z].map(fmt).join(' × ')+' mm (length × width × height). '+(c.mode==='inner'?(capacity-m.count)+' spare positions left empty to keep the series groups equal. ':'The enclosure will size around this pack. ')+(c.bmsMode==='off'?'BMS space is still unreserved.':'BMS space included at the '+c.bmsMount.split('/')[1].toLowerCase()+'.');
    }
    if(bwPage<5){bwPage++;bwRefresh();return;}
    const {c,skip,m}=bwPlan;
    $('newDesign').click();apply(c);skip.forEach(key=>omitted.add(key));
    for(const [key,group] of groupMap(c,m))if(group&&group%2===0)reversedCells.add(key);
    $('projectName').value=$('bwName').value.trim()||'Battery pack';
    $('scope').value='all';$('layerBanks').replaceChildren();delete $('scope').dataset.key;
    $('showCells').checked=true;$('showBMS').checked=true;$('showSheets').checked=true;
    $('viewPreset').value='Assembly';render();orbitView?.preset('Assembly',c.axis);scheduleSave();batteryWizard.close();
  }catch(error){$('bwError').textContent=error.message;}
};
