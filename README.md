# Sprite Simulator (GableGuardians)

Simulador HTML/CSS/JS para previsualizar sprites y combinaciones de equipo usando las mismas reglas de animación que `frontend-web`.

## Abrir

1. Ir a: `/Users/jesussilva/Documents/gpt/sprite_simulator`
2. Abrir `index.html` en el navegador.

## Qué replica

- `PlayerState` en 4 direcciones: `down/right/up/left`
- Acciones: `idle`, `walk`, `attack`, `mine`
- Body sheet (`pj_gargoyle.png`):
  - walk rows: `0,1,2,3`
  - idle rows: `8,9,10,11`
  - attack base rows por estilo:
    - normal: `4`
    - multi: `12`
    - bow: `16`
    - spear: `20`
    - orb: `24`
    - pickaxe: `totalRows - 4`
- Weapon/armor layers:
  - idle rows: `0,1,2,3`
  - walk rows: `4,5,6,7`
  - attack base row: `8`
- excepción orb+shield: shield usa attack base row `12`

## Generador desde frames

El simulador incluye generador de spritesheet por carpeta de frames, replicando reglas de `build_sprites.py` (`/Users/jesussilva/Documents/spritesgg/build_sprites.py`):

- Prefijos soportados:
  - `PJ_` personaje (`hero`)
  - `W_` arma (`weapon`)
  - `NPC_` npc
  - `I_` item
  - `E#_` enemigo (`enemy`)
- Estructura esperada:
  - subcarpetas por acción (`Idle`, `Walk`, `Attack`, etc.)
  - archivos PNG secuenciales (`0001.png`, `0002.png`, ...)
- Validaciones:
  - carpetas obligatorias por perfil
  - conteo divisible por direcciones
  - frames mínimos por acción
  - orden de filas por dirección: `down, left, up, right`
- Orden del personaje (`PJ_`) respetado para integración actual:
  - `walk` filas 0-3
  - `attack` filas 4-7 (o estilo aplicado por el sheet final del personaje)
  - `idle` filas 8-11

Notas:
- En navegador no se puede leer una ruta absoluta del sistema directamente por seguridad. Por eso se usa selector de carpeta (`webkitdirectory`) y el campo de ruta es de referencia.
- Al generar correctamente, el spritesheet se agrega a “Generados”, se puede descargar y aplicar al preview.

## Reglas de combinación incluidas

- `shield` se maneja en mano izquierda.
- Armas 2H (`bow`, `spear`, `pickaxe`) bloquean mano izquierda.
- `attackStyle` se resuelve igual que en el juego:
  - bow > orb > spear > pickaxe > multi (sword/axe/shield) > normal

## Assets ejemplo incluidos

- `assets/character/pj_gargoyle.png`
- `assets/weapons/*.png`
- `assets/armor/*.png`

Puedes cargar tus propios PNG por capa desde el panel izquierdo (base, armas y armadura).
