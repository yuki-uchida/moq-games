"""Offline adapter/bridge contracts; not a real Pipecat or relay integration test.

Run from the repository root: python -m unittest discover -s tests/bot -v
Requires the bot's httpx/pydantic dependencies. No .env files are loaded.
"""
import importlib.util
import json
import os
from pathlib import Path
import socket
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

import httpx

BOT = Path(__file__).resolve().parents[2] / 'examples/games/tower_diffence_with_jev/bot'
sys.path.insert(0, str(BOT))
import jev  # noqa: E402


def load_bridge_with_transport_stubs():
    """Import application logic without Pipecat/moq, dotenv loading, or startup."""
    exports = {
        'moq': ['BroadcastProducer'],
        'dotenv': ['load_dotenv'],
        'loguru': ['logger'],
        'pipecat.frames.frames': ['CancelFrame', 'EndFrame', 'Frame', 'InputTransportMessageFrame'],
        'pipecat.pipeline.pipeline': ['Pipeline'],
        'pipecat.pipeline.worker': ['PipelineWorker'],
        'pipecat.processors.frame_processor': ['FrameDirection', 'FrameProcessor'],
        'pipecat.transports.moq.transport': ['MOQParams', 'MOQTransport'],
        'pipecat.workers.runner': ['WorkerRunner'],
    }
    modules = {}
    for name, attributes in exports.items():
        module = ModuleType(name)
        for attribute in attributes:
            setattr(module, attribute, Mock() if attribute in ('load_dotenv', 'logger')
                    else type(attribute, (), {}))
        modules[name] = module
    spec = importlib.util.spec_from_file_location('tower_bot_offline_test', BOT / 'app.py')
    app = importlib.util.module_from_spec(spec)
    modules[spec.name] = app
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(app)
    return app


app = load_bridge_with_transport_stubs()


class OfflineBotTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # Even an accidental fallback to real HTTP must fail before opening a socket.
        self.enterContext(patch.object(socket.socket, 'connect', side_effect=AssertionError('Network forbidden')))
        self.enterContext(patch.object(socket.socket, 'connect_ex', side_effect=AssertionError('Network forbidden')))
        self.enterContext(patch.dict(os.environ, {'JEV_API_KEY': '', 'TYPESAFE_API_KEY': ''}))
        self.options = {'wait': {'type': 'wait', 'unitType': 'slime', 'boss': False}}

    def test_credentials_come_only_from_environment(self):
        self.assertEqual(jev.api_key(), '')
        with patch.dict(os.environ, {'JEV_API_KEY': ' test-only ', 'TYPESAFE_API_KEY': 'fallback-only'}):
            self.assertEqual(jev.api_key(), 'test-only')
        with patch.dict(os.environ, {'TYPESAFE_API_KEY': 'fallback-only'}):
            self.assertEqual(jev.api_key(), 'fallback-only')

    def test_example_contains_no_credential_value(self):
        values = dict(line.split('=', 1) for line in (BOT / '.env.example').read_text().splitlines()
                      if line.strip() and not line.lstrip().startswith('#'))
        self.assertEqual(set(values), {'JEV_API_KEY', 'JEV_MODEL'})
        self.assertEqual(values['JEV_API_KEY'], '')
        self.assertEqual(values['JEV_MODEL'], 'jev-latest')

    async def test_missing_key_never_calls_adapter(self):
        adapter = SimpleNamespace(decide=AsyncMock(side_effect=AssertionError('Must not call Jev')))
        processor = SimpleNamespace(respond=Mock())
        envelope = SimpleNamespace(state={}, requestId='1')
        await app.JevProcessor.decide(processor, envelope, SimpleNamespace(adapter=adapter))
        adapter.decide.assert_not_awaited()
        response = processor.respond.call_args.args[1]
        self.assertEqual(response['source'], 'jev-unconfigured')
        self.assertEqual(response['status'], 'not-configured')

    async def test_mocked_http_choice_round_trip(self):
        requests = []
        def respond(request):
            requests.append(request)
            return httpx.Response(200, json={'answers': {'move': {
                'type': 'choice', 'choice': 'wait', 'confidence': 0.8, 'probabilities': {'wait': 1.0}}}})
        adapter = jev.ChoiceAdapter(httpx.MockTransport(respond))
        with patch.dict(os.environ, {'JEV_API_KEY': 'test-only'}):
            result = await adapter.request_choice({'test': 'offline'}, self.options, 'move')
        self.assertEqual(len(requests), 1)
        self.assertEqual(str(requests[0].url), jev.ENDPOINT)
        self.assertEqual(requests[0].headers['Authorization'], 'Bearer test-only')
        self.assertEqual(json.loads(requests[0].content), {'test': 'offline'})
        self.assertEqual(result['action'], self.options['wait'])
        self.assertEqual(result['probabilityEvidence']['status'], 'complete')

    async def test_unknown_choice_is_rejected(self):
        adapter = jev.ChoiceAdapter(httpx.MockTransport(lambda _: httpx.Response(200, json={
            'answers': {'move': {'type': 'choice', 'choice': 'illegal', 'confidence': 1.0}}})))
        with self.assertRaisesRegex(ValueError, 'outside the legal set'):
            await adapter.request_choice({}, self.options, 'move')

    async def test_rate_limit_sets_bounded_backoff(self):
        adapter = jev.ChoiceAdapter(httpx.MockTransport(lambda _: httpx.Response(
            429, headers={'Retry-After': '9999'})), clock=lambda: 100)
        result = await adapter.request_choice({}, self.options, 'move')
        self.assertEqual(result['status'], 'backoff')
        self.assertEqual(adapter.retry_at, 400)

    async def test_no_legal_options_never_requests_http(self):
        adapter = jev.ChoiceAdapter(httpx.MockTransport(lambda _: self.fail('Unexpected HTTP')))
        result = await adapter.choose({}, {})
        self.assertEqual(result['status'], 'no-legal-actions')

    def test_action_track_publishes_ready_and_json(self):
        broadcast = Mock()
        publisher = app.ActionPublisher()
        publisher.publish_on(broadcast)
        publisher.send({'requestId': '1', 'source': 'jev-unconfigured'})
        broadcast.publish_track.assert_called_once_with('action')
        track = broadcast.publish_track.return_value
        groups = track.create_group.call_args_list
        self.assertEqual(groups[1].args[0], groups[0].args[0] + 1)
        frames = track.create_group.return_value.write_frame.call_args_list
        self.assertEqual(json.loads(frames[0].args[0]), {'ready': True})
        self.assertEqual(json.loads(frames[1].args[0])['requestId'], '1')
        self.assertEqual(track.create_group.return_value.finish.call_count, 2)

    def test_default_room_and_tls_verification(self):
        with patch.object(sys, 'argv', ['app.py']):
            args = app.parse_args()
        self.assertEqual(args.room, 'mossvale')
        self.assertEqual(args.relay_url, 'https://127.0.0.1:4433')
        self.assertFalse(args.insecure)


if __name__ == '__main__':
    unittest.main()
