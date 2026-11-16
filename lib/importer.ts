import {Row,currentMonth,previousMonth,DEFAULT_TYPES} from './domain';
const txt=(v:any)=>v==null?'':String(v).trim();
function date(v:any){if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);if(typeof v==='string'){const s=v.trim(),m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(m)return `${m[3]}-${m[2]}-${m[1]}`;if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);}return null;}
function toRows(a:any[][]){return a.slice(1).filter(r=>r[0]!=null).map(r=>Object.fromEntries(a[0].map((k,i)=>[String(k),r[i]??null])));}
function month(v:any){return date(v)?.slice(0,7);}
function role(v:any){return txt(v)==='ANCIANO'?'ANCIANO':txt(v)==='SIERVO MINISTERIAL'?'SM':'HERMANO';}
function type(v:any){return ({NORMAL:'PUB',REGULAR:'PR',ESPECIAL:'PE',MISIONERO:'MIS',INA:'PUB',PNB:'PUB'} as Row)[txt(v)]||txt(v)||'PUB';}
function status(v:any){return ({CAMBIADO:'TRASLADADO','PNB-INACTIVO':'INACTIVO'} as Row)[txt(v)]||txt(v);}
function next(m:string){const[y,n]=m.split('-').map(Number);return `${n===12?y+1:y}-${String(n===12?1:n+1).padStart(2,'0')}`;}
export function prepareImport(sheets:Record<string,any[][]>,existing:Row={}){
 for(const s of ['DATA','GRUPOS','HORAS'])if(!sheets[s]?.length)throw new Error(`Falta la hoja ${s}.`);
 const gs=toRows(sheets.GRUPOS),ds=toRows(sheets.DATA),hrs=toRows(sheets.HORAS);
 const all=new Map(ds.map(r=>[txt(r.CODIGO),r]));const used=new Set<string>(),pubs:Row[]=[],reports:Row[]=[],histories:Row[]=[],issues:Row[]=[],groups:Row[]=[],cut=currentMonth();
 const oldP=new Map((existing.publishers||[]).map((p:Row)=>[p.code,p]));let exact=0,conflicts=0;
 const issue=(p:Row,kind:string,message:string,details:any,m:string|null=null)=>issues.push({id:`imp-${kind}-${p.id}-${m||'master'}`,publisher_id:p.id,month:m,kind,message,details:JSON.stringify(details),state:'pending'});
 for(const g of gs){const code=txt(g.CODIGO);if(used.has(code))throw new Error(`Código ${code} duplicado en GRUPOS.`);used.add(code);const d=all.get(code);if(!d)throw new Error(`El código ${code} de GRUPOS no existe en DATA.`);
  const old=oldP.get(code) as Row|undefined;const p:Row={id:old?.id||`pub-${code}`,code,names:txt(d.NOMBRES),surnames:`${txt(d['APELLIDO MATERNO'])} ${txt(d['APELLIDO PATERNO'])}`.trim(),full_name:txt(d['APELLIDOS Y NOMBRES']),alias:txt(d.APODO)||txt(g['APELLIDOS Y NOMBRES']),gender:txt(d.GENERO),birth_date:date(d['FECHA NACIMIENTO']),baptized:txt(d.BAUSTIZADO)==='SI'?1:0,baptism_date:txt(d.BAUSTIZADO)==='SI'?date(d['FECHA BAUTISMO']):null,condition:txt(d.TIPO)==='UNGIDO'?'UNGIDO':'OO',role:role(d.CLASIFICACION),status:status(d.ESTADO),group_id:txt(g.GRUPO),preaching_type_id:type(d.PREDICACION),notes:old?.notes||'',historical_since:old?.historical_since||cut};pubs.push(p);
  if(!p.alias||!p.full_name||!p.group_id)throw new Error(`El código ${code} tiene datos principales incompletos.`);
  if(status(g.ESTADO)!==p.status)issue(p,'estado','El estado de GRUPOS difiere de DATA.',{grupos:g.ESTADO,data:d.ESTADO});
  if(!p.birth_date||p.baptized&&!p.baptism_date)issue(p,'fecha','Hay fechas personales sin confirmar.',{nacimiento:d['FECHA NACIMIENTO'],bautismo:d['FECHA BAUTISMO']});
 }
 const byCode=new Map(pubs.map(p=>[p.code,p])),byMonth=new Map<string,Row[]>();
 for(const r of hrs){const p=byCode.get(txt(r.CODIGO));if(!p)continue;const m=month(r.MES);if(!m)throw new Error(`Fecha de informe inválida para ${p.alias}.`);if(m>cut)throw new Error(`El archivo contiene un informe futuro: ${p.alias}, ${m}.`);
  const ty=type(r.Priv);if(!DEFAULT_TYPES.some(t=>t.id===ty))throw new Error(`Tipo ${ty} no reconocido para ${p.alias}.`);
  const participation=txt(r['PARTICIPACIÓN']).toUpperCase();if(!['SI','NO'].includes(participation))throw new Error(`Participación inválida para ${p.alias}, ${m}.`);
  for(const key of ['HORAS','CURSOS BÍBLICOS'])if(r[key]!=null&&(typeof r[key]!=='number'||r[key]<0))throw new Error(`${key} inválido para ${p.alias}, ${m}.`);
  const q=['grupo_historico'];if(ty==='PA')q.push('meta_historica');
  const rep:Row={id:`rep-${p.code}-${m}`,publisher_id:p.id,month:m,group_id:p.group_id,type_id:ty,counts_hours:ty==='PUB'?0:1,participation,hours:r.HORAS??null,courses:r['CURSOS BÍBLICOS']??null,comment:txt(r.COMENTARIO),state:'submitted',quality:JSON.stringify(q),source:'Excel',updated_by:'import',updated_at:new Date().toISOString(),submitted_at:new Date().toISOString()};
  if(!rep.counts_hours&&rep.hours!=null){issue(p,'horas','Existen horas en un informe de predicación normal.',{report:rep},m);rep.quality=JSON.stringify([...q,'horas_no_aplican']);}
  const key=`${p.id}/${m}`,list=byMonth.get(key)||[];list.push(rep);byMonth.set(key,list);
 }
 for(const [key,list] of byMonth){const cmp=(r:Row)=>JSON.stringify([r.type_id,r.participation,r.hours,r.courses,r.comment]);const unique=[...new Map(list.map(r=>[cmp(r),r])).values()];exact+=list.length-unique.length;const rep={...unique[0]};if(unique.length>1){conflicts++;rep.state='draft';rep.quality=JSON.stringify([...JSON.parse(rep.quality),'duplicado_conflictivo']);const p=pubs.find(p=>p.id===rep.publisher_id)!;issue(p,'duplicado',`Hay ${unique.length} versiones distintas del mismo mes.`,{alternatives:unique},rep.month);}reports.push(rep);}
 for(const p of pubs){const rs=reports.filter(r=>r.publisher_id===p.id).sort((a,b)=>a.month.localeCompare(b.month));let run:Row|undefined;
  for(const r of rs){if(run&&run.value===r.type_id&&next(run.end_month)===r.month)run.end_month=r.month;else{run={id:`hist-${p.code}-preaching-${r.month}`,publisher_id:p.id,kind:'preaching',value:r.type_id,start_month:r.month,end_month:r.month,campaign_id:null,notes:'Reconstruido de la clasificación mensual en HORAS. Metas de PA pendientes de confirmar.',origin:'excel',unverified:r.type_id==='PA'?1:0,created_by:'import'};histories.push(run);}}
  const latest=rs.at(-1);if(latest&&latest.type_id!==p.preaching_type_id)issue(p,'clasificacion','Confirma la transición entre el maestro y el último informe.',{maestro:p.preaching_type_id,ultimo:latest.type_id,mes:latest.month});
  for(const [kind,value] of [['group',p.group_id],['role',p.role],['status',p.status],['preaching',p.preaching_type_id]])if(!histories.some(h=>h.publisher_id===p.id&&h.kind===kind&&h.start_month>=cut))histories.push({id:`hist-${p.code}-${kind}-${cut}`,publisher_id:p.id,kind,value,start_month:cut,end_month:null,campaign_id:null,notes:'Dato vigente al importar. Los meses anteriores sin evidencia se señalan para revisión.',origin:'excel',unverified:0,created_by:'import'});
 }
 for(const id of [...new Set(pubs.map(p=>p.group_id))]){const matches=gs.filter(g=>txt(g.GRUPO)===id),leader=matches.find(g=>txt(g.ENCARGADO)==='SG'),assistant=matches.find(g=>txt(g.ENCARGADO)==='AUX');const old=(existing.groups||[]).find((g:Row)=>g.id===id);groups.push({id,code:id,name:old?.name||`Grupo ${id.replace('G','')}`,leader_id:old?.leader_id||null,assistant_id:old?.assistant_id||null,active:1,history:old?.history||'[]',notes:old?.notes||`Responsables en Excel: encargado ${leader?.['APELLIDOS Y NOMBRES']||'sin dato'}; auxiliar ${assistant?.['APELLIDOS Y NOMBRES']||'sin dato'}. Vincular con usuarios habilitados.`});}
 return{publishers:pubs,reports,histories,issues,groups,summary:{people:pubs.length,reports:reports.length,exactDuplicates:exact,conflicts,issues:issues.length,excluded:ds.length-pubs.length,firstMonth:reports.map(r=>r.month).sort()[0],lastMonth:reports.map(r=>r.month).sort().at(-1),existing:pubs.filter(p=>oldP.has(p.code)).length,new:pubs.filter(p=>!oldP.has(p.code)).length}};
}
export async function readExcel(file:File,existing:Row){const XLSX=await import('xlsx');const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});const sheets:Record<string,any[][]>={};for(const name of ['DATA','GRUPOS','HORAS']){if(!workbook.Sheets[name])throw new Error(`Falta la hoja ${name}.`);sheets[name]=XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:null});}return prepareImport(sheets,existing);}
