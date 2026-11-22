// Render the active layout on demand so edited groups and polarity always match.
function openConnectionRoute(inline=false){
  const dialog=$('routeDialog'),summary=$('routeSummary'),controls=$('routeControls');
  const host=inline===true?$('inlineRoute'):dialog;
  const oldGroup=$('routeGroup').value,oldBank=$('nickelBank').value;
  host.append(summary,controls);
  if(host===dialog&&!dialog.open)dialog.showModal();
  controls.hidden=true;
  if(!current){summary.textContent='Build a cell layout first.';return;}
  const {c,m}=current;
  const grouping=$('routeGrouping');
  grouping.replaceChildren(...Array.from(fields.groupPlan.options,o=>new Option(o.text,o.value)));
  grouping.value=c.groupPlan;
  function updatePlan(value,choice){
    fields.groupPlan.value=value;routeChoice=choice;
    const next={...c,groupPlan:value,routeChoice:choice};
    alternateGroupEnds(next,m);render();
    if(host===dialog)openConnectionRoute();
  }
  grouping.onchange=()=>updatePlan(grouping.value,0);
  for(const child of controls.children)child.hidden=false;
  const automatic=c.groupPlan==='auto';
  $('routeChoices').hidden=!automatic;
  const choice=c.routeChoice||0;
  $('bestRoute').disabled=choice===0;
  $('bestRoute').onclick=()=>updatePlan('auto',0);
  const otherChoices=[];
  if(automatic){
    const signature=n=>Array.from(groupMap({...c,routeChoice:n},m).values()).join(',');
    const seen=new Set([signature(choice)]);
    for(let n=0;n<8;n++){
      const key=signature(n);
      if(!seen.has(key)){seen.add(key);otherChoices.push(n);}
    }
  }
  $('otherRoute').disabled=!otherChoices.length;
  $('otherRoute').onclick=()=>updatePlan('auto',otherChoices[Math.floor(Math.random()*otherChoices.length)]);
  const folded=effectiveGroupPlan(c)==='folded',half=bankGroupCounts(c.series,activeParallel(m.count,c,m),m.bankCells)[0];
  $('routeChoiceInfo').textContent=(folded&&half>0&&half<c.series?'Bank 1: S1–S'+half+'. Bank 2: S'+(half+1)+'–S'+c.series+'. Join S'+half+' positive to S'+(half+1)+' negative with one inter-bank bridge. ':'')+
    (automatic?(choice?'Alternative '+choice+'.':'Best suggested sweep · favors short hops between cells.'):'');
  const groups=groupMap(c,m),parallel=activeParallel(m.count,c,m);
  const sizes=Array(c.series+1).fill(0);
  for(const g of groups.values())sizes[g]++;
  if(!parallel||sizes.slice(1).some(n=>n!==parallel)){
    controls.hidden=false;
    for(const child of controls.children)if(child!==grouping.parentElement)child.hidden=true;
    summary.textContent=parallel?'This grouping cannot fill every series group equally. Change bank grouping or adjust the cell layout.':'Add enough cells for one complete series string.';
    return;
  }
  const nodes=Array.from({length:c.series+1},()=>[]);
  for(let bank=0;bank<c.banks;bank++)for(const cell of m.bankCells[bank]){
    const key=cell.id+'/'+bank,group=groups.get(key);
    if(group)nodes[group].push({...cell,bank,flipped:reversedCells.has(key)});
  }
  const name=p=>'Bank '+(p.bank+1)+', row '+(p.r+1)+', cell '+(p.k+1);
  const axial=(p,positive)=>p.bank*(c.len+(c.holder?2*c.lip:0)+m.axialSheet)+(positive!==p.flipped?c.len:0);
  const distance=(p,q,positive,otherPositive)=>Math.hypot(p.u-q.u,p.v-q.v,axial(p,positive)-axial(q,otherPositive));
  function walk(cells,positive){
    const pending=cells.slice(1),path=[cells[0]];
    while(pending.length){
      let nearest=0,min=Infinity;
      pending.forEach((p,i)=>{const d=distance(path.at(-1),p,positive,positive);if(d<min){min=d;nearest=i;}});
      path.push(pending.splice(nearest,1)[0]);
    }
    return path;
  }
  controls.hidden=false;
  summary.textContent='Routed '+c.series+'S'+parallel+'P · '+(2*c.series*(parallel-1))+' parallel links · '+(c.series-1)+' series bridges';
  const requested=caseSketch?.requestedParallel??targetParallel(c);
  summary.textContent+=' · '+(parallel*c.series)+' active cells.';
  if(requested>parallel)summary.textContent+=' Requested '+c.series+'S'+requested+'P needs '+(c.series*requested-m.count)+' more cell positions.';
  const menu=$('routeGroup');menu.replaceChildren();
  menu.add(new Option('Whole pack · all groups',0));
  for(let g=1;g<=c.series;g++)menu.add(new Option('Series group '+g,g));
  const bankMenu=$('nickelBank'),faceMenu=$('nickelFace');bankMenu.replaceChildren();
  for(let b=0;b<c.banks;b++)bankMenu.add(new Option('Bank '+(b+1),b));
  if(inline===true&&[...menu.options].some(o=>o.value===oldGroup))menu.value=oldGroup;
  if(inline===true&&[...bankMenu.options].some(o=>o.value===oldBank))bankMenu.value=oldBank;
  const plans=new Map();
  function plan(g){
    if(plans.has(g))return plans.get(g);
    const cells=nodes[g],next=nodes[g+1];
    const paths=[walk(cells,true),walk(cells,false)];
    let bridge;
    if(next){
      let best=Infinity;
      for(const p of cells)for(const q of next){const d=distance(p,q,true,false);if(d<best){best=d;bridge=[p,q];}}
    }
    const result={paths,bridge};plans.set(g,result);return result;
  }
  const tools=$('nickelTools');
  let physical=null,lastWidth;
  function draw(){
    const overview=menu.value==='0',g=Number(menu.value)||1,cells=nodes[g],next=nodes[g+1];
    const label=p=>String(cells.indexOf(p)+1);
    const {paths,bridge}=plan(g);
    $('groupSchematic').hidden=overview;
    const diagram=$('routeDiagram'),spacing=46;
    diagram.setAttribute('viewBox','0 0 '+Math.max(125,(parallel+1)*spacing+50)+' 92');
    const row=(path,y,sign)=>path.map((p,i)=>{
      const x=23+i*spacing;
      return (i?'<path stroke="#58baff" stroke-width="3" d="M'+(x-spacing+15)+' '+y+'h'+(spacing-30)+'"/>':'')+
        '<circle cx="'+x+'" cy="'+y+'" r="15" fill="#1d384c" stroke="#58baff"/><text x="'+x+'" y="'+(y+4)+'" fill="white" text-anchor="middle" font-size="12">'+label(p)+sign+'</text>';
    }).join('');
    let drawing=row(paths[0],23,'+')+row(paths[1],70,'−');
    if(bridge){
      const x=23+paths[0].indexOf(bridge[0])*spacing,end=(parallel+0.5)*spacing;
      drawing+='<path d="M'+x+' 8 V3 H'+end+' V15" fill="none" stroke="#efb835" stroke-width="2"/><text x="'+end+'" y="31" text-anchor="middle" fill="#ce9620" font-size="12">S'+(g+1)+' −</text>';
    }
    diagram.innerHTML=drawing;
    const bank=+bankMenu.value,front=faceMenu.value==='1';
    const visible=(cell,positive)=>cell.bank===bank&&(positive!==cell.flipped)===front;
    const map=$('nickelMap');map.setAttribute('viewBox',[m.u0-c.d,m.v0-c.d,m.uSpan+2*c.d,m.vSpan+2*c.d].join(' '));
    let marks='';
    for(const cell of m.bankCells[bank]){
      const sg=groups.get(cell.id+'/'+bank);
      marks+='<circle cx="'+cell.u+'" cy="'+cell.v+'" r="'+c.d*.45+'" fill="'+(overview&&sg?groupColor(sg):sg===g?'#779db5':'#374654')+'"/>';
    }
    function strip(p,q,color){
      marks+='<line x1="'+p.u+'" y1="'+p.v+'" x2="'+q.u+'" y2="'+q.v+'" stroke="'+color+'" stroke-width="'+c.d*.15+'"/>';
    }
    let visibleLinks=0;
    for(let group=overview?1:g;group<=(overview?c.series:g);group++){
      const route=plan(group);
      for(const [end,path] of route.paths.entries())for(let i=1;i<path.length;i++){
        if(visible(path[i-1],!end)&&visible(path[i],!end)){strip(path[i-1],path[i],'#6ecfff');visibleLinks++;}
      }
      if(route.bridge&&route.bridge[0].bank!==route.bridge[1].bank){
        for(const [i,cell] of route.bridge.entries())if(visible(cell,i===0)){
          marks+='<circle cx="'+cell.u+'" cy="'+cell.v+'" r="'+c.d*.43+'" fill="none" stroke="#ffc242" stroke-width="'+c.d*.09+'"><title>Inter-bank bridge S'+group+' to S'+(group+1)+'</title></circle>';
        }
      }
      if(route.bridge&&visible(route.bridge[0],true)&&visible(route.bridge[1],false)){strip(...route.bridge,'#ffc242');visibleLinks++;}
      for(const cell of nodes[group].filter(cell=>cell.bank===bank))marks+='<text x="'+cell.u+'" y="'+cell.v+'" text-anchor="middle" dominant-baseline="central" font-size="'+c.d*.4+'" fill="'+(overview?'#101a28':'white')+'">'+(overview?'S'+group:label(cell))+'</text>';
    }
    $('mapStatus').textContent=visibleLinks+' links on this face. '+(folded?'A gold ring marks the inter-bank bridge terminal. ':'')+(overview?'Choose a series group to inspect both terminal paths and its bridge.':'The list includes connections to other faces and banks.');
    if(tools.open){
      const width=$('nickelWidth').valueAsNumber,thickness=$('nickelThickness').valueAsNumber;
      const valid=$('nickelWidth').checkValidity()&&$('nickelThickness').checkValidity()&&width<c.d;
      for(const id of ['nickelFlat','nickelStep','nickel3D'])$(id).disabled=!valid;
      if(!valid)$('nickelJumperList').hidden=true;
      if(!valid)$('nickelReport').textContent='Enter a strip narrower than the cell and a thickness within the displayed limits.';
      else{
        if(!physical||width!==lastWidth){physical=routeNickelPlates(c,m,plan,width);lastWidth=width;}
        $('nickelStep').disabled=physical.plateCount===0;
        const jumpers=$('nickelJumperList');
        jumpers.hidden=!physical.jumpers;
        const list=jumpers.querySelector('ol');
        if(list.dataset.width!==String(width)||list.route!==physical){
          list.replaceChildren();
          for(const link of physical.links.filter(l=>l.reason)){
            const item=document.createElement('li');
            item.textContent=name(link.a)+(link.posA?' (+)':' (−)')+' → '+name(link.b)+(link.posB?' (+)':' (−)')+' · '+link.reason;
            list.append(item);
          }
          list.route=physical;list.dataset.width=String(width);
        }
        const face=physical.faces[bank*2+Number(front)];
        const selected=face.plates.filter(p=>overview||p.net===g||p.net===g-1);
        const overlay=selected.map(p=>'<path d="'+nickelPath(p.loops)+'" fill="#e3e9ed" fill-rule="evenodd" stroke="#45545d" stroke-width=".3"/>').join('');
        marks=marks.replace(/<line [^>]*\/>/g,'').replace(/<text /,overlay+'<text ');
        $('nickelReport').textContent=physical.plateCount+' plates across the pack · '+selected.length+' shown · '+physical.jumpers+' separate '+(physical.jumpers===1?'link':'links')+' to review. Downloads include every bank and both faces.';
        $('nickelFlat').onclick=()=>downloadNickelFaces(c,m,physical,width,thickness);
        $('nickelStep').onclick=()=>saveBlob('nickel-plates.step',assemblyFile('step',nickelBodies(c,m,physical,thickness)),'application/step');
        $('nickel3D').onclick=()=>previewNickel(c,m,physical,thickness);
      }
    }
    map.innerHTML=marks;
    const list=$('routeList');list.replaceChildren();
    if(overview)return;
    function line(text){const p=document.createElement('p');p.textContent=text;list.append(p);}
    line('Positive terminals (+)  '+paths[0].map(label).join(' → '));
    line('Negative terminals (−)  '+paths[1].map(label).join(' → '));
    if(bridge)line('Series bridge  '+name(bridge[0])+' (+) → S'+(g+1)+' '+name(bridge[1])+' (−)');
    if(g===1)line('Pack negative  '+name(paths[1][0])+' (−)');
    if(!next)line('Pack positive  '+name(paths[0].at(-1))+' (+)');
    for(const p of cells)line(label(p)+' · '+name(p)+' · visible end '+(p.flipped?'−':'+'));
  }
  tools.ontoggle=draw;
  for(const id of ['nickelWidth','nickelThickness']){
    $(id).oninput=draw;$(id).onchange=()=>{if($(id).checkValidity())scheduleSave();};
  }
  menu.onchange=()=>{if(+menu.value)bankMenu.value=nodes[+menu.value][0].bank;draw();};bankMenu.onchange=faceMenu.onchange=draw;draw();
}
document.querySelectorAll('.autoRoute').forEach(button=>button.onclick=openConnectionRoute);

function refreshInlineRoute(){
  if($('liveRoute').open&&!$('routeDialog').open)openConnectionRoute(true);
}
document.getElementById('liveRoute').ontoggle=refreshInlineRoute;
document.getElementById('routeDialog').addEventListener('close',refreshInlineRoute);
