// legacy-web/result.html의 fmtWon/riskClass를 그대로 이식
export function fmtWon(n) {
  const man = 10000;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= man) return `${sign}${Math.round(abs / man).toLocaleString()}만원`;
  return `${sign}${abs.toLocaleString()}원`;
}

export function riskClass(label) {
  if (label === "안정적") return "stable";
  if (label === "보통") return "mid";
  return "high";
}
