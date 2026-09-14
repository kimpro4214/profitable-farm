# seedjong-navi

Expo Router 기반 수익팜 모바일·웹 앱입니다.

## 로컬 실행

```powershell
npm install
npx expo start --web
```

웹에서는 최대 폭 360px의 휴대폰 프레임으로 표시됩니다. 네이티브 시뮬레이터는 `npx expo run:android` 또는 Android Studio의 가상 기기를 사용할 수 있습니다.

## Supabase 적용

1. Supabase SQL Editor에서 `supabase/schema.sql`을 실행합니다.
2. Edge Functions를 배포합니다.

```powershell
npx supabase functions deploy ask-rag
npx supabase functions deploy sync-weekly-farming --no-verify-jwt
```

3. 서버 전용 비밀값을 등록합니다. 이 값들은 앱 `.env`에 넣지 않습니다.

```powershell
npx supabase secrets set GEMINI_API_KEY=... SYNC_WEEKLY_SECRET=...
```

4. 최초 동기화는 다음처럼 호출합니다.

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://<project-ref>.supabase.co/functions/v1/sync-weekly-farming" `
  -Headers @{ "x-sync-secret" = "<SYNC_WEEKLY_SECRET>" }
```

Supabase Dashboard의 Cron에서 매주 같은 함수 URL을 POST 호출하고 `x-sync-secret` 헤더를 추가하면 최신 농촌진흥청 주간농사정보 PDF를 수집해 Gemini로 요약합니다.

## Google·카카오 로그인

Supabase Dashboard의 Authentication > Providers에서 Google과 Kakao를 활성화하고 각 공급자의 Client ID/Secret을 등록합니다. URL Configuration의 Redirect URLs에는 아래 주소를 허용합니다.

- 네이티브 빌드: `seedjongnavi://auth/callback`
- 웹 배포: `https://<웹 도메인>/auth/callback`
- Expo 개발: 실행 로그에 표시되는 `exp://.../--/auth/callback`

앱 공개 환경변수는 `.env.example`을 복사해 `.env`에 설정합니다. `.env`는 Git에서 제외됩니다.
