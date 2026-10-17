# CAOS: Noche de supervivencia

Juego arcade de supervivencia hecho con HTML, CSS y JavaScript puro. No necesita librerías, instalación, servidor ni claves API.

## Cómo jugar localmente

1. Descarga o descomprime la carpeta.
2. Abre `index.html` en un navegador moderno.
3. Pulsa **Iniciar supervivencia**.

## Controles

- **W, A, S, D** o flechas: moverse.
- **Espacio**: dash (impulso evasivo; tiene tiempo de recarga).
- **P** o **Esc**: pausa.
- El personaje dispara automáticamente al enemigo más cercano.
- Al subir de nivel, elige una de las tres mejoras. También puedes elegirla con las teclas 1, 2 o 3.
- En pantallas táctiles aparecen un joystick, un botón de dash y un botón de disparo.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub, por ejemplo `caos-noche-supervivencia`.
2. Sube `index.html` y `README.md` a la raíz del repositorio (la carpeta principal).
3. Abre **Settings → Pages**.
4. En **Build and deployment**, elige **Deploy from a branch**.
5. Selecciona la rama `main` y la carpeta `/ (root)`, y guarda.
6. Cuando GitHub Pages termine de publicar, mostrará una URL parecida a `https://TU-USUARIO.github.io/caos-noche-supervivencia/`.

El récord se guarda en `localStorage` del navegador de cada jugador. No hay servidor ni clasificación global compartida.
