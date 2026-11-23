// Geometry, saved designs and fabrication exports use millimeters.
let measurementUnit='mm';
try{if(localStorage.getItem('motopack-display-unit')==='in')measurementUnit='in';}catch{}
function displayLength(...mm){
  const scale=measurementUnit==='in'?25.4:1;
  return mm.map(n=>Number((n/scale).toFixed(scale===1?2:4))).join(' × ')+' '+measurementUnit;
}
function setupMeasurementUnits(){
  const pairs=[],switches=[];
  function newSwitch(host){
    const select=document.createElement('select');
    select.setAttribute('aria-label','Measurement units');select.className='measureSwitch';
    select.add(new Option('mm','mm'));select.add(new Option('in','in'));
    host.append(select);switches.push(select);select.onchange=()=>choose(select.value);
  }
  for(const host of [document.querySelector('#topDashboard').parentNode,document.querySelector('.convHeader'),document.querySelector('.skViewBar>div')])newSwitch(host);
  for(const dialog of document.querySelectorAll('dialog:has(input[type=number])')){
    if(['batteryWizard','conversion','sketchDialog'].includes(dialog.id))continue;
    const title=dialog.querySelector('h2');if(title)newSwitch(title);
  }
  function syncFields(){
    const inches=measurementUnit==='in';
    for(const {mm,inch,text} of pairs){
      const position=mm.id==='poseValue';
      const active=inches&&(!position||$('poseMode').value==='position');
      mm.classList.toggle('metricSource',active);inch.hidden=!active;
      if(text){
        const suffix=active?'(in)':'(mm)';
        const next=text.textContent.replace(/\((?:mm|in)\)/,suffix);
        if(next!==text.textContent)text.textContent=next;
      }
      if(!active)continue;
      if(position)$('poseUnit').textContent='in';
      inch.disabled=mm.disabled;
      if(document.activeElement!==inch){
        const value=mm.value===''?'':String(Number((mm.valueAsNumber/25.4).toFixed(8)));
        if(inch.value!==value)inch.value=value;
      }
      if(mm.min)inch.min=mm.min/25.4;if(mm.max)inch.max=mm.max/25.4;
    }
  }
  for(const mm of document.querySelectorAll('input[type=number]')){
    if(mm.closest('#batteryWizard'))continue;
    const label=mm.closest('label');
    const text=label&&[...label.childNodes].find(n=>n.nodeType===3&&n.textContent.includes('(mm)'));
    if(!text&&mm.id!=='poseValue')continue;
    const inch=document.createElement('input');inch.type='number';inch.step='any';inch.hidden=true;inch.className='inchEntry';
    inch.setAttribute('aria-label',(text?.textContent||'Position').replace('(mm)','').trim()+' in inches');
    mm.after(inch);pairs.push({mm,inch,text});
    for(const event of ['input','change','blur'])inch.addEventListener(event,e=>{
      e.stopPropagation();
      if(event!=='blur')mm.value=inch.value===''?'':Number((inch.valueAsNumber*25.4).toFixed(9));
      mm.dispatchEvent(new Event(event,{bubbles:event!=='blur'}));
    });
  }
  function choose(unit){
    measurementUnit=unit;
    try{localStorage.setItem('motopack-display-unit',unit);}catch{}
    for(const select of switches)select.value=unit;
    if($('bwUnits').value!==unit||bwScale!==(unit==='in'?25.4:1)){
      $('bwUnits').value=unit;bwConvert(unit==='in'?25.4:1);if(batteryWizard.open)bwRefresh();
    }
    if(current)render();syncFields();
    document.dispatchEvent(new Event('measurementchange'));
  }
  $('bwUnits').addEventListener('change',e=>choose(e.target.value));
  choose(measurementUnit);
  // Existing tools can load a new design or change a label while a dialog stays open.
  setInterval(()=>{if(measurementUnit==='in'&&!document.hidden)syncFields();},250);
}

document.addEventListener('DOMContentLoaded',setupMeasurementUnits,{once:true});
