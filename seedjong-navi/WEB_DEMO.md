# 웹 데모 배포

웹 데모는 제출한 Android APK와 같은 화면 코드를 사용하지만 별도의 정적 결과물로 빌드됩니다. 이 배포 설정은 Supabase 테이블, RLS, Edge Function, Storage 정책 및 기존 데이터를 변경하지 않습니다.

## 로컬 검증

```powershell
npm.cmd run check
```

성공하면 `dist` 폴더에 단일 페이지 웹 앱이 생성됩니다.

## 현재 EAS Hosting 배포

- Production URL: https://seedjong-navi.expo.app
- 배포 관리: https://expo.dev/projects/479ea540-f2db-44e6-9527-533533866c82/hosting/deployments

새 빌드를 같은 주소에 반영할 때는 로컬 검증 후 다음 명령을 실행합니다.

```powershell
npx.cmd eas-cli@latest deploy --prod --export-dir dist
```

`최근 KAMIS 시세 조회`는 별도 Supabase Edge Function `kamis-price`를 호출합니다. 처음 적용하거나 함수 코드를 바꿨다면 서버 시크릿 `KAMIS_CERT_KEY`, `KAMIS_CERT_ID`를 등록하고 `npx.cmd supabase functions deploy kamis-price`도 실행합니다.

추천 화면의 AI 가격 예측은 `price_forecast_snapshots` 테이블에서 최신 학습 결과를 읽습니다. 자동 갱신을 시작하려면 루트 `README.md`의 KAMIS 가격 갱신 절차에 따라 DB 마이그레이션과 GitHub Actions secrets를 설정해야 합니다. 이 기능이 포함된 앱을 한 번 배포한 뒤에는 매일 예측 갱신 시 웹을 재배포할 필요가 없습니다.

## Vercel 배포

1. Vercel에서 Git 저장소를 연결합니다.
2. Root Directory를 `seedjong-navi`로 지정합니다.
3. 다음 환경 변수를 Vercel 프로젝트에 등록합니다.
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. 배포합니다. 빌드 명령과 SPA 경로 처리는 `vercel.json`에 설정되어 있습니다.

`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`는 Android 네이티브 지도용이므로 웹 배포에 넣지 않아도 됩니다. `service_role` 키와 Edge Function 비밀 값은 절대로 웹 환경 변수에 등록하지 않습니다.

## 로그인 콜백

배포 URL이 확정되면 Supabase Dashboard의 Authentication > URL Configuration > Redirect URLs에 다음 URL만 추가합니다.

```text
https://배포도메인/auth/callback
```

기존 `seedjongnavi://auth/callback` 항목은 삭제하거나 변경하지 않습니다. Redirect URL 추가는 DB 스키마, RLS 또는 기존 APK의 딥링크를 변경하지 않습니다.

## 제출 전 확인

- 시크릿 창에서 웹 URL 접속
- Google 또는 Kakao 로그인 후 앱 복귀
- 지역 선택과 추천 결과 확인
- 수익 계산기 확인
- 커뮤니티와 영농일지 이미지 선택 확인
- 모바일 브라우저에서 현재 위치 권한 확인
- `/auth/callback`과 내부 화면에서 새로고침 시 404가 나지 않는지 확인
