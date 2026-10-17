# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# SPDX-License-Identifier: MIT
# pyright: reportUnknownVariableType=false, reportUnknownArgumentType=false, reportUnknownMemberType=false
"""Permanent, quote-backed holdings for Loophole Republic Court V5."""

from genlayer import *
from dataclasses import dataclass
from typing import NoReturn
import datetime
import json


CONTRACT_VERSION = "1.0.0"
POLICY_VERSION = "LOOPHOLE_CASE_LAW_V1"
ERROR_EXPECTED = "[EXPECTED]"
ZERO_ADDRESS = Address(b"\x00" * 20)
MAX_LAW_IDS_JSON_CHARS = 512
MAX_LAW_IDS = 16
MAX_HOLDINGS_PER_LAW = 65
MIN_QUOTE_CHARS = 8
MAX_QUOTE_CHARS = 240

LABEL_COVERED_BREACH = "COVERED_BREACH"
LABEL_COVERED_COMPLIANT = "COVERED_COMPLIANT"
LABEL_NOT_COVERED = "NOT_COVERED"
_HOLDING_LABELS = (LABEL_COVERED_BREACH, LABEL_COVERED_COMPLIANT, LABEL_NOT_COVERED)


@allow_storage
@dataclass
class Holding:
    key: str
    law_id: u256
    action_type: str
    target_class: str
    label: str
    quote: str
    case_id: u256
    ruling_digest: str
    recorded_at: u256


def _expected(code: str) -> NoReturn:
    raise gl.vm.UserError(f"{ERROR_EXPECTED} {code}")


def _no_value() -> None:
    if gl.message.value != 0:
        _expected("VALUE")


def _holding_key(law_id: int, action_type: str, target_class: str) -> str:
    return f"{law_id}|{action_type}|{target_class}"


def _canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _now_epoch() -> int:
    return int(datetime.datetime.now(datetime.timezone.utc).timestamp())


def _parse_law_ids(value: str) -> list[int]:
    if not isinstance(value, str) or len(value) > MAX_LAW_IDS_JSON_CHARS:
        _expected("LAW_IDS_JSON")
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError, RecursionError):
        _expected("LAW_IDS_JSON")
    if not isinstance(parsed, list) or len(parsed) > MAX_LAW_IDS:
        _expected("LAW_IDS")
    result: list[int] = []
    for law_id in parsed:
        if isinstance(law_id, bool) or not isinstance(law_id, int) or law_id < 1 or law_id in result:
            _expected("LAW_IDS")
        result.append(law_id)
    return result


class CaseLaw(gl.Contract):
    owner: Address
    court_address: Address
    holdings: TreeMap[str, Holding]
    law_holding_keys: TreeMap[u256, str]
    holding_by_case: TreeMap[u256, str]
    holding_count: u256
    safe_harbor_count: u256
    breach_count: u256
    compliant_count: u256

    def __init__(self):
        _no_value()
        self.owner = gl.message.sender_address
        self.court_address = ZERO_ADDRESS
        self.holding_count = u256(0)
        self.safe_harbor_count = u256(0)
        self.breach_count = u256(0)
        self.compliant_count = u256(0)

    @gl.public.write
    def set_court(self, court_address: Address) -> None:
        _no_value()
        if gl.message.sender_address != self.owner:
            _expected("OWNER_ONLY")
        if self.court_address != ZERO_ADDRESS:
            _expected("COURT_ALREADY_SET")
        if court_address == ZERO_ADDRESS:
            _expected("ZERO_COURT")
        self.court_address = court_address

    @gl.public.write
    def record_holding(
        self,
        key: str,
        law_id: int,
        action_type: str,
        target_class: str,
        label: str,
        quote: str,
        case_id: int,
        ruling_digest: str,
    ) -> None:
        _no_value()
        if self.court_address == ZERO_ADDRESS or gl.message.sender_address != self.court_address:
            _expected("COURT_ONLY")
        if law_id < 1 or case_id < 1 or key != _holding_key(law_id, action_type, target_class):
            _expected("HOLDING_KEY_MISMATCH")
        if label not in _HOLDING_LABELS:
            _expected("HOLDING_LABEL")
        if not isinstance(quote, str) or not MIN_QUOTE_CHARS <= len(quote) <= MAX_QUOTE_CHARS:
            _expected("HOLDING_QUOTE")
        if not isinstance(ruling_digest, str) or len(ruling_digest) != 64:
            _expected("RULING_DIGEST")
        if key in self.holdings:
            previous = self.holdings[key]
            if int(previous.case_id) == case_id and previous.ruling_digest == ruling_digest:
                return
            _expected("HOLDING_CONFLICT")
        if case_id in self.holding_by_case:
            _expected("HOLDING_CONFLICT")

        law_key_json = self.law_holding_keys[u256(law_id)] if u256(law_id) in self.law_holding_keys else "[]"
        try:
            law_keys = json.loads(law_key_json)
        except (TypeError, ValueError, RecursionError):
            _expected("LAW_HOLDING_STATE")
        if not isinstance(law_keys, list) or len(law_keys) >= MAX_HOLDINGS_PER_LAW:
            _expected("LAW_HOLDING_LIMIT")
        law_keys.append(key)
        law_keys.sort()

        self.holdings[key] = Holding(
            key=key,
            law_id=u256(law_id),
            action_type=action_type,
            target_class=target_class,
            label=label,
            quote=quote,
            case_id=u256(case_id),
            ruling_digest=ruling_digest,
            recorded_at=u256(_now_epoch()),
        )
        self.law_holding_keys[u256(law_id)] = _canonical_json(law_keys)
        self.holding_by_case[u256(case_id)] = key
        self.holding_count += 1
        if label == LABEL_NOT_COVERED:
            self.safe_harbor_count += 1
        elif label == LABEL_COVERED_BREACH:
            self.breach_count += 1
        else:
            self.compliant_count += 1

    def _holding_view(self, holding: Holding) -> dict:
        return {
            "key": holding.key,
            "law_id": int(holding.law_id),
            "action_type": holding.action_type,
            "target_class": holding.target_class,
            "label": holding.label,
            "quote": holding.quote,
            "case_id": int(holding.case_id),
            "ruling_digest": holding.ruling_digest,
            "recorded_at": int(holding.recorded_at),
        }

    @gl.public.view
    def get_holding(self, key: str) -> dict:
        return self._holding_view(self.holdings[key]) if key in self.holdings else {}

    @gl.public.view
    def get_holding_for_case(self, case_id: int) -> dict:
        key = self.holding_by_case[u256(case_id)] if u256(case_id) in self.holding_by_case else ""
        return self.get_holding(key) if key else {}

    @gl.public.view
    def get_holdings_for_laws(self, law_ids_json: str) -> list[dict]:
        result: list[dict] = []
        keys: list[str] = []
        for law_id in _parse_law_ids(law_ids_json):
            stored = self.law_holding_keys[u256(law_id)] if u256(law_id) in self.law_holding_keys else "[]"
            try:
                parsed = json.loads(stored)
            except (TypeError, ValueError, RecursionError):
                _expected("LAW_HOLDING_STATE")
            if not isinstance(parsed, list):
                _expected("LAW_HOLDING_STATE")
            for key in parsed:
                if isinstance(key, str) and key in self.holdings:
                    keys.append(key)
        for key in sorted(keys):
            result.append(self._holding_view(self.holdings[key]))
        return result

    @gl.public.view
    def get_registry_summary(self) -> dict:
        return {
            "holding_count": int(self.holding_count),
            "safe_harbor_count": int(self.safe_harbor_count),
            "breach_count": int(self.breach_count),
            "compliant_count": int(self.compliant_count),
            "court_address": self.court_address,
            "contract_version": CONTRACT_VERSION,
            "policy_version": POLICY_VERSION,
        }
