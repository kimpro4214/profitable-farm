import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import SearchableSelectField from "../../../components/SearchableSelectField";
import AppBrand from "../../../components/AppBrand";
import ChatbotFab from "../../../components/ChatbotFab";
import { COLORS } from "../../../constants/theme";
import { CROPS } from "../../../lib/crop_matcher";
import { useCalculatorFlow } from "./_layout";

export default function CalculatorForm() {
  const router = useRouter();
  const {
    area,
    setArea,
    cropName,
    setCropName,
    setResult,
  } = useCalculatorFlow();

  const runCalculate = () => {
    if (!CROPS.some((crop) => crop.name === cropName)) return;
    setResult(null);
    router.push("/(tabs)/calculator/loading");
  };

  return (
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.wrap}>
      <AppBrand />
      <Pressable style={styles.backLink} onPress={() => router.push("/location-setup")}>
        <Text style={styles.backLinkText}>← 지역 다시 선택</Text>
      </Pressable>

      <Text style={styles.title}>수익 계산기</Text>

      <View style={styles.card}>
        <SearchableSelectField
          label="작물 선택"
          value={cropName}
          options={CROPS.map((c) => c.name)}
          onChange={setCropName}
          placeholder="작물 이름을 입력하세요 (예: 고추)"
          containerStyle={styles.cropField}
        />
        <View style={styles.areaField}><Text style={styles.label}>재배 면적(㎡)</Text><TextInput style={styles.input} keyboardType="numeric" value={area} onChangeText={setArea} /></View>
        <Pressable
          style={[styles.runButton, !cropName && styles.runButtonDisabled]}
          disabled={!cropName}
          onPress={runCalculate}
        >
          <Text style={styles.runButtonText}>수익 계산 →</Text>
        </Pressable>
      </View>
    </ScrollView>
    <ChatbotFab />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  wrap: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100, gap: 14, backgroundColor: COLORS.bg, flexGrow: 1 },
  backLink: { marginBottom: 0 },
  backLinkText: { fontSize: 13, color: COLORS.accent, fontWeight: "600" },
  title: { fontSize: 20, color: COLORS.textMain, fontWeight: "700" },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 14,
  },
  cropField: { marginBottom: 0 },
  areaField: { gap: 6 },
  label: { fontSize: 13, color: "#445" },
  input: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.textMain,
    backgroundColor: COLORS.card,
  },
  runButton: { height: 44, backgroundColor: COLORS.navy, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  runButtonDisabled: { backgroundColor: "#aab3c2" },
  runButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
