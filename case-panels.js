// Side A is the low extrusion coordinate, B the high one. Match the viewer cube.
function casePanelMode(c,side,profile){
  const choice=c.caseSides?.[side];
  if(['open','attached','separate'].includes(choice))return choice;
  return profile&&side===1?'open':'attached';
}
function casePanelNames(){
  return caseSketch?.endFace?['Back','Front']:['Right','Left'];
}
function casePanelSVG(c,s){
  const points=cardboardPanels(c,s,'profile')[0].points,b=sketchBounds(points);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+b.w+'mm" height="'+b.h+'mm" viewBox="0 0 '+b.w+' '+b.h+'"><title>Case exterior profile in millimeters</title><path fill="none" stroke="black" stroke-width=".1" d="M'+points.map(p=>p.join(' ')).join(' L')+' Z"/></svg>';
}
const panelMenus=[];
for(const host of document.querySelectorAll('.casePanels')){
  for(const side of [0,1]){
    const label=document.createElement('label'),caption=document.createElement('span'),menu=document.createElement('select');
    for(const [value,text] of [['attached','Closed · attached'],['open','Open'],['separate','Open · export separate plate']])menu.add(new Option(text,value));
    const download=document.createElement('button');download.type='button';
    menu.onchange=()=>{
      if(!current)return;
      caseSideSettings=[...caseSideSettings];caseSideSettings[side]=menu.value;
      render();document.dispatchEvent(new Event('casepanelschanged'));
    };
    download.onclick=()=>{
      if(!current)return;
      const {c,shell}=current,name=casePanelNames()[side].toLowerCase()+'-plate.stl';
      const mesh=shell.profile?fixedCaseMesh(c,shell,side):caseMesh(c,shell,side);
      saveBlob(name,binarySTL(mesh),'application/octet-stream');
    };
    label.append(caption,menu);host.append(label,download);panelMenus.push({side,caption,menu,download});
  }
  const svg=document.createElement('button');svg.type='button';svg.textContent='Download flat profile SVG · 1:1';
  svg.onclick=()=>{if(current)saveBlob('case-outer-profile-mm.svg',casePanelSVG(current.c,current.shell),'image/svg+xml');};
  const step=document.createElement('button');step.type='button';step.textContent='Download case & separate plates STEP';
  step.onclick=()=>{
    if(!current)return;
    const {c,shell}=current,bodies=[['Case',caseMesh(c,shell)]];
    for(const side of [0,1])if(!(caseSketch?.step&&caseSketch.original)&&casePanelMode(c,side,shell.profile)==='separate'){
      bodies.push([casePanelNames()[side]+' plate',caseMesh(c,shell,side)]);
    }
    saveBlob('case-and-plates.step',assemblyFile('step',bodies),'application/step');
  };
  host.append(svg,step);
}
let caseSideSettings=[];
function refreshCasePanels(c,s){
  const names=casePanelNames();
  for(const {side,caption,menu,download} of panelMenus){
    caption.textContent=names[side]+' side';menu.value=casePanelMode(c,side,s.profile);
    menu.disabled=!!(caseSketch?.step&&caseSketch.original);
    menu.title=menu.disabled?'Use the sketched enclosure to change panels on an imported STEP body.':'';
    download.hidden=menu.disabled||menu.value!=='separate';download.textContent='Download '+names[side].toLowerCase()+' plate STL';
  }
}
