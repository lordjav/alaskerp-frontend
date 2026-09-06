// @ts-nocheck

import '../src/styles/main.css';
import { showReceipt, showPrinterSettings } from '../src/components/receipts.ts';
import { sampleSale } from '../src/services/receipt.ts';
let fail = false;
window.fetch = async (url, options) => {
  const data = options.body ? JSON.parse(options.body) : {};
  document.querySelector('#events').textContent += JSON.stringify({url, open_drawer:data.open_drawer, lines:data.lines?.length})+'\n';
  if(fail) throw new Error('Offline test');
  return new Response(JSON.stringify({message:'SIMULACIÓN: orden aceptada.',job_id:1}), {status:200});
};
document.querySelector('#settings').onclick = showPrinterSettings;
document.querySelector('#sale').onclick = () => { fail=false; showReceipt(sampleSale,{newSale:true,canPrint:true}); };
document.querySelector('#copy').onclick = () => showReceipt(sampleSale,{canPrint:true});
document.querySelector('#observer').onclick = () => showReceipt(sampleSale,{canPrint:false});
document.querySelector('#fail').onclick = () => { fail=true; showReceipt(sampleSale,{newSale:true,canPrint:true}); };
