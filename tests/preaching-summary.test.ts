import assert from 'node:assert/strict';
import {DEFAULT_TYPES} from '../lib/domain.ts';
import type {Row} from '../lib/domain.ts';
import {computePreachingSummary,receivedSummaryReports} from '../lib/preaching-summary.ts';

const filters={year:2027,month:'2026-10',cutoff:'2026-11-16',asOf:'2026-11-16'};
const person=(id:string,type='PUB',group='G1',status='ACTIVO'):Row=>({id,alias:id,group_id:group,preaching_type_id:type,status,historical_since:'2025-09'});
const report=(publisher_id:string,type_id:string,hours:number|null,courses:number|null,extra:Row={}):Row=>({
 publisher_id,month:'2026-10',group_id:'G1',type_id,counts_hours:type_id==='PUB'?0:1,
 hours,courses,participation:'SI',state:'submitted',quality:'[]',version:1,...extra
});
const base=(publishers:Row[],reports:Row[],histories:Row[]=[]):Row=>({publishers,reports,histories,types:DEFAULT_TYPES});
const typeIds=['PA','PAC','PR','PE','MIS','PUB'];
const people=typeIds.map(id=>person(id,id,['PE','MIS','PUB'].includes(id)?'G2':'G1'));
const data=base(people,[
 report('PA','PA',20,1),report('PAC','PAC',30,2),report('PR','PR',50,3),
 report('PE','PE',90,4,{group_id:'G2'}),report('MIS','MIS',100,5,{group_id:'G2'}),
 report('PUB','PUB',999,6,{group_id:'G2'}),
 report('PA','PA',999,999,{month:'2026-11'})
]);
const original=JSON.stringify(data);
const summary=computePreachingSummary(data,filters);
assert.deepEqual(summary.types.map(type=>type.id),typeIds);
assert(summary.types.every(type=>type.active===1));
assert.equal(summary.active,6);
assert.equal(summary.groups.auxiliary.reports,2);
assert.equal(summary.groups.auxiliary.hours,50);
assert.equal(summary.groups.auxiliary.courses,3);
assert.equal(summary.groups.regular.reports,1);
assert.equal(summary.groups.regular.hours,50);
assert.equal(summary.groups.publishers.hours,0,'Normal nunca suma horas, aun con un valor heredado');
assert.equal(summary.official.reports,4);
assert.equal(summary.official.hours,100);
assert.equal(summary.official.courses,12);
assert.equal(summary.internal.reports,2);
assert.equal(summary.internal.hours,190);
assert.equal(summary.internal.courses,9);
assert.equal(summary.received,6);
assert.equal(JSON.stringify(data),original,'El reporte no modifica personas, informes ni vigencias');

const group=computePreachingSummary(data,{...filters,group:'G2'});
assert.equal(group.active,3);
assert.equal(group.received,3);
assert.equal(group.official.hours,0);
assert.equal(group.official.courses,6);
assert.equal(group.internal.hours,190);
const one=computePreachingSummary(data,{...filters,person:'PAC'});
assert.equal(one.active,1);assert.equal(one.received,1);
assert.equal(one.official.hours,30);assert.equal(one.internal.hours,0);
const empty=computePreachingSummary(data,{...filters,group:'EMPTY'});
assert.equal(empty.active,0);assert.equal(empty.received,0);
assert.equal(empty.types.length,6,'Las seis clasificaciones siguen visibles con ceros');
assert(empty.types.every(type=>type.active===0&&type.reports===0));

const monthly=base([person('changing','MIS')],[
 report('changing','PA',20,1,{month:'2026-09'}),
 report('changing','PR',50,2),
 report('changing','MIS',999,999,{month:'2026-11'})
]);
const accumulated=computePreachingSummary(monthly,{...filters,month:''});
assert.deepEqual(accumulated.months,['2026-09','2026-10']);
assert.equal(accumulated.active,1);
assert.equal(accumulated.received,2,'Los acumulados cuentan informes por persona y mes');
assert.equal(accumulated.official.hours,70);
assert.equal(accumulated.groups.auxiliary.reports,1);
assert.equal(accumulated.groups.regular.reports,1);
assert.equal(accumulated.types.find(type=>type.id==='PR')?.active,1,'La foto del informe prevalece sobre el maestro actual');
assert.equal(accumulated.types.find(type=>type.id==='MIS')?.active,0);
assert.equal(accumulated.internal.hours,0,'El mes abierto no se incorpora');
const open=computePreachingSummary(monthly,{...filters,month:'2026-11',cutoff:'2027-08-31'});
assert.equal(open.months.length,0);assert.equal(open.received,0);assert.equal(open.active,0);

const historical=base([person('historical','PUB'),person('inactive','PR','G1','INACTIVO'),person('moved','PE','G1','TRASLADADO')],[],[
 {publisher_id:'historical',kind:'preaching',value:'PAC',start_month:'2026-09',end_month:'2026-10'}
]);
const withoutReport=computePreachingSummary(historical,filters);
assert.equal(withoutReport.active,1);
assert.equal(withoutReport.types.find(type=>type.id==='PAC')?.active,1,'Sin informe, se aplica la vigencia del mes');
assert.equal(withoutReport.types.find(type=>type.id==='PR')?.active,0,'Inactivos no son personas activas');
assert.equal(withoutReport.received,0);

const duplicates=base([person('duplicate','PR')],[
 report('duplicate','PR',10,1,{version:1}),
 report('duplicate','PR',20,2,{version:2,updated_at:'2026-11-01T10:00:00Z'}),
 report('duplicate','PR',25,3,{version:2,updated_at:'2026-11-02T10:00:00Z'}),
 report('duplicate','PR',100,10,{version:3,state:'draft'}),
 report('duplicate','PR',200,20,{version:4,quality:'["duplicado_conflictivo"]'})
]);
const deduplicated=computePreachingSummary(duplicates,filters);
assert.equal(deduplicated.received,1);
assert.equal(deduplicated.official.hours,25);
assert.equal(deduplicated.official.courses,3);
assert.equal(receivedSummaryReports([report('x','PR',1,1,{state:'draft'}),report('y','PR',1,1,{quality:'["duplicado_conflictivo"]'})]).length,0);

const incomplete=base([person('zero','PR'),person('missing','PAC'),person('unknown','CUSTOM')],[
 report('zero','PR',0,0),report('missing','PAC',null,null),
 report('unknown','CUSTOM',100,10)
]);
const partial=computePreachingSummary(incomplete,filters);
assert.equal(partial.official.hours,0);
assert.equal(partial.official.courses,0);
assert.equal(partial.official.missingHours,1,'Cero se distingue de horas sin dato');
assert.equal(partial.official.missingCourses,1,'Cero se distingue de cursos sin dato');
assert.equal(partial.unknown.active,1);assert.equal(partial.unknown.reports,1);
assert.equal(partial.official.reports,2,'Una clasificación desconocida no se convierte en Normal');
assert.equal(partial.active,3);
const noParticipation=computePreachingSummary(base([person('no','PUB')],[report('no','PUB',null,0,{participation:'NO'})]),filters);
assert.equal(noParticipation.groups.publishers.reports,1,'Recibir un informe y participar son métricas diferentes');
assert.equal(noParticipation.groups.publishers.participants,0);
console.log('PASS: seis tipos, agrupación oficial, especiales y misioneros internos, vigencias y fotos mensuales, filtros, meses cerrados, duplicados y datos vacíos.');
