import {computeDashboard,parseJSON,typeVersion,valueAt} from './domain.ts';
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
const totalKeys=Object.keys(empty()) as (keyof PreachingTotals)[];
const amount=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&n>=0?n:0;};
function add(total:PreachingTotals,item:PreachingTotals){
 for(const key of totalKeys)total[key]+=item[key];return total;
}
function combine(items:PreachingTotals[]):PreachingTotals{return items.reduce(add,empty());}

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
 const groups={publishers:empty(),auxiliary:empty(),regular:empty(),special:empty()};
 const classification=(person:Row|undefined,month:string,report?:Row)=>{
  const id=String(report?.type_id||(person?valueAt(person,'preaching',month,histories):'')||'').trim().toUpperCase();
  const type=typeVersion(catalog.find(type=>type.id===id),month),flag=report?.counts_hours??type?.counts_hours;
  const counts=flag===1||flag===true?true:flag===0||flag===false?false:undefined;
  return {id,counts};
 };
 // Official categories depend first on whether hours count in that month.
 // The six dashboard cards keep the publisher's ministry type independently.
 const category=(id:string,counts:boolean|undefined):PreachingTotals=>{
  if(counts===false)return groups.publishers;
  if(counts===true){
   if(id==='PA'||id==='PAC')return groups.auxiliary;
   if(id==='PR')return groups.regular;
   if(id==='PE'||id==='MIS')return groups.special;
  }
  return unknown;
 };
 for(const report of reports){
  const person=people.find(person=>person.id===report.publisher_id),{id,counts}=classification(person,report.month,report);
  const participated=report.participation==='SI';
  const totals:PreachingTotals={...empty(),reports:1,participants:participated?1:0,
   hours:participated&&counts===true?amount(report.hours):0,courses:participated?amount(report.courses):0,
   missingHours:participated&&counts===true&&report.hours==null?1:0,missingCourses:participated&&report.courses==null?1:0};
  const type=byId.get(id);if(type)add(type,totals);
  add(category(id,counts),totals);
 }
 const activeRoster:Row[]=latest?dashboard.roster.filter(person=>valueAt(person,'status',latest,histories)==='ACTIVO'):[];
 for(const person of activeRoster){
  const {id,counts}=classification(person,latest,reportIndex.get(person.id+'/'+latest));
  const type=byId.get(id);if(type)type.active++;
  category(id,counts).active++;
 }
 return {
  types,unknown,groups,
  official:combine([groups.publishers,groups.auxiliary,groups.regular]),
  internal:groups.special,
  active:activeRoster.length,received:reports.length,
  latest,months:dashboard.months,cutoff:dashboard.cutoff,
  historyUnverified:dashboard.historyUnverified
 };
}
