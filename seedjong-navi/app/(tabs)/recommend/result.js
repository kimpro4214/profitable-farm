import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import CropResultCard from "../../../components/CropResultCard";
import AppBrand from "../../../components/AppBrand";
import ChatbotFab from "../../../components/ChatbotFab";
import { COLORS } from "../../../constants/theme";
import { useRegion } from "../../../context/RegionContext";
import { useRecommendation } from "../../../context/RecommendationContext";
import { recommendCrops } from "../../../lib/crop_matcher";
import { buildDataNote } from "../../../lib/profitSummary";

export default function RecommendResult() {
  const router = useRouter();
  const { selectedRegion } = useRegion();
  const { results, setResults, pestCrop, area } = useRecommendation();

  useEffect(() => {
    // basis/season이 없으면 도매가로 매출을 계산하던 예전 결과다.
    // 저장된 값을 그대로 쓰면 과대계상된 손익이 계속 노출되므로 다시 계산한다.
    const isLegacyResult = results?.some(
      (item) =>
        !Number.isFinite(item?.profit?.yieldKg)
        || !Number.isFinite(item?.profit?.priceWon)
        || !item?.profit?.basis
        || !item?.season
    );
    if (!isLegacyResult || !selectedRegion) return;
    const site = {
      ...selectedRegion.site,
      recentCropHistory: pestCrop ? [{ crop: pestCrop, pestIssue: true }] : [],
    };
    setResults(recommendCrops(site, Number(area) || 1000));
  }, [results, selectedRegion, pestCrop, area, setResults]);

  const restartRecommendation = () => {
    setResults(null);
    router.replace("/recommend-setup");
  };

  if (!results) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.emptyHint}>아직 추천 결과가 없습니다. 먼저 조건을 입력해주세요.</Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>조건 입력으로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <AppBrand />
        <Text style={styles.title}>추천 작물 순위</Text>

        <View style={styles.card}>
          {results.slice(0, 3).map((r, i) => (
            <CropResultCard
              key={r.name}
              result={r}
              rank={i + 1}
              forecast={r.profit.forecast}
            />
          ))}
          <Text style={styles.mockNote}>{buildDataNote(results.slice(0, 3))}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.linkButton} onPress={() => router.push("/location-setup?from=recommend")}>
            <Text style={styles.linkButtonText}>지역 다시 선택</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={restartRecommendation}>
            <Text style={styles.secondaryButtonText}>조건 다시 입력</Text>
          </Pressable>
        </View>
      </ScrollView>
      <ChatbotFab />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  wrap: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 96, backgroundColor: COLORS.bg, flexGrow: 1 },
  title: { marginTop: 12, fontSize: 20, lineHeight: 25, color: COLORS.textMain, fontWeight: "700", letterSpacing: -0.35 },
  card: {
    marginTop: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 24,
  },
  emptyHint: { fontSize: 13, color: COLORS.textFaint, marginBottom: 16 },
  mockNote: {
    fontSize: 11.5,
    color: COLORS.textFaint,
    backgroundColor: "#f8f9fb",
    borderWidth: 1,
    borderColor: COLORS.line,
    borderStyle: "dashed",
    padding: 10,
    borderRadius: 8,
    lineHeight: 16,
  },
  actions: { marginTop: 16, gap: 8 },
  secondaryButton: {
    backgroundColor: COLORS.navy,
    borderRadius: 8,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  linkButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  linkButtonText: { color: COLORS.navy, fontSize: 15, fontWeight: "700" },
});
