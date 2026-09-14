import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import regionsData from "../data/regions.json";
import { supabase } from "../lib/supabase";

const RegionContext = createContext(null);
const STORAGE_KEY = "seedjong.region.v1";
const FARM_STORAGE_KEY = "seedjong.farm-analysis.v1";

const LEGACY_REGION_PATHS = {
  region_01: ["김제시", "광활면"],
  region_02: ["해남군", "산이면"],
  region_03: ["평창군", "대관령면"],
  region_04: ["상주시", "공검면"],
  region_05: ["서산시", "인지면"],
};

function findRegionId(regions, storedId) {
  if (regions.some((region) => region.id === storedId)) return storedId;
  const legacyPath = LEGACY_REGION_PATHS[storedId];
  if (!legacyPath) return null;
  return regions.find(
    (region) => region.city === legacyPath[0] && region.township === legacyPath[1]
  )?.id ?? null;
}

export function RegionProvider({ children }) {
  const regions = regionsData.regions || [];
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [farmAnalysis, setFarmAnalysis] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(FARM_STORAGE_KEY)]).then(([stored, storedFarm]) => {
      const migratedId = stored ? findRegionId(regions, stored) : null;
      if (migratedId) setSelectedRegionId(migratedId);
      if (storedFarm) {
        const parsed = JSON.parse(storedFarm);
        if (parsed?.version === 1 && parsed.analysis) setFarmAnalysis(parsed.analysis);
      }
    }).catch(() => undefined).finally(() => setHydrated(true));
  }, [regions]);

  useEffect(() => {
    if (!hydrated) return;
    const operation = selectedRegionId
      ? AsyncStorage.setItem(STORAGE_KEY, selectedRegionId)
      : AsyncStorage.removeItem(STORAGE_KEY);
    operation.catch(() => undefined);
  }, [selectedRegionId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const operation = farmAnalysis
      ? AsyncStorage.setItem(FARM_STORAGE_KEY, JSON.stringify({ version: 1, analysis: farmAnalysis }))
      : AsyncStorage.removeItem(FARM_STORAGE_KEY);
    operation.catch(() => undefined);
  }, [farmAnalysis, hydrated]);

  useEffect(() => {
    if (!hydrated || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return null;
      return supabase.from("farm_profiles").select("region_id,analysis").maybeSingle();
    }).then((result) => {
      if (!result?.data?.analysis) return;
      setFarmAnalysis(result.data.analysis);
      if (result.data.region_id && regions.some((region) => region.id === result.data.region_id)) {
        setSelectedRegionId(result.data.region_id);
      }
    }).catch(() => undefined);
  }, [hydrated, regions]);

  const selectedRegion = useMemo(() => {
    const base = regions.find((r) => r.id === selectedRegionId) || null;
    if (!base || !farmAnalysis) return base;
    const soil = farmAnalysis.soil?.available ? farmAnalysis.soil : null;
    const zone = farmAnalysis.zone?.available ? farmAnalysis.zone : null;
    return {
      ...base,
      coordinates: farmAnalysis.parcel ? {
        latitude: farmAnalysis.parcel.latitude,
        longitude: farmAnalysis.parcel.longitude,
      } : base.coordinates,
      parcel: farmAnalysis.parcel,
      water: farmAnalysis.water,
      site: {
        ...base.site,
        soilPh: Number.isFinite(soil?.ph) ? soil.ph : base.site.soilPh,
        salinityEC: Number.isFinite(soil?.ecDsM) ? soil.ecDsM : base.site.salinityEC,
        zoneType: zone?.type || base.site.zoneType,
      },
    };
  }, [regions, selectedRegionId, farmAnalysis]);

  const setSelectedRegionById = (nextId) => {
    if (nextId !== selectedRegionId) setFarmAnalysis(null);
    setSelectedRegionId(nextId);
  };

  const value = {
    regions,
    selectedRegion,
    setSelectedRegionById,
    farmAnalysis,
    setFarmAnalysis,
    hydrated,
  };

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion() {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error("useRegion must be used within a RegionProvider");
  return ctx;
}
