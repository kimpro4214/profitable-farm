/**
 * 파종내비 — 농지 조건 기반 작물 추천 매칭 로직
 *
 * ⚠ 중요: CROPS 안의 가격(price)/수확량(yield)/비용(cost)/보조금(subsidy)/가격변동성(priceVolatility) 수치는
 * 전부 예시(mock) 값입니다. 실제 서비스에서는:
 *   - price          → KAMIS 농산물유통정보 Open API
 *   - subsidy        → 농림축산식품부 공익직불제(전략작물직불금) 대상 품목 정보
 *   - priceVolatility → KAMIS 과거 가격 시계열의 변동계수 등으로 교체
 * 로 교체해야 합니다. 지금은 로직 검증용 자리표시자입니다.
 *
 * 이 파일은 프레임워크/외부 라이브러리 없이 순수 JS로 작성되어,
 * <script> 태그로 바로 불러 쓰거나 Node로 바로 테스트할 수 있습니다.
 */

// ---------------------------------------------------------------------------
// 1. 평가 축(8개)과 가중치 — 합계 100
// ---------------------------------------------------------------------------
const WEIGHTS = {
  drought: 15,       // 가뭄 위험도 (KRC: 가뭄예경보/논가뭄지도)
  reservoir: 15,     // 관개용수 확보 가능성 (KRC: 저수지 저수율/수위)
  salinity: 15,      // 염도·수질 적합성 (KRC: 농업용저수지 수질정보)
  groundwater: 10,   // 지하수 관개 안정성 (KRC: 지하수 수위/수질)
  zone: 10,          // 농지 용도 제약 (KRC: 농업진흥지역 지정현황)
  climate: 15,       // 생육적산온도·서리 위험 (기상청)
  soilPh: 10,        // 토양 산도 (농촌진흥청 흙토람)
  pestHistory: 10,   // 연작·병해충 이력 (농촌진흥청 병해충 예찰)
};

// ---------------------------------------------------------------------------
// 2. 작물 프로필 (예시 12종 — 실제 서비스에서는 확장 가능)
// ---------------------------------------------------------------------------
const CROPS = [
  {
    name: "벼", family: "화본과",
    droughtTolerance: 30, irrigationDependency: 90, salinityToleranceEC: 4,
    phRange: [5.5, 7.0], climate: "temperate", frostSensitive: true,
    needsPostHarvestFacility: false, difficulty: "easy",
    econ: { yieldKg: 500, priceWon: 2200, costWon: 700000, subsidyWon: 0, priceVolatility: 0.08 },
  },
  {
    name: "콩(대두)", family: "콩과",
    droughtTolerance: 55, irrigationDependency: 40, salinityToleranceEC: 2,
    phRange: [6.0, 7.0], climate: "temperate", frostSensitive: false,
    needsPostHarvestFacility: false, difficulty: "mid",
    econ: { yieldKg: 200, priceWon: 4500, costWon: 400000, subsidyWon: 200000, priceVolatility: 0.12 },
  },
  {
    name: "밀", family: "화본과",
    droughtTolerance: 60, irrigationDependency: 30, salinityToleranceEC: 6,
    phRange: [5.5, 7.5], climate: "cool", frostSensitive: false,
    needsPostHarvestFacility: false, difficulty: "mid",
    econ: { yieldKg: 350, priceWon: 1800, costWon: 350000, subsidyWon: 250000, priceVolatility: 0.1 },
  },
  {
    name: "감자", family: "가지과",
    droughtTolerance: 45, irrigationDependency: 50, salinityToleranceEC: 1.7,
    phRange: [5.0, 6.5], climate: "cool", frostSensitive: true,
    needsPostHarvestFacility: true, difficulty: "mid",
    econ: { yieldKg: 3000, priceWon: 1200, costWon: 1800000, subsidyWon: 0, priceVolatility: 0.25 },
  },
  {
    name: "고구마", family: "메꽃과",
    droughtTolerance: 80, irrigationDependency: 25, salinityToleranceEC: 3,
    phRange: [5.5, 6.8], climate: "warm", frostSensitive: true,
    needsPostHarvestFacility: true, difficulty: "easy",
    econ: { yieldKg: 2000, priceWon: 2000, costWon: 1500000, subsidyWon: 0, priceVolatility: 0.15 },
  },
  {
    name: "옥수수(사료용)", family: "화본과",
    droughtTolerance: 50, irrigationDependency: 45, salinityToleranceEC: 1.8,
    phRange: [5.8, 7.0], climate: "warm", frostSensitive: true,
    needsPostHarvestFacility: false, difficulty: "easy",
    econ: { yieldKg: 1500, priceWon: 1500, costWon: 900000, subsidyWon: 200000, priceVolatility: 0.1 },
  },
  {
    name: "배추", family: "십자화과",
    droughtTolerance: 35, irrigationDependency: 55, salinityToleranceEC: 1.8,
    phRange: [6.0, 7.0], climate: "cool", frostSensitive: true,
    needsPostHarvestFacility: false, difficulty: "mid",
    econ: { yieldKg: 5000, priceWon: 800, costWon: 2000000, subsidyWon: 0, priceVolatility: 0.35 },
  },
  {
    name: "양파", family: "백합과",
    droughtTolerance: 40, irrigationDependency: 50, salinityToleranceEC: 1.2,
    phRange: [6.0, 7.0], climate: "temperate", frostSensitive: false,
    needsPostHarvestFacility: true, difficulty: "mid",
    econ: { yieldKg: 4500, priceWon: 900, costWon: 2200000, subsidyWon: 0, priceVolatility: 0.35 },
  },
  {
    name: "마늘", family: "백합과",
    droughtTolerance: 45, irrigationDependency: 45, salinityToleranceEC: 1.2,
    phRange: [5.5, 6.5], climate: "temperate", frostSensitive: false,
    needsPostHarvestFacility: true, difficulty: "mid",
    econ: { yieldKg: 1200, priceWon: 3500, costWon: 2500000, subsidyWon: 0, priceVolatility: 0.3 },
  },
  {
    name: "고추", family: "가지과",
    droughtTolerance: 35, irrigationDependency: 55, salinityToleranceEC: 1.5,
    phRange: [6.0, 6.8], climate: "warm", frostSensitive: true,
    needsPostHarvestFacility: true, difficulty: "hard",
    econ: { yieldKg: 300, priceWon: 12000, costWon: 2000000, subsidyWon: 0, priceVolatility: 0.3 },
  },
  {
    name: "유채", family: "십자화과",
    droughtTolerance: 55, irrigationDependency: 20, salinityToleranceEC: 7,
    phRange: [5.5, 7.5], climate: "any", frostSensitive: false,
    needsPostHarvestFacility: false, difficulty: "easy",
    econ: { yieldKg: 200, priceWon: 1500, costWon: 150000, subsidyWon: 0, priceVolatility: 0.12 },
  },
  {
    name: "조사료(청보리)", family: "화본과",
    droughtTolerance: 70, irrigationDependency: 20, salinityToleranceEC: 6,
    phRange: [5.5, 7.5], climate: "any", frostSensitive: false,
    needsPostHarvestFacility: false, difficulty: "easy",
    econ: { yieldKg: 2500, priceWon: 400, costWon: 400000, subsidyWon: 300000, priceVolatility: 0.1 },
  },
];

// 최근 공급과잉(재배의향면적 급증) mock 경고 목록 — 실제로는 KREI 통계로 교체
const OVERSUPPLY_WARNING_CROPS = ["양파", "마늘"];

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// 3. 축별 점수 함수
// ---------------------------------------------------------------------------
function scoreDrought(site, crop) {
  return clamp(100 - Math.max(0, site.droughtRisk - crop.droughtTolerance));
}

function scoreReservoir(site, crop) {
  return clamp(100 - Math.max(0, crop.irrigationDependency - site.reservoirLevel));
}

function scoreSalinity(site, crop) {
  if (site.salinityEC <= crop.salinityToleranceEC) return 100;
  const over = site.salinityEC - crop.salinityToleranceEC;
  return clamp(100 - over * 25);
}

function scoreGroundwater(site, crop) {
  // 지하수는 저수지의 보조 수단이므로 절반 가중으로 반영
  return clamp(100 - Math.max(0, crop.irrigationDependency - site.groundwaterStability) * 0.5);
}

function scoreZone(site, crop) {
  if (!crop.needsPostHarvestFacility) return 100;
  if (site.zoneType === "jinheung") return 40;   // 농업진흥구역: 부대시설 신축 사실상 제한
  if (site.zoneType === "boho") return 70;       // 농업보호구역: 조건부 가능
  return 100;                                     // 일반농지
}

function scoreClimate(site, crop) {
  let score = 100;
  if (crop.climate !== "any" && crop.climate !== site.climateZone) score -= 40;
  if (crop.frostSensitive) score -= site.frostRisk * 0.5;
  return clamp(score);
}

function scoreSoilPh(site, crop) {
  const [lo, hi] = crop.phRange;
  if (site.soilPh >= lo && site.soilPh <= hi) return 100;
  const dist = site.soilPh < lo ? lo - site.soilPh : site.soilPh - hi;
  return clamp(100 - dist * 30);
}

function scorePestHistory(site, crop) {
  const hit = (site.recentCropHistory || []).some(
    (h) => h.pestIssue && findCropFamily(h.crop) === crop.family
  );
  return hit ? 40 : 100;
}

function findCropFamily(cropName) {
  const found = CROPS.find((c) => c.name === cropName);
  return found ? found.family : null;
}

// ---------------------------------------------------------------------------
// 4. 손익 참고치 (전부 mock 수치, 실제 서비스에서는 KAMIS/직불제 데이터로 교체)
//    priceVolatility: 최근 가격 변동성 예시치(0~1). 수확량/비용/보조금은 고정으로 보고
//    가격 변동만 반영해 손익 참고 범위(profitLow~profitHigh)를 계산한다.
// ---------------------------------------------------------------------------
const RISK_LABELS = [
  { max: 0.12, label: "안정적" },
  { max: 0.25, label: "보통" },
  { max: Infinity, label: "변동성 높음" },
];

function riskLabel(volatility) {
  return RISK_LABELS.find((r) => volatility <= r.max).label;
}

function estimateProfit(crop, areaSqm) {
  const factor = areaSqm / 1000; // econ 값은 1,000㎡ 기준
  const revenue = crop.econ.yieldKg * crop.econ.priceWon * factor;
  const cost = crop.econ.costWon * factor;
  const subsidy = crop.econ.subsidyWon * factor;
  const profit = revenue - cost + subsidy;
  const volatility = crop.econ.priceVolatility ?? 0.15;
  const swing = revenue * volatility;
  return {
    revenue: Math.round(revenue),
    cost: Math.round(cost),
    subsidy: Math.round(subsidy),
    profit: Math.round(profit),
    profitLow: Math.round(profit - swing),
    profitHigh: Math.round(profit + swing),
    volatility,
    riskLabel: riskLabel(volatility),
  };
}

// ---------------------------------------------------------------------------
// 5. 작물 1개 평가 + 메인 함수: 농지 조건 → 작물 추천 리스트
// ---------------------------------------------------------------------------
function evaluateCrop(site, crop, areaSqm) {
  const axisScores = {
    drought: scoreDrought(site, crop),
    reservoir: scoreReservoir(site, crop),
    salinity: scoreSalinity(site, crop),
    groundwater: scoreGroundwater(site, crop),
    zone: scoreZone(site, crop),
    climate: scoreClimate(site, crop),
    soilPh: scoreSoilPh(site, crop),
    pestHistory: scorePestHistory(site, crop),
  };

  const totalScore =
    Object.keys(WEIGHTS).reduce(
      (sum, key) => sum + axisScores[key] * WEIGHTS[key],
      0
    ) / 100;

  const warnings = [];
  if (axisScores.pestHistory < 100) {
    warnings.push(`최근 같은 작물군(${crop.family}) 병해충 이력 있음 → 방제비용 증가 가능성`);
  }
  if (axisScores.zone < 100) {
    warnings.push("저장·건조 등 부대시설 신축이 농지 용도상 제한될 수 있음");
  }
  if (OVERSUPPLY_WARNING_CROPS.includes(crop.name)) {
    warnings.push("최근 재배의향면적 증가 추세 품목 → 공급과잉·가격하락 위험 참고");
  }

  return {
    name: crop.name,
    family: crop.family,
    totalScore: Math.round(totalScore),
    axisScores,
    warnings,
    profit: estimateProfit(crop, areaSqm),
  };
}

function recommendCrops(site, areaSqm = 1000) {
  return CROPS.map((crop) => evaluateCrop(site, crop, areaSqm)).sort(
    (a, b) => b.totalScore - a.totalScore
  );
}

// Node/브라우저 양쪽에서 쓸 수 있도록 export
if (typeof module !== "undefined") {
  module.exports = { recommendCrops, evaluateCrop, CROPS, WEIGHTS };
}
