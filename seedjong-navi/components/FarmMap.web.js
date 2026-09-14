import { StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "../constants/theme";

export default function FarmMap({ coordinate, onChange }) {
  const update = (key, value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    onChange({
      latitude: coordinate?.latitude ?? 36.5,
      longitude: coordinate?.longitude ?? 127.8,
      [key]: number,
    });
  };
  return (
    <View style={styles.box}>
      <Text style={styles.title}>웹 미리보기에서는 좌표로 핀을 지정합니다.</Text>
      <View style={styles.row}>
        <TextInput style={styles.input} keyboardType="decimal-pad" defaultValue={String(coordinate?.latitude ?? 36.5)} onEndEditing={(event) => update("latitude", event.nativeEvent.text)} placeholder="위도" />
        <TextInput style={styles.input} keyboardType="decimal-pad" defaultValue={String(coordinate?.longitude ?? 127.8)} onEndEditing={(event) => update("longitude", event.nativeEvent.text)} placeholder="경도" />
      </View>
      <Text style={styles.hint}>휴대폰 앱에서는 지도를 눌러 핀을 옮길 수 있습니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 150, padding: 14, borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, backgroundColor: "#f8f9fb", justifyContent: "center", gap: 10 },
  title: { fontSize: 13, fontWeight: "700", color: COLORS.navy },
  row: { flexDirection: "row", gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: COLORS.line, borderRadius: 6, padding: 10, backgroundColor: COLORS.card, color: COLORS.textMain },
  hint: { fontSize: 11, color: COLORS.textFaint },
});
