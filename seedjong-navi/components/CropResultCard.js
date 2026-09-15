import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../constants/theme";
import { fmtWon } from "../lib/format";
import { fetchLiveKamisPrice } from "../lib/kamisPrice";
import { getProfitInsight } from "../lib/profitSummary";
import RiskBadge from "./RiskBadge";

const seasonLabel = {
  ok: "지금이 파종 적기",
  soon: "곧 파종 시기",
  off: "지금은 파종 적기 아님",
  perennial: "다년생 과수",
  unknown: "",
};

const seasonToneStyle = {
  ok: { color: "#1f8a4c", fontWeight: "700" },
  soon: { color: COLORS.navy, fontWeight: "700" },
  off: { color: COLORS.warn, fontWeight: "700" },
  perennial: { color: COLORS.textSub, fontWeight: "700" },
};

// legacy-web .result-item 이식 — rank가 있으면 랭킹 카드, 없으면 단일 결과 카드
export default function CropResultCard({ result, rank, forecast }) {
  const season = result.season && result.season.fit !== "unknown" ? result.season : null;
  // 앞의 라벨이 이미 "파종 적기"를 말하므로 뒤에서는 시기만 덧붙인다.
  // 다년생 과수는 파종 시기보다 '수확까지 몇 년 걸리는지'가 핵심 정보다.
  const seasonDetail = !season
    ? null
    : season.perennial
      ? `${season.label} · 수확까지 ${season.yearsToHarvest}`
      : season.fit === "off"
        ? `적기는 ${season.label}`
        : season.label;
  const warnings = result.warnings || [];
  const insight = getProfitInsight(result);
  const supportingPros = insight.pros.slice(1);
  const modelSummary = supportingPros.find((item) => item.includes("시세 흐름"));
  const highlights = [modelSummary, ...insight.cons, ...supportingPros.filter((item) => item !== modelSummary)].filter(Boolean).slice(0, 2);
  const isProfit = result.profit.profit > 0;
  const profitRangeLabel = isProfit ? "수익" : "손익";

  const [liveQuery, setLiveQuery] = useState({ status: "idle" });
  const lookupLivePrice = async () => {
    setLiveQuery({ status: "loading" });
    try {
      const live = await fetchLiveKamisPrice(result.name);
      setLiveQuery({ status: "done", data: live });
    } catch (error) {
      setLiveQuery({ status: "error", message: error.message });
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          {rank ? <Text style={styles.rank}>{rank}등</Text> : null}
          <Text style={styles.name}>{result.name}</Text>
        </View>
        <RiskBadge label={result.profit.riskLabel} />
      </View>

      {season ? (
        <Text style={styles.season}>
          <Text style={seasonToneStyle[season.fit] || styles.seasonNeutral}>{seasonLabel[season.fit]}</Text>
          {seasonDetail ? <Text style={styles.seasonSub}>  {seasonDetail}</Text> : null}
        </Text>
      ) : null}

      {warnings.length ? (
        <View style={styles.warnBox}>
          {warnings.map((w, i) => (
            <Text key={`warn-${i}`} style={styles.warn}>⚠ {w}</Text>
          ))}
        </View>
      ) : null}

      <View style={styles.profitRow}>
        <Text style={styles.profitItem}>
          매출 <Text style={styles.profitValue}>{fmtWon(result.profit.revenue)}</Text>
        </Text>
        <Text style={styles.profitItem}>
          비용 <Text style={styles.profitValue}>{fmtWon(result.profit.cost)}</Text>
        </Text>
        <Text style={styles.profitItem}>
          보조금 <Text style={styles.profitValue}>{fmtWon(result.profit.subsidy)}</Text>
        </Text>
      </View>

      <Text style={styles.profitRange}>
        <Text style={styles.profitRangeLabel}>{profitRangeLabel}</Text>{" "}
        <Text style={styles.profitRangeValue}>
          {fmtWon(result.profit.profitLow)} ~ {fmtWon(result.profit.profitHigh)}
        </Text>
      </Text>

      {forecast ? (
        <View style={styles.forecastBox}>
          <Text style={styles.forecastTitle}>📈 AI 가격 예측</Text>
          <Text style={styles.forecastValue}>
            {fmtWon(forecast.predictedPriceWon)} / {forecast.unit}
          </Text>
          <Text style={styles.forecastMeta}>
            예상 범위 {fmtWon(forecast.lowerBoundWon)} ~ {fmtWon(forecast.upperBoundWon)}
          </Text>
          <Text style={styles.forecastMeta}>
            KAMIS 도매가격·기상청 ASOS 학습값 (검증 MAPE {forecast.metrics.mapePercent}%)
          </Text>
        </View>
      ) : null}

      <View style={styles.liveBox}>
        {liveQuery.status === "idle" ? (
          <Pressable style={styles.liveButton} onPress={lookupLivePrice}>
            <Text style={styles.liveButtonText}>오늘 KAMIS 시세 조회</Text>
          </Pressable>
        ) : null}
        {liveQuery.status === "loading" ? <Text style={styles.liveMeta}>KAMIS에서 조회 중…</Text> : null}
        {liveQuery.status === "error" ? (
          <Pressable onPress={lookupLivePrice}>
            <Text style={styles.liveError}>{liveQuery.message} · 다시 시도</Text>
          </Pressable>
        ) : null}
        {liveQuery.status === "done" ? (
          <>
            <Text style={styles.liveTitle}>🛒 오늘 KAMIS 실시간 시세</Text>
            <Text style={styles.liveValue}>
              {fmtWon(liveQuery.data.priceWon)} / {liveQuery.data.unit}
            </Text>
            <Text style={styles.liveMeta}>
              {liveQuery.data.regday} · {liveQuery.data.sourceItem}
              {liveQuery.data.rank ? ` (${liveQuery.data.rank})` : ""}
            </Text>
          </>
        ) : null}
      </View>

      <View style={styles.insightBox}>
        <Text style={styles.insightLabel}>✦ AI 요약</Text>
        {(highlights.length ? highlights : insight.pros.slice(0, 2)).map((p, i) => (
          <Text key={`pro-${i}`} style={styles.insightItem}>
            • {p}
          </Text>
        ))}
        <Text style={styles.basis}>
          {result.profit.isReferenceOnly
            ? "근거: 공식 소득통계 미수록 품목이라 참고용 기준값으로 계산했어요"
            : `근거: 농촌진흥청 소득자료 ${result.profit.incomeEstimate?.baseYear}년 농가수취 기준`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 0,
    backgroundColor: COLORS.card,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headLeft: { flexDirection: "row", alignItems: "baseline", gap: 4, flexShrink: 1, flexWrap: "wrap" },
  rank: { color: "#99a", fontSize: 12 },
  name: { fontSize: 16, fontWeight: "700", color: COLORS.textMain },
  season: { fontSize: 12, marginTop: -2 },
  seasonNeutral: { color: COLORS.textSub, fontWeight: "700" },
  seasonSub: { color: COLORS.textSub, fontWeight: "400" },
  warnBox: { gap: 2 },
  warn: { fontSize: 11.5, color: COLORS.warn, lineHeight: 16 },
  basis: {
    fontSize: 11,
    color: COLORS.textFaint,
    marginTop: 6,
    lineHeight: 15,
  },
  profitRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 15, rowGap: 4, marginTop: 0 },
  profitItem: { fontSize: 13, color: "#445" },
  profitValue: { color: "#223", fontWeight: "700" },
  profitRange: { fontSize: 15, fontWeight: "700", marginTop: 0 },
  profitRangeLabel: { color: COLORS.navy },
  profitRangeValue: { color: COLORS.textMain },
  forecastBox: { marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: "#eef6ff" },
  forecastTitle: { fontSize: 12.5, fontWeight: "700", color: COLORS.navy },
  forecastValue: { fontSize: 15, fontWeight: "700", color: COLORS.navy, marginTop: 3 },
  forecastMeta: { fontSize: 11, color: COLORS.textSub, marginTop: 2, lineHeight: 16 },
  liveBox: { marginTop: 8 },
  liveButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  liveButtonText: { fontSize: 12, color: COLORS.navy, fontWeight: "700" },
  liveTitle: { fontSize: 12.5, fontWeight: "700", color: "#1f8a4c" },
  liveValue: { fontSize: 15, fontWeight: "700", color: "#1f8a4c", marginTop: 3 },
  liveMeta: { fontSize: 11, color: COLORS.textSub, marginTop: 2, lineHeight: 16 },
  liveError: { fontSize: 11.5, color: COLORS.warn, lineHeight: 16 },
  insightBox: {
    marginTop: 0,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  insightLabel: { fontSize: 12.5, color: "#445", fontWeight: "700", marginBottom: 2 },
  insightItem: { fontSize: 12, color: COLORS.textMain, lineHeight: 17, marginTop: 2 },
});
