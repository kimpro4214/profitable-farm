import { Stack } from "expo-router";
import { createContext, useContext, useState } from "react";
import { useRegion } from "../../../context/RegionContext";

const CalculatorFlowContext = createContext(null);

export function useCalculatorFlow() {
  const ctx = useContext(CalculatorFlowContext);
  if (!ctx) throw new Error("useCalculatorFlow must be used within the calculator stack");
  return ctx;
}

// 입력 화면(index)과 결과 화면(result)이 이 값을 공유하기 위한 탭 전용 Context.
export default function CalculatorLayout() {
  const { selectedRegion } = useRegion();
  const initialPest = (selectedRegion?.site.recentCropHistory || []).find((h) => h.pestIssue);

  const [pestCrop, setPestCrop] = useState(initialPest ? initialPest.crop : "");
  const [area, setArea] = useState("1500");
  const [cropName, setCropName] = useState("고추");
  const [result, setResult] = useState(null);

  const value = {
    pestCrop,
    setPestCrop,
    area,
    setArea,
    cropName,
    setCropName,
    result,
    setResult,
  };

  return (
    <CalculatorFlowContext.Provider value={value}>
      <Stack screenOptions={{ headerShown: false }} />
    </CalculatorFlowContext.Provider>
  );
}
