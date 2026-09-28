/**
 * Spherecaster classes. Descriptions summarise the mechanics; the full rules are on the wiki page.
 * `talents` and `spellPoints` are the cumulative totals at levels 1-20.
 */

const range = (...values) => values;

export const CLASSES = [
  {
    key: "incanter", name: "Incanter", hd: "d6", page: "incanter",
    summary: "A pure spherecaster who gains a magic talent every level and specialises in one field of magic.",
    armor: [], weapons: ["weapon:sim"],
    tools: { count: 1, pool: ["tool:art:*", "tool:music:*"] },
    saves: { grants: [], choices: [{ count: 1, pool: ["saves:int", "saves:cha"] }, { count: 1, pool: ["saves:dex", "saves:wis"] }] },
    skills: { count: 2, pool: ["skills:*"] },
    talents: range(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20),
    spellPoints: range(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20),
    asi: [4, 8, 12, 16, 19],
    subclassLevel: 2, subclassTitle: "Magic Specialization",
    features: [
      [1, "Spherecasting", "You cast sphere effects using magic talents and a spell pool of spell points equal to your key ability modifier (minimum 1) plus your incanter level, refreshed on a long rest."],
      [1, "Magical Potency", "Once per day when you finish a short rest, you recover spell points equal to 2 + half your incanter level (rounded up)."],
      [5, "Arcane Protection", "When you take damage you can spend spell points to reduce it instead of losing hit points; this ignores the usual limit on spell points per effect."],
      [18, "Magical Flexibility", "As an action, gain one extra talent from a sphere you have for 1 minute, a number of times equal to your key ability modifier per short or long rest."],
      [20, "Master of Magic", "When you spend 3 or more spell points on a sphere effect, it costs 1 spell point less."]
    ],
    subclasses: [
      { name: "Arcanist", summary: "A generalist who refuses to specialise.", features: [
        [2, "Arcane Potency", "Magical Potency restores 3 + your incanter level spell points instead."],
        [6, "Improved Flexibility", "You can use a Magical Flexibility-style talent swap once per short rest from this level."],
        [10, "Break Magic", "Add your proficiency bonus to Universal sphere checks made to dispel magic."],
        [14, "Greater Magical Flexibility", "Magical Flexibility grants two talents instead of one, and you gain an extra use per rest."]] },
      { name: "Esper", summary: "A mind mage who links allies telepathically.", features: [
        [2, "Mind Link", "As an action or bonus action, link allies within 100 feet for up to 1 minute (concentration); they gain advantage on attacks and always know enemy positions. Twice per long rest."],
        [6, "Greater Mind Link", "Enemies inside the link have disadvantage on attacks against linked allies, and allies share skill proficiencies."],
        [10, "Psychic Shield", "While concentrating on a sphere effect you gain +2 to AC and saving throws."],
        [14, "Potent Psionics", "Mind Link recharges on a short rest."]] },
      { name: "Fey Adept", summary: "A master of illusion and shadow.", features: [
        [2, "Lingering Illusion", "Gain a bonus Illusion, Dark or Light talent; those effects persist 1 round per 2 levels after concentration ends."],
        [6, "Shadowmark", "Creatures you damage with weapons or destructive blasts have disadvantage on saves against your Dark, Illusion and Light effects for 1 minute."],
        [10, "Disappear", "As a bonus action, become invisible for 1 round. Twice per short rest."],
        [14, "Illusory Reality", "As a bonus action, make one inanimate nonmagical object inside your illusion real for 1 minute."]] },
      { name: "Green Mage", summary: "A caster bound to nature and beasts.", features: [
        [2, "Animal Advisor", "Cast find familiar as a ritual; your fey familiar can attack and adds your proficiency bonus to AC, attacks, saves and damage."],
        [6, "Nature's Renewal", "When you make a shapeshift, mantle or spirit last without concentration, the target heals twice your incanter level."],
        [10, "Nature's Travel", "Climbing and swimming do not slow you, and you can breathe underwater."],
        [14, "Nature's Sanctuary", "Beasts and plants must pass a Wisdom save to attack you, or choose another target."]] },
      { name: "Necromancer", summary: "A master of undeath.", features: [
        [2, "Bolster Undeath", "Gain the Death sphere; touch an undead to give it temporary hit points equal to your level and your proficiency bonus on saves and damage."],
        [6, "Affect All", "Your ghost strikes affect undead and constructs, even with normally immune conditions."],
        [10, "Lifesight", "Gain 60-foot blindsight against living and undead creatures."],
        [14, "Command Undead", "As an action, undead within 60 feet must pass a Charisma save or become friendly and obedient."]] },
      { name: "Priest", summary: "An ordained servant of a deity.", features: [
        [2, "Divine Initiate", "Gain Channel Divinity (Turn Undead or a domain option) once per short rest, and cast the ceremony ritual."],
        [6, "Greater Divinity", "Channel Divinity twice per rest and gain another domain option."],
        [10, "Commune", "Cast commune as a ritual without a book."],
        [14, "Apotheosis", "Channel Divinity three times per rest and gain another domain option."]] },
      { name: "Soothsayer", summary: "A reader of fate.", features: [
        [2, "Portent", "After a long rest roll two d20s; you can replace any attack, save or check you can see with one of them."],
        [6, "Diviner's Eye", "Divination sphere effects cost 1 spell point less when you spend 2 or more."],
        [10, "Master of Fate", "Apply two motifs to yourself as a single concentration effect."],
        [14, "Greater Portent", "Roll three d20s for Portent."]] },
      { name: "Summoner", summary: "A caller of magical allies.", features: [
        [2, "Lingering Companions", "Gain the Creation or Conjuration sphere; summoned companions persist 1 round per 2 levels after concentration ends."],
        [6, "Greater Companions", "Target a companion or object with another sphere effect as part of summoning it."],
        [10, "Self-Evident Conjuration", "Damage cannot break your concentration on companions."],
        [14, "Durable Summons", "Your summoned creatures gain 30 temporary hit points."]] },
      { name: "Temporalist", summary: "A bender of time and space.", features: [
        [2, "Quick", "Your walking speed increases by 10 feet and you can Dash as a bonus action."],
        [6, "Greater Teleport", "Double the distance of all your magical teleportation."],
        [10, "Retry", "Once per short rest after missing an attack, check or save, reroll it with advantage."],
        [14, "Freeze Time", "Once per long rest, as an action, take 1d4 + 1 extra turns while time is frozen."]] }
    ]
  },
  {
    key: "elementalist", name: "Elementalist", hd: "d8", page: "elementalist",
    summary: "A mobile warrior-caster who channels destructive elemental energy.",
    armor: ["armor:lgt"], weapons: ["weapon:sim", "weapon:mar"],
    tools: { count: 1, pool: ["tool:art:*", "tool:music:*"] },
    saves: { grants: ["saves:dex", "saves:cha"], choices: [] },
    skills: { count: 2, pool: ["skills:acr", "skills:ath", "skills:arc", "skills:itm", "skills:nat", "skills:per", "skills:ste"] },
    talents: range(0, 1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 12, 12, 13, 14, 15),
    spellPoints: range(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20),
    extraScales: [{ identifier: "favored-element", name: "Favored Element", type: "dice",
      scale: { 3: [1, 4], 7: [1, 6], 11: [1, 8], 15: [1, 10], 18: [1, 12] } }],
    asi: [4, 8, 12, 16, 19],
    subclassLevel: 2, subclassTitle: "Elemental Path",
    features: [
      [1, "Spherecasting", "You cast sphere effects using magic talents and a pool of spell points equal to your key ability modifier (minimum 1) plus your elementalist level."],
      [1, "Unarmored Defense", "Without armor or a shield, your AC equals 10 + your Dexterity modifier + your key ability modifier."],
      [1, "Weave Energy", "You gain the Destruction sphere as a bonus talent."],
      [2, "Admixture", "Twice per short rest, as a bonus action, add a second blast type to a destructive blast, splitting the damage between them."],
      [3, "Favored Element", "Choose a damage type. Your first destructive blast or weapon damage roll each round of that type deals extra damage equal to your Favored Element die (1d4, growing to 1d12)."],
      [5, "Elemental Defense", "You gain resistance to your favored element."],
      [7, "Evasion", "On a successful Dexterity save for half damage you take none, and only half on a failure."],
      [9, "Elemental Movement", "As a bonus action, all your speeds increase by 15 feet for 1 round."],
      [10, "Elemental Aid", "Once per short rest, add your Favored Element die to your AC against one attack or to a Strength, Dexterity or Constitution check or save."],
      [13, "Greater Elemental Movement", "Elemental Movement grants +30 feet."],
      [14, "Greater Elemental Aid", "Elemental Aid can be used twice per short rest."],
      [15, "Energetic Soul", "You gain proficiency in all saving throws and can spend spell points as a reaction to reroll a failed save."],
      [18, "Superior Elemental Aid", "Elemental Aid can be used three times per short rest."],
      [20, "Energy Body", "You gain resistance to acid, cold, fire, lightning, necrotic, poison, radiant and thunder damage (immunity to your favored elements)."]
    ],
    subclasses: [
      { name: "Path of the Aspirant", summary: "A master of many elements at once.", features: [
        [2, "Improved Critical", "Your destructive blasts score a critical hit on 19-20."],
        [3, "Destructive Savant", "Choose two favored elements instead of one and gain resistance to both."],
        [6, "Greater Admixture", "Admixture gains extra uses equal to your key ability modifier per short rest."],
        [11, "Greater Destructive Savant", "Gain a third favored element and its resistance."],
        [17, "Superior Destructive Savant", "Gain a fourth favored element and its resistance."]] },
      { name: "Path of the Doomblade", summary: "A blade-mage who fuses weapon and blast.", features: [
        [2, "Blended Training", "Gain the Blade blast shape; you may swap magic talents for martial talents."],
        [3, "Magus", "Unaugmented Blade blasts on your own weapons last their full duration without concentration."],
        [6, "Extra Attack", "You attack twice when you take the Attack action."],
        [11, "Greater Magus", "Apply secondary blast effects to Blade attacks without a bonus action."],
        [17, "Destructive Mastery", "You can cast any destructive blast as a bonus action."]] },
      { name: "Path of the Geomancer", summary: "A caster of nature and weather.", features: [
        [2, "Natural Casting", "Gain the Nature or Weather sphere; your favored element adds to their damage."],
        [3, "Natural Movement", "Gain a climb or swim speed equal to your walking speed."],
        [6, "Nature Surge", "Twice per short rest, cast a Nature or Weather ability as a bonus action after a destructive blast."],
        [11, "Greater Nature Surge", "Concentrate on a Nature or Weather ability and a destructive blast at the same time."],
        [17, "Natural Mastery", "Nature Surge has no limit on uses."]] },
      { name: "Path of the Inspired Kineticist", summary: "A shifting master of destructive options.", features: [
        [2, "Destructive Flexibility", "Twice per short rest, as a bonus action, gain a Destruction talent for 1 minute."],
        [3, "Flexible Focus", "Destructive Flexibility also grants a temporary second favored element."],
        [6, "Mutable Blast", "Change the augments or blast type of a lasting blast as a bonus action."],
        [11, "Greater Flexibility", "Destructive Flexibility gains extra uses equal to your key ability modifier."],
        [17, "Master Flexibility", "Spend two uses to gain two talents and favored elements at once."]] },
      { name: "Path of the Primordial", summary: "A caster who becomes living energy.", features: [
        [2, "Elemental Change", "Gain the Alteration sphere with the Elemental genotype; your favored element adds to shapeshifted natural weapons."],
        [3, "Lingering Elemental Form", "Elemental shapeshifts linger for rounds equal to your proficiency bonus after concentration ends."],
        [6, "Elemental Surge", "Cast a destructive blast as a bonus action after shapeshifting yourself into an elemental form."],
        [11, "Greater Elemental Surge", "Concentrate on a self-shapeshift and a destructive blast at the same time."],
        [17, "Greater Elemental Form", "Self-shapeshifts can last up to 1 hour."]] }
    ]
  },
  {
    key: "mageknight", name: "Mageknight", hd: "d10", page: "mageknight",
    summary: "An armored warrior who weaves sphere magic into combat.",
    armor: ["armor:lgt", "armor:med", "armor:shl"], weapons: ["weapon:sim", "weapon:mar"],
    tools: { count: 1, pool: ["tool:art:*", "tool:music:*"] },
    saves: { grants: [], choices: [{ count: 1, pool: ["saves:str", "saves:int", "saves:cha"] }, { count: 1, pool: ["saves:dex", "saves:con", "saves:wis"] }] },
    skills: { count: 2, pool: ["skills:*"] },
    talents: range(1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10),
    spellPoints: range(0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10),
    asi: [4, 8, 12, 16, 19],
    subclassLevel: 3, subclassTitle: "Mageknight Path",
    features: [
      [1, "Spherecasting", "You cast sphere effects using magic talents and spell points, gaining a magic talent at every odd level."],
      [1, "Martial Focus", "Gain focus after 1 minute of rest or by taking the Dodge action. Expend it to treat a Strength, Dexterity or Constitution save as a roll of 10."],
      [2, "Fighting Style", "Choose a fighting style such as Archery, Defense, Dueling, Great Weapon Fighting, Protection or Two-Weapon Fighting."],
      [2, "Spell Combat", "After the Attack action, expend martial focus to cast a 0 spell point sphere effect as a bonus action (no focus needed from 7th level; 1 spell point effects from 15th)."],
      [5, "Extra Attack", "You attack twice when you take the Attack action."],
      [11, "Stalwart", "Expend martial focus to change any saving throw result to 10, even after rolling."],
      [20, "Spell Critical", "When you score a critical hit with a weapon, cast a sphere effect that takes an action as a bonus action."]
    ],
    subclasses: [
      { name: "Armorist", summary: "A crafter of conjured arms and armor.", features: [
        [3, "Quick Enhancements", "Enhance equipment as a bonus action and create weapons, armor or shields as a bonus action."],
        [6, "Enhanced Creations", "Create and enhance an item in the same action."],
        [10, "Rigorous Creations", "Damage cannot break your concentration on created equipment."],
        [14, "Potent Enhancement", "Enhanced gear gains +1 to attack and damage rolls or AC."],
        [18, "Unbreaking Creations", "You have advantage on concentration saves."]] },
      { name: "Psionicist", summary: "A warrior of mind and force.", features: [
        [3, "Psychic Buffer", "Gain a buffer of hit points equal to twice your level plus your key ability modifier, refilled by spending spell points on Mind or Telekinesis."],
        [6, "Pushed Movement", "Double your jump distance and spend 1 spell point to Dodge, Dash or Disengage as a bonus action."],
        [10, "Evasion", "Take no damage on a successful Dexterity save against area effects."],
        [14, "Potent Psionic Buffer", "Spend a bonus action and 1 spell point to refill your buffer."],
        [18, "Two Minds", "Concentrate on two effects at once."]] },
      { name: "Spellblade", summary: "A fighter who channels magic through the blade.", features: [
        [3, "Danger Sense", "Advantage on Dexterity saves against effects you can see."],
        [6, "Draw Power", "Gain a temporary spell point when you drop a strong foe or score a critical hit against one."],
        [10, "Eldritch Strike", "A creature you hit has disadvantage on its next save against your magic before the end of your next turn."],
        [14, "Broadcast Blade", "Spend 1 spell point to affect every enemy within 5 feet of your target."],
        [18, "Resist Magic", "Advantage on saves against spells and magical effects."]] },
      { name: "Shapeshifter", summary: "A warrior who reshapes their own body.", features: [
        [3, "Quick Transformation", "Shapeshift yourself as a bonus action."],
        [6, "Steal Language", "Touch a creature to learn one of its languages until your next long rest."],
        [10, "Bestial Trait", "Choose a trait with no cost; you keep it permanently even when not shapeshifted."],
        [14, "Extended Transformation", "Concentrate on self-shapeshifts for up to 1 hour and gain a second permanent trait."],
        [18, "Second Skin", "Your shapeshift is no longer magical, lasts indefinitely and grants a third permanent trait."]] }
    ]
  },
  {
    key: "prodigy", name: "Prodigy", hd: "d8", page: "prodigy",
    summary: "A skilled hybrid who builds combat momentum through sequences of magic and martial technique.",
    armor: ["armor:lgt", "armor:med", "armor:shl"], weapons: ["weapon:sim", "weapon:mar"],
    tools: { count: 2, pool: ["tool:art:*", "tool:music:*"] },
    saves: { grants: ["saves:int", "saves:dex"], choices: [] },
    skills: { count: 3, pool: ["skills:*"] },
    talents: range(0, 1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 12, 12, 13, 14, 15),
    spellPoints: range(0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10),
    extraScales: [{ identifier: "max-sequence", name: "Max Sequence", type: "number",
      scale: { 1: 2, 3: 3, 7: 4, 11: 5, 15: 6 } }],
    asi: [4, 8, 12, 16, 19],
    subclassLevel: 2, subclassTitle: "Prodigy's Calling",
    features: [
      [1, "Spherecasting", "You cast sphere effects with a spell pool equal to your key ability modifier (minimum 1) plus half your prodigy level."],
      [1, "Martial Focus", "Gain focus after 1 minute of rest or the Dodge action. Expend it to treat a Strength, Dexterity or Constitution save as a 10."],
      [1, "Sequence", "Build links during combat by taking qualifying actions (one per turn, up to your Max Sequence) and spend them on finishers. You lose a link each round you add none."],
      [2, "Blended Training", "You gain magic talents at three quarters of your level and may swap them for martial talents."],
      [3, "Imbue Sequence", "When you start a sequence, infuse it with one magic sphere to gain that sphere's sequence benefit without concentration or spell points."],
      [5, "Extra Attack", "You attack twice when you take the Attack action."],
      [6, "Unbroken Sequence", "Expend martial focus so paralysis, stuns, petrification or unconsciousness do not end your sequence for 1 round."],
      [7, "Focused Sequence", "Expend martial focus to gain a link without an action, or as a bonus action to drop concentration."],
      [9, "Expertise", "Double your proficiency bonus for two skills or tools (two more at 17th level)."],
      [11, "Steady Skill", "Treat any ability check d20 roll of 7 or lower as an 8."],
      [13, "Flawless Sequence", "Missed links no longer cost you a link, and conditions cannot end your sequence."],
      [15, "Prodigious Skill", "Spend a spell point to treat an ability check d20 roll as 15."],
      [20, "Perfected Prodigy", "Your sequences start with three links."]
    ],
    subclasses: [
      { name: "Battleborn", summary: "A prodigy of pure combat talent.", features: [
        [2, "Fighting Style", "Choose a fighting style."],
        [5, "Inspired Hit", "Your weapon attacks score a critical hit on 19-20."],
        [10, "Additional Fighting Style", "Choose a second fighting style."],
        [14, "Greater Extra Attack", "You attack three times when you take the Attack action."],
        [18, "Magical Resilience", "Spend a spell point to add your proficiency bonus to a save you are not proficient in."],
        [20, "Genius Hit", "Your weapon attacks score a critical hit on 18-20."]] },
      { name: "Mimic's Calling", summary: "A prodigy who copies the magic they see.", features: [
        [2, "Mimicry", "As a reaction to an observed sphere effect or spell, make a key ability check to learn it temporarily; retain up to two for 1 minute."],
        [5, "Improved Mimicry", "Retain up to three mimicked talents or spells."],
        [10, "Lasting Mimicry", "Mimicked abilities last until your next rest."],
        [14, "Swift Mimicry", "Use Mimicry once per round without a reaction."],
        [18, "Greater Mimicry", "Retain up to four mimicked talents or spells."],
        [20, "Perfected Calling", "Mimicked abilities last indefinitely."]] },
      { name: "Savant's Calling", summary: "A prodigy who meditates to reshape their magic.", features: [
        [2, "Meditative Talents", "Gain a magic talent you can change after each long rest (more at 10th and 18th level)."],
        [5, "Reflect Spell", "With your reaction and martial focus, make an opposed check to reflect a spell back at its caster."],
        [10, "Quick Rumination", "Change meditative talents during a short rest."],
        [14, "Greater Reflect Spell", "Reflecting no longer costs your next action and a success returns your focus."],
        [18, "Instant Rumination", "Expend focus as an action to change a meditative talent."],
        [20, "Masterful Rumination", "Change a meditative talent as a bonus action."]] }
    ]
  },
  {
    key: "soul-weaver", name: "Soul Weaver", hd: "d8", page: "soul-weaver",
    summary: "A spherecaster who collects souls and channels the spirits of the dead.",
    armor: [], weapons: ["weapon:sim"],
    tools: { count: 1, pool: ["tool:art:*"] },
    saves: { grants: ["saves:wis", "saves:cha"], choices: [] },
    skills: { count: 3, pool: ["skills:arc", "skills:dec", "skills:his", "skills:ins", "skills:med", "skills:prf", "skills:per", "skills:rel", "skills:ste"] },
    talents: range(1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10),
    spellPoints: range(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20),
    extraScales: [{ identifier: "souls", name: "Soul Nexus", type: "number", scale: { 2: 2, 6: 3, 14: 4, 20: 5 } }],
    asi: [4, 8, 12, 16, 19],
    subclassLevel: 1, subclassTitle: "Soul Weaver Path",
    features: [
      [1, "Spherecasting", "You cast sphere effects with a spell pool equal to your key ability modifier (minimum 1) plus your soul weaver level."],
      [2, "Soul Nexus", "You hold a number of souls (2 at 2nd level, up to 5) that fuel nexus powers and return when you rest."],
      [2, "Channel Spirit", "Expend a soul to gain a magic talent you lack for 1 minute."],
      [5, "Greater Channel Spirit", "Channel Spirit can grant a base sphere instead of a talent."],
      [5, "Ghostpoint", "Expend a soul to cast a sphere effect as if from a point within 30 feet."],
      [10, "Supreme Channel Spirit", "Channel Spirit grants two talents at once, one of which can meet the other's prerequisite."],
      [10, "Second Soul", "As a reaction, spend two souls to turn a failed saving throw into a success."],
      [20, "Constant Ally", "When you roll initiative with no souls left, you regain one."]
    ],
    subclasses: [
      { name: "Path of the Gothi", summary: "A channeler of ancestral spirits.", features: [
        [1, "Remember the Ancestors", "Gain proficiency in History and Religion."],
        [2, "Empower Allies", "Expend a soul to give an ally within 30 feet temporary hit points equal to 1d10 + your class level."],
        [6, "Consult the Ancestors", "Spend a soul to add or double your proficiency bonus on an Intelligence check."],
        [14, "Rally Allies", "Allies you empower or save with Second Soul can make a weapon attack as a reaction."],
        [18, "Greater Banner", "Use your action to let an empowered ally take the Attack action."]] },
      { name: "Path of the Lichling", summary: "A caster steeped in undeath.", features: [
        [1, "Strength of the Undead", "Advantage on death saves; spend spell points for advantage on Athletics checks or Strength saves."],
        [2, "Blight", "Expend a soul to infect a target, giving it disadvantage on saves against your magic."],
        [6, "Lesion", "Detonate an infection for 1d6 necrotic damage per level to the target and nearby creatures."],
        [14, "Undead Resistances", "Resistance to necrotic and poison damage; your hit point maximum cannot be reduced."],
        [18, "Mindblight", "Expend a soul to dominate an infected creature for up to 1 minute (Constitution save)."]] },
      { name: "Path of the Medium", summary: "A vessel for wandering spirits.", features: [
        [1, "Whispers of the Dead", "Gain a temporary skill or tool proficiency after each rest."],
        [2, "Possess Body", "Channel Spirit can instead grant martial weapon training, sneak attack, temporary hit points or stronger unarmed strikes."],
        [6, "Tokens of the Departed", "Keep up to three soul trinkets from nearby deaths for save advantage and spirit questions."],
        [14, "Dual Soul", "Keep two Channel Spirit benefits active at once."],
        [18, "Enhanced Tokens", "Ask soul trinkets a number of questions equal to your proficiency bonus."]] },
      { name: "Path of the Undertaker", summary: "A warrior of death.", features: [
        [1, "Combatant", "Gain medium armor, shield and martial weapon proficiency; you may take martial talents."],
        [2, "Enraged Soul", "Expend a soul on a melee hit to deal 5 + twice your class level extra necrotic damage."],
        [6, "Extra Attack", "You attack twice when you take the Attack action."],
        [14, "Necrotic Strike", "Once per turn, a weapon hit deals an extra 2d8 necrotic damage."],
        [18, "Trap Soul", "Expend a soul to capture a dying creature's soul in your nexus (Charisma save)."]] },
      { name: "Path of the White Necromancer", summary: "A healer who commands life and death.", features: [
        [1, "Rebuke Death", "Your Life sphere healing and temporary hit points increase by your class level."],
        [2, "Lovelorn Soul", "Expend a soul to restore hit points equal to five times your class level to a creature you touch."],
        [2, "Willing Allies", "Expend a soul when reanimating to give the undead Intelligence 10 and loyalty to you."],
        [6, "Curative Souls", "Lovelorn Soul can heal two creatures within reach."],
        [14, "Temporary Resurrection", "Expend a soul to raise a corpse at one quarter hit points for 1 minute."],
        [18, "Supreme Healing", "Healing from your magic spheres uses maximum dice."]] },
      { name: "Path of the Wraith", summary: "A caster who walks between the living and the dead.", features: [
        [1, "Wraith Form", "Spend a spell point to become partly ethereal for 1 minute: advantage on Stealth and resistance to nonmagical physical damage."],
        [2, "Possession", "Expend a soul to force a humanoid to make a Charisma save or be possessed for 1 minute."],
        [6, "Enhanced Wraith Form", "In wraith form you can fly, hover and pass through creatures and objects."],
        [14, "Resistance Expansion", "In wraith form you also resist acid, fire, lightning and thunder damage."],
        [18, "Flight Enhancement", "Your wraith form fly speed becomes 30 feet and Possession can target any creature."]] }
    ]
  }
];
