# Invitado y filtros de consulta

El perfil Invitado permite consultar Dashboard, Registros S-21, Publicadores y Grupos. Puede descargar PDF individuales y ZIP, incluyendo las observaciones del registro. Las operaciones de edición, administración, importación, revisión de correcciones y respaldo se rechazan desde el servidor.

El identificador de ingreso es `invitado`. Resuelve la cuenta técnica existente de Monterrico y conserva su contraseña. La autorización de S-21 reside en `s21.users`; eliminarla conserva la cuenta compartida y el acceso de otros aplicativos.

Publicadores permite combinar búsqueda, grupo, tipo de predicación y estado. Registros S-21 usa los mismos filtros y toma grupo, estado y predicación de sus vigencias en la fecha de corte. El PDF o ZIP incluye únicamente los publicadores seleccionados que permanecen visibles en la selección filtrada.

Los permisos específicos `publishers.read` y `groups.read` permiten mostrar esas secciones sin habilitar la configuración de tipos. El permiso existente `masters.read` conserva su compatibilidad con ambas consultas.
