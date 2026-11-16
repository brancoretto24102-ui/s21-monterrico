import {type Row,valueAt} from './domain.ts';

export const S21_FOLDERS=[...Array.from({length:6},(_,i)=>`Grupo ${i+1}`),'Grupo Precursores regulares, especiales y misioneros','Inactivos'];
export const serviceYearRange=(year:number)=>`${year-1}-${year}`;
export const safeFileName=(s:string)=>s.replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/[. ]+$/,'').trim();
export function validateExportYears(years:number[]){
 if(years.length!==2||years.some(y=>!Number.isInteger(y)||y<1901||y>2100))return 'Selecciona el año 1 y el año 2 de servicio antes de continuar.';
 if(years[1]<=years[0])return 'El año 2 de servicio debe ser posterior al año 1.';
 return '';
}
export function folderFor(p:Row,data:Row,cutoff:string,mode:string){
 const at=cutoff.slice(0,7),status=valueAt(p,'status',at,data.histories),type=valueAt(p,'preaching',at,data.histories),group=data.groups.find((g:Row)=>g.id===valueAt(p,'group',at,data.histories))?.name||'Sin grupo';
 if(mode==='flat')return '';
 if(mode==='group')return safeFileName(group);
 if(mode==='type')return safeFileName(data.types.find((t:Row)=>t.id===type)?.name||type);
 if(mode==='status')return safeFileName(data.catalogs.find((c:Row)=>c.id===status)?.name||status);
 if(status==='INACTIVO')return 'Inactivos';
 if(status!=='ACTIVO')throw Error('El envío al superintendente incluye activos e inactivos. Para otros estados, selecciona otra organización.');
 if(['PR','PE','MIS'].includes(type))return S21_FOLDERS[6];
 const folder=safeFileName(group);
 if(!S21_FOLDERS.slice(0,6).includes(folder))throw Error(`Revisa el grupo de ${p.alias} antes de generar el envío al superintendente.`);
 return folder;
}
export function buildExportPlan(data:Row,ids:string[],cutoff:string,mode:string):Row[]{
 const wanted=new Set(ids);
 const rows:Row[]=data.publishers.filter((p:Row)=>wanted.has(p.id)).map((person:Row)=>({person,folder:folderFor(person,data,cutoff,mode),base:safeFileName(person.alias)||person.code}));
 if(rows.length!==wanted.size)throw Error('Hay publicadores que ya no están disponibles. Actualiza la selección.');
 const order=(folder:string)=>mode==='organized'?S21_FOLDERS.indexOf(folder):0;
 rows.sort((a:Row,b:Row)=>order(a.folder)-order(b.folder)||a.folder.localeCompare(b.folder,'es')||a.base.localeCompare(b.base,'es')||a.person.code.localeCompare(b.person.code));
 const duplicates=new Map<string,number>(),used=new Set<string>();
 const key=(folder:string,name:string)=>`${folder}/${name}`.normalize('NFC').toLocaleLowerCase('es');
 for(const r of rows){const k=key(r.folder,r.base);duplicates.set(k,(duplicates.get(k)||0)+1);}
 return rows.map((r:Row)=>{
  let name=duplicates.get(key(r.folder,r.base))!>1?`${r.base} - ${r.person.code}`:r.base;
  const candidate=name;let n=2;
  while(used.has(key(r.folder,name)))name=`${candidate} - ${n++}`;
  used.add(key(r.folder,name));
  return {...r,filename:`${name}.pdf`,path:`${r.folder?r.folder+'/':''}${name}.pdf`};
 });
}
