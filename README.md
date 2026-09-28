# dnd5e Spheres

A Foundry VTT module that adds casting traditions, drawbacks, boons and spell points to the
[dnd5e](https://github.com/foundryvtt/dnd5e) system. Compatible with the Spheres 5E rules
([spheres5e.wikidot.com](https://spheres5e.wikidot.com/)).

- Foundry VTT: v14
- dnd5e: 6.0.x
- Optional: [Tidy 5e Sheets](https://github.com/kgar/foundry-vtt-tidy-5e-sheets), [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper)

This is phase 1 of the project: casting traditions and spell points. Spherecaster classes,
magic talents and the individual spheres come in later phases.

## Features

### Spell points
- A **Spell Points** feature item (compendium *Spheres: Core Features*) whose uses are the
  spell point pool. It refills on a long rest and is consumed by activities like any other item uses.
- Maximum = spell points from spherecaster classes + key ability modifier (counted once)
  + bonus from unspent drawbacks + a manual bonus.
  - Classes contribute through a ScaleValue advancement with the identifier `spell-points`.
  - Characters without a spherecaster class can enter class spell points manually in the tradition builder.
- Drawback bonus (drawback points left after paying 2 per boon):

  | Unspent drawbacks | Bonus spell points |
  |---|---|
  | 1 | +1, +1 per 6 levels |
  | 2 | +1, +1 per 3 levels |
  | 3 | +1 per odd level |
  | 4 | +1, +1 per 1.5 levels |
  | 5+ | +1 per level |

  Addictive Casting, Charge Magic, Diagram Magic, Extended Casting and Terrain Casting count as two
  drawbacks. Somatic Casting and Rigorous Concentration can be taken twice.
- **Per-effect cap:** an activity that would spend more spell points on one effect than the caster's
  proficiency bonus is blocked (world setting).
- The usage chat card shows spell points spent and remaining.

### Roll data
Available in any formula on the actor or its items:

| Key | Value |
|---|---|
| `@spheres.sp.max` | Maximum spell points |
| `@spheres.sp.value` | Current spell points |
| `@spheres.kam` | Key ability modifier |
| `@spheres.dc` | Sphere save DC (8 + proficiency + key ability modifier) |
| `@spheres.attack` | Sphere attack bonus |
| `@spheres.cap` | Spell points allowed per effect |

### Casting traditions
- New feature types: *Casting Tradition*, *Drawback*, *Boon*, *Sphere* and *Magic Talent*.
- Compendiums with 38 sample traditions and subtraditions, 24 drawbacks and 14 boons. Each entry
  summarises the mechanics and links to the full rules on the Spheres 5E wiki.
- **Tradition builder:** start from a sample tradition or build your own. Pick the key ability,
  tick drawbacks (with counts-as-two and taken-twice handling) and boons (one per two drawback
  points), and see the resulting spell point maximum update live. Saving creates the tradition,
  drawback and boon items on the actor and adds the Spell Points item if needed.

### Drawback automation
When spell points are spent:
- **Draining Casting:** damage and reduced hit point maximum (1 per spell point, 2 from 11th level)
  until a long rest.
- **Painful Magic:** prompts a Constitution save (DC 10 + 2 x spell points) and applies poisoned on a failure.
- **Material Casting:** deducts 1 gp per spell point and blocks the spending if there is not enough gold.
- **Wild Magic:** rolls d100 for a 10% wild magic surge.
- Every other drawback posts a short chat reminder.

Each of these can be turned off in the module settings.

### Character sheets
- **Default dnd5e sheet:** a *Spheres* tab with the tradition, drawbacks, boons, the spell point
  pool (pips, spend/restore buttons) and the per-effect cap, plus spell points and sphere DC under
  the class line in the header.
- **Tidy 5e Sheets:** the same *Spheres* tab.

## API

```js
const api = game.modules.get("dnd5e-spheres").api;
api.computeSpheres(actor);     // key ability, SP maximum breakdown, DC, cap
api.spellPointState(actor);    // { item, value, max, spent }
api.openBuilder(actor);        // open the tradition builder
```

## Development

Compendium packs are built from `src/data.mjs`:

```sh
npm install
npm run build:packs
```

Close any world that uses the module before building, since Foundry locks the pack databases.

## License

- Source code: MIT, see [LICENSE](LICENSE).
- Game rules content: Open Game License 1.0a, see [OGL.md](OGL.md).

This module is not published, endorsed or approved by Drop Dead Studios. "Spheres of Power" is
Product Identity of Drop Dead Studios and is used here only to state compatibility.
