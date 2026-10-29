# Alero

Barra superior con pestañas de terminal para Windows. Se queda siempre encima,
se pliega a una franja fina y se abre con un atajo de teclado.

Cada pestaña es una **terminal real** (ConPTY a través de `node-pty`), no una
imitación: puedes correr Claude Code, PowerShell, cmd, `ssh` o lo que quieras.

```
┌──────────────────────────────────────────────┐
│  ● Alero   ● Claude Code ×   ● SSH ×      + ⚙ –│  ← colapsada
└──────────────────────────────────────────────┘
                       ↓ Ctrl+Alt+Espacio
┌──────────────────────────────────────────────┐
│  [ Claude Code × ] [ SSH servidor × ] [ + ]  │
│  > claude                                    │
│  █ trabajando…                               │
└──────────────────────────────────────────────┘
```

## Uso

| Atajo | Acción |
|---|---|
| `Ctrl+Alt+Espacio` | Mostrar / plegar |
| `Ctrl+Alt+T` | Nueva pestaña (abre el menú) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cambiar de pestaña |
| `Ctrl+Shift+W` | Cerrar la pestaña actual (mata su sesión) |
| `Esc` | Plegar |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copiar / pegar en la terminal |

También: clic en la barra para desplegar, `+` para elegir perfil y `⚙` para
editar perfiles y atajos.

## Atajos configurables

En `⚙ → Atajos` se pulsa la combinación y se graba con el teclado (`Esc`
cancela). Los dos primeros son **globales** (Windows los registra y funcionan
con cualquier app); el resto solo con Alero enfocado.

Si Windows no deja registrar una combinación (otra app la tiene), se avisa en
pantalla y **se mantiene la anterior**: nunca te quedas sin atajo.

Plegada es solo la marca; al abrirla, la barra se estira y el panel baja con
una animación corta (unos 330 ms). Las terminales siguen corriendo mientras
está plegada.

## Perfiles

Cada entrada del menú `+` es un perfil. Se edita en `⚙`:

| Campo | Qué hace |
|---|---|
| Logo | Imagen propia (PNG, JPG, WEBP, SVG o ICO) que se muestra en la barra |
| Color | Punto de la pestaña y del menú |
| Nombre | Lo que se ve en la pestaña y en el menú |
| Shell | `PowerShell` o `cmd`: dónde se escribe el comando |
| Carpeta | Dónde arranca la terminal. Vacío = carpeta del usuario |
| Comando | Se escribe al abrir la pestaña. Vacío = shell limpia |

Ejemplos:

| Nombre | Shell | Carpeta | Comando |
|---|---|---|---|
| Claude Code | PowerShell | — | `ollama launch claude --model <modelo>` |
| SSH servidor | PowerShell | — | `ssh usuario@servidor` |
| Proyecto | PowerShell | `C:\ruta\al\proyecto` | `claude` |
| Git | PowerShell | `C:\ruta\al\proyecto` | `git status` |

La carpeta **no cambia los permisos**: el comando corre con tu usuario de
Windows y puede leer y escribir donde tú puedas. Solo cambia la carpeta por
defecto y el "workspace" que pide confiar la primera vez.

«Restaurar por defecto» vuelve a Claude Code / PowerShell / cmd.

## Instalación

Requiere **Node.js LTS** (probado con 26.x) y Windows 10/11.

```bash
npm install
npm start
```

Para abrirlo sin consola, crea un acceso directo a
`node_modules\electron\dist\electron.exe` con el argumento `"C:\ruta\a\Alero"`
y el directorio de trabajo en esa misma carpeta.

## Interfaz

Dirección visual **data-terminal**: cromo oscuro neutro, el trabajo un paso más
oscuro que el suelo, y una sola línea de acento de 1 px —el alero— como única
marca de selección (pestaña activa, foco). El color de cada perfil es lo único
que aporta color a la barra, porque identifica al perfil.

- Texto en **Public Sans** y terminal en **JetBrains Mono**, ambas incluidas en
  `src/renderer/fonts/` (SIL OFL), así que no hay peticiones externas.
- Radios: 8 paneles, 6 controles, píldora en los botones.

## Plegado automático

En **Ajustes → Barra**, dos reglas independientes que se pueden combinar:

- **Plegar al pasar a otra ventana** (Alt+Tab a otra app).
- **Plegar tras un rato sin usarla**: segundos configurables (10 por defecto).
  La cuenta se reinicia al escribir o hacer clic dentro de Alero.

Con las dos apagadas, la barra se queda abierta hasta que la pliegues tú. Nunca
se pliega con un aviso pendiente, con Ajustes abiertos o grabando un atajo.

## Ajustes

Se guardan en `%APPDATA%\Alero\settings.json`: tamaño, estado, perfiles y
pestañas abiertas.

## Estado

MVP en desarrollo activo (octubre 2026):

- Barra colapsada arriba, siempre encima; atajo global y clic para desplegar.
- Pestañas reales con ConPTY y perfiles configurables (comando, carpeta, shell).
- Restaura pestañas y estado al reiniciar.
- Icono en la bandeja con menú.

Pendiente:

- Redimensionar el panel arrastrando el borde.
- Aprobar permisos de agentes desde la barra.
- Pulir la interfaz.

Ver [`ESPECIFICACION.md`](ESPECIFICACION.md) para el alcance detallado.

## Licencia

MIT. Ver [`LICENSE`](LICENSE).

Incluye xterm.js y @xterm/addon-fit (MIT), Electron (MIT) y node-pty (MIT).
