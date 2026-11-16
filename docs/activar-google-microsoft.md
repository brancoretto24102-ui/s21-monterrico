# Activar Google y Microsoft en S-21

El código permite ambos ingresos, pero los botones solo se habilitan cuando el proveedor correspondiente está configurado en Supabase Auth. La configuración requiere acceso administrativo a las aplicaciones de Google Cloud y Microsoft Entra. Los secretos se guardan directamente en el proveedor de Supabase; no se publican en GitHub ni se comparten por chat.

## Direcciones de esta aplicación

| Uso | Dirección exacta |
| --- | --- |
| Origen web | `https://brancoretto24102-ui.github.io` |
| Regreso al aplicativo | `https://brancoretto24102-ui.github.io/s21-monterrico/` |
| Callback del proveedor | `https://lexohsdrmgunjacocxtx.supabase.co/auth/v1/callback` |

En Authentication → URL Configuration de Supabase, agregar la dirección exacta de regreso a Redirect URLs. Conservar las direcciones y el Site URL de S-13, que comparte este proyecto. El cliente mantiene el identificador del flujo en la pestaña; no necesita comodines en las direcciones permitidas.

## Google

1. En Google Cloud / Google Auth Platform, crear o seleccionar el proyecto de la aplicación y configurar la pantalla de consentimiento.
2. Elegir una audiencia que incluya a los usuarios previstos. Si la aplicación está en Testing, agregar sus cuentas como usuarios de prueba o completar la publicación que corresponda.
3. Crear un OAuth Client ID de tipo Web application.
4. Agregar el origen web y el callback exacto de la tabla anterior.
5. En Supabase → Authentication → Sign In / Providers → Google, guardar el Client ID y Client Secret, y habilitar Google.
6. Utilizar únicamente los permisos básicos de identidad: openid, email y profile.

Referencia oficial: https://supabase.com/docs/guides/auth/social-sign-in/auth-google

## Microsoft

1. En Microsoft Entra ID → App registrations, registrar la aplicación.
2. Elegir cuentas de cualquier directorio organizacional y cuentas Microsoft personales si se necesita admitir Outlook, Hotmail y Microsoft 365 de distintas organizaciones.
3. Agregar una plataforma Web con el callback exacto de la tabla.
4. Crear un Client Secret. Guardar su valor directamente en Supabase y registrar su fecha de vencimiento para renovarlo antes de que caduque.
5. Configurar los claims opcionales email y xms_edov siguiendo la guía oficial. Mantener deshabilitada la aceptación de dominios de correo no verificados.
6. En Supabase → Authentication → Sign In / Providers → Azure (Microsoft), guardar el Application / Client ID y el Client Secret. Para la audiencia del paso 2, utilizar el tenant common: `https://login.microsoftonline.com/common`.
7. Habilitar Microsoft. El aplicativo solicita el scope email, además de los permisos de identidad que utiliza el proveedor; no pide acceso al buzón.

Exchange Online / Microsoft 365 funciona mediante la identidad Microsoft de la organización y queda sujeto a sus políticas de consentimiento. Un servidor Exchange propio necesita una identidad compatible con Entra o una integración de identidad aparte; el dominio de correo por sí solo no habilita este ingreso.

Referencia oficial: https://supabase.com/docs/guides/auth/social-sign-in/auth-azure

## Preparar las cuentas autorizadas

El registro público permanece cerrado. Antes del primer ingreso, el administrador autoriza el correo exacto, perfil y grupos en Usuarios y perfiles. En cuentas nuevas, elegir «Google o Microsoft (sin clave inicial)». En cuentas incompletas, usar «Preparar Google / Microsoft».

La operación crea una identidad de Auth sin contraseña, o vincula la identidad que ya exista sin cambiar su contraseña. Conserva el vínculo de publicador, los grupos, el perfil y los informes. Si una cuenta existente tiene pendiente cambiar su contraseña inicial, el ingreso con esa contraseña sigue bloqueado; la sesión OAuth comprobada por Auth puede acceder con los permisos previamente autorizados.

El usuario elige la misma cuenta autorizada al pulsar Continuar con Google o Continuar con Microsoft. Una cuenta no autorizada o inactiva no adquiere acceso a S-21 por autenticarse con un proveedor.

## Cuentas que quedaron incompletas por la clave inicial

La política compartida observada el 16/11/2026 exige un mínimo de 12 caracteres, mayúscula, minúscula, número y símbolo. Por eso rechaza la clave inicial numérica 1234567890, y también puede rechazar una contraseña personal de seis caracteres aunque cumpla las comprobaciones del aplicativo. Esta entrega conserva la política compartida y presenta el motivo real del rechazo.

«Preparar Google / Microsoft» permite completar esas cuentas sin una contraseña inicial. Para conservar el ingreso tradicional con la clave 1234567890, primero debe resolverse expresamente su incompatibilidad con la política compartida; no se aplican excepciones ni se modifican contraseñas existentes para ocultar ese conflicto.

## Verificación de activación

1. Actualizar S-21 y verificar que el proveedor configurado aparezca habilitado.
2. Preparar una cuenta autorizada y comprobar que su estado deje de ser Acceso incompleto.
3. El titular completa el ingreso desde su propia cuenta Google o Microsoft; confirmar el retorno a S-21 y el perfil y grupos esperados.
4. Confirmar que una cuenta no autorizada o inactiva no pueda ver informes.

El retorno usa PKCE. Solo los verificadores temporales y el identificador del flujo permanecen en sessionStorage hasta diez minutos. Las sesiones y los tokens del aplicativo permanecen en memoria; recargar exige volver a iniciar sesión.
