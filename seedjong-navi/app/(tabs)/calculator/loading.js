import { useEffect } from "react";
import { useRouter } from "expo-router";
import AiAnalysisLoading from "../../../components/AiAnalysisLoading";
import { useRegion } from "../../../context/RegionContext";
import { CROPS, evaluateCrop } from "../../../lib/crop_matcher";
import { useCalculatorFlow } from "./_layout";

export default function CalculatorLoading() {
  const router = useRouter();
  const { selectedRegion } = useRegion();
  const { area, cropName, setResult } = useCalculatorFlow();

  useEffect(() => {
    const timer = setTimeout(() => {
      const crop = CROPS.find((item) => item.name === cropName);
      if (!crop || !selectedRegion) {
        router.replace("/(tabs)/calculator");
        return;
      }
      setResult(evaluateCrop({ ...selectedRegion.site }, crop, Number(area) || 1000));
      router.replace("/(tabs)/calculator/result");
    }, 3000);
    return () => clearTimeout(timer);
  }, [area, cropName, router, selectedRegion, setResult]);

  return <AiAnalysisLoading title="AI가 수익을 계산하고 있어요" subtitle="가격과 수확량, 비용을 분석 중이에요." />;
}
