import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "../constants/theme";
import { analyzeFarmLocation } from "../lib/farmAnalysis";
import FarmMap from "./FarmMap";

export default function FarmLocationCard({ region, analysis, onAnalyzed }) {
  const [address, setAddress] = useState(analysis?.parcel?.address || "");
  const [coordinate, setCoordinate] = useState(
    analysis?.parcel?.latitude && analysis?.parcel?.longitude
      ? { latitude: analysis.parcel.latitude, longitude: analysis.parcel.longitude }
      : region?.coordinates || null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!analysis && region?.coordinates) setCoordinate(region.coordinates);
  }, [region?.id, region?.coordinates, analysis]);

  const useCurrentLocation = async () => {
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return setError("현재 위치 권한이 필요합니다.");
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoordinate({ latitude: current.coords.latitude, longitude: current.coords.longitude });
      setAddress("");
    } catch (nextError) {
      setError(nextError.message || "현재 위치를 확인하지 못했습니다.");
    }
  };

  const run = async (useAddress) => {
    if (useAddress && !address.trim()) return setError("지번 주소를 입력해 주세요.");
    if (!useAddress && !coordinate) return setError("지도에서 농지 위치를 선택해 주세요.");
    setBusy(true);
    setError("");
    try {
      const result = await analyzeFarmLocation({
        regionId: region.id,
        address: useAddress ? address : "",
        latitude: coordinate?.latitude,
        longitude: coordinate?.longitude,
      });
      setAddress(result.parcel?.address || address);
      setCoordinate({ latitude: result.parcel.latitude, longitude: result.parcel.longitude });
      onAnalyzed(result);
    } catch (nextError) {
      setError(nextError.message || "농지 분석에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>정확한 농지 위치</Text>
      <Text style={styles.description}>지번을 입력하거나 지도에서 농지 위에 핀을 놓아주세요.</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="예: 경북 상주시 공검면 양정리 123-4"
        placeholderTextColor={COLORS.textFaint}
      />
      <Pressable style={styles.secondaryButton} disabled={busy} onPress={() => run(true)}>
        <Text style={styles.secondaryText}>지번으로 찾고 분석하기</Text>
      </Pressable>
      <FarmMap coordinate={coordinate} onChange={(next) => { setCoordinate(next); setAddress(""); }} />
      <View style={styles.buttonRow}>
        <Pressable style={styles.smallButton} disabled={busy} onPress={useCurrentLocation}>
          <Text style={styles.smallButtonText}>현재 위치</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} disabled={busy} onPress={() => run(false)}>
          {busy ? <ActivityIndicator color={COLORS.card} /> : <Text style={styles.primaryText}>핀 위치 분석</Text>}
        </Pressable>
      </View>
      {analysis?.parcel?.pnu ? <Text style={styles.status}>PNU {analysis.parcel.pnu}</Text> : null}
      {analysis ? <Text style={styles.status}>마지막 분석 {new Date(analysis.analyzedAt).toLocaleString("ko-KR")}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, padding: 14, gap: 10 },
  cardTitle: { fontSize: 15, color: COLORS.navy, fontWeight: "700" },
  description: { fontSize: 12, lineHeight: 17, color: COLORS.textSub },
  input: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 7, paddingHorizontal: 11, paddingVertical: 11, color: COLORS.textMain, backgroundColor: COLORS.card },
  secondaryButton: { height: 40, borderWidth: 1, borderColor: COLORS.navy, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: 13, color: COLORS.navy, fontWeight: "700" },
  buttonRow: { flexDirection: "row", gap: 8 },
  smallButton: { flex: 1, height: 42, borderWidth: 1, borderColor: COLORS.line, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  smallButtonText: { fontSize: 13, color: COLORS.navy, fontWeight: "700" },
  primaryButton: { flex: 1.5, height: 42, backgroundColor: COLORS.navy, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 13, color: COLORS.card, fontWeight: "700" },
  status: { fontSize: 10.5, color: COLORS.textFaint },
  error: { fontSize: 12, lineHeight: 17, color: "#b42318" },
});
