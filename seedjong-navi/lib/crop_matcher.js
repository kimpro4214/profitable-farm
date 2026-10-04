/**
 * 수익농가 — 농지 조건 기반 작물 추천 매칭 로직
 *
 * 가격과 가격 범위는 KAMIS 도매가격·기상청 ASOS로 학습한 예측 산출물을
 * 우선 사용한다. 수확량·경영비는 농촌진흥청 2019~2024 소득자료로 검증된
 * 산출물을 사용하고, 산출물이 없는 품목만 기존 기준값으로 대체한다.
 *
 * 이 파일은 프레임워크/외부 라이브러리 없이 순수 JS로 작성되어,
 * <script> 태그로 바로 불러 쓰거나 Node로 바로 테스트할 수 있습니다.
 */

// ---------------------------------------------------------------------------
// 1. 평가 축(8개)과 가중치 — 합계 100
// ---------------------------------------------------------------------------
const PRICE_FORECASTS = require("../data/price_forecasts.json").items || [];
const INCOME_ARTIFACT = require("../data/income_estimates.json");
const INCOME_ESTIMATES = INCOME_ARTIFACT.items || [];

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
// 2. 작물 프로필 (MVP 추천 대상 35종)
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
  // 아래 경제성 수치는 기존 항목과 마찬가지로 MVP용 참고값이다.
  { name: "보리", family: "화본과", droughtTolerance: 65, irrigationDependency: 25, salinityToleranceEC: 6, phRange: [5.5, 7.5], climate: "cool", frostSensitive: false, needsPostHarvestFacility: false, difficulty: "easy", econ: { yieldKg: 350, priceWon: 1600, costWon: 320000, subsidyWon: 200000, priceVolatility: 0.12 } },
  { name: "팥", family: "콩과", droughtTolerance: 60, irrigationDependency: 30, salinityToleranceEC: 2, phRange: [6.0, 7.0], climate: "temperate", frostSensitive: false, needsPostHarvestFacility: false, difficulty: "mid", econ: { yieldKg: 180, priceWon: 6500, costWon: 500000, subsidyWon: 0, priceVolatility: 0.2 } },
  { name: "녹두", family: "콩과", droughtTolerance: 65, irrigationDependency: 25, salinityToleranceEC: 2.5, phRange: [6.0, 7.0], climate: "warm", frostSensitive: true, needsPostHarvestFacility: false, difficulty: "mid", econ: { yieldKg: 150, priceWon: 9000, costWon: 550000, subsidyWon: 0, priceVolatility: 0.22 } },
  { name: "땅콩", family: "콩과", droughtTolerance: 70, irrigationDependency: 25, salinityToleranceEC: 3, phRange: [5.8, 6.8], climate: "warm", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "mid", econ: { yieldKg: 350, priceWon: 5000, costWon: 850000, subsidyWon: 0, priceVolatility: 0.18 } },
  { name: "참깨", family: "참깨과", droughtTolerance: 75, irrigationDependency: 20, salinityToleranceEC: 3, phRange: [5.5, 7.5], climate: "warm", frostSensitive: true, needsPostHarvestFacility: false, difficulty: "mid", econ: { yieldKg: 70, priceWon: 14000, costWon: 500000, subsidyWon: 0, priceVolatility: 0.18 } },
  { name: "들깨", family: "꿀풀과", droughtTolerance: 65, irrigationDependency: 25, salinityToleranceEC: 3, phRange: [5.5, 7.5], climate: "temperate", frostSensitive: true, needsPostHarvestFacility: false, difficulty: "mid", econ: { yieldKg: 160, priceWon: 7000, costWon: 700000, subsidyWon: 0, priceVolatility: 0.2 } },
  { name: "메밀", family: "마디풀과", droughtTolerance: 60, irrigationDependency: 20, salinityToleranceEC: 3, phRange: [5.0, 7.0], climate: "cool", frostSensitive: false, needsPostHarvestFacility: false, difficulty: "easy", econ: { yieldKg: 120, priceWon: 4500, costWon: 350000, subsidyWon: 0, priceVolatility: 0.18 } },
  { name: "무", family: "십자화과", droughtTolerance: 40, irrigationDependency: 55, salinityToleranceEC: 2, phRange: [5.8, 7.0], climate: "temperate", frostSensitive: false, needsPostHarvestFacility: false, difficulty: "mid", econ: { yieldKg: 6000, priceWon: 500, costWon: 1800000, subsidyWon: 0, priceVolatility: 0.3 } },
  { name: "양배추", family: "십자화과", droughtTolerance: 40, irrigationDependency: 55, salinityToleranceEC: 2, phRange: [6.0, 7.0], climate: "cool", frostSensitive: false, needsPostHarvestFacility: false, difficulty: "mid", econ: { yieldKg: 5000, priceWon: 650, costWon: 1900000, subsidyWon: 0, priceVolatility: 0.25 } },
  { name: "브로콜리", family: "십자화과", droughtTolerance: 35, irrigationDependency: 60, salinityToleranceEC: 1.8, phRange: [6.0, 7.0], climate: "cool", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "hard", econ: { yieldKg: 1500, priceWon: 2800, costWon: 2500000, subsidyWon: 0, priceVolatility: 0.28 } },
  { name: "상추", family: "국화과", droughtTolerance: 30, irrigationDependency: 60, salinityToleranceEC: 1.3, phRange: [6.0, 7.0], climate: "temperate", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "mid", econ: { yieldKg: 2500, priceWon: 2200, costWon: 2300000, subsidyWon: 0, priceVolatility: 0.32 } },
  { name: "시금치", family: "비름과", droughtTolerance: 35, irrigationDependency: 55, salinityToleranceEC: 2, phRange: [6.0, 7.5], climate: "cool", frostSensitive: false, needsPostHarvestFacility: true, difficulty: "mid", econ: { yieldKg: 1800, priceWon: 2500, costWon: 1700000, subsidyWon: 0, priceVolatility: 0.28 } },
  { name: "당근", family: "산형과", droughtTolerance: 45, irrigationDependency: 45, salinityToleranceEC: 2, phRange: [5.8, 6.8], climate: "cool", frostSensitive: false, needsPostHarvestFacility: true, difficulty: "mid", econ: { yieldKg: 4000, priceWon: 900, costWon: 1800000, subsidyWon: 0, priceVolatility: 0.22 } },
  { name: "대파", family: "백합과", droughtTolerance: 40, irrigationDependency: 50, salinityToleranceEC: 1.8, phRange: [6.0, 7.0], climate: "temperate", frostSensitive: false, needsPostHarvestFacility: false, difficulty: "mid", econ: { yieldKg: 3000, priceWon: 1400, costWon: 2200000, subsidyWon: 0, priceVolatility: 0.3 } },
  { name: "오이", family: "박과", droughtTolerance: 30, irrigationDependency: 65, salinityToleranceEC: 1.5, phRange: [5.5, 6.8], climate: "warm", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "hard", econ: { yieldKg: 7000, priceWon: 1200, costWon: 4000000, subsidyWon: 0, priceVolatility: 0.3 } },
  { name: "애호박", family: "박과", droughtTolerance: 35, irrigationDependency: 60, salinityToleranceEC: 1.8, phRange: [5.5, 6.8], climate: "warm", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "mid", econ: { yieldKg: 5000, priceWon: 1300, costWon: 2800000, subsidyWon: 0, priceVolatility: 0.28 } },
  { name: "토마토", family: "가지과", droughtTolerance: 35, irrigationDependency: 60, salinityToleranceEC: 2.5, phRange: [5.5, 6.8], climate: "warm", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "hard", econ: { yieldKg: 6000, priceWon: 1800, costWon: 4500000, subsidyWon: 0, priceVolatility: 0.25 } },
  { name: "가지", family: "가지과", droughtTolerance: 35, irrigationDependency: 60, salinityToleranceEC: 1.5, phRange: [5.5, 6.8], climate: "warm", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "hard", econ: { yieldKg: 3500, priceWon: 2000, costWon: 3300000, subsidyWon: 0, priceVolatility: 0.28 } },
  { name: "수박", family: "박과", droughtTolerance: 55, irrigationDependency: 45, salinityToleranceEC: 2.5, phRange: [5.5, 6.8], climate: "warm", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "hard", econ: { yieldKg: 5000, priceWon: 1100, costWon: 3000000, subsidyWon: 0, priceVolatility: 0.35 } },
  { name: "딸기", family: "장미과", droughtTolerance: 30, irrigationDependency: 65, salinityToleranceEC: 1.2, phRange: [5.5, 6.5], climate: "temperate", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "hard", econ: { yieldKg: 1800, priceWon: 7000, costWon: 8000000, subsidyWon: 0, priceVolatility: 0.25 } },
  { name: "사과", family: "장미과", droughtTolerance: 45, irrigationDependency: 40, salinityToleranceEC: 2, phRange: [5.5, 6.8], climate: "cool", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "hard", econ: { yieldKg: 2500, priceWon: 3500, costWon: 4500000, subsidyWon: 0, priceVolatility: 0.2 } },
  { name: "배", family: "장미과", droughtTolerance: 45, irrigationDependency: 45, salinityToleranceEC: 2, phRange: [5.5, 6.8], climate: "temperate", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "hard", econ: { yieldKg: 2200, priceWon: 4000, costWon: 4800000, subsidyWon: 0, priceVolatility: 0.2 } },
  { name: "포도", family: "포도과", droughtTolerance: 50, irrigationDependency: 35, salinityToleranceEC: 2, phRange: [5.5, 7.0], climate: "temperate", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "hard", econ: { yieldKg: 1800, priceWon: 5000, costWon: 5500000, subsidyWon: 0, priceVolatility: 0.22 } },
  { name: "복숭아", family: "장미과", droughtTolerance: 45, irrigationDependency: 40, salinityToleranceEC: 2, phRange: [5.5, 6.8], climate: "warm", frostSensitive: true, needsPostHarvestFacility: true, difficulty: "hard", econ: { yieldKg: 2000, priceWon: 4200, costWon: 5000000, subsidyWon: 0, priceVolatility: 0.25 } },
];

// 실시간 KREI 통계가 연결되기 전에는 공급과잉 경고를 임의 생성하지 않는다.
const OVERSUPPLY_WARNING_CROPS = [];

// ---------------------------------------------------------------------------
// 2-1. 파종·정식 적기(노지 재배 기준, 농촌진흥청 작목별 표준 재배력)
//      검증된 8축 점수(totalScore)에는 넣지 않는다. 추천 순위 레이어와
//      경고 문구로만 반영해, 기존 적합도 공식은 그대로 유지한다.
// ---------------------------------------------------------------------------
const PLANTING_CALENDAR = {
  "벼": { months: [4, 5, 6], label: "4~6월(파종·이앙)" },
  "콩(대두)": { months: [5, 6], label: "5~6월" },
  "밀": { months: [10, 11], label: "10~11월(가을 파종)" },
  "감자": { months: [3, 4, 8], label: "봄 3~4월 / 가을 8월" },
  "고구마": { months: [5, 6], label: "5~6월(순 정식)" },
  "옥수수(사료용)": { months: [4, 5, 6], label: "4~6월" },
  "배추": { months: [3, 4, 8, 9], label: "봄 3~4월 / 가을 8~9월" },
  "양파": { months: [10, 11], label: "10~11월(정식)" },
  "마늘": { months: [9, 10], label: "9~10월" },
  "고추": { months: [4, 5], label: "4~5월(정식)" },
  "유채": { months: [9, 10], label: "9~10월" },
  "조사료(청보리)": { months: [10, 11], label: "10~11월" },
  "보리": { months: [10, 11], label: "10~11월(가을 파종)" },
  "팥": { months: [6, 7], label: "6~7월" },
  "녹두": { months: [6, 7], label: "6~7월" },
  "땅콩": { months: [4, 5], label: "4~5월" },
  "참깨": { months: [5, 6], label: "5~6월" },
  "들깨": { months: [6, 7], label: "6~7월" },
  "메밀": { months: [5, 7, 8], label: "봄 5월 / 가을 7~8월" },
  "무": { months: [4, 8, 9], label: "봄 4월 / 가을 8~9월" },
  "양배추": { months: [3, 4, 8, 9], label: "봄 3~4월 / 가을 8~9월" },
  "브로콜리": { months: [3, 4, 7, 8], label: "봄 3~4월 / 가을 7~8월" },
  "상추": { months: [3, 4, 5, 8, 9], label: "3~5월 / 8~9월" },
  "시금치": { months: [3, 9, 10], label: "봄 3월 / 가을 9~10월" },
  "당근": { months: [3, 4, 7, 8], label: "봄 3~4월 / 가을 7~8월" },
  "대파": { months: [4, 5, 6], label: "4~6월(정식)" },
  "오이": { months: [4, 5], label: "4~5월(노지 정식)" },
  "애호박": { months: [4, 5], label: "4~5월" },
  "토마토": { months: [4, 5], label: "4~5월(정식)" },
  "가지": { months: [5], label: "5월(정식)" },
  "수박": { months: [4, 5], label: "4~5월(정식)" },
  "딸기": { months: [9], label: "9월(정식)" },
  // 다년생 과수는 '올해 심어 올해 수확'이 성립하지 않는다. 묘목 식재 적기만 안내한다.
  "사과": { months: [3, 4, 11], label: "묘목 식재 3~4월·11월", perennial: true, yearsToHarvest: "3~5년" },
  "배": { months: [3, 4, 11], label: "묘목 식재 3~4월·11월", perennial: true, yearsToHarvest: "4~6년" },
  "포도": { months: [3, 4, 11], label: "묘목 식재 3~4월·11월", perennial: true, yearsToHarvest: "2~4년" },
  "복숭아": { months: [3, 4, 11], label: "묘목 식재 3~4월·11월", perennial: true, yearsToHarvest: "3~4년" },
};

// 파종 적기와의 거리에 따른 추천 순위 가중치. 제철이 아닌 작물이 1순위로
// 올라오는 것을 막되, 적합도 자체를 왜곡하지 않도록 곱셈 계수로만 쓴다.
const SEASON_WEIGHT = { ok: 1, soon: 0.93, perennial: 0.82, off: 0.55, unknown: 1 };

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const hasNumber = (value) => Number.isFinite(value);
const monthsUntil = (target, from) => (target - from + 12) % 12;

function evaluateSeason(cropName, month) {
  const entry = PLANTING_CALENDAR[cropName];
  if (!entry) return { fit: "unknown", label: null, months: [], perennial: false };
  const distance = Math.min(...entry.months.map((m) => monthsUntil(m, month)));
  const nextMonth = entry.months.find((m) => monthsUntil(m, month) === distance);
  const fit = entry.perennial
    ? "perennial"
    : distance === 0
      ? "ok"
      : distance <= 2
        ? "soon"
        : "off";
  return {
    fit,
    label: entry.label,
    months: entry.months,
    perennial: Boolean(entry.perennial),
    yearsToHarvest: entry.yearsToHarvest || null,
    monthsUntilWindow: distance,
    nextPlantingMonth: nextMonth,
  };
}

// ---------------------------------------------------------------------------
// 3. 축별 점수 함수
// ---------------------------------------------------------------------------
function scoreDrought(site, crop) {
  if (!hasNumber(site.droughtRisk)) return 70;
  return clamp(100 - Math.max(0, site.droughtRisk - crop.droughtTolerance));
}

function scoreReservoir(site, crop) {
  if (!hasNumber(site.reservoirLevel)) return 70;
  return clamp(100 - Math.max(0, crop.irrigationDependency - site.reservoirLevel));
}

function scoreSalinity(site, crop) {
  if (!hasNumber(site.salinityEC)) return 70;
  if (site.salinityEC <= crop.salinityToleranceEC) return 100;
  const over = site.salinityEC - crop.salinityToleranceEC;
  return clamp(100 - over * 25);
}

function scoreGroundwater(site, crop) {
  if (!hasNumber(site.groundwaterStability)) return 70;
  // 지하수는 저수지의 보조 수단이므로 절반 가중으로 반영
  return clamp(100 - Math.max(0, crop.irrigationDependency - site.groundwaterStability) * 0.5);
}

function scoreZone(site, crop) {
  if (!site.zoneType) return crop.needsPostHarvestFacility ? 70 : 100;
  if (!crop.needsPostHarvestFacility) return 100;
  if (site.zoneType === "jinheung") return 40;   // 농업진흥구역: 부대시설 신축 사실상 제한
  if (site.zoneType === "boho") return 70;       // 농업보호구역: 조건부 가능
  return 100;                                     // 일반농지
}

function scoreClimate(site, crop) {
  if (!site.climateZone && !hasNumber(site.frostRisk)) return 70;
  let score = 100;
  if (site.climateZone && crop.climate !== "any" && crop.climate !== site.climateZone) score -= 40;
  if (crop.frostSensitive && hasNumber(site.frostRisk)) score -= site.frostRisk * 0.5;
  return clamp(score);
}

function scoreSoilPh(site, crop) {
  if (!hasNumber(site.soilPh)) return 70;
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
// 4. 손익 참고치. 학습 산출물이 있으면 예측 가격과 상·하한을 직접 반영한다.
// ---------------------------------------------------------------------------
const RISK_LABELS = [
  { max: 0.12, label: "안정적" },
  { max: 0.25, label: "보통" },
  { max: Infinity, label: "변동성 높음" },
];

function riskLabel(volatility) {
  return RISK_LABELS.find((r) => volatility <= r.max).label;
}

function getForecastForCrop(cropName) {
  const forecast = PRICE_FORECASTS.find((item) => item.crop === cropName);
  if (!forecast?.forecastDate) return null;
  // 지난 날짜를 향한 예측은 현재 시세처럼 표시하거나 수익 범위에 사용하지 않는다.
  const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return forecast.forecastDate >= todayKst ? forecast : null;
}

function getIncomeEstimateForCrop(cropName) {
  return INCOME_ESTIMATES.find((item) => item.crop === cropName) || null;
}

// KAMIS는 '도매시장 경락가', 농촌진흥청 소득자료는 '농가수취가'다. 도매가는 유통비용이
// 얹혀 농가수취가보다 1.3~4.4배 높고, 품목에 따라서는 상품 형태 자체가 다르다
// (예: KAMIS 고추=건고추 19,655원/kg vs 소득자료 고추=시설 생과 4,446원/kg).
// 따라서 매출 단가는 반드시 농가수취 기준으로 계산하고, KAMIS 예측은
// 변동폭 산정과 시세 참고 표시에만 사용한다.
function toKgForecast(forecast) {
  if (!forecast) return null;
  const isKg = forecast.priceBasis === "kg"
    || (forecast.priceBasis == null && String(forecast.unit).toLowerCase().includes("kg"));
  return isKg ? forecast : null;
}

function estimateProfit(
  crop,
  areaSqm,
  forecast = getForecastForCrop(crop.name),
  overrides = {}
) {
  const factor = areaSqm / 1000; // 모든 기준값은 1,000㎡(10a) 기준
  const incomeEstimate = getIncomeEstimateForCrop(crop.name);
  const official = incomeEstimate?.officialLatest || null;
  // 시세 표시·변동폭 전용. 매출 단가로는 쓰지 않는다.
  const marketForecast = toKgForecast(forecast);

  // --- 수확량: 소득자료 홀드아웃 검증을 통과한 추정치 → 없으면 품목 기준값 ---
  const modeledYieldTotal = (incomeEstimate?.yieldKgPer1000m2 ?? crop.econ.yieldKg) * factor;
  const usedActualYield = Number(overrides.actualYieldKg) > 0;
  const yieldKg = usedActualYield ? Number(overrides.actualYieldKg) : modeledYieldTotal;

  // --- 단가: 공식 총수입 ÷ 공식 수확량으로 농가수취 단가를 복원한다.
  // 소득자료는 항목별로 재배유형 중앙값을 따로 잡기 때문에 농가수취단가 컬럼을
  // 그대로 곱하면 총수입과 어긋난다. 같은 레코드의 총수입/수확량 비율을 써야
  // 국가승인통계와 정합이 맞는다. ---
  const officialUnitPrice = official && official.yieldKgPer1000m2 > 0
    ? official.revenueWonPer1000m2 / official.yieldKgPer1000m2
    : null;
  const priceWon = Number(overrides.actualPriceWon) > 0
    ? Number(overrides.actualPriceWon)
    : (officialUnitPrice ?? crop.econ.priceWon);

  // --- 경영비 ---
  const modeledCostTotal = (incomeEstimate?.operatingCostWonPer1000m2 ?? crop.econ.costWon) * factor;
  const usedActualCost = Number(overrides.actualCostWon) > 0;
  const cost = usedActualCost ? Number(overrides.actualCostWon) : modeledCostTotal;

  const revenue = yieldKg * priceWon;
  const subsidy = crop.econ.subsidyWon * factor;
  const profit = revenue - cost + subsidy;

  // --- 변동폭: KAMIS 예측 구간의 상대 폭을 매출에 적용 ---
  const volatility = marketForecast && marketForecast.predictedPriceWon > 0
    ? clamp(
        (marketForecast.upperBoundWon - marketForecast.lowerBoundWon)
          / (2 * marketForecast.predictedPriceWon),
        0.01,
        0.6
      )
    : crop.econ.priceVolatility ?? 0.15;
  const swing = revenue * volatility;

  const basis = official ? "rda-official" : "reference-default";
  return {
    revenue: Math.round(revenue),
    cost: Math.round(cost),
    subsidy: Math.round(subsidy),
    profit: Math.round(profit),
    profitLow: Math.round(profit - swing),
    profitHigh: Math.round(profit + swing),
    yieldKg: Math.round(yieldKg),
    priceWon: Math.round(priceWon),
    volatility,
    riskLabel: riskLabel(volatility),
    // 이 작물의 손익이 실제 공식 통계에 근거하는지, 자리표시 기준값인지 구분한다.
    basis,
    isReferenceOnly: basis === "reference-default",
    priceUnitBasis: official ? "농가수취가(농촌진흥청 소득자료)" : "품목 기준값",
    // 공식 소득자료의 '소득'은 보조금을 포함하지 않는다. 화면에서 우리 계산값과
    // 공식값을 나란히 비교할 수 있도록 함께 내려보낸다.
    officialIncomeWonPer1000m2: official?.incomeWonPer1000m2 ?? null,
    // 보조금은 아직 공익직불제 자료와 연동되지 않은 자리표시 값이다.
    // 실제 전략작물직불금 단가와 다를 수 있으므로 반드시 미검증임을 표시한다.
    subsidyVerified: false,
    dataSource: [
      official
        ? `농촌진흥청 소득자료 ${incomeEstimate.baseYear}년 농가수취 단가`
        : "품목 kg당 가격 기준값(공식 통계 미수록)",
      usedActualYield
        ? "농가 입력 수확량"
        : incomeEstimate
          ? "농촌진흥청 소득자료 수확량 모델"
          : "품목 수확량 기준값",
      usedActualCost
        ? "농가 입력 실제 비용"
        : incomeEstimate
          ? "농촌진흥청 최신 공식 경영비"
          : "품목 비용 기준값",
      marketForecast ? "KAMIS·기상청 ASOS 예측으로 변동폭 산정" : "품목 변동성 기준값",
    ].join(" · "),
    forecast: marketForecast || null,
    incomeEstimate: incomeEstimate || null,
    usedActualYield,
    usedActualCost,
  };
}

// ---------------------------------------------------------------------------
// 5. 작물 1개 평가 + 메인 함수: 농지 조건 → 작물 추천 리스트
// ---------------------------------------------------------------------------
function evaluateCrop(site, crop, areaSqm, overrides = {}, options = {}) {
  const forecast = getForecastForCrop(crop.name);
  const month = Number.isInteger(options.month) ? options.month : new Date().getMonth() + 1;
  const season = evaluateSeason(crop.name, month);
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
  // 파종 시기는 카드 상단의 전용 계절 줄에서만 안내한다(season 필드).
  // 경고로도 올리면 같은 카드에 같은 말이 두 번 나온다.

  const profit = estimateProfit(crop, areaSqm, forecast, overrides);
  // 공식 통계 미수록 여부는 카드의 '근거' 줄에서 한 번만 안내한다.
  // 경고/요약에도 넣으면 같은 문장이 한 카드에 여러 번 반복된다.
  if (profit.subsidy > 0) {
    warnings.push("보조금은 공익직불제 미연동 참고값 → 실제 수령액은 신청 요건에 따라 다름");
  }
  const priceConfidence = profit.forecast ? Math.max(0, 100 - profit.forecast.metrics.mapePercent) : 0;
  const incomeConfidence = profit.incomeEstimate?.confidencePercent || 0;
  const roi = profit.profit / Math.max(profit.cost, 1);
  const profitScore = clamp(50 + roi * 25);
  // 토지 적합성을 주축으로 두되, 검증된 소득자료 손익성과 모델 신뢰도를
  // 합계 20% 반영해 같은 조건 안에서는 경제성이 더 나은 작물을 우선한다.
  // 8축 적합도(totalScore) 공식 자체는 그대로 두고, 파종 적기만 곱셈 계수로
  // 덧씌워 제철이 아닌 작물이 1순위로 올라오지 않게 한다.
  const baseRankingScore = totalScore * 0.8 + profitScore * 0.15
    + ((priceConfidence + incomeConfidence) / 2) * 0.05;
  const rankingScore = baseRankingScore * SEASON_WEIGHT[season.fit];
  return {
    name: crop.name,
    family: crop.family,
    totalScore: Math.round(totalScore),
    axisScores,
    warnings,
    season,
    rankingScore,
    rankingFactors: {
      suitabilityScore: Math.round(totalScore),
      profitScore: Math.round(profitScore),
      modelConfidence: Math.round((priceConfidence + incomeConfidence) / 2),
      seasonFit: season.fit,
    },
    profit,
  };
}

function recommendCrops(site, areaSqm = 1000, options = {}) {
  return CROPS.map((crop) => evaluateCrop(site, crop, areaSqm, {}, options)).sort(
    (a, b) => b.rankingScore - a.rankingScore
  );
}

// Node/브라우저 양쪽에서 쓸 수 있도록 export
if (typeof module !== "undefined") {
  module.exports = {
    recommendCrops,
    evaluateCrop,
    evaluateSeason,
    getForecastForCrop,
    getIncomeEstimateForCrop,
    CROPS,
    WEIGHTS,
    PLANTING_CALENDAR,
    INCOME_ARTIFACT,
  };
}
