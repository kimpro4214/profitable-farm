// legacy-web/index.html의 climateLabel/zoneLabel/병해충 선택지를 그대로 이식
export const CLIMATE_LABEL = {
  cool: "서늘한 지역",
  temperate: "중간(온대)",
  warm: "따뜻한 지역",
};

export const ZONE_LABEL = {
  general: "농업진흥지역 밖",
  boho: "농업보호구역",
  jinheung: "농업진흥구역",
};

export const PEST_OPTIONS = [
  { value: "", label: "— 없음 —" },
  { value: "배추", label: "배추(십자화과)" },
  { value: "고추", label: "고추(가지과)" },
  { value: "감자", label: "감자(가지과)" },
  { value: "양파", label: "양파(백합과)" },
];
