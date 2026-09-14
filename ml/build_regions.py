"""Build the Expo app's nationwide legal-dong selector data.

The location hierarchy comes from MOLIT's current nationwide legal-dong CSV.
KRC's latest local paddy-drought snapshot is joined by the first five digits
of the legal-dong code. Parcel-only indicators intentionally remain null.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import shapefile
from pyproj import Transformer


ROOT = Path(__file__).resolve().parents[1]
LEGAL_DONG_CSV = ROOT / "data" / "raw" / "regions" / "legal_dong_20260630.csv"
KRC_DROUGHT_CSV = ROOT / "data" / "raw" / "krc" / "한국농어촌공사_논가뭄지도_20251231.csv"
OUTPUT = ROOT / "seedjong-navi" / "data" / "regions.json"
FARMLAND_SHP = ROOT / "data" / "raw" / "krc" / "한국농어촌공사_농업진흥지역도_20251231" / "LSMD_CONT_UE101_202512.shp"

DROUGHT_RISK_BY_STAGE = {
    "정상": 10,
    "관심": 35,
    "주의": 55,
    "경계": 75,
    "심각": 95,
}

# Used only where the KRC farmland layer has no polygon (mostly dense urban
# legal-dong records). Rural selections preferentially use a farmland centroid.
PROVINCE_CENTERS = {
    "서울특별시": {"latitude": 37.5665, "longitude": 126.9780},
    "부산광역시": {"latitude": 35.1796, "longitude": 129.0756},
    "대구광역시": {"latitude": 35.8714, "longitude": 128.6014},
    "인천광역시": {"latitude": 37.4563, "longitude": 126.7052},
    "대전광역시": {"latitude": 36.3504, "longitude": 127.3845},
    "울산광역시": {"latitude": 35.5384, "longitude": 129.3114},
    "세종특별자치시": {"latitude": 36.4800, "longitude": 127.2890},
    "경기도": {"latitude": 37.4138, "longitude": 127.5183},
    "강원특별자치도": {"latitude": 37.8228, "longitude": 128.1555},
    "충청북도": {"latitude": 36.6357, "longitude": 127.4917},
    "충청남도": {"latitude": 36.6588, "longitude": 126.6728},
    "전북특별자치도": {"latitude": 35.7175, "longitude": 127.1530},
    "전남광주통합특별시": {"latitude": 35.0800, "longitude": 126.8200},
    "경상북도": {"latitude": 36.4919, "longitude": 128.8889},
    "경상남도": {"latitude": 35.4606, "longitude": 128.2132},
    "제주특별자치도": {"latitude": 33.4996, "longitude": 126.5312},
}


def optional_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def read_drought_snapshot() -> tuple[dict[str, dict], dict[str, list[dict]]]:
    latest_by_code: dict[str, dict] = {}
    latest_by_city: dict[str, list[dict]] = {}
    with KRC_DROUGHT_CSV.open(encoding="cp949", newline="") as handle:
        for row in csv.DictReader(handle):
            code = str(row["시군코드"]).strip().zfill(5)
            observed_at = row["기준일자"].strip()
            previous = latest_by_code.get(code)
            if previous and previous["observedAt"] >= observed_at:
                continue

            reservoir = optional_float(row["저수율(퍼센트)"])
            normal = optional_float(row["평년(퍼센트)"])
            # KRC uses 0/0 for areas without an applicable agricultural reservoir.
            if reservoir == 0 and normal == 0:
                reservoir = None
            stage = row["가뭄단계"].strip()
            snapshot = {
                "observedAt": observed_at,
                "province": row["시도명"].strip(),
                "city": row["시군명"].strip(),
                "droughtStage": stage or None,
                "droughtRisk": DROUGHT_RISK_BY_STAGE.get(stage),
                "reservoirLevel": reservoir,
            }
            latest_by_code[code] = snapshot

    for snapshot in latest_by_code.values():
        latest_by_city.setdefault(snapshot["city"], []).append(snapshot)
    return latest_by_code, latest_by_city


def read_farmland_centroids() -> tuple[dict[str, dict], dict[str, dict]]:
    """Return representative WGS84 points weighted by farmland polygon bboxes."""
    reader = shapefile.Reader(str(FARMLAND_SHP), encoding="cp949")
    by_code_accumulator: dict[str, list[float]] = {}
    by_prefix_accumulator: dict[str, list[float]] = {}

    for shape, record in zip(
        reader.iterShapes(), reader.iterRecords(fields=["COL_ADM_SE"])
    ):
        code = str(record[0]).strip()
        if len(code) != 5 or not shape.bbox:
            continue
        xmin, ymin, xmax, ymax = shape.bbox
        weight = max((xmax - xmin) * (ymax - ymin), 1.0)
        center_x = (xmin + xmax) / 2
        center_y = (ymin + ymax) / 2
        for key, target in ((code, by_code_accumulator), (code[:2], by_prefix_accumulator)):
            total = target.setdefault(key, [0.0, 0.0, 0.0])
            total[0] += center_x * weight
            total[1] += center_y * weight
            total[2] += weight

    transformer = Transformer.from_crs("EPSG:5186", "EPSG:4326", always_xy=True)

    def transform_all(accumulator: dict[str, list[float]]) -> dict[str, dict]:
        result = {}
        for key, (weighted_x, weighted_y, total_weight) in accumulator.items():
            longitude, latitude = transformer.transform(
                weighted_x / total_weight, weighted_y / total_weight
            )
            result[key] = {
                "latitude": round(latitude, 5),
                "longitude": round(longitude, 5),
            }
        return result

    return transform_all(by_code_accumulator), transform_all(by_prefix_accumulator)


def build_regions() -> list[dict]:
    drought_by_code, drought_by_city = read_drought_snapshot()
    farmland_by_code, farmland_by_prefix = read_farmland_centroids()
    regions: list[dict] = []
    seen_paths: set[tuple[str, str, str]] = set()

    with LEGAL_DONG_CSV.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            province = row["시도명"].strip()
            city = row["시군구명"].strip()
            township = row["읍면동명"].strip()
            village = row["리명"].strip()
            code = row["법정동코드"].strip()

            # One selectable row per legal eup/myeon/dong. Ri rows are children
            # of these records and would duplicate the current three-step UI.
            if not city or not township or village:
                continue
            path = (province, city, township)
            if path in seen_paths:
                continue
            seen_paths.add(path)

            drought = drought_by_code.get(code[:5]) or drought_by_code.get(f"{code[:2]}000")
            if not drought:
                city_matches = drought_by_city.get(city, [])
                # Handles code reorganizations such as Jeonbuk Special Self-Governing
                # Province without guessing when names like Jung-gu are ambiguous.
                if len(city_matches) == 1:
                    drought = city_matches[0]
            drought = drought or {}
            coordinates = farmland_by_code.get(code[:5])
            coordinate_precision = "시군구 농지 중심"
            if not coordinates:
                coordinates = farmland_by_prefix.get(code[:2])
                coordinate_precision = "시도 농지 중심"
            if not coordinates:
                coordinates = PROVINCE_CENTERS.get(province)
                coordinate_precision = "시도 대표 좌표"
            source_note = "국토교통부 전국 법정동 2026-06-30"
            if drought.get("observedAt"):
                source_note += f" · KRC 논가뭄지도 {drought['observedAt']}"

            regions.append(
                {
                    "id": code,
                    "name": f"{province} {city} {township}",
                    "province": province,
                    "city": city,
                    "township": township,
                    "coordinates": coordinates,
                    "coordinatePrecision": coordinate_precision if coordinates else None,
                    "site": {
                        "droughtRisk": drought.get("droughtRisk"),
                        "droughtStage": drought.get("droughtStage"),
                        "reservoirLevel": drought.get("reservoirLevel"),
                        "salinityEC": None,
                        "groundwaterStability": None,
                        "soilPh": None,
                        "frostRisk": None,
                        "climateZone": None,
                        "zoneType": None,
                        "recentCropHistory": [],
                    },
                    "source_note": source_note,
                }
            )
    return regions


def main() -> None:
    regions = build_regions()
    payload = {
        "_note": (
            "전국 법정 읍·면·동 목록입니다. 가뭄·저수율은 KRC 시군구 자료를 연결했고, "
            "좌표/필지 조회가 필요한 토양·염도·지하수·서리·농지 용도 값은 임의 생성하지 않습니다."
        ),
        "legalDongAsOf": "2026-06-30",
        "regionCount": len(regions),
        "regions": regions,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(regions):,} regions to {OUTPUT}")


if __name__ == "__main__":
    main()
