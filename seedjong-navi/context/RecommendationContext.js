import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";

const RecommendationContext = createContext(null);
const STORAGE_KEY = "seedjong.recommendation.v1";

export function RecommendationProvider({ children }) {
  const [pestCrop, setPestCrop] = useState("");
  const [area, setArea] = useState("1000");
  const [results, setResults] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored);
        setPestCrop(parsed.pestCrop || "");
        setArea(parsed.area || "1000");
        setResults(parsed.version === 3 && Array.isArray(parsed.results) ? parsed.results : null);
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, pestCrop, area, results })).catch(() => undefined);
  }, [pestCrop, area, results, hydrated]);

  return (
    <RecommendationContext.Provider value={{ pestCrop, setPestCrop, area, setArea, results, setResults, hydrated }}>
      {children}
    </RecommendationContext.Provider>
  );
}

export function useRecommendation() {
  const value = useContext(RecommendationContext);
  if (!value) throw new Error("useRecommendation must be used within RecommendationProvider");
  return value;
}
