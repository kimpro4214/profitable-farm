import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import AppBrand from "./AppBrand";
import { COLORS } from "../constants/theme";

export default function AiAnalysisLoading({ title, subtitle }) {
  return (
    <View style={styles.screen}>
      <View style={styles.brand}><AppBrand /></View>
      <View style={styles.content}>
        <View style={styles.spinner}>
          <ActivityIndicator size="large" color={COLORS.navy} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 80, backgroundColor: COLORS.bg },
  brand: { alignSelf: "flex-start" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 36 },
  spinner: { width: 82, height: 82, borderRadius: 41, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.card, shadowColor: "#6b7280", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 5 },
  title: { marginTop: 24, fontSize: 18, fontWeight: "700", color: COLORS.textMain, textAlign: "center" },
  subtitle: { marginTop: 8, fontSize: 13, lineHeight: 19, color: COLORS.textSub, textAlign: "center" },
});
