# CAOS: Noche de supervivencia + duelo online 1 vs 1

Proyecto web con dos modos:

- **Jugar en solitario:** conserva el juego de supervivencia original.
- **Jugar online:** permite encontrar otro jugador conectado y combatir en una arena 1 vs 1.

El modo online usa Node.js, Express y Socket.IO. La base de datos todavía no se conecta: los nombres y las partidas existen solo mientras las conexiones están activas.

## Requisitos

- Node.js 18 o superior.
- Conexión a internet para descargar las dependencias la primera vez.

## Ejecutar localmente

Abre PowerShell en la carpeta raíz del proyecto y ejecuta:

```powershell
npm install
npm start
```

Luego abre `http://localhost:3000` en el navegador. Para probar el modo online, abre esa dirección en dos ventanas o navegadores distintos. En cada una escribe un nombre diferente, entra en **Jugar online** y pulsa **Buscar rival**.

## Controles del duelo online

- `W`, `A`, `S`, `D` o flechas: moverse.
- Mantener clic izquierdo o `ESPACIO`: disparar continuamente.
- La mira apunta automáticamente hacia el rival.
- En pantallas táctiles hay un joystick de movimiento y un botón de disparo.

## Archivos principales

- `index.html`: estructura de la web y pantallas.
- `css/styles.css`: estilos.
- `js/game.js`: modo de supervivencia individual.
- `js/lobby.js`: entrada y nombre visible del jugador.
- `js/online.js`: cliente del modo online.
- `server.js`: emparejamiento y simulación del duelo en el servidor.
- `package.json`: dependencias y comandos de ejecución.

## Publicación

GitHub puede almacenar el código, pero GitHub Pages no ejecuta `server.js`. Para que el modo online funcione desde internet, despliega el proyecto completo en un servicio que ejecute Node.js y mantenga el servidor activo. La URL del juego online debe apuntar a ese servidor. La base de datos puede conectarse más adelante.

## Nota de seguridad

El nombre de jugador es solo un nombre visible temporal; no es una cuenta autenticada. No se solicitan contraseñas y no se guardan estadísticas en una base de datos.
