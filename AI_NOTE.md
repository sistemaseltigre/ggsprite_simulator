# Nota para futuras actualizaciones IA

Este simulador debe mantenerse alineado con estas fuentes del proyecto principal:

- `/Users/jesussilva/Documents/gpt/gableguardians/frontend-web/lib/game/components/player_component.dart`
- `/Users/jesussilva/Documents/gpt/gableguardians/frontend-web/lib/game/remote_player_component.dart`
- `/Users/jesussilva/Documents/gpt/gableguardians/frontend-web/lib/game/player_state.dart`

Checklist cuando cambien animaciones en el juego:

1. Verificar mapeo de filas `walk/idle/attack` en body y layers.
2. Verificar prioridad de `_resolveAttackStyle`.
3. Verificar reglas de equipamiento (2H, shield, tool pickaxe).
4. Verificar excepciones de capas (ejemplo `orb + shield` con attack base row especial).
5. Copiar nuevos PNG de ejemplo a `sprite_simulator/assets`.

Objetivo: que diseño vea exactamente lo que verá el juego al integrar sprites.
