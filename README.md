# S-21 Monterrico

Gestión de publicadores, grupos, informes mensuales y exportaciones S-21. Interfaz anaranjada para web y móvil, perfiles por grupo, auditoría y protección frente a cambios simultáneos.

**Sitio:** https://brancoretto24102-ui.github.io/s21-monterrico/

## Acceso y uso

Ingresa con el mismo correo y contraseña de S-13 Monterrico. Los permisos de S-21 son independientes: el administrador autoriza cada correo, perfil y grupos. Guardar un usuario no crea contraseñas ni envía invitaciones. La sesión permanece en memoria; al recargar se solicita iniciar sesión nuevamente. No existe promoción automática del primer visitante.

- Maestros de publicadores, grupos, perfiles, clasificaciones, estados y predicación. Encargado y auxiliar vinculados a usuarios habilitados.
- Recepción mensual por grupo: participación sí/no, cursos bíblicos, comentarios y horas cuando corresponde al tipo vigente. Los borradores, pendientes y la respuesta NO se distinguen.
- Campañas y responsabilidades con meses inclusivos y metas versionadas. Año de servicio 2026: septiembre de 2025–agosto de 2026; 2027: septiembre de 2026–agosto de 2027.
- Correcciones autorizadas con motivo, solicitudes de encargados, períodos cerrados y auditoría.
- Dashboard con filtros por año, mes, grupo y persona; horas, metas, cursos-mes, participación y estados.
- PDF individual y ZIP masivo: apodos, dos años por registro, corte y organización seleccionables. Plantilla y fuentes privadas disponibles solo con permiso de exportación.
- Importación del Excel DATA/GRUPOS/HORAS con previsualización y revisión de conflictos; respaldos JSON.

La carga de los registros originales es un paso independiente de la publicación del código. La importación está preparada; los datos del Excel no se han trasladado a este alojamiento.

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

Compilación, pruebas de dominio y PostgreSQL, revisión de publicación y dependencias de producción completadas. La comprobación autenticada del sitio requiere iniciar sesión. La migración de los registros originales está pendiente de autorización del propietario.

El asesor de Supabase informa de RLS sin políticas para las tablas privadas: corresponde a la denegación predeterminada. La configuración compartida de Auth conserva un aviso previo de comprobación de contraseñas filtradas; esta entrega no cambia la configuración global del proveedor.
