# Alero

Barra superior para Windows con pestañas de **terminal real**, siempre encima.
Se pliega a una píldora, se abre con un atajo y avisa cuando Claude Code termina,
pide permiso o te hace una pregunta.

Cada pestaña es una terminal de verdad (ConPTY a través de `node-pty`), no una
imitación: puede correr Claude Code, PowerShell, `cmd`, `ssh` o lo que
configures.

```
        ┌────────────────────────────────────┐
        │            ▽  Alero                │   plegada (128 × 40)
        └────────────────────────────────────┘
                     ↓  Ctrl+Alt+Espacio
┌──────────────────────────────────────────────────────┐
│ 🐷 Claude Code ×   ● SSH ×   ● Git ×            + ⚙ ^ │   abierta
├──────────────────────────────────────────────────────┤
│  > ollama launch claude                              │
│  █ trabajando…                                       │
└──────────────────────────────────────────────────────┘
                     ↓  cuando Claude te necesita
        ┌────────────────────────────────────────┐
        │        🐷  Claude Code  ×              │   asomada (520 × 112)
        ├────────────────────────────────────────┤
        │ ●  Pide permiso      [Permitir][Denegar]│
        │    npm run build · Claude Code          │
        └────────────────────────────────────────┘
```

## Características

- **Pestañas de terminal reales** con ConPTY: crear, cambiar, cerrar, reordenar
  arrastrando y renombrar con doble clic.
- **Perfiles** configurables: logo, color, nombre, shell, carpeta de trabajo y
  comando. Cada perfil es una entrada del menú `+`.
- **Avisos de Claude Code**: notificación compacta y **Permitir / Denegar** sin
  salir de lo que estás haciendo.
- **Atajos configurables** grabando la combinación, con dos globales.
- **Plegado automático** opcional por cambio de ventana o por inactividad.
- **Panel redimensionable** en alto, con el tamaño recordado.
- Bandeja del sistema, arranque con Windows (opcional) y estados vacíos con la
  marca de Alero.
- Sin telemetría ni peticiones externas: las fuentes van incluidas.

## Instalación

### Instalador

Descarga `Alero-Setup-0.2.0.exe` (o compílalo, ver abajo) y ejecútalo. Se instala
por usuario, sin permisos de administrador, con accesos en el escritorio y en el
menú de inicio. El instalador **no está firmado**, así que Windows mostrará el
aviso de SmartScreen la primera vez: *Más información → Ejecutar de todas
formas*.

### Desde el código

Requiere **Node.js LTS** (probado con 26.x) y Windows 10/11.

```bash
npm install
npm start
```

Para abrirlo sin consola, crea un acceso directo a
`node_modules\electron\dist\electron.exe` con el argumento `"C:\ruta\a\Alero"` y
el directorio de trabajo en esa misma carpeta.

### Compilar el instalador

```bash
npm install
npx electron-builder --win nsis --x64
```

Queda en `dist\Alero-Setup-<versión>.exe`. El proyecto ya configura
`npmRebuild: false` (el binario de `node-pty` que se instala funciona en
Electron) y `asar: false` (el hook de los avisos debe existir como archivo real).

## Uso

| Atajo | Acción |
|---|---|
| `Ctrl+Alt+Espacio` | Mostrar / plegar |
| `Ctrl+Alt+T` | Nueva pestaña: abre el menú `+` |
| `Ctrl+Shift+W` | Cerrar la pestaña actual (pide confirmación si la sesión sigue viva) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Siguiente / anterior pestaña |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copiar / pegar en la terminal |
| `Esc` | Cerrar menú o ajustes, plegar |

También: clic en la barra para desplegar, `+` para elegir perfil y `⚙` para
abrir los ajustes. En el menú `+` se puede navegar con flechas, `Home`/`End`,
`Enter`, los números `1`…`9` y `Esc`.

### Atajos configurables

En **⚙ → Atajos** se pulsa la combinación y se graba con el teclado (`Esc`
cancela). Los dos primeros son **globales** (Windows los registra y funcionan con
cualquier app); el resto solo con Alero enfocado.

Si Windows no deja registrar una combinación, se avisa en pantalla y **se
mantiene la anterior**: nunca te quedas sin atajo.

## Perfiles

Cada entrada del menú `+` es un perfil. Se edita en **⚙ → Perfiles**:

| Campo | Qué hace |
|---|---|
| Logo | Imagen propia (PNG, JPG, WEBP, SVG o ICO) que se muestra en la barra y en la pestaña |
| Color | Punto de la pestaña y del menú |
| Nombre | Lo que se ve en la pestaña y en el menú |
| Shell | `PowerShell` o `cmd`: dónde se escribe el comando |
| Carpeta | Dónde arranca la terminal. Vacío = carpeta del usuario |
| Comando | Se escribe al abrir la pestaña. Vacío = shell limpia |

Ejemplos:

| Nombre | Carpeta | Comando |
|---|---|---|
| Claude Code | — | `ollama launch claude --model <modelo>` |
| SSH servidor | — | `ssh usuario@servidor` |
| Proyecto | `C:\ruta\al\proyecto` | `claude` |
| Git | `C:\ruta\al\proyecto` | `git status` |

La carpeta **no cambia los permisos**: el comando corre con tu usuario de
Windows y puede leer y escribir donde tú puedas. Solo cambia la carpeta por
defecto y el «workspace» que pide confiar la primera vez.

«Restaurar por defecto» vuelve a Claude Code / PowerShell / cmd.

## Avisos de Claude Code

En **⚙ → Avisos → Instalar** se registran los hooks en
`~/.claude/settings.json`. Antes de escribir se muestra el bloque exacto y se
hace un backup fechado; el mismo botón los quita y solo toca sus propias
entradas.

- **Eventos**: terminó el turno (`Stop`), pide permiso (`PermissionRequest`),
  hace una pregunta (`AskUserQuestion`) y espera que escribas (`Notification`).
  Se activan por evento y por perfil.
- **Permisos**: la notificación ofrece **Permitir**, **Denegar** y **Cerrar**
  (esta última deja que Claude pregunte en la terminal). Nada se permite sin un
  clic.
- **Sonido** y **duración** del aviso, configurables.
- El hook corre con el Electron que ya incluye la app, avisa por un canal local
  y **nunca bloquea**: si Alero está cerrado, sale en silencio.

## Comportamiento de la barra

- **Plegada** muestra solo la marca. Al abrir, la barra se estira y el panel baja
  con una animación corta; las terminales siguen corriendo mientras está
  plegada.
- **Plegado automático** (**⚙ → Barra**): dos reglas independientes y
  combinables —al pasar a otra ventana y tras N segundos sin actividad (10 por
  defecto, se reinicia al usar la barra)—. Nunca ocurre con un aviso pendiente,
  con Ajustes abierto o grabando un atajo.
- **Alto del panel**: se cambia arrastrando el borde inferior (el ancho queda
  fijo) y se recuerda entre arranques.

## Datos y privacidad

- Ajustes: `%APPDATA%\Alero\settings.json`
- Logos: `%APPDATA%\Alero\logos\`
- Canal de los avisos: `%APPDATA%\Alero\hook.json` (pipe y token locales)
- No hay telemetría. Las únicas conexiones son las que configures tú (por
  ejemplo, Ollama en `127.0.0.1:11434`).

Al cerrar la app o reiniciar el equipo vuelven las pestañas, sus nombres, el
orden y la configuración. **No** se conserva el contenido de las terminales ni
las sesiones en curso: cada pestaña abre una consola limpia y relanza su comando.

## Interfaz

Dirección visual **data-terminal**: cromo oscuro neutro, el área de trabajo un
paso más oscura que el suelo y una sola línea de acento de 1 px —el alero— como
única marca de selección. El color de cada perfil es lo único que aporta color a
la barra, porque identifica al perfil.

- Texto en **Public Sans** y terminal en **JetBrains Mono**, incluidas en
  `src/renderer/fonts/` (SIL OFL).
- Radios: 8 en paneles, 6 en controles, píldora en los botones.

## Estructura

```
src/main/      ventana, animaciones, atajos, avisos, hooks, PTY y ajustes
src/hook/      el hook que ejecuta Claude Code
src/renderer/  barra, pestañas, notificación, ajustes, fuentes y xterm
assets/        iconos
```

## Estado

Versión **0.2.0** (octubre 2026). Funcionando a diario: pestañas reales,
perfiles con logo, atajos configurables, avisos con Allow/Deny, plegado
automático e instalador.

Pendiente:

- Varios monitores.
- Confirmación al cerrar la app con sesiones vivas.
- Auto-actualización.

Ver [`ESPECIFICACION.md`](ESPECIFICACION.md) para el detalle.

## Licencia

MIT. Ver [`LICENSE`](LICENSE).

Incluye xterm.js y @xterm/addon-fit (MIT), Electron (MIT) y node-pty (MIT).
Public Sans y JetBrains Mono se distribuyen bajo SIL OFL; sus licencias están en
`src/renderer/fonts/`.
