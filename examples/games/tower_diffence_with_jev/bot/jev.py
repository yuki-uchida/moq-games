import asyncio
import copy
import json
import math
import os
import re
import time
from typing import Literal
from dataclasses import dataclass

import httpx
from choice_payload import compact_deployment_payload, deployment_prompt_budget
from combat_context import CombatObservation, UnitCombat, candidate_combat, validate_combat_context
from roadblock_context import RoadblockTank, validate_roadblock_context
from deployment_history_payload import fit_deployment_payload
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
MAX_STATE_BYTES = 65536
MAX_UNITS = 48
# Full route/mission choices for all ten supported legacy ranged individuals.
# This application bound is below the provider's published 255-option Choice cap.
MAX_LEGAL_ACTIONS = 100
MAX_DIAGNOSTIC_ACTIONS = 110
MAX_FLIGHT_TARGETS = 10
NO_DECISION_REASONS = frozenset(('no-legal-actions', 'active-plan', 'backoff', 'busy', 'throttled',
                                 'not-configured', 'timeout', 'error', 'unavailable'))
UNIT_STATS = {
    'slime': {'hp': 96, 'attack': 5, 'speed': 64, 'range': 44, 'attackSpeed': .7, 'cooldown': 2, 'cost': 1, 'unlockStage': 1},
    'goblin': {'hp': 156, 'attack': 8, 'speed': 78, 'range': 48, 'attackSpeed': .8, 'cooldown': 3, 'cost': 2, 'unlockStage': 1},
    'wolf': {'hp': 130, 'attack': 8, 'speed': 130, 'range': 52, 'attackSpeed': 1.1, 'cooldown': 4, 'cost': 2, 'unlockStage': 2},
    'beetle': {'hp': 135, 'attack': 9, 'speed': 60, 'range': 48, 'attackSpeed': .7, 'cooldown': 5, 'cost': 3, 'unlockStage': 3},
    'shaman': {'hp': 90, 'attack': 12, 'speed': 66, 'range': 185, 'attackSpeed': .8, 'cooldown': 5, 'cost': 3, 'unlockStage': 1},
    'brute': {'hp': 230, 'attack': 16, 'speed': 52, 'range': 48, 'attackSpeed': .65, 'cooldown': 6, 'cost': 4, 'unlockStage': 5},
    'bat': {'hp': 65, 'attack': 8, 'speed': 155, 'range': 44, 'attackSpeed': 1.3, 'cooldown': 4, 'cost': 3, 'unlockStage': 6},
    'wraith': {'hp': 145, 'attack': 14, 'speed': 86, 'range': 165, 'attackSpeed': .8, 'cooldown': 6, 'cost': 4, 'unlockStage': 3},
    'ogre': {'hp': 310, 'attack': 22, 'speed': 48, 'range': 64, 'attackSpeed': .65, 'cooldown': 8, 'cost': 5, 'unlockStage': 8},
    'crystalSentinel': {'hp': 170, 'attack': 10, 'speed': 56, 'range': 48, 'attackSpeed': 0.7, 'cooldown': 6, 'cost': 3, 'unlockStage': 4},
    'koboldLancer': {'hp': 112, 'attack': 11, 'speed': 84, 'range': 80, 'attackSpeed': 0.8, 'cooldown': 4, 'cost': 2, 'unlockStage': 2},
    'clockworkPatchling': {'hp': 155, 'attack': 7, 'speed': 62, 'range': 44, 'attackSpeed': 0.7, 'cooldown': 5, 'cost': 3, 'unlockStage': 4},
    'dragon': {'hp': 261, 'attack': 18, 'speed': 74, 'range': 170, 'attackSpeed': .8, 'cooldown': 8, 'cost': 5, 'unlockStage': 9},
}
FORMATIONS = {
    'escort': {'types': ['goblin', 'shaman'], 'interval': 1, 'unlockStage': 2},
    'skirmish': {'types': ['slime', 'goblin'], 'interval': 0},
    'rush': {'types': ['wolf', 'goblin'], 'interval': 0},
    'screen': {'types': ['beetle', 'shaman'], 'interval': 1},
    'pressure': {'types': ['brute', 'shaman'], 'interval': 1},
    'layered': {'types': ['beetle', 'shaman', 'wraith'], 'interval': 1},
    'flight': {'types': ['bat', 'wolf'], 'interval': 0},
    'heavy': {'types': ['ogre', 'brute'], 'interval': 1},
    'barrage': {'types': ['ogre', 'wraith', 'dragon'], 'interval': 0},
}
# Freeze the pre-v2 history grammar before appending the smallest new formation.
LEGACY_FORMATIONS = copy.deepcopy(FORMATIONS)
FORMATIONS['breakthrough'] = {'types': ['beetle', 'wolf'], 'interval': 1, 'unlockStage': 3}
ENEMY_TYPES = Literal['slime', 'goblin', 'wolf', 'beetle', 'shaman', 'brute', 'bat', 'wraith', 'ogre', 'dragon', 'crystalSentinel', 'koboldLancer', 'clockworkPatchling']
ALLY_TYPES = Literal['soldier', 'archer', 'runner', 'tank', 'mage', 'healer', 'frost', 'ranger', 'cannon', 'paladin']
ROUTE_IDS = Literal['left', 'right']
RANGED_ALLY_TYPES = Literal['archer', 'mage', 'healer', 'frost', 'ranger', 'cannon']
AIRBORNE_TYPES = frozenset(('bat', 'wraith', 'dragon'))


class BoundedModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, allow_inf_nan=False)


class Point(BoundedModel):
    x: float = Field(ge=0, le=100000)
    y: float = Field(ge=0, le=100000)


class FieldState(BoundedModel):
    id: Literal['meadow', 'desert', 'frost', 'volcanic']
    pathLength: float = Field(gt=0, le=100000)
    weights: dict[ENEMY_TYPES, float] = Field(max_length=13)
    width: float | None = Field(default=None, gt=0, le=100000)
    height: float | None = Field(default=None, gt=0, le=100000)
    entrance: Point | None = None
    gate: Point | None = None

    @field_validator('weights')
    @classmethod
    def bounded_weights(cls, weights):
        if any(not 0 <= weight <= 100 for weight in weights.values()):
            raise ValueError('Invalid field weights')
        return weights


class WaveState(BoundedModel):
    enemyCount: int = Field(ge=0, le=1000)
    strength: float = Field(gt=0, le=100)
    spawnInterval: float = Field(ge=0, le=300)
    reward: int = Field(ge=0, le=1000000)
    enemyTypes: list[ENEMY_TYPES] = Field(max_length=13)
    spawnBudget: int = Field(ge=0, le=100000)
    bossType: ENEMY_TYPES | None
    spawned: int = Field(ge=0, le=1000)
    resolved: int = Field(ge=0, le=1000)
    budgetRemaining: int = Field(ge=0, le=100000)
    reservedCount: int = Field(default=0, ge=0, le=3)
    reservedBudget: int = Field(default=0, ge=0, le=15)
    nextSpawnIn: float = Field(default=0, ge=0, le=300)


class FlightState(BoundedModel):
    targetId: int = Field(ge=1, le=1000000000)
    returnProgress: float = Field(ge=0, le=100000)
    phase: Literal['approach', 'engage', 'return']


class SupportBuffState(BoundedModel):
    effect: Literal['speed', 'armor', 'attack']
    sequence: int = Field(ge=1, le=1000000000)
    startedAt: float = Field(ge=0, le=1000000000)
    expiresAt: float = Field(ge=0, le=1000000000)

    @model_validator(mode='after')
    def fixed_duration(self):
        if abs(self.expiresAt - self.startedAt - 5) > 1e-6:
            raise ValueError('Invalid support buff duration')
        return self


class IndependentHealing(BoundedModel):
    kind: Literal['heal']
    amount: Literal[18, 21.6, 8]
    interval: Literal[5, 4]
    # Older observations omit range; current healing reports its own acquisition radius.
    range: Literal[46, 175] | None = None
    readyIn: float = Field(ge=0, le=5)

    @model_validator(mode='after')
    def coherent_healing(self):
        if (self.amount, self.interval) not in ((18, 5), (21.6, 5), (8, 4)) or self.readyIn > self.interval + 1e-9:
            raise ValueError('Invalid independent healing clock')
        if 'range' in self.model_fields_set and (self.range != (46 if self.amount == 8 else 175)):
            raise ValueError('Invalid independent healing range')
        return self


class UnitState(BoundedModel):
    roadblockTank: RoadblockTank | None = None
    combat: UnitCombat | None = None
    healing: IndependentHealing | None = None
    id: int | None = Field(default=None, ge=1, le=1000000000)
    type: ENEMY_TYPES | ALLY_TYPES
    level: int | None = Field(default=None, ge=1, le=4)
    maxHp: float | None = Field(default=None, gt=0, le=1000000)
    equipment: Literal['weapon', 'armor'] | None = None
    speed: float | None = Field(default=None, ge=0, le=100000)
    armor: float | None = Field(default=None, ge=0, le=0.6)
    supportBuff: SupportBuffState | None = None
    mudSlowRemaining: float | None = Field(default=None, ge=0, le=2.000001)
    hp: float = Field(ge=0, le=1000000)
    attack: float = Field(ge=0, le=100000)
    x: float = Field(ge=-1000, le=100000)
    y: float = Field(ge=-1000, le=100000)
    progress: float = Field(ge=0, le=100000)
    stationary: bool
    range: float = Field(ge=0, le=100000)
    boss: bool
    homeX: float | None = Field(default=None, ge=-1000, le=100000)
    homeY: float | None = Field(default=None, ge=-1000, le=100000)
    leash: float | None = Field(default=None, ge=0, le=100000)
    splash: float = Field(default=0, ge=0, le=100000)
    role: Literal['area', 'support', 'single'] = 'single'
    routeId: ROUTE_IDS | None = None
    flight: FlightState | None = None

    @model_validator(mode='after')
    def individual_stats(self):
        if 'healing' in self.model_fields_set:
            expected = {'healer': (21.6 if self.equipment == 'weapon' else 18, 5), 'paladin': (8, 4)}.get(self.type)
            if (self.healing is None or expected != (self.healing.amount, self.healing.interval)
                    or self.type == 'healer' and self.attack != 0):
                raise ValueError('Invalid independent healer capabilities')
        support_fields = {'speed', 'armor'} & self.model_fields_set
        if support_fields and (support_fields != {'speed', 'armor'} or self.speed is None or self.armor is None or self.maxHp is None):
            raise ValueError('Incomplete support unit stats')
        provided = {'level', 'maxHp'} & self.model_fields_set
        if provided and (self.maxHp is None or self.hp > self.maxHp + .5 or
                         (not support_fields or 'level' in provided) and
                         (provided != {'level', 'maxHp'} or self.level is None or self.type in UNIT_STATS)):
            raise ValueError('Invalid individual defender stats')
        if 'equipment' in self.model_fields_set and (self.equipment is None or self.level is None):
            raise ValueError('Equipment requires a visible allied individual')
        if 'supportBuff' in self.model_fields_set and (not support_fields or self.supportBuff is None or self.type not in UNIT_STATS):
            raise ValueError('Invalid support buff target')
        if 'mudSlowRemaining' in self.model_fields_set and (
                self.mudSlowRemaining is None or self.type not in UNIT_STATS or self.type in AIRBORNE_TYPES):
            raise ValueError('Paid mud slows grounded enemies only')
        return self


class RoadItemObservation(BoundedModel):
    id: int = Field(ge=1, le=1000000000)
    kind: Literal['spike', 'mud']
    x: float = Field(ge=0, le=100000)
    y: float = Field(ge=0, le=100000)
    edgeId: Literal['entry', 'left', 'right', 'gate', 'legacy']
    offset: float = Field(ge=0, le=100000)
    hp: float | None = Field(default=None, gt=0, le=40)
    maxHp: Literal[40] | None = None
    charges: int | None = Field(default=None, ge=1, le=6)

    @model_validator(mode='after')
    def appropriate_durability(self):
        provided = {'hp', 'maxHp', 'charges'} & self.model_fields_set
        if self.kind == 'spike':
            if provided != {'hp', 'maxHp'} or self.hp is None or self.maxHp != 40:
                raise ValueError('Spikes require actual remaining HP')
        elif provided != {'charges'} or self.charges is None:
            raise ValueError('Mud requires remaining entry charges')
        return self


class GateObservation(BoundedModel):
    cannonLevel: int = Field(ge=0, le=3)
    armorLevel: int = Field(ge=0, le=3)
    range: Literal[210]
    damage: Literal[0, 8, 12, 16]
    nextShotIn: float = Field(ge=0, le=3.200001)

    @model_validator(mode='after')
    def matching_upgrade(self):
        if self.damage != (0, 8, 12, 16)[self.cannonLevel] or (self.cannonLevel == 0 and self.nextShotIn != 0):
            raise ValueError('Gate cannon stats do not match its level')
        return self


class FortificationObservation(BoundedModel):
    items: list[RoadItemObservation] = Field(max_length=10)
    gate: GateObservation

    @model_validator(mode='after')
    def unique_items(self):
        if len({item.id for item in self.items}) != len(self.items):
            raise ValueError('Duplicate road item')
        return self


class DefenseObservation(BoundedModel):
    livingDefenders: int = Field(ge=0, le=10)
    singleTargetDefenders: int = Field(ge=0, le=10)
    areaDefenders: int = Field(ge=0, le=10)
    longRangeDefenders: int = Field(ge=0, le=10)
    frontConcentration: float = Field(ge=0, le=1)
    frontCoverage: float = Field(ge=0, le=1)


class SlowSurface(BoundedModel):
    kind: Literal['mud', 'soft-sand', 'slush', 'ash']
    startProgress: float = Field(ge=0, le=100000)
    endProgress: float = Field(gt=0, le=100000)
    speedFactor: float = Field(gt=0, le=1)

    @model_validator(mode='after')
    def ordered_progress(self):
        if self.endProgress <= self.startProgress:
            raise ValueError('Invalid surface progress')
        return self


class SandbagState(BoundedModel):
    x: float = Field(ge=0, le=100000)
    y: float = Field(ge=0, le=100000)
    progress: float = Field(ge=0, le=100000)
    hp: float = Field(gt=0, le=1000)
    maxHp: float = Field(gt=0, le=1000)
    contacted: bool
    remainingSeconds: float | None = Field(ge=0, le=60)

    @model_validator(mode='after')
    def consistent_status(self):
        if self.hp > self.maxHp or self.contacted != (self.remainingSeconds is not None):
            raise ValueError('Invalid sandbag status')
        return self


class PersistentSandbagState(BoundedModel):
    id: int = Field(ge=1, le=9007199254740991)
    x: float = Field(ge=0, le=100000)
    y: float = Field(ge=0, le=100000)
    progress: float = Field(ge=0, le=100000)
    hp: float = Field(gt=0, le=1000)
    maxHp: float = Field(gt=0, le=1000)

    @model_validator(mode='after')
    def bounded_health(self):
        if self.hp > self.maxHp:
            raise ValueError('Invalid sandbag health')
        return self


class RoadEffects(BoundedModel):
    surface: SlowSurface
    airborneTypes: list[ENEMY_TYPES] = Field(min_length=3, max_length=3)
    sandbag: SandbagState | None = None
    sandbags: list[PersistentSandbagState] | None = Field(default=None, max_length=10)
    stock: int | None = Field(default=None, ge=0, le=10)

    @model_validator(mode='after')
    def consistent_inventory(self):
        if self.sandbags is not None:
            if 'sandbag' in self.model_fields_set or self.stock is None:
                raise ValueError('Mixed or incomplete sandbag observation')
            if len(self.sandbags) + self.stock > 10:
                raise ValueError('Too many sandbags')
            if len({bag.id for bag in self.sandbags}) != len(self.sandbags):
                raise ValueError('Duplicate sandbag id')
            progress = [bag.progress for bag in self.sandbags]
            if progress != sorted(progress):
                raise ValueError('Sandbags must be in road order')
        elif 'sandbag' not in self.model_fields_set or self.stock is not None:
            raise ValueError('Incomplete road observation')
        return self

    @field_validator('airborneTypes')
    @classmethod
    def visible_airborne_types(cls, value):
        if value != ['bat', 'wraith', 'dragon']:
            raise ValueError('Invalid airborne types')
        return value


class RouteSample(Point):
    progress: float = Field(ge=0, le=100000)
    rangeCoverage: int = Field(ge=0, le=10)
    antiAirCoverage: int = Field(ge=0, le=10)


class RouteBarrier(BoundedModel):
    id: int = Field(ge=1, le=9007199254740991)
    progress: float = Field(ge=0, le=100000)
    hp: float = Field(gt=0, le=1000)
    maxHp: float = Field(gt=0, le=1000)


class RouteState(BoundedModel):
    routeId: ROUTE_IDS
    label: str = Field(min_length=1, max_length=80)
    length: float = Field(gt=0, le=100000)
    path: list[Point] = Field(min_length=2, max_length=14)
    samples: list[RouteSample] = Field(min_length=16, max_length=16)
    rangeCoverage: float = Field(ge=0, le=1)
    antiAirCoverage: float = Field(ge=0, le=1)
    barriers: list[RouteBarrier] = Field(max_length=10)
    surface: SlowSurface

    @model_validator(mode='after')
    def consistent_route(self):
        segments = [math.hypot(b.x - a.x, b.y - a.y) for a, b in zip(self.path, self.path[1:])]
        if any(length <= 0 for length in segments) or abs(sum(segments) - self.length) > .02:
            raise ValueError('Invalid route geometry')
        if self.surface.endProgress > self.length:
            raise ValueError('Surface exceeds route')
        for index, sample in enumerate(self.samples):
            if abs(sample.progress - self.length * (index + .5) / 16) > .02:
                raise ValueError('Invalid route sample progress')
            remaining = sample.progress
            for start, end, length in zip(self.path, self.path[1:], segments):
                if remaining <= length:
                    fraction = remaining / length
                    x, y = start.x + (end.x - start.x) * fraction, start.y + (end.y - start.y) * fraction
                    if math.hypot(sample.x - x, sample.y - y) > .02:
                        raise ValueError('Route sample is off path')
                    break
                remaining -= length
            if sample.antiAirCoverage > sample.rangeCoverage:
                raise ValueError('Anti-air coverage exceeds total coverage')
        if (abs(self.rangeCoverage - sum(sample.rangeCoverage > 0 for sample in self.samples) / 16) > 1e-9
                or abs(self.antiAirCoverage - sum(sample.antiAirCoverage > 0 for sample in self.samples) / 16) > 1e-9):
            raise ValueError('Coverage does not match route samples')
        if len({barrier.id for barrier in self.barriers}) != len(self.barriers):
            raise ValueError('Duplicate route barrier')
        if [barrier.progress for barrier in self.barriers] != sorted(barrier.progress for barrier in self.barriers):
            raise ValueError('Route barriers must be ordered')
        if any(barrier.progress > self.length or barrier.hp > barrier.maxHp for barrier in self.barriers):
            raise ValueError('Invalid route barrier')
        return self


class FlightTarget(Point):
    id: int = Field(ge=1, le=1000000000)
    type: RANGED_ALLY_TYPES
    hp: float = Field(gt=0, le=1000000)
    maxHp: float = Field(gt=0, le=1000000)
    nearbyRangedCover: int = Field(ge=0, le=9)


class BattlefieldState(BoundedModel):
    routes: list[RouteState] = Field(min_length=2, max_length=2)
    flightTargets: list[FlightTarget] = Field(max_length=MAX_FLIGHT_TARGETS)

    @model_validator(mode='after')
    def distinct_observations(self):
        if {route.routeId for route in self.routes} != {'left', 'right'}:
            raise ValueError('Battlefield requires both routes')
        if len({target.id for target in self.flightTargets}) != len(self.flightTargets):
            raise ValueError('Duplicate flight target')
        return self


class PendingSpawn(BoundedModel):
    unitType: ENEMY_TYPES
    inSeconds: float = Field(ge=0, le=2)
    routeId: ROUTE_IDS | None = None
    targetId: int | None = Field(default=None, ge=1, le=1000000000)
    returnProgress: float | None = Field(default=None, ge=0, le=100000)


class StageSummary(BoundedModel):
    stage: int = Field(ge=1, le=10)
    spawned: int = Field(ge=0, le=23)
    resolved: int = Field(ge=0, le=23)
    maxProgress: float = Field(ge=0, le=1)
    baseDamage: float = Field(ge=0, le=100)
    defenderDamage: float = Field(ge=0, le=1000000000)


class DeploymentOutcome(StageSummary):
    id: int = Field(ge=1, le=9007199254740991)
    actionKey: str = Field(max_length=80)
    cancelled: int = Field(ge=0, le=3)


class TacticalPlan(BoundedModel):
    id: int = Field(ge=1, le=9007199254740991)
    actionKey: str = Field(max_length=80)
    label: str = Field(max_length=80)
    reason: str = Field(max_length=200)
    startedAt: float = Field(ge=0, le=1000000000)
    expiresAt: float = Field(ge=0, le=1000000000)
    status: Literal['executing', 'observing', 'interrupted', 'completed']
    reconsideration: str | None = Field(max_length=80)

    @model_validator(mode='after')
    def bounded_lifetime(self):
        action = action_from_key(self.actionKey)
        limit = 1000000000 if action is not None and action['type'] == 'wait' else 4
        if not 0 < self.expiresAt - self.startedAt <= limit + .000001:
            raise ValueError('Invalid tactical lifetime')
        return self


class TacticalOption(BoundedModel):
    key: str = Field(max_length=80)
    label: str = Field(max_length=80)
    reason: str = Field(max_length=200)
    lifetime: float = Field(gt=0, le=14)

    @model_validator(mode='after')
    def appropriate_lifetime(self):
        action = action_from_key(self.key)
        if self.lifetime > 4 and (action is None or action['type'] != 'wait'):
            raise ValueError('Only targeted waits may exceed four seconds')
        return self


class HistoryEvent(BoundedModel):
    at: float = Field(ge=0, le=1000000000)
    kind: Literal['addition', 'removal', 'upgrade', 'loss', 'area-loss']
    unitId: int = Field(ge=1, le=1000000000)
    unitType: ALLY_TYPES | ENEMY_TYPES
    x: float = Field(ge=0, le=100000)
    y: float = Field(ge=0, le=100000)
    amount: float | None = Field(default=None, ge=0, le=1000000000)
    sourceId: int | None = Field(default=None, ge=0, le=1000000000)
    sourceType: ALLY_TYPES | ENEMY_TYPES | Literal['gate', 'spike'] | None = None
    victimIds: list[int] | None = Field(default=None, min_length=2, max_length=10)

    @model_validator(mode='after')
    def observed_area_group(self):
        if self.kind == 'area-loss':
            if self.sourceId is None or self.sourceType is None or self.victimIds is None:
                raise ValueError('Incomplete area-loss observation')
            if len(set(self.victimIds)) != len(self.victimIds) or any(value <= 0 for value in self.victimIds):
                raise ValueError('Invalid area-loss victims')
            if (self.sourceType == 'gate') != (self.sourceId == 0):
                raise ValueError('Only the gate uses source ID zero')
        elif self.victimIds is not None or self.sourceId is not None or self.sourceType is not None:
            raise ValueError('Unexpected area-loss fields')
        if (self.kind == 'upgrade') != (self.amount is not None):
            raise ValueError('Invalid upgrade delta')
        return self


class HistoryDeployment(BoundedModel):
    id: int = Field(ge=1, le=1000000000)
    actionKey: str = Field(max_length=80)
    startedAt: float = Field(ge=0, le=1000000000)
    lastEventAt: float = Field(ge=0, le=1000000000)
    order: list[ENEMY_TYPES] = Field(min_length=1, max_length=3)
    spacingSeconds: list[float] = Field(max_length=2)
    spawned: int = Field(ge=0, le=3)
    resolved: int = Field(ge=0, le=3)
    exited: int | None = Field(default=None, ge=0, le=3)
    cancelled: int = Field(ge=0, le=3)
    maxProgress: float = Field(ge=0, le=1)
    baseDamage: float = Field(ge=0, le=100)
    defenderDamage: float = Field(ge=0, le=1000000000)
    frontSurvivalSeconds: float | None = Field(ge=0, le=1000000000)
    frontAlive: bool | None
    observedOrder: list[ENEMY_TYPES] = Field(max_length=3)
    observedGaps: list[float] = Field(max_length=2)
    rearPassedFront: bool

    @model_validator(mode='after')
    def consistent_deployment(self):
        action = action_from_key(self.actionKey)
        if action is None or action['type'] == 'wait':
            raise ValueError('Invalid historical action')
        formation = FORMATIONS.get(action.get('formationId'))
        if formation:
            expected_order = formation['types']
            expected_spacing = [formation['interval']] * (len(expected_order) - 1)
        else:
            expected_order, expected_spacing = [action['unitType']], []
        if self.order != expected_order or self.spacingSeconds != expected_spacing:
            raise ValueError('Historical members do not match declared action')
        if self.spawned + self.cancelled > len(self.order) or self.resolved > self.spawned:
            raise ValueError('Invalid historical member count')
        if self.exited is not None and self.exited > self.resolved:
            raise ValueError('Exited count exceeds resolved members')
        if self.startedAt > self.lastEventAt or len(set(self.observedOrder)) != len(self.observedOrder):
            raise ValueError('Invalid historical order or timing')
        if any(unit not in self.order for unit in self.observedOrder) or len(self.observedGaps) != max(0, len(self.observedOrder) - 1):
            raise ValueError('Invalid observed formation')
        if any(not 0 <= gap <= 100000 for gap in self.observedGaps):
            raise ValueError('Invalid observed spacing')
        if bool(self.spawned) != (self.frontAlive is not None and self.frontSurvivalSeconds is not None):
            raise ValueError('Missing front survival observation')
        if self.frontAlive and self.resolved >= self.spawned:
            raise ValueError('Resolved front cannot still be alive')
        return self


class HistoryContribution(BoundedModel):
    at: float = Field(ge=0, le=1000000000)
    deploymentId: int | None = Field(ge=1, le=1000000000)
    victimId: int = Field(ge=1, le=1000000000)
    sourceId: int = Field(ge=0, le=1000000000)
    sourceType: ALLY_TYPES | ENEMY_TYPES | Literal['gate', 'spike']
    damage: float = Field(ge=0, le=1000000000)
    onDefeatStep: bool
    area: bool

    @model_validator(mode='after')
    def source_identity(self):
        if (self.sourceType == 'gate') != (self.sourceId == 0):
            raise ValueError('Only the gate uses source ID zero')
        return self


class TacticalHistory(BoundedModel):
    version: Literal[1]
    fieldId: Literal['meadow', 'desert', 'frost', 'volcanic']
    stage: int = Field(ge=1, le=10)
    windowSeconds: Literal[20]
    fromTime: float = Field(ge=0, le=1000000000)
    throughTime: float = Field(ge=0, le=1000000000)
    truncated: bool
    events: list[HistoryEvent] = Field(max_length=12)
    deployments: list[HistoryDeployment] = Field(max_length=4)
    priorResults: list[HistoryDeployment] = Field(max_length=3)
    contributors: list[HistoryContribution] = Field(max_length=8)

    @model_validator(mode='before')
    @classmethod
    def bounded_bytes(cls, value):
        if not isinstance(value, dict) or type(value.get('version')) is not int:
            raise ValueError('Invalid tactical history version')
        if len(json.dumps(value, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()) > 6000:
            raise ValueError('Tactical history exceeds byte limit')
        return value

    @model_validator(mode='after')
    def bounded_observation_window(self):
        if abs(self.fromTime - max(0, self.throughTime - self.windowSeconds)) > .02:
            raise ValueError('Invalid history window')
        if self.version == 1 and any(
                action_from_key(entry.actionKey).get('formationId') not in LEGACY_FORMATIONS
                for entry in self.deployments + self.priorResults
                if action_from_key(entry.actionKey).get('type') == 'formation'):
            raise ValueError('Formation is not part of immutable history v1 grammar')
        ids = [deployment.id for deployment in self.deployments + self.priorResults]
        if len(set(ids)) != len(ids):
            raise ValueError('Duplicate historical deployment')
        for entries, key in [(self.events, 'at'), (self.deployments, 'lastEventAt'),
                             (self.priorResults, 'lastEventAt'), (self.contributors, 'at')]:
            timestamps = [getattr(entry, key) for entry in entries]
            if timestamps != sorted(timestamps, reverse=True):
                raise ValueError('History must be latest first')
            if any(at > self.throughTime + .02 for at in timestamps):
                raise ValueError('History contains future evidence')
        for entry in self.events + self.contributors:
            if entry.at < self.fromTime - .02:
                raise ValueError('Expired recent history')
        for entry in self.deployments:
            if entry.lastEventAt < self.fromTime - .02:
                raise ValueError('Expired recent deployment')
        for entry in self.priorResults:
            if entry.lastEventAt > self.fromTime + .02 or entry.resolved + entry.cancelled != len(entry.order):
                raise ValueError('Invalid prior result')
        for entry in self.deployments + self.priorResults:
            if entry.frontSurvivalSeconds is not None and entry.frontSurvivalSeconds > self.throughTime - entry.startedAt + .02:
                raise ValueError('Invalid survival duration')
        return self


class HistorySource(BoundedModel):
    sourceKind: Literal['unit', 'trap', 'turret']
    sourceId: int = Field(ge=0, le=1000000000)
    sourceType: ALLY_TYPES | ENEMY_TYPES | Literal['gate', 'spike']

    @model_validator(mode='after')
    def actual_source_identity(self):
        expected = {'gate': 'turret', 'spike': 'trap'}.get(self.sourceType, 'unit')
        if self.sourceKind != expected or (self.sourceType == 'gate') != (self.sourceId == 0):
            raise ValueError('Invalid historical source identity')
        return self

    def identity(self):
        return self.sourceKind, self.sourceId, self.sourceType


class HistorySourceDamage(HistorySource):
    damage: float = Field(ge=0, le=1000000000)


class HistoryContributionV2(HistoryContribution):
    victimType: ALLY_TYPES | ENEMY_TYPES | None
    sourceKind: Literal['unit', 'trap', 'turret']
    attackId: str | None = Field(min_length=1, max_length=80)
    tick: int | None = Field(ge=0, le=7)
    legacyUnknown: bool

    @model_validator(mode='after')
    def actual_damage_provenance(self):
        HistorySource.model_validate({key: getattr(self, key) for key in ('sourceKind', 'sourceId', 'sourceType')})
        if (self.victimType is None or self.attackId is None) and not self.legacyUnknown:
            raise ValueError('Missing provenance must be explicitly legacy unknown')
        if self.attackId is not None:
            prefix = {'unit': f'{self.sourceId}:', 'turret': 'gate:',
                      'trap': f'spike:{self.sourceId}:'}[self.sourceKind]
            suffix = r'[1-9][0-9]*:[1-9][0-9]*' if self.sourceKind == 'trap' else r'[1-9][0-9]*'
            if (not re.fullmatch(re.escape(prefix) + suffix, self.attackId)
                    or any(int(part) > 4294967295 for part in self.attackId.split(':') if part.isdecimal())):
                raise ValueError('Attack identity does not match its captured source')
        if self.tick is not None and (self.sourceType != 'dragon' or self.attackId is None or not self.area):
            raise ValueError('Only captured dragon breath has damage tick identities')
        return self


class EnemyOutcomeSummary(BoundedModel):
    id: str = Field(min_length=1, max_length=80)
    at: float = Field(ge=0, le=1000000000)
    enemyId: int = Field(ge=1, le=1000000000)
    enemyType: ENEMY_TYPES
    boss: bool | None
    routeId: ROUTE_IDS | None
    progress: float | None = Field(ge=0, le=100000)
    x: float = Field(ge=0, le=100000)
    y: float = Field(ge=0, le=100000)
    flightPhase: Literal['approach', 'engage', 'return'] | None
    cause: Literal['combat-death', 'gate-exit']
    receivedDamage: float = Field(ge=0, le=1000000000)
    attributionComplete: bool
    legacyUnknown: bool
    lastKiller: HistorySource | None
    lethalContributors: list[HistorySourceDamage] = Field(max_length=21)
    omittedLethalContributors: int = Field(ge=0, le=1000000000)
    omittedLethalDamage: float = Field(ge=0, le=1000000000)
    sources: list[HistorySourceDamage] = Field(max_length=4)
    omittedSources: int = Field(ge=0, le=21)
    omittedContributions: int = Field(ge=0, le=1000000000)
    omittedDamage: float = Field(ge=0, le=1000000000)

    @model_validator(mode='after')
    def truthful_outcome(self):
        if self.id != f'enemy:{self.enemyId}:{self.cause}':
            raise ValueError('Outcome ID does not match enemy and cause')
        if (self.boss is None or self.progress is None) and not self.legacyUnknown:
            raise ValueError('Missing outcome facts must be explicitly legacy unknown')
        if self.flightPhase is not None and (self.enemyType not in AIRBORNE_TYPES or self.routeId is None):
            raise ValueError('Invalid historical flight phase')
        for entries in (self.lethalContributors, self.sources):
            if any(entry.sourceType in UNIT_STATS for entry in entries):
                raise ValueError('Enemy damage sources must be allied units, traps or turret')
            if len({entry.identity() for entry in entries}) != len(entries):
                raise ValueError('Duplicate outcome source')
        if (not self.omittedLethalContributors and self.omittedLethalDamage != 0
                or not self.omittedSources and not self.omittedContributions and self.omittedDamage != 0):
            raise ValueError('Omitted damage requires an explicit omitted count')
        if self.attributionComplete and (self.legacyUnknown or self.omittedLethalContributors or self.omittedContributions):
            raise ValueError('Incomplete attribution cannot claim completeness')
        if self.cause == 'gate-exit':
            if self.boss is True or self.lastKiller is not None or self.lethalContributors or self.omittedLethalContributors or self.omittedLethalDamage:
                raise ValueError('Gate exits do not have killers or lethal contributors')
        elif self.lastKiller is not None:
            if (self.legacyUnknown or len(self.lethalContributors) != 1 or self.omittedLethalContributors
                    or self.lastKiller.identity() != self.lethalContributors[0].identity()):
                raise ValueError('A unique killer requires exactly one established lethal source')
        elif not self.legacyUnknown:
            if not self.lethalContributors:
                raise ValueError('Current combat death requires lethal evidence')
            if len(self.lethalContributors) == 1 and not self.omittedLethalContributors:
                raise ValueError('Sole established lethal source must match the unique killer')
        # Each independently rounded published source can differ by at most .005.
        tolerance = .0051 * (len(self.sources) + 2)
        total = sum(source.damage for source in self.sources) + self.omittedDamage
        if abs(total - self.receivedDamage) > tolerance:
            raise ValueError('Received damage does not match summarized source totals')
        lethal_total = sum(source.damage for source in self.lethalContributors) + self.omittedLethalDamage
        if lethal_total > self.receivedDamage + .0051 * (len(self.lethalContributors) + 2):
            raise ValueError('Lethal damage exceeds accumulated received damage')
        known = {source.identity(): source.damage for source in self.sources}
        if any(source.damage > known[source.identity()] + .011 for source in self.lethalContributors
               if source.identity() in known):
            raise ValueError('Lethal contribution exceeds that source accumulated damage')
        undisplayed = [source for source in self.lethalContributors if source.identity() not in known]
        if undisplayed and not self.omittedSources and not self.omittedContributions:
            raise ValueError('Lethal source is absent from the complete accumulated source ledger')
        if len(undisplayed) > self.omittedSources + self.omittedContributions:
            raise ValueError('Undisplayed lethal identities exceed explicitly omitted source evidence')
        if sum(source.damage for source in undisplayed) > self.omittedDamage + .0051 * (len(undisplayed) + 2):
            raise ValueError('Undisplayed lethal source exceeds explicitly omitted accumulated damage')
        return self


class DamageTrend(HistorySourceDamage):
    enemyType: ENEMY_TYPES
    defeatedVictims: int = Field(ge=0, le=23)

    @model_validator(mode='after')
    def allied_enemy_damage(self):
        if self.sourceType in UNIT_STATS:
            raise ValueError('Enemy damage trend requires a defender source')
        return self


class HistoryOmissions(BoundedModel):
    contributions: int = Field(ge=0, le=1000000000)
    damage: float = Field(ge=0, le=1000000000)
    outcomes: int = Field(ge=0, le=1000000000)
    trends: int = Field(ge=0, le=483)
    trendDamage: float = Field(ge=0, le=1000000000)

    @model_validator(mode='after')
    def explicit_damage_omissions(self):
        if not self.contributions and self.damage != 0 or not self.trends and self.trendDamage != 0:
            raise ValueError('Omitted damage requires an explicit omitted count')
        return self


class TacticalHistoryV2(TacticalHistory):
    version: Literal[2]
    contributors: list[HistoryContributionV2] = Field(max_length=8)
    enemyOutcomes: list[EnemyOutcomeSummary] = Field(max_length=3)
    damageTrends: list[DamageTrend] = Field(max_length=4)
    omissions: HistoryOmissions
    legacyUnknown: bool

    @model_validator(mode='after')
    def bounded_enemy_evidence(self):
        timestamps = [outcome.at for outcome in self.enemyOutcomes]
        if timestamps != sorted(timestamps, reverse=True) or any(at > self.throughTime + .02 for at in timestamps):
            raise ValueError('Enemy outcomes must be latest first and not from the future')
        if len({outcome.enemyId for outcome in self.enemyOutcomes}) != len(self.enemyOutcomes):
            raise ValueError('Duplicate enemy outcome')
        receipt_keys = [(entry.victimId, entry.sourceKind, entry.sourceId, entry.sourceType, entry.attackId, entry.tick)
                        for entry in self.contributors]
        if len(set(receipt_keys)) != len(receipt_keys):
            raise ValueError('Duplicate damage receipt')
        if len({(entry.enemyType, entry.identity()) for entry in self.damageTrends}) != len(self.damageTrends):
            raise ValueError('Duplicate damage trend')
        if any(entry.legacyUnknown for entry in self.contributors + self.enemyOutcomes) and not self.legacyUnknown:
            raise ValueError('History must disclose legacy unknown evidence')
        if self.legacyUnknown and not self.truncated:
            raise ValueError('Legacy unknown history must be marked incomplete')
        for outcome in self.enemyOutcomes:
            if outcome.cause == 'gate-exit' and any(
                    event.kind in ('loss', 'area-loss') and (event.unitId == outcome.enemyId
                    or outcome.enemyId in (event.victimIds or [])) for event in self.events):
                raise ValueError('Gate exit cannot also be a combat loss')
            self.validate_retained_receipts(outcome)
        return self

    def validate_retained_receipts(self, outcome: EnemyOutcomeSummary) -> None:
        receipts = [row for row in self.contributors if row.victimId == outcome.enemyId]
        accumulated = {row.identity(): row.damage for row in outcome.sources}
        lethal = {row.identity(): row.damage for row in outcome.lethalContributors}
        totals, lethal_totals, prior_totals = {}, {}, {}
        ambiguous_legacy = False
        for row in receipts:
            identity = (row.sourceKind, row.sourceId, row.sourceType)
            if row.victimType is not None and row.victimType != outcome.enemyType:
                raise ValueError('Retained receipt victim type contradicts its outcome')
            # Published timestamps round to .01 seconds; fixed1/60 steps remain
            # distinct. A .02 tolerance here would confuse adjacent simulation steps.
            simultaneous = abs(row.at - outcome.at) <= 1e-6
            if row.at > outcome.at + 1e-6:
                raise ValueError('Retained receipt is later than the enemy outcome')
            if row.onDefeatStep != (outcome.cause == 'combat-death' and simultaneous):
                raise ValueError('Retained receipt defeat flag contradicts the outcome time or cause')
            total, count = totals.get(identity, (0, 0))
            totals[identity] = total + row.damage, count + 1
            if not simultaneous:
                total, count = prior_totals.get(identity, (0, 0))
                prior_totals[identity] = total + row.damage, count + 1
            # Migrated null-attack rows may aggregate earlier hits and the lethal
            # hit under one key. Their combined damage bounds cumulative totals,
            # but cannot be claimed as a known amount on the lethal step.
            legacy_aggregate = row.legacyUnknown and row.attackId is None
            ambiguous_legacy = ambiguous_legacy or legacy_aggregate
            if row.onDefeatStep and not legacy_aggregate:
                total, count = lethal_totals.get(identity, (0, 0))
                lethal_totals[identity] = total + row.damage, count + 1

        def check_retained(totals, displayed, omitted_count, omitted_damage, label):
            missing_total, missing_rows, missing_identities = 0, 0, 0
            for identity, (damage, count) in totals.items():
                if identity in displayed:
                    if damage > displayed[identity] + .0051 * (count + 1):
                        raise ValueError(f'Retained receipts exceed the {label} source damage')
                else:
                    missing_total += damage
                    missing_rows += count
                    missing_identities += 1
            if missing_identities > omitted_count:
                raise ValueError(f'Retained receipt source is absent from complete {label} evidence')
            if missing_total > omitted_damage + .0051 * (missing_rows + 1):
                raise ValueError(f'Retained receipts exceed explicitly omitted {label} damage')

        check_retained(totals, accumulated, outcome.omittedSources + outcome.omittedContributions,
                       outcome.omittedDamage, 'accumulated')
        check_retained(lethal_totals, lethal, outcome.omittedLethalContributors,
                       outcome.omittedLethalDamage, 'lethal')
        # Earlier hits and the published lethal step cannot reuse the same
        # cumulative damage, even when other receipts are honestly omitted.
        combined = dict(prior_totals)
        for identity, damage in lethal.items():
            previous, count = combined.get(identity, (0, 0))
            combined[identity] = previous + damage, count + 1
        check_retained(combined, accumulated, outcome.omittedSources + outcome.omittedContributions,
                       outcome.omittedDamage, 'combined prior and lethal')
        combined_total = sum(damage for damage, count in combined.values()) + outcome.omittedLethalDamage
        combined_rows = sum(count for damage, count in combined.values())
        if combined_total > outcome.receivedDamage + .0051 * (combined_rows + 2):
            raise ValueError('Earlier receipts plus lethal damage exceed total received damage')
        complete_receipts = (self.omissions.contributions == 0
                             and not outcome.legacyUnknown and not ambiguous_legacy
                             and outcome.at >= self.fromTime - 1e-6)
        if complete_receipts:
            missing_accumulated = set(totals) - set(accumulated)
            if any(identity not in totals for identity in accumulated):
                raise ValueError('Complete receipts are missing an asserted accumulated source')
            for identity, damage in accumulated.items():
                retained, count = totals[identity]
                if abs(retained - damage) > .0051 * (count + 1):
                    raise ValueError('Complete retained receipts disagree with accumulated source damage')
            missing_count = len(missing_accumulated)
            if not outcome.omittedSources <= missing_count <= outcome.omittedSources + outcome.omittedContributions:
                raise ValueError('Complete receipts disagree with omitted accumulated source count')
            omitted_total = sum(totals[identity][0] for identity in missing_accumulated)
            omitted_rows = sum(totals[identity][1] for identity in missing_accumulated)
            if (outcome.omittedContributions > omitted_rows
                    or abs(omitted_total - outcome.omittedDamage) > .0051 * (omitted_rows + 1)):
                raise ValueError('Complete receipts disagree with omitted accumulated damage')
            retained_total = sum(damage for damage, count in totals.values())
            if abs(retained_total - outcome.receivedDamage) > .0051 * (len(receipts) + 1):
                raise ValueError('Complete receipts disagree with total received damage')
        if outcome.cause == 'combat-death' and complete_receipts:
            missing = set(lethal_totals) - set(lethal)
            if any(identity not in lethal_totals for identity in lethal):
                raise ValueError('Complete receipts are missing an asserted lethal source')
            for identity, damage in lethal.items():
                retained, count = lethal_totals[identity]
                if abs(retained - damage) > .0051 * (count + 1):
                    raise ValueError('Complete retained receipts disagree with lethal source damage')
            if len(missing) != outcome.omittedLethalContributors:
                raise ValueError('Complete receipts disagree with omitted lethal source count')
            omitted_total = sum(lethal_totals[identity][0] for identity in missing)
            omitted_rows = sum(lethal_totals[identity][1] for identity in missing)
            if abs(omitted_total - outcome.omittedLethalDamage) > .0051 * (omitted_rows + 1):
                raise ValueError('Complete receipts disagree with omitted lethal damage')


class GameState(BoundedModel):
    enemyActionTimeScale: Literal[0.8] | None = None

    @field_validator('enemyActionTimeScale', mode='before')
    @classmethod
    def explicit_known_enemy_clock(cls, value):
        if type(value) not in (int, float) or value != .8:
            raise ValueError('Unknown explicit enemy action clock; legacy clients omit it')
        return value
    combatObservation: CombatObservation | None = None
    commanderSupportVersion: Literal[1] | None = None
    battlefieldVersion: Literal[2] | None = None
    battlefield: BattlefieldState | None = None
    fortifications: FortificationObservation | None = None
    historyEnabled: bool = True
    tacticalHistory: TacticalHistory | TacticalHistoryV2 | None = Field(default=None, discriminator='version')
    field: FieldState
    time: float = Field(ge=0, le=1000000000)
    stage: int = Field(ge=1, le=10)
    phase: Literal['preparation', 'assault', 'cleared', 'defeat', 'victory']
    result: Literal['win', 'lose'] | None
    playerBaseHp: float = Field(ge=0, le=1000000)
    wave: WaveState
    defenders: list[UnitState] = Field(max_length=MAX_UNITS)
    enemies: list[UnitState] = Field(max_length=MAX_UNITS)
    legalActions: list[dict] = Field(max_length=MAX_LEGAL_ACTIONS)
    cooldowns: dict[ENEMY_TYPES, float] = Field(default_factory=dict, max_length=13)
    defense: DefenseObservation | None = None
    roadEffects: RoadEffects | None = None
    pendingSpawns: list[PendingSpawn] = Field(default_factory=list, max_length=3)
    strategy: TacticalPlan | None = None
    recentOutcomes: list[DeploymentOutcome] = Field(default_factory=list, max_length=4)
    previousStageSummary: StageSummary | None = None
    tacticalOptions: list[TacticalOption] = Field(default_factory=list, max_length=MAX_LEGAL_ACTIONS)

    @field_validator('commanderSupportVersion', mode='before')
    @classmethod
    def exact_support_version(cls, value):
        if type(value) is not int or value != 1:
            raise ValueError('Invalid support version')
        return value

    @field_validator('cooldowns')
    @classmethod
    def bounded_cooldowns(cls, cooldowns):
        if any(not 0 <= value <= 14 for value in cooldowns.values()):
            raise ValueError('Invalid cooldown')
        return cooldowns

    @model_validator(mode='after')
    def bounded_units(self):
        keys = [action_key(action) for action in self.legalActions]
        if None in keys or len(set(keys)) != len(keys):
            raise ValueError('Invalid legal action set')
        # Historical keys still describe raids actually accepted by older saves.
        # Only current admission rejects a fresh boss raid.
        if any(action.get('boss', False) and 'targetId' in action for action in self.legalActions):
            raise ValueError('Boss deployments are road-only')
        self.validate_battlefield()
        validate_combat_context(self)
        validate_roadblock_context(self)
        if not self.historyEnabled and (self.tacticalHistory is not None or self.recentOutcomes or self.previousStageSummary is not None):
            raise ValueError('Disabled history must omit historical evidence')
        if self.tacticalHistory:
            history = self.tacticalHistory
            if history.stage != self.stage or history.fieldId != self.field.id or abs(history.throughTime - self.time) > .11:
                raise ValueError('History does not match this board context')
        identified = [unit for unit in self.defenders + self.enemies if unit.id is not None]
        enemy_forbidden = {'level', 'equipment'} | ({'maxHp'} if self.commanderSupportVersion != 1 else set())
        if any(enemy_forbidden & unit.model_fields_set for unit in self.enemies):
            raise ValueError('Enemy does not have an allied individual level')
        support_fields = {'speed', 'armor', 'supportBuff'}
        for unit in self.defenders + self.enemies:
            if self.commanderSupportVersion == 1:
                if not {'speed', 'armor', 'maxHp'}.issubset(unit.model_fields_set):
                    raise ValueError('Support version requires effective stats')
                if unit.supportBuff and not unit.supportBuff.startedAt - .051 <= self.time <= unit.supportBuff.expiresAt + .051:
                    raise ValueError('Support buff is outside the observation time')
            elif support_fields & unit.model_fields_set:
                raise ValueError('Support stats require the version opt-in')
        if 'commanderSupportVersion' in self.model_fields_set and self.commanderSupportVersion != 1:
            raise ValueError('Invalid support version')
        if any('mudSlowRemaining' in unit.model_fields_set for unit in self.defenders):
            raise ValueError('Defenders do not receive the paid mud effect')
        if self.fortifications:
            ids = {unit.id for unit in identified}
            if self.roadEffects and self.roadEffects.sandbags:
                ids.update(bag.id for bag in self.roadEffects.sandbags)
            if any(item.id in ids for item in self.fortifications.items):
                raise ValueError('Road item identities collide with visible units or sandbags')
            if self.battlefieldVersion == 2 and any(
                    item.x > self.field.width or item.y > self.field.height
                    for item in self.fortifications.items):
                raise ValueError('Road item is outside the battlefield')
        if len({unit.id for unit in identified}) != len(identified):
            raise ValueError('Duplicate visible unit id')
        if self.tacticalHistory:
            visible_types = {unit.id: unit.type for unit in identified}
            history = self.tacticalHistory
            sources = list(history.contributors)
            if isinstance(history, TacticalHistoryV2):
                sources.extend(history.damageTrends)
                for outcome in history.enemyOutcomes:
                    sources.extend(outcome.sources + outcome.lethalContributors)
                    if outcome.lastKiller:
                        sources.append(outcome.lastKiller)
                    if outcome.enemyId in visible_types and visible_types[outcome.enemyId] != outcome.enemyType:
                        raise ValueError('Historical enemy does not match visible unit')
                    if any(unit.id == outcome.enemyId for unit in self.enemies):
                        raise ValueError('Resolved enemy outcome still appears among current enemies')
                    if not outcome.legacyUnknown and (outcome.routeId is None) != (self.battlefieldVersion != 2):
                        raise ValueError('Outcome route does not match battlefield version')
                    if self.battlefieldVersion == 2:
                        routes = {route.routeId: route for route in self.battlefield.routes}
                        if (outcome.x > self.field.width or outcome.y > self.field.height
                                or outcome.routeId is not None and outcome.progress is not None
                                and outcome.progress > routes[outcome.routeId].length + .51):
                            raise ValueError('Historical outcome exceeds battlefield geometry')
                for contribution in history.contributors:
                    if (contribution.victimType is not None and contribution.victimId in visible_types
                            and visible_types[contribution.victimId] != contribution.victimType):
                        raise ValueError('Historical victim does not match visible unit')
            visible_items = {item.id: item.kind for item in self.fortifications.items} if self.fortifications else {}
            for source in sources:
                if source.sourceId in visible_types and visible_types[source.sourceId] != source.sourceType:
                    raise ValueError('Historical source does not match visible unit')
                if source.sourceId in visible_items and visible_items[source.sourceId] != source.sourceType:
                    raise ValueError('Historical source does not match visible road item')
        if self.roadEffects:
            road = self.roadEffects
            barriers = road.sandbags if road.sandbags is not None else ([road.sandbag] if road.sandbag else [])
            if road.surface.endProgress > self.field.pathLength or any(bag.progress > self.field.pathLength for bag in barriers):
                raise ValueError('Road effects exceed path')
            if road.sandbags is not None and len(road.sandbags) + road.stock > self.stage:
                raise ValueError('Sandbags exceed stage supplies')
        if len(self.defenders) + len(self.enemies) + len(self.pendingSpawns) > MAX_UNITS:
            raise ValueError('Too many units')
        if any(action['type'] == 'wait' and not self.can_wait_for(action) for action in self.legalActions):
            raise ValueError('Wait target must be blocked only by deployment cooldown')
        if (self.strategy and self.strategy.status in ('executing', 'observing')
                and (strategy_action := action_from_key(self.strategy.actionKey)) is not None
                and strategy_action['type'] == 'wait' and self.strategy.expiresAt > self.time + 14.000001):
            raise ValueError('Active wait exceeds remaining cooldown bound')
        if self.tacticalOptions and [option.key for option in self.tacticalOptions] != keys:
            raise ValueError('Tactical options do not match legal actions')
        if len(self.pendingSpawns) != self.wave.reservedCount:
            raise ValueError('Invalid reservation count')
        if self.wave.spawned + self.wave.reservedCount > self.wave.enemyCount:
            raise ValueError('Too many reserved enemies')
        if len({member.unitType for member in self.pendingSpawns}) != len(self.pendingSpawns):
            raise ValueError('Repeated formation type')
        if self.wave.reservedBudget != sum(UNIT_STATS[member.unitType]['cost'] for member in self.pendingSpawns):
            raise ValueError('Invalid reserved budget')
        return self

    def validate_battlefield(self):
        new_fields = {'width', 'height', 'entrance', 'gate'}
        unit_fields = {'routeId', 'flight'}
        pending_fields = {'routeId', 'targetId', 'returnProgress'}
        history = (self.tacticalHistory.deployments + self.tacticalHistory.priorResults) if self.tacticalHistory else []
        referenced = [*history, *self.recentOutcomes, *([self.strategy] if self.strategy else [])]
        actions = [*self.legalActions, *(action_from_key(entry.actionKey) for entry in referenced)]
        if self.battlefieldVersion != 2:
            if ({'battlefieldVersion', 'battlefield'} & self.model_fields_set or new_fields & self.field.model_fields_set
                    or any(unit_fields & unit.model_fields_set for unit in self.defenders + self.enemies)
                    or any(pending_fields & member.model_fields_set for member in self.pendingSpawns)
                    or any('exited' in entry.model_fields_set for entry in history)
                    or any(action is not None and {'routeId', 'targetId'} & action.keys() for action in actions)):
                raise ValueError('Legacy battlefield contains route metadata')
            return
        if self.battlefield is None or any(getattr(self.field, key) is None for key in new_fields):
            raise ValueError('Incomplete battlefield observation')
        routes = {route.routeId: route for route in self.battlefield.routes}
        points = [self.field.entrance, self.field.gate, *self.defenders, *self.enemies, *self.battlefield.flightTargets]
        for route in routes.values():
            points.extend([*route.path, *route.samples])
            if route.path[0] != self.field.entrance or route.path[-1] != self.field.gate:
                raise ValueError('Route does not connect entrance and gate')
        if abs(self.field.pathLength - routes['left'].length) > .02:
            raise ValueError('Primary path length differs from route')
        if any(not 0 <= point.x <= self.field.width or not 0 <= point.y <= self.field.height for point in points):
            raise ValueError('Coordinates exceed battlefield')
        for unit in self.defenders + self.enemies:
            if unit.id is None:
                raise ValueError('Battlefield unit requires an ID')
            if ((unit.homeX is not None and not 0 <= unit.homeX <= self.field.width)
                    or (unit.homeY is not None and not 0 <= unit.homeY <= self.field.height)):
                raise ValueError('Unit home exceeds battlefield')
        if any(unit_fields & unit.model_fields_set for unit in self.defenders):
            raise ValueError('Defender cannot have an enemy route mission')
        if any(unit.type in UNIT_STATS for unit in self.defenders):
            raise ValueError('Invalid defender archetype')
        for unit in self.enemies:
            if unit.routeId not in routes or unit.type not in UNIT_STATS:
                raise ValueError('Enemy requires a valid route')
            if unit.progress > routes[unit.routeId].length + .5:
                raise ValueError('Enemy progress exceeds route')
            if 'flight' in unit.model_fields_set:
                if (unit.flight is None or unit.type not in AIRBORNE_TYPES
                        or unit.boss and unit.flight.phase != 'return'
                        or unit.flight.returnProgress > routes[unit.routeId].length):
                    raise ValueError('Invalid direct flight mission')
        defenders = {unit.id: unit for unit in self.defenders}
        targets = {target.id: target for target in self.battlefield.flightTargets}
        for target in targets.values():
            unit = defenders.get(target.id)
            if (unit is None or unit.hp <= 0 or unit.type != target.type or target.hp > target.maxHp
                    or abs(unit.hp - target.hp) > .500001
                    or abs(unit.x - target.x) > .500001 or abs(unit.y - target.y) > .500001):
                raise ValueError('Flight target does not match living ranged defender')
        for action in actions:
            if action is None:
                raise ValueError('Invalid battlefield action')
            if action.get('type') != 'wait' and action.get('routeId') not in routes:
                raise ValueError('Deployment requires a route')
        for action in self.legalActions:
            if 'targetId' in action and action['targetId'] not in targets:
                raise ValueError('Direct flight target is not currently offered')
        for member in self.pendingSpawns:
            if member.routeId not in routes:
                raise ValueError('Pending deployment requires a route')
            if member.targetId is not None:
                if member.unitType not in AIRBORNE_TYPES or member.returnProgress is None or len(self.pendingSpawns) != 1:
                    raise ValueError('Incomplete pending direct flight mission')
            elif 'targetId' in member.model_fields_set or 'returnProgress' in member.model_fields_set:
                raise ValueError('Unexpected pending flight metadata')
            if member.returnProgress is not None and member.returnProgress > routes[member.routeId].length:
                raise ValueError('Pending return progress exceeds route')
        if len({member.routeId for member in self.pendingSpawns}) > 1:
            raise ValueError('Formation members must share one route')
        if self.roadEffects and self.roadEffects.sandbags is not None:
            barriers = {barrier.id: barrier for barrier in self.roadEffects.sandbags}
            for route in routes.values():
                for barrier in route.barriers:
                    placed = barriers.get(barrier.id)
                    if placed is None or placed.hp != barrier.hp or placed.maxHp != barrier.maxHp:
                        raise ValueError('Route barrier differs from placed sandbag')

    def can_wait_for(self, action: dict) -> bool:
        return (self.cooldowns.get(action['unitType'], 0) > 1e-9
                and self.can_deploy_target(action['unitType'], action.get('boss', False)))

    def can_deploy_target(self, unit_type: str, boss: bool) -> bool:
        """Standalone deployment eligibility, excluding the target cooldown."""
        remaining_count = self.wave.enemyCount - self.wave.spawned
        boss_window = self.wave.bossType is not None and remaining_count == 1
        boss_reserve = int(self.wave.bossType is not None and not boss_window)
        if (self.phase != 'assault' or self.result is not None or self.pendingSpawns
                or self.wave.nextSpawnIn > 1e-9 or len(self.defenders) + len(self.enemies) >= MAX_UNITS
                or remaining_count - boss_reserve < 1):
            return False
        if boss_window:
            if not boss or unit_type != self.wave.bossType:
                return False
        elif boss or unit_type not in self.wave.enemyTypes or self.stage < UNIT_STATS[unit_type]['unlockStage']:
            return False
        cost = 5 if boss else UNIT_STATS[unit_type]['cost']
        minimum_remaining_cost = max(0, remaining_count - 1 - boss_reserve) + boss_reserve * 5
        return cost + minimum_remaining_cost <= self.wave.budgetRemaining


def validate_state_bounds(state: dict, max_legal_actions: int = MAX_LEGAL_ACTIONS) -> None:
    pending = [(state, 0, ())]
    visited = 0
    while pending:
        value, depth, path = pending.pop()
        visited += 1
        if visited > 4096 or depth > 6:
            raise ValueError('State is too complex')
        if isinstance(value, dict):
            if len(value) > 64 or any(not isinstance(key, str) or len(key) > 80 for key in value):
                raise ValueError('Invalid object size')
            pending.extend((child, depth + 1, (*path, key)) for key, child in value.items())
        elif isinstance(value, list):
            limit = max_legal_actions if path in (('legalActions',), ('tacticalOptions',)) else MAX_UNITS
            if len(value) > limit:
                raise ValueError('Invalid array size')
            pending.extend((child, depth + 1, (*path, index)) for index, child in enumerate(value))
        elif isinstance(value, str):
            if len(value) > 200:
                raise ValueError('Invalid string size')
        elif value is not None and type(value) not in (bool, int, float):
            raise ValueError('Invalid state value')
        elif isinstance(value, (int, float)) and (abs(value) > 1000000000 or not math.isfinite(value)):
            raise ValueError('Invalid numeric value')
    if len(json.dumps(state, separators=(',', ':'), allow_nan=False).encode()) > MAX_STATE_BYTES:
        raise ValueError('State is too large')


def reject_json_scalar_coercion(original: object, validated: object) -> None:
    """JSON numbers may change Python representation, never value or scalar kind."""
    pending = [(original, validated)]
    while pending:
        raw, parsed = pending.pop()
        if type(raw) in (int, float) and type(parsed) in (int, float):
            if raw != parsed:
                raise ValueError('State validation would change a JSON number')
        elif type(raw) is not type(parsed):
            raise ValueError('State validation would coerce a JSON scalar')
        elif isinstance(raw, dict):
            if raw.keys() != parsed.keys():
                raise ValueError('State validation would change object fields')
            pending.extend((value, parsed[key]) for key, value in raw.items())
        elif isinstance(raw, list):
            if len(raw) != len(parsed):
                raise ValueError('State validation would change array size')
            pending.extend(zip(raw, parsed))
        elif raw != parsed:
            raise ValueError('State validation would change a JSON scalar')


def validate_state(state: dict) -> dict:
    validate_state_bounds(state)
    validated = GameState.model_validate(state).model_dump(exclude_unset=True)
    # Strict Pydantic schemas still coerce a bool equal to a numeric Literal
    # (for example False into gate damage0). Never restore such malformed input.
    reject_json_scalar_coercion(state, validated)
    # Validation must not expand integer-valued JSON numbers into floats: that
    # breaks exact wire reconstruction and can inflate a 6000-byte history past its cap.
    return copy.deepcopy(state)


def api_key() -> str:
    return (os.getenv('JEV_API_KEY') or os.getenv('TYPESAFE_API_KEY') or '').strip()


def action_key(action: object) -> str | None:
    # Structural grammar is also used by historical evidence; current boss raid
    # admission is rejected separately rather than rewriting old observations.
    if not isinstance(action, dict):
        return None
    route = action.get('routeId')
    if 'routeId' in action and route not in ('left', 'right'):
        return None
    kind = action.get('type')
    if kind == 'formation':
        if (set(action) - {'type', 'formationId', 'routeId'} or not isinstance(action.get('formationId'), str)
                or action['formationId'] not in FORMATIONS):
            return None
        base = f"formation:{action['formationId']}"
    elif kind in ('spawn', 'wait'):
        allowed = {'type', 'unitType', 'boss'} | ({'routeId', 'targetId'} if kind == 'spawn' else set())
        if (set(action) - allowed or not isinstance(action.get('unitType'), str)
                or action['unitType'] not in UNIT_STATS or type(action.get('boss', False)) is not bool):
            return None
        base = f"{kind}:{action['unitType']}:{int(action.get('boss', False))}"
        if 'targetId' in action and (action['unitType'] not in AIRBORNE_TYPES or route is None
                or type(action['targetId']) is not int or not 1 <= action['targetId'] <= 9007199254740991):
            return None
    else:
        return None
    return base + (f':route:{route}' if route else '') + (f":target:{action['targetId']}" if 'targetId' in action else '')


def action_from_key(key: str) -> dict | None:
    parts = key.split(':')
    if len(parts) >= 2 and parts[0] == 'formation':
        action, suffix = {'type': 'formation', 'formationId': parts[1]}, parts[2:]
    elif len(parts) >= 3 and parts[0] in ('spawn', 'wait') and parts[2] in ('0', '1'):
        action, suffix = {'type': parts[0], 'unitType': parts[1], 'boss': parts[2] == '1'}, parts[3:]
    else:
        return None
    if suffix[:1] == ['route'] and len(suffix) >= 2:
        action['routeId'], suffix = suffix[1], suffix[2:]
    if suffix[:1] == ['target'] and len(suffix) == 2 and suffix[1].isascii() and suffix[1].isdecimal():
        action['targetId'], suffix = int(suffix[1]), []
    return action if not suffix and action_key(action) == key else None


def options_for(state: dict) -> dict[str, dict]:
    if state.get('result') or state.get('phase') != 'assault':
        return {}
    options = {}
    for action in state.get('legalActions', [])[:MAX_LEGAL_ACTIONS]:
        key = action_key(action)
        if key is not None and not (action.get('boss', False) and 'targetId' in action):
            options[key] = action
    return options


def no_decision(reason: str, source: str = 'bot') -> dict:
    if reason not in NO_DECISION_REASONS:
        raise ValueError('Invalid no-decision reason')
    return {'action': None, 'status': reason, 'source': source[:80]}


def spawn_stats(unit_type: str, state: dict, boss: bool = False) -> dict:
    stats = dict(UNIT_STATS[unit_type])
    strength = state['wave']['strength']
    stats['hp'] *= strength * (2.6 / 3 if boss else 1)
    stats['attack'] *= strength * (1.95 if boss else 1.3)
    stats['range'] *= 1.25 if boss else 1
    stats['speed'] *= .8 if boss else 1
    stats['cooldown'] *= 1.5 if state['stage'] == 1 else 1
    stats['cost'] = 5 if boss else stats['cost']
    if state.get('combatObservation', {}).get('version') == 1:
        stats.update(candidate_combat(unit_type, stats))
    area_scale = 2 * (1.25 if state.get('battlefieldVersion') == 2 else 1)
    if unit_type in ('brute', 'ogre'):
        stats['areaAttack'] = {
            'shape': 'circle' if unit_type == 'brute' else 'sector',
            'origin': 'authored fixed ground-contact point' if unit_type == 'brute' else 'attacker ground pivot',
            'radius': ((60 if boss else 48) if unit_type == 'brute' else stats['range']) * area_scale,
            'angleDegrees': 360 if unit_type == 'brute' else 110,
            'hitMs': 528 if state.get('enemyActionTimeScale') == .8 else 660,
            'secondaryTargets': 'living defenders inside the telegraphed ground shape at impact',
        }
    if unit_type == 'dragon':
        stats['splash'] = 70 * (1.25 if boss else 1) * area_scale
        stats['breathWidthFactor'] = area_scale
        stats['breathLength'] = stats['range'] * 2
        stats['breathEndHalfWidth'] = stats['range'] * 53.333 / 111.667 * area_scale
    return stats


class ChoiceAnswer(BaseModel):
    type: Literal['choice']
    choice: str = Field(max_length=100)
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    probabilities: dict[str, object] = Field(default_factory=dict, max_length=MAX_LEGAL_ACTIONS)

    @field_validator('probabilities', mode='before')
    @classmethod
    def optional_probability_map(cls, value):
        return value if isinstance(value, dict) else {}


def cooldown_context(state: dict) -> tuple:
    return (state['stage'], state['field']['id'], state.get('historyEnabled', True),
            state.get('battlefieldVersion'), state['phase'], state.get('result'))


def cooldown_target_ready(state: dict, target: dict) -> bool:
    """Require actual zero cooldown and a still-legal standalone road deployment."""
    if action_key(target) is None or target.get('type') != 'wait':
        return False
    unit_type, boss = target['unitType'], target.get('boss', False)
    snapshot = GameState.model_validate(state)
    if snapshot.cooldowns.get(unit_type) != 0 or not snapshot.can_deploy_target(unit_type, boss):
        return False
    return any(action['type'] == 'spawn' and action['unitType'] == unit_type
               and action.get('boss', False) == boss and 'targetId' not in action
               for action in snapshot.legalActions)


@dataclass(frozen=True, eq=False)
class _CooldownReadyGrant:
    context: tuple
    targets: frozenset[tuple[str, bool]]
    time: float


class ChoiceAdapter:
    inference_interval = 1.0

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None, clock=time.monotonic):
        self.transport = transport
        self.clock = clock
        self.retry_at = 0.0
        self.failures = 0
        self.last_request_at = -math.inf
        self.in_flight = False

    def _consume_cooldown_ready(self, state: dict, grant_and_target: object) -> bool:
        # Support and other Choice lanes never accept a deployment exception.
        return False

    async def choose(self, state: dict, options: dict[str, dict], *, _cooldown_ready=None) -> dict:
        early = self._consume_cooldown_ready(state, _cooldown_ready)
        if not options:
            return no_decision('no-legal-actions')
        now = self.clock()
        if now < self.retry_at:
            return no_decision('backoff', 'jev-backoff')
        if self.in_flight:
            return no_decision('busy', 'jev-busy')
        if not early and now - self.last_request_at < self.inference_interval:
            return no_decision('throttled', 'jev-throttled')
        self.in_flight = True
        self.last_request_at = now
        try:
            async with asyncio.timeout(1.5):
                return await self._request(state, options)
        finally:
            self.in_flight = False

    async def request_choice(self, payload: dict, options: dict[str, dict], question: str, answer_schema=ChoiceAnswer) -> dict:
        async with httpx.AsyncClient(timeout=1.5, transport=self.transport) as client:
            response = await client.post(ENDPOINT, json=payload,
                                         headers={'Authorization': f'Bearer {api_key()}'})
        if response.status_code in (429, 529):
            self.failures = min(self.failures + 1, 6)
            delay = 2 ** self.failures
            try:
                retry_after = float(response.headers.get('retry-after', '0'))
                if math.isfinite(retry_after):
                    delay = max(delay, retry_after)
            except ValueError:
                pass
            self.retry_at = self.clock() + min(delay, 300)
            return no_decision('backoff', 'jev-backoff')
        response.raise_for_status()
        body = response.json()
        answer = answer_schema.model_validate(body['answers'][question])
        if answer.choice not in options:
            raise ValueError('Jev returned an option outside the legal set')
        probabilities = {name: probability for name, probability in answer.probabilities.items()
                         if name in options and type(probability) in (int, float)
                         and 0 <= probability <= 1 and math.isfinite(probability)}
        total = sum(probabilities.values())
        probability_evidence = {
            'offeredActions': list(options.values()),
            'provided': [{'action': options[name], 'probability': probability}
                         for name, probability in probabilities.items()],
            'status': ('unavailable' if total <= 0 else
                       'complete' if len(probabilities) == len(options) else 'partial'),
        }
        score_source = 'provided-scores' if total > 0 else 'selected-action-fallback'
        if total <= 0:
            probabilities = {answer.choice: 1.0}
            total = 1.0
        probabilities = {name: probability / total for name, probability in probabilities.items()}
        self.failures = 0
        return {'action': options[answer.choice], 'source': 'jev', 'confidence': answer.confidence,
                'probabilities': probabilities, 'probabilityEvidence': probability_evidence,
                'scoreSource': score_source,
                'scores': [{'action': options[name], 'score': probability}
                           for name, probability in probabilities.items()]}


class JevAdapter(ChoiceAdapter):
    inference_interval = 5.0

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None, clock=time.monotonic):
        super().__init__(transport, clock)
        self._last_success = None
        self._cooldown_ready_grant = None

    def revoke_cooldown_ready_grant(self):
        self._cooldown_ready_grant = None
        self._last_success = None

    def issue_cooldown_ready_grant(self, state: dict, decision: dict):
        """Called by the processor only after publishing this exact Jev result."""
        success, self._last_success = self._last_success, None
        if success is None or success[0] is not decision or success[1] != state:
            return None
        if decision.get('source') != 'jev' or action_key(decision.get('action')) not in options_for(state):
            return None
        targets = frozenset((action['unitType'], action.get('boss', False))
                            for action in state['legalActions'] if action['type'] == 'wait')
        if not targets:
            return None
        grant = _CooldownReadyGrant(cooldown_context(state), targets, state['time'])
        self._cooldown_ready_grant = grant
        return grant

    def _consume_cooldown_ready(self, state: dict, grant_and_target: object) -> bool:
        issued, self._cooldown_ready_grant = self._cooldown_ready_grant, None
        if (issued is None or not isinstance(grant_and_target, tuple) or len(grant_and_target) != 2
                or grant_and_target[0] is not issued):
            return False
        target = grant_and_target[1]
        return (isinstance(target, dict) and action_key(target) is not None
                and (target.get('unitType'), target.get('boss', False)) in issued.targets
                and cooldown_context(state) == issued.context and state['time'] >= issued.time
                and cooldown_target_ready(state, target))

    async def decide(self, state: dict, *, cooldown_ready_grant=None, cooldown_ready_target=None) -> dict:
        self._last_success = None
        try:
            state = validate_state(state)
            if state.get('pendingSpawns'):
                return no_decision('no-legal-actions')
            decision = await self.choose(state, options_for(state),
                                         _cooldown_ready=(cooldown_ready_grant, cooldown_ready_target))
            if decision.get('source') == 'jev' and decision.get('action') is not None:
                self._last_success = (decision, copy.deepcopy(state))
            return decision
        finally:
            # A grant is one attempt, including invalid state, timeout, busy and backoff.
            self._cooldown_ready_grant = None

    async def _request(self, state: dict, options: dict[str, dict]) -> dict:
        tactical = {option['key']: option for option in state.get('tacticalOptions', [])}
        battlefield = state.get('battlefield') or {}
        routes = {route['routeId']: route for route in battlefield.get('routes', [])}
        flight_targets = {target['id']: target for target in battlefield.get('flightTargets', [])}
        criteria = {}
        for name, action in options.items():
            if action['type'] == 'formation':
                formation = FORMATIONS[action['formationId']]
                deployment = [{'unitType': unit_type, 'delay': index * formation['interval'],
                               'unit': spawn_stats(unit_type, state)} for index, unit_type in enumerate(formation['types'])]
            elif action['type'] == 'spawn':
                deployment = [{'unitType': action['unitType'], 'delay': 0, 'unit': spawn_stats(action['unitType'], state, action.get('boss', False))}]
            else:
                deployment = []
            lifetime = state['cooldowns'][action['unitType']] if action['type'] == 'wait' else 4
            # Pydantic normalizes float fields, including 4 to 4.0. Preserve the
            # identical supplied scalar so exact lossless tactical references
            # still work after validation; genuinely different lifetimes stay inline.
            if tactical.get(name, {}).get('lifetime') == lifetime:
                lifetime = tactical[name]['lifetime']
            criteria[name] = {'action': action, 'members': deployment,
                              'tactic': {**tactical.get(name, {'aim': 'Wait for target deployment cooldown' if action['type'] == 'wait' else 'Advance toward the base'}),
                                        'lifetime': lifetime}}
            if action.get('routeId') in routes:
                route = routes[action['routeId']]
                criteria[name]['route'] = {
                    key: route[key] for key in ('routeId', 'label', 'length', 'rangeCoverage', 'antiAirCoverage', 'surface', 'barriers')
                }
                criteria[name]['route']['weakPoints'] = sorted(
                    route['samples'], key=lambda sample: (sample['rangeCoverage'], sample['antiAirCoverage'], sample['progress']))[:3]
                criteria[name]['mission'] = ({'mode': 'direct-flight', 'target': flight_targets[action['targetId']],
                                               'fallbackRouteId': action['routeId']}
                                              if 'targetId' in action else {'mode': 'road'})
        persistent_barriers = 'sandbags' in (state.get('roadEffects') or {})
        road_rule = (
            'Visible roadEffects contains one surface, up to ten persistent sandbags in road order, and unused stock. Grounded enemies move at the surface speed factor combined with combat slow. Bat, wraith, and dragon ignore both road effects. Grounded enemies stop at the first barrier ahead and attack it on their authored cue and extended cooldown until its HP reaches zero. There is no timed collapse. Placed HP and unused stock carry to the next stage, with one new bag supplied per stage; moving does not repair it. The base always has priority over sandbags and defenders whenever in range.'
            if persistent_barriers else
            'Visible roadEffects contains one surface and at most one sandbag. Grounded enemies move at the surface speed factor combined with combat slow. Bat, wraith, and dragon ignore both road effects. Grounded enemies stop on first sandbag contact and attack it on their normal windup and projectile cadence; it collapses after visible HP is depleted or eight seconds after first contact. Before contact its timer has not started. The base always has priority over sandbags and defenders whenever in range.'
        )
        payload = {
            'model': os.getenv('JEV_MODEL') or 'jev-latest',
            'state': {'board': state, 'rules': {
                'controlledSide': 'ai', 'enemyEntryPosition': 0,
                'playerBasePosition': state['field']['pathLength'],
                'healing': 'Independent healing: Healer heals 18 every 5s (21.6 with weapon), attack 0; Paladin has no healing ability: it deals melee area damage with strike range 88 and impact radius 48. Healer healing has 175 range. healing.range is support reach. readyIn is remaining cooldown, not charges. Attack/healing occupy one full action lane; due healing takes priority when free. Only the original living ally is healed. healing.amount includes the Healer weapon bonus; never reapply it or attack/speed buffs.',
                'movement': 'Monsters advance along one winding path. They pause for their complete authored attack, including recovery, then walk before attacking again; they do not physically block other monsters. All allied and enemy effective attack intervals are doubled. For enemies this means twice max(1 / attackSpeed + 0.15 seconds, original authored animation duration + clamp(28 / movement speed, 0.35, 0.65) seconds); for allies it means 2 / attackSpeed. New enemy animation durations and release/contact deadlines use 0.8 times their authored clock. Allied action timing, projectile flight and deployment cooldowns are unchanged; attack intervals still use original authored durations. They stop once the player base is within their own attack range and remain stationary while sieging it. Defenders predict reachable interception within three seconds, using visible path motion, cooldown and home leash; they do not chase a departing enemy they cannot reach. Tank moves at 32 world units per second and guards its advanced position for 1.5 seconds before returning; other defenders move at 52.',
                'combatBalance': 'Tank and Beetle take arrow damage x0.7 and magic damage x1.3 after armor. Melee, cannon and gate cannon damage remain neutral. Each living Tank restrains at most one ground enemy; additional enemies pass. Goblin prioritizes ranged defenders but attacks a living intervening defender first, ignoring a Tank occupied by another enemy. CrystalSentinel takes magic damage x0.7 and melee, arrow, cannon, gate and spike damage x1.2 after armor. ClockworkPatchling regenerates only itself at 4 HP per second after two seconds without actual damage, capped at max HP; healing does not reset its quiet timer. CrystalSentinel, KoboldLancer and ClockworkPatchling are grounded melee. Ordinary Dragon unlocks at stage9; stage10 Dragon remains the final boss.',
                'defenderContact': 'For soldier, runner, tank and paladin, defender range is the actual strike radius, distinct from home acquisition distance range + leash. They must approach into strike range before beginning a melee attack, then lock the original living target: movement after attack start cannot cause a miss. Damage still resolves only at the authored contact cue or projectile landing. The attacker must survive until release, and a dead target is never replaced or damaged again. The leash bounds pursuit around home, not damage reach. When enemies choose a defender, tank preference only reorders defenders already within the attack radius of the selecting enemy; it never attracts out-of-range attackers.',
                'enemyContact': 'Slime, goblin, wolf, beetle, brute, bat, ogre, crystalSentinel, koboldLancer and clockworkPatchling use physical strike ranges from unitStats. They remain on the road, pass out-of-reach defenders, and require contact at attack start; they never begin a remote strike. Once a valid ordinary strike starts, its original living target is guaranteed the authored hit even if that target moves away. They do not pursue distant defenders. New ogre attacks sweep a locked-forward 110-degree sector of radius twice their range; new brute attacks slam a circle of radius 96 (boss 120) centered on its authored ground-contact point. New attacks resolve once at 528 ms. Their guaranteed primary recipient can move outside the warning, while additional living defenders must have their ground anchors inside at impact. Base and sandbags can be primary targets but never secondary collateral. Every boss attack range is its normal archetype range times 1.25; visual body scale is 1.35 and is not multiplied into the range again. Melee building attacks measure weapon reach (unit range minus 18) to the nearest castle wall or sandbag outer face, not the building center. Shaman, wraith and dragon retain ranged attacks. Dragon alternates its fireball with a fixed-facing authored breath: 384-768 ms emission, eight ticks sharing one attack damage total, inside the visible frontal cone. New fireball splash radius is 140 (boss 175); new breath length and terminal width are doubled with the same cone angle. Already accepted attacks restored from an older save retain their captured timing and geometry. Base priority applies when choosing each new attack; an accepted ordinary attack is not redirected. Breath alone continues to require visible cone membership at every tick.',
                'baseDamage': 'There is one player base. When it is in range, monsters always prioritize attacking the base over any defender and repeatedly attack it on their existing attack cooldown. They remain on the field and targetable until killed. The AI has no base.',
                'roadEffects': road_rule,
                'tacticalHistory': 'When enabled, board.tacticalHistory is self-contained browser-owned evidence: a 20-second recent window and at most three older completed deployments in this same stage/field. It is capped at 6000 bytes, with latest-first records and explicit truncation. Deployment totals are cumulative since startedAt; events/contributions cover only the recent window. Order/spacingSeconds are declared deployment order and delays; observedOrder/observedGaps are the last observed living formation. Front survival is elapsed so far while frontAlive is true. Upgrade event amount is the increase in attack power of that placed defender, not gold spent. Preparation event x/y are home positions; area-loss x/y are the victim centroid. Contributions are actual damage capped and proportionally allocated at resolution; onDefeatStep can identify several contributors in the same simultaneous lethal step, not a unique killer. Area-loss records mean multiple victims died on a step receiving the same area attack, not proof it alone caused the losses. Infer causes only tentatively. Missing or truncated records mean unknown, never absence. History disabled sends no prior outcomes or stage summary. Observation-only snapshots are not model conversation memory and are not merged into this request; only this decision board is consumed.',
                'deployment': 'Only listed legalActions may be chosen. The browser enforces finite wave cost budgets, type unlocks, cooldowns, boss flags and spawn intervals. A wait names exactly one listed unitType and boss flag whose standalone deployment is blocked only by its current deployment cooldown. board.cooldowns is the request-time remaining-seconds snapshot. A targeted wait holds until its cooldown is ready. No Rule deployment runs while held. Readiness requests Jev once immediately, even inside five seconds, subject to busy/backoff guards. Waiting reserves no budget or units and promises no spawn. A ready unit, an unlisted target, and a generic wait are invalid. Formations are immutable, contain at most three distinct types, reserve their entire cost/count immediately, and preserve declared front-to-rear order. Bosses must be standalone final deployments.',
                'scaling': 'unitStats and option member.unit already include stage-scaled HP/attack and deployment cooldown. Boss factors are HP (2.6 / 3), attack 1.95, range 1.25, speed 0.8. Do not multiply these tables again. Stage strength is 1 + (stage - 1) * 0.10. Regular enemy attack adds 1.3; bosses do not. Observed defender HP/maxHp/attack already include current balance, level and equipment; do not apply another health multiplier. level/maxHp are per individual; do not reapply level scaling. Reserves are absent. Only stage-1 type deployment cooldowns get 1.5; global spawn/combat intervals are unchanged. Saved active waves retain bossType/budget until next stage. The wave clears only after every allocated monster has spawned and died, provided the player base survives.',
                'selection': 'Return relative probabilities for legal options. The browser combines whole-action scores with field weights and bounded seeded randomness without shuffling formation members. A selected wait is honored.',
                'unitStats': {unit_type: spawn_stats(unit_type, state) for unit_type in UNIT_STATS}}},
            'questions': {'deployment': {
                'type': 'choice',
                'instructions': 'Choose a listed targeted wait lasting until its named deployment cooldown is ready, standalone deployment or fixed formation. Deployment uses one-second slots with at most one Jev inference every five seconds normally and fresh Rule decisions between calls unless adopting one unused reply from the current five-second request bucket. A targeted wait suppresses Rule deployment and permits one immediate fresh Jev inference at readiness; busy/backoff still apply. A fast reply can occupy its original uncommitted slot; a later one may fill the next uncommitted one-second slot before bucket expiry. Original options/probabilities remain request-time evidence; recheck current legality before applying. Accepted formation members keep their reservations until they deploy. Consider visible defender ranges, single-target versus area roles, front concentration and coverage, visible road effects and sandbag HP/layout/stock (contact timer only for legacy timed bags), remaining budget/count, cooldowns/unlocks, recent deployment outcomes (path progress, base and defender damage), and previous-stage summary when supplied. Also use the bounded browser tactical history for observed changes, additions/upgrades, formation order/spacing/reach, front survival and damage/loss patterns. Treat successes/failures as observations, not proof that a tactic caused them. Do not invent missing history or certain causal conclusions. Non-wait four-second strategy records do not block fresh one-second decisions; pending formations prevent overlapping deployments; observation-only snapshots never call the model. Waits require a listed cooling target from request-time board.cooldowns and reserve nothing. Return Choice probabilities only for listed options; do not return a custom plan or hidden reasoning.',
                'criteria': criteria}},
        }
        if state.get('enemyActionTimeScale') != .8:
            rules = payload['state']['rules']
            for key in ('movement', 'enemyContact'):
                rules[key] = (rules[key].replace('528 ms', '660 ms')
                              .replace('384-768 ms', '480-960 ms')
                              .replace('384–768 ms', '480–960 ms'))
            rules['movement'] = rules['movement'].replace(
                'New enemy animation durations and release/contact deadlines use 0.8 times their authored clock. Allied action timing, projectile flight and deployment cooldowns are unchanged; attack intervals still use original authored durations. ', '')
        if state.get('combatObservation', {}).get('version') == 1:
            payload['state']['rules']['combatObservation'] = "board.combatObservation v1 timestamps unit.combat at exact simulation seconds at; board.time is rounded. Missing combat is unknown. armor is effective current damage reduction. attackInterval is the ordinary minimum start-to-start interval from raw speed/attackSpeed; breathAttackInterval is Dragon's alternative, not a next-action prediction. attackReadyIn is offensive CD remaining, separate from deployment board.cooldowns/unitStats.cooldown. Healer instead uses independent healing. movement.effectiveSpeed is instantaneous capacity = unimpededSpeed * min(terrainFactor,mudFactor) * frostFactor, not actual velocity or arrival time. moving describes the last step. Recovery locks, range, leash, scenery or stationary roles can prevent movement. Remaining status times share the exact timestamp; do not apply factors again. committedAction describes only the latest retained action: original recipient availability, status, and scheduled release/initial-impact/end remaining. Survival, hit and damage are not guaranteed. Absence predicts no future target. Legacy-coupled retains an old accepted action and optional separate heal recipient. Breath impactIn is emission start; ticksRemaining/emissionRemaining follow its captured clock. Candidate armor/mode/airborne/intervals are static derived facts, not live buffs, Rule scores or synergy multipliers."
        if any('roadblockTank' in unit or 'roadblock' in unit.get('combat', {}).get('movement', {})
               for unit in state.get('defenders', []) + state.get('enemies', [])):
            payload['state']['rules']['tankRoadblocks'] = (
                'Optional unit.roadblockTank is a live player Tank current exact x/y body with radius42 and route passage intervals; it never uses home position. '
                'Optional combat.movement.roadblock names the nearest current Tank obstruction only when no nearer sandbag blocks travel. '
                'stopProgress and distance are current route geometry, not an arrival prediction. stopped means current geometric contact within attack range, not an action or damage guarantee. '
                'Effective movement speed remains unblocked capacity. Ground enemies cannot pass the living body; dead or moved-away Tanks no longer block. Bat, wraith and dragon, including bosses, ignore Tank roadblocks. '
                'Existing base priority, recovery and attack timing remain. Missing optional fields are unknown in older messages; do not predict future Tank movement, damage or death.'
            )
        if (state.get('combatObservation', {}).get('version') == 1
                and any(unit['type'] == 'frost' for unit in state['defenders'])):
            payload['state']['rules']['frostOnHit'] = {'movementFactor': .55, 'durationSeconds': 1.6, 'appliesAt': 'impact'}
        if state.get('battlefieldVersion') == 2:
            rules = payload['state']['rules']
            rules['enemyEntryPosition'] = state['field']['entrance']
            rules['playerBasePosition'] = state['field']['gate']
            rules['movement'] = (
                'Monsters enter at field.entrance and follow their selected left or right route to the one shared gate. '
                'They pause for the complete authored attack including recovery, then walk before attacking again; monsters do not block each other. '
                'Only a non-boss airborne standalone spawn with targetId takes a direct flight mission; its routeId fixes the fallback road. New bosses always follow their selected road. '
                'The selected defender ID is fixed at acceptance. A direct flyer approaches and attacks only that defender, without tank diversion. '
                'If that target dies or disappears, the flyer continuously flies from its current position to the fixed returnProgress on its fallback route, then follows that road; it never teleports or picks another defender. '
                'A returning boss restored from an older save continuously rejoins its selected road from its current position, finishes any already accepted attack, and cannot raid or choose a new attack before that join. '
                'Otherwise gate priority applies whenever it is in range, including direct missions. All allied and enemy effective attack intervals remain doubled and use original authored durations. New enemy animation durations and contact/release deadlines use 0.8 times their authored clock; allied action timing, projectile flight and deployment cooldowns are unchanged. '
                'An ordinary enemy exits after one successful gate attack and its recovery. A boss stays and repeatedly attacks the gate until killed.'
            )
            if state.get('enemyActionTimeScale') != .8:
                rules['movement'] = rules['movement'].replace(' New enemy animation durations and contact/release deadlines use 0.8 times their authored clock; allied action timing, projectile flight and deployment cooldowns are unchanged.', '')
            rules['baseDamage'] = (
                'There is one player base at the shared gate. It has priority whenever in range, except a returning legacy boss must finish rejoining its road before choosing a new attack. '
                'Ordinary enemies resolve one successful gate attack, finish recovery while remaining targetable, then exit and count as resolved without a kill reward. '
                'Bosses repeatedly attack on their existing cooldown and remain targetable until killed. The AI has no base.'
            )
            rules['airDefense'] = (
                'Archer, mage, frost, ranger and cannon can hit airborne bat, wraith and dragon. Healer remains a legal direct-flight raid target, but has zero offensive and anti-air damage. Only these ranged allies can hit bat and dragon. '
                'Wraith remains airborne but is also targetable and damageable by melee soldier, runner, tank and paladin. This does not change its flight or immunity to grounded road effects. '
                'Formations and new bosses always follow the selected road, including airborne members. '
                'Direct flight candidates include every deployed living ranged individual, up to ten supported legacy individuals, including repeated roles. There is no low-HP or coverage shortlist or forced equality of target or class scores. '
                'Only the offered request-time target IDs are legal. Unknown, removed or stale IDs are never replaced with another target.'
            )
            rules['enemyContact'] = (
                'Primary attack reach remains the unit range; bosses use normal range times 1.25 once. Physical building attacks use range minus 18 to the nearest building face. '
                'Ordinary accepted strikes lock the original living target and land at their authored cue; targets are never replaced after death. '
                'New brute area radius is 120, boss 150, centered on its authored contact point. New ogre area radius is 160, boss 200, in its locked-forward 110-degree sector. '
                f'New attacks resolve at {528 if state.get("enemyActionTimeScale") == .8 else 660} ms; the primary may move outside the warning but secondary living defenders must be inside at impact. Base and sandbags are never secondary collateral. '
                f'New dragon fireball splash radius is 175, boss 218.75. Its fixed-facing breath length and terminal width are twice the previous dimensions, preserving the cone angle and {"384–768" if state.get("enemyActionTimeScale") == .8 else "480–960"} ms emission/eight ticks. The prior battlefield width factor 1.25 is already included. Already accepted attacks restored from an older save retain their captured timing and geometry. '
                'Breath requires cone membership at each tick. These area changes never enlarge primary acquisition range. Stats already include the area scaling.'
            )
            rules['roadEffects'] = (
                'Each battlefield route contains its visible surface and ordered barriers. The same physical barrier may occur in both route observations on a shared road segment; it has one HP pool. '
                'Grounded enemies follow their selected route, combine surface speed with combat slow, and stop at its first living barrier ahead until destroyed. '
                'Bat, wraith and dragon ignore road slow and sandbags. Gate priority applies whenever in range, except a returning legacy boss must rejoin its road before choosing a new attack. '
                'Sandbags have persistent HP, no timed collapse, and stock plus placed count never exceeds ten; moving does not repair them.'
            )
            rules['deployment'] += (
                ' Every spawn and formation requires its listed routeId. Only standalone non-boss bat, wraith or dragon may include a listed targetId for direct flight. '
                'Every formation and new boss is road-only. Targeted cooldown waits remain route-less and target-less.'
            )
            rules['selection'] = (
                'Return raw relative probabilities for the complete listed route/mission options. The browser preserves raw Jev evidence unchanged and uses 95% Jev weighting with 5% seeded exploration '
                '(other controllers use 82%/18%). Exploration is hierarchical across base deployment, route, road versus direct mission, and offered target, so extra route or target variants do not inflate a base deployment. '
                'Formation order is preserved and a selected wait is honored.'
            )
            rules['scaling'] = rules['scaling'].replace('every allocated monster has spawned and died', 'every allocated monster has spawned and died or exited after its gate attack')
            rules['tacticalHistory'] += ' Optional deployment exited counts distinguish gate exits from deaths; resolved includes both. Missing exited data is unknown.'
            payload['questions']['deployment']['instructions'] += (
                ' Compare the two route lengths, sampled weak points, total range coverage, anti-air coverage, surface and barrier HP. '
                'For direct flight, compare each offered target HP ratio, position and nearbyRangedCover against the chosen fallback route. '
                'Use visible route and target criteria only; do not invent unoffered targets or hidden reasoning.'
            )
        if (state.get('tacticalHistory') or {}).get('version') == 2:
            payload['state']['rules']['tacticalHistory'] += (
                ' V2 receipts add victimType, sourceKind, captured attackId and optional breath tick. '
                'Damage excludes healing/slows and is post-armor, HP-clamped. enemyOutcomes are latest stage results; '
                'gate-exit has no killer/reward. With nonnull flightPhase (approach/engage/return), routeId is the selected fallback and progress is stored road progress; only x/y locates the actual death. '
                'All known co-lethal sources stay in lethalContributors; shared/unknown lastKiller is null. '
                'Phase null includes airborne road travel; restored boss return is return. Trends group enemyType/source, never route-zone aggregates. '
                'omittedSources counts undisplayed known identities; omittedContributions counts untracked hits. omittedDamage covers both. '
                'attributionComplete describes recorded attribution, not display completeness. truncated/legacyUnknown and unknown legacy identity/route/progress never imply absence.'
            )
        if state.get('fortifications') is not None:
            rules = payload['state']['rules']
            rules['fortifications'] = (
                'Visible fortifications.items are separate from ordinary sandbags. Spikes have 40 maximum HP, block grounded road travelers, '
                'and retaliate for 8 raw damage only when struck by a grounded melee attacker at its actual impact; ranged shots do not receive remote retaliation. '
                'Mud has up to six entry charges and slows a grounded enemy to 65% speed for two seconds per entry. Remaining inside does not spend another charge; '
                'leaving and re-entering can spend one. A spent puddle disappears but its already applied slow completes. Flying enemies ignore both paid road items. '
                'Natural terrain and paid mud use the stronger slow, then multiply the existing frost effect. Observe mudSlowRemaining rather than inventing an effect. '
                'The gate cannon has 210 ground range, 3.2-second interval, a 0.30-second windup and 0.28-second projectile flight. '
                'It prefers an in-range boss, otherwise the nearest in-range enemy, and locks that living target through flight without substituting a dead target. '
                'Levels 1/2/3 deal 8/12/16 raw damage. Gate armor reduces incoming damage by 10% per level, capped at 30%. '
                'Visible individual equipment is already included in actual attack/maxHp/healing: weapon adds 20% attack for damage dealers, or changes Healer healing from 18 to 21.6; armor adds 30% maximum HP once. Paladin healing stays 8. Do not rescale it or buy the same equipment again. '
                'Reserve allies, spending history and private inventory are not visible in this board.'
            )
            rules['tacticalHistory'] += (
                ' Contributor sourceType gate with sourceId zero is the gate cannon; sourceType spike uses the paid trap ID. '
                'These are environmental defenses, not additional monster or ally archetypes.'
            )
        if state.get('commanderSupportVersion') == 1:
            payload['state']['rules']['commanderSupport'] = (
                'Observed attack is support-adjusted damage with unchanged attack cadence; speed is support-adjusted movement speed before terrain/mud/frost. '
                'Apply the stronger terrain or mud slow, then the frost factor, during movement; flyers ignore road effects. Armor already includes support. Optional supportBuff describes the active AI-only '
                'five-second 1.15 attack/speed multiplier or +0.10 armor bonus capped at0.60, already included in these stats. '
                'Do not multiply them again. maxHp is actual maximum health for both sides. Support choices use a separate request '
                'channel and do not spend deployment budget or change spawn count. This deployment question can only choose its listed deployment actions.'
            )
        self.last_prompt_budget = None
        self.last_history_summary = None
        payload, budget, summary = fit_deployment_payload(payload, validate_state, compact_deployment_payload)
        self.last_history_summary = summary
        self.last_prompt_budget = {**budget, 'historySummary': summary}
        if not budget['allowed']:
            return no_decision('unavailable', 'jev-prompt-budget')
        return await self.request_choice(payload, options, 'deployment')
