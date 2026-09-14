import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../constants/theme";
import { completeOAuthSession, getPostAuthRoute } from "../../lib/auth";
import { supabase } from "../../lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const finish = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        let session = data.session;

        if (!session) {
          const callbackUrl = await Linking.getInitialURL();
          session = await completeOAuthSession(callbackUrl);
        }

        if (!session) {
          session = await new Promise((resolve) => {
            let authSubscription;
            const timeout = setTimeout(() => {
              authSubscription?.unsubscribe();
              resolve(null);
            }, 6000);
            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
              if (!nextSession) return;
              clearTimeout(timeout);
              authSubscription?.unsubscribe();
              resolve(nextSession);
            });
            authSubscription = subscription;
          });
        }

        if (!session) throw new Error("로그인 세션을 확인하지 못했습니다. 다시 로그인해주세요.");
        const nextRoute = await getPostAuthRoute(session);
        if (active) router.replace(nextRoute);
      } catch (callbackError) {
        if (active) setError(callbackError.message);
      }
    };
    finish();
    return () => { active = false; };
  }, [router]);

  return <View style={styles.screen}>{error ? <><Text style={styles.error}>{error}</Text><Text onPress={() => router.replace("/login")} style={styles.retry}>로그인으로 돌아가기</Text></> : <ActivityIndicator color={COLORS.navy} />}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: COLORS.bg },
  error: { color: COLORS.loss, fontSize: 13, textAlign: "center" },
  retry: { color: COLORS.navy, fontSize: 13, fontWeight: "700" },
});
