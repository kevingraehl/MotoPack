// Both editing surfaces drive the original fields so a saved design has one layout.
for(const [key,title] of [['cols','Cells per full row'],['rows','Rows per bank'],['banks','Banks / stacks'],['pattern','Row offset']]){
  const source=fields[key],input=source.cloneNode(true),label=document.createElement('label');
  input.id='viewArray'+key;input.dataset.source=key;input.value=source.value;
  input.oninput=()=>{source.value=input.value;source.dispatchEvent(new Event('input',{bubbles:true}));document.dispatchEvent(new Event('viewerarrayedited'));};
  label.append(title,input);$('viewerArray').append(label);
}
const targetDialog=$('targetDialog');
function describeBanks(){
  const upright=$('targetAxis').value==='vertical';
  $('bankQuestion').textContent=upright?'How many vertical stacks?':'How many banks end to end?';
  $('bankExplain').textContent=upright?'Each stack adds one cell length in height. Rows and columns set the footprint.':'Each bank repeats the same rows and columns one cell length farther along the cell axis.';
}
$('targetAxis').onchange=describeBanks;
document.querySelectorAll('.targetPack').forEach(b=>b.onclick=()=>{
  $('batteryOnlyFields').hidden=true;
  $('targetAxis').value=fields.axis.value;$('targetBanks').value=fields.banks.value;
  $('targetText').value='';$('targetFeedback').textContent='';describeBanks();targetDialog.showModal();$('targetText').focus();
});
$('targetCancel').onclick=()=>targetDialog.close();
$('targetForm').onsubmit=e=>{
  e.preventDefault();
  const match=/^\s*(?:i want (?:a |an )?)?(\d+)\s*s\s*(\d+)\s*p?(?:\s+pack)?\s*$/i.exec($('targetText').value);
  const series=Number(match?.[1]),parallel=Number(match?.[2]),guided=$('conversion').open;
  const fail=text=>{$('targetFeedback').textContent=text;};
  if(!series||series>(guided?32:150)||guided&&series<10||!parallel||parallel>1000)return fail('Enter a target such as 20S 11P. Choose '+(guided?'10–32':'1–150')+' series groups and 1–1000 parallel cells.');
  const axis=$('targetAxis').value,banks=+$('targetBanks').value,total=series*parallel;
  if(guided&&caseSketch?.entry==='top'&&axis==='cross'&&banks>2)return fail('For this top-loading frame choose up to two flat banks across, or use vertical stacks.');
  try{
    let c={...read(),axis,banks,series,parallel,targetMode:'series',capacityMode:'parallel',volts:series*fields.nominal.value,grouping:'on'};
    if(!$('batteryOnlyFields').hidden){
      if(cellById.has($('batteryModel').value))Object.assign(c,cellSettings($('batteryModel').value));
      c.volts=series*c.nominal;
    }
    let fit;
    if(caseSketch){
      if(!$('batteryOnlyFields').hidden){
        c={...sketchPackConfig(caseSketch,c,banks),axis};
        c.holderShape=endsFaceProfile(c)?'contour':'rectangle';
      }
      fit=buildContourPack(c,caseProfile(caseSketch));
      if(!fit||fit.count<total)return fail((fit?fit.count+' usable positions':'No clear layout found')+' for '+total+' requested cells. Try another direction, change the number of banks or enlarge the case.');
      c=fit.c;
    }else{
      const best=fitOpenPack(c,total);
      if(!best)return fail('No clear layout found for '+total+' cells with '+banks+' bank(s). Change direction or banks, or increase the inside case dimensions.');
      c=best.c;fit=best;

    }
    if(caseSketch)Object.assign(caseSketch,{limitParallel:true,requestedParallel:parallel,targetVolts:c.volts,flatBanks:banks,guidedDirection:axis==='vertical'?'up':endsFaceProfile(c)?'through':'along'});
    if(fit.pose)placements=fit.pose;apply(c);omitted.clear();fit.skip.forEach(id=>omitted.add(id));reversedCells.clear();
    const groups=groupMap(c,layout(c,omitted));for(const [key,g] of groups)if(g&&g%2===0)reversedCells.add(key);
    if(!$('batteryOnlyFields').hidden)$('projectName').value=$('batteryName').value.trim()||'Battery pack';
    render();if(guided)document.dispatchEvent(new Event('packtargetbuilt'));
    targetDialog.close();openConnectionRoute();
  }catch(error){fail(error.message);}
};

function fitOpenPack(c,total){
  const local=c.groupPlan==='auto',perGroup=Math.ceil(total/c.series);
  const need=local?Math.ceil(c.series/c.banks)*perGroup:Math.ceil(total/c.banks),short=['short','customShort'].includes(c.pattern);
  let best=null;
  for(let cols=1;cols<=30;cols++){
    if(short&&cols===1)continue;
    let rows=1;
    while(rows<=30&&rows*cols-(short?Math.floor(rows/2):0)<need)rows++;
    if(rows>30)continue;
    const trial={...c,rows,cols},grid=layout(trial).grid,skip=new Set(grid.slice(need).map(cell=>cell.id));
    if(local){
      const quotas=bankGroupCounts(c.series,perGroup,Array(c.banks).fill(grid));
      for(let b=0;b<c.banks;b++)for(let i=quotas[b]*perGroup;i<Math.min(need,grid.length);i++)skip.add(grid[i].id+'/'+b);
    }
    const m=layout(trial,skip),shell=makeShell(trial,m);
    if(shell.cells.some(p=>p.status!=='clear')||shell.warnings.length||shell.allowanceMargins.some(v=>v<-.00001)||trial.holder&&holderProblem(trial,m))continue;
    const score=Math.max(m.U,m.V);
    if(!best||score<best.score)best={c:trial,skip,score};
  }
  return best;
}
