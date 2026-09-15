# 수익농가 앱

Expo Router 기반의 수익농가 클라이언트입니다. Supabase 인증·DB·Storage·Edge Functions와 연동하며, 웹과 Android에서 실행할 수 있습니다.

상위 프로젝트 안내는 [루트 README](../README.md)를 참고하세요.

## 실행

```powershell
npm install
npx expo start --web
```

```powershell
npx expo start --android
```

검증 및 웹 번들은 다음과 같습니다.

```powershell
npm run check
npm run build:web
```

## 환경 변수

`.env.example`을 `.env`로 복사해 공개 클라이언트 값만 설정합니다.

```text
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY= # Android 지도 사용 시
```

서버 비밀 값(Gemini API 키, Supabase service role 키, Kakao client secret, 동기화·가져오기 비밀 값)은 `.env`에 넣지 않고 Supabase Edge Function secrets에 등록합니다.

챗봇(`ask-rag`)은 로그인한 사용자별로 하루 5회(한국 시간 기준)까지만 Gemini를 호출합니다. 한도를 바꾸려면 Edge Function secret `ASK_RAG_DAILY_LIMIT`에 숫자를 등록하세요.

## Supabase 배포

```powershell
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy analyze-farm
npx supabase functions deploy ask-rag
npx supabase functions deploy import-farm-reference
npx supabase functions deploy kakao-oidc --no-verify-jwt
npx supabase functions deploy sync-weekly-farming --no-verify-jwt
```

제공되는 Edge Functions:

- `analyze-farm`: 농지 조건 분석
- `ask-rag`: Gemini 기반 RAG 챗봇
- `import-farm-reference`: 참조 데이터 가져오기
- `kakao-oidc`: Kakao 소셜 로그인 중계
- `sync-weekly-farming`: 주간 영농 정보 동기화

Google/Kakao Provider 및 Redirect URL은 Supabase Dashboard에서 설정합니다.

- 앱 콜백: `seedjongnavi://auth/callback`
- 웹 콜백: `https://<your-domain>/auth/callback`

## 웹 배포

Vercel 또는 EAS Hosting에 배포할 수 있습니다. Vercel 사용 시 이 폴더를 Root Directory로 지정하고, `EXPO_PUBLIC_SUPABASE_URL`과 `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`만 클라이언트 환경 변수로 등록합니다. 운영 배포 절차는 [WEB_DEMO.md](WEB_DEMO.md)에 있습니다.
