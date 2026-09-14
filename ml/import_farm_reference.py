"""Import KRC farm zones and latest reservoir water quality into Supabase.

Required environment variables:
  EXPO_PUBLIC_SUPABASE_URL
  FARM_IMPORT_SECRET
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import urllib.request
from pathlib import Path

import shapefile
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform
from shapely.validation import make_valid


ROOT = Path(__file__).resolve().parents[1]
ZONE_SHP = ROOT / "data" / "raw" / "krc" / "한국농어촌공사_농업진흥지역도_20251231" / "LSMD_CONT_UE101_202512.shp"
WATER_CSV = ROOT / "data" / "raw" / "krc" / "한국농어촌공사_농업용저수지 수질정보_20251231.csv"
TO_WGS84 = Transformer.from_crs("EPSG:5186", "EPSG:4326", always_xy=True).transform
WELL_SHP = next((ROOT / "data" / "raw" / "krc").glob("**/gdb_well_info_new_2025.shp"))


def optional_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def load_env() -> None:
    for path in (ROOT / ".env", ROOT / "seedjong-navi" / ".env"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def post(action: str, rows: list[dict] | None = None) -> dict:
    base_url = os.environ["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
    secret = os.environ["FARM_IMPORT_SECRET"]
    body = json.dumps({"action": action, "rows": rows or []}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/functions/v1/import-farm-reference",
        data=body,
        headers={"Content-Type": "application/json", "x-import-secret": secret},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.loads(response.read())


def zone_rows():
    reader = shapefile.Reader(str(ZONE_SHP), encoding="cp949")
    for record, raw_shape in zip(
        reader.iterRecords(fields=["MNUM", "COL_ADM_SE"]), reader.iterShapes()
    ):
        source_id, sigungu_code = str(record[0]).strip(), str(record[1]).strip()
        zone_type = "jinheung" if "UEA110" in source_id else "boho" if "UEA120" in source_id else None
        if not zone_type:
            continue
        geometry = make_valid(shape(raw_shape.__geo_interface__))
        geometry = transform(TO_WGS84, geometry).simplify(0.00001, preserve_topology=True)
        if geometry.geom_type == "Polygon":
            geometry = make_valid(geometry)
        if geometry.geom_type not in ("Polygon", "MultiPolygon") or geometry.is_empty:
            continue
        yield {
            "source_id": source_id,
            "sigungu_code": sigungu_code,
            "zone_type": zone_type,
            "geometry": mapping(geometry),
        }


def latest_reservoir_rows() -> list[dict]:
    latest = {}
    with WATER_CSV.open(encoding="cp949", newline="") as handle:
        for row in csv.DictReader(handle):
            code = row["시설코드"].strip()
            observed_at = row["조사일자"].strip()
            if code in latest and latest[code]["observed_at"] >= observed_at:
                continue
            try:
                ph = float(row["수소이온농도"])
                ec_us_cm = float(row["전기전도도"])
            except ValueError:
                ph = ec_us_cm = 0
            latest[code] = {
                "facility_code": code,
                "facility_name": row["시설명"].strip(),
                "address": row["주소"].strip(),
                "observed_at": observed_at or None,
                "water_ph": ph if ph > 0 else None,
                "electrical_conductivity_us_cm": ec_us_cm if ec_us_cm > 0 else None,
                "electrical_conductivity_ds_m": round(ec_us_cm / 1000, 4) if ec_us_cm > 0 else None,
                "source_name": "KRC 농업용저수지 수질정보 2025-12-31",
            }
    return list(latest.values())


def groundwater_well_rows():
    reader = shapefile.Reader(str(WELL_SHP), encoding="cp949")
    fields = [field[0] for field in reader.fields[1:]]
    for shape, record in zip(reader.iterShapes(), reader.iterRecords()):
        if not shape.points:
            continue
        row = dict(zip(fields, record))
        try:
            x, y = shape.points[0]
            longitude, latitude = TO_WGS84(x, y)
        except (TypeError, ValueError):
            continue
        if not (30 <= latitude <= 40 and 120 <= longitude <= 135):
            continue
        yield {
            "well_id": str(row["well_id"]),
            "address": row.get("address") or None,
            "use_code": row.get("well_use") or None,
            "well_depth_m": optional_float(row.get("well_depth")),
            "pump_capacity_m3_day": optional_float(row.get("pump_abili")),
            "latitude": latitude,
            "longitude": longitude,
        }


def send_batches(action: str, rows, max_bytes: int = 1_500_000, max_rows: int = 100) -> None:
    batch, size, total = [], 0, 0
    for row in rows:
        row_size = len(json.dumps(row, ensure_ascii=False).encode("utf-8"))
        if batch and (len(batch) >= max_rows or size + row_size > max_bytes):
            result = post(action, batch)
            total += int(result.get("inserted", 0))
            print(f"{action}: {total:,} imported")
            batch, size = [], 0
        batch.append(row)
        size += row_size
    if batch:
        result = post(action, batch)
        total += int(result.get("inserted", 0))
    print(f"{action}: complete ({total:,})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--zones-only", action="store_true")
    parser.add_argument("--reservoirs-only", action="store_true")
    parser.add_argument("--wells-only", action="store_true")
    args = parser.parse_args()
    load_env()
    if not os.getenv("EXPO_PUBLIC_SUPABASE_URL") or not os.getenv("FARM_IMPORT_SECRET"):
        raise SystemExit("EXPO_PUBLIC_SUPABASE_URL and FARM_IMPORT_SECRET are required")
    if args.reset:
        print(post("reset"))
    if not args.reservoirs_only and not args.wells_only:
        send_batches("zones", zone_rows())
    if not args.zones_only and not args.wells_only:
        send_batches("reservoirs", latest_reservoir_rows(), max_rows=20)
    if args.wells_only:
        send_batches("groundwater-wells", groundwater_well_rows(), max_rows=500)


if __name__ == "__main__":
    main()
