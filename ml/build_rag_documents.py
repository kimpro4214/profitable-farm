"""Build a small, auditable RAG corpus from downloaded public CSV files.

No API key is used here. The generated TypeScript file is bundled with the
Edge Function; Gemini embeddings are created server-side on the first request.
"""
from __future__ import annotations

import csv
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data" / "raw" / "rag" / "krc"
KRC_RAW = ROOT / "data" / "raw" / "krc"
OUTPUT = ROOT / "seedjong-navi" / "supabase" / "functions" / "ask-rag" / "imported_documents.ts"

def open_csv(path: Path):
    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            with path.open("r", encoding=encoding, newline="") as handle:
                return list(csv.DictReader(handle))
        except UnicodeDecodeError:
            continue
    return []

def number(value: str | None) -> float:
    try:
        return float((value or "").replace(",", "").strip())
    except ValueError:
        return 0

docs = []
facility_files = list(INPUT.glob("한국농어촌공사_농업기반시설*.csv"))
facility_files += [
    KRC_RAW / "한국농어촌공사_논가뭄지도_20251231.csv",
    KRC_RAW / "한국농어촌공사_농업용저수지 수질정보_20251231.csv",
]
for path in facility_files:
    rows = open_csv(path)
    if not rows:
        continue
    locations = defaultdict(lambda: {"count": 0, "benefit": 0, "storage": 0})
    for row in rows:
        location = (row.get("소재지") or "소재지 미상").split()[0]
        item = locations[location]
        item["count"] += 1
        item["benefit"] += number(row.get("수혜면적"))
        item["storage"] += number(row.get("유효저수량"))
    top = sorted(locations.items(), key=lambda item: item[1]["count"], reverse=True)[:12]
    location_text = "; ".join(
        f"{name}: 시설 {v['count']}개, 수혜면적 합계 약 {v['benefit']:,.1f}ha"
        + (f", 유효저수량 합계 약 {v['storage']:,.1f}" if v["storage"] else "")
        for name, v in top
    )
    title = path.stem
    docs.append({
        "title": title,
        "source_url": None,
        "content": f"한국농어촌공사 공개 파일 '{title}'의 시설제원 요약이다. 총 {len(rows):,}건을 집계했다. 주요 시도별 현황: {location_text}. 이 자료는 시설 현황·용수 기반을 파악하는 참고용이며, 실시간 수위나 실제 공급 가능량을 뜻하지 않는다.",
        "metadata": {"organization": "한국농어촌공사", "source_file": path.name, "type": "facility_summary", "import_version": "3"},
    })

# 농진청 노지 데이터는 파일별 숫자를 그대로 단정하지 않고, 작물·연도·보유항목
# 자체를 검색 가능한 근거 문서로 만든다.
for path in sorted(INPUT.rglob("공개용_생육기본_*.csv")):
    rows = open_csv(path)
    if not rows:
        continue
    headers = list(rows[0])[:16]
    crop = re.sub(r"^공개용_생육기본_|_[0-9]{2}년$", "", path.stem)
    year = next((part for part in path.parts if part.isdigit() and len(part) == 4), "연도 미상")
    docs.append({
        "title": f"농촌진흥청 노지 현장 농가 데이터 - {crop} ({year})",
        "source_url": None,
        "content": f"농촌진흥청 공개 노지 현장 농가 데이터의 {crop} {year}년 생육기본 파일이다. {len(rows):,}건의 관측 행이 있으며 주요 항목은 {', '.join(headers)}이다. 이 자료는 실제 농가 관측 기반의 생육·재배 정보이며, 개별 농가 조건이 달라 전국 표준 수치로 일반화해서는 안 된다.",
        "metadata": {"organization": "농촌진흥청", "source_file": path.name, "type": "field_crop_data", "import_version": "3"},
    })

for path in INPUT.rglob("*.hwpx"):
    try:
        with zipfile.ZipFile(path) as archive:
            xml = "\n".join(archive.read(name).decode("utf-8", "ignore") for name in archive.namelist() if name.endswith(".xml"))
        text = re.sub(r"<[^>]+>", " ", xml)
        text = re.sub(r"\s+", " ", text).strip()[:7000]
    except (OSError, zipfile.BadZipFile):
        text = ""
    if text:
        docs.append({
            "title": path.stem,
            "source_url": None,
            "content": text,
            "metadata": {"organization": "농촌진흥청", "source_file": path.name, "type": "cultivation_manual", "import_version": "3"},
        })

# 시설채소는 최신 2024년 작기 생육 파일만 작물별로 추가한다.
for path in sorted(INPUT.rglob("*_2024_생육_통합.csv")):
    rows = open_csv(path)
    if not rows:
        continue
    crop = path.stem.split("_2024_")[0]
    headers = list(rows[0])[:18]
    docs.append({
        "title": f"농촌진흥청 스마트팜 현장 농가 데이터 - {crop} (2024)",
        "source_url": None,
        "content": f"농촌진흥청 스마트팜 현장 농가 데이터의 {crop} 2024년 생육 관측 파일이다. {len(rows):,}건의 관측 행과 주요 항목 {', '.join(headers)}을 포함한다. 시설재배 농가의 환경·생육 정보를 이해하는 참고 자료이며, 개별 농가의 시설·품종·관리 조건이 다르므로 전국 표준값으로 단정하지 않는다.",
        "metadata": {"organization": "농촌진흥청", "source_file": path.name, "type": "smartfarm_crop_data", "import_version": "3"},
    })

for path in sorted(INPUT.rglob("온라인매뉴얼*.csv")):
    rows = open_csv(path)
    if not rows:
        continue
    docs.append({
        "title": f"농촌진흥청 국가병해충관리 {path.stem}",
        "source_url": None,
        "content": f"농촌진흥청 국가병해충관리시스템의 {path.stem} 데이터다. {len(rows):,}건이 있으며 주요 항목은 {', '.join(list(rows[0])[:18])}이다. 병해충 의심 시 작물명, 발생 시기, 증상, 사진, 지역 정보를 확인해 공식 진단·상담 절차를 이용하는 데 참고한다.",
        "metadata": {"organization": "농촌진흥청", "source_file": path.name, "type": "pest_guidance", "import_version": "3"},
    })

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(
    "export const importedDocuments = " + json.dumps(docs, ensure_ascii=False, indent=2) + " as const;\n",
    encoding="utf-8",
)
print(f"Wrote {len(docs)} documents to {OUTPUT}")
