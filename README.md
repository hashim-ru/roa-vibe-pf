# Knights of the Vale — Tech Demo

A halal-relaxed 2D platform fighter inspired by Super Smash Bros. Melee
and Rivals of Aether. Two characters built deep instead of eight built
shallow: **Sand Lancer** (Marth/Marcina-class disjoint spear) vs
**Hooded Skirmisher** (Sheik-class twin daggers + needle storm + vanish).

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:5173/
```

## Controls

### P1 (default keyboard)
| Key | Action |
|---|---|
| WASD | Move (W jump, S crouch / drop platform) |
| SPACE | Jump (alt) |
| F | Attack — direction stick + button picks jab/ftilt/utilt/dtilt |
| LSHIFT + F | Smash attack (fsmash/usmash/dsmash) |
| G | Special — direction stick + button picks neutralB/sideB/upB/downB |
| H | Parry stance / dodge roll (parry while moving = ground dash) |

### P2 (vs-human mode)
| Key | Action |
|---|---|
| Arrow keys | Move |
| RSHIFT | Jump |
| / | Attack |
| . | Special |
| RCTRL | Parry |
| NUM0 + / | Smash |

### Global
| Key | Action |
|---|---|
| F1 | Toggle hitbox/hurtbox debug overlay |
| P | Pause (volume + restart menu) |
| R | Rematch (after KO) |
| ESC | Back to title |

## Movement Tech (Melee canon)

- **Wavedash** — air dodge into ground at angle
- **L-cancel** — press parry within 7f before landing during aerial = halved landing lag
- **Dash dance** — direction reverse in first 5f of dash
- **SDI / ASDI** — fresh stick directions during hitlag shift victim ±2 px / ±1 px
- **Crouch cancel** — KB < 80 reduced 0.85× while crouching
- **Ledge regrab decay** — 1st 1.0× / 2nd 0.8× / 3rd 0.5× / 4th+ 0× intangibility
- **Tech roll** — buffered parry within 4f of land while tumbling = no lag
- **Stale move queue** — last 9 moves remembered, repeated move loses 5%/occurrence

## Roster

### Sand Lancer (Marth / Marcina-class)
Medium weight (90), long disjoint reach. Tipper sweetspots reward spacing.
Heated steel motif — flame trail on fsmash, lightning on dolphin slash,
frost burst on counter parry.

### Hooded Skirmisher (Sheik-class)
Featherweight (80), fastest jab in the cast (2f startup). Combo-heavy
with smoke + ember vanish teleport, ice-needle storm, steel chain whip.

## Stages

- **Battlefield** — three soft platforms above main floor, forest theme
- **Final Destination** — single wide flat platform, mountain theme

## Build for Production

```bash
npm run build        # outputs to dist/
npm run preview      # serves the build at port 4173
```

## Testing

```bash
npm test             # 44 tests covering engine, knockback, FSM, bot AI
```

## Architecture

- **Engine kernels**: 60Hz fixed timestep, AABB physics, generic FSM,
  Smash 4 knockback formula (Smash KB), shape-aware hit detection
  (rect / circle / arc), clank + transcendent priority, central move
  cancel tables. See `src/{core,physics,combat,fsm}/`.
- **Renderer**: code-only, 14-bone skeleton, capsule limbs with
  optional taper + 2-tone shading, breastplate torso polygon, verlet
  capes, per-attack key-pose tables, smear frames, tier-driven hit
  VFX, per-skill signature elemental effects. See `src/render/`.
- **Audio**: Howler wrapper with three-channel mix (master/sfx/ambient)
  persisted to localStorage, tier-mapped hit playback with pitch
  jitter, procedural whoosh + ambient sine pad via Web Audio. See
  `src/audio/`.

## License

Source code: MIT (your choice). Audio assets in `public/assets/audio/`
mostly CC-BY-NC; see individual files for attribution.
