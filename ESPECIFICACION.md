# Alero — especificación

> Barra superior con pestañas de terminal, siempre encima, que se pliega a una
> píldora y se abre con un atajo. Avisa cuando Claude Code termina, pide permiso
> o pregunta algo, y deja responder desde la propia barra.

Proyecto personal de Juan. Carpeta: `C:\Users\juanp\Documents\CLAUDE\Alero`.
Versión: **0.2.1**.

---

## 1. Qué es

Una ventana **sin bordes, pegada al borde superior**, siempre por encima. Tiene
tres formas:

| Estado | Tamaño | Qué muestra |
|---|---|---|
| **Plegada** | 128 × 40 | Marca y nombre de Alero |
| **Abierta** | 900 × alto configurable | Barra con logo del perfil y pestañas, terminal debajo |
| **Asomada** | 520 × 112 | Solo la notificación: pestaña activa arriba y el aviso debajo |

Cada pestaña es una **terminal real** (ConPTY), no una imitación.

## 2. Alcance actual

- Ventana superior sin bordes, siempre encima, centrada; animación en dos fases
  al abrir y cerrar.
- **Perfiles** (cada entrada del menú `+`): logo, color, nombre, shell
  (PowerShell o cmd), carpeta de trabajo y comando.
- Pestañas: crear, cambiar, cerrar (con confirmación si la sesión sigue viva) y
  restaurar al arrancar.
- **Atajos configurables** con grabación; globales los dos primeros.
- **Avisos de Claude Code** por hooks, con Allow/Deny, sonido y duración.
- **Plegado automático** opcional por foco o por inactividad.
- Alto del panel arrastrable y recordado; ancho fijo.
- Bandeja del sistema y arranque con Windows (apagado por defecto).
- Estados vacíos con la marca de Alero cuando no hay pestañas o perfiles.

Fuera de alcance por ahora: reordenar o renombrar pestañas, varios monitores,
instalador, auto-actualización, integraciones de terceros.

## 3. Comportamiento

```
plegada ── atajo/clic ──► abierta ── Esc/atajo ──► plegada
abierta ── aviso ──────► asomada ── Abrir ───────► abierta
                       └─ Cerrar/8 s ────────────► plegada
```

- Al plegar **no se destruyen** las terminales: siguen corriendo.
- Con la barra plegada, la ventana mide solo 128 px: no hay zona invisible que
  coma clics (el fallo clásico de estas apps).
- **Plegado automático**: dos reglas independientes y combinables —al perder el
  foco y tras N segundos sin actividad (10 por defecto, se reinicia al usar la
  barra)—. Nunca ocurre con un aviso pendiente, con Ajustes abierto o grabando
  un atajo.
- Cerrar una pestaña viva pide confirmación; `Esc` cancela, `Enter` confirma.

## 4. Atajos (configurables)

| Atajo por defecto | Acción | Ámbito |
|---|---|---|
| `Ctrl+Alt+Espacio` | Mostrar / plegar | Global |
| `Ctrl+Alt+T` | Nueva pestaña (abre el menú) | Global |
| `Ctrl+Shift+W` | Cerrar la pestaña actual | Con Alero enfocado |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Siguiente / anterior | Con Alero enfocado |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copiar / pegar | Con Alero enfocado |
| `Esc` | Cerrar menú, ajustes o plegar | Fijo |

En el menú `+`: flechas, `Home`/`End`, `Enter`, `1`…`9` y `Esc`.

## 5. Avisos

- Se instalan desde **⚙ → Avisos** con vista previa del bloque y backup fechado;
  se quitan con el mismo botón y solo tocan sus propias entradas.
- Eventos: `Stop`, `Notification`, `PermissionRequest`, `PreToolUse` de
  `AskUserQuestion`. Se activan por evento y por perfil.
- El hook corre con el Electron incluido, avisa por un pipe local con token y
  **nunca bloquea**: sin app sale en silencio; un permiso espera como máximo
  115 s antes de devolver el control a la terminal.
- En permisos: **Permitir** (`allow`), **Denegar** (`deny`) y **Cerrar** (deja que
  Claude pregunte en la terminal). Nada se permite sin un clic humano.

## 6. Arquitectura

```
Alero/
├── package.json · ESPECIFICACION.md · README.md · LICENSE
├── src/main/
│   ├── main.js       ventana, animaciones, atajos, bandeja, IPC
│   ├── alerts.js     pipe local de avisos
│   ├── hooks.js      instalar/quitar hooks en ~/.claude/settings.json
│   ├── pty.js        sesiones ConPTY
│   ├── settings.js   persistencia y migración
│   └── preload.js    puente contextBridge
├── src/hook/alero-hook.js   lo que ejecuta Claude Code
├── src/renderer/     barra, pestañas, aviso, vistas de ajustes y fuentes
└── assets/icon.png
```

- **Electron** con `contextIsolation`, `nodeIntegration: false`.
- **node-pty** en el proceso principal; el renderer solo manda texto y recibe
  salida por IPC.
- **xterm.js** + `fit`; se reajusta al terminar las animaciones y con la fuente
  cargada.
- Sin telemetría ni peticiones externas: fuentes empaquetadas y, en las pestañas
  de Claude Code, solo Ollama local.

## 7. Persistencia

`%APPDATA%\Alero\settings.json`:

```json
{
  "expanded": false,
  "width": 900,
  "height": 420,
  "focusOnOpen": true,
  "autostart": false,
  "collapse": { "onBlur": true, "idle": true, "idleSeconds": 10 },
  "shortcuts": { "toggle": "Control+Alt+Space", "newTab": "Control+Alt+T" },
  "alerts": { "sound": true, "approve": true, "seconds": 8,
              "events": { "stop": true, "permission": true, "question": true, "notification": true },
              "profiles": {} },
  "profiles": [
    { "id": "claude", "label": "Claude Code", "shell": "powershell",
      "cwd": "", "command": "ollama launch claude", "color": "#c2703f",
      "logo": "logos/logo-xxxx.png" }
  ],
  "tabs": [{ "profile": "claude", "label": "Claude Code" }]
}
```

Los logos se copian a `%APPDATA%\Alero\logos\`. El hook lee
`%APPDATA%\Alero\hook.json` (pipe y token) en cada arranque.

## 8. Requisitos

- Windows 10/11.
- Node.js LTS para desarrollar (en este equipo se usa uno portable en `tools/`).
- Ollama en `127.0.0.1:11434` para los perfiles de Claude Code.
- MSVC Build Tools solo si `node-pty` no trae binario precompilado.

## 9. Criterios de aceptación

1. `npm start` (o el acceso directo) abre la píldora arriba, sin bordes.
2. `Ctrl+Alt+Espacio` abre y pliega sin perder las terminales, con animación.
3. Una pestaña Claude Code ejecuta `ollama launch claude` y la terminal responde.
4. `+` abre perfiles; `×` pide confirmación si la sesión está viva.
5. La píldora de 128 px no bloquea clics fuera de ella.
6. Al reiniciar vuelven tamaño, estado, pestañas, perfiles y atajos.
7. Con los avisos instalados, un permiso de Claude Code muestra Permitir/Denegar
   y la decisión llega al hook.
8. Nada se envía fuera del equipo salvo lo que el usuario configure (Ollama).

## 10. Riesgos conocidos

- **node-pty**: puede requerir compilación nativa en Windows.
- **Siempre encima**: algunas apps a pantalla completa pueden taparlo.
- **Hooks**: si el usuario borra `alero-hook.cmd` a mano, los avisos dejan de
  llegar hasta que se reinstalen.
- **Un solo monitor**: todo se ancla al primario.
