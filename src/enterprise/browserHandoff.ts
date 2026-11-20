export function isSovereignWorkspace(value:string|undefined):boolean {
  try {const url=new URL(value||'');return url.origin==='https://draftedsovereign.netlify.app'&&(/^\/workspace\//.test(url.pathname)||/^\/setup(?:\/|$)/.test(url.pathname)||url.pathname==='/');}catch{return false;}
}
export interface CaptureReceipt {ok:boolean;id?:string;steps?:number;error?:string;}
export async function sendReviewedToBrowser(tabId:number,session:unknown):Promise<CaptureReceipt>{
  const tab=await chrome.tabs.get(tabId);if(!isSovereignWorkspace(tab.url))throw new Error('Open a Sovereign browser workspace before sending.');
  const [result]=await chrome.scripting.executeScript({target:{tabId},args:[session],func:async(session)=>new Promise<CaptureReceipt>((resolve)=>{
    if(location.origin!=='https://draftedsovereign.netlify.app') {resolve({ok:false,error:'The destination tab changed. Reopen Sovereign and retry.'});return;}
    const nonce=crypto.randomUUID();let timeout:ReturnType<typeof setTimeout>;
    const done=(value:CaptureReceipt)=>{clearTimeout(timeout);window.removeEventListener('message',receive);resolve(value);};
    const receive=(event:MessageEvent)=>{if(event.source===window&&event.origin===location.origin&&event.data?.source==='drafted.sidekick.capture.result.v1'&&event.data.nonce===nonce)done(event.data);};
    window.addEventListener('message',receive);timeout=setTimeout(()=>done({ok:false,error:'Sovereign did not confirm the save. Open the workspace and retry.'}),12000);
    window.postMessage({source:'drafted.sidekick.capture.v1',nonce,session},location.origin);
  })});
  const receipt=result?.result;
  if(!receipt?.ok||!/^capture_[a-f0-9]{64}$/.test(receipt.id||''))throw new Error(receipt?.error||'Sovereign did not confirm a saved recording.');
  return receipt;
}
