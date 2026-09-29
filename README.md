# dnd5e Spheres

A Foundry VTT module that adds spherecasting to the [dnd5e](https://github.com/foundryvtt/dnd5e) system:
casting traditions, spell points, spherecaster classes, the magic spheres and their talents.
Compatible with the Spheres 5E rules ([spheres5e.wikidot.com](https://spheres5e.wikidot.com/)).

- Foundry VTT: v14
- dnd5e: 6.0.x
- Optional: [Tidy 5e Sheets](https://github.com/kgar/foundry-vtt-tidy-5e-sheets), [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper),
  [Dice So Nice](https://gitlab.com/riccisi/foundryvtt-dice-so-nice)

## Installation

1. In Foundry VTT, go to **Setup > Add-on Modules > Install Module**.
2. Paste this into **Manifest URL** and click **Install**:

   ```
   https://github.com/srpthemangoeater/srp-dnd5e-spheres/releases/latest/download/module.json
   ```

3. Enable **dnd5e Spheres** in your world under **Game Settings > Manage Modules**.

Foundry checks the same URL for updates. Each release attaches `module.json` and `module.zip`; they are
built by the GitHub Actions workflow in `.github/workflows/release.yml` whenever a `v*` tag is pushed.

## Compendiums

| Compendium | Contents |
|---|---|
| Spheres: Core Features | The Spell Points pool item |
| Spheres: Casting Traditions | 38 sample traditions and subtraditions |
| Spheres: Drawbacks | 24 drawbacks |
| Spheres: Boons | 14 boons |
| Spheres: Spherecaster Classes | Incanter, Elementalist, Mageknight, Prodigy, Soul Weaver |
| Spheres: Subclasses | 27 specializations, paths and callings |
| Spheres: Class Features | 177 class and subclass features |
| Spheres: Magic Spheres | 20 spheres with their base abilities as activities |
| Spheres: Sphere Talents | 838 basic and advanced talents, grouped by sphere and category |

Entries summarise the mechanics and link to the full rules on the Spheres 5E wiki. Sphere variants
are not included.

Compendiums use folders: talents by sphere and then category (for example Destruction > Blast Type /
Blast Shape / Other), class features by class and subclass, subclasses by class, and traditions by
tradition family.

## Spheres browser

The **Browse** button on the Spheres tab opens a searchable browser for spheres and talents: search
by name, filter by type, sphere, category, basic or advanced, and augment cost, hide what the character
already has, then add with one click or drag a row onto a sheet. Items the character already has show as
**Selected**; click the check to deselect (remove) them.

**Overrides:** if adding something would go over the magic talent limit or miss a prerequisite (the
sphere, or an advanced talent's level), the browser offers to add it as an **override** with an optional
note such as "free from GM" or "feat". Tick *Add as override* to add everything that way. Overrides do
not count against magic talents; they show an *Override* badge with the note on the sheet, and the note
can be changed later from the row's right-click menu (*Override…*).

### Packages and included talents
- **Nature packages** grant their own geomancy abilities: Air (Breeze, Gust of Wind, Purify Air), Earth
  (Bury, Sandblast, Tremor), Fire (Affect Fire, Move Fire, Quick Light), Metal (Magnetize, Recover Ore,
  Reforge), Plant (Entangle, Harvest, Pummel), Water (Fog, Freeze, Vortex).
- **Casting geomancy is nested:** *Geomancy* opens the cast dialog on your packages; pick a package, then
  one of its abilities (each shows its action, range, duration, save or attack, damage and SP cost). The
  geomancy talents for that package (for example Fire Mastery under Fire, Lava Mastery under Earth and
  Fire) and the general ones (such as Create Nature) are listed below it as modifiers, followed by the
  ability's augments. The chat card shows the path, e.g. *Nature > Geomancy > Fire Package > Move Fire*.
- **Universal packages** carry their ability or pick: Dispel (Dispel), Mana (Manabond), Wild Magic
  (Chaos Aura), Metasphere (one free metasphere talent) and Spellcrafting (one free dual sphere talent).
  Their abilities are cast the same way from Universal's *Package Ability*.
- **Spirit is nested the same way:** *Spirit* lists your packages; each shows the spirit abilities your (spirit)
  talents grant for that package (for example Fire: Flame Mantle from Nature's Carapace, Dragonlung (Fire), Resist
  Fire), plus the ones you could still gain, greyed out with the talent they need. Abilities any package can use
  (Beast Friend, Speak With Beasts, Natural Ally) are under *Any package*. With Master of Elements every package is
  listed. Dragonlung deals its package's damage type and can be a 60 ft line instead of a cone.
- Casting a package or spirit ability from its own row (right-click > *Cast*) opens the same dialog with that
  package and ability already chosen.
- Talents a sphere always includes are added automatically for free: Darkvision (Dark), Exhausting Strike
  (Death), Armored and Barrier (Protection).

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

### Chat cards and drawbacks
Sphere chat cards read in order: the casting tradition, the sphere ability (with its formula and damage
type), each chosen talent and augment with its full text, the spell points spent, and then one row per
drawback with **Show** (expand the details) and **Resolve** (apply it and mark the row resolved).
Resolving applies the numeric drawbacks:
- **Draining Casting:** damage and reduced hit point maximum (1 per spell point, 2 from 11th level)
  until a long rest.
- **Painful Magic:** prompts a Constitution save (DC 10 + 2 x spell points) and applies poisoned on a failure.
- **Material Casting:** deducts 1 gp per spell point (spending is blocked without enough gold).
- **Wild Magic:** rolls d100 for a 10% wild magic surge.
- Other drawbacks are acknowledged.

A world setting resolves the numeric drawbacks automatically instead. All rolls are normal chat rolls,
so [Dice So Nice](https://gitlab.com/riccisi/foundryvtt-dice-so-nice) shows them in 3D when it is active.

The cast dialog's **Send to chat** button posts the planned cast without casting it. Every sphere,
talent, drawback and boon on the Spheres tab has a chat button, and the tradition has one that posts
a summary of the tradition.

### Spherecaster classes
- Each class has Hit Points, proficiency and ASI advancements, class features granted by level, a
  subclass at the right level, and scale values for `spell-points` and `magic-talents` (plus Favored
  Element dice, Max Sequence or Soul Nexus where the class has them).
- Drop a class on a character to level it normally with the dnd5e advancement flow.

### Magic talents
- Total = `magic-talents` from spherecaster classes + 2 from a casting tradition + a manual bonus
  (set in the tradition builder).
- Each sphere and each talent costs one. Blast types granted for free by a sphere you have (for example
  Fire with Nature) and items flagged `bonusTalent` do not count.
- The Spheres tab shows *spent / total* and warns when you know too many.

### Spheres and casting
- Sphere items carry their base abilities as dnd5e activities: saves use `@spheres.dc`, attacks use
  `@spheres.attack`, and damage or healing come from the cast.
- Using a sphere ability opens the **cast dialog**: pick talents (blast type, blast shape, charm,
  genotype and so on) and augments, see the total spell point cost against your proficiency cap and
  your pool, then cast. The cost is charged to the Spell Points item, so the cap, drawback automation
  and chat card summary all apply.
- **Blast shapes place their area:** Aura (10 ft around you), Explosive Orb (5 ft cube, or a 20 ft sphere), Leap
  (10 ft line, or up to 30 ft), Sculpt (5 ft radius, or a 30 ft cone or 120 ft line), Sphere, Wall (5 ft panels, or
  10 ft), Calamity (30 ft around you, a 90 ft cone or a 500 ft line) and Cloud. Choose the shape, and its area option
  among the augments; the cast then places a matching template, and the area is shown on the chat card.
- Destructive Blast damage follows the rules (1d8 per tier, or 1d8 + 1d8 per 2 levels when
  empowered) with the blast type's damage type; Ray and Tether switch to a spell attack.
  Cure, Invigorate and telekinetic Projectile also compute their formulas from the chosen talents.
- Sphere and talent items already on characters are updated from the compendiums when the module's data
  changes (ability metadata, new activities and rules text), once per version, by the active GM.
- Metasphere talents from the Universal sphere (Quicken, Widen, Mass and others) appear as augments on
  every sphere.

### Character sheets
- **Default dnd5e sheet:** a *Spheres* tab with the tradition, drawbacks, boons, the spell point
  pool (pips, spend/restore buttons), the per-effect cap, the magic talent tracker, and each sphere
  with its talents and a Cast button per ability. Spell points and sphere DC also show under the class
  line in the header.
- **Tidy 5e Sheets:** the same *Spheres* tab.
- **Features tab:** traditions, drawbacks, boons, spheres, talents and the Spell Points item are grouped in their
  own *Spheres* section, on the dnd5e sheets (in either grouping) and on Tidy 5e (as its custom section, unless you
  gave an item a section yourself).
- **NPCs** get the same *Spheres* tab (dnd5e and Tidy NPC sheets), spell points, `@spheres` roll data, casting and
  chat cards. Their caster level is their class level, else the *Caster level* set in the tradition builder, else
  their spellcaster level, else their CR. NPCs without spherecaster classes or a tradition have no magic talent limit.
- Drawbacks, boons and each sphere's talents are collapsible lists: click a row to show its
  description, click a group header to fold it. Open and closed state is remembered per user.
- Right-click any row for its menu: *Post to chat*, *View*, and in edit mode (or with the Tidy sheet
  unlocked) *Edit* and *Remove*. Spheres also offer *Cast* and *Choose free talents*; the tradition
  offers *Post to chat* and *Edit tradition*.
- In edit mode rows can be dragged to reorder within their list.

### Free talents when first gaining a sphere
Adding a sphere to a character opens a picker for the talents it grants on first acquisition (for
example Destruction: one blast type, which need not match a sphere you have, and one blast shape).
Chosen talents are marked *Free pick* and do not cost magic talents. Skip it with *Choose later* and
pick them from the sphere's right-click menu or its *Free talents to choose* button.

Spheres with free picks: Alteration (genotype), Conjuration (base companion), Death (undead),
Destruction (blast type + blast shape), Divination (divine + sense), Enhancement (enhancement),
Fate (consecration, motif or word), Mind (charm), Nature (package), Time (alter time),
Universal (package) and Weather (mantle or shroud).

## API

```js
const api = game.modules.get("dnd5e-spheres").api;
api.computeSpheres(actor);     // key ability, SP maximum breakdown, DC, cap
api.spellPointState(actor);    // { item, value, max, spent }
api.openBuilder(actor);        // open the tradition builder
api.computeTalents(actor);     // { total, spent, over, ... }
api.openCast(activity);        // open the cast dialog for a sphere ability
api.openBrowser(actor);        // open the spheres browser for an actor
api.postTraditionCard(actor);  // post the casting tradition summary to chat
```

## Development

Compendium packs are built from `src/data.mjs`, `src/classes.mjs` and `src/spheres-*.mjs`:

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
