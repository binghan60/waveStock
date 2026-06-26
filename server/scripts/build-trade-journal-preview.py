import argparse
import json
import os
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import shioaji as sj


TAIPEI_OFFSET = "+08:00"
DATE_HEADER = re.compile(r"^(?P<date>\d{4}\.\d{2}\.\d{2})\s+星期")
MESSAGE_HEADER = re.compile(
    r"^(?P<time>\d{2}:\d{2})\s+大華國際投顧\s+(?P<sender>.+?)\s*$"
)
STOCK_MENTION = re.compile(
    r"(?P<name>[\u3400-\u9fffA-Za-z0-9*._-]+)\s*[（(]\s*(?P<code>\d{4,6})\s*[）)]"
)
TRADE_PATTERNS = (
    (
        "sell_half",
        "sell",
        0.5,
        re.compile(
            r"市價[^，。\n]{0,14}(?:獲利|賣出|出場)[^，。\n]{0,8}一半"
            r"|(?:我們)?先(?:市價)?[^，。\n]{0,8}(?:獲利|賣出|出場|入袋)[^，。\n]{0,8}一半"
            r"|賣出一半"
            r"|一半部位"
        ),
    ),
    (
        "sell_all",
        "sell",
        1.0,
        re.compile(
            r"剩餘部位[^，。\n]{0,12}(?:出場|賣出)"
            r"|全數[^，。\n]{0,12}(?:出場|賣出)"
            r"|市價賣出收回資金"
            r"|市價[^，。\n]{0,8}賣出(?!一半)"
            r"|全部出場"
            r"|清倉"
        ),
    ),
    ("buy", "buy", 1.0, re.compile(r"市價\s*買進|轉入|換股")),
)


def normalize_stock_name(name: str) -> str:
    return re.sub(r"^(?:將資金轉入|轉入|換股)", "", name).strip("-_. 　")

@dataclass
class TradeCandidate:
    occurred_at: str
    sender_name: str
    code: str
    name: str
    trade_type: str
    action: str
    fraction: float
    raw_text: str
    source_line: str
    price: Optional[float] = None
    price_source: str = "unknown"
    market_timestamp: Optional[str] = None
    pricing_rule: str = "first_tick_from_next_minute"
    status: str = "pending"
    warning: Optional[str] = None


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def parse_line_export(path: Path) -> list[TradeCandidate]:
    candidates = []
    current_date = None
    current_time = None
    current_sender = None
    message_lines = []

    def flush_message() -> None:
        if not current_date or not current_time or not current_sender:
            return
        if "綸(菁英)" not in current_sender:
            return

        raw_text = "\n".join(message_lines).strip()
        occurred_at = datetime.strptime(
            f"{current_date} {current_time}", "%Y.%m.%d %H:%M"
        )
        for source_line in message_lines:
            line = source_line.strip()
            if not line:
                continue
            mentions = list(STOCK_MENTION.finditer(line))
            if not mentions:
                continue

            for index, mention in enumerate(mentions):
                segment_start = mentions[index - 1].end() if index > 0 else 0
                segment_end = mentions[index + 1].start() if index + 1 < len(mentions) else len(line)
                segment = line[segment_start:segment_end]
                matched_trade = next(
                    (
                        (trade_type, action, fraction)
                        for trade_type, action, fraction, pattern in TRADE_PATTERNS
                        if pattern.search(segment)
                    ),
                    None,
                )
                if not matched_trade:
                    continue

                trade_type, action, fraction = matched_trade
                candidates.append(
                    TradeCandidate(
                        occurred_at=f"{occurred_at.isoformat()}{TAIPEI_OFFSET}",
                        sender_name=current_sender,
                        code=mention.group("code"),
                        name=normalize_stock_name(mention.group("name")),
                        trade_type=trade_type,
                        action=action,
                        fraction=fraction,
                        raw_text=raw_text,
                        source_line=line,
                    )
                )

    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        date_match = DATE_HEADER.match(raw_line)
        if date_match:
            flush_message()
            current_date = date_match.group("date")
            current_time = None
            current_sender = None
            message_lines = []
            continue

        message_match = MESSAGE_HEADER.match(raw_line)
        if message_match:
            flush_message()
            current_time = message_match.group("time")
            current_sender = message_match.group("sender")
            message_lines = []
            continue

        if current_time and current_sender:
            message_lines.append(raw_line)

    flush_message()
    return candidates


def load_supplements(path: Path) -> list[TradeCandidate]:
    if not path.exists():
        return []
    records = json.loads(path.read_text(encoding="utf-8-sig"))
    return [
        TradeCandidate(
            occurred_at=record["occurred_at"],
            sender_name=record["sender_name"],
            code=record["code"],
            name=record["name"],
            trade_type=record["trade_type"],
            action=record["action"],
            fraction=float(record["fraction"]),
            raw_text=record["raw_text"],
            source_line=record["source_line"],
        )
        for record in records
    ]


def validate_position_sequence(candidates: list[TradeCandidate]) -> None:
    positions = {}
    for candidate in candidates:
        if candidate.status == "duplicate":
            continue
        quantity = positions.get(candidate.code, 0.0)
        if candidate.action == "buy":
            positions[candidate.code] = quantity + 1.0
            continue

        if quantity <= 0:
            candidate.status = "sequence_warning"
            candidate.warning = "sell_without_prior_buy_in_export"
            continue

        sold = quantity * candidate.fraction
        positions[candidate.code] = max(0.0, quantity - sold)


def mark_duplicate_messages(candidates: list[TradeCandidate]) -> None:
    last_seen = {}
    for candidate in candidates:
        key = (candidate.code, candidate.trade_type, candidate.source_line)
        occurred_at = datetime.fromisoformat(candidate.occurred_at)
        previous = last_seen.get(key)
        if previous and occurred_at - previous <= timedelta(minutes=2):
            candidate.status = "duplicate"
            candidate.warning = "duplicate_message"
        else:
            last_seen[key] = occurred_at


def login_shioaji(env_path: Path):
    load_env(env_path)
    api_key = os.environ.get("SJ_API_KEY")
    secret_key = os.environ.get("SJ_SEC_KEY")
    if not api_key or not secret_key:
        raise RuntimeError("SJ_API_KEY and SJ_SEC_KEY are required")

    api = sj.Shioaji()
    api.login(api_key=api_key, secret_key=secret_key, fetch_contract=True)
    return api


def get_first_tick_after_message(api, candidate: TradeCandidate) -> None:
    occurred_at = datetime.fromisoformat(candidate.occurred_at)
    query_start = occurred_at.replace(second=0, microsecond=0) + timedelta(minutes=1)
    query_end = min(
        query_start + timedelta(minutes=5),
        query_start.replace(hour=13, minute=30),
    )

    contract = api.Contracts.Stocks.get(candidate.code)
    if contract is None:
        candidate.status = "market_data_error"
        candidate.warning = "stock_contract_not_found"
        return

    ticks = api.ticks(
        contract=contract,
        date=query_start.strftime("%Y-%m-%d"),
        query_type=sj.TicksQueryType.RangeTime,
        time_start=query_start.strftime("%H:%M:%S"),
        time_end=query_end.strftime("%H:%M:%S"),
        timeout=15000,
    )
    rows = ticks.dict()
    timestamps = rows.get("ts", [])
    prices = rows.get("close", [])
    if not timestamps or not prices:
        candidate.status = "market_data_missing"
        candidate.warning = "no_tick_within_five_minutes"
        return

    # Shioaji encodes Taiwan wall-clock time in the epoch-like nanosecond value.
    tick_time = datetime.fromtimestamp(
        int(timestamps[0]) / 1_000_000_000,
        tz=timezone.utc,
    ).replace(tzinfo=None)
    candidate.price = float(prices[0])
    candidate.price_source = "shioaji_tick"
    candidate.market_timestamp = f"{tick_time.isoformat()}{TAIPEI_OFFSET}"
    candidate.status = (
        "priced_with_warning" if candidate.warning is not None else "ready"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("line_export", type=Path)
    parser.add_argument(
        "--env",
        type=Path,
        default=Path(__file__).resolve().parents[1] / ".env",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "trade-journal-preview.json",
    )
    parser.add_argument(
        "--supplements",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "trade-journal-supplements.json",
    )
    parser.add_argument("--parse-only", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    candidates = parse_line_export(args.line_export.resolve())
    candidates.extend(load_supplements(args.supplements.resolve()))
    candidates.sort(key=lambda item: datetime.fromisoformat(item.occurred_at))
    mark_duplicate_messages(candidates)
    validate_position_sequence(candidates)
    if args.limit > 0:
        candidates = candidates[: args.limit]

    if not args.parse_only:
        api = login_shioaji(args.env.resolve())
        try:
            for index, candidate in enumerate(candidates, start=1):
                if candidate.status == "duplicate":
                    continue
                print(
                    f"[{index}/{len(candidates)}] {candidate.occurred_at} "
                    f"{candidate.code} {candidate.trade_type}",
                    file=sys.stderr,
                )
                try:
                    get_first_tick_after_message(api, candidate)
                except Exception as error:
                    candidate.status = "market_data_error"
                    candidate.warning = f"{type(error).__name__}: {error}"
        finally:
            api.logout()

    summary = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "source_file": str(args.line_export.resolve()),
        "pricing_rule": "LINE export has minute precision; use first Shioaji tick from the next minute.",
        "candidate_count": len(candidates),
        "actionable_count": sum(item.status != "duplicate" for item in candidates),
        "duplicate_count": sum(item.status == "duplicate" for item in candidates),
        "priced_count": sum(item.price is not None for item in candidates),
        "ready_count": sum(
            item.status in {"ready", "priced_with_warning"} for item in candidates
        ),
        "warning_count": sum(item.warning is not None for item in candidates),
    }
    payload = {
        "summary": summary,
        "entries": [asdict(candidate) for candidate in candidates],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
