"""Offline catalog/schema contracts for the three additional ground enemies."""
from pathlib import Path
import sys
from typing import get_args
import unittest
from pydantic import ValidationError

BOT = Path(__file__).resolve().parents[2] / 'examples/games/tower_diffence_with_jev/bot'
sys.path.insert(0, str(BOT))
import jev
from combat_context import ENEMY_COMBAT, ENEMY_CONTACT_CUES, candidate_combat


class EnemyCatalogTests(unittest.TestCase):
    def test_base_stats_and_literal_catalog_agree(self):
        expected = {
            'crystalSentinel': (170, 10, 56, 48, .7, 3, 6, 4),
            'koboldLancer': (112, 11, 84, 80, .8, 2, 4, 2),
            'clockworkPatchling': (155, 7, 62, 44, .7, 3, 5, 4),
        }
        self.assertEqual(set(get_args(jev.ENEMY_TYPES)), set(jev.UNIT_STATS))
        self.assertEqual(len(jev.UNIT_STATS), 13)
        for name, values in expected.items():
            with self.subTest(name=name):
                self.assertEqual(tuple(jev.UNIT_STATS[name][key] for key in
                                       ('hp', 'attack', 'speed', 'range', 'attackSpeed', 'cost', 'cooldown', 'unlockStage')), values)
                self.assertNotIn(name, jev.AIRBORNE_TYPES)

    def test_authored_timing_retains_unscaled_cadence(self):
        for name, duration, cue in (('crystalSentinel', 1.5, .8666666667),
                                    ('koboldLancer', 1.2, .6333333333),
                                    ('clockworkPatchling', 1.2, .8)):
            with self.subTest(name=name):
                stats = jev.UNIT_STATS[name]
                combat = candidate_combat(name, stats)
                self.assertEqual(ENEMY_COMBAT[name], (0, duration, 'contact'))
                self.assertEqual(ENEMY_CONTACT_CUES[name], cue)
                self.assertEqual(combat['attackMode'], 'contact')
                self.assertFalse(combat['airborne'])
                walk = max(.35, min(.65, 28 / stats['speed']))
                self.assertAlmostEqual(combat['attackInterval'],
                                       2 * max(1 / stats['attackSpeed'] + .15, duration + walk))

    def test_enemy_collection_caps_only(self):
        names = list(jev.UNIT_STATS)
        field = jev.FieldState.model_validate({'id': 'meadow', 'pathLength': 100.,
                                              'weights': dict.fromkeys(names, 1.)})
        self.assertEqual(len(field.weights), 13)
        wave = jev.WaveState.model_validate({'enemyCount': 13, 'strength': 1., 'spawnInterval': 1.,
                                            'reward': 1, 'enemyTypes': names, 'spawnBudget': 100,
                                            'bossType': None, 'spawned': 0, 'resolved': 0,
                                            'budgetRemaining': 100})
        self.assertEqual(len(wave.enemyTypes), 13)
        for cls, key in ((jev.FieldState, 'weights'), (jev.WaveState, 'enemyTypes'),
                         (jev.GameState, 'cooldowns')):
            self.assertEqual(next(meta.max_length for meta in cls.model_fields[key].metadata
                                  if hasattr(meta, 'max_length')), 13)
        self.assertEqual(jev.MAX_FLIGHT_TARGETS, 10)
        self.assertEqual(len(get_args(jev.ALLY_TYPES)), 10)
        with self.assertRaises(ValidationError):
            jev.FieldState.model_validate({'id': 'meadow', 'pathLength': 100., 'weights': {'unknown': 1.}})

    def test_spawn_scaling_and_enemy_clock_are_separate(self):
        state = {'stage': 4, 'wave': {'strength': 1.3}, 'combatObservation': {'version': 1}}
        for name in ENEMY_CONTACT_CUES:
            with self.subTest(name=name):
                base = jev.UNIT_STATS[name]
                stats = jev.spawn_stats(name, state)
                self.assertAlmostEqual(stats['hp'], base['hp'] * 1.3)
                self.assertAlmostEqual(stats['attack'], base['attack'] * 1.3 * 1.3)
                self.assertEqual(stats['range'], base['range'])
                self.assertFalse(stats['airborne'])
                accelerated = jev.spawn_stats(name, {**state, 'enemyActionTimeScale': .8})
                self.assertEqual(accelerated['attackInterval'], stats['attackInterval'])
                boss = jev.spawn_stats(name, state, boss=True)
                self.assertEqual(boss['cost'], 5)
                self.assertAlmostEqual(boss['range'], base['range'] * 1.25)


if __name__ == '__main__':
    unittest.main()
