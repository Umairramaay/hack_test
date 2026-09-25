from .loader import load_all


def _component_cost(service_id: str, coverage_by_service: dict) -> tuple:
    """Returns (min_eur_or_none, text, evidence_dict_or_none)."""
    row = coverage_by_service.get(service_id)
    if row is None:
        return (0, "not stated in your policy", None)

    network = row.get("network", {})
    ntype = network.get("type", "not_stated")
    ev = {
        "page": row.get("page"),
        "quote": row.get("quote"),
        "verified": row.get("verified", False),
    }

    if ntype == "free":
        return (0, "free", ev)
    if ntype == "fixed_copay":
        amt = network["amount_eur"]
        return (amt, f"€{amt:g} copay", ev)
    if ntype == "percent_copay":
        pct = network["pct"]
        min_eur = network.get("min_eur", 0)
        text = f"{pct}% of price"
        if min_eur:
            text += f" (min €{min_eur:g})"
        return (min_eur, text, ev)
    if ntype == "network_discount":
        return (0, "Discounted network price", ev)
    if ntype == "not_covered":
        return (None, "not covered", ev)
    return (0, "not stated in your policy", ev)


def item_cost(item: dict, coverage_rows: list) -> dict:
    """
    Sums the item's components against coverage_rows.
    Returns {cost_min_eur, cost_text, evidence}.
    """
    coverage_by_service = {r["service_id"]: r for r in coverage_rows}
    components = item.get("components", [])

    if not components:
        return {"cost_min_eur": 0, "cost_text": "No procedure cost", "evidence": []}

    results = [_component_cost(sid, coverage_by_service) for sid in components]
    evidence = [r[2] for r in results if r[2] is not None]
    breakdown = [
        {"service_id": sid, "cost_text": text, "evidence": ev}
        for sid, (_, text, ev) in zip(components, results)
    ]

    if any(r[0] is None for r in results):
        return {"cost_min_eur": None, "cost_text": "not covered", "evidence": evidence, "breakdown": breakdown}

    total_min = sum(r[0] for r in results)

    if all(r[1] == "free" for r in results):
        return {"cost_min_eur": 0, "cost_text": "Free under your policy", "evidence": evidence, "breakdown": breakdown}

    texts = [r[1] for r in results]
    cost_text = " + ".join(texts)
    return {"cost_min_eur": total_min, "cost_text": cost_text, "evidence": evidence, "breakdown": breakdown}
