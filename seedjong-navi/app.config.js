const base = require("./app.json").expo;

module.exports = () => {
  const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  return {
    ...base,
    plugins: [
      ...(base.plugins || []),
      [
        "expo-location",
        {
          locationWhenInUsePermission: "내 농지 위치를 지도에서 지정하기 위해 위치 권한을 사용합니다.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "커뮤니티 게시글과 영농일지에 사진을 첨부하기 위해 사진 접근 권한을 사용합니다.",
        },
      ],
      ...(googleMapsKey
        ? [["react-native-maps", { androidGoogleMapsApiKey: googleMapsKey }]]
        : []),
    ],
  };
};
