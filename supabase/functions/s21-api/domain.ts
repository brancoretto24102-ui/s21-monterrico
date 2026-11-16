export type Row=Record<string,any>;
export const MONTHS=['Septiembre','Octubre','Noviembre','Diciembre','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto'];
export const PERMISSIONS=[['dashboard','Ver dashboard'],['masters.read','Consultar maestros'],['publishers.write','Administrar publicadores'],['groups.write','Administrar grupos'],['catalogs.write','Administrar catálogos y metas'],['assignments.write','Administrar vigencias'],['reports.write','Registrar informes'],['reports.submit','Enviar informes'],['reports.correct','Corregir informes enviados'],['periods.write','Cerrar y reabrir períodos'],['comments.read','Consultar comentarios'],['groups.all','Todos los grupos'],['pdf.single','Exportar PDF individual'],['pdf.bulk','Exportar PDF masivo y ZIP'],['import','Importar Excel'],['audit','Consultar auditoría'],['users.write','Administrar usuarios y perfiles'],['backup','Respaldo y recuperación']] as const;
export const DEFAULT_TYPES:Row[]=[
 {id:'PUB',name:'Normal',counts_hours:0,goal_kind:'none',monthly_goal:null,annual_goal:null,monthly_reference:null,requires_campaign:0,description:'Participación y cursos bíblicos.'},
 {id:'PA',name:'Auxiliar por campaña',counts_hours:1,goal_kind:'monthly',monthly_goal:15,annual_goal:null,monthly_reference:null,requires_campaign:1,description:'15 horas durante una campaña autorizada.'},
 {id:'PAC',name:'Auxiliar de continuo',counts_hours:1,goal_kind:'monthly',monthly_goal:30,annual_goal:null,monthly_reference:null,requires_campaign:0,description:'Responsabilidad continua, con vigencia mensual.'},
 {id:'PR',name:'Regular',counts_hours:1,goal_kind:'annual',monthly_goal:null,annual_goal:600,monthly_reference:50,requires_campaign:0,description:'600 horas anuales. 50 horas mensuales como referencia.'},
 {id:'PE',name:'Especial',counts_hours:1,goal_kind:'monthly',monthly_goal:90,annual_goal:null,monthly_reference:null,requires_campaign:0,description:'Meta mensual inicial de 90 horas.'},
 {id:'MIS',name:'Misionero',counts_hours:1,goal_kind:'monthly',monthly_goal:120,annual_goal:null,monthly_reference:null,requires_campaign:0,description:'Meta mensual inicial de 120 horas.'}];
export function today(){return new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'});}
export function currentMonth(){return today().slice(0,7);}
export function serviceYear(month:string){const[y,m]=month.split('-').map(Number);return y+(m>=9?1:0);}
export function serviceMonths(year:number){return Array.from({length:12},(_,i)=>{const n=i+9;return `${year-(n<=12?1:0)}-${String(n<=12?n:n-12).padStart(2,'0')}`;});}
export function monthName(month:string){const[y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1,10)).toLocaleDateString('es-PE',{month:'long',year:'numeric',timeZone:'UTC'});}
export function previousMonth(month:string){const[y,m]=month.split('-').map(Number);return `${m===1?y-1:y}-${String(m===1?12:m-1).padStart(2,'0')}`;}
export function lastClosedMonth(asOf=today()){return previousMonth(asOf.slice(0,7));}
export function closedReportingCutoff(asOf=today()){const [y,m]=asOf.slice(0,7).split('-').map(Number);return new Date(Date.UTC(y,m-1,0)).toISOString().slice(0,10);}
export function validateMonth(month:any){return typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month);}
export function parseJSON<T=any>(v:any,fallback:T):T{try{return typeof v==='string'?JSON.parse(v):v??fallback;}catch{return fallback;}}
export function historyAt(p:Row,kind:string,m:string,hs:Row[]){return hs.filter(h=>h.publisher_id===p.id&&h.kind===kind&&h.start_month<=m&&(!h.end_month||h.end_month>=m)).sort((a,b)=>b.start_month.localeCompare(a.start_month))[0];}
export function valueAt(p:Row,kind:string,m:string,hs:Row[]){const h=historyAt(p,kind,m,hs);if(h)return h.value;if(kind==='preaching'&&hs.some(h=>h.publisher_id===p.id&&h.kind===kind&&h.start_month<=m))return 'PUB';return ({group:p.group_id,status:p.status,role:p.role,preaching:p.preaching_type_id}[kind]??null);}
export function overlaps(a:Row,b:Row){return a.start_month<=(b.end_month||'9999-12')&&b.start_month<=(a.end_month||'9999-12');}
export function typeVersion(t:Row|undefined,m:string):Row|undefined{if(!t)return;const v=parseJSON<Row[]>(t.versions,[]).filter(v=>v.since<=m).sort((a,b)=>b.since.localeCompare(a.since))[0];return v?{...t,...v}:t;}
export function inScope(a:Row,g:string|null){return a.permissions.includes('groups.all')||a.groups.includes(g);}
export function can(a:Row,p:string){return a?.permissions?.includes(p);}
export function validateReport(i:Row,counts:boolean,complete=false){const e:string[]=[];
 if(i.participation!=null&&!['SI','NO'].includes(i.participation))e.push('Selecciona SI o NO en participación.');
 for(const k of ['hours','courses'])if(i[k]!=null&&(typeof i[k]!=='number'||!Number.isFinite(i[k])||i[k]<0))e.push(`${k==='hours'?'Horas':'Cursos bíblicos'} debe ser un número no negativo.`);
 if(i.courses!=null&&!Number.isInteger(i.courses))e.push('Los cursos bíblicos deben ser enteros.');
 if(!counts&&i.hours!=null)e.push('El tipo de predicación no contabiliza horas en este mes.');
 if(i.participation==='NO'&&i.hours>0)e.push('Una participación NO no puede tener horas positivas.');
 if(complete&&i.participation==null)e.push('Falta registrar la participación.');
 if(complete&&counts&&i.participation==='SI'&&i.hours==null&&!String(i.comment||'').trim())e.push('Registra las horas o explica por qué no se contabilizaron.');return e;}
export function goalFor(t:Row|undefined,m:string,r?:Row):number|null{const v=typeVersion(t,m);if(!v||!v.counts_hours)return null;if(r&&parseJSON<string[]>(r.quality,[]).includes('meta_historica'))return null;return v.goal_kind==='annual'?(v.monthly_reference??v.annual_goal/12):v.monthly_goal;}
export function computeDashboard(data:Row,f:Row){
 const cutoff=[f.cutoff||today(),closedReportingCutoff(f.asOf)].sort()[0];
 const months=serviceMonths(Number(f.year)).filter(m=>m<=cutoff.slice(0,7)&&(!f.month||f.month===m));
 const people:Row[]=data.publishers||[],hs:Row[]=data.histories||[],types:Row[]=data.types||[];
 const selected=people.filter(p=>!f.person||p.id===f.person);
 const reportList:Row[]=(data.reports||[]).filter((r:Row)=>months.includes(r.month)&&selected.some(p=>p.id===r.publisher_id)&&(!f.group||r.group_id===f.group));
 const latest=months.at(-1)||serviceMonths(Number(f.year))[0];
 const roster=selected.filter(p=>(!f.group||valueAt(p,'group',latest,hs)===f.group)&&!['FALLECIDO','TRASLADADO','CAMBIADO'].includes(valueAt(p,'status',latest,hs)));
 let expected=0;for(const m of months)for(const p of selected)if((!f.group||valueAt(p,'group',m,hs)===f.group)&&['ACTIVO','INACTIVO'].includes(valueAt(p,'status',m,hs)))expected++;
 const received=reportList.filter(r=>r.state!=='draft'&&!parseJSON<string[]>(r.quality,[]).includes('duplicado_conflictivo'));
 const yes=received.filter(r=>r.participation==='SI'),no=received.filter(r=>r.participation==='NO');
 const hours=received.reduce((s,r)=>s+(r.counts_hours?Number(r.hours||0):0),0),courses=received.reduce((s,r)=>s+Number(r.courses||0),0);
 const trend=months.map(m=>{const rs=received.filter(r=>r.month===m);return{month:m,label:monthName(m).slice(0,3),participation:rs.filter(r=>r.participation==='SI').length,no:rs.filter(r=>r.participation==='NO').length,hours:rs.reduce((s,r)=>s+(r.counts_hours?Number(r.hours||0):0),0),courses:rs.reduce((s,r)=>s+Number(r.courses||0),0),reports:rs.length};});
 const goals=selected.map(p=>{const rs=received.filter(r=>r.publisher_id===p.id&&r.counts_hours);let target=0,unknown=false,eligible=0;for(const m of months){if(f.group&&valueAt(p,'group',m,hs)!==f.group)continue;const r=reportList.find(r=>r.publisher_id===p.id&&r.month===m),t=types.find(t=>t.id===(r?.type_id||valueAt(p,'preaching',m,hs)));if(!t?.counts_hours)continue;eligible++;const g=goalFor(t,m,r);if(g==null)unknown=true;else target+=g;}return{publisher:p,hours:rs.reduce((s,r)=>s+Number(r.hours||0),0),target:unknown?null:target,eligible,missing:Math.max(0,eligible-rs.length),comments:reportList.filter(r=>r.publisher_id===p.id&&r.comment),type:types.find(t=>t.id===valueAt(p,'preaching',latest,hs))};}).filter(g=>g.eligible>0);
 return{roster,total:roster.length,active:roster.filter(p=>valueAt(p,'status',latest,hs)==='ACTIVO').length,inactive:roster.filter(p=>valueAt(p,'status',latest,hs)==='INACTIVO').length,expelled:roster.filter(p=>valueAt(p,'status',latest,hs)==='EXPULSADO').length,received:received.length,pending:Math.max(0,expected-received.length),expected,yes:yes.length,no:no.length,uniqueParticipants:new Set(yes.map(r=>r.publisher_id)).size,hours,courses,participation:yes.length+no.length?yes.length/(yes.length+no.length)*100:0,coverage:expected?received.length/expected*100:0,trend,goals,reportList,months,cutoff,closedThrough:lastClosedMonth(f.asOf),historyUnverified:roster.some(p=>p.historical_since>latest)};
}

