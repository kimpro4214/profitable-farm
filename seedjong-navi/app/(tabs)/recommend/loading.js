import { useEffect } from "react";
import { useRouter } from "expo-router";
import AiAnalysisLoading from "../../../components/AiAnalysisLoading";
import { useRegion } from "../../../context/RegionContext";
import { useRecommendation } from "../../../context/RecommendationContext";
import { recommendCrops } from "../../../lib/crop_matcher";

export default function RecommendLoading() {
  const router = useRouter();
  const { selectedRegion } = useRegion();
  const { pestCrop, area, setResults } = useRecommendation();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!selectedRegion) return;
      const site = {
        ...selectedRegion.site,
        recentCropHistory: pestCrop ? [{ crop: pestCrop, pestIssue: true }] : [],
      };
      setResults(recommendCrops(site, Number(area) || 1000));
      router.replace("/(tabs)/recommend/result");
    }, 3000);
    return () => clearTimeout(timer);
  }, [area, pestCrop, router, selectedRegion, setResults]);

  return <AiAnalysisLoading title="AI가 작물을 추천하고 있어요" subtitle="농지 조건과 가격 흐름을 분석 중이에요." />;
}
