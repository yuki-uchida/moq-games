import argparse
import asyncio
import json
import time
from pathlib import Path
from collections import OrderedDict
from dataclasses import dataclass
from typing import Literal

import httpx
import moq
from dotenv import load_dotenv
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from pipecat.frames.frames import CancelFrame, EndFrame, Frame, InputTransportMessageFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineWorker
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.transports.moq.transport import MOQParams, MOQTransport
from pipecat.workers.runner import WorkerRunner

from jev import (JevAdapter, BoundedModel, ENEMY_TYPES, api_key, validate_state, no_decision,
                 cooldown_context, cooldown_target_ready)
from jev_support import JevSupportAdapter, validate_support_state

load_dotenv(Path(__file__).with_name('.env'), override=False)


class CooldownReady(BoundedModel):
    requestId: str = Field(min_length=1, max_length=16, pattern=r'^[1-9][0-9]*$')
    unitType: ENEMY_TYPES
    boss: bool
    stage: int = Field(ge=1, le=10)
    fieldId: Literal['meadow', 'desert', 'frost', 'volcanic']


class Envelope(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    version: int = Field(ge=1, le=4)
    purpose: Literal['support'] | None = None
    kind: Literal['decision', 'observation'] = 'decision'
    session: str = Field(min_length=1, max_length=100)
    requestId: str = Field(min_length=1, max_length=16, pattern=r'^[1-9][0-9]*$')
    seq: int = Field(ge=1, le=9007199254740991)
    epoch: str = Field(min_length=1, max_length=108)
    state: dict
    cooldownReady: CooldownReady | None = None

    @model_validator(mode='before')
    @classmethod
    def restore_transport_correlation(cls, value):
        if isinstance(value, dict) and 'seq' not in value and 'epoch' not in value:
            request_id = value.get('requestId')
            if isinstance(request_id, str) and request_id.isascii() and request_id.isdecimal() and len(request_id) <= 16:
                session = value.get('session')
                epoch = f'{session}:support' if value.get('purpose') == 'support' else session
                return {**value, 'seq': int(request_id), 'epoch': epoch}
        return value

    @model_validator(mode='after')
    def correlated_record(self):
        support = self.version == 4
        epoch = f'{self.session}:support' if support else self.session
        if self.epoch != epoch or self.requestId != str(self.seq):
            raise ValueError('Invalid record correlation')
        if support:
            if self.purpose != 'support' or self.kind != 'decision' or 'kind' not in self.model_fields_set:
                raise ValueError('Invalid support purpose or kind')
            self.state = validate_support_state(self.state)
        else:
            if 'purpose' in self.model_fields_set:
                raise ValueError('Deployment cannot carry a support purpose')
            self.state = validate_state(self.state)
            if (self.state.get('battlefieldVersion') == 2) != (self.version == 3):
                raise ValueError('Wire version does not match battlefield')
        if 'cooldownReady' in self.model_fields_set:
            ready = self.cooldownReady
            if (support or self.kind != 'decision' or ready is None
                    or int(ready.requestId) >= self.seq or ready.stage != self.state['stage']
                    or ready.fieldId != self.state['field']['id']):
                raise ValueError('Invalid cooldown-ready deployment correlation')
        return self


class ActionPublisher:
    def __init__(self):
        self.track = None
        self.group_id = time.time_ns() // 1000

    def publish_on(self, broadcast: moq.BroadcastProducer):
        self.track = broadcast.publish_track('action')
        self.send({'ready': True})

    def send(self, message: dict):
        if self.track is None:
            raise RuntimeError('Action track is not connected')
        self.group_id += 1
        group = self.track.create_group(self.group_id)
        group.write_frame(json.dumps(message, separators=(',', ':')).encode())
        group.finish()


@dataclass(frozen=True)
class CooldownPermit:
    session: str
    request_id: str
    context: tuple
    targets: frozenset[tuple[str, bool]]
    time: float
    grant: object


@dataclass
class RequestLane:
    adapter: object
    task: asyncio.Task | None = None
    last_request_at: float = -float('inf')
    latest_observation: dict | None = None
    last_observation_at: float = -float('inf')
    cooldown_permit: CooldownPermit | None = None
    context: tuple | None = None
    context_generation: int = 0
    latest_decision: tuple | None = None


class JevProcessor(FrameProcessor):
    def __init__(self, actions: ActionPublisher, adapter=None, clock=time.monotonic, support_adapter=None):
        super().__init__()
        self.actions = actions
        self.jev = adapter or JevAdapter()
        self.clock = clock
        self.lanes = {'deployment': RequestLane(self.jev), 'support': RequestLane(support_adapter or JevSupportAdapter())}
        self.sequences: OrderedDict[tuple[str, str], int] = OrderedDict()

    @property
    def decision_task(self):
        return self.lanes['deployment'].task

    @property
    def support_task(self):
        return self.lanes['support'].task

    @property
    def latest_observation(self):
        return self.lanes['deployment'].latest_observation

    async def cleanup(self):
        for lane in self.lanes.values():
            self.clear_cooldown_permit(lane)
            if lane.task is not None and not lane.task.done():
                await self.cancel_task(lane.task)
        await super().cleanup()

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, (CancelFrame, EndFrame)):
            for lane in self.lanes.values():
                if lane.task is not None:
                    if isinstance(frame, CancelFrame):
                        await self.cancel_task(lane.task)
                    else:
                        await lane.task
        if not isinstance(frame, InputTransportMessageFrame):
            await self.push_frame(frame, direction)
            return
        try:
            envelope = Envelope.model_validate(frame.message)
        except (ValidationError, ValueError, TypeError):
            logger.warning('Ignoring invalid game envelope')
            return
        purpose = 'support' if envelope.version == 4 else 'deployment'
        key = (envelope.session, purpose)
        if envelope.seq <= self.sequences.get(key, 0):
            logger.debug('Ignoring duplicate or stale game state')
            return
        self.sequences[key] = envelope.seq
        self.sequences.move_to_end(key)
        if len(self.sequences) > 64:
            self.sequences.popitem(last=False)
        lane = self.lanes[purpose]
        if purpose == 'deployment':
            context = (envelope.session, *cooldown_context(envelope.state))
            if context != lane.context:
                self.clear_cooldown_permit(lane)
                lane.context = context
                lane.context_generation += 1
        if envelope.kind == 'observation':
            now = self.clock()
            if now - lane.last_observation_at >= 1:
                lane.last_observation_at = now
                lane.latest_observation = envelope.state
            return
        permit = lane.cooldown_permit
        lane.cooldown_permit = None
        lane.latest_decision = (envelope.session, envelope.seq)
        grant, target = None, None
        if envelope.cooldownReady is not None:
            ready = envelope.cooldownReady
            target = {'type': 'wait', 'unitType': ready.unitType, 'boss': ready.boss}
            if (permit is None or permit.session != envelope.session or permit.request_id != ready.requestId
                    or permit.context != cooldown_context(envelope.state) or envelope.state['time'] < permit.time
                    or (ready.unitType, ready.boss) not in permit.targets
                    or not cooldown_target_ready(envelope.state, target)):
                self.clear_cooldown_permit(lane)
                self.respond(envelope, no_decision('unavailable', 'jev-invalid-cooldown-ready'))
                return
            grant = permit.grant
        else:
            self.clear_cooldown_permit(lane)
        if lane.task is not None and not lane.task.done():
            self.clear_cooldown_permit(lane)
            self.respond(envelope, no_decision('busy', 'jev-busy'))
            return
        now = self.clock()
        period = 10 if purpose == 'support' else 5
        if grant is None and now - lane.last_request_at < period:
            self.respond(envelope, no_decision('throttled', 'jev-throttled'))
            return
        lane.last_request_at = now
        lane.task = self.create_task(self.decide(envelope, lane, grant, target, lane.context_generation))

    def clear_cooldown_permit(self, lane: RequestLane):
        lane.cooldown_permit = None
        if isinstance(lane.adapter, JevAdapter):
            lane.adapter.revoke_cooldown_ready_grant()

    def respond(self, envelope: Envelope, decision: dict, context_generation=None):
        correlation = ({'purpose': 'support', 'kind': 'decision', 'seq': envelope.seq, 'epoch': envelope.epoch}
                       if envelope.version == 4 else {})
        lane = self.lanes['support' if envelope.version == 4 else 'deployment']
        response = {'version': envelope.version, 'session': envelope.session, 'requestId': envelope.requestId,
                    **correlation, **decision}
        try:
            self.actions.send(response)
        except Exception as error:
            self.clear_cooldown_permit(lane)
            logger.warning('Could not publish decision: {}', type(error).__name__)
            return
        if decision.get('source') != 'jev':
            self.clear_cooldown_permit(lane)
        if (envelope.version != 4 and isinstance(lane.adapter, JevAdapter)
                and lane.latest_decision == (envelope.session, envelope.seq)
                and lane.context == (envelope.session, *cooldown_context(envelope.state))
                and lane.context_generation == context_generation):
            grant = lane.adapter.issue_cooldown_ready_grant(envelope.state, decision)
            if grant is not None:
                targets = frozenset((action['unitType'], action.get('boss', False))
                                    for action in envelope.state['legalActions'] if action['type'] == 'wait')
                lane.cooldown_permit = CooldownPermit(envelope.session, envelope.requestId,
                                                     cooldown_context(envelope.state), targets,
                                                     envelope.state['time'], grant)
        logger.info('Action request={} purpose={} source={} action={}', envelope.requestId,
                    envelope.purpose or 'deployment', response.get('source', 'error'), response.get('action', 'error'))

    async def decide(self, envelope: Envelope, lane: RequestLane, grant=None, target=None, context_generation=None):
        try:
            if api_key():
                async with asyncio.timeout(1.8):
                    if grant is None:
                        decision = await lane.adapter.decide(envelope.state)
                    else:
                        decision = await lane.adapter.decide(envelope.state, cooldown_ready_grant=grant,
                                                             cooldown_ready_target=target)
            else:
                decision = {**no_decision('not-configured', 'jev-unconfigured'),
                            'error': 'Jev API key is missing; configure JEV_API_KEY or TYPESAFE_API_KEY in the bot'}
        except (TimeoutError, httpx.TimeoutException):
            decision = {**no_decision('timeout', 'jev-timeout'), 'error': 'Jev request timed out'}
        except Exception as error:
            logger.warning('Jev request {} failed: {}', envelope.requestId, type(error).__name__)
            decision = {**no_decision('error', 'jev-error'),
                        'error': 'Jev request failed; check bot credentials and connectivity'}
        self.respond(envelope, decision, context_generation)


def parse_args():
    parser = argparse.ArgumentParser(description='Control tower defense through MoQ and Jev')
    parser.add_argument('--relay-url', default='https://127.0.0.1:4433')
    parser.add_argument('--room', default='mossvale')
    parser.add_argument('--insecure', action='store_true', help='Skip TLS verification for a local self-signed relay')
    args = parser.parse_args()
    if not args.room or '/' in args.room:
        parser.error('--room must be a non-empty single namespace segment')
    return args


async def main():
    args = parse_args()
    namespace = f'anon/tower-jev/{args.room}'
    transport = MOQTransport(params=MOQParams(
        relay_url=args.relay_url,
        verify_ssl=not args.insecure,
        request_path=f'{namespace}/state',
        response_path=f'{namespace}/action',
        transcript_track='state',
        audio_in_enabled=False,
        audio_out_enabled=False,
        connection_timeout=365 * 24 * 60 * 60,
    ))
    actions = ActionPublisher()
    runner = WorkerRunner()

    @transport.event_handler('on_connected')
    async def on_connected(transport):
        # MOQTransport rebuilds its broadcast on reconnect and exposes no public API for extra tracks.
        actions.publish_on(transport._client._publish_broadcast)
        logger.info('MoQ bot connected: room={} mode={}', args.room, 'jev' if api_key() else 'unconfigured')

    @transport.event_handler('on_error')
    async def on_error(transport, message, error):
        logger.error('MoQ transport failed: {}', message)
        await runner.cancel(reason=message)

    await runner.add_workers(PipelineWorker(
        Pipeline([JevProcessor(actions), transport.input()]),
        enable_rtvi=False,
        idle_timeout_secs=None,
    ))
    await runner.run()


if __name__ == '__main__':
    asyncio.run(main())
