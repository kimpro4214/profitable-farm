import { Redirect } from "expo-router";

// 이 탭은 실제 화면을 갖지 않고 랜딩(지역 재선택)으로 즉시 이동하는 용도.
// 정상 흐름에서는 (tabs)/_layout.js가 tabPress를 가로채 여기로 들어오기 전에
// router.push("/")로 이동시키지만, 혹시 직접 진입하는 경우를 위한 안전장치로 둔다.
export default function EditLocationFallback() {
  return <Redirect href="/" />;
}
