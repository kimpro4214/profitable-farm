import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../constants/theme";

// legacy-web .indicator-grid 이식 — {label, value} 배열을 받아 2열 카드로 표시
export default function IndicatorGrid({ items }) {
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <View key={item.label} style={styles.item}>
          <Text style={styles.itemLabel}>{item.label}</Text>
          <Text style={styles.itemValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 0 },
  item: {
    width: "48.6%",
    backgroundColor: "#f8f9fb",
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemLabel: { fontSize: 12.5, color: COLORS.textSub },
  itemValue: { fontSize: 14, fontWeight: "700", color: COLORS.textMain, marginTop: 4 },
});
