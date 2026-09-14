import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "../constants/theme";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

function CheckBox({ checked }) {
  return <View pointerEvents="none" style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked ? <Text style={styles.check}>✓</Text> : null}</View>;
}

function TermRow({ checked, onToggle, type, label, onView }) {
  return (
    <View style={styles.termRow}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={styles.termLeft}>
        <CheckBox checked={checked} onPress={onToggle} />
        <View style={styles.termLabel}><Text style={[styles.termType, type === "[필수]" && styles.required]}>{type}</Text><Text style={styles.termText}>{label}</Text></View>
      </Pressable>
      <Pressable onPress={onView}><Text style={styles.viewText}>보기 &gt;</Text></Pressable>
    </View>
  );
}

export default function Signup() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [nickname, setNickname] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const allChecked = terms && privacy && marketing;

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Supabase 환경변수를 먼저 설정해주세요.");
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSession(data.session);
      const { data: profile, error: profileError } = await supabase.from("profiles").select("nickname,onboarding_completed").eq("id", data.session.user.id).maybeSingle();
      if (profileError) setError(profileError.message);
      if (profile?.onboarding_completed) {
        router.replace("/(tabs)/home");
        return;
      }
      if (profile?.nickname && profile.nickname !== "농업인") setNickname(profile.nickname);
      setLoading(false);
    });
  }, [router]);

  const toggleAll = () => {
    const next = !allChecked;
    setTerms(next);
    setPrivacy(next);
    setMarketing(next);
  };

  const showTerms = (title) => Alert.alert(title, title === "마케팅 정보 수신 동의" ? "농업 정보와 서비스 소식을 선택적으로 받을 수 있습니다. 동의하지 않아도 서비스를 이용할 수 있습니다." : "수익농가 서비스 이용과 개인정보 처리에 필요한 필수 동의 항목입니다.");

  const complete = async () => {
    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      setError("닉네임은 2자 이상 20자 이하로 입력해주세요.");
      return;
    }
    if (!terms || !privacy) {
      setError("필수 약관에 동의해주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("profiles").update({
      nickname: trimmed,
      terms_accepted_at: now,
      privacy_accepted_at: now,
      marketing_opt_in: marketing,
      onboarding_completed: true,
    }).eq("id", session.user.id);
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.replace("/location-setup");
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color={COLORS.navy} /></View>;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>회원가입</Text>
          <Text style={styles.subtitle}>수익농가를 시작하기 위해 몇 가지만 알려주세요</Text>
        </View>

        <View style={styles.fieldsCard}>
          <Text style={styles.label}>닉네임</Text>
          <TextInput value={nickname} onChangeText={setNickname} maxLength={20} placeholder="사용하실 닉네임을 입력하세요" placeholderTextColor={COLORS.textSub} style={styles.input} />
        </View>

        <View style={styles.termsCard}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allChecked }} onPress={toggleAll} style={styles.termRow}>
            <View style={styles.termLeft}><CheckBox checked={allChecked} onPress={toggleAll} /><Text style={styles.allLabel}>전체 동의</Text></View>
          </Pressable>
          <View style={styles.divider} />
          <TermRow checked={terms} onToggle={() => setTerms((value) => !value)} type="[필수]" label="이용약관 동의" onView={() => showTerms("이용약관 동의")} />
          <TermRow checked={privacy} onToggle={() => setPrivacy((value) => !value)} type="[필수]" label="개인정보 처리방침 동의" onView={() => showTerms("개인정보 처리방침 동의")} />
          <TermRow checked={marketing} onToggle={() => setMarketing((value) => !value)} type="[선택]" label="마케팅 정보 수신 동의" onView={() => showTerms("마케팅 정보 수신 동의")} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable disabled={submitting} onPress={complete} style={({ pressed }) => [styles.submit, (pressed || submitting) && styles.submitPressed]}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>가입 완료</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  page: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 24, gap: 24, backgroundColor: COLORS.bg },
  header: { gap: 6 },
  title: { color: COLORS.navy, fontSize: 22, fontWeight: "700" },
  subtitle: { color: COLORS.textSub, fontSize: 13 },
  fieldsCard: { paddingHorizontal: 16, paddingVertical: 18, gap: 8, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, backgroundColor: COLORS.card },
  label: { color: COLORS.textMain, fontSize: 14, fontWeight: "700" },
  input: { width: "100%", height: 42, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, backgroundColor: COLORS.card, color: COLORS.textMain, fontSize: 14 },
  termsCard: { padding: 16, gap: 14, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, backgroundColor: COLORS.card },
  termRow: { minHeight: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  termLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: { width: 18, height: 18, borderWidth: 1, borderColor: COLORS.line, borderRadius: 4, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.card },
  checkboxChecked: { borderColor: COLORS.navy, backgroundColor: COLORS.navy },
  check: { marginTop: -1, color: "#fff", fontSize: 12, fontWeight: "700" },
  allLabel: { color: COLORS.textMain, fontSize: 15, fontWeight: "700" },
  divider: { height: 1, backgroundColor: COLORS.line },
  termLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  termType: { color: COLORS.textSub, fontSize: 13, fontWeight: "700" },
  required: { color: COLORS.accent },
  termText: { color: COLORS.textMain, fontSize: 13 },
  viewText: { color: COLORS.textSub, fontSize: 12 },
  submit: { width: "100%", height: 47, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.navy },
  submitPressed: { opacity: 0.78 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: { marginTop: -12, color: COLORS.loss, fontSize: 12 },
});
