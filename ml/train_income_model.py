#!/usr/bin/env python3
"""Extract RDA income books and train crop-level yield/cost estimators.

The source PDFs are the official nationwide ``농산물소득자료집`` books.  Values
are normalised to 10 ares (1,000 m²), which is also the unit used by the app.
The mobile app consumes the compact JSON artifact; the joblib file is retained
for reproducible evaluation and future scheduled retraining.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from pypdf import PdfReader
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesRegressor
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "income"
PROCESSED_DIR = ROOT / "data" / "processed"
MODEL_DIR = ROOT / "data" / "models"
APP_DATA_DIR = ROOT / "seedjong-navi" / "data"
SOURCE_URL = (
    "https://www.nongsaro.go.kr/portal/ps/psb/psbf/"
    "frmprdIncomeInfoNew.ps?menuId=PS03617"
)


CROP_ALIASES = {
    "겉보리": "보리",
    "쌀보리": "보리",
    "노지풋옥수수": "옥수수(사료용)",
    "봄감자": "감자",
    "가을감자": "감자",
    "노지봄배추": "배추",
    "노지가을배추": "배추",
    "노지고랭지배추": "배추",
    "노지가을무": "무",
    "노지고랭지무": "무",
    "노지대파": "대파",
    "노지쪽파": "쪽파",
    "노지양배추": "양배추",
    "노지시금치": "시금치",
    "시설시금치": "시금치",
    "시설오이": "오이",
    "시설호박": "애호박",
    "시설토마토": "토마토",
    "시설토마토(수경)": "토마토",
    "시설방울토마토": "방울토마토",
    "시설방울토마토(수경)": "방울토마토",
    "시설가지": "가지",
    "시설수박": "수박",
    "노지수박": "수박",
    "시설딸기": "딸기",
    "시설딸기(수경)": "딸기",
    "시설상추": "상추",
    "시설고추": "고추",
    "시설파프리카(착색단고추)": "파프리카",
    "시설파프리카": "파프리카",
    "노지포도": "포도",
    "시설포도": "포도",
    "노지감귤": "감귤",
    "키위(참다래)": "키위",
    "참다래(키위)": "키위",
}


def clean_number(value: str) -> float:
    return float(value.replace(",", "").strip())


def first_number(text: str, patterns: list[str]) -> float | None:
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return clean_number(match.group(1))
    return None


def extract_crop(text: str, year: int) -> str | None:
    patterns = [
        rf"\(\d+\)\s*(.+?)\s*[¡◦○]\s*{year}년(?:도|산)?",
        rf"\(\d+\)\s*(.+?)\s+{year}년(?:도|산)?",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            crop = re.sub(r"\s+", "", match.group(1)).strip("-· ")
            if 1 <= len(crop) <= 30:
                return crop
    return None


def parse_page(raw_text: str, year: int, page_number: int) -> dict | None:
    text = re.sub(r"\s+", " ", raw_text.replace("\u00a0", " ")).strip()
    if f"{year}년" not in text or "10a" not in text or "총수입" not in text:
        return None

    crop = extract_crop(text, year)
    if not crop:
        return None

    revenue = first_number(
        text,
        [
            rf"{year}년도\s*{re.escape(crop)}\s*10a\s*당\s*총수입은\s*([\d,]+)원",
            rf"{year}년(?:도|산)?\s*{re.escape(crop)}\s*10a\s*당\s*총수입은\s*([\d,]+)원",
            r"10a\s*당\s*총수입은\s*([\d,]+)원",
        ],
    )
    operating_cost = first_number(
        text, [r"10a\s*당\s*경영비는\s*([\d,]+)원"]
    )
    income = first_number(text, [r"10a\s*당\s*소득은\s*([\d,]+)원"])
    quantity = first_number(
        text,
        [
            r"[-–]\s*수\s*량\s*([\d,.]+)",
            r"주\s*산\s*물\s*수\s*량\s*([\d,.]+)",
        ],
    )
    price = first_number(
        text,
        [
            r"[-–]\s*가\s*격\s*([\d,.]+)",
            r"[-–]\s*농\s*가\s*수\s*취\s*단\s*가\s*([\d,.]+)",
            r"주\s*산\s*물\s*단\s*가\s*([\d,.]+)",
        ],
    )

    if any(value is None for value in (revenue, operating_cost, income, quantity)):
        return None
    if min(revenue, operating_cost, quantity) <= 0:
        return None

    identity_error = abs((revenue - operating_cost) - income) / max(revenue, 1)
    if identity_error > 0.025:
        return None

    return {
        "year": year,
        "sourceCrop": crop,
        "crop": CROP_ALIASES.get(crop, crop),
        "yieldKgPer1000m2": round(quantity, 3),
        "farmgatePriceWonPerKg": round(price, 3) if price else None,
        "revenueWonPer1000m2": round(revenue),
        "operatingCostWonPer1000m2": round(operating_cost),
        "incomeWonPer1000m2": round(income),
        "identityErrorPercent": round(identity_error * 100, 4),
        "page": page_number,
    }


def extract_books(min_year: int = 2019) -> tuple[pd.DataFrame, list[dict]]:
    rows: list[dict] = []
    books: list[dict] = []
    paths = sorted(RAW_DIR.glob("20??_농산물소득자료집_전국.pdf"))
    for path in paths:
        year = int(path.name[:4])
        if year < min_year:
            continue
        reader = PdfReader(path)
        extracted = []
        # The annual trend section is in the first 100 pages. Later pages repeat
        # the current year in detailed cost/labour tables and are intentionally
        # excluded to prevent duplicate observations.
        for page_index, page in enumerate(reader.pages[:100]):
            parsed = parse_page(
                page.extract_text(extraction_mode="layout") or "",
                year,
                page_index + 1,
            )
            if parsed:
                extracted.append(parsed)
        # A crop can have multiple detailed pages; trend pages are unique per source crop.
        frame = pd.DataFrame(extracted).drop_duplicates(["year", "sourceCrop"], keep="first")
        rows.extend(frame.to_dict("records"))
        books.append(
            {
                "year": year,
                "file": path.name,
                "pages": len(reader.pages),
                "rows": len(frame),
            }
        )
    if not rows:
        raise RuntimeError("No valid income rows were extracted from the RDA PDF books")
    return pd.DataFrame(rows).sort_values(["year", "crop"]), books


def aggregate_aliases(frame: pd.DataFrame) -> pd.DataFrame:
    numeric = [
        "yieldKgPer1000m2",
        "farmgatePriceWonPerKg",
        "revenueWonPer1000m2",
        "operatingCostWonPer1000m2",
        "incomeWonPer1000m2",
    ]
    # Where the app has a broader crop name (e.g. 배추), use the median across
    # the official cultivation types so a single extreme type cannot dominate.
    grouped = frame.groupby(["year", "crop"], as_index=False)[numeric].median()
    counts = (
        frame.groupby(["year", "crop"])["sourceCrop"]
        .nunique()
        .rename("sourceTypeCount")
        .reset_index()
    )
    return grouped.merge(counts, on=["year", "crop"], how="left")


def make_model() -> Pipeline:
    features = ColumnTransformer(
        [
            ("crop", OneHotEncoder(handle_unknown="ignore"), ["crop"]),
            ("year", StandardScaler(), ["year"]),
        ]
    )
    estimator = ExtraTreesRegressor(
        n_estimators=500,
        min_samples_leaf=2,
        max_features=0.9,
        random_state=42,
        n_jobs=-1,
    )
    return Pipeline([("features", features), ("model", estimator)])


def safe_mape(actual: np.ndarray, predicted: np.ndarray) -> float:
    mask = np.isfinite(actual) & np.isfinite(predicted) & (actual > 0)
    return float(mean_absolute_percentage_error(actual[mask], predicted[mask]) * 100)


def train_target(
    frame: pd.DataFrame, target: str, holdout_year: int
) -> tuple[Pipeline, dict, pd.DataFrame]:
    train = frame[frame.year < holdout_year].dropna(subset=[target]).copy()
    test = frame[frame.year == holdout_year].dropna(subset=[target]).copy()
    seen = set(train.crop)
    test = test[test.crop.isin(seen)].copy()
    if train.empty or test.empty:
        raise RuntimeError(f"Not enough temporal data to evaluate {target}")

    model = make_model()
    model.fit(train[["crop", "year"]], np.log1p(train[target]))
    predicted = np.expm1(model.predict(test[["crop", "year"]]))
    baseline_lookup = (
        train.sort_values("year").drop_duplicates("crop", keep="last").set_index("crop")[target]
    )
    baseline = test.crop.map(baseline_lookup).to_numpy(dtype=float)
    actual = test[target].to_numpy(dtype=float)
    metrics = {
        "trainRows": int(len(train)),
        "testRows": int(len(test)),
        "holdoutYear": int(holdout_year),
        "mapePercent": round(safe_mape(actual, predicted), 3),
        "mae": round(float(mean_absolute_error(actual, predicted)), 1),
        "previousYearBaselineMapePercent": round(safe_mape(actual, baseline), 3),
    }
    test[f"predicted_{target}"] = predicted

    final_model = make_model()
    final_model.fit(frame[["crop", "year"]], np.log1p(frame[target]))
    return final_model, metrics, test


def blend_with_official(official: float, predicted: float, apply: bool, limit: float = 0.15) -> float:
    """Blend a model estimate into an official statistic, bounded to ±``limit``.

    The blend is only meant to carry a one-year trend.  Sparse per-crop history
    can make a single tree ensemble wildly off (wheat once predicted 3.5x the
    surveyed yield), so the official value caps how far the estimate may move.
    """
    if not apply:
        return official
    blended = 0.7 * official + 0.3 * predicted
    return min(max(blended, official * (1 - limit)), official * (1 + limit))


def build_artifact(frame: pd.DataFrame, models: dict, metrics: dict) -> dict:
    latest_year = int(frame.year.max())
    estimate_year = latest_year + 1
    items = []
    deploy_yield_model = (
        metrics["yield"]["mapePercent"]
        <= metrics["yield"]["previousYearBaselineMapePercent"]
    )
    deploy_cost_model = (
        metrics["cost"]["mapePercent"]
        <= metrics["cost"]["previousYearBaselineMapePercent"]
    )
    for crop, history in frame.groupby("crop"):
        history = history.sort_values("year")
        latest = history.iloc[-1]
        query = pd.DataFrame([{"crop": crop, "year": estimate_year}])
        predicted_yield = float(np.expm1(models["yield"].predict(query)[0]))
        predicted_cost = float(np.expm1(models["cost"].predict(query)[0]))
        history_years = sorted(int(y) for y in history.year.unique())
        # Official latest values remain the anchor.  The trained estimator adds a
        # conservative one-year trend instead of replacing a measured statistic.
        yield_value = blend_with_official(
            float(latest.yieldKgPer1000m2), predicted_yield, deploy_yield_model
        )
        cost_value = blend_with_official(
            float(latest.operatingCostWonPer1000m2), predicted_cost, deploy_cost_model
        )
        history_factor = min(1.0, len(history_years) / 5)
        deployed_error = (
            metrics["yield"]["mapePercent"]
            + (
                metrics["cost"]["mapePercent"]
                if deploy_cost_model
                else metrics["cost"]["previousYearBaselineMapePercent"]
            )
        )
        error_factor = max(
            0.0,
            1.0 - deployed_error / 100,
        )
        confidence = round(100 * history_factor * error_factor)
        items.append(
            {
                "crop": crop,
                "baseYear": int(latest.year),
                "estimateYear": estimate_year,
                "yieldKgPer1000m2": round(max(1, yield_value)),
                "operatingCostWonPer1000m2": round(max(1, cost_value)),
                # The app prices revenue off these farmgate figures.  KAMIS
                # quotes wholesale prices, which sit 1.3-4x above what the farm
                # actually receives, so the official survey values must ship
                # alongside the yield/cost estimates.
                "officialLatest": {
                    "yieldKgPer1000m2": round(float(latest.yieldKgPer1000m2)),
                    "operatingCostWonPer1000m2": round(
                        float(latest.operatingCostWonPer1000m2)
                    ),
                    "incomeWonPer1000m2": round(float(latest.incomeWonPer1000m2)),
                    "revenueWonPer1000m2": round(float(latest.revenueWonPer1000m2)),
                    "farmgatePriceWonPerKg": (
                        round(float(latest.farmgatePriceWonPerKg), 1)
                        if pd.notna(latest.farmgatePriceWonPerKg)
                        else None
                    ),
                },
                "historyYears": history_years,
                "confidencePercent": confidence,
                "method": {
                    "yield": (
                        "RDA latest 70% + temporal ExtraTrees estimate 30% (bounded to ±15% of official)"
                        if deploy_yield_model
                        else "RDA latest official value"
                    ),
                    "cost": (
                        "RDA latest 70% + temporal ExtraTrees estimate 30%"
                        if deploy_cost_model
                        else "RDA latest official value (model rejected by holdout gate)"
                    ),
                },
            }
        )
    return {
        "schemaVersion": 1,
        "generatedAt": pd.Timestamp.now(tz="Asia/Seoul").isoformat(),
        "unit": "per 1000m2 (10a)",
        "source": "농촌진흥청 농사로 농산물소득자료집",
        "sourceUrl": SOURCE_URL,
        "latestOfficialYear": latest_year,
        "estimateYear": estimate_year,
        "metrics": metrics,
        "deploymentPolicy": {
            "yieldModelApplied": deploy_yield_model,
            "costModelApplied": deploy_cost_model,
            "gate": "model MAPE must be no worse than previous-year baseline on latest-year holdout",
        },
        "items": sorted(items, key=lambda item: item["crop"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-year", type=int, default=2019)
    parser.add_argument("--probe", action="store_true", help="extract only; do not train")
    args = parser.parse_args()

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)

    raw, books = extract_books(args.min_year)
    raw_path = PROCESSED_DIR / "income_training_raw.csv"
    raw.to_csv(raw_path, index=False, encoding="utf-8-sig")
    frame = aggregate_aliases(raw)
    training_path = PROCESSED_DIR / "income_training_dataset.csv"
    frame.to_csv(training_path, index=False, encoding="utf-8-sig")
    print(json.dumps({"books": books, "rawRows": len(raw), "rows": len(frame)}, ensure_ascii=False, indent=2))
    if args.probe:
        return

    holdout_year = int(frame.year.max())
    yield_model, yield_metrics, yield_test = train_target(
        frame, "yieldKgPer1000m2", holdout_year
    )
    cost_model, cost_metrics, cost_test = train_target(
        frame, "operatingCostWonPer1000m2", holdout_year
    )
    metrics = {
        "evaluation": "latest-year temporal holdout",
        "yield": yield_metrics,
        "cost": cost_metrics,
        "trainingRows": int(len(frame)),
        "cropCount": int(frame.crop.nunique()),
        "yearRange": [int(frame.year.min()), int(frame.year.max())],
        "books": books,
    }
    models = {"yield": yield_model, "cost": cost_model}
    artifact = build_artifact(frame, models, metrics)

    joblib.dump(models, MODEL_DIR / "income_model.joblib")
    (MODEL_DIR / "income_model_metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    eval_frame = yield_test.merge(
        cost_test[
            ["crop", "year", "predicted_operatingCostWonPer1000m2"]
        ],
        on=["crop", "year"],
        how="outer",
    )
    eval_frame.to_csv(
        PROCESSED_DIR / "income_holdout_predictions.csv",
        index=False,
        encoding="utf-8-sig",
    )
    artifact_text = json.dumps(artifact, ensure_ascii=False, indent=2)
    (PROCESSED_DIR / "income_estimates.json").write_text(artifact_text, encoding="utf-8")
    (APP_DATA_DIR / "income_estimates.json").write_text(artifact_text, encoding="utf-8")
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
