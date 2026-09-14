import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import FigmaTabIcon from "./FigmaTabIcon";
import { COLORS } from "../constants/theme";

const items = [
  { name: "home", label: "홈", href: "/(tabs)/home" },
  { name: "recommend", label: "추천", href: "/(tabs)/recommend" },
  { name: "calculator", label: "수익", href: "/(tabs)/calculator" },
  { name: "diary", label: "일지", href: "/(tabs)/diary" },
  { name: "community", label: "커뮤니티", href: "/(tabs)/community" },
];

export default function FigmaBottomBar({ active = "" }) {
  const router = useRouter();
  return (
    <View style={styles.bar}>
      {items.map((item) => {
        const focused = active === item.name;
        return (
          <Pressable key={item.name} style={styles.item} onPress={() => router.replace(item.href)}>
            <FigmaTabIcon name={item.name} active={focused} />
            <Text style={[styles.label, focused && styles.activeLabel]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 20, right: 20, bottom: 0, height: 48, zIndex: 30, flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: COLORS.card },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  label: { fontSize: 9.5, lineHeight: 11, color: COLORS.textFaint },
  activeLabel: { color: COLORS.textMain, fontWeight: "700" },
});
