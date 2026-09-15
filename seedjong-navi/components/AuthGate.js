import { usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { COLORS } from "../constants/theme";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

// 로그인 없이 들어갈 수 있는 화면. 여기 없는 경로는 전부 세션이 있어야 한다.
// (웹에서 /home, /diary 같은 주소를 직접 쳐도 로그인 화면으로 보낸다)
const PUBLIC_PATHS = ["/", "/login", "/auth/callback"];

export default function AuthGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState(undefined); // undefined = 아직 확인 전

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null);
      return undefined;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => active && setSession(data.session ?? null));
    // 로그아웃·토큰 만료 시에도 즉시 잠긴다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next ?? null));
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const blocked = !isPublic && session === null;

  useEffect(() => {
    if (blocked) router.replace("/login");
  }, [blocked, router]);

  return (
    <>
      {children}
      {/* 세션 확인 전이거나 로그인 화면으로 보내는 중에는 보호된 화면이 보이지 않게 덮는다 */}
      {!isPublic && !session ? (
        <View style={styles.cover}><ActivityIndicator color={COLORS.navy} /></View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
});
