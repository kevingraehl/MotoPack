export const reportLimit=1600000;
export function cleanBugReport(input){
  if(!input||typeof input.description!=='string'||!input.description.trim()||input.description.length>4000)throw Error('Describe the bug in 4,000 characters or fewer.');
  const {screenshot}=input;
  if(screenshot!==null&&(typeof screenshot!=='string'||screenshot.length>1500000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(screenshot)))throw Error('Invalid screenshot.');
  if(screenshot!==null){
    try{atob(screenshot.slice('data:image/jpeg;base64,'.length));}catch{throw Error('Invalid screenshot encoding.');}
  }
  return {description:input.description.trim(),view:String(input.view||'motoPack').slice(0,120),date:new Date().toISOString(),screenshot};
}
