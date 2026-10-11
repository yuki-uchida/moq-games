import os
from typing import Literal, get_args

from pydantic import Field, field_validator, model_validator

from jev import (AIRBORNE_TYPES, UNIT_STATS, ALLY_TYPES, ENEMY_TYPES, RANGED_ALLY_TYPES, ROUTE_IDS, BattlefieldState,
                 BoundedModel, IndependentHealing, ChoiceAdapter, ChoiceAnswer, FlightState, FortificationObservation,
                 Point, validate_state_bounds)

MAX_SUPPORT_ACTIONS = 96
SUPPORT_EFFECTS = ('heal', 'speed', 'armor', 'attack')
SUPPORT_EFFECT = Literal['heal', 'speed', 'armor', 'attack']


class SupportAction(BoundedModel):
    type: Literal['support']
    effect: SUPPORT_EFFECT
    targetId: int = Field(ge=1, le=1000000000)


class SupportBuff(BoundedModel):
    effect: Literal['speed', 'armor', 'attack']
    remaining: float = Field(ge=0, le=5)


class SingleTargetArea(BoundedModel):
    kind: Literal['single']


class CircleArea(BoundedModel):
    kind: Literal['circle']
    center: Literal['target', 'authored-impact']
    radius: float = Field(gt=0, le=100000)


class SectorArea(BoundedModel):
    kind: Literal['sector']
    center: Literal['attacker']
    radius: float = Field(gt=0, le=100000)
    angleDegrees: Literal[110]


class AlternateBreath(BoundedModel):
    interval: float = Field(gt=0, le=300)
    duration: Literal[1.2, 0.96]
    startsAfter: Literal[0.48, 0.384]
    endsAfter: Literal[0.96, 0.768]
    ticks: Literal[8]
    length: float | None = Field(default=None, gt=0, le=100000)
    endHalfWidth: float | None = Field(default=None, gt=0, le=100000)

    @model_validator(mode='after')
    def complete_geometry(self):
        # Preserve legacy observations without accepting mixed old/new clock tuples.
        if (self.duration, self.startsAfter, self.endsAfter) not in ((1.2, 0.48, 0.96), (0.96, 0.384, 0.768)):
            raise ValueError('Inconsistent breath timing')
        geometry = {'length', 'endHalfWidth'} & self.model_fields_set
        if geometry and (geometry != {'length', 'endHalfWidth'} or self.length is None or self.endHalfWidth is None):
            raise ValueError('Incomplete breath geometry')
        return self


class SupportCombat(BoundedModel):
    primaryKind: Literal['attack', 'heal'] | None = None
    healing: IndependentHealing | None = None
    primaryInterval: float = Field(gt=0, le=300)
    primaryDuration: float = Field(gt=0, le=10)
    primaryCue: Literal['hit', 'release']
    primaryCueAfter: float = Field(gt=0, le=10)
    primaryFlight: float = Field(ge=0, le=1)
    primaryArea: SingleTargetArea | CircleArea | SectorArea = Field(discriminator='kind')
    canDamageAir: bool
    home: Point | None = None
    leash: float | None = Field(default=None, ge=0, le=100000)
    healPerCast: float | None = Field(default=None, ge=0, le=100000)
    alternateBreath: AlternateBreath | None = None

    @model_validator(mode='after')
    def coherent_attack(self):
        for field in ('primaryKind', 'healing'):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError('Invalid optional independent healing context')
        if (self.primaryCueAfter > self.primaryDuration
                or (self.primaryCue == 'hit') != (self.primaryFlight == 0)):
            raise ValueError('Invalid primary attack timing')
        allied = {'home', 'leash', 'healPerCast'} & self.model_fields_set
        if allied and (allied != {'home', 'leash', 'healPerCast'}
                       or self.home is None or self.leash is None or self.healPerCast is None):
            raise ValueError('Incomplete allied combat context')
        if 'alternateBreath' in self.model_fields_set and self.alternateBreath is None:
            raise ValueError('Invalid alternate breath')
        return self


class SupportCombatRules(BoundedModel):
    battlefieldVersion: Literal[1, 2]
    spikeRetaliation: Literal[8]
    mudRadius: Literal[24]
    mudDuration: Literal[2]
    mudSpeedFactor: Literal[0.65]
    gateCannonInterval: Literal[3.2]
    gateCannonWindup: Literal[0.3]
    gateCannonFlight: Literal[0.28]
    gateArmorReductionPerLevel: Literal[0.1]
    gateDamageMultiplier: float = Field(ge=0.7, le=1)

    @field_validator('battlefieldVersion', mode='before')
    @classmethod
    def exact_battlefield_version(cls, value):
        if type(value) is not int:
            raise ValueError('Invalid battlefield version')
        return value


class VisibleProjectile(BoundedModel):
    id: str = Field(min_length=1, max_length=64, pattern=r'^(?:gate:[1-9][0-9]*|[1-9][0-9]*:[1-9][0-9]*(?::heal)?)$')
    source: Literal['gate', 'unit']
    owner: Literal['player', 'ai']
    unitType: ENEMY_TYPES | ALLY_TYPES | None = None
    attackerId: int | None = Field(default=None, ge=1, le=1000000000)
    effect: Literal['damage', 'heal']
    power: float = Field(ge=0, le=100000)
    sourceGround: Point
    targetGround: Point
    targetKind: Literal['unit', 'gate', 'barrier']
    targetId: int | None = Field(default=None, ge=1, le=1000000000)
    impactIn: float = Field(gt=0, le=0.280001)

    @model_validator(mode='after')
    def released_projectile_shape(self):
        if self.source == 'gate':
            if (not self.id.startswith('gate:') or self.owner != 'player' or self.effect != 'damage'
                    or self.targetKind != 'unit' or {'unitType', 'attackerId'} & self.model_fields_set
                    or self.power not in (8, 12, 16)):
                raise ValueError('Invalid released gate shot')
        elif (self.unitType is None or self.attackerId is None
              or not self.id.startswith(f'{self.attackerId}:')
              or self.unitType not in ('archer', 'mage', 'healer', 'frost', 'ranger', 'cannon', 'wraith', 'shaman', 'dragon')
              or (self.unitType in UNIT_STATS) != (self.owner == 'ai') or self.impactIn > .220001):
            raise ValueError('Invalid released unit projectile')
        if self.targetKind == 'gate':
            if 'targetId' in self.model_fields_set or self.owner != 'ai' or self.effect != 'damage':
                raise ValueError('Invalid gate projectile target')
        elif self.targetId is None:
            raise ValueError('Missing projectile target')
        if self.targetKind == 'barrier' and (self.owner != 'ai' or self.effect != 'damage'):
            raise ValueError('Invalid barrier projectile target')
        if self.effect == 'heal' and (self.unitType != 'healer' or self.targetKind != 'unit'
                                      or self.power not in (18, 21.6) or not self.id.endswith(':heal')):
            raise ValueError('Invalid healing projectile')
        if self.effect == 'damage' and self.id.endswith(':heal'):
            raise ValueError('Invalid damage projectile identity')
        return self


class VisibleProjectiles(BoundedModel):
    items: list[VisibleProjectile] = Field(max_length=48)
    omitted: int = Field(ge=0, le=1000)

    @model_validator(mode='after')
    def unique_projectiles(self):
        if len({(shot.source, shot.id) for shot in self.items}) != len(self.items):
            raise ValueError('Duplicate visible projectile')
        if self.omitted and len(self.items) != 48:
            raise ValueError('Invalid projectile truncation')
        return self


class SupportUnit(BoundedModel):
    equipment: Literal['weapon', 'armor'] | None = None
    id: int = Field(ge=1, le=1000000000)
    type: ENEMY_TYPES | ALLY_TYPES
    hp: float = Field(gt=0, le=1000000)
    maxHp: float = Field(gt=0, le=1000000)
    x: float = Field(ge=-1000, le=100000)
    y: float = Field(ge=-1000, le=100000)
    attack: float = Field(ge=0, le=100000)
    speed: float = Field(ge=0, le=100000)
    armor: float = Field(ge=0, le=0.6)
    range: float = Field(ge=0, le=100000)
    progress: float = Field(ge=0, le=100000)
    routeId: ROUTE_IDS | None = None
    boss: bool
    airborne: bool
    gateExit: bool
    attackReadyIn: float = Field(ge=0, le=300)
    slowRemaining: float = Field(ge=0, le=300)
    slowFactor: float = Field(gt=0, le=1)
    mudSlowRemaining: float = Field(ge=0, le=2.01)
    flight: FlightState | None = None
    buff: SupportBuff | None = None
    combat: SupportCombat | None = None

    @model_validator(mode='after')
    def actual_living_unit(self):
        if 'equipment' in self.model_fields_set and (self.equipment is None or self.type in UNIT_STATS):
            raise ValueError('Equipment belongs to a visible defender')
        if self.hp > self.maxHp or self.airborne != (self.type in AIRBORNE_TYPES):
            raise ValueError('Invalid support target stats')
        if (self.flight is not None and (not self.airborne or self.routeId is None)
                or self.buff is not None and self.type not in UNIT_STATS
                or self.mudSlowRemaining > 0 and (self.airborne or self.type not in UNIT_STATS)):
            raise ValueError('Invalid support target effects')
        if 'combat' in self.model_fields_set:
            if self.combat is None:
                raise ValueError('Invalid support combat context')
            if (self.type in UNIT_STATS) == (self.combat.home is not None):
                raise ValueError('Combat home is only for defenders')
            heal_amount = 21.6 if self.type == 'healer' and self.equipment == 'weapon' and self.combat.primaryKind is not None else {'healer': 18, 'paladin': 8}.get(self.type, 0)
            if self.type not in UNIT_STATS and self.combat.healPerCast not in ((0, 8) if self.type == 'paladin' else (heal_amount,)):
                raise ValueError('Invalid allied healing amount')
            if (self.type == 'dragon') != (self.combat.alternateBreath is not None):
                raise ValueError('Invalid dragon attack context')
            if self.combat.primaryKind is not None:
                expected = {'healer': (21.6 if self.equipment == 'weapon' else 18, 5), 'paladin': (8, 4) if self.combat.healPerCast == 8 else None}.get(self.type)
                healing = self.combat.healing
                if ((self.combat.primaryKind == 'heal') != (self.type == 'healer')
                        or (expected is not None) != (healing is not None)
                        or healing is not None and expected != (healing.amount, healing.interval)
                        or self.type == 'healer' and (self.attack != 0 or self.combat.primaryInterval != 5
                                                   or self.combat.canDamageAir)):
                    raise ValueError('Invalid independent healing capabilities')
            elif self.combat.healing is not None:
                raise ValueError('Independent healing requires an action kind')
            area = self.combat.primaryArea
            if ((area.kind == 'sector') != (self.type == 'ogre')
                    or (area.kind == 'circle') != (self.type in ('brute', 'dragon', 'mage', 'cannon') or self.type == 'paladin' and self.combat.healPerCast == 0)
                    or area.kind == 'circle' and (area.center == 'authored-impact') != (self.type == 'brute')
                    or self.type == 'paladin' and self.combat.healPerCast == 0 and (area.radius != 48 or area.center != 'target')):
                raise ValueError('Invalid primary attack area')
        return self


class SupportReadiness(BoundedModel):
    ready: bool
    nextReadyIn: float = Field(ge=0, le=10)
    castSeconds: Literal[0.6]
    cooldown: Literal[10]
    duration: Literal[5]
    healFraction: Literal[0.15]
    maximumHeal: Literal[40]
    speedMultiplier: Literal[1.15]
    attackMultiplier: Literal[1.15]
    armorBonus: Literal[0.1]
    maximumArmor: Literal[0.6]


class SupportHistory(BoundedModel):
    effect: SUPPORT_EFFECT
    targetId: int = Field(ge=1, le=1000000000)
    at: float = Field(ge=0, le=1000000000)
    outcome: Literal['applied', 'target-lost', 'cancelled', 'ineligible']
    amount: float = Field(ge=0, le=40)


class SupportObservation(BoundedModel):
    commanderSupportVersion: Literal[1]
    time: float = Field(ge=0, le=1000000000)
    stage: int = Field(ge=1, le=10)
    phase: Literal['preparation', 'assault', 'cleared', 'defeat', 'victory']
    fieldId: Literal['meadow', 'desert', 'frost', 'volcanic']
    playerBaseHp: float = Field(ge=0, le=100)
    support: SupportReadiness
    gate: Point
    battlefield: BattlefieldState
    fortifications: FortificationObservation | None = None
    combatRules: SupportCombatRules | None = None
    visibleProjectiles: VisibleProjectiles | None = None
    defenders: list[SupportUnit] = Field(max_length=10)
    enemies: list[SupportUnit] = Field(max_length=23)
    recentSupport: list[SupportHistory] = Field(max_length=4)
    legalActions: list[SupportAction] = Field(max_length=MAX_SUPPORT_ACTIONS)

    @field_validator('commanderSupportVersion', mode='before')
    @classmethod
    def exact_support_version(cls, value):
        if type(value) is not int or value != 1:
            raise ValueError('Invalid support version')
        return value

    @model_validator(mode='after')
    def legal_support_only(self):
        for field in ('combatRules', 'visibleProjectiles'):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError('Invalid optional combat observation')
        units = [*self.defenders, *self.enemies]
        if len({unit.id for unit in units}) != len(units):
            raise ValueError('Duplicate support unit')
        if any(unit.type in UNIT_STATS or unit.buff or unit.gateExit for unit in self.defenders):
            raise ValueError('Invalid defender support summary')
        if any(unit.type not in UNIT_STATS or unit.routeId not in ('left', 'right') for unit in self.enemies):
            raise ValueError('Invalid enemy support summary')
        if any(event.at > self.time + .005 for event in self.recentSupport):
            raise ValueError('Future support history')
        if self.combatRules:
            expected = 1 - (self.fortifications.gate.armorLevel if self.fortifications else 0) * .1
            if abs(self.combatRules.gateDamageMultiplier - expected) > 1e-9:
                raise ValueError('Gate damage multiplier does not match armor')
            for unit in units:
                if unit.combat:
                    can_damage_air = (self.combatRules.battlefieldVersion == 1 or unit.type in UNIT_STATS
                                      or unit.type in get_args(RANGED_ALLY_TYPES))
                    if unit.combat.primaryKind == 'heal':
                        can_damage_air = False
                    if unit.combat.canDamageAir != can_damage_air:
                        raise ValueError('Invalid airborne damage eligibility')
        if self.visibleProjectiles and self.visibleProjectiles.items and self.phase != 'assault':
            raise ValueError('Projectiles are visible only during assault')
        ready = self.phase == 'assault' and self.time >= 9.995 and self.playerBaseHp > 0 and self.support.nextReadyIn == 0
        if self.support.ready and not ready:
            raise ValueError('Support cannot be ready yet')
        enemies = {unit.id: unit for unit in self.enemies}
        seen = set()
        for action in self.legalActions:
            key = (action.effect, action.targetId)
            target = enemies.get(action.targetId)
            if (key in seen or not self.support.ready or not target or target.gateExit
                    or action.effect == 'heal' and target.hp >= target.maxHp
                    or action.effect != 'heal' and target.buff is not None):
                raise ValueError('Illegal commander support candidate')
            seen.add(key)
        return self


def validate_support_state(state: dict) -> dict:
    validate_state_bounds(state, MAX_SUPPORT_ACTIONS)
    return SupportObservation.model_validate(state).model_dump(exclude_unset=True)


def support_action_key(action: dict) -> str:
    parsed = SupportAction.model_validate(action)
    return f'support:{parsed.effect}:{parsed.targetId}'


class SupportChoiceAnswer(ChoiceAnswer):
    probabilities: dict[str, object] = Field(default_factory=dict, max_length=MAX_SUPPORT_ACTIONS)


class JevSupportAdapter(ChoiceAdapter):
    inference_interval = 10.0

    async def decide(self, state: dict) -> dict:
        state = validate_support_state(state)
        options = {support_action_key(action): action for action in state['legalActions']}
        return await self.choose(state, options)

    async def _request(self, state: dict, options: dict[str, dict]) -> dict:
        targets = {unit['id']: unit for unit in state['enemies']}
        payload = {
            'model': os.getenv('JEV_MODEL') or 'jev-latest',
            'state': {'board': state, 'rules': {
                'controlledSide': 'ai',
                'purpose': 'Choose exactly one offered commander support action for a living AI enemy.',
                'timing': 'Support is first ready ten seconds into the stage. Acceptance starts a 0.6 second cast and a separate ten second cooldown. No support can be requested while casting or on cooldown. If the fixed target dies or exits during the cast, it fails without retargeting or refund.',
                'effects': 'Heal restores min(15% of maximum HP, 40 HP), capped at missing HP. Speed and attack multiply the corresponding base stat by 1.15 for five seconds. Armor adds 0.10 damage reduction, capped at 0.60, for five seconds. Active buffs cannot stack or refresh. Heal is allowed alongside an active buff. Observed attack is support-adjusted damage with unchanged attack cadence. Observed speed is support-adjusted movement speed before terrain/mud/frost: movement uses the stronger terrain or mud slow, then the frost factor; flyers ignore road effects. Observed armor already includes support. Do not apply support multipliers again.',
                'budget': 'Support is independent of deployment, spawn count, cost budgets and formation reservations. Never return a spawn, formation or wait. There is no local support fallback.',
                'combat': 'Optional unit.combat describes known attack rules, not a future attack or chosen target. primaryInterval is the actual cooldown assigned for the primary attack, including the existing doubled cadence and enemy pacing, calculated from base speed; support speed does not shorten that cooldown. primaryDuration includes recovery; primaryCueAfter and primaryFlight are actual simulation times in seconds. Use the supplied duration/cue/flight values directly, without rescaling; old clients may report original clocks. primaryInterval retains original authored-duration pacing. Already accepted older attacks retain their captured times. Units also pause movement for the complete attack. attack is current support-adjusted raw damage per hit, not DPS or guaranteed future damage; target armor reduces unit damage at impact. primaryArea is the actual primary geometry with boss/battlefield scaling already included: a circle around the target, a brute circle around its authored impact point, or an ogre 110-degree sector from the attacker. Area does not enlarge primary acquisition range. Heavy primary targets remain locked; secondary targets must be inside the area at impact. Base and barriers are not secondary collateral. Allied home/leash limits pursuit; With primaryKind=heal, Healer heals 18 (21.6 with its existing weapon equipment, a single 20% bonus) and has zero offensive damage and zero anti-air coverage; primaryInterval is its 5s heal interval. Paladin keeps its damage attack and independently heals 8 every 4s. healing reports the effective amount including any existing Healer weapon bonus, interval, optional actual acquisition range and remaining simulation cooldown; Paladin healing uses 46 range and Healer healing uses 175 range; never multiply the reported amount again; these are not charges. attackReadyIn is the legacy offensive clock; ignore it for primaryKind=heal and use healing.readyIn. Released projectile power is its creation snapshot. Both action kinds occupy the full windup/release/recovery lane and due healing gets priority once it is free. No attack or speed buff multiplies healing. Legacy observations without primaryKind retain their original coupled rules. Dragon alternateBreath gives scaled length/endHalfWidth and separate known timings when that alternate animation is enabled; it is not a prediction of the next attack. Its attack power is divided across ticks, with cone membership checked at each tick. Do not multiply effective stats or scaled geometry again.',
                'gateCombat': 'The player gate has priority whenever an enemy can attack it, including direct flight missions. In battlefield version 2, an ordinary enemy completes one successful gate attack and recovery, remains targetable during recovery, then exits. A boss stays and repeatedly attacks on its cooldown until killed. gateExit marks the already exiting enemy and makes it ineligible for support. There is no AI base. Use the observed gate location and attack range; proximity alone does not guarantee a hit.',
                'airDefense': 'In battlefield version 2, ranged allies archer, mage, frost, ranger and cannon can damage airborne bat, wraith and dragon. With primaryKind=heal, Healer remains eligible as a raid target but never damages an enemy. Wraith is also vulnerable to soldier, runner, tank and paladin melee. A visible flight mission approaches and attacks its fixed defender without tank diversion. If that defender dies or disappears, the flyer returns continuously to returnProgress on its selected route, without teleporting or selecting another defender. Gate priority still applies. Flyers ignore road barriers and terrain/mud slow. A flight target is observed mission state, not permission to select a new support target.',
                'fortifications': 'Use the actual remaining item HP/charges and fortifications.gate range, damage and nextShotIn. Spikes block grounded road travelers and retaliate only when struck by a grounded melee attack at impact; their raw retaliation is combatRules.spikeRetaliation and unit armor reduces it. Ranged attacks receive no remote retaliation. Each grounded entry into the mud circle of combatRules.mudRadius spends one charge and applies combatRules.mudSpeedFactor for combatRules.mudDuration, even after leaving. Staying inside spends no extra charge; exiting and re-entering can spend another. A spent puddle disappears while its existing slow finishes. Natural terrain and mud use the stronger slow, then frost multiplies it. Gate cannon timing is combatRules.gateCannonInterval, gateCannonWindup and gateCannonFlight; cooldown is independent of commander support. It can shoot ground and airborne enemies within its ground-coordinate range, prefers an in-range boss, then the nearest enemy, with ID as tie-breaker. It locks that living target through flight and never substitutes a dead target. Gate armor uses combatRules.gateArmorReductionPerLevel per purchased level, and gateDamageMultiplier is the already computed incoming damage multiplier. Missing numeric context stays unknown.',
                'visibleProjectiles': 'Optional visibleProjectiles contains only already released, currently flying unit or gate projectiles. source distinguishes gate from unit attacker IDs. sourceGround and targetGround are observed world ground/reference coordinates, not sprite emitter or current projectile pixel positions. impactIn is the remaining authored impactAt minus observation time for that already released shot, not a forecast of an unstarted attack. power is captured raw damage or separate heal amount before target mitigation/capping; a later support attack buff does not retroactively change an already released shot. These facts do not guarantee a hit, future HP or survival. omitted counts additional released projectiles excluded by the bounded observation. Unreleased windups, future shots and hidden target plans are absent.',
                'evidence': 'Consider actual target HP, attack, speed, armor, combat rules, position, route, flight, visible gate/defender threats, fortifications, released projectiles and recentSupport outcomes. Compare the time until observed threats with the support cast time and duration without claiming future results. Recent support is separate from deployment history. Unknown or missing facts stay unknown.'}},
            'questions': {'support': {
                'type': 'choice',
                'instructions': 'Choose one listed support effect and fixed living enemy target. Return Choice probabilities only for the offered support keys. Do not invent targets, actions, hidden reasoning or unavailable measurements.',
                'criteria': {key: {'action': action, 'target': targets[action['targetId']]} for key, action in options.items()}}}
        }
        return await self.request_choice(payload, options, 'support', SupportChoiceAnswer)
