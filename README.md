# 수익농가 (Seedjong Navi)

농업인의 지역·농지 조건을 바탕으로 작물을 추천하고, 예상 수익과 영농 정보를 제공하는 Expo 기반 모바일·웹 애플리케이션입니다. 데이터와 사용자 기능은 Supabase를 통해 제공됩니다.

## 주요 기능

- 지역과 농지 조건에 따른 작물 추천 및 수익 계산
- 농지 위치 분석과 지도 기반 정보 조회
- 영농일지, 커뮤니티, 주간 영농 브리핑
- Supabase Auth 기반 Google·Kakao 로그인
- Gemini를 이용한 RAG 챗봇

## 기술 구성

- **Client**: Expo Router, React Native, React Native Web
- **Backend**: Supabase Auth, PostgreSQL, Storage, Edge Functions
- **AI**: Gemini API (Supabase Edge Function에서 호출)
- **Deployment**: EAS Hosting 또는 Vercel

## 프로젝트 구조

```text
seedjong-navi/   # Expo 애플리케이션, Supabase 함수 및 DB 마이그레이션
ml/              # 지역·수익·RAG 데이터 준비 스크립트
legacy-web/      # 초기 웹 프로토타입
figmascreens/    # 화면 설계 참고 이미지
```

## 로컬 실행

Node.js를 설치한 뒤 앱 폴더에서 실행합니다.

```powershell
cd seedjong-navi
npm install
npx expo start --web
```

Android 기기 또는 에뮬레이터에서는 다음 명령을 사용할 수 있습니다.

```powershell
npx expo start --android
```

## 환경 변수

`seedjong-navi/.env.example`을 복사해 `seedjong-navi/.env`를 만들고, 아래 공개 클라이언트 값을 설정합니다.

```text
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY= # Android 지도 사용 시
```

`.env`와 실제 API 키는 Git에 포함되지 않습니다. Gemini, Supabase service role, Kakao client secret 등 서버 비밀 값은 앱 `.env`가 아니라 Supabase Edge Function secrets에만 등록합니다.

## Supabase 설정

Supabase CLI에서 `seedjong-navi` 폴더를 기준으로 DB 마이그레이션과 Edge Functions를 배포합니다.

```powershell
cd seedjong-navi
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy analyze-farm
npx supabase functions deploy ask-rag
npx supabase functions deploy import-farm-reference
npx supabase functions deploy kakao-oidc --no-verify-jwt
npx supabase functions deploy sync-weekly-farming --no-verify-jwt
```

필요한 서버 비밀 값은 기능에 맞게 `supabase secrets set`으로 설정합니다. DB의 실제 사용자 데이터·Storage 파일·비밀 값은 이 저장소에 포함되지 않습니다.

Google/Kakao 로그인은 Supabase Dashboard의 **Authentication → Providers**에서 공급자를 활성화하고, Redirect URL에 다음을 등록해야 합니다.

- 네이티브 앱: `seedjongnavi://auth/callback`
- 웹 배포: `https://<your-domain>/auth/callback`

## 웹 배포

Vercel에서는 Root Directory를 `seedjong-navi`로 지정하고, 공개 환경 변수 두 개(`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)를 등록합니다. 자세한 배포 점검 절차는 [WEB_DEMO.md](seedjong-navi/WEB_DEMO.md)를 참고하세요.

## Git 정책

다운로드 원본 데이터(`data/raw/`), 학습 모델·가공 산출물, `.env`, `node_modules`, Expo 캐시, 로컬 도구 설정은 `.gitignore`로 제외합니다. 코드 실행에 필요한 작은 참조 JSON과 `.env.example`만 포함합니다.
