import { StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { COLORS } from "../constants/theme";

const sproutXml = `<svg width="21" height="21" viewBox="0 0 42.5 42.5" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M36.3 5.1c1.1-.1 1.2.3 1.1 1.4-.5 7.8-3.5 15.5-12.5 16 .2-4.2 1.8-8.2 5.1-10.2-4.8 1.2-7.2 5.7-7 10.8.1 2.5-.1 5.1 0 7.4-1-.1-3-.1-4 .1V24.6c0-4-.1-7.5-4.9-9.6-.6.6.6 1.1.9 1.4 1.7 1.6 2.1 3.8 2.2 6.1-6.7 0-9.5-4.8-10.2-13 6.4-.8 11.5 1.1 13 6.5C21 8.2 28.9 5.2 36.3 5.1Z" fill="#FF630F"/><path d="M19.9 31.5c6-.3 11.8.8 17 2.8 2.4.9 2.2 1.2 2.2 4.4H3.4c-.1-3.5-.3-3.4 2.4-4.4 4.8-1.8 9-2.5 14.1-2.8Z" fill="#FF630F"/></svg>`;

export default function AppBrand() {
  return (
    <View style={styles.row}>
      <Text style={styles.text}>수익농가</Text>
      <SvgXml xml={sproutXml} width={21} height={21} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 28, flexDirection: "row", alignItems: "center", gap: 1 },
  text: { color: COLORS.navy, fontSize: 22, lineHeight: 28, fontWeight: "900", letterSpacing: -0.8 },
});
