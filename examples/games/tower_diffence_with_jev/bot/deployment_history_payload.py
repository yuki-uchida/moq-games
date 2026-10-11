"""Bound only outgoing tactical history; current board facts/actions never shrink.

This is deliberate historical summarization, separate from lossless criterion
sharing. No HTTP happens here, and canonical input objects are never changed.
"""
import copy
from decimal import Decimal

from choice_payload import compact_deployment_payload, deployment_prompt_budget, encoded, expand_combat_board

BUCKETS = ('events', 'priorResults', 'deployments', 'contributors', 'enemyOutcomes', 'damageTrends')
HISTORY_CONTEXT_SCOPE = ('Only historical records were reduced for this request. Omitted evidence remains unknown; '
                         'current board facts and all choices are unchanged. Dropped contributors count summary rows, not necessarily raw hits.')


def bucket_counts(history):
    return {key: len(history.get(key, [])) for key in BUCKETS}


def history_summary(original, current, mode, reason=None):
    before, kept = bucket_counts(original), bucket_counts(current)
    return {'version': 1, 'mode': mode, 'reason': reason,
            'originalHistoryBytes': len(encoded(original)) if original else 0,
            'sentHistoryBytes': len(encoded(current)) if current else 0,
            'kept': kept, 'dropped': {key: before[key] - kept[key] for key in BUCKETS}}


def discard_oldest_record(history):
    """Drop one approved record, preserving latest outcome and every damage trend."""
    candidates = [(history[key][-1]['at' if key == 'events' else 'lastEventAt'], index, key)
                  for index, key in enumerate(('events', 'priorResults', 'deployments')) if history[key]]
    if candidates:
        history[min(candidates)[2]].pop()
    elif history['contributors']:
        removed = history['contributors'].pop()
        history['omissions']['contributions'] += 1
        # Decimal addition avoids creating spurious binary tails in the wire.
        history['omissions']['damage'] = float(Decimal(str(history['omissions']['damage'])) +
                                               Decimal(str(removed['damage'])))
    elif len(history['enemyOutcomes']) > 1:
        history['enemyOutcomes'].pop()
        history['omissions']['outcomes'] += 1
    else:
        return False
    history['truncated'] = True
    return True


def fit_deployment_payload(payload, validate_board, compact=compact_deployment_payload):
    """Return (candidate payload, budget, summary); caller sends at most once.

    A fitting full payload is unchanged. If only older historical detail makes
    a v2 request too large, a separately marked outgoing copy is reduced and
    validated after every removal. Protected-history overflow stays unavailable.
    """
    validate_board(payload['state']['board'])
    candidate = compact(payload)
    budget = deployment_prompt_budget(candidate)
    original = payload['state']['board'].get('tacticalHistory') or {}
    summary = history_summary(original, original, 'full')
    if budget['allowed']:
        return candidate, budget, summary
    if original.get('version') != 2:
        summary.update(mode='not-sent', reason='prompt-budget', sentHistoryBytes=0,
                       candidateHistoryBytes=summary['originalHistoryBytes'])
        return candidate, budget, summary

    # Criteria references never touch tactical history, so compact exactly once.
    working = copy.deepcopy(candidate)
    current = working['state']['board']['tacticalHistory']
    while True:
        previous = copy.deepcopy(current)
        if not discard_oldest_record(current):
            break
        summary = history_summary(original, current, 'summarized', 'prompt-budget')
        try:
            validate_board(expand_combat_board(working['state']['board'], working['state']['optionContext']))
        except ValueError:
            # Invalid transformations never reach HTTP or justify deleting more
            # evidence. The valid canonical board remains available to Rule.
            working['state']['board']['tacticalHistory'] = previous
            current = previous
            summary = history_summary(original, current, 'not-sent', 'prompt-budget')
            summary.update(sentHistoryBytes=0, candidateHistoryBytes=len(encoded(current)),
                           blockedBy='invalid-reduced-board')
            return candidate, budget, summary
        working['state']['historySummaryContext'] = {**summary, 'scope': HISTORY_CONTEXT_SCOPE}
        candidate = working
        budget = deployment_prompt_budget(candidate)
        if budget['allowed']:
            return candidate, budget, summary

    summary = history_summary(original, current, 'not-sent', 'prompt-budget')
    summary.update(sentHistoryBytes=0, candidateHistoryBytes=len(encoded(current)),
                   blockedBy='protected-history-overflow')
    return candidate, budget, summary
