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
assert.equal(summary.groups.publishers.hours,0,'Quien no contabiliza horas no suma un valor heredado de horas');
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
assert.equal(partial.official.reports,2,'Un tipo que contabiliza horas sin categoría oficial queda excluido');
assert.equal(partial.active,3);
const noParticipation=computePreachingSummary(base([person('no','PUB')],[report('no','PUB',null,0,{participation:'NO'})]),filters);
assert.equal(noParticipation.groups.publishers.reports,1,'Recibir un informe y participar son métricas diferentes');
assert.equal(noParticipation.groups.publishers.participants,0);

const nonHourlyIds=[...typeIds,'UNLISTED'];
const nonHourlyData=base([
 ...nonHourlyIds.map(id=>person('nohours-'+id,id)),person('regular-zero','PR')
],[
 ...nonHourlyIds.map((id,index)=>report('nohours-'+id,id,index%2?null:999,index+1,{counts_hours:id==='MIS'?false:0})),
 report('regular-zero','PR',0,8)
]);
const nonHourly=computePreachingSummary(nonHourlyData,filters);
assert.equal(nonHourly.groups.publishers.reports,7,'Publicadores incluye todos los informes que no contabilizan horas, independientemente del tipo');
assert.equal(nonHourly.groups.publishers.active,7);
assert.equal(nonHourly.groups.publishers.courses,28);
assert.equal(nonHourly.groups.publishers.hours,0);
assert.equal(nonHourly.groups.publishers.missingHours,0,'Horas vacías no son un pendiente para quien no las contabiliza');
assert.equal(nonHourly.groups.auxiliary.reports,0);
assert.equal(nonHourly.groups.regular.reports,1,'Un regular con cero horas conserva su categoría cuando sí contabiliza horas');
assert.equal(nonHourly.internal.reports,0,'Cada informe aparece en una sola categoría del resumen');
assert.equal(nonHourly.official.reports,8);
assert.equal(nonHourly.official.courses,36);
assert.equal(nonHourly.unknown.reports,0,'Una foto explícita de no contabilizar horas permite incluir el informe sin un tipo de catálogo');
assert.equal(nonHourly.types.find(type=>type.id==='PR')?.reports,2,'El dashboard sigue desglosando por el tipo del informe');

const catalogWithoutHours={
 ...base([person('catalog-nohours','CUSTOM'),person('catalog-without-report','CUSTOM')],[
  report('catalog-nohours','CUSTOM',null,2,{counts_hours:undefined})
 ]),
 types:[...DEFAULT_TYPES,{id:'CUSTOM',name:'Sin horas',counts_hours:0}]
};
const catalogSummary=computePreachingSummary(catalogWithoutHours,filters);
assert.equal(catalogSummary.groups.publishers.reports,1);
assert.equal(catalogSummary.groups.publishers.active,2,'Sin informe, el padrón se clasifica con la configuración vigente');
assert.equal(catalogSummary.official.courses,2);
assert.equal(catalogSummary.unknown.reports,0);

const monthlyFlags={
 ...base([person('versioned','PR'),person('versioned-no-report','PR'),person('snapshot-counted','PR')],[
  report('versioned','PR',777,2,{month:'2026-09',counts_hours:null}),
  report('versioned','PR',20,3,{counts_hours:undefined}),
  report('snapshot-counted','PR',30,4,{month:'2026-09',counts_hours:true})
 ]),
 types:DEFAULT_TYPES.map(type=>type.id==='PR'?{...type,versions:JSON.stringify([
  {since:'2026-09',counts_hours:0},{since:'2026-10',counts_hours:1}
 ])}:type)
};
const changedFlag=computePreachingSummary(monthlyFlags,{...filters,month:''});
assert.equal(changedFlag.groups.publishers.reports,1,'Se respeta el indicador histórico cuando el informe no tiene foto del indicador');
assert.equal(changedFlag.groups.publishers.courses,2);
assert.equal(changedFlag.groups.regular.reports,2);
assert.equal(changedFlag.groups.regular.hours,50,'La foto del informe prevalece sobre la configuración del catálogo en ese mes');
assert.equal(changedFlag.official.hours,50);
assert.equal(changedFlag.official.courses,9);
const septemberFlag=computePreachingSummary(monthlyFlags,{...filters,month:'2026-09'});
assert.equal(septemberFlag.groups.publishers.active,2);
assert.equal(septemberFlag.groups.regular.active,1);
assert.equal(septemberFlag.groups.publishers.reports,1);
assert.equal(septemberFlag.groups.regular.reports,1);

const undefinedFlag=computePreachingSummary(base([person('undefined','MISSING')],[
 report('undefined','MISSING',null,3,{counts_hours:null})
]),filters);
assert.equal(undefinedFlag.groups.publishers.reports,0,'Un indicador desconocido no se interpreta como no contabilizar horas');
assert.equal(undefinedFlag.unknown.reports,1);
assert.equal(undefinedFlag.official.reports,0);


// Synthetic regression: active publishers, SI responses and stored NO rows are different measures.
const normals=Array.from({length:5},(_,index)=>person('normal-'+index,'PUB'));
const inactiveNormals=Array.from({length:2},(_,index)=>person('inactive-normal-'+index,'PUB','G1','INACTIVO'));
const auxiliaries=Array.from({length:2},(_,index)=>person('auxiliary-'+index,'PA'));
const regulars=Array.from({length:3},(_,index)=>person('regular-'+index,'PR'));
const specialPeople=[person('special-0','PE'),person('missionary-0','MIS')];
const fixtureData=base([...normals,...inactiveNormals,...auxiliaries,...regulars,...specialPeople],[
 ...normals.map((p,index)=>report(p.id,'PUB',null,index===0?3:null,{participation:index<4?'SI':'NO'})),
 ...inactiveNormals.map(p=>report(p.id,'PUB',null,null,{participation:'NO'})),
 ...auxiliaries.map((p,index)=>report(p.id,'PA',index===0?40:0,index===0?2:null)),
 ...regulars.map((p,index)=>report(p.id,'PR',index===0?70:0,index===0?4:null,{participation:index<2?'SI':'NO'})),
 ...specialPeople.map((p,index)=>report(p.id,p.preaching_type_id,index===0?60:80,index===0?1:2))
]);
const fixtureSummary=computePreachingSummary(fixtureData,filters);
assert.equal(fixtureSummary.active,12);
assert.equal(fixtureSummary.received,14,'Stored monthly records include explicit NO responses');
assert.equal(fixtureSummary.groups.publishers.active,5,'Cantidad matches the active roster for the non-hour category');
assert.equal(fixtureSummary.groups.publishers.reports,7);
assert.equal(fixtureSummary.groups.publishers.participants,4,'Participaron counts SI responses only');
assert.equal(fixtureSummary.groups.regular.active,3);
assert.equal(fixtureSummary.groups.regular.participants,2);
assert.equal(fixtureSummary.groups.auxiliary.active,2);
assert.equal(fixtureSummary.groups.auxiliary.participants,2);
assert.equal(fixtureSummary.official.active,10);
assert.equal(fixtureSummary.official.participants,8);
assert.equal(fixtureSummary.internal.active,2);
assert.equal(fixtureSummary.internal.participants,2);
assert.equal(fixtureSummary.official.hours,110);
assert.equal(fixtureSummary.official.courses,9);
assert.equal(fixtureSummary.official.missingCourses,5,'NO responses do not require missing course values');
assert.equal(fixtureSummary.types.find(type=>type.id==='PUB')?.active,5);
assert.equal(fixtureSummary.types.find(type=>type.id==='PUB')?.participants,4);
const inactiveOnly=computePreachingSummary(fixtureData,{...filters,person:'inactive-normal-0'});
assert.equal(inactiveOnly.groups.publishers.active,0);
assert.equal(inactiveOnly.groups.publishers.participants,0);
assert.equal(inactiveOnly.groups.publishers.reports,1);
assert.equal(inactiveOnly.groups.publishers.missingCourses,0);
const noWithLegacyValues=computePreachingSummary(base([person('legacy-no','PR')],[
 report('legacy-no','PR',999,99,{participation:'NO'})
]),filters);
assert.equal(noWithLegacyValues.groups.regular.active,1);
assert.equal(noWithLegacyValues.groups.regular.reports,1);
assert.equal(noWithLegacyValues.groups.regular.participants,0);
assert.equal(noWithLegacyValues.official.hours,0);
assert.equal(noWithLegacyValues.official.courses,0);

console.log('PASS: categorías, padrón activo, participación SI, registros NO, vigencias, filtros, meses cerrados y datos vacíos.');
