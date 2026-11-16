import {useMemo,useState} from 'react';
import {BarChart3,CalendarDays,ClipboardList,Printer,X} from 'lucide-react';
import {computeDashboard,monthName} from '../lib/domain';
import type {Row} from '../lib/domain';
import {computePreachingSummary,type PreachingTotals} from '../lib/preaching-summary';

const count=(value:number)=>new Intl.NumberFormat('es-PE',{maximumFractionDigits:1}).format(value);
const hours=(value:number)=>new Intl.NumberFormat('es-PE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(value);
function Totals({value,showHours=true,period=false}:{value:PreachingTotals,showHours?:boolean,period?:boolean}){
 return <dl className="preaching-totals"><div><dt>{period?'Informes':'Informaron'}</dt><dd>{count(value.reports)}</dd></div>{showHours&&<div><dt>Horas</dt><dd>{hours(value.hours)}</dd></div>}<div><dt>Cursos</dt><dd>{count(value.courses)}</dd></div></dl>;
}
function MissingData({summary}:{summary:ReturnType<typeof computePreachingSummary>}){
 const missingHours=summary.official.missingHours+summary.internal.missingHours,missingCourses=summary.official.missingCourses+summary.internal.missingCourses;
 return <>{(missingHours>0||missingCourses>0)&&<p className="summary-note">Totales con los datos registrados.{missingHours>0?' Hay '+count(missingHours)+' informe(s) con horas sin dato.':''}{missingCourses>0?' Hay '+count(missingCourses)+' informe(s) con cursos sin dato.':''}</p>}{(summary.unknown.reports>0||summary.unknown.active>0)&&<p className="summary-note attention">{count(summary.unknown.active)} persona(s) activa(s) y {count(summary.unknown.reports)} informe(s) con clasificación por revisar. Sus informes no están incluidos en el consolidado oficial.</p>}</>;
}
export function PreachingOverview({data,filters,onSummary}:{data:Row,filters:Row,onSummary:(month:string)=>void}){
 const summary=useMemo(()=>computePreachingSummary(data,filters),[data,filters]);
 return <section className="panel preaching-overview" aria-labelledby="preaching-overview-title">
  <div className="panel-heading"><div><h2 id="preaching-overview-title">Tipos de predicación</h2><p>{summary.latest?'Personas activas al cierre de '+monthName(summary.latest):'Sin meses cerrados en esta selección'}. Informes, horas y cursos del período seleccionado.</p></div><button type="button" className="button small" disabled={!summary.latest} onClick={()=>onSummary(summary.latest)}><ClipboardList size={16}/> Resumen oficial</button></div>
  <div className="preaching-grid">{summary.types.map(type=><article className={'preaching-card '+type.tone} key={type.id}><div className="preaching-card-title"><span className="preaching-color" aria-hidden="true"/><h3>{type.label}</h3></div><div className="preaching-person-count"><strong>{count(type.active)}</strong><span>personas activas</span></div><Totals value={type} showHours={type.id!=='PUB'} period/></article>)}</div>
  <div className="preaching-overview-foot"><span><BarChart3 size={15}/>{count(summary.active)} personas activas · {count(summary.received)} informes recibidos</span><span>{summary.months.length===1?'Un mes cerrado':summary.months.length+' meses cerrados'}</span></div>
  <MissingData summary={summary}/>
 </section>;
}
export function MonthlySummary({data,filters,month,onClose}:{data:Row,filters:Row,month:string,onClose:()=>void}){
 const available=useMemo(()=>computeDashboard(data,{...filters,month:''}).months,[data,filters]);
 const [selected,setSelected]=useState(month);
 const selectedMonth=available.includes(selected)?selected:available.at(-1)||'';
 const summary=useMemo(()=>computePreachingSummary(data,{...filters,month:selectedMonth}),[data,filters,selectedMonth]);
 const group=data.groups?.find((group:Row)=>group.id===filters.group)?.name||'Todos los grupos autorizados';
 const person=data.publishers?.find((person:Row)=>person.id===filters.person)?.alias;
 if(!selectedMonth)return <div className="monthly-summary-report"><p>No hay meses cerrados para el año de servicio seleccionado.</p><button className="button" onClick={onClose}>Cerrar</button></div>;
 const rows=[
  {id:'publishers',title:'Publicadores',detail:'No contabilizan horas · Incluidos en totales oficiales',value:summary.groups.publishers,hours:false},
  {id:'auxiliary',title:'Auxiliar',detail:'Auxiliar de campaña + auxiliar de continuo · Incluido en totales oficiales',value:summary.groups.auxiliary,hours:true},
  {id:'regular',title:'Precursor regular',detail:'Incluido en totales oficiales',value:summary.groups.regular,hours:true}
 ];
 return <div className="monthly-summary-report">
  <div className="summary-toolbar"><label className="field"><span>Mes del reporte</span><select value={selectedMonth} onChange={event=>setSelected(event.target.value)}>{available.map(value=><option key={value} value={value}>{monthName(value)}</option>)}</select></label><button type="button" className="button small" onClick={()=>window.print()}><Printer size={15}/> Imprimir / Guardar PDF</button></div>
  <header className="summary-report-heading"><span className="summary-report-icon"><BarChart3 size={23}/></span><div><h2>Resumen oficial — {monthName(selectedMonth)}</h2><p>{group}{person?' · '+person:''}</p></div></header>
  <div className="summary-active"><span>Publicadores activos</span><strong>{count(summary.active)}</strong></div>
  <div className="summary-categories">{rows.map(row=><article className="summary-category" key={row.id}><div><h3>{row.title}</h3><p>{row.detail}</p></div><Totals value={row.value} showHours={row.hours}/></article>)}</div>
  <article className="summary-category official-consolidated"><div><span className="summary-tag">TOTAL OFICIAL</span><h3>Consolidado general</h3><p>Publicadores + Auxiliar + Precursor regular</p></div><dl className="preaching-totals"><div><dt>Horas</dt><dd>{hours(summary.official.hours)}</dd></div><div><dt>Cursos</dt><dd>{count(summary.official.courses)}</dd></div></dl></article>
  <article className="summary-category internal-special"><div><span className="summary-tag internal">SEGUIMIENTO INTERNO · NO OFICIAL</span><h3>Precursores especiales</h3><p>Especiales + misioneros</p></div><Totals value={summary.internal}/></article>
  <MissingData summary={summary}/>
  <p className="summary-note"><CalendarDays size={13}/> Mes cerrado. Cada persona se cuenta una vez en el mes; solo se incluyen informes recibidos. Los borradores y duplicados conflictivos quedan fuera.</p>
  {summary.historyUnverified&&<p className="summary-note attention">Hay estados o grupos anteriores al historial confirmado. Revisa las vigencias antes de presentar este resumen.</p>}
  <div className="summary-actions"><button type="button" className="button" onClick={onClose}><X size={15}/> Cerrar</button></div>
 </div>;
}
