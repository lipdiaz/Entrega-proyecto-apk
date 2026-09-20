# Control de Acceso al Búnker — HEGC

Aplicación Android para tablet o celular del **Centro de Radioterapia Infantojuvenil HEGC**.

## Funciones incluidas

- Registro de entrada y salida mediante RUT.
- Personal autorizado y visitantes/no autorizados.
- Motivo de ingreso y empresa/servicio para Mantención y Visita técnica.
- Detección de personas actualmente dentro.
- Eliminación de personas sin borrar sus accesos históricos.
- Panel administrador e informes por periodo.
- Exportación PDF y Excel.
- Configuración SMTP posterior desde la propia APK.
- Envío inmediato de informes al correo configurado.
- Programación mensual por día, último día del mes o último día de semana seleccionado.
- Datos locales cifrados mediante Android Keystore.
- Funcionamiento de registro sin conexión.
- Respaldo y restauración mediante archivo JSON.
- Cambio de contraseña administrativa.

## Cuenta administrativa inicial

Al abrir la APK por primera vez, la aplicación obliga a crear el nombre, usuario y contraseña del administrador. No incluye una contraseña predeterminada. La clave debe tener al menos ocho caracteres y queda cifrada en el dispositivo.

## Configuración posterior del correo

Desde **Administración → Correo e informes** se ingresan:

1. Servidor SMTP.
2. Puerto.
3. Seguridad STARTTLS o SSL/TLS.
4. Remitente autorizado.
5. Usuario SMTP.
6. Contraseña SMTP.
7. Uno o más destinatarios separados por punto y coma.
8. Fecha, hora y formatos del envío mensual.

La contraseña SMTP se almacena cifrada con una clave no exportable del Android Keystore. No forma parte del código fuente ni del respaldo JSON.

## Consideraciones de programación local

Los registros se mantienen únicamente en el dispositivo. El trabajo mensual queda persistido mediante Android WorkManager y requiere conexión de red. Android puede aplazarlo si el dispositivo está apagado, sin conexión o sometido a restricciones de batería; se ejecutará cuando se recuperen las condiciones necesarias.

## Compilar en Android Studio

1. Abrir esta carpeta en Android Studio.
2. Esperar la sincronización de Gradle.
3. Seleccionar **Build → Build APK(s)**.
4. El APK de prueba quedará en `app/build/outputs/apk/debug/app-debug.apk`.

Si Android Studio había abierto una versión anterior del proyecto, después de reemplazarla use **File → Sync Project with Gradle Files** y luego **Build → Clean Project** antes de volver a compilar. La sintaxis de los archivos Gradle está actualizada para no generar las advertencias `propName value` mostradas por Gradle 9.

La versión de prueba usa el identificador `cl.hegc.radioterapia.acceso`. Para una entrega productiva, el HEGC debe conservar el certificado de firma y su contraseña en custodia institucional.

## Compilación automática

El proyecto incluye `.github/workflows/build-apk.yml`. Al subirlo a GitHub, el flujo compila el APK de prueba y lo deja como artefacto descargable.

## Recomendaciones antes de uso real

- Validar con informática del HEGC que el SMTP acepte conexiones desde la red de la tablet.
- Guardar la contraseña administrativa en un medio institucional seguro.
- Desactivar optimización de batería para esta aplicación si se usará el envío mensual local.
- Ejecutar una prueba de correo y revisar PDF/Excel antes de activar la programación.
- Definir custodia y periodicidad del respaldo de los registros.
- No utilizar el sistema como reemplazo de controles de protección radiológica, dosimetría o enclavamientos del búnker.
