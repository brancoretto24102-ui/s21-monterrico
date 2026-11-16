# S-21 Monterrico

Gestión de publicadores, grupos, informes mensuales y exportaciones S-21. Interfaz anaranjada para web y móvil, perfiles por grupo, auditoría y protección frente a cambios simultáneos.

**Sitio:** https://brancoretto24102-ui.github.io/s21-monterrico/

## Acceso y uso

Ingresa con una cuenta autorizada de Monterrico: Google o Microsoft cuando estén configurados, o la contraseña existente de S-13. Los permisos de S-21 son independientes: el administrador autoriza cada correo, perfil y grupos. Al guardar un usuario nuevo puede preparar una cuenta sin contraseña para Google / Microsoft, o elegir la contraseña inicial 1234567890 si la política del servicio la permite. Las cuentas ya existentes conservan su contraseña al vincularse. No se envían invitaciones. La sesión permanece en memoria; al recargar se solicita iniciar sesión nuevamente. No existe promoción automática del primer visitante.

- Maestros de publicadores, grupos, perfiles, clasificaciones, estados y predicación. Encargado y auxiliar vinculados a usuarios habilitados.
- Recepción mensual por grupo: participación sí/no, cursos bíblicos, comentarios y horas cuando corresponde al tipo vigente. Los borradores, pendientes y la respuesta NO se distinguen.
- Campañas y responsabilidades con meses inclusivos y metas versionadas. Año de servicio 2026: septiembre de 2025–agosto de 2026; 2027: septiembre de 2026–agosto de 2027.
- Correcciones autorizadas con motivo, solicitudes de encargados, períodos cerrados y auditoría.
- Dashboard con filtros por año, mes, grupo y persona; horas, metas, cursos-mes, participación y estados.
- PDF individual y ZIP masivo: apodos, dos años por registro, corte y organización seleccionables. Plantilla y fuentes privadas disponibles solo con permiso de exportación.
- Importación del Excel DATA/GRUPOS/HORAS con previsualización y revisión de conflictos; respaldos JSON.

Los registros se administran en la base privada. Los archivos del Excel y los datos personales no se incluyen en el repositorio público.

## Arquitectura

React, TypeScript y Vite en GitHub Pages. Supabase Auth identifica a la persona; `s21-api` revalida la sesión y comprueba los permisos y grupos en cada operación. PostgreSQL conserva las tablas en el esquema privado `s21`, sin acceso directo para `anon` ni `authenticated`. Todas las tablas tienen RLS con denegación predeterminada. La API es el único acceso de la aplicación a esos registros.

Las escrituras usan transacciones, bloqueo previo y versiones optimistas. Las correcciones y auditorías se confirman juntas. Una restricción de la base impide solapar vigencias de una persona.

El frontend contiene únicamente la URL y una clave publicable. Las credenciales de servidor permanecen en Supabase. No existe un ejecutor SQL accesible al cliente. S-21 utiliza un esquema y una función separados de S-13.

## Desarrollo y validación

Node.js 24 y npm:

```sh
npm ci
npm test
npm run build
npm run check:public
npm audit --omit=dev --audit-level=high
npm run dev
```

Las pruebas usan PostgreSQL local mediante PGlite y datos sintéticos. Cubren permisos, ámbito por grupo, horas, campañas, vigencias, cierres, correcciones, versiones y auditoría. La revisión de publicación rechaza insumos privados y credenciales de servidor. SheetJS se instala desde su distribución oficial y las versiones están fijadas en el lockfile.

## Publicación y estado

`pages.yml` valida y publica los cambios de `main`; GitHub Pages debe tener seleccionado GitHub Actions como origen. Los cambios de backend se despliegan por separado desde `supabase/functions/s21-api`. Las variables protegidas de Edge Functions incluyen la conexión PostgreSQL y Auth; nunca deben añadirse al código.

La migración inicial crea el esquema, restricciones, catálogos y perfiles. En otra instalación deben autorizarse las cuentas iniciales y cargarse la plantilla y fuentes privadas por separado.

Compilación, pruebas de dominio y PostgreSQL, revisión de publicación y dependencias de producción completadas. La comprobación autenticada del sitio requiere iniciar sesión. Las importaciones se verifican y registran por separado en la base privada.

El asesor de Supabase informa de RLS sin políticas para las tablas privadas: corresponde a la denegación predeterminada. La configuración compartida de Auth conserva un aviso previo de comprobación de contraseñas filtradas; esta entrega no cambia la configuración global del proveedor.


## Exportación para el superintendente

Al entrar a Registros S-21 se debe elegir explícitamente Año 1 y Año 2 de servicio. Se muestran como rangos: 2025-2026 significa septiembre de 2025 a agosto de 2026, y 2026-2027 significa septiembre de 2026 a agosto de 2027. El primer registro va arriba y el segundo abajo, en A4. Se conserva el nombre completo dentro del formulario y APODO.pdf como archivo; los apodos repetidos en una carpeta llevan el código.

El preset de envío crea, en orden, Grupo 1, Grupo 2, Grupo 3, Grupo 4, Grupo 5, Grupo 6, Grupo Precursores regulares, especiales y misioneros, e Inactivos. Cada publicador aparece una vez. Los inactivos tienen prioridad sobre el tipo de predicación y la organización utiliza las vigencias al corte.

## Dashboard y aplicación móvil

El dashboard utiliza exclusivamente meses calendario terminados. El 16/11/2026 incluye septiembre y octubre en el año de servicio 2026-2027 y excluye noviembre de horas, cursos, participación, pendientes, metas y comentarios. El límite avanza al comenzar el mes siguiente. No reemplaza el cierre administrativo que bloquea la edición de informes.

La web incluye manifiesto PWA, iconos PNG de 192 y 512 píxeles, icono maskable, compatibilidad de pantalla de inicio con iOS y un botón de instalación. Se puede instalar desde el menú de un navegador compatible. Requiere internet para iniciar sesión y trabajar con informes. El service worker conserva únicamente archivos públicos de la interfaz; no guarda respuestas de la API, datos de publicadores ni sesiones. Su ámbito y sus cachés están limitados a /s21-monterrico/ y no interfieren con S-13.

## Alta y restablecimiento de contraseñas

En Usuarios y perfiles, guardar un usuario habilitado prepara su cuenta de Auth cuando todavía no existe. El método Google / Microsoft crea la cuenta sin contraseña y no utiliza una clave inicial. El método de contraseña conserva la clave inicial 1234567890 y exige definir y repetir la contraseña personal: mínimo seis caracteres, una mayúscula, una minúscula, un número y un carácter especial en las comprobaciones del aplicativo. Auth también aplica su política compartida: la observada el 16/11/2026 exige 12 caracteres y las cuatro clases, por lo que rechaza esa clave inicial y contraseñas personales más cortas. Los errores se muestran con ese motivo, sin reducir la política global de S-13.

Al escribir, cada requisito indica Cumple o Falta y se informa si las contraseñas no coinciden. La ayuda explica que un carácter especial es un símbolo y muestra ejemplos: ! @ # $ % & * ?. Los espacios no cuentan como símbolos. El servidor también enumera todos los requisitos pendientes y aporta los ejemplos si falta el símbolo.

El botón Crear acceso permite completar usuarios autorizados antes de esta mejora o reintentar una creación fallida. Restablecer contraseña está limitado al permiso users.write y vuelve a la contraseña inicial, exige otro cambio y bloquea las sesiones anteriores en S-21. Otro administrador debe restablecer la cuenta propia. Si esa cuenta también se utiliza en S-13, el cambio afecta su contraseña compartida; la interfaz lo advierte antes de confirmar.

Eliminar cuenta requiere users.write y confirmación con nombre y correo. Elimina la autorización de S-21, bloquea su acceso de inmediato y libera sus asignaciones actuales como encargado o auxiliar de grupo. Conserva los datos de publicador, informes, historial, auditoría y la identidad de Auth compartida con S-13. Otro administrador debe eliminar la cuenta propia y debe quedar al menos un administrador habilitado. La eliminación verifica la versión del registro y guarda la cuenta y asignaciones anteriores en la auditoría, sin contraseñas.

Los indicadores de cambio obligatorio y la fecha mínima de sesión están en el esquema privado s21. El servidor consulta la sesión autenticada y bloquea estado, informes, PDF, respaldos y mutaciones hasta completar el cambio. Tras cambiar la contraseña se inicia una sesión nueva: otras sesiones abiertas con la clave inicial no adquieren acceso a los datos. Las operaciones de Auth y los flags se coordinan para dejar el acceso bloqueado si falla una actualización. Las contraseñas no se escriben en las tablas de la aplicación, la auditoría ni los registros. Las credenciales administrativas se leen exclusivamente del entorno de Edge Functions.

## Ingreso con Google y Microsoft

Los botones consultan la disponibilidad real de Auth y permanecen deshabilitados con un aviso si falta configurar el proveedor. La activación necesita los Client IDs y secretos de las aplicaciones de Google y Microsoft, más la dirección exacta de retorno de S-21. Instrucciones: [Activar Google y Microsoft](docs/activar-google-microsoft.md).

El retorno utiliza PKCE con un cliente temporal separado de la sesión del aplicativo. Conserva únicamente los verificadores y el identificador de flujo en sessionStorage durante diez minutos, elimina códigos y errores de la dirección y mantiene los tokens en memoria. Microsoft utiliza el scope email. No se solicitan permisos del buzón ni refresh tokens del proveedor.

El servidor verifica la sesión con Auth y consulta su session_id. Solo el método oauth del AMR de ese JWT verificado permite el ingreso externo sin exigir una contraseña local; user_metadata y los nombres de proveedor enviados por el cliente no conceden permisos. La autorización sigue dependiendo del usuario activo, el vínculo de identidad, el perfil y los grupos privados. El cambio obligatorio de una contraseña inicial existente se conserva para futuros ingresos con esa contraseña. Los restablecimientos siguen invalidando las sesiones anteriores en S-21 mediante password_not_before.

Si el usuario se guardó pero falló la creación de Auth, la respuesta distingue ambos resultados, la fila muestra Acceso incompleto y la auditoría conserva un diagnóstico sin contraseñas. Preparar Google / Microsoft puede reintentar sin la clave inicial incompatible y conserva las contraseñas de cuentas compartidas existentes. No requiere migración de base de datos ni activar el registro público.
