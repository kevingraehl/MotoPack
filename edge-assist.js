// Sample the reference alone, so overlay cells and earlier strokes cannot attract the pen.
function frameEdgeAssist(){
  let source=null,raster=null,ready=null;
  const mark=$('edgeMark'),clear=()=>mark.removeAttribute('d');
  $('edgeAssist').onchange=clear;
  function load(ref){
    source=ref.url;raster=null;
    const image=new Image();
    ready=new Promise(resolve=>{
      image.onerror=()=>resolve(false);
      image.onload=()=>{
        if(source!==ref.url){resolve(false);return;}
        const scale=Math.min(1,1400/Math.max(ref.w,ref.h)),canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(ref.w*scale));canvas.height=Math.max(1,Math.round(ref.h*scale));
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
        try{
          const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
          const gray=new Uint8Array(canvas.width*canvas.height);
          for(let i=0;i<gray.length;i++)gray[i]=(pixels[4*i]*3+pixels[4*i+1]*6+pixels[4*i+2])/10;
          raster={gray,w:canvas.width,h:canvas.height,scale};
        }catch{clear();}
        resolve(!!raster);
      };
      image.src=ref.url;
    });
  }
  function pull(p,d,zoom,track=null,batch=false){
    clear();
    if(!d.image||!batch&&!$('edgeAssist').checked||!$('skLayers').querySelector('[data-layer="showFrame"]').checked)return p;
    if(source!==d.image.url)load(d.image);
    if(!raster)return p;
    const {gray,w,h,scale}=raster,x=p[0]*scale,y=p[1]*scale;
    const offset=d.scale?Math.min(50,Math.max(0,+$('edgeOffset').value))/d.scale*scale:0;
    const reach=Math.min(60,Math.max(3,12*scale/zoom+offset));
    let best=null,score=Infinity;
    for(let j=Math.max(1,Math.floor(y-reach));j<=Math.min(h-2,y+reach);j++)for(let i=Math.max(1,Math.floor(x-reach));i<=Math.min(w-2,x+reach);i++){
      const n=j*w+i,gx=gray[n+1]-gray[n-1],gy=gray[n+w]-gray[n-w],gradient=Math.hypot(gx,gy);
      const dist=Math.hypot(i-x,j-y);
      if(gradient<38||dist>reach)continue;
      const cost=dist+3*(1-Math.min(gradient,200)/200);
      if(cost<score){score=cost;best={i,j,nx:gx/gradient,ny:gy/gradient};}
    }
    if(!best){if(track)track.normal=null;return p;}
    const {i,j,nx,ny}=best;
    let side=(x-i)*nx+(y-j)*ny<0?-1:1;
    if(track){
      const previous=track.normal;
      if(previous&&Math.hypot(i-previous.i,j-previous.j)<reach*2){
        const dot=nx*previous.x+ny*previous.y;
        if(Math.abs(dot)>.65)side=Math.sign(dot);
      }
      track.normal={i,j,x:nx*side,y:ny*side};
    }
    const a=i/scale,b=j/scale,t=8/zoom;
    if(!batch)mark.setAttribute('d','M'+(a-ny*t)+' '+(b+nx*t)+'L'+(a+ny*t)+' '+(b-nx*t));
    const strength=(+$('edgeStrength').value/100)*Math.max(0,1-score/reach);
    return [p[0]+((i+nx*side*offset)/scale-p[0])*strength,p[1]+((j+ny*side*offset)/scale-p[1])*strength];
  }
  async function prepare(ref){
    if(source!==ref.url)load(ref);
    return await ready&&source===ref.url;
  }
  return {pull,clear,prepare};
}

// Short reversals are characteristic of an edge pull jumping to the opposite side.
// Use neighboring samples only at these reversals; long corners keep their vertices.
function smoothTrace(points,limit,closed){
  let ring=points.slice();
  for(let pass=0;pass<4&&ring.length>3;pass++){
    let changed=false;
    const next=ring.map((p,i)=>{
      if(!closed&&(i===0||i===ring.length-1))return p;
      const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length];
      const ax=p[0]-a[0],ay=p[1]-a[1],bx=b[0]-p[0],by=b[1]-p[1];
      const l=Math.hypot(ax,ay),r=Math.hypot(bx,by);
      if(!l||!r||Math.min(l,r)>limit||ax*bx+ay*by>-.25*l*r)return p;
      changed=true;
      // Interpolate by arc length to avoid dragging a spike toward a distant vertex.
      return [p[0]+.75*(a[0]+(b[0]-a[0])*l/(l+r)-p[0]),p[1]+.75*(a[1]+(b[1]-a[1])*l/(l+r)-p[1])];
    });
    ring=next;if(!changed)break;
  }
  return ring;
}
