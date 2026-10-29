# Alero — especificación del MVP

> Barra superior con pestañas de terminal, siempre encima, que se pliega y se
> abre con un atajo. Inspirada en la isla de Coucou, pero con terminales de
> verdad dentro (Claude Code, PowerShell, cmd).

Proyecto personal de Juan. Carpeta: `C:\Users\juanp\Documents\CLAUDE\Alero`.

---

## 1. Qué es

Una ventana **sin bordes, pegada al borde superior de la pantalla**, siempre por
encima de las demás. Tiene dos estados:

- **Colapsada**: una franja fina (≈32 px) con el nombre de la pestaña activa,
  un indicador de estado y el botón `+`. No intercepta clics fuera de sus
  controles.
- **Expandida**: baja un panel (≈420 px) con la lista de pestañas arriba y la
  terminal activa debajo.

Cada pestaña es una **terminal real** (PTY de Windows / ConPTY), no una imitación.

## 2. Alcance del MVP

Dentro:

- Ventana superior sin bordes, siempre encima, anclada arriba y centrada.
- Colapsar / expandir con atajo global (**Ctrl+Alt+Espacio**).
- Pestañas: crear (`+`), cerrar (`×`), cambiar (`Ctrl+Tab`).
- Tres tipos de pestaña:
  - **Claude Code** → `ollama launch claude --model <modelo>` (modelo elegible).
  - **PowerShell** → `powershell.exe`.
  - **cmd** → `cmd.exe`.
- Terminal con xterm.js: colores, selección, copiar/pegar, scroll, redimensionar.
- Recordar entre arranques: tamaño, estado (colapsada/expandida), pestañas
  abiertas y modelo elegido.
- Icono en la bandeja: mostrar/ocultar, salir.
- Arranque con Windows (interruptor en ajustes, apagado por defecto).

Fuera del MVP (fases siguientes):

- Aprobar permisos de Claude Code desde la barra (hooks).
- Estado de sesiones y diffs.
- Múltiples monitores y configuraciones de pantalla.
- Temas, sonidos, animaciones.
- Auto-update.

## 3. Estados y comportamiento

```
colapsada   ── Ctrl+Alt+Espacio ──►  expandida
expandida   ── Esc / atajo ──────►  colapsada
expandida   ── clic fuera ───────►  se queda (no se cierra sola)
```

- Al colapsar **no se destruyen** las terminales: siguen corriendo.
- Al cerrar la app se pregunta si hay procesos vivos (o se avisa).
- Con la barra colapsada, la ventana debe ser **click-through** salvo en sus
  controles (esto es justo lo que fallaba en Coucou en Windows).
- Sin foco al aparecer si el usuario está escribiendo en otra ventana
  (configurable: `focusOnOpen`, por defecto `false`).

## 4. Atajos

| Atajo | Acción |
|---|---|
| `Ctrl+Alt+Espacio` | Mostrar/ocultar (expandir/colapsar) |
| `Ctrl+Alt+T` | Nueva pestaña |
| `Ctrl+Alt+W` | Cerrar pestaña activa (con confirmación si hay proceso) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Siguiente / anterior pestaña |
| `Esc` | Colapsar |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copiar / pegar en la terminal |

Los atajos son globales solo los tres primeros; el resto funciona con Alero
enfocado (para no robar combinaciones al resto del sistema).

## 5. Arquitectura

```
Alero/
├── package.json
├── ESPECIFICACION.md
├── src/
│   ├── main/            Electron (proceso principal)
│   │   ├── main.js      ventana, bandeja, atajos globales
│   │   ├── window.js    posición, tamaño, colapsar/expandir, click-through
│   │   ├── pty.js       node-pty: crear/redimensionar/matar terminales
│   │   ├── settings.js  persistencia en %APPDATA%\Alero\settings.json
│   │   └── preload.js   IPC seguro (contextBridge)
│   └── renderer/        UI (xterm.js)
│       ├── index.html
│       ├── app.js       pestañas, estados, atajos locales
│       ├── styles.css
│       └── vendor/      xterm.js y addons (fit)
└── assets/              iconos
```

- **Electron** con `contextIsolation: true`, `nodeIntegration: false`.
- **node-pty** en el proceso principal; el renderer solo manda texto y recibe
  salida por IPC (`pty:create`, `pty:input`, `pty:resize`, `pty:exit`).
- **xterm.js** + addon `fit` para redimensionar al panel.
- Sin telemetría. Sin red salvo Ollama local.

## 6. Persistencia

`%APPDATA%\Alero\settings.json`:

```json
{
  "expanded": false,
  "height": 420,
  "width": 900,
  "opacity": 0.97,
  "focusOnOpen": false,
  "autostart": false,
  "claudeModel": "deepseek-v4.1-flash:1017-cloud",
  "tabs": [
    { "type": "claude", "title": "Claude Code" }
  ]
}
```

Las pestañas se recrean al arrancar (no se guarda el contenido del scroll).

## 7. Requisitos

- Windows 10/11.
- Node.js LTS (para desarrollar y empaquetar).
- Ollama corriendo en `127.0.0.1:11434` para las pestañas de Claude Code.
- MSVC Build Tools **solo si** node-pty no trae binario precompilado.

## 8. Criterios de aceptación (MVP)

1. `npm start` abre la barra arriba, colapsada, sin bordes.
2. `Ctrl+Alt+Espacio` despliega y pliega sin perder las terminales.
3. En una pestaña "Claude Code" se puede ejecutar `claude` y usar Ollama.
4. `+` crea una pestaña PowerShell funcional; `×` la cierra.
5. La barra colapsada **no bloquea clics** fuera de sus controles.
6. Al reiniciar, vuelve el mismo tamaño, estado, pestañas y modelo.
7. Cerrar la app mata los procesos hijos (sin terminales huérfanas).

## 9. Riesgos conocidos

- **node-pty**: puede requerir compilación nativa en Windows.
- **Click-through**: en Electron se resuelve con `setIgnoreMouseEvents`; hay que
  calcular las zonas activas con cuidado (es el bug que sufrimos en Coucou).
- **Siempre encima**: algunas apps a pantalla completa (juegos) pueden taparlo.
- **Arranque con Windows**: se hará con el registro (`HKCU\...\Run`), sin
  instalador al principio.
