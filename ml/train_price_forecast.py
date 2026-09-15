"""파종내비 가격 예측 학습 파이프라인.

KAMIS 도매가격(학습 정답)과 기상청 ASOS 일자료(설명 변수)를 결합해
7일 뒤 가격을 예측한다. KRC 데이터는 지역별 작물 추천의 근거 요약으로
별도 저장한다. API 키는 프로젝트 루트의 .env에서만 읽는다.

실행 예시
  python ml/train_price_forecast.py --probe
  python ml/train_price_forecast.py --fetch-prices --train
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import time
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"
MODEL_OUT = ROOT / "data" / "models"
KAMIS_URL = "https://www.kamis.or.kr/service/price/xml.do"

# 앱의 36개 추천 작물과 KAMIS 품목명을 연결한다. 같은 작물도 품종·포장단위는
# 각각 별도 시계열로 학습한다.
ITEM_ALIASES = {
    "쌀": "벼", "콩": "콩(대두)", "밀": "밀", "보리": "보리", "팥": "팥", "녹두": "녹두", "메밀": "메밀",
    "감자": "감자", "고구마": "고구마", "옥수수": "옥수수(사료용)", "땅콩": "땅콩", "참깨": "참깨", "들깨": "들깨",
    "배추": "배추", "무": "무", "양배추": "양배추", "브로콜리": "브로콜리", "상추": "상추", "시금치": "시금치", "당근": "당근", "대파": "대파",
    "오이": "오이", "애호박": "애호박", "토마토": "토마토", "가지": "가지", "수박": "수박", "딸기": "딸기",
    "사과": "사과", "배": "배", "포도": "포도", "복숭아": "복숭아",
    "양파": "양파",
    "깐마늘(국산)": "마늘", "마늘(국산)": "마늘",
    "건고추": "고추", "풋고추": "고추",
}
KAMIS_CATEGORIES = ("100", "200", "300", "400")
# 결측 없이 항상 채워지는 핵심 피처. 학습 대상 행/실제 예측 입력 행을 고르는
# dropna 기준으로도 쓰인다 — 이 리스트에 넣으면 그 값이 없는 행은 통째로 제외된다.
CORE_FEATURES = [
    "price_lag_1", "price_lag_7", "price_lag_14", "price_mean_7",
    "price_std_7", "month_sin", "month_cos", "avg_temp", "min_temp",
    "max_temp", "rainfall", "humidity", "sunshine",
]
# 초반 이력 부족 등으로 결측이 자연 발생할 수 있는 보조 피처. HistGradientBoostingRegressor는
# NaN을 분기 방향으로 학습하므로 결측을 채우지 않고 그대로 둔다. dropna 기준에서는 제외한다.
EXTRA_FEATURES: list[str] = [
    "dow_sin", "dow_cos", "year", "days_until_holiday",
    "price_lag_365", "price_yoy_ratio", "category_peer_price_ratio",
]
FEATURES = CORE_FEATURES + EXTRA_FEATURES

# 설/추석(음력 명절) 날짜. 이동일이라 매년 고정 규칙이 없어 직접 나열한다 — 값이 몇 개 안 되고
# 한 번 지나면 바뀌지 않으므로 holidays/lunardate 등 새 의존성을 추가하지 않는다(YAGNI).
# NOTE: 아래 날짜는 재확인이 필요하다 — 계획 수립 시 실시간 조회가 불가능해 기억에 의존해 채웠다.
# 학습을 실제로 돌리기 전에 공식 달력(예: 한국천문연구원 특일 정보)으로 반드시 대조할 것.
KOREAN_HOLIDAYS = [
    date(2019, 2, 5), date(2019, 9, 13),
    date(2020, 1, 25), date(2020, 10, 1),
    date(2021, 2, 12), date(2021, 9, 21),
    date(2022, 2, 1), date(2022, 9, 10),
    date(2023, 1, 22), date(2023, 9, 29),
    date(2024, 2, 10), date(2024, 9, 17),
    date(2025, 1, 29), date(2025, 10, 6),
    date(2026, 2, 17), date(2026, 9, 25),
    date(2027, 2, 7), date(2027, 9, 15),
]
HOLIDAY_PROXIMITY_CAP_DAYS = 45


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    env_path = ROOT / ".env"
    if not env_path.exists():
        raise RuntimeError("프로젝트 루트에 .env가 없습니다.")
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    for key in ("KAMIS_CERT_KEY", "KAMIS_CERT_ID"):
        if not values.get(key):
            raise RuntimeError(f".env에 {key} 값이 필요합니다.")
    return values


def kamis_request(day: date, env: dict[str, str], category: str = "200") -> dict:
    params = {
        "action": "dailyPriceByCategoryList",
        "p_product_cls_code": "02",
        "p_item_category_code": category,
        "p_regday": day.isoformat(),
        "p_convert_kg_yn": "Y",
        "p_cert_key": env["KAMIS_CERT_KEY"],
        "p_cert_id": env["KAMIS_CERT_ID"],
        "p_returntype": "json",
    }
    url = f"{KAMIS_URL}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def unwrap_items(payload: dict) -> list[dict]:
    data = payload.get("data", {})
    if isinstance(data, list):
        data = data[0] if data else {}
    # KAMIS의 condition 필드는 요청 파라미터(인증키 포함)를 그대로 되돌릴 수 있다.
    # 오류 메시지에 condition 전체를 넣으면 안 된다.
    code = str(data.get("error_code", data.get("code", "000")))
    if code not in ("000", "0"):
        message = str(data.get("message", data.get("error_message", "알 수 없는 오류")))
        raise RuntimeError(f"KAMIS 응답 오류 코드 {code}: {message}")
    items = data.get("item", []) if isinstance(data, dict) else []
    return items if isinstance(items, list) else [items]


def to_price(value: object) -> float | None:
    text = re.sub(r"[^0-9.]", "", str(value or ""))
    if not text:
        return None
    result = float(text)
    return result if result > 0 else None


def probe() -> None:
    payload = kamis_request(date.today() - timedelta(days=1), load_env())
    items = unwrap_items(payload)
    names = sorted({str(item.get("item_name", "")) for item in items})
    print(f"KAMIS 연결 성공: 채소류 {len(items)}건, 예시 품목 {', '.join(names[:8])}")


def fetch_prices(start: date, end: date, categories: tuple[str, ...] = ("200",), filename: str = "kamis_prices_vegetables.csv") -> Path:
    env = load_env()
    target = RAW / filename
    existing: set[tuple[str, str]] = set()
    if target.exists():
        old = pd.read_csv(target, usecols=["date", "category"])
        existing = set(zip(old["date"].astype(str), old["category"].astype(str)))

    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    jobs = [(day, category) for day in days for category in categories if (day.isoformat(), category) not in existing]

    def collect(one_day: date, category: str) -> list[dict]:
        try:
            items = unwrap_items(kamis_request(one_day, env, category))
        except Exception as exc:  # 휴장일/no data도 학습에서 제외한다.
            return [{"_error": f"{one_day.isoformat()} / {category}: {exc}"}]
        output = []
        for item in items:
            name = str(item.get("item_name", "")).strip()
            crop = ITEM_ALIASES.get(name)
            if not crop:
                continue
            price = to_price(item.get("dpr1"))
            if price is None:
                continue
            output.append({
                "date": one_day.isoformat(), "crop": crop, "price": price,
                "source_item": name, "unit": item.get("unit", ""), "rank": item.get("rank", ""), "category": category,
                "source": "KAMIS dailyPriceByCategoryList (wholesale)",
            })
        return output

    print(f"KAMIS 가격 수집: {len(jobs)}건 요청 ({', '.join(categories)} 부류)", flush=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    should_write_header = not target.exists()
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(collect, one_day, category): (one_day, category) for one_day, category in jobs}
        with target.open("a", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=["date", "crop", "price", "source_item", "unit", "rank", "category", "source"])
            if should_write_header:
                writer.writeheader()
                should_write_header = False
            for index, future in enumerate(as_completed(futures), 1):
                records = future.result()
                if records and "_error" in records[0]:
                    print(records[0]["_error"])
                else:
                    writer.writerows(records)
                if index % 50 == 0 or index == len(jobs):
                    handle.flush()
                    print(f"  {index}/{len(jobs)} 요청 완료", flush=True)
                time.sleep(0.03)

    if not target.exists() or target.stat().st_size == 0:
        raise RuntimeError("KAMIS 가격을 받지 못했습니다. .env의 인증 정보를 확인하세요.")
    return target


def read_csv_bytes(data: bytes) -> pd.DataFrame:
    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            return pd.read_csv(io.BytesIO(data), encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise RuntimeError("지원하지 않는 CSV 인코딩입니다.")


def weather_frames_from_zip(path: Path) -> list[pd.DataFrame]:
    frames: list[pd.DataFrame] = []
    with zipfile.ZipFile(path) as archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            content = archive.read(entry)
            if entry.filename.lower().endswith(".csv"):
                frames.append(read_csv_bytes(content))
            elif entry.filename.lower().endswith(".zip"):
                with zipfile.ZipFile(io.BytesIO(content)) as nested:
                    for nested_entry in nested.infolist():
                        if nested_entry.filename.lower().endswith(".csv"):
                            frames.append(read_csv_bytes(nested.read(nested_entry)))
    return frames


def choose_column(frame: pd.DataFrame, keyword: str) -> str | None:
    return next((column for column in frame.columns if keyword in str(column)), None)


def build_weather() -> pd.DataFrame:
    records: list[pd.DataFrame] = []
    for path in (RAW / "weather").rglob("*.zip"):
        for frame in weather_frames_from_zip(path):
            date_col = choose_column(frame, "일시")
            if not date_col:
                continue
            output = pd.DataFrame({"date": pd.to_datetime(frame[date_col], errors="coerce")})
            for name, keyword in (("avg_temp", "평균기온"), ("min_temp", "최저기온"), ("max_temp", "최고기온"), ("rainfall", "일강수량"), ("humidity", "평균 상대습도"), ("sunshine", "합계 일조시간")):
                column = choose_column(frame, keyword)
                output[name] = pd.to_numeric(frame[column], errors="coerce") if column else np.nan
            records.append(output)
    if not records:
        raise RuntimeError("data/raw/weather 안의 ASOS zip 파일을 읽지 못했습니다.")
    weather = pd.concat(records, ignore_index=True).dropna(subset=["date"])
    weather = weather.groupby("date", as_index=False).mean(numeric_only=True)
    weather["date"] = weather["date"].dt.date.astype(str)
    OUT.mkdir(parents=True, exist_ok=True)
    weather.to_csv(OUT / "weather_daily_mean.csv", index=False, encoding="utf-8-sig")
    return weather


def summarize_krc() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    result: dict[str, object] = {"generatedAt": datetime.now().isoformat(timespec="seconds"), "sources": {}}
    drought_path = next((RAW / "krc").glob("*논가뭄지도*.csv"))
    water_path = next((RAW / "krc").glob("*수질정보*.csv"))
    drought = pd.read_csv(drought_path, encoding="cp949")
    water = pd.read_csv(water_path, encoding="cp949")
    result["sources"]["drought"] = {"file": drought_path.name, "rows": len(drought), "columns": list(drought.columns)}
    result["sources"]["waterQuality"] = {"file": water_path.name, "rows": len(water), "columns": list(water.columns)}
    (OUT / "krc_data_profile.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


def train(price_path: Path) -> None:
    prices = pd.read_csv(price_path)
    prices["date"] = pd.to_datetime(prices["date"], errors="coerce")
    prices["price"] = pd.to_numeric(prices["price"], errors="coerce")
    prices = prices.dropna(subset=["date", "price"]).sort_values(["crop", "date"])
    weather = build_weather()
    weather["date"] = pd.to_datetime(weather["date"])
    dataset = prices.merge(weather, on="date", how="left")
    dataset = dataset.sort_values(["crop", "source_item", "unit", "rank", "date"])
    # ASOS 원본의 관측 종료일 이후에는 마지막 관측값을 사용한다. 이 사실은 산출물에
    # 남기며, 다음 ASOS 파일을 넣고 재실행하면 자동으로 실제 관측값으로 교체된다.
    weather_columns = ["avg_temp", "min_temp", "max_temp", "rainfall", "humidity", "sunshine"]
    dataset[weather_columns] = dataset[weather_columns].ffill().bfill()
    dataset[weather_columns] = dataset[weather_columns].fillna(dataset[weather_columns].median(numeric_only=True))
    group = dataset.groupby(["crop", "source_item", "unit", "rank"])["price"]
    dataset["price_lag_1"] = group.shift(1)
    dataset["price_lag_7"] = group.shift(7)
    dataset["price_lag_14"] = group.shift(14)
    dataset["price_mean_7"] = group.transform(lambda series: series.shift(1).rolling(7).mean())
    dataset["price_std_7"] = group.transform(lambda series: series.shift(1).rolling(7).std())
    dataset["target_price_7d"] = group.shift(-7)
    dataset["month_sin"] = np.sin(2 * np.pi * dataset["date"].dt.month / 12)
    dataset["month_cos"] = np.cos(2 * np.pi * dataset["date"].dt.month / 12)

    # --- EXTRA_FEATURES: 요일·연도 트렌드 ---
    dataset["dow_sin"] = np.sin(2 * np.pi * dataset["date"].dt.dayofweek / 7)
    dataset["dow_cos"] = np.cos(2 * np.pi * dataset["date"].dt.dayofweek / 7)
    dataset["year"] = dataset["date"].dt.year.astype(float)

    # --- EXTRA_FEATURES: 명절(설/추석) 근접도 ---
    holidays = sorted(KOREAN_HOLIDAYS)

    def days_until_next_holiday(day: pd.Timestamp) -> float:
        target = day.date()
        for holiday in holidays:
            if holiday >= target:
                return min((holiday - target).days, HOLIDAY_PROXIMITY_CAP_DAYS)
        return float(HOLIDAY_PROXIMITY_CAP_DAYS)

    dataset["days_until_holiday"] = dataset["date"].apply(days_until_next_holiday)

    # --- EXTRA_FEATURES: 전년 동기가(price_lag_365) / YoY 비율 ---
    # 영업일 기준 365행 shift는 실제 "1년 전"과 최대 두 달가량 어긋나므로, 날짜에 +365일을
    # 더한 뒤 같은 시리즈(crop·source_item·unit·rank)끼리 달력 기준으로 정확히 조인한다.
    group_keys = ["crop", "source_item", "unit", "rank"]
    prior_year = dataset[group_keys + ["date", "price"]].copy()
    prior_year["date"] = prior_year["date"] + pd.Timedelta(days=365)
    prior_year = prior_year.rename(columns={"price": "price_lag_365"})
    dataset = dataset.merge(prior_year, on=group_keys + ["date"], how="left")
    dataset["price_yoy_ratio"] = dataset["price_lag_1"] / dataset["price_lag_365"].replace(0, np.nan)

    # --- EXTRA_FEATURES: 동일 카테고리 내 대체작물 가격 대비 비율 ---
    # ITEM_ALIASES에 없는 KAMIS 품목은 collect()에서 이미 걸러지므로, peer 풀은 앱이
    # 추적하는 ~40개 작물로 한정된다. kamis_prices_all_profiles.csv(카테고리 100/200/300/400
    # 전체)로 수집했을 때 더 풍부해진다.
    category_group = dataset.groupby(["date", "category"])["price"]
    category_sum = category_group.transform("sum")
    category_count = category_group.transform("count")
    peer_mean = (category_sum - dataset["price"]) / (category_count - 1).replace(0, np.nan)
    dataset["category_peer_price_ratio"] = dataset["price"] / peer_mean.replace(0, np.nan)

    # 최근 7일은 아직 정답(target_price_7d)이 없으므로 학습에서는 제외하되,
    # 미래 예측 입력으로는 반드시 남긴다. 예전 구현은 이 행들까지 먼저 제거해
    # 이미 지난 날짜를 '7일 예측'으로 내보내는 문제가 있었다.
    # dropna는 결측이 없어야 하는 CORE_FEATURES 기준으로만 건다 — EXTRA_FEATURES는
    # HistGradientBoostingRegressor가 NaN을 그대로 학습하도록 남겨둔다.
    training_dataset = dataset.dropna(subset=CORE_FEATURES + ["target_price_7d"])
    if len(training_dataset) < 80:
        raise RuntimeError(f"학습 행이 부족합니다({len(training_dataset)}행). KAMIS 수집 기간을 늘리세요.")

    MODEL_OUT.mkdir(parents=True, exist_ok=True)
    import joblib
    models, forecasts, metric_rows = {}, [], []
    for (crop, source_item, unit, rank), series in training_dataset.groupby(["crop", "source_item", "unit", "rank"]):
        series = series.sort_values("date")
        split_at = int(len(series) * 0.8)
        train_frame, test_frame = series.iloc[:split_at], series.iloc[split_at:]
        if len(train_frame) < 80 or len(test_frame) < 20:
            continue
        model = HistGradientBoostingRegressor(max_iter=250, learning_rate=0.05, max_leaf_nodes=15, l2_regularization=1.0, random_state=42)
        model.fit(train_frame[FEATURES], train_frame["target_price_7d"])
        predicted = model.predict(test_frame[FEATURES])
        mae = float(mean_absolute_error(test_frame["target_price_7d"], predicted))
        mape = float(mean_absolute_percentage_error(test_frame["target_price_7d"], predicted) * 100)
        residual_std = float(np.std(test_frame["target_price_7d"].to_numpy() - predicted))
        key = f"{crop}|{source_item}|{unit}|{rank}"
        models[key] = model
        metric_rows.append({"crop": crop, "sourceItem": source_item, "unit": unit, "rank": rank, "trainRows": len(train_frame), "testRows": len(test_frame), "maeWon": mae, "mapePercent": mape})
        forecast_rows = dataset[
            (dataset["crop"] == crop)
            & (dataset["source_item"] == source_item)
            & (dataset["unit"] == unit)
            & (dataset["rank"] == rank)
        ].dropna(subset=CORE_FEATURES).sort_values("date")
        row = forecast_rows.iloc[-1]
        value = float(model.predict(pd.DataFrame([row[FEATURES].to_dict()]))[0])
        forecasts.append({
            "crop": crop, "baseDate": row["date"].date().isoformat(),
            "forecastDate": (row["date"].date() + timedelta(days=7)).isoformat(),
            "predictedPriceWon": round(value), "lowerBoundWon": max(0, round(value - residual_std)),
            "upperBoundWon": round(value + residual_std),
            # p_convert_kg_yn=Y makes KAMIS return won/kg for weight-based
            # packages even though the response keeps the original pack label.
            "unit": "kg" if "kg" in str(unit).lower() else unit,
            "sourceUnit": unit,
            "priceBasis": "kg" if "kg" in str(unit).lower() else "each",
            "sourceItem": source_item, "rank": rank,
            "market": "KAMIS 전국 도매가격", "model": "품목·단위별 HistGradientBoostingRegressor (가격 지연값·계절성·요일·명절근접도·전년동기가·대체작물가격·ASOS 기상)",
            "source": "KAMIS + 기상청 ASOS", "weatherImputation": "ASOS 관측 종료일 이후 마지막 관측값/중앙값 보정",
            "metrics": {"maeWon": round(mae, 1), "mapePercent": round(mape, 2), "testRows": len(test_frame)},
            "notice": "예측 참고치이며 실제 가격은 출하량·시장 상황에 따라 달라질 수 있습니다.",
        })
    metrics_frame = pd.DataFrame(metric_rows)
    metrics = {
        "seriesCount": len(metric_rows), "trainRows": int(metrics_frame["trainRows"].sum()), "testRows": int(metrics_frame["testRows"].sum()),
        "weightedMaeWon": round(float(np.average(metrics_frame["maeWon"], weights=metrics_frame["testRows"])), 1),
        "weightedMapePercent": round(float(np.average(metrics_frame["mapePercent"], weights=metrics_frame["testRows"])), 2),
        "series": [{**row, "maeWon": round(row["maeWon"], 1), "mapePercent": round(row["mapePercent"], 2)} for row in metric_rows],
    }
    joblib.dump({"models": models, "features": FEATURES}, MODEL_OUT / "price_forecast_model.joblib")
    (MODEL_OUT / "price_forecast_metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    # 앱은 작물마다 가장 최근 데이터가 있고 검증 MAPE가 낮은 시계열 하나를 표시한다.
    selected_forecasts = []
    for crop in sorted({forecast["crop"] for forecast in forecasts}):
        candidates = [forecast for forecast in forecasts if forecast["crop"] == crop]
        selected_forecasts.append(min(candidates, key=lambda forecast: forecast["metrics"]["mapePercent"]))
    (OUT / "price_forecasts.json").write_text(json.dumps({"items": selected_forecasts}, ensure_ascii=False, indent=2), encoding="utf-8")
    training_dataset.to_csv(OUT / "price_training_dataset.csv", index=False, encoding="utf-8-sig")
    print("학습 완료", json.dumps({k: v for k, v in metrics.items() if k != "series"}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--fetch-prices", action="store_true")
    parser.add_argument("--fetch-all-prices", action="store_true")
    parser.add_argument("--train", action="store_true")
    parser.add_argument("--start", default="2023-01-01")
    parser.add_argument("--end", default=(date.today() - timedelta(days=1)).isoformat())
    args = parser.parse_args()
    if args.probe:
        probe()
    if args.fetch_prices:
        price_path = fetch_prices(date.fromisoformat(args.start), date.fromisoformat(args.end))
    elif args.fetch_all_prices:
        price_path = fetch_prices(
            date.fromisoformat(args.start), date.fromisoformat(args.end),
            categories=KAMIS_CATEGORIES, filename="kamis_prices_all_profiles.csv",
        )
    else:
        expanded_path = RAW / "kamis_prices_all_profiles.csv"
        price_path = expanded_path if expanded_path.exists() else RAW / "kamis_prices_vegetables.csv"
    if args.train:
        summarize_krc()
        train(price_path)


if __name__ == "__main__":
    main()
