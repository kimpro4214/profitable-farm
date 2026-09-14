import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AppBrand from "../../components/AppBrand";
import ChatbotFab from "../../components/ChatbotFab";
import { COLORS } from "../../constants/theme";
import { useRegion } from "../../context/RegionContext";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { fetchCurrentWeather, weatherEmoji } from "../../lib/weather";

const fallbackBullets = [
  "장마철 고온다습 환경에서 탄저병 확산 위험이 커지고 있어요",
  "콩 재배지는 잡초 관리 시기를 놓치지 않는 게 중요해요",
  "저수지 수위가 회복되는 중이라 관개 계획을 조정할 수 있어요",
];

function toBullets(summary) {
  if (Array.isArray(summary)) return summary;
  if (typeof summary !== "string") return [];
  try {
    const parsed = JSON.parse(summary);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return summary.split("\n").map((line) => line.replace(/^[•*-]\s*/, "").trim()).filter(Boolean);
}

export default function Home() {
  const router = useRouter();
  const { selectedRegion } = useRegion();
  const [report, setReport] = useState(null);
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const loadLatestReport = () => supabase.from("weekly_farming_reports")
      .select("headline,title,published_at,summary,source_url,pdf_url,status,fetched_at")
      .eq("status", "ready").order("published_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => active && setReport(data || null));
    loadLatestReport();
    const timer = setInterval(loadLatestReport, 15 * 60 * 1000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") loadLatestReport();
    });
    const channel = supabase
      .channel("home-weekly-report")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "weekly_farming_reports" },
        loadLatestReport
      )
      .subscribe();
    return () => {
      active = false;
      clearInterval(timer);
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!selectedRegion) return undefined;
    let active = true;
    const controller = new AbortController();
    const update = () => fetchCurrentWeather(selectedRegion, controller.signal).then((value) => active && setWeather(value)).catch(() => undefined);
    update();
    const timer = setInterval(update, 10 * 60 * 1000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [selectedRegion]);

  const bullets = useMemo(() => {
    const parsed = toBullets(report?.summary);
    return parsed.length ? parsed : fallbackBullets;
  }, [report]);
  const published = report?.published_at ? new Date(report.published_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : "2026년 7월 4주차";
  const location = selectedRegion ? `${selectedRegion.province} ${selectedRegion.city} ${selectedRegion.township}` : "내 농지";

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <AppBrand />
        <View style={styles.weather}>
          <Text style={styles.weatherIcon}>{weatherEmoji(weather?.code)}</Text>
          <View style={styles.location}><Text style={styles.locationPin}>📍</Text><Text numberOfLines={1} style={styles.locationText}>{location}</Text></View>
          <View style={styles.divider} />
          <Text style={styles.temp}>{weather ? `${weather.temperature}°` : "--°"}</Text>
        </View>
        <Text style={styles.title}>✦ 이번 주 농사 소식 AI 요약</Text>
        <Text style={styles.sub}>농촌진흥청 주간농사정보를 AI가 요약해서 알려드려요</Text>
        <View style={styles.newsCard}>
          <Text style={styles.newsTitle}>{report?.headline || "장마철 이후 병해충 방제 시기가 중요해요"}</Text>
          <Text style={styles.newsDate}>{published}</Text>
          <View style={styles.bullets}>{bullets.slice(0, 3).map((bullet, index) => <Text key={index} style={styles.bullet}>• {bullet}</Text>)}</View>
          <View style={styles.newsDivider} />
          <View style={styles.newsFooter}>
            <Text numberOfLines={1} style={styles.source}>출처: 농촌진흥청 주간농사정보</Text>
            <Pressable onPress={() => router.push("/(tabs)/weekly-briefing")}><Text style={styles.newsLink}>원문 보기 →</Text></Pressable>
          </View>
        </View>
      </ScrollView>
      <ChatbotFab />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  wrap: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100, gap: 14, backgroundColor: COLORS.bg },
  weather: { height: 66, borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, backgroundColor: COLORS.card, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 20, gap: 12 },
  weatherIcon: { width: 42, fontSize: 34 },
  location: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 },
  locationPin: { fontSize: 15 },
  locationText: { flexShrink: 1, fontSize: 14, color: COLORS.textMain },
  divider: { width: 1, height: 32, backgroundColor: COLORS.line },
  temp: { minWidth: 53, fontSize: 32, fontWeight: "700", color: COLORS.textMain },
  title: { color: COLORS.navy, fontSize: 20, fontWeight: "800", letterSpacing: -0.6 },
  sub: { marginTop: -6, fontSize: 13, color: COLORS.textSub },
  newsCard: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 16, gap: 9, backgroundColor: COLORS.card },
  newsTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textMain },
  newsDate: { fontSize: 11, color: COLORS.textFaint },
  bullets: { gap: 4 },
  bullet: { fontSize: 13, color: COLORS.textMain, lineHeight: 21 },
  newsDivider: { height: 1, backgroundColor: COLORS.line },
  newsFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  source: { flex: 1, fontSize: 10, color: COLORS.textFaint },
  newsLink: { fontSize: 10, fontWeight: "700", color: COLORS.textSub },
});
