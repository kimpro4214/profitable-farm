const coordinateCache = new Map();

function regionSearchNames(region) {
  return [region?.township, region?.city, region?.province].filter(Boolean);
}

function locationScore(result, region) {
  const candidate = [result?.name, result?.admin1, result?.admin2, result?.admin3].filter(Boolean).join(" ");
  return regionSearchNames(region).reduce(
    (score, part, index) => score + (candidate.includes(part) ? 4 - index : 0),
    0
  );
}

async function geocodeRegion(region, signal) {
  if (!region?.id) throw new Error("선택 지역 정보가 없습니다.");
  if (Number.isFinite(region?.coordinates?.latitude) && Number.isFinite(region?.coordinates?.longitude)) {
    return region.coordinates;
  }
  if (coordinateCache.has(region.id)) return coordinateCache.get(region.id);

  for (const name of regionSearchNames(region)) {
    const params = new URLSearchParams({ name, count: "10", language: "ko", countryCode: "KR", format: "json" });
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal });
    if (!response.ok) continue;
    const data = await response.json();
    const candidates = (data?.results || []).filter(
      (item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
    );
    if (!candidates.length) continue;
    const best = [...candidates].sort((a, b) => locationScore(b, region) - locationScore(a, region))[0];
    const coordinates = { latitude: best.latitude, longitude: best.longitude };
    coordinateCache.set(region.id, coordinates);
    return coordinates;
  }
  throw new Error("선택 지역의 날씨 좌표를 찾지 못했습니다.");
}

export function weatherEmoji(code) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "🌨️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌤️";
}

export async function fetchCurrentWeather(region, signal) {
  const coordinates = await geocodeRegion(region, signal);
  const params = new URLSearchParams({
    latitude: String(coordinates.latitude), longitude: String(coordinates.longitude),
    current: "temperature_2m,weather_code", daily: "precipitation_sum,sunshine_duration", forecast_days: "1", timezone: "Asia/Seoul",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!response.ok) throw new Error(`날씨 API 응답 오류 (${response.status})`);
  const data = await response.json();
  if (typeof data?.current?.temperature_2m !== "number") throw new Error("현재 기온 값이 없습니다.");
  return {
    temperature: Math.round(data.current.temperature_2m),
    code: data.current.weather_code,
    observedAt: data.current.time,
    precipitationMm: Number(data?.daily?.precipitation_sum?.[0]) || 0,
    sunshineHours: Math.round((Number(data?.daily?.sunshine_duration?.[0]) || 0) / 3600 * 10) / 10,
  };
}
