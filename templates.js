// Vector outlines use millimeters throughout, including overlap and registration marks.
function cardboardPanels(c,s,choice){
  const rect=(w,h)=>[[0,0],[w,0],[w,h],[0,h]];
  let outline,depth;
  if(s.profile){
    outline=outsideSketchContour(s.profile,c.wall);
    depth=(caseSketch.endFace?c.length:c.width)+[0,1].filter(i=>casePanelMode(c,i,true)==='attached').length*c.base;
  }else{
    outline=[[-s.tx,-s.floor],[c.length+s.tx,-s.floor],[c.length+s.tx,c.low],...s.roof.slice().reverse(),[-s.tx,c.high]];
    depth=c.width+[0,1].filter(i=>casePanelMode(c,i,false)==='attached').length*s.ty;
  }
  // Combine collinear roof segments so a straight wall gets a single strip.
  outline=cleanLoop(outline).filter((p,i,a)=>{
    const u=a[(i+a.length-1)%a.length],v=a[(i+1)%a.length];
    return Math.abs((p[0]-u[0])*(v[1]-p[1])-(p[1]-u[1])*(v[0]-p[0]))>1e-6;
  });
  const b=sketchBounds(outline),profile=outline.map(([x,z])=>[x-b.lo[0],b.h-(z-b.lo[1])]);
  const title=s.profile&&caseSketch.endFace?'End profile':'Side profile';
  if(choice==='top')return [{name:'Top footprint',points:rect(s.profile&&caseSketch.endFace?depth:b.w,s.profile&&caseSketch.endFace?b.w:depth)}];
  const panels=[{name:title+' A',points:profile,edges:true}];
  if(choice==='all'){
    panels.length=0;
    for(const side of [0,1])if(casePanelMode(c,side,s.profile)!=='open')panels.push({name:casePanelNames()[side]+' panel',points:profile,edges:true});
    profile.forEach((p,i)=>{
      const q=profile[(i+1)%profile.length],span=Math.hypot(p[0]-q[0],p[1]-q[1]);
      panels.push({name:'Edge '+(i+1)+' strip',points:rect(span,depth)});
    });
  }
  return panels;
}
function cardboardPDF(model,choice,paper){
  const [w,h]=paper==='a4'?[210,297]:[215.9,279.4],left=14,top=32,bottom=31;
  const winW=w-2*left,winH=h-top-bottom,overlap=10,dx=winW-overlap,dy=winH-overlap;
  const panels=cardboardPanels(model.c,model.shell,choice),pages=[],maps=[];
  // Cover shows the first panel at a readable scale. Additional maps precede all cutting sheets.
  const guideCount=1+Math.ceil((panels.length-1)/6);
  const px=72/25.4,num=n=>Number(n.toFixed(4)),esc=s=>s.replace(/[\\()]/g,'\\$&');
  for(const panel of panels){
    const b=sketchBounds(panel.points);
    const cols=Math.max(1,Math.ceil((b.w+4-overlap)/dx)),rows=Math.max(1,Math.ceil((b.h+4-overlap)/dy));
    const first=guideCount+pages.length+1;maps.push({panel,cols,rows,first});
    const labels=[];
    if(panel.edges)panel.points.forEach((p,i)=>{
      const q=panel.points[(i+1)%panel.points.length],x=(p[0]+q[0])/2,y=(p[1]+q[1])/2;
      const labelX=Math.max(2,Math.min(b.w-7,x+2));
      let labelY=Math.max(4,Math.min(b.h-1,y+4));
      while(labels.some(l=>Math.abs(l.labelX-labelX)<9&&Math.abs(l.labelY-labelY)<4))labelY+=4;
      labels.push({x,y,labelX,labelY});
    });
    if(first+cols*rows>1601)throw Error('Too many pages. Choose a single profile or the top footprint.');
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const lines=[],xy=(x,y)=>num(x*px)+' '+num((h-y)*px);
      const txt=(x,y,size,str)=>lines.push('BT /F1 '+size+' Tf '+xy(x,y)+' Td ('+esc(str)+') Tj ET');
      const line=(x,y,X,Y)=>lines.push(xy(x,y)+' m '+xy(X,Y)+' l S');
      const id=(r,k)=>first+r*cols+k,tx=left+2-col*dx,ty=top+2-row*dy;
      txt(left,12,14,'Electric Moto Garage   /   '+panel.name);
      txt(left,18,9,'Page '+id(row,col)+'   |   Row '+(row+1)+' of '+rows+'   |   Column '+(col+1)+' of '+cols);
      const neighbors=[[col>0,'left',row,col-1],[col+1<cols,'right',row,col+1],[row>0,'above',row-1,col],[row+1<rows,'below',row+1,col]];
      const join=neighbors.filter(n=>n[0]).map(([,dir,r,k])=>dir+' = page '+id(r,k)).join('   /   ');
      txt(left,24,8,join?'Tape neighbors: '+join:'Single sheet for this panel');
      lines.push('q '+xy(left,h-bottom)+' '+num(winW*px)+' '+num(winH*px)+' re W n','0.7 w');
      const pts=panel.points;
      lines.push(pts.map(([x,y],i)=>xy(tx+x,ty+y)+(i?' l':' m')).join(' ')+' h S');
      labels.forEach(({x,y,labelX,labelY},i)=>{
        lines.push('0.6 G 0.3 w');line(tx+x,ty+y,tx+labelX,ty+labelY-1);
        lines.push('0 G');txt(tx+labelX,ty+labelY,7,'E'+(i+1));
      });
      lines.push('0.55 G 0.45 w');
      function cross(x,y){line(x-2,y,x+2,y);line(x,y-2,x,y+2);}
      // Matching crosses appear in the same position on both sides of each seam.
      for(const x of [col>0?left+5:null,col+1<cols?left+winW-5:null])if(x!==null)for(const f of [.22,.78])cross(x,top+winH*f);
      for(const y of [row>0?top+5:null,row+1<rows?top+winH-5:null])if(y!==null)for(const f of [.22,.78])cross(left+winW*f,y);
      lines.push('Q','0.65 G [2 3] 0 d 0.3 w '+xy(left,h-bottom)+' '+num(winW*px)+' '+num(winH*px)+' re S','[] 0 d 0 G 0.7 w');
      txt(left,h-25,8,'Print at Actual size / 100%. Trim one dashed margin and match crosses in the 10 mm overlap.');
      txt(left,h-20,8,choice==='all'?'Tape tiles first. Cut solid outlines. Tape each strip to the matching E number on both profiles.':'Tape tiles first. Cut the solid outline, trace onto cardboard and check it against the bike.');
      txt(left,h-15,8,model.shell.profile&&caseSketch.original?'Section-based cardboard mock-up. The STEP body can vary through its depth.':'Outside dimensions. Allow for cardboard thickness at the joints. Check a second length on the bike.');
      line(left,h-9,left+100,h-9);for(const x of [left,left+100])line(x,h-11,x,h-7);
      txt(left+104,h-8,8,'Measure 100 mm before cutting.');
      pages.push(lines.join('\n')+'\n');
    }
  }
  const guides=[];
  const sceneCanvas=document.querySelector('#scene canvas');
  const jpeg=sceneCanvas&&orbitView?orbitView.image('image/jpeg',true).split(',')[1]:null;
  for(let page=0;page<guideCount;page++){
    const cmds=[],xy=(x,y)=>num(x*px)+' '+num((h-y)*px);
    const text=(x,y,size,str)=>cmds.push('BT /F1 '+size+' Tf '+xy(x,y)+' Td ('+esc(str)+') Tj ET');
    text(14,17,19,page?'Panel tape maps':'motoPack  /  Project and tape map');
    text(14,24,9,'Guide '+(page+1)+' of '+guideCount+'  |  '+(paper==='a4'?'A4':'US Letter')+'  |  Cutting sheets begin on page '+(guideCount+1)+'.');
    if(!page){
      text(14,33,10,model.c.series+'S battery   /   '+model.m.count+' cell positions   /   '+model.c.banks+' banks');
      if(jpeg){
        const scale=Math.min((w-28)/sceneCanvas.width,74/sceneCanvas.height);
        const W=sceneCanvas.width*scale,H=sceneCanvas.height*scale;
        cmds.push('q '+num(W*px)+' 0 0 '+num(H*px)+' '+xy((w-W)/2,38+H)+' cm /Build Do Q');
      }
      text(14,121,11,'Print all cutting sheets at Actual size (100%). Measure the 100 mm check line.');
      text(14,128,10,'Lay sheets in the order shown. Trim one dashed margin, overlap matching crosses and tape.');
      text(14,135,10,'Cut the solid outline. Match edge numbers when taping the cardboard panels together.');
    }
    const selected=page?maps.slice(1+(page-1)*6,1+page*6):maps.slice(0,1);
    selected.forEach(({panel,cols,rows,first},i)=>{
      const left=14+(page?i%2*(w-25)/2:0),top=page?39+Math.floor(i/2)*(h-48)/3:150;
      const sc=Math.min((page?(w-39)/2:w-28)/(cols*dx+overlap),(page?(h-75)/3:h-166)/(rows*dy+overlap));
      text(left,top-3,10,panel.name+'  /  '+cols+' x '+rows+' sheets');
      cmds.push('0.73 G 0.5 w');
      for(let r=0;r<rows;r++)for(let k=0;k<cols;k++){
        const x=left+k*dx*sc,y=top+r*dy*sc;
        cmds.push(xy(x,y+winH*sc)+' '+num(winW*sc*px)+' '+num(winH*sc*px)+' re S');
      }
      cmds.push('0.1 G 1.2 w '+panel.points.map(([x,y],j)=>xy(left+(2+x)*sc,top+(2+y)*sc)+(j?' l':' m')).join(' ')+' h S');
      for(let r=0;r<rows;r++)for(let k=0;k<cols;k++)text(left+(k*dx+winW*.42)*sc,top+(r*dy+winH*.51)*sc,9,String(first+r*cols+k));
    });
    guides.push(cmds.join('\n')+'\n');
  }
  pages.unshift(...guides);
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(4+i*2)+' 0 R').join(' ')+'] >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  pages.forEach((data,i)=>objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+num(w*px)+' '+num(h*px)+'] /Resources << /Font << /F1 3 0 R >> '+(jpeg&&i===0?'/XObject << /Build '+(4+pages.length*2)+' 0 R >>':'')+' >> /Contents '+(5+i*2)+' 0 R >>','<< /Length '+data.length+' >>\nstream\n'+data+'endstream'));
  if(jpeg){
    const hex=Array.from(atob(jpeg),v=>v.charCodeAt(0).toString(16).padStart(2,'0')).join('')+'>';
    objects.push('<< /Type /XObject /Subtype /Image /Width '+sceneCanvas.width+' /Height '+sceneCanvas.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length '+hex.length+' >>\nstream\n'+hex+'\nendstream');
  }
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';});
  const xref=pdf.length;pdf+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  return new Blob([pdf],{type:'application/pdf'});
}
