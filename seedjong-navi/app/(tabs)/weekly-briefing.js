import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { COLORS } from "../../constants/theme";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";

function summaryItems(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  return value.split("\n").map((line) => line.replace(/^[•*-]\s*/, "").trim()).filter(Boolean);
}

function briefingMarkdown(report) {
  if (!report) return "";
  const lines = ["## 이번 주 핵심", ...summaryItems(report.summary).map((item) => `- ${item}`)];
  const briefing = (report.briefing || "").trim();
  if (!briefing) return lines.join("\n");

  lines.push("", "## 분야별 상세");
  const chapterPattern = /제\s*\d+장\s+[^:：]+[:：]\s*/g;
  const chapters = [...briefing.matchAll(chapterPattern)];
  if (!chapters.length) return [...lines, briefing].join("\n");

  for (let index = 0; index < chapters.length; index++) {
    const chapter = chapters[index];
    const next = chapters[index + 1];
    const heading = chapter[0].replace(/[:：]\s*$/, "").trim();
    const body = briefing.slice(chapter.index + chapter[0].length, next?.index ?? briefing.length).trim();
    lines.push("", `### ${heading}`, body);
  }
  return lines.join("\n");
}

function MarkdownBriefing({ markdown }) {
  return markdown.split("\n").map((line, index) => {
    if (!line.trim()) return null;
    if (line.startsWith("## ")) return <Text key={index} style={styles.sectionTitle}>{line.slice(3)}</Text>;
    if (line.startsWith("### ")) return <Text key={index} style={styles.chapterTitle}>{line.slice(4)}</Text>;
    if (line.startsWith("- ")) {
      return <View key={index} style={styles.bulletRow}><Text style={styles.bulletMark}>•</Text><Text style={styles.bulletText}>{line.slice(2)}</Text></View>;
    }
    return <Text key={index} style={styles.paragraph}>{line}</Text>;
  });
}

export default function WeeklyBriefing() {
  const router = useRouter();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.from("weekly_farming_reports").select("title,headline,published_at,summary,briefing,pdf_url,source_url")
      .eq("status", "ready").order("published_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setReport(data))
      .finally(() => setLoading(false));
  }, []);

  const markdown = useMemo(() => briefingMarkdown(report), [report]);
  const originalUrl = report?.pdf_url || report?.source_url;
  const published = report?.published_at
    ? new Date(report.published_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← 홈으로</Text></Pressable>
      <Text style={styles.eyebrow}>농촌진흥청 주간농사정보{published ? ` · ${published} 발행` : ""}</Text>
      <Text style={styles.title}>{report?.title || "이번 주 농사정보"}</Text>
      {report ? (
        <>
          <View style={styles.headlineCard}><Text style={styles.headline}>{report.headline}</Text></View>
          <MarkdownBriefing markdown={markdown} />
          <Text style={styles.note}>위 내용은 공식 자료를 읽기 쉽게 정리한 AI 브리핑입니다.</Text>
          {originalUrl ? <Pressable style={styles.button} onPress={() => Linking.openURL(originalUrl)}><Text style={styles.buttonText}>농촌진흥청 PDF 원문 보기 →</Text></Pressable> : null}
        </>
      ) : <Text style={styles.empty}>{loading ? "주간농사정보를 불러오는 중…" : "아직 동기화된 주간농사정보가 없습니다."}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 130, gap: 12, backgroundColor: COLORS.bg, flexGrow: 1 },
  back: { fontSize: 13, fontWeight: "700", color: COLORS.accent, marginBottom: 8 },
  eyebrow: { fontSize: 12, color: COLORS.textSub },
  title: { fontSize: 23, lineHeight: 31, fontWeight: "800", color: COLORS.textMain },
  headlineCard: { padding: 18, backgroundColor: COLORS.card, borderLeftWidth: 4, borderLeftColor: COLORS.navy, borderRadius: 10, marginTop: 4 },
  headline: { fontSize: 16, lineHeight: 26, fontWeight: "700", color: COLORS.textMain },
  sectionTitle: { fontSize: 19, fontWeight: "800", color: COLORS.textMain, marginTop: 20, marginBottom: 4 },
  chapterTitle: { fontSize: 16, fontWeight: "700", color: COLORS.navy, marginTop: 14 },
  paragraph: { fontSize: 14, lineHeight: 24, color: COLORS.textMain, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, padding: 16 },
  bulletRow: { flexDirection: "row", gap: 8, paddingVertical: 5 },
  bulletMark: { fontSize: 16, color: COLORS.navy, fontWeight: "800", lineHeight: 23 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 23, color: COLORS.textMain },
  note: { fontSize: 12, lineHeight: 19, color: COLORS.textSub, marginTop: 12 },
  empty: { fontSize: 14, lineHeight: 23, color: COLORS.textSub },
  button: { minHeight: 46, borderRadius: 10, backgroundColor: COLORS.navy, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
