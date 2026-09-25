import json
import functools
from pathlib import Path


def _data_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data"


def _load_json(name: str):
    with open(_data_path() / name) as f:
        return json.load(f)


@functools.lru_cache(maxsize=1)
def load_all() -> dict:
    health_items = {item["item_id"]: item for item in _load_json("health_items.json")}
    recommendations = _load_json("recommendations.json")
    checkup_entitlements = _load_json("checkup_entitlements.json")
    services = {svc["service_id"]: svc for svc in _load_json("services.json")}
    demo_coverage = _load_json("demo_coverage.json")

    for rec in recommendations:
        iid = rec["item_id"]
        if iid not in health_items:
            raise ValueError(f"recommendations.json: unknown item_id '{iid}'")

    item_sets = checkup_entitlements["item_sets"]
    for set_name, items in item_sets.items():
        for iid in items:
            if iid not in health_items:
                raise ValueError(
                    f"checkup_entitlements.json item_sets['{set_name}']: unknown item_id '{iid}'"
                )

    for insurer_entry in checkup_entitlements.get("insurers", []):
        for row in insurer_entry.get("rows", []):
            for iid in row.get("extra", []):
                if iid not in health_items:
                    raise ValueError(
                        f"checkup_entitlements.json (insurer '{insurer_entry.get('insurer')}' "
                        f"sex={insurer_entry.get('sex')}) extra: unknown item_id '{iid}'"
                    )

    for item in health_items.values():
        for sid in item.get("components", []):
            if sid not in services:
                raise ValueError(
                    f"health_items.json '{item['item_id']}' components: unknown service_id '{sid}'"
                )

    for row in demo_coverage.get("rows", []):
        sid = row["service_id"]
        if sid not in services:
            raise ValueError(f"demo_coverage.json: unknown service_id '{sid}'")

    return {
        "health_items": health_items,
        "recommendations": recommendations,
        "checkup_entitlements": checkup_entitlements,
        "services": services,
        "demo_coverage": demo_coverage,
    }


def expand_row(row: dict, item_sets: dict) -> list:
    set_name = row.get("set")
    extra = row.get("extra", [])
    if set_name is None:
        return list(extra)
    return list(item_sets.get(set_name, [])) + list(extra)
