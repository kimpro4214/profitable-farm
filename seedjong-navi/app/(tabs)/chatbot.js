import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AppBrand from "../../components/AppBrand";
import FigmaBottomBar from "../../components/FigmaBottomBar";
import { COLORS } from "../../constants/theme";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";

export default function Chatbot() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef(null);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) {
      setHistoryLoading(false);
      return () => { active = false; };
    }

    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError || !data.session) {
        setHistoryLoading(false);
        router.replace("/login");
        return;
      }
      setSession(data.session);
      const { data: rows, error: historyError } = await supabase
        .from("chat_messages")
        .select("id,role,text,citation,created_at")
        .eq("user_id", data.session.user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!active) return;
      if (historyError) setError(`대화 기록을 불러오지 못했습니다: ${historyError.message}`);
      else setMessages((rows || []).reverse());
      setHistoryLoading(false);
    });

    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => threadRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages.length, loading]);

  const ask = async () => {
    const value = question.trim();
    if (!value || loading || historyLoading) return;
    if (!isSupabaseConfigured) {
      setError("Supabase 연결을 확인해주세요.");
      return;
    }
    if (!session?.user) {
      router.replace("/login");
      return;
    }

    const recentHistory = messages.slice(-8).map(({ role, text }) => ({ role, text }));
    const pendingId = `pending-${Date.now()}`;
    setMessages((items) => [...items, { id: pendingId, role: "user", text: value }]);
    setQuestion("");
    setError("");
    setLoading(true);

    try {
      const { data: userMessage, error: saveQuestionError } = await supabase
        .from("chat_messages")
        .insert({ user_id: session.user.id, role: "user", text: value })
        .select("id,role,text,citation,created_at")
        .single();
      if (saveQuestionError) throw saveQuestionError;
      setMessages((items) => items.map((item) => item.id === pendingId ? userMessage : item));

      const { data, error: callError } = await supabase.functions.invoke("ask-rag", {
        body: { question: value, history: recentHistory },
      });
      if (callError || data?.error) throw new Error(data?.error || callError.message);

      const sourceLabel = data.sources?.length
        ? data.sources.map((source) => source.label).slice(0, 2).join(", ")
        : "농촌진흥청·KRC 공개자료";
      const citation = `출처: ${sourceLabel}`;
      const { data: botMessage, error: saveAnswerError } = await supabase
        .from("chat_messages")
        .insert({ user_id: session.user.id, role: "bot", text: data.answer, citation })
        .select("id,role,text,citation,created_at")
        .single();
      if (saveAnswerError) {
        setMessages((items) => [...items, { id: `local-${Date.now()}`, role: "bot", text: data.answer, citation }]);
        setError("답변은 받았지만 대화 기록을 저장하지 못했습니다.");
      } else {
        setMessages((items) => [...items, botMessage]);
      }
    } catch (askError) {
      setError(askError.message || "답변을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.header}>
          <AppBrand />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이전 화면으로 돌아가기"
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/home")}
          >
            <Text style={styles.back}>← 뒤로가기</Text>
          </Pressable>
          <Text style={styles.title}>농사 지식 챗봇</Text>
          <View style={styles.notice}><Text style={styles.noticeText}>KRC 공공데이터·농업 지식 기반 참고용 답변이며, 정확한 판단은 전문가 상담을 권장해요.</Text></View>
        </View>

        <ScrollView
          ref={threadRef}
          style={styles.threadScroll}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => threadRef.current?.scrollToEnd({ animated: false })}
        >
          {historyLoading ? <ActivityIndicator color={COLORS.navy} /> : null}
          {/* 인사말은 대화가 시작돼도 첫 말풍선으로 계속 남는다.
              예전에는 messages가 비었을 때만 그려서 첫 질문을 보내는 순간 사라졌다. */}
          {!historyLoading ? <View style={styles.bot}><Text style={styles.botText}>안녕하세요. 수익농가 AI 챗봇입니다.</Text></View> : null}
          {messages.map((message) => (
            <View key={message.id} style={styles.messageBlock}>
              <View style={message.role === "user" ? styles.user : styles.bot}><Text style={message.role === "user" ? styles.userText : styles.botText}>{message.text}</Text></View>
              {message.citation ? <Text style={styles.citation}>📚 {message.citation}</Text> : null}
            </View>
          ))}
          {loading ? <View style={styles.bot}><Text style={styles.botText}>답변을 찾는 중입니다...</Text></View> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.composer}>
          <View style={styles.inputRow}>
            <TextInput value={question} onChangeText={setQuestion} placeholder="질문을 입력하세요..." placeholderTextColor={COLORS.textFaint} style={styles.input} onSubmitEditing={ask} editable={!historyLoading && !loading} />
            <Pressable onPress={ask} disabled={historyLoading || loading} style={[styles.send, (historyLoading || loading) && styles.sendDisabled]}><Text style={styles.sendText}>전송</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      <FigmaBottomBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  keyboardArea: { flex: 1, marginBottom: 48 },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, gap: 14, backgroundColor: COLORS.bg },
  back: { fontSize: 13, fontWeight: "700", color: COLORS.navy },
  title: { fontSize: 20, fontWeight: "700", color: COLORS.textMain },
  notice: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#f8f9fb", borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: COLORS.line },
  noticeText: { fontSize: 11.5, color: COLORS.textFaint, lineHeight: 17 },
  threadScroll: { flex: 1 },
  thread: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 12, gap: 12 },
  messageBlock: { gap: 4 },
  user: { alignSelf: "flex-end", maxWidth: 238, backgroundColor: COLORS.navy, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  userText: { fontSize: 14, color: "#fff", lineHeight: 20 },
  bot: { alignSelf: "flex-start", maxWidth: 253, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  botText: { fontSize: 14, color: COLORS.textMain, lineHeight: 20 },
  citation: { alignSelf: "flex-start", fontSize: 10, color: COLORS.textFaint },
  error: { fontSize: 12, color: COLORS.loss },
  empty: { paddingVertical: 28, textAlign: "center", fontSize: 13, color: COLORS.textFaint },
  composer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: COLORS.bg },
  inputRow: { flexDirection: "row", gap: 8 },
  input: { height: 36, flex: 1, borderRadius: 8, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card, paddingHorizontal: 12, fontSize: 13, color: COLORS.textMain },
  send: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, justifyContent: "center", alignItems: "center" },
  sendText: { fontSize: 13, fontWeight: "700", color: COLORS.textMain },
  sendDisabled: { opacity: 0.5 },
});
