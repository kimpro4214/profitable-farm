import { Stack } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { RegionProvider } from "../context/RegionContext";
import { RecommendationProvider } from "../context/RecommendationContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.canvas}>
        <RegionProvider>
          <RecommendationProvider><Stack screenOptions={{ headerShown: false }} /></RecommendationProvider>
        </RegionProvider>
      </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: 10 },
  canvas: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    maxWidth: Platform.OS === "web" ? 360 : undefined,
    ...(Platform.OS === "web" ? { boxShadow: "0 0 24px rgba(28,37,48,0.12)" } : null),
  },
});
