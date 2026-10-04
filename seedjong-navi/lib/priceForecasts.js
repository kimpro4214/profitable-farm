import { isSupabaseConfigured, supabase } from "./supabase";

const bundledForecasts = require("../data/price_forecasts.json").items || [];
let cachedForecasts = null;
let cachedAt = 0;
let pending = null;

export async function fetchLatestPriceForecasts() {
  if (!isSupabaseConfigured || !supabase) return bundledForecasts;
  if (cachedForecasts && Date.now() - cachedAt < 5 * 60 * 1000) return cachedForecasts;
  if (pending) return pending;

  pending = (async () => {
    try {
      const { data, error } = await supabase
        .from("price_forecast_snapshots")
        .select("data")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      const items = data?.data?.items;
      if (!Array.isArray(items) || !items.length || !items.every(
        (item) => item?.crop && item?.forecastDate && Number.isFinite(item?.predictedPriceWon)
          && Number.isFinite(item?.metrics?.mapePercent)
      )) throw new Error("가격 예측 데이터가 비어 있거나 잘못되었습니다.");
      const latest = (forecasts) => forecasts.reduce(
        (date, item) => item.forecastDate > date ? item.forecastDate : date, ""
      );
      if (latest(items) < latest(bundledForecasts)) return bundledForecasts;
      cachedForecasts = items;
      cachedAt = Date.now();
      return items;
    } catch (error) {
      console.warn("최신 가격 예측을 불러오지 못해 앱 내 데이터를 사용합니다.", error);
      return bundledForecasts;
    } finally {
      pending = null;
    }
  })();
  return pending;
}
