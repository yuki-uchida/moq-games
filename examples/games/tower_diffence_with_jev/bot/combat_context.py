"""Bounded deployment observations and static candidate capabilities.

This is a transport contract, never a targeting simulator or local Rule score.
Missing version/fields remain unknown in historical messages.
"""
import math
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from roadblock_context import TankRoadblockStop

# Cross-language fixtures compare these definitions and cadence to the browser.
ENEMY_COMBAT = {
    'slime': (0, .960, 'contact'), 'goblin': (0, .864, 'contact'),
    'wolf': (0, .750, 'contact'), 'beetle': (.3, .960, 'contact'),
    'shaman': (0, .960, 'projectile'), 'brute': (0, 1.200, 'area-contact'),
    'bat': (0, .600, 'contact'), 'wraith': (.15, .960, 'projectile'),
    'ogre': (0, 1.200, 'area-contact'), 'dragon': (0, 1.000, 'projectile-and-breath'),
}
AIRBORNE = frozenset(('bat', 'wraith', 'dragon'))


def enemy_attack_interval(speed, attack_speed, duration):
    walk = max(.35, min(.65, 28 / max(1, speed)))
    return 2 * max(1 / attack_speed + .15, duration + walk)


def candidate_combat(unit_type, stats):
    armor, duration, mode = ENEMY_COMBAT[unit_type]
    return {
        'armor': armor,
        'attackMode': mode,
        'airborne': unit_type in AIRBORNE,
        'attackInterval': enemy_attack_interval(stats['speed'], stats['attackSpeed'], duration),
        **({'breathAttackInterval': enemy_attack_interval(stats['speed'], stats['attackSpeed'], 1.2)}
           if unit_type == 'dragon' else {}),
    }


class CombatModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, allow_inf_nan=False)


class CombatObservation(CombatModel):
    version: Literal[1]
    at: float = Field(ge=0, le=1000000000)


class CombatMovement(CombatModel):
    unimpededSpeed: float = Field(ge=0, le=100000)
    effectiveSpeed: float = Field(ge=0, le=100000)
    terrainFactor: float = Field(gt=0, le=1)
    mudFactor: Literal[1, .65]
    frostFactor: Literal[1, .55]
    mudRemaining: float = Field(ge=0, le=2.000001)
    frostRemaining: float = Field(ge=0, le=1.600001)
    supportRemaining: float = Field(ge=0, le=5.000001)
    moving: bool
    roadblock: TankRoadblockStop | None = None

    @model_validator(mode='after')
    def coherent_factors(self):
        if 'roadblock' in self.model_fields_set and self.roadblock is None:
            raise ValueError('Null Tank roadblock is not an observation')
        expected = self.unimpededSpeed * min(self.terrainFactor, self.mudFactor) * self.frostFactor
        if not math.isclose(self.effectiveSpeed, expected, rel_tol=1e-9, abs_tol=1e-7):
            raise ValueError('Movement factors disagree with instantaneous capacity')
        if self.mudFactor != (.65 if self.mudRemaining > 1e-9 else 1):
            raise ValueError('Mud factor disagrees with remaining time')
        if self.frostRemaining <= 1e-9 and self.frostFactor != 1:
            raise ValueError('Expired frost cannot slow movement')
        return self


class CommittedAction(CombatModel):
    kind: Literal['attack', 'heal', 'legacy-coupled']
    status: Literal['windup', 'released', 'hit', 'missed', 'cancelled']
    targetKind: Literal['unit', 'barrier', 'base', 'none']
    targetId: int | None = Field(default=None, ge=1, le=1000000000)
    targetAvailable: bool
    healTargetId: int | None = Field(default=None, ge=1, le=1000000000)
    healTargetAvailable: bool | None = None
    releaseIn: float = Field(ge=0, le=30)
    impactIn: float = Field(ge=0, le=30)
    endsIn: float = Field(ge=0, le=30)
    variant: Literal['breath'] | None = None
    ticksRemaining: int | None = Field(default=None, ge=0, le=8)
    emissionRemaining: float | None = Field(default=None, ge=0, le=.960001)

    @model_validator(mode='after')
    def coherent_action(self):
        if (self.targetKind in ('unit', 'barrier')) != (self.targetId is not None):
            raise ValueError('Committed target kind/id mismatch')
        if self.targetKind == 'none' and self.targetAvailable:
            raise ValueError('Missing committed recipient cannot be available')
        if self.kind == 'heal' and self.targetKind != 'unit':
            raise ValueError('Healing recipient must be an original unit')
        if (self.healTargetId is not None) != (self.healTargetAvailable is not None):
            raise ValueError('Incomplete historical healing recipient')
        if self.healTargetId is not None and self.kind != 'legacy-coupled':
            raise ValueError('Secondary healing recipient belongs only to a historical coupled action')
        if (self.releaseIn > self.impactIn + 1e-9 or self.releaseIn > self.endsIn + 1e-9
                or max(self.impactIn, self.endsIn) <= 0):
            raise ValueError('Stale or contradictory committed action clock')
        if self.status in ('released', 'hit', 'missed') and self.releaseIn > 1e-9:
            raise ValueError('Released action has a future release')
        if self.status in ('hit', 'missed') and self.impactIn > 1e-9:
            raise ValueError('Resolved action has a future initial impact')
        if self.variant == 'breath':
            if self.kind == 'heal' or self.ticksRemaining is None or self.emissionRemaining is None:
                raise ValueError('Incomplete breath commitment')
        elif {'variant', 'ticksRemaining', 'emissionRemaining'} & self.model_fields_set:
            raise ValueError('Breath fields require the breath variant')
        return self


class UnitCombat(CombatModel):
    alive: bool
    armor: float = Field(ge=0, le=.6)
    attackInterval: float | None = Field(default=None, gt=0, le=201)
    attackReadyIn: float | None = Field(default=None, ge=0, le=30)
    breathAttackInterval: float | None = Field(default=None, gt=0, le=201)
    movement: CombatMovement
    committedAction: CommittedAction | None = None

    @model_validator(mode='after')
    def coherent_attack(self):
        attack_fields = {'attackInterval', 'attackReadyIn'} & self.model_fields_set
        if attack_fields and (len(attack_fields) != 2 or self.attackInterval is None or self.attackReadyIn is None):
            raise ValueError('Incomplete offensive clock')
        if self.attackReadyIn is not None and self.attackReadyIn > max(self.attackInterval, self.breathAttackInterval or 0) + 1e-6:
            raise ValueError('Offensive cooldown exceeds its effective interval')
        if 'committedAction' in self.model_fields_set and self.committedAction is None:
            raise ValueError('Null committed action is not an observation')
        return self


def validate_combat_context(state):
    observation = state.combatObservation
    rows = state.defenders + state.enemies
    if observation is None:
        if 'combatObservation' in state.model_fields_set or any('combat' in row.model_fields_set for row in rows):
            raise ValueError('Combat fields require an observation version and exact time')
        return
    if abs(observation.at - state.time) > .050001:
        raise ValueError('Combat observation is stale for this board')
    by_id = {row.id: row for row in rows if row.id is not None}
    barrier_ids = set()
    if state.roadEffects:
        barrier_ids.update(bag.id for bag in (state.roadEffects.sandbags or []))
        if state.roadEffects.sandbag:
            barrier_ids.add(state.roadEffects.sandbag.id)
    if state.fortifications:
        barrier_ids.update(item.id for item in state.fortifications.items if item.kind == 'spike')
    for row in rows:
        combat = row.combat
        if combat is None:
            if 'combat' in row.model_fields_set:
                raise ValueError('Null combat is not an observation')
            continue
        enemy = row.type in ENEMY_COMBAT
        movement = combat.movement
        if row.hp > 0 and not combat.alive:
            raise ValueError('Positive observed HP cannot be dead')
        if row.armor is not None and not math.isclose(row.armor, combat.armor, abs_tol=1e-9):
            raise ValueError('Combat armor disagrees with effective armor')
        if row.speed is not None and not math.isclose(row.speed, movement.unimpededSpeed, abs_tol=1e-7):
            raise ValueError('Combat speed disagrees with pre-slow speed')
        if row.type == 'healer':
            if {'attackInterval', 'attackReadyIn', 'breathAttackInterval'} & combat.model_fields_set:
                raise ValueError('Healer has no independent damage attack')
        elif combat.attackInterval is None:
            raise ValueError('Damage-capable combat observation requires its offensive clock')
        if (combat.breathAttackInterval is not None) != (row.type == 'dragon'):
            raise ValueError('Only Dragon has an alternate breath cadence')
        if not enemy and (movement.terrainFactor != 1 or movement.mudFactor != 1 or movement.frostFactor != 1
                          or movement.mudRemaining != 0 or movement.frostRemaining != 0):
            raise ValueError('Defender cannot inherit enemy road/frost effects')
        if row.type in AIRBORNE and (movement.terrainFactor != 1 or movement.mudFactor != 1 or movement.mudRemaining != 0):
            raise ValueError('Airborne units ignore terrain and paid mud')
        if row.mudSlowRemaining is not None and abs(row.mudSlowRemaining - movement.mudRemaining) > .005001:
            raise ValueError('Mud observations disagree')
        buff = row.supportBuff
        remaining = max(0, buff.expiresAt - observation.at) if buff and buff.startedAt <= observation.at else 0
        if not math.isclose(movement.supportRemaining, remaining, abs_tol=1e-8):
            raise ValueError('Support lifetime disagrees with exact combat time')
        if buff and not buff.startedAt <= observation.at < buff.expiresAt - 1e-9:
            raise ValueError('Expired or future support buff is not active')
        action = combat.committedAction
        if not action:
            continue
        if action.targetKind in ('base', 'barrier') and not enemy:
            raise ValueError('Only enemies commit attacks against player defenses')
        if action.healTargetId is not None and row.type not in ('healer', 'paladin'):
            raise ValueError('Historical healing requires a healing-capable defender')
        if action.variant == 'breath' and row.type != 'dragon':
            raise ValueError('Only Dragon commits breath attacks')
        if action.kind == 'heal' and row.type not in ('healer', 'paladin'):
            raise ValueError('This unit cannot commit a healing action')
        if action.kind == 'attack' and row.type == 'healer':
            raise ValueError('Healer cannot commit a new damage attack')
        def target_alive(identifier):
            target = by_id.get(identifier)
            return bool(target and (target.combat.alive if target.combat else target.hp > 0))
        if action.targetKind == 'unit':
            if action.targetAvailable != target_alive(action.targetId):
                raise ValueError('Committed target availability is stale')
            target = by_id.get(action.targetId)
            if target:
                same_side = (target.type in ENEMY_COMBAT) == enemy
                if action.kind != 'legacy-coupled' and same_side != (action.kind == 'heal'):
                    raise ValueError('Committed recipient belongs to the wrong side')
        elif action.targetKind == 'barrier' and action.targetAvailable != (action.targetId in barrier_ids):
            raise ValueError('Committed barrier availability is stale')
        elif action.targetKind == 'base' and action.targetAvailable != (state.playerBaseHp > 0):
            raise ValueError('Committed base availability is stale')
        if action.healTargetId is not None and action.healTargetAvailable != target_alive(action.healTargetId):
            raise ValueError('Historical healing recipient availability is stale')
