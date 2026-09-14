import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Platform, StyleSheet } from "react-native";

export default function FarmMap({ coordinate, onChange }) {
  const fallback = coordinate || { latitude: 36.5, longitude: 127.8 };
  return (
    <MapView
      key={`${fallback.latitude}-${fallback.longitude}`}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      style={styles.map}
      initialRegion={{ ...fallback, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
      onPress={(event) => onChange(event.nativeEvent.coordinate)}
      showsUserLocation
    >
      {coordinate ? <Marker coordinate={coordinate} draggable onDragEnd={(event) => onChange(event.nativeEvent.coordinate)} /> : null}
    </MapView>
  );
}

const styles = StyleSheet.create({ map: { width: "100%", height: 210, borderRadius: 8 } });
