# Inactividad automática

Un publicador activo pasa a inactivo cuando completa seis meses cerrados consecutivos con participación `NO` en informes recibidos o corregidos. La vigencia se registra desde el sexto mes de la secuencia. El calendario se evalúa con la fecha de Lima.

- Un mes con `SI`, sin informe, sin participación definida, en borrador o con duplicado conflictivo interrumpe la secuencia.
- Se respetan el inicio del historial confirmado y las activaciones posteriores.
- Se conservan los informes, las vigencias previas y las decisiones programadas. Cada transición agrega auditoría con el estado anterior, el nuevo y el período que la originó.
- La evaluación es idempotente y se serializa con las mutaciones del aplicativo.
- Las importaciones en curso aplazan la evaluación hasta finalizar.
- Los estados distintos de `ACTIVO` quedan protegidos.

La base evalúa la regla al guardar informes de meses cerrados y al finalizar una importación. El trabajo `s21-automatic-inactivity` la ejecuta diariamente a las 00:15 de Lima, con un límite de 30 segundos. Usa funciones privadas con privilegios del invocador, sin exponer ejecución a usuarios públicos ni almacenar credenciales en el trabajo.

La migración incluye una evaluación inicial. Las pruebas utilizan datos sintéticos en PostgreSQL/PGlite; el planificador se instala cuando `pg_cron` está disponible.

