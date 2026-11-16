import {computeDashboard,parseJSON,valueAt} from './domain.ts';
import type {Row} from './domain.ts';

export const PREACHING_BREAKDOWN=[
 {id:'PA',label:'Auxiliar de campaña',tone:'orange'},
 {id:'PAC',label:'Auxiliar de continuo',tone:'amber'},
 {id:'PR',label:'Regular',tone:'green'},
 {id:'PE',label:'Especial',tone:'blue'},
 {id:'MIS',label:'Misionero',tone:'purple'},
 {id:'PUB',label:'Normal',tone:'slate'}
] as const;
export type PreachingTotals={active:number,reports:number,participants:number,hours:number,courses:number,missingHours:number,missingCourses:number};
const empty=():PreachingTotals=>({active:0,reports:0,participants:0,hours:0,courses:0,missingHours:0,missingCourses:0});
const amount=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&n>=0?n:0;};
function combine(items:PreachingTotals[]):PreachingTotals{
 const total=empty();for(const item of items)for(const key of Object.keys(total) as (keyof PreachingTotals)[])total[key]+=item[key];return total;
}

/** Every publisher/month contributes once. Drafts and unresolved conflicting duplicates do not count. */
export function receivedSummaryReports(reports:Row[]){
 const unique=new Map<string,Row>();
 for(const report of reports){
  if(report.state==='draft'||parseJSON<string[]>(report.quality,[]).includes('duplicado_conflictivo'))continue;
  const key=report.publisher_id+'/'+report.month,old=unique.get(key);
  if(!old||amount(report.version)>amount(old.version)||amount(report.version)===amount(old.version)&&String(report.updated_at||'')>String(old.updated_at||''))unique.set(key,report);
 }
 return [...unique.values()];
}
export function computePreachingSummary(data:Row,filters:Row){
 const dashboard=computeDashboard(data,filters),latest=dashboard.months.at(-1)||'';
 const types=PREACHING_BREAKDOWN.map(type=>({...type,...empty()}));
 const unknown={id:'UNKNOWN',label:'Sin clasificación',tone:'slate',...empty()};
 const byId=new Map<string,PreachingTotals>(types.map(type=>[type.id,type]));
 const people:Row[]=data.publishers||[],histories:Row[]=data.histories||[],catalog:Row[]=data.types||[];
 const reports=receivedSummaryReports(dashboard.reportList);
 const reportIndex=new Map(reports.map(report=>[report.publisher_id+'/'+report.month,report]));
 const typeOf=(person:Row|undefined,month:string,report?:Row)=>String(report?.type_id||(person?valueAt(person,'preaching',month,histories):'')||'').trim().toUpperCase();
 for(const report of reports){
  const person=people.find(person=>person.id===report.publisher_id),id=typeOf(person,report.month,report),target=byId.get(id)||unknown;
  target.reports++;if(report.participation==='SI')target.participants++;
  const type=catalog.find(type=>type.id===id);
  const counts=report.counts_hours==null?!!type?.counts_hours:report.counts_hours===1||report.counts_hours===true;
  if(id!=='PUB'&&counts){target.hours+=amount(report.hours);if(report.hours==null&&report.participation==='SI')target.missingHours++;}
  target.courses+=amount(report.courses);if(report.courses==null)target.missingCourses++;
 }
 const activeRoster:Row[]=latest?dashboard.roster.filter(person=>valueAt(person,'status',latest,histories)==='ACTIVO'):[];
 for(const person of activeRoster){const id=typeOf(person,latest,reportIndex.get(person.id+'/'+latest));(byId.get(id)||unknown).active++;}
 const get=(id:string)=>byId.get(id)!;
 const groups={
  publishers:combine([get('PUB')]),
  auxiliary:combine([get('PA'),get('PAC')]),
  regular:combine([get('PR')]),
  special:combine([get('PE'),get('MIS')])
 };
 return {
  types,unknown,groups,
  official:combine([groups.publishers,groups.auxiliary,groups.regular]),
  internal:groups.special,
  active:activeRoster.length,received:reports.length,
  latest,months:dashboard.months,cutoff:dashboard.cutoff,
  historyUnverified:dashboard.historyUnverified
 };
}
