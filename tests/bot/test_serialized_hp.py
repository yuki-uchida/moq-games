"""Cross-language HP contract: real TypeScript serializer -> Python validator.

Run with repository npm dependencies and bot httpx/pydantic installed:
python -m unittest discover -s tests/bot -p test_serialized_hp.py -v
"""
import copy
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'examples/games/tower_diffence_with_jev/bot'))
from jev import validate_state


class SerializedHpTests(unittest.TestCase):
    @staticmethod
    def snapshot(hp, battlefield_version=2):
        return json.loads(subprocess.check_output(
            ['node', str(Path(__file__).with_name('serialize_hp_fixture.cjs')), str(hp), str(battlefield_version)],
            cwd=ROOT, text=True))

    def test_living_fractional_and_normal_hp_remain_exact(self):
        for hp in (0.000001, 48.75 - 7.15 * 2 - 11.44 * 3, 0.4, 0.5, 1.25, 20, 48.75):
            with self.subTest(hp=hp):
                state = self.snapshot(hp)
                self.assertEqual(state['defenders'][0]['hp'], hp)
                self.assertEqual(state['battlefield']['flightTargets'][0]['hp'], hp)
                self.assertEqual(validate_state(state)['defenders'][0]['hp'], hp)

    def test_legacy_wire_accepts_fractional_and_integer_hp(self):
        for hp in (0.4, 20):
            with self.subTest(hp=hp):
                state = self.snapshot(hp, battlefield_version=1)
                self.assertNotIn('battlefield', state)
                self.assertEqual(validate_state(state)['defenders'][0]['hp'], hp)

    def test_zero_hp_is_not_a_flight_target(self):
        state = self.snapshot(0)
        self.assertEqual(state['defenders'][0]['hp'], 0)
        self.assertEqual(state['battlefield']['flightTargets'], [])
        validate_state(state)

    def test_negative_hp_is_preserved_and_rejected(self):
        state = self.snapshot(-0.4)
        self.assertEqual(state['defenders'][0]['hp'], -0.4)
        self.assertEqual(state['battlefield']['flightTargets'], [])
        with self.assertRaises(ValueError):
            validate_state(state)

    def test_flight_target_consistency_is_still_enforced(self):
        state = self.snapshot(0.4)
        for hp in (0, 1.4):
            with self.subTest(defender_hp=hp):
                invalid = copy.deepcopy(state)
                invalid['defenders'][0]['hp'] = hp
                with self.assertRaisesRegex(ValueError, 'Flight target does not match'):
                    validate_state(invalid)


if __name__ == '__main__':
    unittest.main()
