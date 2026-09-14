import AsyncStorage from "@react-native-async-storage/async-storage";
import { isSupabaseConfigured, supabase } from "./supabase";

export const DIARY_STORAGE_KEY = "seedjong-farm-diary-v2";
const DIARY_IMAGE_BUCKET = "diary-images";

function mapDiaryItem(item, imageUrl = null) {
  return {
    id: item.id,
    date: item.work_date ?? item.date,
    crop: item.crop,
    note: item.work ?? item.note,
    description: item.description || "",
    imagePath: item.image_path ?? item.imagePath ?? null,
    imageUrl: imageUrl ?? item.imageUrl ?? null,
  };
}

async function createDiaryImageUrl(imagePath) {
  if (!imagePath || !isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.storage.from(DIARY_IMAGE_BUCKET).createSignedUrl(imagePath, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

async function uploadDiaryImage(asset, userId) {
  if (!asset) return null;
  const mimeType = asset.mimeType || "image/jpeg";
  const extensionByMime = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  const extension = extensionByMime[mimeType] || "jpg";
  const imagePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const uploadBody = asset.file || await fetch(asset.uri).then((response) => response.arrayBuffer());
  const { error } = await supabase.storage
    .from(DIARY_IMAGE_BUCKET)
    .upload(imagePath, uploadBody, { contentType: mimeType, cacheControl: "3600", upsert: false });
  if (error) throw error;
  return imagePath;
}

async function getUserId() {
  if (!isSupabaseConfigured || !supabase) return "offline-user";
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("영농일지를 보려면 로그인이 필요합니다.");
  return data.user.id;
}

const localKey = (userId) => `${DIARY_STORAGE_KEY}:${userId}`;

async function loadLocalDiary(userId) {
  const value = await AsyncStorage.getItem(localKey(userId));
  if (!value) return [];
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : [];
}

export async function loadDiaryItems() {
  const userId = await getUserId();
  if (!isSupabaseConfigured || !supabase) return loadLocalDiary(userId);
  const { data, error } = await supabase
    .from("diary_entries")
    .select("id,work_date,crop,work,description,image_path,created_at")
    .eq("user_id", userId)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((item) => mapDiaryItem(item));
}

export async function loadDiaryItem(id) {
  const userId = await getUserId();
  if (!isSupabaseConfigured || !supabase) {
    const items = await loadLocalDiary(userId);
    return items.find((item) => String(item.id) === String(id)) || null;
  }
  const { data, error } = await supabase
    .from("diary_entries")
    .select("id,work_date,crop,work,description,image_path,created_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapDiaryItem(data, await createDiaryImageUrl(data.image_path));
}

export async function addDiaryItem(item) {
  const userId = await getUserId();
  if (!isSupabaseConfigured || !supabase) {
    const items = await loadLocalDiary(userId);
    const nextItem = { ...item, imageAsset: undefined, imageUrl: item.imageAsset?.uri || null };
    const next = [nextItem, ...items];
    await AsyncStorage.setItem(localKey(userId), JSON.stringify(next));
    return next;
  }
  let imagePath = null;
  try {
    imagePath = await uploadDiaryImage(item.imageAsset, userId);
    const { data, error } = await supabase.from("diary_entries").insert({
      user_id: userId,
      work_date: item.date,
      crop: item.crop,
      work: item.note,
      description: item.description || "",
      image_path: imagePath,
    }).select("id,work_date,crop,work,description,image_path").single();
    if (error) throw error;
    return mapDiaryItem(data, await createDiaryImageUrl(data.image_path));
  } catch (error) {
    if (imagePath) await supabase.storage.from(DIARY_IMAGE_BUCKET).remove([imagePath]);
    throw error;
  }
}
