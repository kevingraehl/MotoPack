const $=id=>document.getElementById(id);
const defaults={axis:'vertical',pattern:'offset',cols:5,rows:8,banks:3,cellModel:"p42a",d:21.55,len:70.15,gap:1.5,shift:50,series:20,
  material:'none',sheet:0.25,mediaShape:'flex',place:'rows',edgeU:1.5,edgeV:1.5,plate:4,slack:0.3,lip:0.8,land:1,
  length:164,width:116,high:293.5,low:252.5,ref:210.6,headroom:13,holder:true};
Object.assign(defaults,builderDefaults,{rx:0,ry:0,rz:0,bmsMount:"0/Top",sheetTrim:0,bmsMode:"off",bmsRule:"check",bmsL:100,bmsW:65,bmsH:15,bx:0,by:0,bz:0,bmsGap:1,bmsWall:2,bmsLock:"edit",holderShape:"rectangle",cornerRadius:0,capacityMode:"parallel",parallel:6,desiredAh:25,cellAh:4.2});
Object.assign(defaults,{targetMode:"series",volts:72,nominal:3.6,rowGap:1.5,groupRows:2,groupSpace:0,grouping:'on',groupPlan:'auto',
  squiggleOn:false,squiggleGuards:true,squiggleCells:false,sqStyle:'caps',sqRailLength:70,sqVentWidth:0,sqCapVentWidth:0,sqVentShape:"diamond",sqWall:.42,sqDepth:10,sqRootStyle:'off',sqRootChamfer:.5,sqFace:.42,sqOpening:14,sqMaxWidth:115.75,sqDirection:'rows'});
const omitted=new Set(), fields={};
function field(section,key,label,options){
  const wrapper=document.createElement('label');
  wrapper.textContent=label;
  const choices=Array.isArray(options[0]);
  const input=document.createElement(choices?'select':'input');
  input.id=key;
  if(choices) for(const [value,name] of options) input.add(new Option(name,value));
  else{
    input.type='number';
    [input.min,input.max,input.step]=options;
    input.required=true;
  }
  fields[key]=input;
  wrapper.append(input); $(section).append(wrapper);
}
const spec={
builder:builderFields,bmsSetup:bmsFields,
targets:[
  ['series','Series groups (S)',[1,150,1]],
  ['groupPlan','Series group layout',[['auto','Automatic · keep each parallel group in one bank'],['across','Continuous path across banks'],['rowGroups','Complete rows by stack · simple 5P'],['columnGroups','Complete columns by stack · simple 8P'],['split','Separate banks · same row order'],['mirror','Separate banks · mirror alternate banks']]],
  ['capacityMode','Capacity target',[['parallel','Parallel count'],['ah','Amp-hours']]],
  ['parallel','Parallel count (P)',[1,1000,1]],['desiredAh','Desired capacity (Ah)',[0.1,5000,'any']]],
electricDetails:[
  ['cellAh','Capacity per cell (Ah)',[0.1,100,'any']],
  ['targetMode','Choose series by',[['series','Lock series count'],['voltage','Desired nominal voltage']]],
  ['volts','Desired nominal pack voltage (V)',[1,1000,'any']],
  ['nominal','Nominal voltage per cell (V)',[0.1,10,'any']]],
array:[
  ['cellModel','Cell model',[...cellChoices,['custom','Custom dimensions']]],
  ['axis','Cell direction',[['vertical','Upright'],['flat','Flat · X, along length'],['cross','Flat · Y, across width']]],
  ['pattern','Row pattern',[['regular','Regular'],['offset','Offset 50% · equal rows'],['short','Offset 50% · shorter alternate rows'],['custom','Custom shift · equal rows'],['customShort','Custom shift · shorter alternate rows']]],
  ['cols','Cells in full row',[1,30,1]],['rows','Rows per bank',[1,30,1]],['banks','Banks end-to-end',[1,12,1]],
  ['shift','Alternate row shift (%)',[0,50,'any']],['d','Cell diameter (mm)',[5,80,'any']],['len','Cell length (mm)',[10,250,'any']],
  ['gap','Y · side-by-side gap (mm)',[0,20,'any']],['rowGap','Between rows (mm)',[0,20,'any']],
  ['deckGap','End-to-end gap (mm)',[0,100,'any']],
  ['groupRows','Rows per physical group',[1,30,1]],['groupSpace','Extra gap after each group (mm)',[0,50,'any']],
  ['grouping','Automatic series groups',[['on','Show group numbers'],['off','Hide groups']]]],
media:[['material','Medium',[['none','None'],['FR4','FR4'],['fish','Fishpaper'],['paper','Copy paper · mock-up'],['card','Cardstock / manila · mock-up'],['printed','3D-printed divider'],['custom','Custom medium']]],
  ['sheet','Sheet thickness (mm)',[0,10,'any']],['sheetTrim','Total width to trim (mm)',[0,1000,'any']],['mediaShape','Sheet behavior',[['flex','Conforming'],['rigid','Flat sheet']]],
  ['place','Sheet location',[['rows','Between each row'],['banks','Between axial banks'],...mountChoices]]],
print:[['holderShape','Cell holder outline',[['rectangle','Rectangular'],['contour','Follow perimeter cells']]],['cornerRadius','Outside corner radius (mm)',[0,1000,'any']],['edgeU','Side offset, each (mm)',[0,30,'any']],['edgeV','Row-end offset, each (mm)',[0,30,'any']],
  ['slack','Bore clearance, diameter (mm)',[0,4,'any']],['plate','Plate thickness (mm)',[0.5,25,'any']],
  ['lip','Axial lip thickness (mm)',[0.1,10,'any']],['land','Radial lip width (mm)',[0.2,10,'any']]],
squiggle:[['sqStyle','Spacer style',[['caps','End caps · one at each end'],['rails','Slide-in strips · both terminals open']]],['sqRailLength','Slide-in strip length (mm)',[1,250,'any']],['sqDirection','Separator direction',[['rows','Between rows'],['columns','Between columns']]],
  ['sqWall','Printed wall thickness (mm)',[.2,3,'any']],['sqDepth','Wall depth (mm)',[1,70,'any']],
  ['sqRootStyle','Strengthen the wall at the sheet',[['off','Off'],['fillet','Rounded fillet'],['chamfer','45° chamfer']]],['sqRootChamfer','Fillet radius / chamfer size (mm)',[0,2,'any']],['sqFace','Terminal face (mm)',[.2,3,'any']],['sqOpening','Terminal opening (mm)',[2,70,'any']],
  ['sqMaxWidth','Maximum outside width (mm)',[10,1000,'any']]],
casefields:[['length','Inside length (mm)',[10,1000,'any']],['width','Inside width (mm)',[10,1000,'any']],
  ['high','Tall-end height (mm)',[10,1000,'any']],['low','Low-end height (mm)',[10,1000,'any']],
  ['ref','Measured bare stack height (mm)',[10,1000,'any']],['headroom','Gap over bare stack (mm)',[0,300,'any']]]};
for(const [section,items] of Object.entries(spec))for(const item of items)field(section,...item);
$('array').prepend(...['cols','rows','banks','pattern','axis','cellModel'].map(key=>fields[key].parentElement));
$('electricDetails').prepend(fields.groupPlan.parentElement,fields.capacityMode.parentElement);
function targetParallel(c){return c.capacityMode==='ah'?Math.ceil(c.desiredAh/c.cellAh-1e-10):c.parallel;}
let sheetLocations=new Set(['rows']);
fields.place.parentElement.hidden=true;
const sheetBoxes=[];
for(const option of fields.place.options){
  const label=document.createElement('label'),box=document.createElement('input');
  label.className='check';box.type='checkbox';box.value=option.value;
  label.append(box,document.createTextNode(option.text));$('sheetChecks').append(label);
  box.oninput=()=>{if(box.checked)sheetLocations.add(box.value);else sheetLocations.delete(box.value);};
  sheetBoxes.push(box);
}
let routeChoice=0;
const spacerChecks=['sqLeft','sqRight','sqTop','sqBottom','sqTrimSheet','sqGroupsOnly','sqRootLive'];
function apply(config){
  $('nickelWidth').value=config.nickelWidth??7;
  $('nickelThickness').value=config.nickelThickness??.15;
  $('sqVentShape').value=config.sqVentShape||'diamond';
  if(!$('sqVentShape').value)$('sqVentShape').value='diamond';
  $('sqCapVentWidth').max=capVentLimit(config.sqDepth??defaults.sqDepth);
  $('sqCapVentWidth').value=Number.isFinite(config.sqCapVentWidth)?config.sqCapVentWidth:0;
  $('sqVentWidth').value=Number.isFinite(config.sqVentWidth)?config.sqVentWidth:0;
  for(const id of spacerChecks)$(id).checked=config[id]===true;
  routeChoice=Number.isInteger(config.routeChoice)&&config.routeChoice>=0&&config.routeChoice<8?config.routeChoice:0;
  caseSideSettings=Array.isArray(config.caseSides)?config.caseSides.slice(0,2):[];
  sheetLocations=new Set(config.locations??[config.place||'rows']);
  for(const [key,input] of Object.entries(fields)) input.value=config[key]??defaults[key];
  surfaceItems=structuredClone(config.surfaceItems||[]);$('surfaceEditor').resetParts?.();
  $('holder').checked=config.holder;
  $('squiggleOn').checked=config.squiggleOn===true;
  $('squiggleGuards').checked=config.squiggleGuards!==false;
  $('squiggleCells').checked=config.squiggleCells===true;
}
function capVentLimit(depth){return Math.max(0,Math.min(16,Math.floor((depth-4)*2)/2));}
function read(){
  $('sqCapVentWidth').max=capVentLimit(fields.sqDepth.value);
  const c={nickelWidth:Number($('nickelWidth').value)||7,nickelThickness:Number($('nickelThickness').value)||.15,sqVentShape:$('sqVentShape').value,sqCapVentWidth:Number($('sqCapVentWidth').value),sqVentWidth:Number($('sqVentWidth').value),...Object.fromEntries(spacerChecks.map(id=>[id,$(id).checked])),routeChoice,caseSides:[...caseSideSettings],holder:$('holder').checked,squiggleOn:$('squiggleOn').checked,
    squiggleGuards:$('squiggleGuards').checked,squiggleCells:$('squiggleCells').checked,surfaceItems:structuredClone(surfaceItems)};
  for(const [key,input] of Object.entries(fields)){
    if(!input.checkValidity())throw Error('Check '+input.parentElement.firstChild.textContent+'.');
    c[key]=input.type==='number'?input.valueAsNumber:input.value;
  }
  c.locations=[...sheetLocations].filter(value=>locationAvailable(value,c));
  return c;
}
const fmt=n=>Number(n.toFixed(2)).toString();
function diagram(c,m){
  const svg=$('ends'), pad=Math.max(4,c.d*.35);
  const planeWidth=c.axis==='cross'?c.length:c.width;
  const maxU=Math.max(planeWidth,m.u1+c.edgeU,...m.grid.map(a=>a.u+c.d/2));
  const maxV=Math.max(m.v1+c.edgeV,...m.grid.map(a=>a.v+c.d/2));
  svg.setAttribute('viewBox',[-pad,-pad,maxU+2*pad,maxV+2*pad].join(' '));
  // Keep the full grid visible while toggling perimeter cells.
  const left=m.u0-(c.holder?c.edgeU:0), base=m.v0-(c.holder?c.edgeV:0);
  svg.setAttribute('viewBox',[Math.min(-pad,left-pad),Math.min(-pad,base-pad),maxU+2*pad+Math.max(0,-left),maxV+2*pad+Math.max(0,-base)].join(' '));
  let drawing='<rect x="'+left+'" y="'+base+'" width="'+planeWidth+'" height="'+(maxV-base)+'" fill="#f1f5ee" stroke="#718478" stroke-width=".45"/>';
  if(c.holder&&c.holderShape==='contour')drawing+='<polygon points="'+cellContour(c,m).map(([x,y])=>[left+x,base+y].join(',')).join(' ')+'" fill="#d9e0d7" stroke="#536957" stroke-width=".45"/>';
  else if(c.holder)drawing+='<rect rx="'+c.cornerRadius+'" x="'+left+'" y="'+base+'" width="'+m.U+'" height="'+m.V+'" fill="#d9e0d7" stroke="#536957" stroke-width=".45"/>';
  const grouped=c.grouping==='on',groups=groupMap(c,m),bankMenu=$('bankView');
  const bank=Math.min(Number(bankMenu.value)||0,c.banks-1);
  if(bankMenu.options.length!==c.banks){bankMenu.replaceChildren();for(let i=0;i<c.banks;i++)bankMenu.add(new Option('Bank '+(i+1)+' of '+c.banks,i));}
  bankMenu.value=bank;
  const tool=$('cellTool').value;
  const action=tool==='bank'?'Click a cell to remove it from Bank '+(bank+1)+'. Drag across cells to erase. Start on an empty circle to add cells.':tool==='omit'?'Each click adds or removes this position in all '+c.banks+' banks.':'Click a cell to flip its polarity.';
  $('polarityKey').textContent=action+' Looking from '+(c.axis==='vertical'?'+Z (top)':c.axis==='cross'?'+Y (end)':'+X (end)')+'. The sign is the visible terminal. S numbers and colors identify groups; a dot marks a spare. Red and amber in 3D flag case conflicts.';
  for(const cell of m.grid){
    const g=groups.get(cell.id+'/'+bank);
    const present=groups.has(cell.id+'/'+bank);
    const fill=present?(grouped?groupColor(g):'#bddbd6'):'#f8faf7';
    drawing+='<g data-cell="'+cell.id+'"><circle cx="'+cell.u+'" cy="'+cell.v+'" r="'+c.d/2+'" fill="'+fill+'" stroke="'+(present?'#306155':'#b2bcb5')+'" stroke-width=".45"/>';
    if(present){
      const sign=reversedCells.has(cell.id+'/'+bank)?'−':'+';
      const positive=sign==='+',r=c.d/2;
      drawing+='<g transform="translate('+cell.u+' '+cell.v+') scale('+r+')" pointer-events="none"><circle r="'+(positive?.70:.75)+'" fill="'+(positive?'#252a2c':'#cad0d3')+'"/>';
      if(positive){
        drawing+='<circle r=".48" fill="#bbc2c6"/>';
        for(const angle of [0,120,240])drawing+='<path transform="rotate('+angle+')" d="M-.13 -.46 L-.11 -.59 Q0 -.63 .11 -.59 L.13 -.46Z" fill="#d2d8db"/>';
      }
      drawing+='</g>';
      const transform=c.axis!=='vertical'?'translate(0 '+2*cell.v+') scale(1 -1)':'';
      drawing+='<text x="'+cell.u+'" y="'+cell.v+'" transform="'+transform+'" text-anchor="middle" dominant-baseline="central" font-size="'+c.d*.22+'" font-weight="600" fill="#142c25" pointer-events="none">'+sign+(grouped?' '+(g?'S'+g:'·'):'')+'</text>';
    }
    drawing+='</g>';
  }
  svg.innerHTML=c.axis!=='vertical'?'<g transform="translate(0 '+(maxV+base)+') scale(1 -1)">'+drawing+'</g>':drawing;
  const h=Math.max(c.high,c.low,m.z),w=Math.max(c.length,m.x);
  $('side').setAttribute('viewBox',[-3,-3,w+6,h+6].join(' '));
  let profile='<path d="M0 '+h+'v-'+c.high+'L'+c.length+' '+(h-c.low)+'V'+h+'Z" stroke="#536957" fill="#edf1e8"/><rect x="0" y="'+(h-m.z)+'" width="'+m.x+'" height="'+m.z+'" fill="#d4e5db" stroke="#286351" stroke-width=".6"/>';
  for(let b=0;b<c.banks;b++)for(const v of new Set(m.bankCells[b].map(a=>a.v))){
    const axial=b*(c.len+(c.holder?2*c.lip:0)+m.axialSheet)+(c.holder?c.lip:0);
    const transverse=v-m.v0-c.d/2+(c.holder?c.edgeV:0);
    const upright=c.axis==='vertical';
    const x=upright?transverse:axial, z=upright?axial:transverse;
    const w=upright?c.d:c.len, height=upright?c.len:c.d;
    profile+='<rect x="'+x+'" y="'+(h-z-height)+'" width="'+w+'" height="'+height+'" fill="#a8cfc5" stroke="#487267" stroke-width=".35"/>';
  }
  $('side').innerHTML=profile;
  $('sectionTitle').textContent=c.axis==='vertical'?'Top view · one upright deck':'End view · one flat bank';
}
let current=null;
function render(){
  for(const key of ['bx','by','bz'])fields[key].disabled=fields.bmsMode.value==='off'||fields.bmsLock.value==='lock';
  for(const key of ['place','bmsMount'])for(const option of fields[key].options)
    option.hidden=option.value.startsWith('r')&&option.value.includes('/')?parseInt(option.value.slice(1))>Number(fields.rows.value):option.value.includes('/')&&parseInt(option.value)>Number(fields.banks.value);
  fields.bmsMount.parentElement.hidden=fields.bmsMode.value!=='mount';
  for(const k of ['rx','ry','rz','bmsMount','bmsMode'])fields[k].disabled=fields.bmsLock.value==='lock';
  for(const box of sheetBoxes){
    box.parentElement.hidden=!locationAvailable(box.value,{rows:+fields.rows.value,banks:+fields.banks.value});
    box.checked=sheetLocations.has(box.value);
  }
  const capacityField=fields.cellAh.parentElement;
  const capacitySection=fields.capacityMode.value==='ah'?$('targets'):$('electricDetails');
  if(capacityField.parentElement!==capacitySection)capacitySection.append(capacityField);
  fields.parallel.parentElement.hidden=fields.capacityMode.value==='ah';
  fields.desiredAh.parentElement.hidden=fields.capacityMode.value!=='ah';
  const pattern=fields.pattern.value;
  fields.shift.disabled=!['custom','customShort'].includes(pattern);
  if(fields.shift.disabled)fields.shift.value=pattern==='regular'?0:50;
  for(const input of $('viewerArray').querySelectorAll('[data-source]'))input.value=fields[input.dataset.source].value;
  const up=fields.axis.value==='vertical';
  fields.gap.parentElement.firstChild.textContent=(fields.axis.value==='cross'?'X':'Y')+' · between columns (mm)';
  fields.rowGap.parentElement.firstChild.textContent=(up?'X':'Z')+' · between rows (mm)';
  fields.deckGap.parentElement.firstChild.textContent=(up?'Z':fields.axis.value==='cross'?'Y':'X')+' · end-to-end gap (mm)';
  $('fitResults').replaceChildren();
  const byVoltage=fields.targetMode.value==='voltage';
  fields.series.disabled=byVoltage;fields.volts.disabled=!byVoltage;
  const needed=Math.max(1,Math.round(fields.volts.valueAsNumber/fields.nominal.valueAsNumber));
  if(byVoltage&&needed<=150)fields.series.value=needed;
  try{
    if(byVoltage&&!(needed<=150))throw Error('The voltage target exceeds the supported series range or needs a valid cell voltage.');
    const c=read(),m=layout(c,omitted), problem=holderProblem(c,m);
    const shell=makeShell(c,m);
    if(c.bmsMode==='mount'||c.bmsMode==='after'){
      const box=shell.parts.find(p=>p.name==='BMS');
      ['bx','by','bz'].forEach((k,i)=>fields[k].value=Number((box.min[i]+shell.origin[i]).toFixed(5)));
    }
    current={c,m,shell}; diagram(c,m); showBuilder(c,m,shell);
    const split=['split','mirror','folded'].includes(effectiveGroupPlan(c)),perBank=c.series/c.banks,p=activeParallel(m.count,c,m);
    const valid=!split||Number.isInteger(perBank);
    $('groupPlanNote').textContent=!valid?'Equal subpacks require a series count divisible by the bank count.':
      c.groupPlan==='rowGroups'?'Each complete row is one '+p+'P group; later rows become the next series group.':
      c.groupPlan==='columnGroups'?'Each complete column is one '+p+'P group; later columns become the next series group.':
      split&&p?c.banks+' × '+perBank+'S'+p+'P in series. '+Array.from({length:c.banks},(_,b)=>'Bank '+(b+1)+' = S'+(1+b*perBank)+'–S'+((b+1)*perBank)).join(' · '):'';

    if(c.groupPlan==='auto'){
      let first=1;
      $('groupPlanNote').textContent=bankGroupCounts(c.series,p,m.bankCells).map((n,b)=>{
        const label=n?'S'+first+(n>1?'–S'+(first+n-1):''):'No complete group';
        first+=n;return 'Bank '+(b+1)+' · '+label;
      }).join(' | ');
    }
    $('applyBatch').disabled=!valid&&$('batch').value==='series';
    $('assemblyStep').disabled=$('assemblyStl').disabled=!!(c.holder&&problem);
    $('count').textContent=m.count+(m.count===1?' cell':' cells');
    $('group').textContent=seriesFit(m.count,c,m);
    $('sheetInfo').textContent=c.material==='none'||!c.sheet?'No separator thickness included.':c.locations.length+' locations selected · '+fmt(c.sheet)+' mm thick · '+fmt(c.sheetTrim)+' mm total trim.';
    const targetP=targetParallel(c),activeCount=c.series*p;
    $('fitSeries').textContent=!valid?'No complete layout for this bank split.':c.series+'S'+p+'P in the viewer · '+activeCount+' active cells · '+fmt(p*c.cellAh)+' Ah · '+fmt(c.series*c.nominal)+' V nominal'+(p<targetP?' · Target '+c.series+'S'+targetP+'P needs more positions in the required groups.':m.count>activeCount?' · '+(m.count-activeCount)+' unused positions.':'');
    refreshInlineRoute();
    $('size').textContent=[m.x,m.y,m.z].map(fmt).join(' × ');
    const axes=['length','width','height'];
    const exceeded=m.margins.map((n,i)=>n<-.00001?fmt(-n)+' mm over '+axes[i]:null).filter(Boolean);
    $('fit').className='status'+(exceeded.length?' bad':'');
    $('fit').textContent=exceeded.length?'Outside case envelope · '+exceeded.join(', '):'Within case envelope · remaining L / W / H '+m.margins.map(fmt).join(' / ')+' mm';
    if(shell.profile||shell.posed){
      const outside=shell.cells.filter(cell=>cell.status==='outside').length,touch=shell.cells.filter(cell=>cell.status==='touching').length;
      $('fit').textContent=outside||touch?outside+' cells outside · '+touch+' touching the case':shell.profile?'Cells clear the selected side profile and inside depth':'Cells clear the case at this placement';
      $('fit').className='status'+(outside||touch?' bad':'');
    }
    if(shell.allowanceMargins.some(n=>n<-.00001)){$('fit').className='status bad';$('fit').textContent+=' · requested clearance short by '+fmt(-Math.min(...shell.allowanceMargins))+' mm';}
    if(shell.warnings.length){$('fit').className='status bad';$('fit').textContent+=' · '+[...new Set(shell.warnings)].join(' · ');}
    $('bench').textContent='Measured-gap comparison · '+fmt(c.ref+c.headroom-m.z)+' mm above this layout at the reference location (negative means interference).';
    const regular=layout({...c,pattern:'regular',bmsRule:'check'},omitted);
    $('compare').textContent='Compared with regular rows at these settings: '+fmt(regular.vSpan-m.vSpan)+' mm saved along the rows, '+fmt(m.uSpan-regular.uSpan)+' mm extra width, '+(m.count-regular.count)+' cells difference.';
    if(!c.holder&&(c.gap===0||c.rowGap===0))$('fit').textContent+=' · zero cell-body gap specified; check insulation and spacing.';
    $('holderDims').textContent='One end plate · '+[m.uSpan+2*c.edgeU,m.vSpan+2*c.edgeV,c.plate].map(fmt).join(' × ')+' mm · '+m.cells.length+' pockets. Pair per bank.';
    $('printMsg').textContent=problem||'Stepped through-pockets. STL coordinates are in millimeters. Check fit with the coupon and a measured wrapped cell.';
    $('download').disabled=!!problem;
    $('holderStep').disabled=!!problem;$('caseStep').disabled=false;
    const rails=c.sqStyle==='rails';
    fields.sqRailLength.parentElement.hidden=!rails;
    $('sqRailVentLabel').hidden=!rails;
    $('sqCapVentLabel').hidden=rails;
    $('sqCapVentWidth').disabled=Number($('sqCapVentWidth').max)===0;
    $('sqCapVentValue').value=c.sqCapVentWidth?fmt(c.sqCapVentWidth)+' mm':'0 mm · solid';
    const printTip={diamond:'The pointed roof closes gradually.',teardrop:'The teardrop has a pointed roof for printing.',v:'The V has sloping arms. Test the tips on your printer.',round:'The curved roof can sag. Try a small test print.',oval:'The wide, shallow roof can sag. Try a small test print.'};
    $('sqVentHelp').textContent=(rails?'Print strips standing on the end band. ':'Print end caps with the terminal sheet down. Wall depth limits the opening width to leave 2 mm at each end. ')+printTip[c.sqVentShape]+' Vented walls reserve at least one wall thickness between neighboring cells.';
    $('sqGroupsOnly').disabled=(rails?c.sqVentWidth:c.sqCapVentWidth)>0;
    $('sqVentValue').value=c.sqVentWidth?fmt(c.sqVentWidth)+' mm':'0 mm · solid';
    for(const key of ['sqDepth','sqOpening','sqFace','sqRootStyle'])fields[key].parentElement.hidden=rails;
    fields.sqRootChamfer.parentElement.hidden=rails||c.sqRootStyle==='off';
    $('sqRootPreviewControls').hidden=fields.sqRootChamfer.parentElement.hidden;
    $('sqTrimSheet').parentElement.hidden=rails;
    const bankMenu=$('sqExportBanks');
    if(bankMenu.options.length!==c.banks+2){
      const previous=bankMenu.value;
      while(bankMenu.options.length>2)bankMenu.remove(2);
      for(let b=0;b<c.banks;b++)bankMenu.add(new Option('Bank '+(b+1)+' only',String(b)));
      bankMenu.value=Array.from(bankMenu.options).some(o=>o.value===previous)?previous:'all';
    }
    const oneBank=!['all','split'].includes(bankMenu.value);
    const endMenu=$('sqExportEnds');
    endMenu.parentElement.hidden=rails;
    endMenu.options[1].text=c.axis==='vertical'?'Top only':'Near end only (+ axis)';
    endMenu.options[2].text=c.axis==='vertical'?'Bottom only':'Far end only (− axis)';
    $('sqStripChoice').parentElement.hidden=!rails||!oneBank;
    const gapKey=c.sqDirection==='columns'?'rowGap':'gap';
    if(document.activeElement!==$('sqGap'))$('sqGap').value=c[gapKey];
    $('sqGapLabel').textContent=c.sqDirection==='columns'?'Gap along a column (mm)':'Gap along a row (mm)';
    $('snugGroups').hidden=!c.sqGroupsOnly;
    try{
      const bank=oneBank?Number(bankMenu.value):m.bankCells.findIndex(cells=>cells.length);
      const model=squiggleBankModel(c,m,bank),sq=squiggleHolder(model.c,model.m,c.squiggleGuards,false);
      if(rails){
        const menu=$('sqStripChoice'),total=sq.wallPolygons.length;
        if(menu.options.length!==total+1){
          const previous=Number(menu.value)||0;menu.replaceChildren(new Option('All strips',0));
          for(let n=1;n<=total;n++)menu.add(new Option('Strip '+n,n));
          menu.value=previous<=total?previous:0;
        }
      }
      const over=sq.outsideWidth>c.sqMaxWidth+1e-6;
      $('squiggleStatus').textContent=(c.squiggleOn?'Enabled · ':'Preview off · ')+fmt(sq.outsideWidth)+' mm outside width · '+(over?'over ':'within ')+fmt(c.sqMaxWidth)+' mm limit · '+(rails?fmt(c.sqRailLength)+' mm slide-in strips · both terminals open':fmt(c.sqFace)+' mm sheet at each end')+' · '+fmt(c[gapKey])+' mm cell gap along the '+(gapKey==='gap'?'row.':'column.');
      $('squiggleStatus').className=over?'status bad':'';
      $('squiggleStep').disabled=$('exportSquiggleStep').disabled=over;
      $('squiggleStl').disabled=$('exportSquiggleStl').disabled=over;
    }catch(error){$('squiggleStatus').textContent=error.message;$('squiggleStatus').className='status bad';$('squiggleStep').disabled=$('exportSquiggleStep').disabled=true;$('squiggleStl').disabled=$('exportSquiggleStl').disabled=true;}
  }catch(error){
    $('assemblyStep').disabled=$('assemblyStl').disabled=true;
    $('contacts').textContent='Check inputs to update collision results.';$('issues').hidden=true;
    $('holderStep').disabled=true;$('caseStep').disabled=true;
    $('squiggleStep').disabled=$('exportSquiggleStep').disabled=true;
    $('squiggleStl').disabled=$('exportSquiggleStl').disabled=true;
    current=null;$('fit').textContent=error.message;$('fit').className='status bad';$('download').disabled=true;$('caseSTL').disabled=true;$('caseSize').textContent='';clearScene();
    refreshInlineRoute();
    for(const id of ['partReport','sheetInfo','fitSeries','count','group','size','bench','compare','holderDims','printMsg','side','ends']) $(id).textContent='';
  }
}
$('controls').addEventListener('input',event=>{
  if(event.target.id==='sqGap'&&event.target.checkValidity()){
    fields[fields.sqDirection.value==='columns'?'rowGap':'gap'].value=event.target.value;
  }
  if(['sqStyle','sqCapVentWidth','sqVentWidth','gap','rowGap','sqGap','sqWall'].includes(event.target.id)&&Number($(fields.sqStyle.value==='rails'?'sqVentWidth':'sqCapVentWidth').value)>0){
    for(const key of ['gap','rowGap'])fields[key].value=Math.max(+fields[key].value,+fields.sqWall.value);
    if(event.target.id==='sqGap')event.target.value=fields[fields.sqDirection.value==='columns'?'rowGap':'gap'].value;
    $('sqGroupsOnly').checked=false;
  }
  if(['sqStyle','sqCapVentWidth','sqVentWidth','sqVentShape','sqRailLength','sqGap','sqWall','sqRootStyle','sqRootChamfer','sqRootLive','sqGroupsOnly'].includes(event.target.id)){
    $('squiggleOn').checked=true;$('spacers').checked=true;
  }
  if(event.target.id==='squiggleOn'&&event.target.checked)$('spacers').checked=true;
  if(event.target===fields.cellModel&&cellById.has(event.target.value)){
    for(const [key,value] of Object.entries(cellSettings(event.target.value)))fields[key].value=value;
  }
  if(['cellAh','d','len','nominal'].includes(event.target.id))fields.cellModel.value='custom';
  if(['bx','by','bz'].includes(event.target.id))fields.bmsMode.value='fixed';
  if(event.target.id==='axis'&&$('viewPreset').value==='Cell end'&&current)$('viewPreset').value=({vertical:'Top',cross:'Left',flat:'Back'})[current.c.axis];
  if(event.target.id==='bmsMount'||(event.target.id==='bmsMode'&&fields.bmsMode.value==='mount'))mountRotation(fields.bmsMount.value);
  if(['banks','rows'].includes(event.target.id))for(const k of ['place','bmsMount']){
    const [bank,face]=fields[k].value.split('/');if(face&&(+bank>+fields.banks.value||(bank.startsWith('r')&&+bank.slice(1)>+fields.rows.value)))fields[k].value='0/'+face;
  }
  if(event.target.id==='material'){
    const preset={FR4:[1.6,'rigid'],fish:[0.25,'flex'],paper:[0.1,'flex'],card:[0.4,'rigid'],printed:[1,'rigid'] }[event.target.value];
    if(preset){fields.sheet.value=preset[0];fields.mediaShape.value=preset[1];}
  }
  if(event.target.id==='holder'&&$('holder').checked){
    setHolderSpacing();$('spacers').checked=true;
  }
  if(['rows','cols','pattern'].includes(event.target.id))omitted.clear();
  holdingCamera=event.target.id==='axis';try{render();}finally{holdingCamera=false;}
  if(!current)return;
  const targetEdit=['series','parallel','desiredAh','capacityMode','targetMode','volts','groupPlan','cellModel','nominal','cellAh','banks','axis','pattern'].includes(event.target.id);
  if(targetEdit&&!$('conversion').open&&event.target.checkValidity()){
    searchCapacity();
  }else if(['rows','cols'].includes(event.target.id)){
    alternateGroupEnds(current.c,current.m);render();
  }
});
function editCellAt(id,desired){
  if(!id||!current)return;
  const {c,m}=current,bank=Number($('bankView').value),key=id+'/'+bank;
  const present=m.bankCells[bank].some(cell=>cell.id===id);
  if($('cellTool').value==='flip'){
    if(present){toggleCell(key);render();}
    return;
  }
  if(desired!==undefined&&present===desired)return;
  const everywhere=$('cellTool').value==='omit';
  const affected=everywhere?m.bankCells.filter(cells=>cells.some(cell=>cell.id===id)).length:1;
  if(present&&affected===m.count){$('polarityKey').textContent='Keep at least one cell in the pack.';return;}
  if(!present&&!omitted.has(id)&&!omitted.has(key)){
    $('polarityKey').textContent='The BMS keep-out reserves this position.';return;
  }
  if(everywhere){
    for(const entry of omitted)if(entry.startsWith(id+'/'))omitted.delete(entry);
    if(present)omitted.add(id);else omitted.delete(id);
  }else if(present){
    omitted.add(key);
  }else{
    if(omitted.delete(id))for(let b=0;b<c.banks;b++)if(b!==bank)omitted.add(id+'/'+b);
    omitted.delete(key);
  }
  render();
}
// Capture on the stable SVG because rendering replaces the individual circles.
const endGrid=$('ends');
let cellStroke=null;
function paintCellAt(x,y){
  const target=document.elementFromPoint(x,y)?.closest('#ends [data-cell]');
  const id=target?.dataset.cell;
  if(!id||cellStroke.visited.has(id))return;
  cellStroke.visited.add(id);
  editCellAt(id,cellStroke.desired);
}
endGrid.addEventListener('pointerdown',e=>{
  const id=e.target.closest('[data-cell]')?.dataset.cell;
  if(!current||!id||e.button!==0||!e.isPrimary||$('cellTool').value==='flip')return;
  e.preventDefault();
  const bank=Number($('bankView').value);
  cellStroke={id:e.pointerId,desired:!current.m.bankCells[bank].some(cell=>cell.id===id),visited:new Set(),x:e.clientX,y:e.clientY};
  endGrid.setPointerCapture(e.pointerId);editHistory.paused=true;
  paintCellAt(e.clientX,e.clientY);
});
endGrid.addEventListener('pointermove',e=>{
  if(cellStroke?.id!==e.pointerId)return;
  const {x,y}=cellStroke;
  const steps=Math.ceil(Math.hypot(e.clientX-x,e.clientY-y)/5);
  for(let i=1;i<=steps;i++)paintCellAt(x+(e.clientX-x)*i/steps,y+(e.clientY-y)*i/steps);
  cellStroke.x=e.clientX;cellStroke.y=e.clientY;
});
function finishCellStroke(e){
  if(cellStroke?.id!==e.pointerId)return;
  cellStroke=null;editHistory.paused=false;recordEdit();
}
for(const type of ['pointerup','pointercancel','lostpointercapture'])endGrid.addEventListener(type,finishCellStroke);
endGrid.addEventListener('click',e=>{
  if($('cellTool').value==='flip'||!e.detail)editCellAt(e.target.closest('[data-cell]')?.dataset.cell);
});
document.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>{
  const settings={...defaults};
  if(button.dataset.preset==='lightbee')Object.assign(settings,{axis:'flat',cols:5,rows:20,banks:2,pattern:'regular',series:20,parallel:10,groupPlan:'split'});
  if(button.dataset.preset==='flat')Object.assign(settings,{axis:'flat',rows:2,banks:1});
  if(button.dataset.preset==='coupon')Object.assign(settings,{cols:2,rows:2,banks:1,gap:1.6,rowGap:1.6,pattern:'regular',holder:true});
  caseSketch=null;corners=[];endLift=[0,0];omitted.clear();reversedCells.clear();apply(settings);render();
});
document.querySelectorAll('[data-pack-preset]').forEach(button=>button.onclick=()=>{
  const match=/(\d+)s(\d+)p/.exec(button.dataset.packPreset),series=+match[1],parallel=+match[2];
  const columns=series===16&&parallel===6?4:5,rows=8,
    banks=parallel===5?Math.ceil(series/rows):parallel===8?Math.ceil(series/columns):Math.ceil(series*parallel/(columns*rows));
  const cell=cellSettings('40p'),base=columns*cell.d,shift=Math.max(0,Math.min(50,100*(115.75-base)/cell.d));
  const groupPlan=parallel===5?'rowGroups':parallel===8?'columnGroups':'auto';
  const settings={...defaults,...cell,mode:'pack',axis:'vertical',pattern:'custom',cols:columns,rows,banks,gap:0,rowGap:0,shift,
    series,parallel,capacityMode:'parallel',groupPlan,holder:false,squiggleOn:true,squiggleGuards:true,sqDirection:parallel===8?'columns':'rows',sqMaxWidth:115.75};
  caseSketch=null;corners=[];endLift=[0,0];omitted.clear();reversedCells.clear();apply(settings);$('projectName').value=series+'S'+parallel+'P EVE 40P';render();
  $('bankView').value=String(banks-1);render();
});
function setHolderSpacing(){
  const c={d:+fields.d.value,slack:+fields.slack.value,gap:+fields.gap.value,rowGap:+fields.rowGap.value};
  const minimum=Math.ceil(((c.d+c.slack)/Math.cos(Math.PI/48)+1-c.d)*100)/100;
  fields.gap.value=Math.max(c.gap,minimum);
  fields.rowGap.value=Math.max(c.rowGap,minimum);
}
$('web').onclick=()=>{setHolderSpacing();$('holder').checked=true;render();
};
$('fitshift').onclick=()=>{
  if(!current)return;
  const c=current.c,room=columnRoom(c)-2*(c.holderReserve+c.miscReserve);
  for(let cols=c.cols;cols>=1;cols--){
    for(const pattern of ['offset','short']){
      if(pattern==='short'&&cols===1)continue;
      if(layout({...c,cols,pattern}).U>room+1e-8)continue;
      fields.cols.value=cols;fields.pattern.value=pattern;fields.shift.value=50;omitted.clear();render();return;
    }
  }
  $('compare').textContent='The available width is too small for a full staggered array at these clearances.';
};
$('download').onclick=()=>{
  if(!current)return;
  const {c,m}=current;
  try {
    const data=binarySTL(holderTriangles(c,m));
    const url=URL.createObjectURL(new Blob([data],{type:'application/octet-stream'}));
    const link=document.createElement('a');link.href=url;link.download='holder-'+c.axis+'-'+c.pattern+'-'+m.cells.length+'-pockets.stl';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }catch(error){$('printMsg').textContent=error.message;}
};
$('holderStep').onclick=()=>{if(current)saveBlob('end-holder.step',stepSolid('end-holder',holderTriangles(current.c,current.m)),'application/step');};
$('fitSquiggle').onclick=()=>{
  const d=fields.d.valueAsNumber,gap=fields.gap.valueAsNumber,base=d+(fields.cols.valueAsNumber-1)*(d+gap);
  const percent=100*(fields.sqMaxWidth.valueAsNumber-base)/(d+gap);
  if(percent<0){$('squiggleStatus').textContent='Even straight rows require '+fmt(base)+' mm.';return;}
  fields.pattern.value='custom';fields.shift.value=Math.max(0,Math.min(50,percent));omitted.clear();render();
};
function squiggleBankModel(c,m,bank){
  const groups=groupMap(c,m);
  if(c.sqGroupsOnly){
    const cells=m.bankCells[bank].map(cell=>({...cell,seriesGroup:groups.get(cell.id+'/'+bank)||0}));
    if(!cells.length)throw Error('This bank has no cells.');
    return {c,m:{...m,cells},bank,partial:cells.length!==m.cells.length};
  }
  if(c.sqStyle==='rails'){
    const cells=m.bankCells[bank];
    if(!cells.length)throw Error('This bank has no cells.');
    return {c,m:{...m,cells},bank,partial:cells.length!==m.cells.length};
  }
  const active=m.cells.filter(cell=>groups.get(cell.id+'/'+bank)>0);
  if(active.length===m.cells.length)return {c,m,bank,partial:false};
  if(!active.length)throw Error('The displayed stack contains no active cells.');
  if(c.sqDirection==='columns'){
    const source=[...new Set(active.map(cell=>cell.k))].sort((a,b)=>a-b);
    if(source.some(k=>active.filter(cell=>cell.k===k).length!==c.rows))throw Error('The displayed stack has a partial column. Choose a complete-column layout for the long-direction squiggle.');
    const minU=Math.min(...active.map(cell=>cell.u)),columnIndex=new Map(source.map((k,index)=>[k,index]));
    const cells=active.map(cell=>({...cell,k:columnIndex.get(cell.k),u:cell.u-minU}));
    return {c:{...c,cols:source.length,banks:1},m:{...m,cells,count:cells.length},bank,partial:true};
  }
  const source=[...new Set(active.map(cell=>cell.r))].sort((a,b)=>a-b);
  if(source.some(r=>active.filter(cell=>cell.r===r).length!==c.cols))throw Error('The displayed stack has a partial row. Choose a complete-row layout for the crosswise squiggle.');
  const minV=Math.min(...active.map(cell=>cell.v)),rowIndex=new Map(source.map((r,index)=>[r,index]));
  const cells=active.map(cell=>({...cell,r:rowIndex.get(cell.r),v:cell.v-minV}));
  return {c:{...c,rows:source.length,banks:1},m:{...m,cells,count:cells.length},bank,partial:true};
}
$('snugGroups').onclick=()=>{
  if(!current)return;
  const {c}=current;
  if(c.holder){$('squiggleStatus').textContent='Cell holders need room between cells. Turn them off to close the gap.';return;}
  // Try both layout axes separately. A candidate must leave clearance at
  // every group boundary in every bank before any dimensions are changed.
  let best=null;
  for(const changes of [{gap:0},{rowGap:0},{gap:0,rowGap:0}]){
    const trial={...c,...changes};
    try{
      const m=layout(trial,omitted);
      if(m.count!==current.m.count)continue;
      for(let bank=0;bank<trial.banks;bank++){
        if(!m.bankCells[bank].length)continue;
        const model=squiggleBankModel(trial,m,bank);
        squiggleHolder(model.c,model.m,false,false);
      }
      const area=m.uSpan*m.vSpan;
      if(area<current.m.uSpan*current.m.vSpan-.001&&(!best||area<best.area))best={changes,area};
    }catch{/* This spacing leaves too little room between different groups. */}
  }
  if(!best){$('squiggleStatus').textContent='The current groups or spacing already limit how close these rows can sit.';return;}
  for(const [key,value] of Object.entries(best.changes))fields[key].value=value;
  render();
};
function displayedSquiggleModel(){
  if(!current)throw Error('Build a pack first.');
  const {c,m}=current,bank=Math.min(Number($('bankView').value)||0,c.banks-1);
  return squiggleBankModel(c,m,bank);
}
function squiggleDownload(model){
  const single=model.c.sqStyle==='rails'&&!['all','split'].includes($('sqExportBanks').value)?Number($('sqStripChoice').value):0;
  const include=!single&&$('squiggleCells').checked;
  const sq=squiggleHolder(model.c,model.m,model.c.squiggleGuards,true,{includeCells:include,buildReinforcement:true});
  const components=single?[sq.components[single-1]]:sq.components;
  const suffix=(single?'-strip-'+single:'')+(include?'-with-cells':'');
  return {components,suffix};
}
function exportSquigglies(format){
  try{
    if(!current)throw Error('Build a pack first.');
    const {c,m}=current,scope=$('sqExportBanks').value,split=scope==='split',rails=c.sqStyle==='rails';
    const banks=['all','split'].includes(scope)?m.bankCells.map((_,b)=>b).filter(b=>m.bankCells[b].length):[Number(scope)];
    const choice=$('sqExportEnds').value,ends=rails?['strips']:choice==='both'?['bottom','top']:[choice];
    const files={},combined=[];
    let xStart=0;
    for(const bank of banks){
      let model,download;
      try{model=squiggleBankModel(c,m,bank);download=squiggleDownload(model);}
      catch(e){throw Error('Bank '+(bank+1)+': '+e.message);}
      const {components,suffix}=download;
      const name='squigglies-bank-'+(bank+1)+'-'+(rails?'strips':choice)+(model.partial?'-partial':'')+suffix;
      // Keep every copy on the print bed, with the flat terminal sheet down.
      let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
      for(const body of components)for(const tri of body)for(const [x,,z] of tri){
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
      }
      const bodies=[];
      if(split)xStart=0;
      for(const end of ends){
        for(const [index,body] of components.entries()){
          const tris=body.map(tri=>{
            const points=tri.map(([x,y,z])=>[xStart+(end==='top'?maxX-x:x-minX),y,rails?z-minZ:maxZ-z]);
            return end==='bottom'?points.reverse():points;
          });
          bodies.push(['Bank '+(bank+1)+' '+end+' '+(index+1),tris]);
        }
        xStart+=maxX-minX+5;
      }
      if(split)files[name+'.'+format]=assemblyFile(format,bodies);
      else combined.push(...bodies);
    }
    const scopeName=banks.length===1?'bank-'+(banks[0]+1):'all-banks';
    const name='squigglies-'+scopeName+'-'+(rails?'strips':choice);
    if(split)return downloadBankZip(files,name,format);
    saveBlob(name+'.'+format,assemblyFile(format,combined),format==='step'?'application/step':'application/octet-stream');
  }catch(error){$('squiggleStatus').textContent=error.message;}
}
async function downloadBankZip(files,name,format){
  try{
    const entries={};
    for(const [key,blob] of Object.entries(files))entries[key]=new Uint8Array(await blob.arrayBuffer());
    saveBlob(name+'-'+format+'.zip',fflate.zipSync(entries,{level:1}),'application/zip');
  }catch(error){$('squiggleStatus').textContent=error.message;}
}
$('squiggleStep').onclick=()=>exportSquigglies('step');
$('squiggleStl').onclick=()=>exportSquigglies('stl');
$('exportSquiggleStep').onclick=()=>$('squiggleStep').click();
$('exportSquiggleStl').onclick=()=>$('squiggleStl').click();
$('caseStep').onclick=()=>{if(current)saveBlob('case.step',stepSolid('case',caseMesh(current.c,current.shell)),'application/step');};
$('bankView').onchange=render;
$('cellTool').onchange=()=>{if(current)diagram(current.c,current.m);};
$('flipAxis').onclick=()=>{fields.axis.value=fields.axis.value==='vertical'?(fields.axis.dataset.lastFlat||(caseSketch&&!caseSketch.endFace?'cross':'flat')):'vertical';fields.axis.dispatchEvent(new Event('input',{bubbles:true}));};
$('batch').onchange=()=>{if(current)$('applyBatch').disabled=$('batch').value==='series'&&['split','mirror'].includes(current.c.groupPlan)&&current.c.series%current.c.banks!==0;};
$('applyBatch').onclick=()=>{
  if(!current)return;
  const {c,m}=current,op=$('batch').value,groups=groupMap(c,m);
  for(const [key,g] of groups){
    const bank=Number(key.split('/')[1]);
    if(op==='flipAll'||(op==='flipBank'&&bank===Number($('bankView').value)))toggleCell(key);
    else if(op==='align'||op==='banks'||(op==='series'&&g)){
      if((op==='series'&&g%2===0)||(op==='banks'&&bank%2===1))reversedCells.add(key);
      else reversedCells.delete(key);
    }
  }
  render();
};
const theme=$('themePick'),systemTheme=matchMedia('(prefers-color-scheme: dark)');
try{theme.value=localStorage.getItem('cellbench.theme')||'dark';}catch{}
function paintTheme(){document.documentElement.dataset.theme=theme.value==='system'?(systemTheme.matches?'dark':'light'):theme.value;}
theme.onchange=()=>{paintTheme();try{localStorage.setItem('cellbench.theme',theme.value);}catch{}};
systemTheme.addEventListener('change',paintTheme);paintTheme();
initBuilder();apply(defaults);
try{const draft=projectStorage.getItem(storageKey+'.draft');if(draft){const doc=JSON.parse(draft);restore(doc,doc.buildId);buildAutosave.syncDraft(doc);}else render();}catch{render();}
