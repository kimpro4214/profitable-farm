import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AppBrand from "../../components/AppBrand";
import ChatbotFab from "../../components/ChatbotFab";
import { COLORS } from "../../constants/theme";
import { loadDiaryItems } from "../../lib/diaryStore";

export default function Diary() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setError("");
    loadDiaryItems().then((value) => active && setItems(value)).catch((nextError) => active && setError(nextError.message));
    return () => { active = false; };
  }, []));

  const visibleMonth = useMemo(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  }, [monthOffset]);
  const monthKey = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, "0")}`;
  const visibleItems = items.filter((item) => item.date.startsWith(monthKey));

  return (
    <View style={styles.screen}>
      <View style={styles.brand}><AppBrand /></View>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>영농일지</Text>
        <View style={styles.month}>
          <Pressable onPress={() => setMonthOffset((v) => v - 1)} style={styles.arrow}><Text style={styles.arrowText}>‹</Text></Pressable>
          <Text style={styles.monthText}>{visibleMonth.getFullYear()}년 {visibleMonth.getMonth() + 1}월</Text>
          <Pressable onPress={() => setMonthOffset((v) => v + 1)} style={styles.arrow}><Text style={styles.arrowText}>›</Text></Pressable>
        </View>
        <Pressable onPress={() => router.push("/diary-write")} style={styles.primary}><Text style={styles.primaryText}>+ 새 기록 추가</Text></Pressable>
        {visibleItems.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${item.date} ${item.crop} 영농일지 보기`}
            onPress={() => router.push({ pathname: "/diary-detail", params: { id: item.id } })}
            style={({ pressed }) => [styles.entry, pressed && styles.entryPressed]}
          >
            <View style={styles.entryDateCrop}><Text style={styles.date}>{item.date}</Text><Text style={styles.entryTitle}>{item.crop}</Text></View>
            <Text numberOfLines={1} style={styles.entryText}>{item.note}</Text><Text style={styles.entryArrow}>→</Text>
          </Pressable>
        ))}
        {!visibleItems.length ? <Text style={styles.empty}>이 달에 작성한 기록이 없어요.</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <ChatbotFab />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  brand: { paddingHorizontal: 20, paddingTop: 20 },
  wrap: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100, gap: 16, backgroundColor: COLORS.bg },
  title: { fontSize: 20, fontWeight: "700", color: COLORS.textMain },
  month: { height: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  arrow: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" },
  arrowText: { marginTop: -2, fontSize: 18, color: COLORS.textMain },
  monthText: { fontSize: 16, fontWeight: "700", color: COLORS.textMain },
  primary: { height: 44, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.navy, borderRadius: 8 },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  entry: { height: 60, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.card, flexDirection: "row", alignItems: "center", gap: 12 },
  entryPressed: { opacity: 0.72 },
  entryDateCrop: { width: 58, gap: 2 },
  entryTitle: { fontSize: 14, fontWeight: "700", color: COLORS.textMain },
  entryText: { flex: 1, fontSize: 13, color: COLORS.textSub },
  entryArrow: { fontSize: 14, color: COLORS.textFaint },
  date: { fontSize: 11, color: COLORS.textFaint },
  empty: { paddingTop: 20, textAlign: "center", fontSize: 13, color: COLORS.textFaint },
  error: { paddingTop: 8, textAlign: "center", fontSize: 12, color: COLORS.loss },
});
