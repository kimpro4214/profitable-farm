import { StyleSheet, Text } from "react-native";
import { COLORS } from "../constants/theme";
import { riskClass } from "../lib/format";

// legacy-web .risk-badge 3종(안정적/보통/변동성 높음) 이식
export default function RiskBadge({ label }) {
  const cls = riskClass(label);
  return <Text style={[styles.badge, styles[cls]]}>{label}</Text>;
}

const styles = StyleSheet.create({
  badge: {
    fontSize: 11,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#eef1f6",
    color: "#445",
    overflow: "hidden",
  },
  stable: { backgroundColor: COLORS.riskStableBg, color: COLORS.ok },
  mid: { backgroundColor: COLORS.riskMidBg, color: COLORS.riskMidText },
  high: { backgroundColor: COLORS.riskHighBg, color: COLORS.warn },
});
