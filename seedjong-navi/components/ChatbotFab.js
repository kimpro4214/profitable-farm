import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { COLORS } from "../constants/theme";

export default function ChatbotFab() {
  const router = useRouter();
  return (
    <Pressable accessibilityLabel="AI 챗봇 열기" style={({ pressed }) => [styles.fab, pressed && styles.pressed]} onPress={() => router.push("/(tabs)/chatbot")}>
      <Text style={styles.label}>AI 챗봇</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute", right: 16, bottom: 60, zIndex: 20,
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.card,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#6b7280", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 7,
  },
  label: { color: COLORS.navy, fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.78 },
});
