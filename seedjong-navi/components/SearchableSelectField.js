import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "../constants/theme";

// 작물처럼 선택지가 많은 목록에 쓰는 검색형 선택 컴포넌트.
// 이름을 입력하면 일치하는 항목이 입력창 바로 아래에 나타나 탭해서 고를 수 있다.
// SelectField(Modal+FlatList)와 달리 전체 목록을 먼저 열지 않고 입력으로 좁혀 들어간다.
export default function SearchableSelectField({ label, value, options, onChange, placeholder = "이름을 입력하세요", containerStyle }) {
  const normalized = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const selected = normalized.find((o) => o.value === value);

  const [query, setQuery] = useState(selected ? selected.label : "");
  const [open, setOpen] = useState(false);

  const trimmed = query.trim();
  const filtered = trimmed
    ? normalized.filter((o) => o.label.toLowerCase().includes(trimmed.toLowerCase()))
    : normalized;

  const handleChangeText = (text) => {
    setQuery(text);
    setOpen(true);
    if (value) onChange("");
  };

  const handleSelect = (item) => {
    setQuery(item.label);
    onChange(item.value);
    setOpen(false);
  };

  return (
    <View style={[styles.field, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={handleChangeText}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 ? (
        <View style={styles.dropdown}>
          {filtered.slice(0, 6).map((item) => (
            <Pressable key={item.value} style={styles.option} onPress={() => handleSelect(item)}>
              <Text style={styles.optionText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {open && trimmed && filtered.length === 0 ? (
        <Text style={styles.emptyText}>일치하는 작물이 없어요</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 12 },
  label: { fontSize: 13, marginBottom: 6, color: "#445" },
  input: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    fontSize: 15,
    backgroundColor: COLORS.card,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: COLORS.card,
    overflow: "hidden",
  },
  option: { paddingVertical: 10, paddingHorizontal: 12 },
  optionText: { fontSize: 14, color: COLORS.textMain },
  emptyText: { fontSize: 12, color: COLORS.textFaint, marginTop: 4 },
});
