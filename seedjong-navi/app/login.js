import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import AuthBrand from "../components/AuthBrand";
import KakaoBubbleIcon from "../components/KakaoBubbleIcon";
import { COLORS } from "../constants/theme";
import { getPostAuthRoute, signInWithProvider } from "../lib/auth";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function Login() {
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) router.replace(await getPostAuthRoute(data.session));
    }).catch((sessionError) => setError(sessionError.message));
  }, [router]);

  const login = async (provider) => {
    try {
      setError("");
      setLoadingProvider(provider);
      const session = await signInWithProvider(provider);
      if (session) router.replace(await getPostAuthRoute(session));
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoadingProvider("");
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <AuthBrand />

        <View style={styles.socialButtons}>
          <Pressable disabled={Boolean(loadingProvider)} style={({ pressed }) => [styles.google, pressed && styles.pressed]} onPress={() => login("google")}>
            {loadingProvider === "google" ? <ActivityIndicator color="#4285F4" /> : <><Text style={styles.googleMark}>G</Text><Text style={styles.googleText}>Google로 계속하기</Text></>}
          </Pressable>
          <Pressable disabled={Boolean(loadingProvider)} style={({ pressed }) => [styles.kakao, pressed && styles.pressed]} onPress={() => login("kakao")}>
            {loadingProvider === "kakao" ? <ActivityIndicator color="#1C1C1C" /> : <><KakaoBubbleIcon /><Text style={styles.kakaoText}>카카오로 계속하기</Text></>}
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <Text style={styles.legal}>진행 시 이용약관 및 개인정보처리방침에 동의하게 됩니다</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  content: { alignItems: "center", gap: 56, width: "100%" },
  socialButtons: { alignItems: "center", gap: 12, width: "100%" },
  google: { width: 300, height: 50, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, backgroundColor: COLORS.card, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  googleMark: { color: "#4285F4", fontSize: 18, fontWeight: "700" },
  googleText: { color: COLORS.textMain, fontSize: 15, fontWeight: "700" },
  kakao: { width: 300, height: 50, borderRadius: 10, backgroundColor: "#FEE500", flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  kakaoText: { color: "#1C1C1C", fontSize: 15, fontWeight: "700" },
  legal: { color: COLORS.textSub, fontSize: 11 },
  pressed: { opacity: 0.78 },
  error: { width: 300, color: COLORS.loss, fontSize: 11, textAlign: "center" },
});
