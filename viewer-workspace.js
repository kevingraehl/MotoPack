// Workspace preferences belong to the viewer, independently of the saved bike design.
function initViewerWorkspace(){
  const body=document.body, stage=$('stage'), fullButton=$('viewFullscreen');
  let preferences={};
  try{preferences=JSON.parse(localStorage.getItem('motopack.workspace')||'{}')||{};}catch{}
  function panel(buttonId,panelId,key,initial,className){
    const button=$(buttonId),target=$(panelId);
    function show(open,remember=true){
      target.hidden=!open;
      button.setAttribute('aria-expanded',String(open));
      if(className)body.classList.toggle(className,!open);
      if(remember){
        preferences[key]=open;
        try{localStorage.setItem('motopack.workspace',JSON.stringify(preferences));}catch{}
      }
    }
    show(typeof preferences[key]==='boolean'?preferences[key]:initial,false);
    button.onclick=()=>show(target.hidden);
    return show;
  }
  function splitter(container,target,variable,key){
    const handle=document.createElement('div');
    handle.className='dockSizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');
    handle.setAttribute('aria-label','Resize '+key+' sidebar');handle.setAttribute('aria-controls',target.id||'sketchDialog');
    const max=()=>Math.min(720,Math.floor(innerWidth*.58)),min=240;
    function size(width){
      width=Math.max(min,Math.min(max(),Math.round(width)));container.style.setProperty(variable,width+'px');
      handle.setAttribute('aria-valuenow',width);handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max());
    }
    handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();handle.setPointerCapture(e.pointerId);};
    handle.onpointermove=e=>{if(handle.hasPointerCapture(e.pointerId))size(e.clientX-container.getBoundingClientRect().left);};
    const save=()=>{try{localStorage.setItem(key+'SidebarWidth',handle.getAttribute('aria-valuenow'));}catch{}};
    handle.onpointerup=save;
    handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();size(target.offsetWidth+(e.key==='ArrowLeft'?-20:20));save();};
    target.after(handle);
    try{const width=+localStorage.getItem(key+'SidebarWidth');if(width&&innerWidth>920)size(width);}catch{}
    if(!handle.hasAttribute('aria-valuenow')){handle.setAttribute('aria-valuenow',320);handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max());}
  }
  // The conversion panel is moved into main during initialization.
  queueMicrotask(()=>splitter(document.querySelector('main'),$('conversion'),'--wizard-width','wizard'));
  splitter(document.querySelector('.skBody'),document.querySelector('.skTools'),'--sketch-width','sketch');
  const showSetup=panel('toggleSetup','controls','setup',true,'setup-hidden');
  panel('toggleResults','resultsPanel','results',true,'results-hidden');
  panel('toggleMenu','projectMenu','menu',innerWidth>920);
  const showAdjust=panel('toggleAdjust','viewerAdjust','adjust',false);

  document.addEventListener('click',event=>{
    const id=event.target.closest('button')?.id;
    if(['goFrame','editBms','wWires','wLiner'].includes(id))showSetup(true);
  },true);
  stage.addEventListener('placementclick',()=>{if(!full)showAdjust(true,false);});

  let full=false,nativeActive=false,returnFocus=null;
  function displayFull(open){
    full=open;
    body.classList.toggle('viewer-full',open);
    fullButton.textContent=open?'Exit full screen':'Full screen · F';
    $('exitHint').hidden=!open;
    if(open)fullButton.focus({preventScroll:true});
    else if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
  }
  function enter(){
    nativeActive=false;
    returnFocus=document.activeElement;
    displayFull(true);
    if(stage.requestFullscreen){
      try{stage.requestFullscreen().then(()=>{
        if(!full&&document.fullscreenElement===stage)document.exitFullscreen().catch(()=>{});
      }).catch(()=>{});}catch{}
    }
  }
  function leave(){
    displayFull(false);
    if(document.fullscreenElement===stage)document.exitFullscreen().catch(()=>{});
  }
  fullButton.onclick=()=>full?leave():enter();
  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement===stage)nativeActive=true;
    else if(nativeActive){
      nativeActive=false;
      if(full)displayFull(false);
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return;
    const key=event.key.toLowerCase();
    if(full){
      if(!['f','escape',' ','enter'].includes(key))return;
    }else if(key!=='f'||document.querySelector('dialog:modal')||
      event.target.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"])'))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!event.repeat){if(full)leave();else enter();}
  },true);
}
