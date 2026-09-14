import { useRouter } from "expo-router";
import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AppBrand from "../components/AppBrand";
import { COLORS } from "../constants/theme";
import { addDiaryItem } from "../lib/diaryStore";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export default function DiaryWrite() {
  const router = useRouter();
  const [crop, setCrop] = useState("");
  const [work, setWork] = useState("");
  const [description, setDescription] = useState("");
  const [imageAsset, setImageAsset] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!work.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await addDiaryItem({
        id: String(Date.now()), date: new Date().toISOString().slice(0, 10),
        crop: crop.trim() || "미등록 작물", note: work.trim(), description: description.trim(), imageAsset,
      });
      router.replace("/(tabs)/diary");
    } catch (nextError) {
      setError(nextError.message || "영농일지를 저장하지 못했습니다.");
      setSaving(false);
    }
  };

  const pickImage = async () => {
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("사진을 첨부하려면 사진 접근 권한을 허용해주세요.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.75,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      setError("사진은 8MB 이하만 첨부할 수 있어요.");
      return;
    }
    setImageAsset(asset);
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <AppBrand />
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← 목록으로</Text></Pressable>
      <Text style={styles.title}>농사 기록 작성</Text>
      <View style={styles.formCard}>
        <View style={styles.section}><Text style={styles.sectionTitle}>작물</Text><TextInput value={crop} onChangeText={setCrop} placeholder="작물을 입력하세요." placeholderTextColor={COLORS.textFaint} style={styles.slimInput} /></View>
        <View style={styles.formDivider} />
        <View style={styles.section}><Text style={styles.sectionTitle}>농작업 <Text style={styles.required}>* 필수입력</Text></Text><TextInput value={work} onChangeText={setWork} placeholder="농작업을 입력하세요." placeholderTextColor={COLORS.textFaint} style={styles.slimInput} /></View>
        <View style={styles.formDivider} />
        <View style={styles.section}><Text style={styles.sectionTitle}>설명</Text><TextInput value={description} onChangeText={setDescription} placeholder="자유롭게 오늘 농작업을 기록해보세요." placeholderTextColor={COLORS.textFaint} multiline style={styles.note} /></View>
        <View style={styles.formDivider} />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>사진</Text>
          {imageAsset ? (
            <View style={styles.photoPreviewWrap}>
              <Pressable onPress={pickImage}><Image source={{ uri: imageAsset.uri }} style={styles.photoPreview} resizeMode="cover" /></Pressable>
              <Pressable accessibilityLabel="첨부 사진 삭제" onPress={() => setImageAsset(null)} style={styles.removePhoto}>
                <Text style={styles.removePhotoText}>×</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={pickImage} style={styles.photo}><Text style={styles.photoText}>📷+</Text></Pressable>
          )}
        </View>
      </View>
      <Pressable disabled={saving} onPress={save} style={[styles.save, saving && styles.saveDisabled]}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>저장</Text>}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, padding: 20, gap: 16, backgroundColor: COLORS.bg },
  back: { fontSize: 13, fontWeight: "700", color: COLORS.textSub },
  title: { fontSize: 20, fontWeight: "700", color: COLORS.textMain },
  formCard: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 14, gap: 14 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textMain },
  required: { fontSize: 12, color: COLORS.textSub },
  formDivider: { height: 1, backgroundColor: COLORS.line },
  slimInput: { height: 34, borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, paddingHorizontal: 12, fontSize: 14, color: COLORS.textMain },
  note: { height: 90, borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, padding: 12, fontSize: 14, color: COLORS.textMain, textAlignVertical: "top" },
  photo: { width: 88, height: 88, borderRadius: 12, backgroundColor: COLORS.bg, justifyContent: "center", alignItems: "center" },
  photoText: { fontSize: 14 },
  photoPreviewWrap: { position: "relative", width: 120, height: 90, borderRadius: 12, overflow: "hidden", backgroundColor: COLORS.bg },
  photoPreview: { width: 120, height: 90 },
  removePhoto: { position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(28,37,48,0.78)", alignItems: "center", justifyContent: "center" },
  removePhotoText: { color: "#fff", fontSize: 20, lineHeight: 22, fontWeight: "700" },
  save: { height: 47, backgroundColor: COLORS.navy, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: { fontSize: 12, color: COLORS.loss, textAlign: "center" },
});
