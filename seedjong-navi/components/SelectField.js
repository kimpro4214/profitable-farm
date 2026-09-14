import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "../constants/theme";

// 지역/병해충/작물 선택에 공용으로 쓰는 Modal+FlatList 선택 컴포넌트.
// @react-native-picker/picker 같은 네이티브 링킹 패키지 없이 구현 —
// 큰 터치 영역으로 고령 사용자 접근성을 우선함.
export default function SelectField({ label, value, options, onChange, placeholder = "선택하세요", disabled = false, searchable = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalized = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const current = normalized.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko-KR");
    if (!keyword) return normalized;
    return normalized.filter((option) => option.label.toLocaleLowerCase("ko-KR").includes(keyword));
  }, [normalized, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={() => !disabled && setOpen(true)}
      >
        <Text style={current ? styles.triggerText : styles.placeholderText}>
          {current ? current.label : placeholder}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            {searchable ? <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={`${label || "항목"} 검색`}
              placeholderTextColor={COLORS.textFaint}
              autoCorrect={false}
            /> : null}
            <FlatList
              data={filtered}
              keyExtractor={(item, i) => `${item.value}-${i}`}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.emptyText}>검색 결과가 없습니다.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    onChange(item.value);
                    close();
                  }}
                >
                  <Text style={item.value === value ? styles.optionTextSelected : styles.optionText}>
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 12 },
  label: { fontSize: 13, marginBottom: 6, color: "#445" },
  trigger: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    backgroundColor: COLORS.card,
  },
  triggerDisabled: { backgroundColor: "#f0f1f4" },
  triggerText: { fontSize: 15, color: COLORS.textMain },
  placeholderText: { fontSize: 15, color: "#99a" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
    paddingTop: 12,
    paddingBottom: 24,
  },
  sheetTitle: { fontSize: 15, fontWeight: "700", color: COLORS.navy, paddingHorizontal: 20, marginBottom: 8 },
  searchInput: { height: 44, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, color: COLORS.textMain, backgroundColor: COLORS.card },
  emptyText: { paddingVertical: 24, textAlign: "center", color: COLORS.textFaint },
  option: { paddingVertical: 16, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: COLORS.line },
  optionText: { fontSize: 16, color: COLORS.textMain },
  optionTextSelected: { fontSize: 16, color: COLORS.accent, fontWeight: "700" },
});
