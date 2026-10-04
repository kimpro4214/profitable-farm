# 수익농가

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

### KAMIS 가격 갱신

KAMIS OpenAPI 가격은 학습 스크립트가 수집하고, 앱은 갱신된 예측 파일을 읽습니다. 프로젝트 **루트** `.env`에 아래 값을 설정합니다. `KAMIS_CERT_ID`는 API 요청을 구분하는 비어 있지 않은 문자열이며 프로젝트 DB의 ID가 아닙니다. KAMIS의 일별 가격 API에서 `seedjong-navi` 문자열로 정상 호출을 확인했습니다.

```text
KAMIS_CERT_KEY=발급받은_KAMIS_OpenAPI_인증키
KAMIS_CERT_ID=seedjong-navi
```

`KAMIS_OPENAPI_KEY`라는 변수명도 학습 스크립트에서 인증키로 인식합니다. 인증 정보는 앱의 `EXPO_PUBLIC_` 변수에 넣지 않습니다.

```powershell
python -m pip install -r ml/requirements.txt
python ml/train_price_forecast.py --probe
python ml/train_price_forecast.py --refresh
```

`--refresh`는 KAMIS 기간별 도매가격 API로 최근 1년의 품목별 시장 가격을 수집하고 날짜별 시장 평균을 계산합니다. 이어 7일 후 가격 예측 모델을 재학습해 `seedjong-navi/data/price_forecasts.json`을 갱신합니다. `data/raw/weather`에 ASOS 원본 ZIP이 없으면 가격·계절성 변수만 사용합니다. 앱에서는 예측일이 지난 값을 표시하지 않습니다.

자동 갱신은 [GitHub Actions 워크플로](.github/workflows/refresh-kamis-price-forecast.yml)가 매일 11:17 KST에 실행합니다. 학습 후 `ml/publish_price_forecast.py`가 Supabase의 `price_forecast_snapshots` 테이블에 최신 예측을 게시합니다. 앱은 추천 화면에 들어갈 때 서버의 예측을 읽으므로 **예측 갱신마다 앱을 재배포할 필요가 없습니다.** 서버 조회에 실패하면 앱에 포함된 예측을 사용하며, 예측일이 지나면 표시하지 않습니다.

최초 설정은 다음과 같습니다.

1. `seedjong-navi`에서 `supabase db push`로 `20261004000000_price_forecast_snapshots.sql` 마이그레이션을 적용합니다.
2. GitHub 저장소 Actions secrets에 `KAMIS_CERT_KEY`, `SUPABASE_SECRET_KEY`를 등록합니다. 후자는 Supabase 프로젝트의 서버 전용 secret key(`sb_secret_...`)입니다. 워크플로의 `KAMIS_CERT_ID`는 `seedjong-navi`, Supabase URL은 현재 배포 프로젝트 값으로 지정되어 있습니다. `SUPABASE_SECRET_KEY`는 데이터베이스 관리자 권한이 있으므로 앱 환경 변수에 넣지 않습니다.
3. 워크플로를 기본 브랜치에 반영한 뒤 **Actions → Refresh KAMIS price forecasts → Run workflow**로 최초 실행합니다. 이후 매일 자동 실행되며 실패한 실행은 Actions에서 확인할 수 있습니다.
4. 이 변경을 담은 앱 빌드를 한 번 배포합니다. 이후 가격 예측만 갱신할 때는 다시 배포하지 않아도 됩니다.

로컬에서 수동 게시할 때는 위의 Supabase 환경 변수 두 개를 서버 환경에 설정한 뒤 `python ml/publish_price_forecast.py`를 실행합니다. 게시 스크립트는 품목 수와 예측일을 확인하고 비정상 산출물이 기존 결과를 덮어쓰지 않게 합니다.

결과 카드의 최근 거래일 시세 조회는 별도 Supabase Edge Function `kamis-price`를 사용합니다. 배포 프로젝트에 `KAMIS_CERT_KEY`, `KAMIS_CERT_ID`를 secrets로 등록하고 함수를 배포해야 작동합니다. KAMIS 도매가격은 농가수취가와 다른 가격이므로 손익 계산의 매출 단가로 직접 쓰지 않습니다.

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
