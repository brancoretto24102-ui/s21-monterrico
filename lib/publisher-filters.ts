import {type Row,valueAt} from './domain.ts';
export type PublisherFilters={query?:string;group?:string;type?:string;status?:string;person?:string;month?:string;operationalOnly?:boolean};
const searchable=(value:unknown)=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es');
export function filterPublishers(people:Row[],histories:Row[],filters:PublisherFilters){
 const terms=searchable(filters.query).trim().split(/\s+/).filter(Boolean);
 return people.filter(person=>{
  const at=filters.month;
  const group=at?valueAt(person,'group',at,histories):person.group_id;
  const type=at?valueAt(person,'preaching',at,histories):person.preaching_type_id;
  const status=at?valueAt(person,'status',at,histories):person.status;
  if(filters.group&&group!==filters.group||filters.type&&type!==filters.type||filters.person&&person.id!==filters.person)return false;
  if(filters.operationalOnly&&!['ACTIVO','INACTIVO'].includes(status))return false;
  if(filters.status&&filters.status!=='all'&&(filters.status==='operational'?!['ACTIVO','INACTIVO'].includes(status):status!==filters.status))return false;
  const text=searchable([person.alias,person.full_name,person.code].filter(Boolean).join(' '));
  return terms.every(term=>text.includes(term));
 }).sort((a,b)=>String(a.alias||'').localeCompare(String(b.alias||''),'es'));
}
export function filteredSelection(selected:string[],visible:Row[]){
 const allowed=new Set(visible.map(person=>person.id));
 return [...new Set(selected)].filter(id=>allowed.has(id));
}
