import { fmtWon } from "./format";

// evaluateCrop()이 이미 계산해둔 축 점수/경고/손익 수치를 규칙 기반으로 재해석해
// 장점(pros)/단점(cons) 이유 목록을 만든다. 가격은 학습 모델 산출물을 우선 사용하고,
// 설명 문장은 계산 결과를 일관되게 보여주는 규칙 기반 텍스트다.
function hasWarning(result, keyword) {
  return result.warnings.some((w) => w.includes(keyword));
}

export function getProfitInsight(result) {
  const { profit, name, family } = result;
  const hasPestWarning = hasWarning(result, "병해충");
  const hasOversupplyWarning = hasWarning(result, "공급과잉");
  const hasSubsidy = profit.subsidy > 0;
  const isProfitable = profit.profit > 0;

  const pros = [];
  const cons = [];

  const baseLine = `매출 ${fmtWon(profit.revenue)} − 비용 ${fmtWon(profit.cost)}${
    hasSubsidy ? ` + 보조금 ${fmtWon(profit.subsidy)}` : ""
  } = ${isProfitable ? "이익" : "손해"} ${fmtWon(profit.profit)} 예상`;
  (isProfitable ? pros : cons).push(baseLine);

  if (hasSubsidy) {
    pros.push(`보조금 ${fmtWon(profit.subsidy)}을 더해 계산했어요`);
  }

  // 단가는 농가수취가 기준으로만 계산한다. KAMIS 도매가는 수익 범위 폭에만 쓰이므로
  // "가격을 반영했다"가 아니라 "범위를 잡았다"라고 정확히 표현한다.
  if (profit.forecast) {
    pros.push("최근 시세 흐름으로 수익 범위를 잡았어요");
  }

  if (profit.usedActualYield || profit.usedActualCost) {
    pros.push("입력한 수확량과 비용으로 계산했어요");
  } else if (profit.incomeEstimate) {
    pros.push("최근 농가 수확량과 비용을 반영했어요");
  }

  if (profit.riskLabel === "안정적") {
    pros.push("가격이 안정적이라 예상 수익도 안정적이에요");
  } else {
    cons.push("가격 변화가 커 예상 수익 차이가 클 수 있어요");
  }

  if (hasPestWarning) {
    cons.push("병해충 이력이 있어 관리비가 늘 수 있어요");
  }

  if (hasOversupplyWarning) {
    cons.push(`${name} 재배 농가가 늘어 가격이 내려갈 수 있어요`);
  }

  return { pros, cons };
}

// 화면 하단 안내문. 예전에는 모든 작물을 "예시 값"이라고 뭉뚱그려 안내해서,
// 공식 통계 기반 작물과 자리표시 기준값 작물을 구분할 수 없었다.
// 실제로 쓰인 근거에 맞춰 문장을 만든다.
export function buildDataNote(results) {
  const list = Array.isArray(results) ? results : [results];
  const shown = list.filter(Boolean);
  if (!shown.length) return "";

  // 작물별 사실(참고값 여부·보조금 미검증)은 카드 안에서 이미 안내한다.
  // 여기에는 화면 전체에 공통으로 적용되는 산출 기준만 남긴다.
  const officialCount = shown.filter((r) => !r.profit.isReferenceOnly).length;
  const hasForecast = shown.some((r) => r.profit.forecast);

  const lines = [];
  if (officialCount) {
    lines.push(
      "※ 매출·경영비는 농촌진흥청 농산물소득자료집(국가승인통계)의 농가수취 기준 값이에요. 도매가가 아니라 농가가 실제로 받는 가격 기준입니다."
    );
  }
  if (hasForecast) {
    lines.push(
      "수익 범위는 KAMIS 도매가격·기상청 ASOS로 학습한 예측의 변동폭을 반영했어요. 가격이 자주 오르내리는 작물일수록 범위가 넓게 나와요."
    );
  }
  lines.push("모든 수치는 참고용이며 실제 수익을 보장하지 않아요.");
  return lines.join(" ");
}
