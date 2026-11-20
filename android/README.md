# Procesador de texto para Android

La APK se encuentra en `dist/Procesador-de-texto.apk` en la raíz del proyecto. Copia el archivo al teléfono y ábrelo desde Archivos. Android puede pedir autorización para instalar desde esa aplicación. Se requiere Android 8.0 o posterior. Para leer documentos DOCX comprimidos, utiliza una versión actual de Android System WebView.

## Editar y guardar

Toca el documento para escribir. Mantén pulsada una palabra para seleccionarla. Con dos dedos puedes ampliar o reducir la página. Con **Cinta** activa, toca **Archivo**, **Insertar** u otra pestaña para ver sus botones. Con la cinta plegada, las pestañas vuelven a abrir su menú vertical.

**Archivo › Mis documentos** abre la biblioteca local. **Archivo › Abrir** permite elegir un archivo. **Archivo › Descargar como** guarda una copia en la ubicación que elijas. Para crear un PDF, elige el formato PDF y selecciona **Guardar como PDF** en el diálogo de impresión de Android. Conserva una copia de los documentos que quieras mantener antes de desinstalar la aplicación.

La edición funciona sin conexión. Para usar IA, configura tu proveedor en el menú IA. Las conexiones remotas requieren HTTPS y que el servicio acepte solicitudes desde el origen `https://appassets.androidplatform.net`. En el teléfono, `localhost` corresponde al teléfono. La lectura y el dictado dependen de los servicios de voz instalados.

## Reconstruir

Desde la raíz del proyecto, con PowerShell, JDK 17 o posterior, Android SDK Platform 36 y Build Tools 36.1.0, ejecuta:

```powershell
.\android\build.ps1 -Sdk 'C:\ruta\al\Android\Sdk' -Jdk 'C:\ruta\al\jdk'
```

El script toma el editor de `index.html`, `js` y `css`; añade los controles móviles, compila el paquete `com.procesadordetexto.android` y verifica su firma. Conserva una copia privada de `android/.signing/` para firmar las actualizaciones con la misma clave.
