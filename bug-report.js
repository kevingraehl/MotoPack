(function(){
  const dialog=$('bugDialog'),form=$('bugForm'),preview=$('bugPreview'),note=$('bugCaptureState'),result=$('bugResult');
  let view='',pending=false,sending=false,revision=0;
  function attachment(url){
    if(url)preview.src=url;else preview.removeAttribute('src');
    preview.hidden=!url;$('bugRemove').hidden=!url;
  }
  function jpeg(source,w,h){
    const canvas=document.createElement('canvas'),scale=Math.min(1,1600/w,1200/h);
    canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
    canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.72);
  }
  async function openReport(){
    if(pending||dialog.open)return;
    pending=true;attachment(null);form.reset();revision++;result.textContent='';
    $('bugSend').disabled=false;$('bugClose').textContent='Cancel';
    const active=[...document.querySelectorAll('dialog[open]')].at(-1);
    view=(active=== $('conversion')?$('convTitle').textContent:active?.querySelector('h1,h2,h3')?.textContent)||'Assembly viewer';
    let stream;
    note.textContent='Attach an image or send the description on its own.';
    if(navigator.mediaDevices?.getDisplayMedia){
      try{
        stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:false,preferCurrentTab:true,selfBrowserSurface:'include'});
        const video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;
        await video.play();attachment(jpeg(video,video.videoWidth,video.videoHeight));
        note.textContent='Review the screenshot before sending it to Electric Moto Garage.';
      }catch{note.textContent='Screenshot skipped. You can attach an image or send the description.';}
      finally{stream?.getTracks().forEach(track=>track.stop());}
    }
    if(document.body.classList.contains('viewer-full'))$('viewFullscreen').click();
    pending=false;dialog.showModal();$('bugText').focus();
  }
  function button(parent,prepend=false){
    const b=document.createElement('button');b.type='button';b.className='secondary reportBug';b.textContent='Report a bug';
    b.title='Capture a screenshot and describe the problem';b.onclick=openReport;
    if(prepend)parent.prepend(b);else parent.append(b);
  }
  button(document.querySelector('.landingNav'));button(document.querySelector('.mast'));button(document.querySelector('.screenActions'));
  for(const d of document.querySelectorAll('dialog')){
    if([dialog,$('welcome')].includes(d))continue;
    const header=d.querySelector('.skHeader .actions,.convHeader');
    if(header)button(header);else button(d,true);
  }
  $('bugClose').onclick=()=>dialog.close();
  dialog.oncancel=e=>{if(sending)e.preventDefault();};
  dialog.onclose=()=>{revision++;attachment(null);form.reset();};
  $('bugRemove').onclick=()=>{revision++;attachment(null);$('bugFile').value='';note.textContent='Screenshot removed.';};
  $('bugFile').onchange=async()=>{
    const file=$('bugFile').files[0];if(!file)return;
    const token=++revision;$('bugSend').disabled=true;
    try{
      if(file.size>20*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error();
      const bitmap=await createImageBitmap(file);
      try{if(token===revision)attachment(jpeg(bitmap,bitmap.width,bitmap.height));}finally{bitmap.close();}
      if(token===revision)note.textContent='Review the attached screenshot before sending.';
    }catch{if(token===revision)note.textContent='Choose a PNG, JPEG or WebP image under 20 MB.';}
    finally{if(dialog.open&&!sending)$('bugSend').disabled=false;}
  };
  form.onsubmit=async e=>{
    e.preventDefault();if(sending)return;
    const description=$('bugText').value.trim();
    if(!description){result.textContent='Describe what went wrong.';return;}
    sending=true;
    for(const id of ['bugClose','bugFile','bugRemove','bugText','bugSend'])$(id).disabled=true;
    result.textContent='Sending report…';
    try{
      const res=await fetch('/MotoPack/bug-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({view,description,screenshot:preview.getAttribute('src')})});
      const id=res.headers.get('X-MotoPack-Receipt');
      if(res.status!==201||!id)throw Error(res.status===429?'Please retry in a minute.':'Your report could not be sent. Your description and screenshot are still here.');
      result.textContent='Report received by EMG. Reference '+id.slice(0,8)+'.';$('bugClose').textContent='Done';
    }catch(error){result.textContent=error.message;$('bugSend').disabled=false;}
    finally{sending=false;$('bugClose').disabled=false;if(!$('bugSend').disabled)for(const id of ['bugFile','bugRemove','bugText'])$(id).disabled=false;}
  };
  dialog.addEventListener('close',()=>{for(const id of ['bugFile','bugRemove','bugText'])$(id).disabled=false;});
})();
