import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import FigmaLandingLogo from "../components/FigmaLandingLogo";
import FarmLocationCard from "../components/FarmLocationCard";
import IndicatorGrid from "../components/IndicatorGrid";
import SelectField from "../components/SelectField";
import { CLIMATE_LABEL, ZONE_LABEL } from "../constants/labels";
import { COLORS } from "../constants/theme";
import { useRegion } from "../context/RegionContext";
import { useRecommendation } from "../context/RecommendationContext";
import { fetchCurrentWeather } from "../lib/weather";

export default function LocationSetup() {
  const router = useRouter();
  const { from } = useLocalSearchParams();
  const { regions, selectedRegion, setSelectedRegionById, farmAnalysis, setFarmAnalysis } = useRegion();
  const analysisRegion = selectedRegion || regions[0] || null;
  const { setResults, hydrated } = useRecommendation();
  const [province, setProvince] = useState(selectedRegion?.province ?? "");
  const [city, setCity] = useState(selectedRegion?.city ?? "");
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    if (!selectedRegion) return;
    setProvince(selectedRegion.province);
    setCity(selectedRegion.city);
  }, [selectedRegion]);

  useEffect(() => {
    if (!selectedRegion) return;
    const controller = new AbortController();
    fetchCurrentWeather(selectedRegion, controller.signal).then(setWeather).catch(() => setWeather(null));
    return () => controller.abort();
  }, [selectedRegion]);

  const provinceOptions = useMemo(() => [...new Set(regions.map((r) => r.province))], [regions]);
  const cityOptions = useMemo(() => [...new Set(regions.filter((r) => r.province === province).map((r) => r.city))], [regions, province]);
  const townshipOptions = useMemo(() => regions.filter((r) => r.province === province && r.city === city).map((r) => ({ value: r.id, label: r.township })), [regions, province, city]);

  const handleProvinceChange = (next) => {
    setProvince(next); setCity(""); setSelectedRegionById("");
  };
  const handleCityChange = (next) => {
    setCity(next); setSelectedRegionById("");
  };

  const handleAnalyzed = (analysis) => {
    setFarmAnalysis(analysis);
    const latitude = analysis?.parcel?.latitude;
    const longitude = analysis?.parcel?.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const nearest = regions.reduce((best, region) => {
      const distance = (region.coordinates.latitude - latitude) ** 2 + (region.coordinates.longitude - longitude) ** 2;
      return !best || distance < best.distance ? { region, distance } : best;
    }, null);
    if (nearest?.region) setSelectedRegionById(nearest.region.id);
  };

  const valueOrPending = (value, suffix = "") => Number.isFinite(value) ? `${value}${suffix}` : "필지 입력 필요";
  const legacyItems = selectedRegion ? [
    { label: "가뭄 위험도", value: Number.isFinite(selectedRegion.site.droughtRisk) ? `${selectedRegion.site.droughtRisk} (${selectedRegion.site.droughtStage || "단계 미상"})` : "KRC 자료 없음" },
    { label: "저수지 저수율", value: Number.isFinite(selectedRegion.site.reservoirLevel) ? `${selectedRegion.site.reservoirLevel}%` : "KRC 자료 없음" },
    { label: "토양 EC(dS/m)", value: valueOrPending(selectedRegion.site.salinityEC) },
    { label: "지하수 관개 안정성", value: valueOrPending(selectedRegion.site.groundwaterStability) },
    { label: "토양 pH", value: valueOrPending(selectedRegion.site.soilPh) },
    { label: "서리 위험도", value: valueOrPending(selectedRegion.site.frostRisk) },
    { label: "기후대", value: CLIMATE_LABEL[selectedRegion.site.climateZone] || "좌표 분석 필요" },
    { label: "농지 용도구역", value: ZONE_LABEL[selectedRegion.site.zoneType] || "핀 분석 필요" },
  ] : [];

  const items = selectedRegion ? [
    { label: "가뭄 위험도", value: Number.isFinite(selectedRegion.site.droughtRisk) ? `${selectedRegion.site.droughtRisk} (${selectedRegion.site.droughtStage || "단계 미상"})` : "KRC 자료 없음" },
    { label: "농업용 저수율", value: Number.isFinite(selectedRegion.site.reservoirLevel) ? `${selectedRegion.site.reservoirLevel}%` : "KRC 자료 없음" },
    { label: "오늘 강수량", value: weather ? `${weather.precipitationMm}mm` : "불러오는 중" },
    { label: "오늘 일조량", value: weather ? `${weather.sunshineHours}시간` : "불러오는 중" },
    { label: "농업진흥구역", value: farmAnalysis?.zone?.available ? (farmAnalysis.zone.type === "jinheung" ? "농업진흥구역" : farmAnalysis.zone.type === "boho" ? "농업보호구역" : "일반지역") : "핀 위치 분석 후 확인" },
  ] : [];

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.logo}><FigmaLandingLogo /></View>
      <Text style={styles.title}>내 농지 입력하기</Text>
      {analysisRegion ? <FarmLocationCard region={analysisRegion} analysis={farmAnalysis} onAnalyzed={handleAnalyzed} /> : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>지역 선택</Text>
        <SelectField label="시·도" value={province} options={provinceOptions} onChange={handleProvinceChange} placeholder="— 시·도를 선택하세요 —" searchable />
        <SelectField label="시·군·구" value={city} options={cityOptions} onChange={handleCityChange} placeholder={province ? "— 시·군·구를 선택하세요 —" : "먼저 시·도를 선택하세요"} disabled={!province} searchable />
        <SelectField label="읍·면·동" value={selectedRegion?.id ?? ""} options={townshipOptions} onChange={setSelectedRegionById} placeholder={city ? "— 읍·면·동을 선택하세요 —" : "먼저 시·군·구를 선택하세요"} disabled={!city} searchable />
        {selectedRegion ? <>
          <IndicatorGrid items={items} />
          <Text style={styles.sourceHint}>{selectedRegion.source_note.replace(/\s*·\s*KRC .*2024-12-31$/, " · KRC 지하수 관정현황 2024-12-31")}</Text>
        </> : <Text style={styles.emptyHint}>시·도 → 시·군·구 → 읍·면·동 순서로 선택하세요.</Text>}
      </View>
      {farmAnalysis ? <View style={styles.card}>
        <Text style={styles.cardTitle}>지하수 이용 여건</Text>
        <IndicatorGrid items={[
          { label: "가장 가까운 관정", value: farmAnalysis.groundwater.nearestWell?.address || "인근 관정 없음" },
          { label: "관정 거리", value: Number.isFinite(farmAnalysis.groundwater.nearestWell?.distanceKm) ? `${farmAnalysis.groundwater.nearestWell.distanceKm}km` : "자료 없음" },
          { label: "양수 능력", value: Number.isFinite(farmAnalysis.groundwater.nearestWell?.pumpCapacityM3Day) ? `${farmAnalysis.groundwater.nearestWell.pumpCapacityM3Day}㎥/일` : "자료 없음" },
          { label: "이용량 등급", value: farmAnalysis.groundwater.usageLevel ?? "자료 없음" },
          { label: "오염예측 등급", value: farmAnalysis.groundwater.pollutionRiskCode ?? "자료 없음" },
        ]} />
        <Text style={styles.sourceHint}>출처: KRC 지하수 관정 · 단위면적당 이용량 · 오염예측도</Text>
      </View> : null}
      <Pressable
        style={[styles.runButton, (!selectedRegion || !hydrated) && styles.runButtonDisabled]}
        disabled={!selectedRegion || !hydrated}
        onPress={() => { setResults(null); router.push(from === "recommend" ? "/recommend-setup?from=recommend" : "/recommend-setup"); }}
      >
        <Text style={styles.runButtonText}>다음 →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, gap: 12, backgroundColor: COLORS.bg, flexGrow: 1 },
  logo: { width: 30.6568, height: 9.65681 },
  title: { fontSize: 22, lineHeight: 27, color: COLORS.navy, fontWeight: "700" },
  card: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 16 },
  cardTitle: { fontSize: 15, color: COLORS.navy, fontWeight: "700", marginBottom: 12 },
  emptyHint: { fontSize: 13, color: COLORS.textFaint },
  sourceHint: { fontSize: 11, lineHeight: 16, color: COLORS.textFaint, marginTop: 10 },
  analysisWarning: { fontSize: 12, lineHeight: 17, color: COLORS.textSub, backgroundColor: "#fff4e0", borderRadius: 8, padding: 10 },
  runButton: { height: 44, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  runButtonDisabled: { opacity: 0.45 },
  runButtonText: { color: COLORS.navy, fontSize: 15, fontWeight: "700" },
});
