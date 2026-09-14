import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { COLORS } from "../constants/theme";
import { getPostAuthRoute } from "../lib/auth";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function Entry() {
  const [route, setRoute] = useState(null);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) {
      setRoute("/login");
      return () => { active = false; };
    }
    supabase.auth.getSession()
      .then(async ({ data, error }) => {
        if (error) throw error;
        const nextRoute = data.session ? await getPostAuthRoute(data.session) : "/login";
        if (active) setRoute(nextRoute);
      })
      .catch(() => active && setRoute("/login"));
    return () => { active = false; };
  }, []);

  if (route) return <Redirect href={route} />;
  return <View style={styles.loading}><ActivityIndicator color={COLORS.navy} /></View>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
});
