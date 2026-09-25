import calendar
from datetime import date

from .loader import load_all, expand_row
from .cost import item_cost

_STRENGTH_ORDER = {"official": 0, "guideline": 1, "general": 2}


def _add_months(dt: date, months: int) -> date:
    month = dt.month - 1 + months
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def infer_product(insurer: str, coverage: dict):
    if insurer == "Multicare":
        for pool in coverage.get("limit_pools", []):
            if pool.get("id") == "outpatient" and pool.get("amount_eur") == 1000:
                return "Multicare 2 (€1,000 outpatient)"
    return None


def build_plan(
    sex: str,
    age: int,
    coverage: dict,
    insurer: str,
    product: str = None,
    pregnant: bool = False,
    high_risk: bool = False,
    last_done: dict = None,
) -> dict:
    data = load_all()
    health_items = data["health_items"]
    recommendations = data["recommendations"]
    entitlements = data["checkup_entitlements"]
    coverage_rows = coverage.get("rows", [])
    last_done = last_done or {}

    # Infer product
    product_inferred = False
    if product is None:
        product = infer_product(insurer, coverage)
        if product:
            product_inferred = True

    # Step 1: filter recommendations; collect coming_up separately
    applicable_recs = {}   # item_id -> rec (deduplicated)
    coming_up_recs = {}    # item_id -> rec

    for rec in recommendations:
        rec_sex = rec.get("sex", "Any")
        if rec_sex != "Any" and rec_sex != sex:
            continue
        condition = rec.get("condition", "none")
        if condition == "pregnant" and not pregnant:
            continue
        if condition == "at_risk" and not high_risk:
            continue

        item_id = rec["item_id"]
        age_min = rec.get("age_min")
        age_max = rec.get("age_max")
        in_range = (age_min is None or age >= age_min) and (
            age_max is None or age <= age_max
        )

        if in_range:
            if item_id not in applicable_recs:
                applicable_recs[item_id] = rec
        elif (
            age_min is not None
            and age < age_min
            and (age_min - age) <= 10
            and item_id not in applicable_recs
            and item_id not in coming_up_recs
        ):
            coming_up_recs[item_id] = rec

    # Step 2: checkup gate
    checkup_row = next((r for r in coverage_rows if r["service_id"] == "checkup"), None)
    gate_open = False
    if checkup_row:
        ntype = checkup_row.get("network", {}).get("type")
        gate_open = ntype in ("free", "fixed_copay", "percent_copay")

    # Step 3: find table 3 entry
    checkup_row_items: list = []
    table3_edition: str = None
    table3_found = False

    item_sets = entitlements["item_sets"]

    for entry in entitlements.get("insurers", []):
        if entry.get("insurer") != insurer:
            continue
        entry_sex = entry.get("sex", "Any")
        if entry_sex != "Any" and entry_sex != sex:
            continue

        # Product filter: skip only when we have a product AND the entry lists products
        # AND our product isn't in the list
        products = [p["name"] for p in entry.get("products", [])]
        if product and products and product not in products:
            continue

        for row in entry.get("rows", []):
            if 0 not in row.get("cycle_years", []):
                continue
            r_min = row.get("age_min")
            r_max = row.get("age_max")
            if (r_min is None or age >= r_min) and (r_max is None or age <= r_max):
                checkup_row_items = expand_row(row, item_sets)
                table3_edition = entry.get("edition")
                table3_found = True
                break

        if table3_found:
            break

    # Step 4 + 5: build recommended list
    recommended = []
    recommended_item_ids: set = set()

    for item_id, rec in applicable_recs.items():
        item = health_items.get(item_id)
        if not item:
            continue
        recommended_item_ids.add(item_id)

        # Option a: insurance_checkup
        best_option = None
        if gate_open and table3_found and item_id in checkup_row_items:
            lbl = f"From {insurer} public check-up guide"
            if table3_edition:
                lbl += f", edition {table3_edition}"
            lbl += ". Confirm with your yearly voucher."
            best_option = {"source": "insurance_checkup", "cost_eur": 0, "label": lbl}

        # Option b: SNS
        if best_option is None:
            via_sns = item.get("channel") == "sns" or (
                rec.get("strength") == "official"
                and not item.get("channel")
                and item.get("screens_for_source") == "recommendations_csv"
            )
            if via_sns:
                best_option = {
                    "source": "sns",
                    "cost_eur": 0,
                    "label": "Free through SNS",
                }

        # Option c: insurance_policy
        if best_option is None:
            cost = item_cost(item, coverage_rows)
            evidence = cost.get("evidence", [])
            pages = [e["page"] for e in evidence if e.get("page")]
            all_verified = all(e.get("verified", False) for e in evidence) if evidence else False
            if pages and all_verified:
                lbl = f"From your policy, page {pages[0]}"
            else:
                lbl = "From your policy, please check this"
            best_option = {
                "source": "insurance_policy",
                "cost_eur": cost.get("cost_min_eur"),
                "cost_text": cost.get("cost_text"),
                "label": lbl,
                "evidence": evidence,
                "breakdown": cost.get("breakdown", []),
            }

        # Step 5: status
        rule_kind = rec.get("rule_kind")
        status = "eligible now"
        next_due = None

        if rule_kind == "with_item":
            status = "note"
        elif rule_kind == "age_checkpoints":
            checkpoints = rec.get("checkpoints", [])
            future = sorted(c for c in checkpoints if c > age)
            if future:
                status = f"due at age {future[0]}"
                next_due = f"age {future[0]}"
            else:
                status = "due now" if not last_done.get(item_id) else "eligible now"
        elif last_done.get(item_id) and rec.get("interval_months"):
            ld = last_done[item_id]
            if isinstance(ld, str):
                ld = date.fromisoformat(ld)
            due = _add_months(ld, rec["interval_months"])
            next_due = due.isoformat()
            status = f"next due {next_due}"

        recommended.append(
            {
                "item_id": item_id,
                "label": item["label"],
                "screens_for": item.get("screens_for"),
                "strength": rec.get("strength"),
                "rule_kind": rule_kind,
                "rec_verified": rec.get("verified", True),
                "best_option": best_option,
                "free_note": item.get("free_note"),
                "status": status,
                "next_due": next_due,
            }
        )

    # Step 6: sort
    recommended.sort(
        key=lambda x: (
            _STRENGTH_ORDER.get(x["strength"], 99),
            x["next_due"] or "9999",
        )
    )

    # Step 7: included_in_insurance
    included_in_insurance = []
    if table3_found and gate_open:
        for iid in checkup_row_items:
            if iid not in recommended_item_ids:
                item = health_items.get(iid)
                if item:
                    included_in_insurance.append(
                        {
                            "item_id": iid,
                            "label": item["label"],
                            "screens_for": item.get("screens_for"),
                        }
                    )

    coming_up = []
    for iid, rec in coming_up_recs.items():
        if iid in recommended_item_ids:
            continue
        item = health_items.get(iid)
        if item:
            coming_up.append(
                {
                    "item_id": iid,
                    "label": item["label"],
                    "screens_for": item.get("screens_for"),
                    "age_min": rec.get("age_min"),
                    "strength": rec.get("strength"),
                }
            )

    # Step 8: fallback_message
    fallback_message = None
    if not table3_found:
        if gate_open:
            fallback_message = (
                f"Your policy includes preventive check-ups, but {insurer} doesn't publish "
                "what's in them. Ask them what your check-up includes. Meanwhile, here's "
                "what each test costs under your policy."
            )
        else:
            fallback_message = (
                f"No public check-up information found for {insurer}. "
                "Prices below are from your policy."
            )

    return {
        "recommended": recommended,
        "included_in_insurance": included_in_insurance,
        "coming_up": coming_up,
        "fallback_message": fallback_message,
        "product_used": product,
        "product_inferred": product_inferred,
    }
