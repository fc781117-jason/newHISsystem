## V9 更新

- 首頁新增公告預覽，列表最多顯示 2 筆，其餘折疊。
- 今日流程每個狀態最多顯示 2 位患者，其餘折疊。
- 患者卡片可開啟檔案詳情。
- 公告與簽收新增正式表單。
- 數位足跡改成下拉篩選與折疊呈現。
- 新增虛擬員工資料表與管理畫面。
- UI 文案移除「假患者」，改為示範／虛擬／今日患者。

## V8 更新

- 修正手機版首頁資訊重疊與欄位大小不一致。
- 院區、日期、搜尋改為可折疊搜尋篩選面板。
- 首頁只保留工作指揮中心，不再顯示功能整併說明。
- 主管可以看各組未完成任務；一般人看本組或本人任務。
- 人員與權限可調整角色、組別與預設院區。

# NRS 診所營運流程整合系統 Demo V9：OpenAI + 月排班版

這一版是在 V5 多人雲端互動版基礎上，加入：

- OpenAI 行政助理正式串接架構。
- Supabase Edge Function 保護 OPENAI_API_KEY。
- 月排班，不再只排七天。
- 三個月內請假預先卡位。
- AI 使用紀錄。
- 月工時統計與公平性提示。

## 核心定位

- 使用真 Google 登入。
- 使用 Supabase 作為雲端資料庫。
- 使用 OpenAI API 產生行政交班摘要。
- 不使用真實病患資料。
- 可由系統產生假患者、假任務、假公告、假排班與假請假流程。

## 需要的 API / Key

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_APP_ADMIN_EMAIL
OPENAI_API_KEY  只放在 Supabase Function Secret
OPENAI_MODEL    可選，預設 gpt-5.4-mini
```

## 不需要

```text
Line API
Email API
SMS API
正式地端伺服器
真實患者資料
```

## 快速啟動

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase Edge Function

請部署：

```bash
supabase functions deploy ai-admin-assistant
supabase secrets set OPENAI_API_KEY=你的_OPENAI_API_KEY
supabase secrets set OPENAI_MODEL=gpt-5.4-mini
```

詳細流程請看 `docs/01_平台申請與部署教學.md`。
