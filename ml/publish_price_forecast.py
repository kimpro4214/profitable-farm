"""Publish the validated KAMIS forecast snapshot to Supabase."""

import json
import os
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FORECASTS = ROOT / "seedjong-navi" / "data" / "price_forecasts.json"


def main() -> None:
    payload = json.loads(FORECASTS.read_text(encoding="utf-8"))
    items = payload.get("items")
    if not isinstance(items, list) or len(items) < 10:
        raise RuntimeError("예측 품목이 10개 미만이라 기존 배포 데이터를 유지합니다.")
    today = date.today()
    if not any(date.fromisoformat(item["forecastDate"]) >= today for item in items):
        raise RuntimeError("예측일이 모두 지난 데이터라 기존 배포 데이터를 유지합니다.")

    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SECRET_KEY"]
    row = {"id": 1, "data": payload, "updated_at": datetime.now(timezone.utc).isoformat()}
    request = urllib.request.Request(
        f"{url}/rest/v1/price_forecast_snapshots?on_conflict=id",
        data=json.dumps(row, ensure_ascii=False).encode("utf-8"),
        headers={
            "apikey": key,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status not in (200, 201, 204):
                raise RuntimeError(f"Supabase 게시 실패 (HTTP {response.status})")
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Supabase 게시 실패 (HTTP {error.code})") from None
    print(f"가격 예측 {len(items)}개 품목 게시 완료")


if __name__ == "__main__":
    main()
