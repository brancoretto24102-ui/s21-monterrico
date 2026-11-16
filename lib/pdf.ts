import {apiRequest} from '../src/api';
import {Row,MONTHS,serviceMonths,valueAt,parseJSON} from './domain';
import {buildExportPlan,S21_FOLDERS,serviceYearRange,validateExportYears,safeFileName as safe} from './export-plan';
export {folderFor} from './export-plan';
type Assets={template:Uint8Array,regular:Uint8Array,bold:Uint8Array};
async function loadAssets():Promise<Assets>{
 const data=await apiRequest('template');const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));return {template:decode(data.template),regular:decode(data.regular),bold:decode(data.bold)};
}
export async function generateS21(person:Row,data:Row,years:number[],cutoff:string,assets?:Assets){
 const error=validateExportYears(years);if(error)throw Error(error);
 const {PDFDocument,rgb}=await import('pdf-lib');const fontkit=(await import('@pdf-lib/fontkit')).default;
 if(!assets)assets=await loadAssets();
 const doc=await PDFDocument.load(assets.template);doc.registerFontkit(fontkit);const regular=await doc.embedFont(assets.regular,{subset:true}),bold=await doc.embedFont(assets.bold,{subset:true});const page=doc.getPages()[0],H=page.getHeight();const annexes:Row[]=[];
 const draw=(text:any,x:number,y:number,size=10.3,font=regular,p=page)=>p.drawText(String(text),{x,y:p.getHeight()-y,size,font,color:rgb(.06,.06,.07)});
 const center=(text:any,x0:number,y0:number,x1:number,y1:number,size=10.3,font=regular)=>{const s=String(text);draw(s,(x0+x1-font.widthOfTextAtSize(s,size))/2,(y0+y1)/2+size*.34,size,font);};
 const cross=(x:number,y:number,size=5.5)=>{const h=size/2;page.drawLine({start:{x:x-h,y:H-y+h},end:{x:x+h,y:H-y-h},thickness:.95});page.drawLine({start:{x:x-h,y:H-y-h},end:{x:x+h,y:H-y+h},thickness:.95});};
 const wrap=(s:string,size:number,width:number)=>{const lines:string[]=[];for(const paragraph of s.split(/\r?\n/)){let line='';for(const word of paragraph.split(/\s+/)){const test=line?`${line} ${word}`:word;if(regular.widthOfTextAtSize(test,size)>width&&line){lines.push(line);line=word;}else line=test;}lines.push(line);}return lines;};
 const notes=(text:string,top:number,bottom:number,year:number,month:string)=>{for(const size of [8.2,7.8,7.2]){const lines=wrap(text,size,159);if(lines.length*(size+.4)<=bottom-top-1){const base=(top+bottom-lines.length*(size+.4))/2+size;lines.forEach((l,i)=>draw(l,415.2,base+i*(size+.4),size));return;}}const index=annexes.length+1;center(`Ver nota ${index} en anexo`,412.7,top,577.2,bottom,8);annexes.push({index,text,year,month});};
 const date=(s:string|null)=>s?`${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)}`:'';
 const boundaries=[158.3518,176.2617,193.9928,211.7248,229.4559,247.2759,265.0070,282.7381,300.4692,318.2892,336.0203,353.7514,372.1086];
 for(let half=0;half<2;half++){
  const year=years[half]||years[0]+half,off=420.947*half,at=[`${year}-08`,cutoff.slice(0,7)].sort()[0];const role=valueAt(person,'role',at,data.histories),type=valueAt(person,'preaching',at,data.histories);
  const fullname=person.full_name,sz=Math.min(11,500/regular.widthOfTextAtSize(fullname,1));draw(fullname,67,49+off,sz);if(person.birth_date)draw(date(person.birth_date),134,63.6+off,10.5);if(person.baptized&&person.baptism_date)draw(date(person.baptism_date),124.5,78.1+off,10.5);
  cross(person.gender==='MASCULINO'?388.8:490.2,60+off,5);cross(person.condition==='UNGIDO'?490.2:388.8,74.5+off,5);
  if(role==='ANCIANO')cross(21.65,88.95+off,5);if(role==='SM')cross(85.2,88.95+off,5);if(['PR','PE','MIS'].includes(type))cross(({PR:205.92,PE:330.92,MIS:456.52} as Row)[type],88.95+off,5);
  center(year,18,139+off,101,156.3+off,11,bold);let total=0,hasHours=false;
  for(const [i,m] of serviceMonths(year).entries()){
   if(m>cutoff.slice(0,7))continue;const r=data.reports.find((r:Row)=>r.publisher_id===person.id&&r.month===m&&r.state!=='draft'&&!parseJSON<string[]>(r.quality,[]).includes('duplicado_conflictivo'));if(!r)continue;
   const top=boundaries[i]+off+.3,bottom=boundaries[i+1]+off-.3,y=167.295+17.7312*i+off;
   if(r.participation==='SI')cross(136.5,y,6.1);if(['PA','PAC'].includes(r.type_id))cross(277.74,y,6.1);
   if(r.courses!=null)center(r.courses,172.5,top,242.2,bottom);if(r.counts_hours&&r.hours!=null){center(r.hours,313.8,top,411.8,bottom);total+=Number(r.hours);hasHours=true;}
   if(r.comment)notes(r.comment,top,bottom,year,MONTHS[i]);
  }if(hasHours)center(Number(total.toFixed(2)),314,372.5+off,411.8,389+off,10.5,bold);
 }
 if(annexes.length){let p=doc.addPage([595.2,841.9]),y=55;const heading=()=>{draw('OBSERVACIONES DEL REGISTRO S-21',42,55,16,bold,p);draw(person.alias,42,80,11,bold,p);draw(person.full_name,42,100,10,regular,p);};heading();y=135;
  for(const n of annexes){const ls=wrap(n.text,11,510);if(y+ls.length*15+55>795){p=doc.addPage([595.2,841.9]);heading();y=135;}draw(`Nota ${n.index} · ${n.month} · Año de servicio ${n.year}`,42,y,11,bold,p);y+=24;for(const line of ls){if(y>795){p=doc.addPage([595.2,841.9]);heading();y=135;}draw(line,42,y,11,regular,p);y+=15;}y+=22;}
 }
 doc.setTitle(`S-21 · ${person.alias} · ${years.map(serviceYearRange).join(' y ')}`);doc.setSubject(`Informes hasta ${cutoff}.`);return{bytes:await doc.save(),annexes:annexes.length};
}
export function saveDownload(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function exportPdfs(data:Row,ids:string[],years:number[],cutoff:string,mode:string,onProgress:(n:number,total:number)=>void){
 const error=validateExportYears(years);if(error)throw Error(error);
 const plan=buildExportPlan(data,ids,cutoff,mode),people=plan.map((r:Row)=>r.person);if(!people.length)throw Error('Selecciona al menos un publicador.');
 const assets=await loadAssets();
 if(people.length===1){const pdf=await generateS21(people[0],data,years,cutoff,assets);onProgress(1,1);return {blob:new Blob([pdf.bytes as BlobPart],{type:'application/pdf'}),filename:`${safe(people[0].alias)}.pdf`};}
 const JSZip=(await import('jszip')).default,zip=new JSZip(),counts:Row=Object.fromEntries((mode==='organized'?S21_FOLDERS:[]).map(f=>[f,0])),annexNames:string[]=[];
 if(mode==='organized')for(const folder of S21_FOLDERS)zip.folder(folder);
 for(const [i,r] of plan.entries()){const pdf=await generateS21(r.person,data,years,cutoff,assets);zip.file(r.path,pdf.bytes);counts[r.folder||'Raíz']=(counts[r.folder||'Raíz']||0)+1;if(pdf.annexes)annexNames.push(r.path);onProgress(i+1,people.length);await new Promise(r=>setTimeout(r,0));}
 const lines=['REGISTROS S-21 MONTERRICO',mode==='organized'?'Formato de envío al superintendente':'Exportación de registros',`Generación: ${new Date().toLocaleString('es-PE',{timeZone:'America/Lima'})}`,`Año 1 de servicio: ${serviceYearRange(years[0])}`,`Año 2 de servicio: ${serviceYearRange(years[1])}`,`Fecha de corte: ${cutoff.split('-').reverse().join('/')}`,`Último mes disponible: ${data.reports.map((r:Row)=>r.month).sort().at(-1)||'Sin informes'}`,`PDF: ${people.length}`,`Documentos con anexos: ${annexNames.length}`,'',...Object.entries(counts).map(([k,v])=>`${k}: ${v}`),'','Los meses sin informe confirmado permanecen vacíos. Cero y vacío se conservan por separado.','Los totales suman horas numéricas contabilizables. Los créditos mencionados en notas no se suman nuevamente.','Los encabezados históricos sin evidencia de vigencia utilizan el maestro disponible y requieren revisión.','Las agrupaciones antiguas importadas del Excel pueden reflejar el grupo actual.','','Datos personales faltantes:',...people.filter((p:Row)=>!p.birth_date||(p.baptized&&!p.baptism_date)).map((p:Row)=>`${p.alias}: ${[!p.birth_date?'nacimiento':'',p.baptized&&!p.baptism_date?'bautismo':''].filter(Boolean).join(', ')} en blanco.`),'','Documentos con anexos:',...annexNames,'','Observaciones pendientes:',...data.issues.filter((x:Row)=>x.state==='pending'&&ids.includes(x.publisher_id)).map((x:Row)=>`${people.find((p:Row)=>p.id===x.publisher_id)?.alias||''} · ${x.month||'Maestro'} · ${x.message}`)];zip.file('LEEME.txt','\ufeff'+lines.join('\n'));return{blob:await zip.generateAsync({type:'blob',compression:'DEFLATE'}),filename:`S21_${years.map(serviceYearRange).join('_')}_${mode==='organized'?'superintendente':'registros'}.zip`};
}

