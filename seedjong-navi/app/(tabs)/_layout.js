import { Redirect, Tabs, useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import FigmaTabIcon from "../../components/FigmaTabIcon";
import { COLORS } from "../../constants/theme";
import { useRegion } from "../../context/RegionContext";

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { mode } = useGlobalSearchParams();
  const { selectedRegion, hydrated } = useRegion();

  if (hydrated && !selectedRegion) {
    return <Redirect href="/location-setup" />;
  }

  return (
    <View style={styles.root}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.navy,
        tabBarInactiveTintColor: COLORS.textFaint,
        tabBarStyle: { position:"absolute", left:20, right:20, bottom:0, height:48, paddingTop:3, paddingBottom:2, backgroundColor:COLORS.card, borderTopColor:COLORS.line, display: pathname === "/chatbot" || mode === "write" ? "none" : "flex" },
        tabBarItemStyle: { height: 47 },
        tabBarIconStyle: { marginTop: -4, marginBottom: -2 },
        tabBarLabel: ({ focused, children }) => <Text style={{fontSize:9.5,lineHeight:11,fontWeight:focused?"700":"400",color:focused?COLORS.textMain:COLORS.textFaint}}>{children}</Text>,
      }}
    >
      <Tabs.Screen name="home" options={{ title: "홈", tabBarIcon: ({ focused }) => <FigmaTabIcon name="home" active={focused} /> }} />
      <Tabs.Screen
        name="recommend"
        options={{ title: "추천", tabBarIcon: ({ focused }) => <FigmaTabIcon name="recommend" active={focused} /> }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.replace("/(tabs)/recommend/loading");
          },
        }}
      />
      <Tabs.Screen name="calculator" options={{ title: "수익", tabBarIcon: ({ focused }) => <FigmaTabIcon name="calculator" active={focused} /> }} />
      <Tabs.Screen name="diary" options={{ title: "일지", tabBarIcon: ({ focused }) => <FigmaTabIcon name="diary" active={focused} /> }} />
      <Tabs.Screen name="community" options={{ title: "커뮤니티", tabBarIcon: ({ focused }) => <FigmaTabIcon name="community" active={focused} /> }} />
      <Tabs.Screen name="chatbot" options={{ href: null }} />
      <Tabs.Screen name="weekly-briefing" options={{ href: null }} />
      <Tabs.Screen
        name="edit-location"
        options={{ href: null }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push("/location-setup");
          },
        }}
      />
    </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({ root:{flex:1} });
