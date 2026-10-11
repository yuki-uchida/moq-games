"""Bounded facts about current Tank bodies, not a forecast or local choice score."""
import math
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class RoadblockModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, allow_inf_nan=False)


class TankPassage(RoadblockModel):
    routeId: Literal['left', 'right'] | None = None
    startProgress: float = Field(ge=0, le=100000)
    endProgress: float = Field(ge=0, le=100000)

    @model_validator(mode='after')
    def ordered(self):
        if self.startProgress > self.endProgress + 1e-9:
            raise ValueError('Reversed Tank passage interval')
        if 'routeId' in self.model_fields_set and self.routeId is None:
            raise ValueError('Legacy Tank passage omits its route id')
        return self


class RoadblockTank(RoadblockModel):
    x: float = Field(ge=-1000, le=100000)
    y: float = Field(ge=-1000, le=100000)
    radius: Literal[42]
    # Two current routes have <=14 points each; 32 leaves a small bounded margin.
    passages: list[TankPassage] = Field(min_length=1, max_length=32)


class TankRoadblockStop(RoadblockModel):
    tankId: int = Field(ge=1, le=1000000000)
    stopProgress: float = Field(ge=0, le=100000)
    distance: float = Field(ge=0, le=100000)
    stopped: bool

    @model_validator(mode='after')
    def coherent_contact(self):
        if self.stopped and self.distance > 1e-7:
            raise ValueError('Tank stop cannot be ahead of current contact')
        return self


def circle_passages(path, x, y, radius):
    """Validate observed static body/polyline intersections, without simulating travel."""
    result, accumulated = [], 0.0
    for a, b in zip(path, path[1:]):
        dx, dy = b.x - a.x, b.y - a.y
        length = math.hypot(dx, dy)
        if length <= 1e-9:
            continue
        along = ((x - a.x) * dx + (y - a.y) * dy) / length
        across = ((x - a.x) * dy - (y - a.y) * dx) / length
        squared = radius * radius - across * across
        if squared >= -1e-9:
            half = math.sqrt(max(0, squared))
            start, end = max(0, along - half), min(length, along + half)
            if start <= end + 1e-9:
                interval = [accumulated + start, accumulated + end]
                if result and interval[0] <= result[-1][1] + 1e-9:
                    result[-1][1] = max(result[-1][1], interval[1])
                else:
                    result.append(interval)
        accumulated += length
    return result


def validate_roadblock_context(state):
    rows = state.defenders + state.enemies
    defenders = {row.id: row for row in state.defenders if row.id is not None}
    routes = {route.routeId: route for route in state.battlefield.routes} if state.battlefield else {}
    for row in rows:
        body = row.roadblockTank
        stop = row.combat.movement.roadblock if row.combat else None
        if 'roadblockTank' in row.model_fields_set:
            if body is None or row.type != 'tank' or row not in state.defenders:
                raise ValueError('Only a live player Tank has a roadblock body')
            if state.combatObservation is None or row.combat is None or not row.combat.alive:
                raise ValueError('Tank body requires live exact-time combat observation')
            if abs(body.x - row.x) > .500001 or abs(body.y - row.y) > .500001:
                raise ValueError('Tank body disagrees with current position')
            previous = {}
            for passage in body.passages:
                if (routes and passage.routeId not in routes) or (not routes and passage.routeId is not None):
                    raise ValueError('Tank passage belongs to an unknown route')
                length = routes[passage.routeId].length if routes else state.field.pathLength
                if passage.endProgress > length + 1e-7:
                    raise ValueError('Tank passage exceeds route')
                if passage.routeId in previous and passage.startProgress <= previous[passage.routeId] + 1e-9:
                    raise ValueError('Tank passages must be separate and ordered')
                previous[passage.routeId] = passage.endProgress
            if routes:
                expected = [(route.routeId, start, end) for route in state.battlefield.routes
                            for start, end in circle_passages(route.path, body.x, body.y, body.radius)]
                actual = [(p.routeId, p.startProgress, p.endProgress) for p in body.passages]
                if len(expected) != len(actual) or any(
                    route != actual_route or abs(start - actual_start) > 1e-7 or abs(end - actual_end) > 1e-7
                    for (route, start, end), (actual_route, actual_start, actual_end) in zip(expected, actual)
                ):
                    raise ValueError('Tank passages disagree with its current body geometry')
        if not stop:
            continue
        if row not in state.enemies or row.type in ('bat', 'wraith', 'dragon') or not row.combat.alive:
            raise ValueError('Only live ground enemies observe Tank stops')
        tank = defenders.get(stop.tankId)
        if tank is None or tank.roadblockTank is None or tank.combat is None or not tank.combat.alive:
            raise ValueError('Tank stop requires the observed live player Tank')
        if abs(stop.stopProgress - stop.distance - row.progress) > .500001:
            raise ValueError('Tank stop distance disagrees with current progress')
        passages = [p for p in tank.roadblockTank.passages if p.routeId == row.routeId]
        if not any(p.startProgress - 1e-7 <= stop.stopProgress <= p.endProgress + 1e-7 for p in passages):
            raise ValueError('Tank stop is outside its current route passage')
        # Unit positions are rounded independently; body xy is exact.
        if stop.stopped and math.hypot(row.x - tank.roadblockTank.x, row.y - tank.roadblockTank.y) > row.range + math.sqrt(.5) + 1e-7:
            raise ValueError('Tank stop cannot be outside actual attack contact')
