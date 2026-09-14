import { Redirect, useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import FigmaRecommendLogo from "../../../components/FigmaRecommendLogo";
import SearchableSelectField from "../../../components/SearchableSelectField";
import { PEST_OPTIONS } from "../../../constants/labels";
import { COLORS } from "../../../constants/theme";
import { useRegion } from "../../../context/RegionContext";
import { useRecommendation } from "../../../context/RecommendationContext";

export default function RecommendForm() {
  const router = useRouter();
  const pathname = usePathname();
  const { from } = useLocalSearchParams();
  const { selectedRegion } = useRegion();
  const { pestCrop, setPestCrop, area, setArea, results, setResults, hydrated } = useRecommendation();
  const isOnboarding = pathname === "/recommend-setup";

  const runRecommend = () => {
    if (!selectedRegion) {
      router.replace("/location-setup?from=recommend");
      return;
    }
    if (from === "recommend") {
      router.replace("/(tabs)/recommend/loading");
      return;
    }
    setResults(null);
    router.replace("/(tabs)/home");
  };

  if (!hydrated) {
    return <View style={styles.loading}><ActivityIndicator color={COLORS.navy} /></View>;
  }

  if (!isOnboarding) {
    return <Redirect href="/(tabs)/recommend/loading" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.logo}><FigmaRecommendLogo /></View>
      <Text style={styles.title}>내 농지 입력하기</Text>

      <View style={styles.card}>
        <SearchableSelectField
          label="최근 병해충 발생 이력"
          value={pestCrop}
          options={PEST_OPTIONS}
          onChange={setPestCrop}
          placeholder="작물 이름을 입력하세요 (예: 고추)"
          containerStyle={styles.pestField}
        />
        <View style={styles.areaField}>
          <Text style={styles.label}>재배 면적(㎡)</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={area} onChangeText={setArea} />
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.previousButton} onPress={() => router.back()}>
          <Text style={styles.previousButtonText}>이전</Text>
        </Pressable>
        <Pressable style={styles.completeButton} onPress={runRecommend}>
          <Text style={styles.completeButtonText}>완료</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  wrap: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 36, backgroundColor: COLORS.bg, flexGrow: 1 },
  logo: { width: 30.6568, height: 9.65681 },
  title: { marginTop: 10, fontSize: 22, lineHeight: 27, color: COLORS.navy, fontWeight: "700", letterSpacing: -0.45 },
  card: {
    marginTop: 48,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 24,
  },
  pestField: { marginBottom: 0 },
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
  actions: { marginTop: "auto", gap: 12 },
  previousButton: { height: 44, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  previousButtonText: { color: COLORS.navy, fontSize: 15, fontWeight: "700" },
  completeButton: { height: 44, backgroundColor: COLORS.navy, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  completeButtonText: { color: COLORS.card, fontSize: 15, fontWeight: "700" },
});
