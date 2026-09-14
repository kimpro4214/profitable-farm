import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AppBrand from "../../../components/AppBrand";
import ChatbotFab from "../../../components/ChatbotFab";
import CropResultCard from "../../../components/CropResultCard";
import { COLORS } from "../../../constants/theme";
import { useRegion } from "../../../context/RegionContext";
import { buildDataNote } from "../../../lib/profitSummary";
import { useCalculatorFlow } from "./_layout";

export default function CalculatorResult() {
  const router = useRouter();
  const { selectedRegion } = useRegion();
  const { result } = useCalculatorFlow();

  if (!result) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.emptyHint}>아직 계산된 결과가 없습니다. 먼저 작물과 조건을 입력해주세요.</Text>
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
        <Text style={styles.title}>수익 계산기</Text>
        <Text style={styles.subtitle}>{selectedRegion.name}</Text>

        <View style={styles.card}>
          <CropResultCard result={result} forecast={result.profit.forecast} />
          <Text style={styles.mockNote}>{buildDataNote(result)}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.linkButton} onPress={() => router.push("/location-setup")}>
            <Text style={styles.linkButtonText}>지역 다시 선택</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
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
  subtitle: { marginTop: 0, fontSize: 13, lineHeight: 18, color: COLORS.textSub },
  card: {
    marginTop: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingTop: 15,
    paddingBottom: 14,
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
    marginTop: 12,
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
