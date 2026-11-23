function initCaseEditor(){
  const dialog=$('sketchDialog'),board=$('skBoard'),ns=board.namespaceURI;
  let d,tool,cal=[],viewport,drag,pdf,revision=0,undo=[],redo=[],selection=-1;
  let panelDraft=null,panelSource=null;
  let arcThrough=null,hover=null,dimensions=true;
  let disposeModel,loading=false,guided=null,practice=null;
  let liveTimer,quickTimer=0,liveKey='',depthMeasured=false,explicitAuto=false;
  const live=$('skLive');
  const extras=document.createElement('details');extras.className='drawingExtras';
  const summary=document.createElement('summary');summary.textContent='More drawing tools';extras.append(summary);
  const scaleDetails=document.createElement('details');
  const scaleSummary=document.createElement('summary');scaleSummary.textContent='Reference scale';scaleDetails.append(scaleSummary);
  $('skScaleTools').before(scaleDetails);scaleDetails.append($('skScaleTools'));
  const start=$('skOutlineTitle');start.before(extras);
  while(extras.nextElementSibling)extras.append(extras.nextElementSibling);
  // Keep the example and the case width within reach without opening advanced tools.
  $('skFinishLine').after($('skUndo'),$('skRedo'));
  live.append($('useDemoOutline'),$('skDepth').closest('label'));
  const preview=document.createElementNS(ns,'g');preview.setAttribute('pointer-events','none');
  preview.id='skCellPreview';$('skDrawing').before(preview);
  $('skLayers').onchange=e=>{const id=e.target.dataset.layer;if(id){$(id).checked=e.target.checked;$(id).dispatchEvent(new Event('change',{bubbles:true}));}};
  function liveConfig(){return sketchPackConfig(d,current?.c||defaults,d.flatBanks||2);}
  function syncWidths(){
    d.flatBanks=[1,2,3].includes(d.flatBanks)?d.flatBanks:2;d.entry=d.entry||'side';
    if(d.entry==='top'&&d.flatBanks===3)d.flatBanks=2;
    if(d.entry!=='top')d.upright=false;
    $('skEntry').value=d.entry;
    for(const btn of $('skWidths').children){
      const n=+btn.dataset.banks;btn.hidden=n===0?d.entry!=='top':n===3&&d.entry==='top';
      btn.disabled=btn.hidden;btn.setAttribute('aria-pressed',String(d.upright?n===0:n===d.flatBanks));
    }
    $('skWidthHelp').textContent=d.entry==='side'?'Three across is an option for side-loading frames like some KTMs and Husqvarnas. Check boot clearance.':'For a top-loading perimeter frame, compare flat cells with an upright stack.';
    if(!depthMeasured)$('skDepth').value=d.upright?145:Math.max(145,Math.ceil(flatPackDepth(liveConfig())));
    $('skDepth').closest('label').firstChild.textContent=depthMeasured?'Measured inside width (mm)':'Planning width · measure on bike (mm)';
  }
  for(const n of [1,2,3,0]){
    const button=document.createElement('button');button.className='secondary';button.dataset.banks=n;
    const icon=document.createElement('canvas');icon.width=88;icon.height=28;icon.setAttribute('aria-hidden','true');
    const ctx=icon.getContext('2d');
    for(let k=0;k<n;k++){
      const x=44-n*14+28*k;ctx.fillStyle='#83bcab';ctx.fillRect(x,6,25,15);
      ctx.fillStyle='#c3e7da';ctx.fillRect(x+2,8,2,11);ctx.fillStyle='#ffc748';ctx.fillRect(x+24,9,2,9);
    }
    if(!n)for(let k=0;k<3;k++){
      ctx.fillStyle='#83bcab';ctx.fillRect(25+k*13,4,10,21);ctx.fillStyle='#ffc748';ctx.fillRect(27+k*13,2,6,3);
    }
    button.append(icon,document.createTextNode(n?n+' wide':'Upright'));$('skWidths').append(button);
    button.onclick=()=>{explicitAuto=true;d.upright=n===0;if(n)d.flatBanks=n;syncWidths();paint();};
  }
  $('skEntry').onchange=()=>{explicitAuto=true;d.entry=$('skEntry').value;syncWidths();paint();};
  $('skDepth').oninput=()=>{depthMeasured=true;if(!guided?.motor){d.widthMeasured=true;syncWidths();paint();}};
  $('skSwitch').onclick=()=>{mode(traceTool()?'draw':'pen');paint();};
  for(const [id,key] of [['skVolts','targetVolts'],['skPrice','unitPrice']])$(id).oninput=()=>{
    if($(id).value&&$(id).checkValidity()){d[key]=$(id).valueAsNumber;queueFill();}
  };
  $('skAuto').onclick=()=>{explicitAuto=true;queueFill(true);};
  $('keepDrawing').onclick=()=>$('outlinePrompt').close();
  $('connectOutline').onclick=()=>{$('outlinePrompt').close();$('skClose').click();};
  function queueFill(force=false){
    if(guided?.scaleOnly||guided?.motor)return;
    const key=[d.targetVolts,d.unitPrice,d.points.length,d.scale,d.angle,d.closed,d.flatBanks,d.upright,$('skDepth').value,d.points.map(p=>p.join(',')).join(' ')].join('|');
    if(!force&&key===liveKey)return;
    liveKey=key;clearTimeout(liveTimer);
    $('skValue').textContent='';
    if(!d.scale||d.points.length<3){
      clearTimeout(quickTimer);quickTimer=0;preview.replaceChildren();
      $('skCapacity').textContent=d.scale?'Draw at least three points to see cells.':'Set scale to see a cell count.';return;
    }
    function tally(count){
      const series=Math.round((d.targetVolts||72)/liveConfig().nominal),parallel=Math.floor(count/series);
      $('skValue').textContent=series+'S · '+(parallel?parallel+'P available':'needs '+(series-count)+' more cells')+' · '+money(count*(d.unitPrice??5))+' to fill every position';
    }
    function fill(quick){
      if(!dialog.open)return;
      if(!quick&&!drag){
        try{validateCaseSketch({...d,points:cleanLoop(d.points),image:null,loops:[],step:null});}
        catch(e){preview.replaceChildren();$('skCapacity').textContent=e.message;return;}
      }
      const c=liveConfig(),depth=$('skDepth').valueAsNumber;
      const profile=caseProfile(d),bounds=sketchBounds(profile);
      if(Math.max(bounds.w,bounds.h)>1000){preview.replaceChildren();$('skCapacity').textContent='Check the scale. The editor supports outlines up to 1000 mm.';return;}

      const tr=sketchTransform(d),o=tr([0,0]),u=tr([1,0]),v=tr([0,1]);
      const inv=new DOMMatrix([u[0]-o[0],u[1]-o[1],v[0]-o[0],v[1]-o[1],...o]).inverse();
      const frag=document.createDocumentFragment();
      if(c.axis==='vertical'){
        c[d.endFace?'length':'width']=depth;
        const best=uprightLayouts(profile,c,d.endFace,quick)[0];
        if(best){
          const m=layout(best.config),rad=best.angle*Math.PI/180,cs=Math.cos(rad),sn=Math.sin(rad),half=c.d/2;
          const seen=new Set();
          for(let b=0;b<best.config.banks;b++)for(const cell of m.cells){
            const x=d.endFace?cell.u-m.u0+(c.holder?c.edgeU:0):cell.v-m.v0+(c.holder?c.edgeV:0);
            if(seen.has(b+'/'+x))continue;seen.add(b+'/'+x);
            const z=b*(c.len+(c.holder?2*c.lip:0)+m.axialSheet)+(c.holder?c.lip:0);
            const polygon=[[x-half,z],[x+half,z],[x+half,z+c.len],[x-half,z+c.len]].map(([u,v])=>{
              const p=inv.transformPoint(new DOMPoint(best.target[0]+u*cs-v*sn,best.target[1]+u*sn+v*cs));return p.x+','+p.y;
            });
            svg('polygon',{points:polygon.join(' '),fill:'#39877d','fill-opacity':.72,stroke:'#eafff7','stroke-width':1,'vector-effect':'non-scaling-stroke'},frag);
          }
        }
        preview.replaceChildren(frag);tally(best?.count||0);$('skCapacity').textContent=(best?.count||0)+' upright cell positions'+(d.closed?'':' · open outline estimate');return;
      }
      const best=fittedLattices(profile,c,quick)[0],cells=best?.cells||[];
      for(const cell of cells){
        const pt=inv.transformPoint(new DOMPoint(...cell.point));
        svg('circle',{cx:pt.x,cy:pt.y,r:c.d/2/d.scale,fill:'#39877d','fill-opacity':.72,stroke:'#eafff7','stroke-width':1,'vector-effect':'non-scaling-stroke'},frag);
      }
      preview.replaceChildren(frag);
      const needed=flatPackDepth(c),count=cells.length*c.banks;
      if(depth+.00001>=needed)tally(count);
      $('skCapacity').textContent=depth+.00001>=needed?
        cells.length+' visible × '+c.banks+' across = '+count+' cells'+(d.closed?'':' · open outline estimate'):
        cells.length+' positions per layer. '+c.banks+' across needs '+fmt(needed)+' mm inside; check the measured width.';
    }
    if(force){clearTimeout(quickTimer);quickTimer=0;fill(false);return;}
    if(!quickTimer)quickTimer=setTimeout(()=>{quickTimer=0;fill(true);},45);
    liveTimer=setTimeout(()=>fill(false),210);
  }
  function returnToSketch(){
    if(disposeModel){disposeModel();disposeModel=null;}
    $('skModel').hidden=true;board.removeAttribute('hidden');
    for(const id of ['skMinus','skPlus','skFit'])$(id).hidden=false;
    $('skViewTitle').textContent='Side sketch';$('skInspect').textContent='Inspect STEP in 3D';
  }
  $('skInspect').onclick=()=>{
    if(disposeModel){returnToSketch();mode(tool);paint();return;}
    if(!d.step)return;
    board.setAttribute('hidden','');$('skModel').hidden=false;
    try{disposeModel=inspectSketchStep($('skModel'),d);}catch(e){returnToSketch();message(e.message,true);return;}
    for(const id of ['skMinus','skPlus','skFit'])$(id).hidden=true;
    $('skViewTitle').textContent='Full STEP model';$('skInspect').textContent='Back to sketch';
    message('Drag to orbit the complete model. The amber plane marks the current section. Scroll to zoom.');
  };
  const blank=()=>({name:'Blank sketch',points:[],scale:1,closed:false,loops:[],autoPlace:true,endFace:false});
  const message=(text,error=false)=>{const out=$('skStatus');out.textContent=text;out.dataset.error=error;};
  const traceTool=()=>tool==='pen'||tool==='frameTrace';
  function mode(next){
    if(guided?.scaleOnly&&next!=='pan')next='scale';
    returnToSketch();arcThrough=null;hover=null;tool=next;for(const b of dialog.querySelectorAll('[data-sktool]'))b.setAttribute('aria-pressed',b.dataset.sktool===tool);
    $('skSwitch').textContent=traceTool()?'Switch to line':'Switch to freehand';
    $('skMeasure').hidden=next!=='scale'||cal.length!==2;
    message(({frameTrace:'Drag along the inside edge of the frame photo. Adjust edge offset and pull strength in Highlighter settings. Undo removes one stroke.',arc:'Pick a start, a point on the curve, then its end. An existing outline supplies the start.',rectangle:'Drag between opposite corners of the rectangle.',circle:'Drag from the center to the edge of the circle.',draw:'Click each corner. Enter or Close outline joins the last placed dot to the first. Click the mouse position first to include it as the final corner.',pen:'Drag to trace a continuous outline. Release, then close the outline.',edit:'Drag a corner to move it. Double-click an edge to insert a point. Delete removes the selected corner.',pan:'Drag to pan. Scroll to zoom around the pointer.',scale:'Click both ends of a known length in the drawing.'})[next]);
  }
  function remember(){panelDraft=panelSource=null;undo.push({...d,points:d.points.map(p=>[...p])});if(undo.length>50)undo.shift();redo=[];}
  function history(forward){panelDraft=panelSource=null;const from=forward?redo:undo,to=forward?undo:redo;if(!from.length)return;to.push(d);d=from.pop();selection=-1;cal=[];mode(d.closed?'edit':tool==='arc'?'arc':'draw');sync();paint();}
  function viewBox(v){viewport=v;board.setAttribute('viewBox',[v.x,v.y,v.w,v.h].join(' '));}
  function fit(){
    const all=[...d.points,...(d.loops||[]).flat()];
    if(d.image)all.push([0,0],[d.image.w,d.image.h]);
    if(!all.length)all.push([0,0],[320,240]);
    const b=sketchBounds(all),w=Math.max(10,b.w),h=Math.max(10,b.h);
    viewBox({x:b.lo[0]-w*.08,y:b.lo[1]-h*.08,w:w*1.16,h:h*1.16});paint();
  }
  function svg(tag,attrs,parent){
    const el=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);
    parent.append(el);return el;
  }
  // Circumcircle through start, bend and end. Choose the sweep containing the bend.
  function arcSegment(a,b,c){
    const x=b[0]-a[0],y=b[1]-a[1],u=c[0]-a[0],v=c[1]-a[1],det=2*(x*v-y*u);
    if(Math.abs(det)<1e-8*Math.max(1,Math.hypot(x,y)*Math.hypot(u,v)))return null;
    const h=(v*(x*x+y*y)-y*(u*u+v*v))/det,k=(x*(u*u+v*v)-u*(x*x+y*y))/det;
    const r=Math.hypot(h,k),start=Math.atan2(-k,-h),turn=2*Math.PI;
    const angle=(xx,yy)=>(Math.atan2(yy-k,xx-h)-start+turn)%turn;
    let sweep=angle(u,v);if(angle(x,y)>sweep)sweep-=turn;
    const tol=.1/(d.scale||1),step=2*Math.acos(Math.max(-1,1-tol/r));
    const n=Math.min(500,Math.max(2,Math.ceil(Math.abs(sweep)/Math.min(Math.PI/24,step))));
    const points=Array.from({length:n},(_,i)=>{
      const t=start+sweep*(i+1)/n;
      return i===n-1?c:[a[0]+h+r*Math.cos(t),a[1]+k+r*Math.sin(t)];
    });
    return {points,length:r*Math.abs(sweep),radius:r};
  }
  function drawGuide(){
    const g=$('skGuide');g.replaceChildren();
    const last=d.points.at(-1),a=last,b=hover;
    const px=1/(board.getScreenCTM()?.a||1);
    const unit=n=>d.scale?displayLength(n*d.scale):fmt(n)+' drawing units';
    function label(p,text){
      svg('text',{x:p[0],y:p[1]-7*px,'text-anchor':'middle','font-size':14*px,fill:'#fff',stroke:'#15202e','stroke-width':3*px,'paint-order':'stroke'},g).textContent=text;
    }
    if(arcThrough)svg('circle',{cx:arcThrough[0],cy:arcThrough[1],r:4*px,fill:'#ffc242'},g);
    if(!d.closed&&a&&b&&['draw','arc'].includes(tool)){
      const arc=tool==='arc'&&arcThrough?arcSegment(a,arcThrough,b):null;
      const points=[a,...(arc?arc.points:[b])];
      svg('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:'#ffc242','stroke-width':2*px,'stroke-dasharray':4*px},g);
      if(dimensions)label([(a[0]+b[0])/2,(a[1]+b[1])/2],arc?'Arc '+unit(arc.length)+' · R '+unit(arc.radius):unit(Math.hypot(b[0]-a[0],b[1]-a[1])));
    }
    if(dimensions&&d.points.length>1){
      const starts=d.points.length<=30?d.points.slice(0,d.closed?undefined:-1):[];
      starts.forEach((p,i)=>{const q=d.points[(i+1)%d.points.length];
        if(Math.hypot(q[0]-p[0],q[1]-p[1])/px>=45)label([(p[0]+q[0])/2,(p[1]+q[1])/2],unit(Math.hypot(q[0]-p[0],q[1]-p[1])));
      });
    }
  }
  $('skDimensions').onclick=()=>{dimensions=!dimensions;$('skDimensions').setAttribute('aria-pressed',String(dimensions));$('skDimensions').textContent='Measurements '+(dimensions?'on':'off');drawGuide();};
  function paint(){
    if(!viewport)return;
    drawGuide();
    if((!$('edgeAssist').checked&&tool!=='frameTrace')||d.closed)$('edgeMark').removeAttribute('d');
    const g=$('skDrawing');g.replaceChildren();
    const px=1/(board.getScreenCTM()?.a||1),grid=(+$('skGrid').value||10)/(d.scale||1);
    const pattern=$('skPattern');pattern.setAttribute('width',grid);pattern.setAttribute('height',grid);pattern.firstElementChild.setAttribute('d','M'+grid+' 0H0V'+grid);
    const fill=$('skGridFill');const ext=Math.max(viewport.w,viewport.h)*6;
    for(const [k,n] of Object.entries({x:viewport.x-ext,y:viewport.y-ext,width:2*ext+viewport.w,height:2*ext+viewport.h}))fill.setAttribute(k,n);
    pattern.setAttribute('patternTransform','rotate('+Number($('gridAngle').value||0)+')');
    fill.style.display=d.scale&&$('gridVisible').checked?'':'none';
    const img=$('skImage');
    if(d.image){if(img.getAttribute('href')!==d.image.url)img.setAttribute('href',d.image.url);img.setAttribute('width',d.image.w);img.setAttribute('height',d.image.h);}else img.removeAttribute('href');
    const line=(p,closed,color,width,fill='none')=>svg(closed?'polygon':'polyline',{points:p.map(v=>v.join(',')).join(' '),stroke:color,'stroke-width':width,'vector-effect':'non-scaling-stroke',fill},g);
    for(const loop of d.loops||[])line(loop,true,'#b58e52',1.2);
    if(guided?.overlay){
      const m=guided.overlay,w=m.width/d.scale,h=m.height/d.scale;
      svg('image',{href:m.preview,x:-w/2,y:-h/2,width:w,height:h,transform:'translate('+m.point.join(' ')+') rotate('+m.angle+')',opacity:.84,'pointer-events':'none'},g);
    }
    if(d.points.length)line(d.points,d.closed,'#21a88e',2.4,d.closed?'#717d792e':'none');
    const panelBox=$('panelPlanner'),panelCount=$('panelCount');
    panelBox.hidden=!d.closed||!d.scale||!!guided?.scaleOnly||!!guided?.motor;
    if(!panelBox.hidden){
      panelCount.max=Math.min(64,d.points.length+2);
      const total=panelCount.valueAsNumber;
      if(panelSource!==d.points){panelSource=d.points;panelDraft=null;}
      $('panelBreakdown').textContent=total+' total · '+(total-2)+' perimeter + 2 side plates';
      if(panelDraft)line(panelDraft,true,'#ffc74b',3).setAttribute('pointer-events','none');
    }
    if(tool==='edit'||tool==='draw')d.points.forEach(([cx,cy],i)=>svg('circle',{cx,cy,r:px*(selection===i?6:4),'data-vertex':i,fill:i===selection?'#f5ab41':'#fff',stroke:'#197d6b','stroke-width':1.5,'vector-effect':'non-scaling-stroke'},g));
    $('skValidity').textContent=(d.closed?'Outline connected. Drag a dot to adjust it.':'Connect the last dot to the first to enclose the shaded area.')+' Right-click a dot to delete it.';
    if(!drag&&!d.closed&&d.points.length>=3)line([d.points.at(-1),d.points[0]],false,'#e9bc56',1.2).setAttribute('stroke-dasharray','5 4');
    queueFill();
    if(cal.length)line(cal,false,'#db7730',2);
    for(const [i,[cx,cy]] of cal.entries()){
      svg('circle',{cx,cy,r:5*px,fill:'#e5822e'},g);
      svg('text',{x:cx+7*px,y:cy-6*px,'font-size':16*px,fill:'#fff',stroke:'#532a0a','paint-order':'stroke','stroke-width':3*px},g).textContent=i?'B':'A';
    }
    if(guided)$('skApply').title=d.scale?(d.closed?'Continue with this outline':'Close the outline to continue'):'Set scale before continuing';
    $('skUndo').disabled=!undo.length;$('skRedo').disabled=!redo.length;
    const cadScale=!!d.step||d.scaleSource==='cad';
    $('skScale').disabled=cadScale;
    $('skApply').disabled=loading;$('skSaveAB').hidden=!d.image||cal.length!==2;
    $('useMarkedScale').hidden=!practice||!d.image||!!d.scale;
    $('useDemoOutline').hidden=!practice?.outline||!d.scale||d.points.length>0;
    $('skSmooth').disabled=d.points.length<4;
    $('skPull').disabled=!d.image||d.points.length<2;
    $('skFinishLine').disabled=$('skClose').disabled=d.closed||d.points.length<3;
    $('skFewer').disabled=!d.closed||!d.scale;
    $('skScaleInfo').textContent=d.scale?(d.points.length?(()=>{const b=sketchBounds(d.points);return displayLength(b.w*d.scale,b.h*d.scale)+' · ';})():'')+(cadScale?'Scale set by CAD · millimeters':'Grid in '+(measurementUnit==='in'?'inches':'millimeters')):'Scale required before applying this outline.';
  }
  function sync(){
    $('skInspect').hidden=!d.step;$('skPlace').checked=!!d.autoPlace;$('skEndFace').checked=!!d.endFace;$('skSource').textContent=d.name;$('skStepBox').hidden=!d.step;
    $('skPlane').value=d.plane||'YZ';$('skSlice').value=d.slice||50;$('skOriginal').checked=!!d.original;$('skReverse').checked=!!d.reverse;
    $('skLoopsBox').hidden=!d.loops?.length;
    const menu=$('skLoops');menu.replaceChildren(new Option('Choose usable inside contour…',''));
    for(const [i,p] of (d.loops||[]).entries()){
      const b=sketchBounds(p),s=d.scale||1;
      menu.add(new Option('Contour '+(i+1)+' · '+fmt(b.w*s)+' × '+fmt(b.h*s)+(d.scale?' mm':' units'),i));
    }
    menu.value=String(d.selected??'');
  }
  function chooseLoop(index){
    d.selected=index;d.points=d.loops[index].map(p=>[...p]);d.closed=true;selection=-1;mode('edit');sync();paint();
    message(d.scale?'Inside contour selected. Check the usable depth before applying.':'Inside contour selected. Pick two reference points to set its scale.');
  }
  function section(){
    returnToSketch();d.plane=$('skPlane').value;d.slice=Number($('skSlice').value);
    if(!(d.slice>0&&d.slice<100))throw Error('Choose a slice between 0 and 100 percent.');
    d.loops=stepSection(d.step,d.plane,d.slice/100);if(d.reverse)d.loops=d.loops.map(loop=>loop.map(([x,y])=>[-x,y]));d.selected=null;d.points=[];d.closed=false;
    sync();fit();if(d.loops.length===1)chooseLoop(0);
    message(d.loops.length?'Choose the contour bounding the usable cavity. Check the depth across the frame.':'No closed contours at this slice. Try another plane or slice position.');
  }
  document.addEventListener('measurementchange',()=>{if(dialog.open&&d)paint();});
  const releasePdf=()=>{if(pdf){pdf.destroy();pdf=null;}$('skPageBox').hidden=true;};
  function open(options=null){
    for(const input of $('skLayers').querySelectorAll('input'))input.checked=$(input.dataset.layer).checked;
    practice=null;guided=options?.finish?options:null;dialog.returnValue="";
    $('skBattery').hidden=!!(guided?.scaleOnly||guided?.motor);
    ++revision;loading=false;releasePdf();d=caseSketch?structuredClone(caseSketch):blank();
    if(guided?.drawing)d=guided.drawing;
    else if(guided?.scaleOnly)d={...blank(),scale:null};
    if(guided?.motor&&!guided.drawing)d={...blank(),image:caseSketch?.image,scale:caseSketch?.scale||1,scaleSource:caseSketch?.scaleSource,name:'Custom motor'};
    $('skPrice').value=d.unitPrice??5;$('skVolts').value=d.targetVolts||72;
    $('sketchTitle').textContent=guided?.motor?'Motor profile':'Enclosure sketch';
    $('skOutlineTitle').textContent=guided?.motor?'2 · Draw the motor outline':'2 · Draw the enclosure outline';
    $('skApply').textContent=guided?(guided.motor?'Place motor in 3D':'Use enclosure → Add motor'):'Use case in builder';
    dialog.classList.toggle('scaleOnly',!!guided?.scaleOnly);
    if(guided?.scaleOnly){$('sketchTitle').textContent=guided.scaleOnly==='motor'?'Scale your motor photo':'Scale your frame photo';$('skApply').textContent=guided.scaleOnly==='motor'?'Use this motor':'Continue to motor';}
    else if(guided&&!guided.motor)$('skApply').textContent='Use outline → Battery';
    undo=[];redo=[];cal=[];selection=-1;drag=null;
    $('skDepth').value=current?fmt(caseSketch?.endFace?current.c.length:current.c.width):fields.width.value;
    if(guided?.motor)$('skDepth').value=100;
    else if(guided&&!caseSketch)$('skDepth').value=145;
    liveKey='';explicitAuto=!guided&&!caseSketch;preview.replaceChildren();extras.open=!!guided?.motor||!guided&&!!d.step;
    depthMeasured=!!(d.widthMeasured||caseSketch&&(!guided||d.closed));
    dialog.classList.toggle('motorSketch',!!guided?.motor);
    scaleDetails.open=!!guided?.scaleOnly||!d.scale;
    if(!guided?.scaleOnly&&!guided?.motor)syncWidths();
    else if(guided?.motor)$('skDepth').closest('label').firstChild.textContent='Motor depth (mm)';
    dialog.showModal();dialog.querySelector('.skTools').scrollTop=0;mode(d.closed?'edit':'pen');sync();fit();
  }
  $('openSketch').onclick=$('editSketch').onclick=open;
  openConversionEditor=open;
  $('skCancel').onclick=()=>dialog.close();
  dialog.onclose=()=>{clearTimeout(quickTimer);quickTimer=0;clearTimeout(liveTimer);revision++;returnToSketch();releasePdf();drag=null;const ended=guided;guided=null;ended?.finish(dialog.returnValue==='applied',d);};
  $('skImport').onclick=()=>$('skFile').click();
  $('skFile').onchange=()=>{const file=$('skFile').files[0];$('skFile').value='';if(file)loadDrawing(file);};
  openConversionPhoto=file=>{if(!dialog.open)open();return loadDrawing(file);};
  async function loadDrawing(file){
    practice=null;const token=++revision;loading=true;message('Reading '+file.name+'…');$('skApply').disabled=true;
    let newPdf=null;
    try{
      const ext=file.name.split('.').pop().toLowerCase(),next={...blank(),name:file.name};
      if(ext==='stp'||ext==='step'){
        next.step=await importStepMesh(file);next.scaleSource='cad';const spans=next.step.hi.map((v,i)=>v-next.step.lo[i]);
        next.plane=['YZ','XZ','XY'][spans.indexOf(Math.min(...spans))];next.slice=50;next.original=true;
      }else if(ext==='svg'){
        const {loops,scale,widthMm}=svgOutlines(await file.text());Object.assign(next,{loops,scale});
        if(!loops.length){next.image=await rasterPhoto(file);next.scale=widthMm?widthMm/next.image.w:null;}
        if(next.scale)next.scaleSource='cad';
      }else if(ext==='pdf'){
        newPdf=await openSketchPdf(file);next.image=await rasterPdf(newPdf,1);next.scale=null;next.page=1;
      }else{next.image=await rasterPhoto(file);next.scale=null;}
      if(token!==revision){newPdf?.destroy();return;}loading=false;
      releasePdf();pdf=newPdf;
      if(pdf){const menu=$('skPage');menu.replaceChildren();for(let i=1;i<=pdf.numPages;i++)menu.add(new Option(i,i));$('skPageBox').hidden=pdf.numPages===1;}
      d=next;cal=[];selection=-1;undo=[];redo=[];mode('pen');sync();
      if(d.step){section();return;}
      if(guided&&d.image&&!d.scale)mode('scale');
      fit();if(d.loops.length===1)chooseLoop(0);
      message(guided?.scaleOnly?'Pick two points a known distance apart, enter the distance, then continue.':d.image?(d.scale?'The drawing supplies its scale. Trace the inside opening.':'Pick two reference points, enter their measured distance, then trace the inside opening.'):'Choose an inside contour.'+(d.scale?' Physical units were read from the SVG.':' This SVG needs a known measurement.'));
    }catch(e){if(token===revision){newPdf?.destroy();loading=false;paint();message(e.message||'Could not decode this file.',true);}}
  };
  $('skPage').onchange=async()=>{
    if(!pdf)return;const token=++revision;
    try{const num=+$('skPage').value,img=await rasterPdf(pdf,num);if(token!==revision)return;remember();d={...blank(),name:d.name,image:img,page:num,scale:null};cal=[];sync();fit();mode('pen');}
    catch(e){if(token===revision)message(e.message,true);}
  };
  $('skLoops').onchange=()=>{if($('skLoops').value!==''){remember();chooseLoop(+$('skLoops').value);}};
  for(const id of ['skPlane','skSlice'])$(id).onchange=()=>{try{remember();section();}catch(e){message(e.message,true);}};
  for(const [id,key] of [['skPlace','autoPlace'],['skEndFace','endFace']])$(id).onchange=()=>{remember();d[key]=$(id).checked;paint();};
  $('skReverse').onchange=()=>{
    remember();returnToSketch();d.reverse=$('skReverse').checked;
    const flip=points=>points.map(([x,y])=>[-x,y]);
    d.points=flip(d.points);d.loops=d.loops.map(flip);cal=[];mode(d.closed?'edit':'pen');sync();fit();
  };
  $('skOriginal').onchange=()=>{remember();d.original=$('skOriginal').checked;paint();};
  function smoothingLimit(){
    const pixel=1/board.getScreenCTM().a;
    return Math.max(8*pixel,d.scale?(2*(+$('edgeOffset').value||0)+1)/d.scale:0);
  }
  function checkOutline(points){
    if(d.scale)validateCaseSketch({...d,points});
    else if(points.length<3||Math.abs(sketchArea(points))<1e-8)throw Error('Draw an area before connecting the dots.');
  }
  function applyTrace(points){
    remember();d.points=points;selection=-1;d.selected=null;
    if(d.step)d.original=false;
    sync();paint();
  }
  $('skFinishLine').onclick=()=>$('skClose').click();
  $('skClose').onclick=()=>{
    const raw=cleanLoop(d.points);
    let points=raw;
    try{
      if(d.freehandTrace){
        points=cleanLoop(smoothTrace(raw,smoothingLimit(),true));
        try{checkOutline(points);}catch{points=raw;}
      }
      checkOutline(points);
    }catch(e){message(e.message,true);$('skValidity').textContent=e.message;return;}
    remember();d.points=points;d.closed=true;mode('edit');paint();
  };
  function simplifyPath(points,tolerance){
    const keep=new Set([0,points.length-1]),ranges=[[0,points.length-1]];
    while(ranges.length){
      const [a,b]=ranges.pop();let split=-1,max=tolerance;
      for(let i=a+1;i<b;i++){
        const dist=pathDistance(points[i],points[a],points[b]);
        if(dist>max){split=i;max=dist;}
      }
      if(split>=0){keep.add(split);ranges.push([a,split],[split,b]);}
    }
    return points.filter((_,i)=>keep.has(i));
  }
  // Repeatedly retain the corner furthest from its replacement straight edge.
  function panelOutline(points,count){
    const loop=cleanLoop(points),corners=[0,loop.length];
    if(loop.length<=count)return loop;
    while(corners.length-1<count){
      let best=-1,insert=0,error=-1;
      for(let j=1;j<corners.length;j++){
        const a=corners[j-1],b=corners[j];
        for(let i=a+1;i<b;i++){
          const distance=pathDistance(loop[i],loop[a],loop[b%loop.length]);
          if(distance>error){error=distance;best=i;insert=j;}
        }
      }
      if(best<0)break;
      corners.splice(insert,0,best);
    }
    return cleanLoop(corners.slice(0,-1).map(i=>loop[i]));
  }
  function previewPanels(){
    const slider=$('panelCount'),target=slider.valueAsNumber;
    const points=panelOutline(d.points,target-2);
    try{checkOutline(points);}
    catch(e){panelDraft=null;paint();message('Try more panels. '+e.message,true);return null;}
    panelSource=d.points;panelDraft=points;paint();
    if(points.length+2!==target)$('panelBreakdown').textContent+=' · '+(points.length+2)+' needed after merging straight edges';
    return points;
  }
  $('panelCount').oninput=previewPanels;
  $('applyPanels').onclick=()=>{
    const points=previewPanels();if(!points)return;
    applyTrace(points);mode('edit');
    message('Applied '+(points.length+2)+' panels including both side plates. Undo restores the original trace.');
  };
  $('skFewer').onclick=()=>{
    const input=$('skTolerance');
    if(!input.reportValidity()||!(input.valueAsNumber>0))return;
    const before=d.points.length;
    const result=simplifyPath([...d.points,d.points[0]],input.valueAsNumber/d.scale).slice(0,-1);
    try{checkOutline(result);}catch{message('This tolerance removes too much of the outline. Try a smaller value.',true);return;}
    if(result.length===before){message('All remaining corners are needed at this tolerance.');return;}
    applyTrace(result);message(before+' sides reduced to '+result.length+'. Check the fit, or use Undo to restore the outline.');
  };
  $('skSmooth').onclick=()=>{
    const points=smoothTrace(d.points,smoothingLimit(),d.closed);
    try{if(d.closed)checkOutline(points);}catch(e){message(e.message,true);return;}
    if(points.every((p,i)=>p===d.points[i])){message('No short spikes found in this outline.');return;}
    applyTrace(points);message('Outline smoothed. Undo restores the previous dots.');
  };
  $('skPull').onclick=async()=>{
    if(!d.image||d.points.length<2)return;
    if(!$('skLayers').querySelector('[data-layer="showFrame"]').checked){message('Show the frame reference in Drawing layers first.',true);return;}
    const draft=d,original=d.points,rev=revision;
    const ready=await edge.prepare(d.image);
    if(d!==draft||original!==d.points||rev!==revision||!dialog.open)return;
    if(!ready){message('Could not read the frame image.',true);return;}
    const zoom=board.getScreenCTM().a,track={},points=[];
    let length=0,moved=false;
    const segments=d.closed?original.length:original.length-1;
    for(let i=0;i<segments;i++){const a=original[i],b=original[(i+1)%original.length];length+=Math.hypot(b[0]-a[0],b[1]-a[1]);}
    const spacing=Math.max(8/zoom,length/Math.max(1,1500-original.length));
    for(let i=0;i<original.length;i++){
      const a=original[i],b=original[(i+1)%original.length];
      const n=i<segments?Math.max(1,Math.floor(Math.hypot(b[0]-a[0],b[1]-a[1])/spacing)):1;
      for(let j=0;j<n;j++){
        const p=[a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n];
        const q=edge.pull(p,d,zoom,track,true);
        if(Math.hypot(q[0]-p[0],q[1]-p[1])*zoom>.05)moved=true;
        points.push(q);
      }
    }
    if(!moved){message('No nearby edge pulled the trace. Check pull strength or draw closer to the frame.');return;}
    const smooth=smoothTrace(points,smoothingLimit(),d.closed);
    const result=d.closed?cleanLoop(smooth,.15/zoom):smooth;
    try{if(d.closed)checkOutline(result);}catch(e){message('Pull could not be applied. '+e.message,true);return;}
    applyTrace(result);message('Pulled the outline toward nearby edges. Undo restores your hand sketch.');
  };
  $('skClear').onclick=()=>{remember();d.freehandTrace=false;d.points=[];d.selected=null;d.closed=false;selection=-1;cal=[];mode('pen');sync();paint();};
  $('skScale').onclick=()=>{cal=[];mode('scale');paint();};
  setSketchPractice=spec=>{practice=spec;$('useMarkedScale').textContent='Use marked '+spec.mm+' mm distance';paint();};
  const practicePoint=([x,y])=>[x*d.image.w/practice.width,y*d.image.h/practice.height];
  $('useMarkedScale').onclick=()=>{cal=practice.anchors.map(practicePoint);$('skDistance').value=practice.mm;$('skSetScale').click();};
  $('useDemoOutline').onclick=()=>{remember();d.points=practice.outline.map(practicePoint);$('skClose').disabled=false;$('skClose').click();};
  $('skSetScale').onclick=()=>{
    const real=+$('skDistance').value,dist=cal.length===2?Math.hypot(cal[0][0]-cal[1][0],cal[0][1]-cal[1][1]):0;
    if(!(real>0&&dist>.000001)){message('Pick two different points and enter a positive measured length.',true);return;}
    remember();d.scale=real/dist;if(d.step)d.original=false;cal=[];mode(d.closed?'edit':'pen');sync();paint();message(guided?.scaleOnly?(guided.scaleOnly==='frame'?'Frame scaled. Continue to Motor to place the sprocket before tracing the enclosure.':'Motor photo scaled. Select Use this motor.'):'Scale set. '+(d.closed?'Check the depth and apply the enclosure.':'Trace the usable inside opening.'));
  };
  for(const b of dialog.querySelectorAll('[data-sktool]'))b.onclick=()=>{
    if(b.dataset.sktool==='frameTrace'){
      if(!d.image){message('Load a frame photo to use auto-pull.',true);return;}
      if(!$('skLayers').querySelector('[data-layer="showFrame"]').checked){message('Show the frame in Drawing layers to use auto-pull.',true);return;}
      if(d.closed){message('Use Auto-pull to frame beside Smooth outline to adjust a closed outline.',true);return;}
      edge.prepare(d.image);
    }
    cal=[];mode(b.dataset.sktool);paint();
  };
  $('skUndo').onclick=()=>history(false);$('skRedo').onclick=()=>history(true);$('skGrid').oninput=paint;
  function point(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(board.getScreenCTM().inverse());return [p.x,p.y];}
  const edge=frameEdgeAssist();
  board.onpointerleave=()=>{edge.clear();hover=null;drawGuide();};
  function assist(p,track){return edge.pull(p,d,board.getScreenCTM().a,track,false,tool==='frameTrace');}
  const rotateXY=([x,y],angle)=>[x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle)];
  function gridPoint(p){
    if(!$('skSnap').checked||!d.scale)return p;
    const step=(+$('skGrid').value||10)/d.scale,angle=Number($('gridAngle').value)*Math.PI/180;
    return rotateXY(rotateXY(p,-angle).map(n=>Math.round(n/step)*step),angle);
  }
  function snapped(p,e){
    if(tool==='draw'||traceTool())p=assist(p);
    p=gridPoint(p);
    if(!d.points.length||tool!=='draw')return p;
    const last=d.points.at(-1),prev=d.points.at(-2),dx=p[0]-last[0],dy=p[1]-last[1];
    const angle=Math.atan2(dy,dx),grid=Number($('gridAngle').value)*Math.PI/180,quarter=Math.PI/2;
    const axis=$('skAxis').value;
    let heading=grid+Math.round((angle-grid)/quarter)*quarter;
    if(axis!=='free')heading=grid+(axis==='y'?quarter:0);
    else if(!e.shiftKey){
      if(!$('orthoSnap').checked)return p;
      if(prev){
        const normal=Math.atan2(last[1]-prev[1],last[0]-prev[0])+quarter;
        const perpendicular=normal+Math.round((angle-normal)/Math.PI)*Math.PI;
        if(Math.abs(perpendicular-angle)<Math.abs(heading-angle))heading=perpendicular;
      }
      if(Math.abs(heading-angle)>5*Math.PI/180)return p;
    }
    const ux=Math.cos(heading),uy=Math.sin(heading),along=dx*ux+dy*uy;
    return [last[0]+along*ux,last[1]+along*uy];
  }
  for(const id of ['gridAngle','gridVisible','skSnap','orthoSnap'])$(id).oninput=paint;
  for(const button of dialog.querySelectorAll('[data-grid-mm]'))button.onclick=()=>{$('skGrid').value=button.dataset.gridMm;paint();};
  function addLine(q){
    const points=d.points,last=points.at(-1),prev=points.at(-2),epsilon=.00001;
    if(last){
      let conflict=Math.hypot(last[0]-q[0],last[1]-q[1])<epsilon;
      if(prev)conflict ||= pathDistance(q,prev,last)<epsilon||pathDistance(prev,last,q)<epsilon;
      for(let i=0;!conflict&&i<points.length-2;i++){
        const a=points[i],b=points[i+1];
        conflict=segmentsCross(a,b,last,q)||pathDistance(q,a,b)<epsilon||pathDistance(a,last,q)<epsilon||pathDistance(b,last,q)<epsilon;
      }
      if(conflict){message('This line crosses or overlaps the outline. Pick another endpoint or undo the previous line.',true);return;}
    }
    remember();d.selected=null;points.push(q);hover=null;paint();
  }
  $('skAxis').onchange=()=>{mode('draw');paint();};
  function addStrokePoint(p){
    p=gridPoint(p);const last=d.points.at(-1);
    if(d.points.length<1500&&Math.hypot(p[0]-last[0],p[1]-last[1])>1e-6)d.points.push(p);
  }
  function sampleStroke(p){
    const prev=drag.previous,dx=p[0]-prev[0],dy=p[1]-prev[1],length=Math.hypot(dx,dy);
    let distance=drag.remaining;
    while(distance<=length&&d.points.length<1500){
      addStrokePoint([prev[0]+dx*distance/length,prev[1]+dy*distance/length]);distance+=drag.spacing;
    }
    drag.remaining=distance-length;drag.previous=p;
  }
  board.onpointerdown=e=>{
    if(!e.isPrimary||drag||(e.button===0&&e.ctrlKey)||e.button!==0&&e.button!==1)return;e.preventDefault();board.focus({preventScroll:true});board.setPointerCapture(e.pointerId);
    const p=point(e),idx=e.target.dataset.vertex;
    if(tool==='pan'||e.button===1){drag={pan:true,x:e.clientX,y:e.clientY,start:{...viewport},scale:board.getScreenCTM().a};return;}
    if(tool==='scale'){
      if(cal.length===2)cal=[];
      let anchor=p,nearest=7/board.getScreenCTM().a;
      for(const loop of [d.points,...(d.loops||[])])for(const vertex of loop){
        const distance=Math.hypot(vertex[0]-p[0],vertex[1]-p[1]);
        if(distance<nearest){nearest=distance;anchor=vertex;}
      }
      cal.push([...anchor]);if(cal.length===2){$('skMeasure').hidden=false;$('skDistance').focus();message('Enter the real distance between the two orange points.');}else message('Now click the other end of the measured length.');
    }else if(tool==='edit'){
      selection=idx===undefined?-1:Number(idx);if(selection>=0){drag={vertex:selection,priorRedo:redo};remember();}
    }else if(tool==='rectangle'||tool==='circle'){
      drag={shape:tool,start:snapped(p,e),priorRedo:redo};remember();d.freehandTrace=false;d.selected=null;d.closed=false;d.points=[];
    }else if(tool==='arc'&&!d.closed){
      const q=snapped(p,e);
      if(!d.points.length){remember();d.points=[q];message('Pick a point on the curve.');}
      else if(!arcThrough){arcThrough=q;message('Pick the end of the arc.');}
      else{
        const arc=arcSegment(d.points.at(-1),arcThrough,q);
        if(!arc){message('Move the end so the three points form a curve.',true);return;}
        if(d.points.length+arc.points.length>1500){message('Outline point limit reached.',true);return;}
        remember();d.points.push(...arc.points);d.freehandTrace=false;arcThrough=null;message('Arc added. Pick another bend or switch to Line.');
      }
      hover=null;
    }else if(!d.closed){
      if(tool==='draw'&&d.points.length>=3&&Math.hypot(p[0]-d.points[0][0],p[1]-d.points[0][1])*board.getScreenCTM().a<9){$('skClose').click();return;}
      if(tool==='draw'&&e.pointerType==='touch'&&d.points.length){drag={line:true};hover=snapped(p,e);drawGuide();return;}
      if(tool==='draw'){addLine(snapped(p,e));return;}
      if(tool==='pen'&&d.scale&&(!$('skDotStep').reportValidity()||!($('skDotStep').valueAsNumber>0)))return;
      if(d.points.length>=1500){message('Outline point limit reached. Increase dot spacing for a longer trace.',true);return;}
      const priorRedo=redo;remember();d.selected=null;hover=null;d.points=[...d.points,snapped(p,e)];if(traceTool())d.freehandTrace=true;if(traceTool())drag={pen:true,priorRedo,startIndex:d.points.length-1,matrix:board.getScreenCTM().inverse()};
      if(tool==='pen'&&d.scale){
        drag.spacing=$('skDotStep').valueAsNumber/d.scale;drag.remaining=drag.spacing;drag.previous=assist(p);d.freehandTrace=false;
      }
    }else message('Use Edit points to change this outline, or Clear outline to start a new trace.');
    paint();
  };
  board.onpointermove=e=>{
    if(!drag||drag.line){
      if(!d.closed&&(tool==='arc'||tool==='draw')){hover=snapped(point(e),e);drawGuide();}
      else if(traceTool())assist(point(e));else edge.clear();
      return;
    }
    if(!e.isPrimary)return;
    if(drag.pan)viewBox({...drag.start,x:drag.start.x-(e.clientX-drag.x)/drag.scale,y:drag.start.y-(e.clientY-drag.y)/drag.scale});
    else if(drag.shape){
      const [x,y]=drag.start,[u,v]=snapped(point(e),e);
      if(drag.shape==='rectangle')d.points=[[x,y],[u,y],[u,v],[x,v]];
      else{const r=Math.hypot(u-x,v-y);d.points=Array.from({length:64},(_,i)=>[x+r*Math.cos(i*Math.PI/32),y+r*Math.sin(i*Math.PI/32)]);}
    }else if(drag.pen){
      const pos=new DOMPoint(e.clientX,e.clientY).matrixTransform(drag.matrix),p=assist([pos.x,pos.y],drag),last=d.points.at(-1);
      if(drag.spacing)sampleStroke(p);
      else if(d.points.length<1500&&Math.hypot(p[0]-last[0],p[1]-last[1])*board.getScreenCTM().a>5)addStrokePoint(p);
    }else{d.points[drag.vertex]=snapped(point(e),e);d.selected=null;}
    paint();
  };
  board.onpointerup=e=>{if(!e.isPrimary)return;
    if(drag?.line){drag=null;hover=null;addLine(snapped(point(e),e));drawGuide();return;}
    if(drag?.spacing){
      const end=assist(point(e),drag);sampleStroke(end);addStrokePoint(end);paint();
      if(d.points.length>=1500)message('Point limit reached. Undo and increase dot spacing for a longer trace.',true);
    }else if(drag?.pen){
      const start=drag.startIndex;
      d.points=d.points.slice(0,start).concat(simplifyPath(d.points.slice(start),1.4*drag.matrix.a));paint();
    }
    const wasDrawing=drag&&!drag.pan;if(drag?.shape&&d.points.length>=3&&Math.abs(sketchArea(d.points))>1e-8){d.closed=true;mode('edit');paint();}drag=null;if(wasDrawing){liveKey='';queueFill();}};
  board.onpointercancel=()=>{if(drag?.shape)history(false);drag=null;};
  function deleteVertex(index){
    remember();
    d.points.splice(index,1);
    if(d.points.length<3)d.closed=false;
    if(d.step)d.original=false;
    selection=-1;d.selected=null;paint();
  }
  board.oncontextmenu=e=>{
    const index=e.target.dataset.vertex;
    if(index===undefined||drag)return;
    e.preventDefault();deleteVertex(Number(index));
  };
  board.ondblclick=e=>{
    if(tool!=='edit'||!d.closed||e.target.dataset.vertex!==undefined)return;
    const p=point(e),dist=d.points.map((a,i)=>pathDistance(p,a,d.points[(i+1)%d.points.length])),near=Math.min(...dist);
    if(near*board.getScreenCTM().a>15)return;remember();selection=dist.indexOf(near)+1;d.points.splice(selection,0,p);d.selected=null;paint();
  };
  function zoom(f,p){
    const v=viewport;if(v.w*f<.0001||v.w*f>1e8)return;
    p=p||[v.x+v.w/2,v.y+v.h/2];viewBox({x:p[0]+(v.x-p[0])*f,y:p[1]+(v.y-p[1])*f,w:v.w*f,h:v.h*f});paint();
  }
  board.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.12:1/1.12,point(e));},{passive:false});
  const expand=$('skExpand');
  function expandDrawing(on){
    dialog.classList.toggle('expandedSketch',on);
    expand.textContent=on?'Exit full screen':'Full screen';
    expand.setAttribute('aria-pressed',String(on));
    if(dialog.open)requestAnimationFrame(()=>{if(dialog.open&&!disposeModel)paint();});
  }
  expand.onclick=()=>expandDrawing(!dialog.classList.contains('expandedSketch'));
  function cancelCommand(event){
    event.preventDefault();
    if(drag&&!drag.pan&&!drag.line){d=undo.pop()||d;redo=drag.priorRedo;sync();}
    if(drag?.pan)viewBox(drag.start);
    drag=null;cal=[];selection=-1;mode('edit');paint();
    message('Command canceled. Choose Line to continue the outline.');
  }
  dialog.addEventListener('cancel',cancelCommand);
  dialog.addEventListener('close',()=>expandDrawing(false));
  $('skFit').onclick=fit;$('skPlus').onclick=()=>zoom(.8);$('skMinus').onclick=()=>zoom(1.25);
  dialog.onkeydown=e=>{
    e.stopPropagation();if(e.key==='Escape'){cancelCommand(e);return;}
    if(e.target.matches('input,select'))return;
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(e.shiftKey);}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();history(true);}
    else if(e.key==='Enter'&&!e.target.closest('button')&&!d.closed&&d.points.length>=3)$('skClose').click();
    else if(['Delete','Backspace'].includes(e.key)&&selection>=0){e.preventDefault();deleteVertex(selection);}
  };
  $('dismissCal').onclick=()=>$('scalePrompt').close();
  $('startCal').onclick=()=>{$('scalePrompt').close();scaleDetails.open=true;mode('scale');paint();if(cal.length===2)$('skDistance').focus();else board.focus();};
  $('copySeller').onclick=async()=>{
    try{await navigator.clipboard.writeText($('sellerText').value);message('Seller request copied.');}
    catch{$('sellerText').focus();$('sellerText').select();message('Press Copy to copy the selected seller request.');}
  };
  $('skSaveAB').onclick=async()=>{
    if(!d.image||cal.length!==2)return;
    try{
      const ref=d.image,points=cal.map(p=>[...p]),img=new Image();img.src=ref.url;await img.decode();
      const cv=document.createElement('canvas');cv.width=ref.w;cv.height=ref.h;
      const ctx=cv.getContext('2d'),r=Math.max(5,Math.max(ref.w,ref.h)*.007);ctx.drawImage(img,0,0);
      ctx.strokeStyle='#ff8c15';ctx.lineWidth=Math.max(2,r/3);ctx.beginPath();ctx.moveTo(...points[0]);ctx.lineTo(...points[1]);ctx.stroke();
      points.forEach(([x,y],i)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.font='bold '+r*3+'px sans-serif';ctx.fillStyle='#fff';ctx.strokeStyle='#292119';const tx=Math.min(cv.width-r*3,Math.max(0,x+r)),ty=Math.max(3*r,y-r);ctx.strokeText(i?'B':'A',tx,ty);ctx.fillText(i?'B':'A',tx,ty);ctx.strokeStyle='#ff8c15';});
      cv.toBlob(blob=>{if(blob)saveBlob('frame-measurement-A-B.png',blob,'image/png');});
    }catch(e){message(e.message,true);}
  };
  $('skBattery').onclick=()=>applySketch(true);
  $('skApply').onclick=()=>applySketch(false);
  function applySketch(battery){
    if(!d.scale){$('scalePrompt').showModal();return;}
    if(guided?.scaleOnly){if(!d.image){message('Choose a readable side photo first.',true);return;}dialog.close('applied');return;}
    if(!d.closed){
      $('outlinePromptText').textContent=d.points.length>=3?'Connect the last dot to the first to finish this area.':'Draw at least three points, then connect the last dot to the first.';
      $('connectOutline').hidden=d.points.length<3;$('outlinePrompt').showModal();return;
    }
    try{
      validateCaseSketch(d);
      const depth=+$('skDepth').value;if(!(depth>=10&&depth<=1000))throw Error('Enter a usable inside depth between 10 and 1000 mm.');
      if(guided?.motor){guided.makeMotor(d,depth);dialog.close('applied');return;}
      const bounds=sketchBounds(caseProfile(d));
      const l=bounds.w,h=bounds.h;
      const previous=caseSketch;
      caseSketch=d;try{fixedCaseMesh({length:d.endFace?depth:l,width:d.endFace?l:depth,base:+fields.base.value,wall:+fields.wall.value},{profile:caseProfile(d)});}catch(e){caseSketch=previous;throw e;}
      let fitted;
      if(explicitAuto&&!guided&&!battery){
        try{
          const cfg=sketchPackConfig(d,{...read(),length:d.endFace?depth:l,width:d.endFace?l:depth,high:h,low:h},d.flatBanks);
          fitted=buildContourPack(cfg,caseProfile(d));
          if(!fitted)throw Error('No cells cleared the enclosure at these settings.');
        }catch(error){caseSketch=previous;throw error;}
      }
      corners=[];endLift=[0,0];fields.mode.value='inner';fields.length.value=d.endFace?depth:l.toFixed(6);fields.high.value=fields.low.value=h.toFixed(6);fields.width.value=d.endFace?l.toFixed(6):depth;if(d.endFace&&(!previous||!previous.endFace))fields.axis.value='flat';
      if(guided||explicitAuto||battery)fields.banks.value=d.flatBanks||2;
      if(fitted){apply(fitted.c);placements=fitted.pose;omitted.clear();fitted.skip.forEach(id=>omitted.add(id));reversedCells.clear();}
      render();
      if(battery)dialog.addEventListener('close',()=>document.dispatchEvent(new Event('sketchbatterybuild')),{once:true});
      dialog.close('applied');
    }catch(e){
      message(e.message,true);$('outlinePromptText').textContent=e.message;
      $('connectOutline').hidden=true;$('outlinePrompt').showModal();
    }
  };
  $('removeSketch').onclick=()=>{caseSketch=null;render();};
}
