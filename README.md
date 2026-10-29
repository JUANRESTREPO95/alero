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
| `Esc` | Plegar |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copiar / pegar en la terminal |

También: clic en la barra para desplegar, `+` para elegir perfil y `⚙` para
editar los perfiles.

Las terminales siguen corriendo aunque pliegues la barra.

## Perfiles

Cada entrada del menú `+` es un perfil. Se edita en `⚙`:

| Campo | Qué hace |
|---|---|
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
