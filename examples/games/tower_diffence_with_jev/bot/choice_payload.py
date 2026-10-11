"""Lossless shared facts for deployment Choice requests; no action filtering.

The byte guard is a local transport/prompt safety policy, not a claim to know
Jev's tokenizer. Official context limits still apply at the provider. Oversize
requests fail locally so the caller can use its fresh Rule decision instead.
"""

import copy
import json
import math


MAX_PROMPT_BYTES = 84_000
MAX_REQUEST_BYTES = 96_000
MAX_CHOICE_OPTIONS = 255
REFERENCE_RULE = (
    'Shared criteria version1: resolve membersRef and routeRef in '
    'state.optionContext.members/routes. A member unitRef resolves in '
    'state.rules.unitStats. Resolve mission.targetRef by id in '
    'state.board.battlefield.flightTargets, and tacticRef by key in '
    'state.board.tacticalOptions. These references retain the complete facts; '
    'they are not unknown values. Choose only the exact listed action.'
)

COMBAT_REFERENCE_RULE = (
    'Combat sharing v1: each board unit.combat movementRef resolves exactly in '
    'state.optionContext.movements; committedActionRef resolves exactly in '
    'state.optionContext.committedActions. These are complete observed facts, '
    'not omitted/unknown values. Reconstruct them before evaluating current units.'
)


def compact_combat_facts(state):
    """Intern only identical repeated observations; unequal clocks stay inline."""
    board, context = state['board'], state['optionContext']
    if board.get('combatObservation', {}).get('version') != 1:
        return False
    shared = False
    for field, table, prefix in (('movement', 'movements', 'v'), ('committedAction', 'committedActions', 'a')):
        groups = {}
        for unit in board.get('defenders', []) + board.get('enemies', []):
            combat = unit.get('combat') or {}
            if field in combat:
                signature = json.dumps(combat[field], sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
                groups.setdefault(signature, []).append(combat)
        values = {}
        for signature, entries in groups.items():
            if len(entries) < 2:
                continue
            key = f'{prefix}{len(values)}'
            values[key] = copy.deepcopy(entries[0][field])
            for combat in entries:
                del combat[field]
                combat[field + 'Ref'] = key
        if values:
            context[table] = values
            shared = True
    return shared


def expand_combat_board(board, context):
    """Expand only board facts, including before reduced-history revalidation."""
    result = copy.deepcopy(board)
    if ({'movements', 'committedActions'} & context.keys()) and result.get('combatObservation', {}).get('version') != 1:
        raise ValueError('Combat sharing requires observation version1')
    for unit in result.get('defenders', []) + result.get('enemies', []):
        combat = unit.get('combat') or {}
        for field, table in (('movement', 'movements'), ('committedAction', 'committedActions')):
            reference = field + 'Ref'
            if reference not in combat:
                continue
            key = combat.pop(reference)
            values = context.get(table, {})
            if field in combat or not isinstance(key, str) or not isinstance(values, dict) or key not in values:
                raise ValueError('Invalid or conflicting combat reference')
            if not isinstance(values[key], dict):
                raise ValueError('Invalid or conflicting combat reference')
            combat[field] = copy.deepcopy(context[table][key])
    return result


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def same_facts(left, right):
    # Python equality conflates true/1 and 1/1.0; do not erase JSON value types.
    return json.dumps(left, sort_keys=True, allow_nan=False) == json.dumps(right, sort_keys=True, allow_nan=False)


def compact_deployment_payload(payload):
    """Return a new request with identical criteria, represented by references."""
    result = copy.deepcopy(payload)
    state = result['state']
    if 'optionContext' in state:
        raise ValueError('Deployment optionContext already exists')
    question = result['questions']['deployment']
    criteria = question['criteria']
    if not 1 <= len(criteria) <= MAX_CHOICE_OPTIONS:
        raise ValueError('Deployment Choice cardinality is outside the documented limit')
    members, routes, member_keys, route_keys = {}, {}, {}, {}
    board = state['board']
    unit_stats = state['rules']['unitStats']
    targets = {row['id']: row for row in (board.get('battlefield') or {}).get('flightTargets', [])}
    tactics = {row['key']: row for row in board.get('tacticalOptions', [])}

    def intern(value, rows, keys, prefix):
        signature = json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True, allow_nan=False)
        if signature not in keys:
            key = f'{prefix}{len(rows)}'
            keys[signature] = key
            rows[key] = copy.deepcopy(value)
        return keys[signature]

    for key, row in criteria.items():
        deployment = row.pop('members')
        for member in deployment:
            role = member.get('unitType')
            if 'unit' in member and role in unit_stats and same_facts(member['unit'], unit_stats[role]):
                del member['unit']
                member['unitRef'] = role
        row['membersRef'] = intern(deployment, members, member_keys, 'm')
        if 'route' in row:
            row['routeRef'] = intern(row.pop('route'), routes, route_keys, 'r')
        mission = row.get('mission', {})
        target = mission.get('target')
        if isinstance(target, dict) and target.get('id') in targets and same_facts(targets[target['id']], target):
            mission['targetRef'] = target['id']
            del mission['target']
        if key in tactics and same_facts(row.get('tactic'), tactics[key]):
            del row['tactic']
            row['tacticRef'] = key
    state['optionContext'] = {'version': 1, 'members': members, 'routes': routes}
    question['instructions'] += ' ' + REFERENCE_RULE
    unshared = copy.deepcopy(state)
    if compact_combat_facts(state):
        suffix = ' ' + COMBAT_REFERENCE_RULE
        if len(encoded(state)) + len(suffix.encode('utf-8')) < len(encoded(unshared)):
            question['instructions'] += suffix
        else:
            result['state'] = unshared
    return result


def expand_deployment_payload(payload):
    """Strict reference expansion for contract tests and offline diagnostics."""
    result = copy.deepcopy(payload)
    state = result['state']
    context = state.pop('optionContext')
    if context['version'] != 1:
        raise ValueError('Unknown shared criteria version')
    board = expand_combat_board(state['board'], context)
    state['board'] = board
    targets = {row['id']: row for row in (board.get('battlefield') or {}).get('flightTargets', [])}
    tactics = {row['key']: row for row in board.get('tacticalOptions', [])}
    question = result['questions']['deployment']
    if {'movements', 'committedActions'} & context.keys():
        combat_suffix = ' ' + COMBAT_REFERENCE_RULE
        if not question['instructions'].endswith(combat_suffix):
            raise ValueError('Combat sharing instructions do not match')
        question['instructions'] = question['instructions'][:-len(combat_suffix)]
    suffix = ' ' + REFERENCE_RULE
    if not question['instructions'].endswith(suffix):
        raise ValueError('Shared criteria instructions do not match')
    question['instructions'] = question['instructions'][:-len(suffix)]
    for row in question['criteria'].values():
        row['members'] = copy.deepcopy(context['members'][row.pop('membersRef')])
        for member in row['members']:
            if 'unitRef' in member:
                member['unit'] = copy.deepcopy(state['rules']['unitStats'][member.pop('unitRef')])
        if 'routeRef' in row:
            row['route'] = copy.deepcopy(context['routes'][row.pop('routeRef')])
        mission = row.get('mission', {})
        if 'targetRef' in mission:
            mission['target'] = copy.deepcopy(targets[mission.pop('targetRef')])
        if 'tacticRef' in row:
            row['tactic'] = copy.deepcopy(tactics[row.pop('tacticRef')])
    return result


def deployment_prompt_budget(payload):
    """Bound bytes and expose an explicitly approximate token estimate.

    84 KB corresponds to 28k at the conservative three-bytes/token heuristic,
    leaving nominal headroom under the documented 32k state+question budget.
    This is NOT an exact tokenizer check; provider validation remains final.
    """
    question = payload['questions']['deployment']
    prompt_bytes = len(encoded(payload['state'])) + len(encoded(question))
    request_bytes = len(encoded(payload))
    choice_count = len(question['criteria'])
    return {
        'allowed': (1 <= choice_count <= MAX_CHOICE_OPTIONS and
                    prompt_bytes <= MAX_PROMPT_BYTES and request_bytes <= MAX_REQUEST_BYTES),
        'stateQuestionBytes': prompt_bytes,
        'requestBytes': request_bytes,
        'choiceCount': choice_count,
        'estimatedTokens': math.ceil(prompt_bytes / 3),
        'tokenEstimateExact': False,
        'tokenEstimateBasis': 'ceil(UTF-8 bytes / 3); provider tokenizer is not available',
        'maximumPromptBytes': MAX_PROMPT_BYTES,
        'maximumRequestBytes': MAX_REQUEST_BYTES,
    }
