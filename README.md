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
