import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AppBrand from "../components/AppBrand";
import { COLORS } from "../constants/theme";
import { loadDiaryItem } from "../lib/diaryStore";

export default function DiaryDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadDiaryItem(Array.isArray(id) ? id[0] : id)
      .then((value) => {
        if (!active) return;
        if (!value) setError("영농일지를 찾지 못했습니다.");
        else setItem(value);
      })
      .catch((nextError) => active && setError(nextError.message || "영농일지를 불러오지 못했습니다."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <AppBrand />
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← 목록으로</Text></Pressable>
      <Text style={styles.title}>농사 기록</Text>

      {loading ? <ActivityIndicator color={COLORS.navy} style={styles.loading} /> : null}
      {item ? (
        <View style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.crop}>{item.crop}</Text>
            <Text style={styles.date}>{item.date}</Text>
          </View>

          <View style={styles.divider} />
          <View style={styles.section}>
            <Text style={styles.label}>농작업</Text>
            <Text style={styles.value}>{item.note}</Text>
          </View>

          <View style={styles.divider} />
          <View style={styles.section}>
            <Text style={styles.label}>설명</Text>
            <Text style={[styles.value, !item.description && styles.emptyValue]}>
              {item.description || "작성한 설명이 없어요."}
            </Text>
          </View>

          {item.imageUrl ? (
            <>
              <View style={styles.divider} />
              <View style={styles.section}>
                <Text style={styles.label}>사진</Text>
                <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
              </View>
            </>
          ) : null}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, padding: 20, paddingBottom: 40, gap: 16, backgroundColor: COLORS.bg },
  back: { fontSize: 13, fontWeight: "700", color: COLORS.textSub },
  title: { fontSize: 20, fontWeight: "700", color: COLORS.textMain },
  loading: { marginTop: 32 },
  card: { padding: 14, gap: 14, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, backgroundColor: COLORS.card },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  crop: { flex: 1, fontSize: 18, fontWeight: "700", color: COLORS.textMain },
  date: { fontSize: 12, color: COLORS.textFaint },
  divider: { height: 1, backgroundColor: COLORS.line },
  section: { gap: 8 },
  label: { fontSize: 13, fontWeight: "700", color: COLORS.navy },
  value: { fontSize: 14, lineHeight: 21, color: COLORS.textMain },
  emptyValue: { color: COLORS.textFaint },
  image: { width: "100%", aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: COLORS.bg },
  error: { paddingTop: 20, textAlign: "center", fontSize: 12, color: COLORS.loss },
});
