import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { COLORS } from "../../constants/theme";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import ChatbotFab from "../../components/ChatbotFab";
import AppBrand from "../../components/AppBrand";

const COMMUNITY_IMAGE_BUCKET = "community-images";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function getCommunityImageUrl(imagePath) {
  if (!imagePath || !isSupabaseConfigured) return null;
  return supabase.storage.from(COMMUNITY_IMAGE_BUCKET).getPublicUrl(imagePath).data.publicUrl;
}

const samplePosts = [
  { id: "sample-1", author: "김제농부", time: "3시간 전", title: "콩 병해충 대응 팁이 궁금해요", body: "이번에 콩을 심었는데 잎에 반점이 조금씩 보여요.", detailBody: "이번에 콩 심었는데 병해충 대응 팁 있으신가요? 잎에 반점이 조금씩 보이기 시작해서 걱정이 되는데, 다들 어떻게 방제하고 계신지 궁금합니다.", likes: 8, comments: 5 },
  { id: "sample-2", author: "상주고추왕", time: "1일 전", title: "요즘 고추 가격 어떤가요?", body: "고추 가격이 요즘 괜찮네요, 다들 어떠세요", likes: 15, comments: 9 },
  { id: "sample-3", author: "해남간척지", time: "2일 전", title: "간척지 염도 관리 노하우", body: "제가 사용하는 관리 방법을 공유합니다.", likes: 22, comments: 12 },
];

export default function Community() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [profileNickname, setProfileNickname] = useState("");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("feed");
  const [selected, setSelected] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageAsset, setImageAsset] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState([]);
  const [liked, setLiked] = useState(new Set());
  const [error, setError] = useState("");
  const [showingSamples, setShowingSamples] = useState(!isSupabaseConfigured);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError("");

    if (!isSupabaseConfigured) {
      setShowingSamples(true);
      setPosts(samplePosts);
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("posts")
      .select("id,user_id,title,body,image_path,created_at,profiles!posts_user_id_fkey(nickname),comments(count),post_likes(count)")
      .order("created_at", { ascending: false })
      .limit(30);

    if (queryError) {
      setError(`커뮤니티를 불러오지 못했습니다: ${queryError.message}`);
      setShowingSamples(true);
      setPosts(samplePosts);
    } else {
      setShowingSamples(false);
      setPosts(
        (data || []).map((post) => ({
          id: post.id,
          user_id: post.user_id,
          author: post.profiles?.nickname || "농업인",
          time: new Date(post.created_at).toLocaleDateString("ko-KR"),
          title: post.title,
          body: post.body,
          imagePath: post.image_path,
          imageUrl: getCommunityImageUrl(post.image_path),
          likes: post.post_likes?.[0]?.count || 0,
          comments: post.comments?.[0]?.count || 0,
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      loadPosts();
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    loadPosts();
    return () => listener.subscription.unsubscribe();
  }, [loadPosts]);

  useEffect(() => {
    if (!session || !isSupabaseConfigured) return;
    supabase.from("profiles").select("nickname,onboarding_completed").eq("id", session.user.id).maybeSingle().then(({ data, error: profileError }) => {
      if (profileError) setError(profileError.message);
      else {
        setProfileNickname(data?.nickname || "");
        if (!data?.onboarding_completed) router.replace("/signup");
      }
    });
  }, [session, router]);

  useEffect(() => {
    if (!session || showingSamples) return;
    supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", session.user.id)
      .then(({ data }) => setLiked(new Set((data || []).map((item) => item.post_id))));
  }, [session, showingSamples]);

  const requireAuth = () => {
    if (!session) {
      router.push("/login");
      return false;
    }
    return true;
  };

  const getAuthorNickname = async () => {
    if (profileNickname) return profileNickname;
    const metadataName = session?.user?.user_metadata?.nickname
      || session?.user?.user_metadata?.name
      || session?.user?.user_metadata?.full_name;
    if (!isSupabaseConfigured || !session) return metadataName || "농업인";
    const { data } = await supabase.from("profiles").select("nickname").eq("id", session.user.id).maybeSingle();
    const nickname = data?.nickname || metadataName || "농업인";
    setProfileNickname(nickname);
    return nickname;
  };

  const openPost = async (post) => {
    setSelected(post);
    setComments([]);
    setView("detail");
    router.setParams({ mode: "detail" });
    if (post.id.startsWith("sample-")) {
      setComments([
        { id: "sample-comment-1", author: "농사왕123", body: "저희도 비슷한 문제 겪었어요, 방제 시기가 중요해요" },
        { id: "sample-comment-2", author: "간척지농부", body: "고추는 배수 관리가 핵심인 것 같아요" },
      ]);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("comments")
      .select("id,body,created_at,profiles!comments_user_id_fkey(nickname)")
      .eq("post_id", post.id)
      .order("created_at");

    if (queryError) {
      setError(queryError.message);
      return;
    }
    setComments((data || []).map((item) => ({ id: item.id, author: item.profiles?.nickname || "농업인", body: item.body })));
  };

  const createPost = async () => {
    if (!title.trim() || !body.trim() || !requireAuth() || submitting) return;
    setSubmitting(true);
    setError("");
    let imagePath = null;

    try {
      if (imageAsset) {
        const mimeType = imageAsset.mimeType || "image/jpeg";
        const extensionByMime = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/heic": "heic",
          "image/heif": "heif",
        };
        const extension = extensionByMime[mimeType] || "jpg";
        imagePath = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
        const uploadBody = imageAsset.file || await fetch(imageAsset.uri).then((response) => response.arrayBuffer());
        const { error: uploadError } = await supabase.storage
          .from(COMMUNITY_IMAGE_BUCKET)
          .upload(imagePath, uploadBody, { contentType: mimeType, cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;
      }

      const { error: insertError } = await supabase.from("posts").insert({
        user_id: session.user.id,
        title: title.trim(),
        body: body.trim(),
        image_path: imagePath,
      });
      if (insertError) {
        if (imagePath) await supabase.storage.from(COMMUNITY_IMAGE_BUCKET).remove([imagePath]);
        throw insertError;
      }

      setTitle("");
      setBody("");
      setImageAsset(null);
      setView("feed");
      router.setParams({ mode: undefined });
      await loadPosts();
    } catch (submitError) {
      setError(`게시글을 등록하지 못했습니다: ${submitError.message || "사진 업로드를 다시 시도해주세요."}`);
    } finally {
      setSubmitting(false);
    }
  };

  const pickImage = async () => {
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("사진을 첨부하려면 사진 접근 권한을 허용해주세요.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.75,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      setError("사진은 8MB 이하만 첨부할 수 있어요.");
      return;
    }
    setImageAsset(asset);
  };

  const addComment = async () => {
    if (!comment.trim() || !requireAuth()) return;
    const author = await getAuthorNickname();
    if (selected.id.startsWith("sample-")) {
      setComments((current) => [...current, { id: String(Date.now()), author, body: comment.trim() }]);
      setComment("");
      return;
    }

    const { data, error: insertError } = await supabase
      .from("comments")
      .insert({ post_id: selected.id, user_id: session.user.id, body: comment.trim() })
      .select("id,body")
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setComments((current) => [...current, { ...data, author }]);
    setPosts((current) => current.map((item) => item.id === selected.id ? { ...item, comments: item.comments + 1 } : item));
    setComment("");
  };

  const toggleLike = async (post) => {
    if (!requireAuth()) return;
    const active = liked.has(post.id);

    if (!post.id.startsWith("sample-")) {
      const query = active
        ? supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", session.user.id)
        : supabase.from("post_likes").insert({ post_id: post.id, user_id: session.user.id });
      const { error: likeError } = await query;
      if (likeError) {
        setError(likeError.message);
        return;
      }
    }

    const change = active ? -1 : 1;
    setLiked((current) => {
      const next = new Set(current);
      active ? next.delete(post.id) : next.add(post.id);
      return next;
    });
    setPosts((current) => current.map((item) => (item.id === post.id ? { ...item, likes: item.likes + change } : item)));
    setSelected((current) => (current?.id === post.id ? { ...current, likes: current.likes + change } : current));
  };

  const selectedCommentCount = useMemo(() => {
    if (!selected) return 0;
    return selected.id === "sample-1" ? 4 : selected.id.startsWith("sample-") ? selected.comments : comments.length;
  }, [selected, comments.length]);

  if (view === "write") {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <AppBrand />
        <Pressable onPress={() => { setView("feed"); router.setParams({ mode: undefined }); }}><Text style={styles.back}>← 목록으로</Text></Pressable>
        <Text style={styles.title}>글쓰기</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="제목을 입력하세요." maxLength={100} style={styles.titleInput} />
        <TextInput value={body} onChangeText={setBody} placeholder="농사 이야기를 나눠보세요." multiline style={styles.postInput} />
        {imageAsset ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: imageAsset.uri }} style={styles.previewImage} resizeMode="cover" />
            <Pressable accessibilityLabel="첨부 사진 삭제" style={styles.removeImage} onPress={() => setImageAsset(null)}>
              <Text style={styles.removeImageText}>×</Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable style={styles.photoButton} onPress={pickImage} disabled={submitting}>
          <Text style={styles.photoButtonText}>▣ {imageAsset ? "사진 변경" : "사진 첨부"}</Text>
        </Pressable>
        <Pressable style={[styles.primary, submitting && styles.disabled]} onPress={createPost} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>등록</Text>}
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    );
  }

  if (view === "detail" && selected) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <AppBrand />
        <Pressable onPress={() => { setView("feed"); router.setParams({ mode: undefined }); }}><Text style={styles.back}>← 목록으로</Text></Pressable>
        <Text style={styles.detailTitle}>{selected.title}</Text>
        <View style={styles.head}><Text style={styles.author}>{selected.author}</Text><Text style={styles.time}>{selected.time}</Text></View>
        <Text style={styles.detailBody}>{selected.detailBody || selected.body}</Text>
        {selected.imageUrl ? <Image source={{ uri: selected.imageUrl }} style={styles.detailImage} resizeMode="cover" /> : null}
        <View style={styles.actions}>
          <Pressable onPress={() => toggleLike(selected)}><Text>👍 {selected.likes}</Text></Pressable>
          <Text>💬 {selectedCommentCount}</Text>
        </View>
        <View style={styles.divider} />
        <Text style={styles.commentTitle}>댓글 {selectedCommentCount}</Text>
        {comments.map((item) => <Text key={item.id} style={styles.comment}><Text style={styles.author}>{item.author} </Text>{item.body}</Text>)}
        <View style={styles.commentRow}>
          <TextInput value={comment} onChangeText={setComment} placeholder="댓글을 입력하세요..." style={styles.commentInput} />
          <Pressable onPress={addComment} style={styles.register}><Text style={styles.primaryText}>등록</Text></Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.top}>
        <Text style={styles.title}>커뮤니티</Text>
        {session
          ? <Pressable onPress={async () => { const { error: signOutError } = await supabase.auth.signOut(); if (signOutError) setError(signOutError.message); else router.replace("/login"); }}><Text style={styles.authLink}>로그아웃</Text></Pressable>
          : <Pressable onPress={() => router.push("/login")}><Text style={styles.authLink}>로그인</Text></Pressable>}
      </View>
      <Pressable style={styles.primary} onPress={() => { if (requireAuth()) { setView("write"); router.setParams({ mode: "write" }); } }}><Text style={styles.primaryText}>+ 글쓰기</Text></Pressable>
      {loading ? <ActivityIndicator color={COLORS.navy} /> : null}
      {!loading && posts.length === 0 ? <Text style={styles.empty}>아직 작성된 글이 없습니다. 첫 글을 남겨보세요.</Text> : null}
      {posts.map((post) => (
        <Pressable key={post.id} onPress={() => openPost(post)} style={styles.post}>
          <View style={styles.head}><Text style={styles.author}>{post.author}</Text><Text style={styles.time}>{post.time}</Text></View>
          <Text style={styles.postTitle}>{post.title}</Text>
          <Text numberOfLines={2} style={styles.postBody}>{post.body}</Text>
          {post.imageUrl ? <Image source={{ uri: post.imageUrl }} style={styles.postImage} resizeMode="cover" /> : null}
          <View style={styles.actions}>
            <Pressable onPress={(event) => { event.stopPropagation?.(); toggleLike(post); }}><Text>👍 {post.likes}</Text></Pressable>
            <Text>💬 {post.comments}</Text>
          </View>
        </Pressable>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
    <ChatbotFab />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  page: { padding: 20, paddingBottom: 100, gap: 14, backgroundColor: COLORS.bg, flexGrow: 1 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 20, fontWeight: "700", color: COLORS.textMain },
  back: { fontSize: 13, fontWeight: "700", color: COLORS.navy },
  authLink: { fontSize: 13, fontWeight: "700", color: COLORS.navy },
  primary: { height: 44, borderRadius: 8, backgroundColor: COLORS.navy, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  post: { padding: 14, gap: 8, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, backgroundColor: COLORS.card },
  head: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  author: { fontSize: 13, fontWeight: "700", color: COLORS.textMain },
  time: { fontSize: 11, color: COLORS.textFaint },
  postTitle: { fontSize: 15, fontWeight: "700", color: COLORS.textMain },
  postBody: { fontSize: 14, color: COLORS.textMain },
  detailTitle: { fontSize: 20, lineHeight: 27, fontWeight: "700", color: COLORS.textMain },
  detailBody: { fontSize: 14, color: COLORS.textMain, lineHeight: 21 },
  actions: { flexDirection: "row", gap: 16 },
  divider: { height: 1, backgroundColor: COLORS.line },
  commentTitle: { fontSize: 13, fontWeight: "700", color: COLORS.navy },
  comment: { fontSize: 13, color: COLORS.textMain },
  commentRow: { flexDirection: "row", gap: 8 },
  commentInput: { height: 40, flex: 1, borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, paddingHorizontal: 12, backgroundColor: COLORS.card },
  register: { height: 40, paddingHorizontal: 14, borderRadius: 8, backgroundColor: COLORS.navy, justifyContent: "center" },
  titleInput: { height: 44, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 14, backgroundColor: COLORS.card, fontSize: 15, fontWeight: "600", color: COLORS.textMain },
  postInput: { height: 180, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 14, backgroundColor: COLORS.card, textAlignVertical: "top" },
  previewWrap: { position: "relative", overflow: "hidden", borderRadius: 12, backgroundColor: COLORS.card },
  previewImage: { width: "100%", aspectRatio: 4 / 3, backgroundColor: "#eef0f3" },
  removeImage: { position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(28,37,48,0.78)" },
  removeImageText: { color: "#fff", fontSize: 22, lineHeight: 24, fontWeight: "700" },
  photoButton: { height: 44, borderWidth: 1, borderColor: COLORS.navy, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.card },
  photoButtonText: { color: COLORS.navy, fontSize: 14, fontWeight: "700" },
  postImage: { width: "100%", aspectRatio: 4 / 3, borderRadius: 8, marginTop: 2, backgroundColor: "#eef0f3" },
  detailImage: { width: "100%", aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: "#eef0f3" },
  disabled: { opacity: 0.6 },
  empty: { paddingVertical: 32, textAlign: "center", color: COLORS.textSub },
  sampleNotice: { fontSize: 11, textAlign: "center", color: COLORS.textFaint },
  error: { fontSize: 12, color: COLORS.loss },
});
