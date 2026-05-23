import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase, isConfigured, ADMIN_EMAIL, APP_TITLE } from "./lib/supabase";
import { clinics, groups, roles, rolePerms, statuses, makeFakePatient, makeFakeTask, maskPhone } from "./lib/mock";
import "./styles.css";

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const addMonths = (date, m) => { const d = new Date(date); d.setMonth(d.getMonth() + m); return d; };
const daysInMonth = (key) => { const [y,m] = key.split("-").map(Number); return new Date(y, m, 0).getDate(); };
const ymDate = (key, day) => `${key}-${String(day).padStart(2,"0")}`;
const nextMonthOptions = () => Array.from({length:4}, (_,i)=>monthKey(addMonths(new Date(), i)));

const legacyModules = [
  {
    title: "今日現場流程",
    purpose: "把原本分散的等待看板、等待看診、等待治療、等待檢查、等待開處方、等待拿藥整併成同一條就診事件流程。",
    old: ["等待看板", "等待看診", "等待治療", "等待檢查", "等待開處方", "等待拿藥", "初診", "複診"],
    next: "今日流程看板、患者主檔、任務中心"
  },
  {
    title: "居家、保健衣、製衣物流",
    purpose: "把居家諮詢、居家聯繫、居家動態表、製衣、寄送、未完成事項改成可追蹤工單與任務。",
    old: ["等待居家諮詢", "居家聯繫", "居家動態表", "居家總覽", "居家未完成", "居家製衣", "保健衣未完成", "保健衣製衣", "等待寄送", "製衣前確認"],
    next: "任務中心、製衣物流、居家服務狀態、跨組別待辦"
  },
  {
    title: "客服、醫事、藥局、統計與公告",
    purpose: "把客服關懷、工作聯繫、公告、列管、醫事、藥局、統計、人事整併為行政營運中心。",
    old: ["客服管理", "工作聯繫", "公告", "列管事項", "醫事管理", "藥局管理", "統計管理", "專案系統", "人事系統"],
    next: "公告簽收、數位足跡、月排班、請假代理、人員權限、統計報表"
  }
];


function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState("dashboard");
  const [clinic, setClinic] = useState("台北");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [reads, setReads] = useState([]);
  const [audit, setAudit] = useState([]);
  const [leave, setLeave] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [shiftSwaps, setShiftSwaps] = useState([]);
  const [aiLogs, setAiLogs] = useState([]);
  const [toast, setToast] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bootError, setBootError] = useState("");

  const can = (target) => rolePerms[profile?.role || "frontdesk"]?.includes(target);
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2400); };

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session?.user) ensureProfile(session.user); }, [session?.user?.id]);

  useEffect(() => {
    if (!profile) return;
    setClinic(profile.default_clinic || "台北");
    loadAll();
    const channel = supabase.channel("nrs-demo-v7-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients_mock" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedules" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_swap_requests" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_usage_logs" }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  useEffect(() => { if (profile) loadAll(); }, [clinic, selectedMonth]);

  useEffect(() => {
    const text = `${profile?.email || "demo"}｜${roles[profile?.role] || "未設定"}｜${clinic}｜${new Date().toLocaleString("zh-TW")}`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='180'><text x='18' y='96' transform='rotate(-24 18 96)' fill='%230f172a' font-size='15' font-family='Arial'>${text}</text></svg>`;
    document.body.style.setProperty("--watermark", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  }, [profile, clinic, view]);

  async function ensureProfile(user) {
    const email = user.email?.toLowerCase();
    const { data: existing, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) setBootError(error.message);
    if (existing) { setProfile(existing); return; }
    const isAdmin = email === ADMIN_EMAIL;
    const newProfile = {
      id: user.id,
      email,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || email?.split("@")[0] || "Demo User",
      role: isAdmin ? "super_admin" : "frontdesk",
      group_name: isAdmin ? "主管組" : "待設定",
      default_clinic: "台北",
      status: "active"
    };
    const { data, error: upsertError } = await supabase.from("profiles").upsert(newProfile).select("*").single();
    if (upsertError) setBootError(upsertError.message);
    setProfile(data || newProfile);
    await logAudit("首次登入建立人員檔", "Auth", "profiles", email);
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) setBootError(error.message);
  }
  async function signOut() { await logAudit("登出", "Auth", "session", profile?.email); await supabase.auth.signOut(); setSession(null); setProfile(null); }

  async function loadAll() {
    if (!profile) return;
    const res = await Promise.all([
      supabase.from("patients_mock").select("*").eq("clinic", clinic).order("created_at", { ascending: false }),
      supabase.from("tasks").select("*, patients_mock(name, chart_no)").eq("clinic", clinic).order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("announcements").select("*").or(`clinic.is.null,clinic.eq.${clinic}`).order("created_at", { ascending: false }),
      supabase.from("announcement_reads").select("*").order("read_at", { ascending: false }),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("leave_requests").select("*").eq("clinic", clinic).order("created_at", { ascending: false }),
      supabase.from("schedules").select("*").eq("clinic", clinic).eq("month_key", selectedMonth).order("work_date", { ascending: true }),
      supabase.from("shift_swap_requests").select("*").eq("clinic", clinic).order("created_at", { ascending: false }).limit(50),
      supabase.from("ai_usage_logs").select("*").eq("clinic", clinic).order("created_at", { ascending: false }).limit(30)
    ]);
    const [p,t,s,a,r,au,l,sc,sw,ai] = res;
    if (p.error) setBootError(p.error.message);
    setPatients(p.data || []); setTasks(t.data || []); setStaff(s.data || []); setAnnouncements(a.data || []);
    setReads(r.data || []); setAudit(au.data || []); setLeave(l.data || []); setSchedule(sc.data || []); setShiftSwaps(sw.data || []); setAiLogs(ai.data || []);
  }

  async function logAudit(action, module, targetType, detail = "") {
    if (!supabase || !session?.user) return;
    await supabase.from("audit_logs").insert({
      actor_id: session.user.id, actor_email: session.user.email, actor_role: profile?.role || "uninitialized",
      clinic, action, module, target_type: targetType, detail, user_agent: navigator.userAgent.slice(0, 180)
    });
  }

  async function generateFake(count = 20, reset = false) {
    if (reset) { await supabase.from("tasks").delete().eq("clinic", clinic); await supabase.from("patients_mock").delete().eq("clinic", clinic); }
    const fakePatients = Array.from({ length: count }, (_, i) => makeFakePatient(i + 1, clinic));
    const { data: inserted, error } = await supabase.from("patients_mock").insert(fakePatients).select("*");
    if (error) { flash(error.message); return; }
    const fakeTasks = inserted.flatMap((p, idx) => idx % 3 === 0 ? [makeFakeTask(p, session.user.id)] : []);
    if (fakeTasks.length) await supabase.from("tasks").insert(fakeTasks);
    await logAudit(reset ? "重置並產生假資料" : "追加假資料", "Demo", "patients_mock", `${count} 筆`);
    flash(`已產生 ${count} 筆雲端假資料`); loadAll();
  }

  async function nextStatus(patient) {
    const idx = statuses.indexOf(patient.current_status);
    const next = statuses[Math.min(idx + 1, statuses.length - 1)];
    await supabase.from("patients_mock").update({ current_status: next, progress: Math.min(100, Number(patient.progress || 0) + 16) }).eq("id", patient.id);
    await logAudit("流程狀態更新", "今日流程", "patients_mock", `${patient.name}: ${patient.current_status} -> ${next}`);
    loadAll();
  }

  async function completeTask(task) {
    await supabase.from("tasks").update({ status: "已完成", completed_at: new Date().toISOString() }).eq("id", task.id);
    await logAudit("完成任務", "Task", "tasks", task.title);
    loadAll();
  }

  async function addTask() {
    await supabase.from("tasks").insert({
      title: "手動新增雲端假任務", task_type: "照會聯繫", priority: "中", status: "待處理",
      clinic, group_name: profile?.group_name || "待設定", owner_id: session.user.id, due_date: date,
      content: "多人雲端互動測試用任務。"
    });
    await logAudit("新增任務", "Task", "tasks", "手動新增雲端假任務"); loadAll();
  }

  async function addLeave(monthOffset = 0) {
    const base = addMonths(new Date(), monthOffset);
    const key = monthKey(base);
    const start = `${key}-15`;
    await supabase.from("leave_requests").insert({
      applicant_id: session.user.id, applicant_name: profile.full_name, leave_type: "特休",
      period_text: `${start} 09:00-18:00`, start_date: start, end_date: start, month_key: key,
      delegate_name: "請指定代理人", delegate_status: "待同意", approval_status: "待審核",
      progress: 25, clinic
    });
    await logAudit("新增三個月內請假卡位", "Leave", "leave_requests", `${profile.full_name} ${key}`);
    loadAll();
  }

  async function seedMonthSchedule() {
    const people = staff.length ? staff.slice(0, 10) : [{ full_name: profile.full_name, group_name: profile.group_name }];
    const rows = [];
    const dim = daysInMonth(selectedMonth);
    for (let d = 1; d <= dim; d++) {
      people.forEach((p, i) => {
        rows.push({
          work_date: ymDate(selectedMonth, d),
          month_key: selectedMonth,
          staff_name: p.full_name,
          group_name: p.group_name || "待設定",
          shift_name: ["早班 09:00-13:00","午班 13:00-17:00","晚班 17:00-21:00","休"][Math.floor(Math.random()*4)],
          hours: [0,4,4,8][Math.floor(Math.random()*4)],
          clinic
        });
      });
    }
    await supabase.from("schedules").delete().eq("clinic", clinic).eq("month_key", selectedMonth);
    await supabase.from("schedules").insert(rows);
    await logAudit("產生月排班", "Schedule", "schedules", `${clinic} ${selectedMonth}`);
    loadAll();
  }



  async function addShiftSwap() {
    const requester = profile.full_name;
    const target = staff.find(s => s.full_name !== requester)?.full_name || "待指定同仁";
    await supabase.from("shift_swap_requests").insert({
      requester_id: session.user.id,
      requester_name: requester,
      target_name: target,
      request_date: date,
      original_shift: "早班 09:00-13:00",
      requested_shift: "午班 13:00-17:00",
      reason: "Demo 調班測試：需與代理或請假卡位一起檢查衝突。",
      status: "待對方同意",
      clinic
    });
    await logAudit("新增調班申請", "Schedule", "shift_swap_requests", `${requester} -> ${target}`);
    loadAll();
  }

  async function addAnnouncement() {
    await supabase.from("announcements").insert({
      title: "新增雲端 Demo 公告", content: "這是一則測試公告，可要求簽收並留下數位足跡。",
      scope: "院區", clinic, group_name: null, required_read: true, created_by: session.user.id
    });
    await logAudit("新增公告", "Announcement", "announcements", clinic); loadAll();
  }

  async function readAnnouncement(announcement) {
    const already = reads.some(r => r.announcement_id === announcement.id && r.user_id === session.user.id);
    if (already) return;
    await supabase.from("announcement_reads").insert({ announcement_id: announcement.id, user_id: session.user.id, user_email: profile.email });
    await logAudit("公告簽收", "Announcement", "announcements", announcement.title); loadAll();
  }

  async function updateRole(userId, role) {
    await supabase.from("profiles").update({ role }).eq("id", userId);
    await logAudit("變更角色權限", "Staff", "profiles", `${userId} -> ${role}`); loadAll();
  }

  const filteredPatients = useMemo(() => filterRows(patients, query, ["name","chart_no","disease","current_status"]), [patients, query]);
  const filteredTasks = useMemo(() => filterRows(tasks, query, ["title","task_type","status","group_name"]), [tasks, query]);

  if (!isConfigured) return <ConfigMissing />;
  if (!session) return <Login bootError={bootError} signIn={signInWithGoogle} />;
  if (!profile) return <div className="loading">正在建立 Google 帳號綁定與人員檔...</div>;

  return (
    <main className="app">
      <div className="watermark" />
      {toast && <div className="toast">{toast}</div>}
      <header className="topbar">
        <div className="brand">
          <button className="icon" onClick={() => setMobileOpen(!mobileOpen)}>☰</button>
          <div><strong>{APP_TITLE}</strong><small>雲端多人互動 Demo｜Google + Supabase + OpenAI Edge Function</small></div>
        </div>
        <div className="top-controls">
          <label>院區 / Clinic<select value={clinic} onChange={e => setClinic(e.target.value)}>{clinics.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>日期 / Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label>搜尋 / Search<input value={query} onChange={e => setQuery(e.target.value)} placeholder="患者、任務、公告..." /></label>
        </div>
        <div className="userbox">
          <strong>{profile.full_name}</strong>
          <small>{roles[profile.role]}｜{profile.group_name || "未設定組別"}</small>
          <small>{profile.email}｜預設院區 {profile.default_clinic || clinic}</small>
          <button onClick={signOut} className="textbtn">登出</button>
        </div>
      </header>

      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <MenuGroup title="今日現場 / Today Ops" items={[["dashboard","工作指揮中心"],["flow","今日流程看板"],["patients","患者主檔欄位"]]} view={view} setView={setAuthorizedView} can={can}/>
        <MenuGroup title="個案照護 / Care" items={[["tasks","任務中心"],["ai","OpenAI 行政助理"]]} view={view} setView={setAuthorizedView} can={can}/>
        <MenuGroup title="行政營運 / Admin" items={[["moduleMap","功能整併總覽"],["staff","人員與權限"],["leave","請假與代理"],["schedule","月排班與調班"],["announcements","公告與簽收"],["audit","數位足跡稽核"],["settings","Demo 管理設定"]]} view={view} setView={setAuthorizedView} can={can}/>
      </aside>

      <section className="content">
        {view === "dashboard" && <Dashboard patients={filteredPatients} tasks={filteredTasks} announcements={announcements} reads={reads} profile={profile} generateFake={generateFake} />}
        {view === "flow" && <Flow patients={filteredPatients} nextStatus={nextStatus} />}
        {view === "patients" && <Patients patients={filteredPatients} />}
        {view === "tasks" && <Tasks tasks={filteredTasks} addTask={addTask} completeTask={completeTask} />}
        {view === "moduleMap" && <ModuleMap />}
        {view === "staff" && <Staff staff={staff} profile={profile} updateRole={updateRole} />}
        {view === "leave" && <Leave leave={leave} addLeave={addLeave} />}
        {view === "schedule" && <Schedule schedule={schedule} shiftSwaps={shiftSwaps} addShiftSwap={addShiftSwap} seedMonthSchedule={seedMonthSchedule} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />}
        {view === "announcements" && <Announcements announcements={announcements} reads={reads} profile={profile} addAnnouncement={addAnnouncement} readAnnouncement={readAnnouncement} />}
        {view === "audit" && <Audit audit={audit} />}
        {view === "settings" && <Settings generateFake={generateFake} />}
        {view === "ai" && <AIHelper profile={profile} clinic={clinic} patients={patients} tasks={tasks} announcements={announcements} schedule={schedule} leave={leave} aiLogs={aiLogs} logAudit={logAudit} loadAll={loadAll}/>}
      </section>
    </main>
  );

  function setAuthorizedView(target) {
    if (!can(target)) { flash("此角色目前無權限開啟此模組"); return; }
    setView(target); setMobileOpen(false); logAudit("開啟模組", "Navigation", target, "");
  }
}

function ConfigMissing() {
  return <div className="loginPage"><div className="loginCard">
    <h1>尚未設定 Supabase 環境變數</h1>
    <p>請依照 <code>.env.example</code> 建立 <code>.env.local</code>，並設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。</p>
  </div></div>;
}
function Login({ bootError, signIn }) {
  return <div className="loginPage"><div className="loginCard">
    <div className="mark">NRS</div><h1>{APP_TITLE}</h1>
    <p>多人雲端互動 Demo：真 Google 登入 + Supabase 資料庫 + OpenAI 行政助理。</p>
    <div className="notice"><b>Demo 邊界</b><p>不使用真實病患資料。所有患者、任務、公告、排班、請假皆為測試資料。</p></div>
    <button className="primary full" onClick={signIn}>使用 Google 登入 / Sign in with Google</button>
    {bootError && <p className="error">{bootError}</p>}<small>最高系統管理員信箱：{ADMIN_EMAIL}</small>
  </div></div>;
}
function MenuGroup({ title, items, view, setView, can }) { return <details open><summary>{title}</summary>{items.map(([id,label]) => <button key={id} disabled={!can(id)} className={`nav ${view===id ? "active" : ""}`} onClick={() => setView(id)}>{label}</button>)}</details>; }
function PageTitle({ title, desc, actions }) { return <div className="pageTitle"><div><h2>{title}</h2><p>{desc}</p></div><div className="actions">{actions}</div></div>; }
function Dashboard({ patients, tasks, announcements, reads, profile }) {
  const high = tasks.filter(t => t.priority === "高" && t.status !== "已完成").length;
  const unread = announcements.filter(a => !reads.some(r => r.announcement_id === a.id && r.user_id === profile.id)).length;
  return <>
    <PageTitle title="工作指揮中心" desc="首頁只保留營運摘要、待辦與整併架構；假資料產生已移到 Demo 管理設定。" />
    <div className="identityCard">
      <div><span>目前登入者</span><strong>{profile.full_name}</strong></div>
      <div><span>職稱角色</span><strong>{roles[profile.role]}</strong></div>
      <div><span>所屬組別</span><strong>{profile.group_name || "待設定"}</strong></div>
      <div><span>預設院區</span><strong>{profile.default_clinic || "台北"}</strong></div>
    </div>
    <div className="grid four"><Metric title="今日假患者" value={patients.length}/><Metric title="待辦事項" value={tasks.length}/><Metric title="高優先" value={high} tone="red"/><Metric title="未簽收公告" value={unread} tone="yellow"/></div>
    <div className="split"><Card title="今日必辦">{tasks.slice(0,8).map(t => <TaskLine key={t.id} task={t}/>)}{!tasks.length && <p className="muted">目前無待辦。請到「Demo 管理設定」產生雲端假資料。</p>}</Card><Card title="原系統功能整併摘要"><ModuleSummary compact /></Card></div>
    <div className="card moduleBlock"><h3>舊系統功能整併方向</h3><ModuleSummary /></div>
  </>;
}

function ModuleSummary({ compact=false }) {
  const items = compact ? legacyModules.slice(0,3) : legacyModules;
  return <div className="moduleGrid">
    {items.map(m => <div className="moduleItem" key={m.title}>
      <b>{m.title}</b>
      <p>{m.purpose}</p>
      <small>原功能：{m.old.join("、")}</small>
      <em>新版承接：{m.next}</em>
    </div>)}
  </div>;
}
function ModuleMap() {
  return <>
    <PageTitle title="功能整併總覽" desc="依原系統模組重新歸類，避免功能遺漏，同時降低首頁與選單的認知負擔。" />
    <div className="card moduleBlock"><ModuleSummary /></div>
    <div className="card"><h3>下一版待細化功能</h3><div className="moduleGrid">
      <div className="moduleItem"><b>掛號預約</b><p>初診、複診、預約異動、取消原因、未預約報到。</p><em>建議放入：今日現場流程</em></div>
      <div className="moduleItem"><b>居家與製衣工單</b><p>居家聯繫、保健衣、製衣、寄送、未完成事項可轉成同一張工單卡。</p><em>建議放入：個案照護流程</em></div>
      <div className="moduleItem"><b>調班與代理</b><p>月排班、三個月請假卡位、調班申請、代理同意與主管核准需串在一起。</p><em>建議放入：行政營運流程</em></div>
    </div></div>
  </>;
}

function Metric({ title, value, tone }) { return <div className={`metric ${tone || ""}`}><span>{title}</span><strong>{value}</strong></div>; }
function Flow({ patients, nextStatus }) { return <><PageTitle title="今日流程看板" desc="用狀態流轉模擬報到、看診、治療、檢查、拿藥、居家諮詢到完診。" /><div className="kanban">{statuses.map(s => <div className="lane" key={s}><h3>{s}<span>{patients.filter(p => p.current_status === s).length}</span></h3>{patients.filter(p => p.current_status === s).map(p => <div className="pCard" key={p.id}><b>{p.name}</b><small>{p.chart_no}｜{p.disease}｜座號 {p.seat_no}</small><button className="secondary" onClick={() => nextStatus(p)}>下一步</button></div>)}</div>)}</div></>; }
function Patients({ patients }) { return <><PageTitle title="患者主檔欄位展示" desc="僅使用系統產生的假資料，用來測試欄位與流程。" /><DataTable headers={["病歷號","姓名","性別","年齡","電話遮罩","疾病別","狀態","居家","製衣","風險"]} rows={patients.map(p => [p.chart_no,p.name,p.gender,p.age,maskPhone(p.phone_masked),p.disease,p.current_status,p.home_status,p.garment_status,badge(p.risk_level,p.risk_level==="一般"?"green":"red")])}/></>; }
function Tasks({ tasks, addTask, completeTask }) { return <><PageTitle title="任務中心" desc="照會、交接、關懷、列管、製衣、寄送等統一任務化。" actions={<button className="primary" onClick={addTask}>新增雲端假任務</button>} /><DataTable headers={["優先","任務","類型","組別","狀態","到期日","操作"]} rows={tasks.map(t => [badge(t.priority,t.priority==="高"?"red":t.priority==="中"?"yellow":"gray"),t.title,t.task_type,t.group_name,t.status,t.due_date,<button className="secondary" onClick={() => completeTask(t)}>完成</button>])}/></>; }
function Staff({ staff, profile, updateRole }) { return <><PageTitle title="人員與權限管理" desc="真 Google 帳號登入後自動建立人員檔；最高管理員可調整角色。" /><DataTable headers={["姓名","Email","角色","組別","預設院區","狀態","角色調整"]} rows={staff.map(s => [s.full_name,s.email,roles[s.role]||s.role,s.group_name,s.default_clinic,s.status, profile.role==="super_admin" ? <select value={s.role} onChange={e => updateRole(s.id,e.target.value)}>{Object.keys(roles).map(r => <option key={r} value={r}>{roles[r]}</option>)}</select> : "僅管理員"])} /></>; }
function Leave({ leave, addLeave }) { return <><PageTitle title="請假與代理" desc="可預先建立未來三個月內的假單卡位；正式版再加入代理人同意與主管核准。" actions={<><button className="secondary" onClick={() => addLeave(0)}>本月卡位</button><button className="secondary" onClick={() => addLeave(1)}>下月卡位</button><button className="secondary" onClick={() => addLeave(2)}>二個月後</button><button className="primary" onClick={() => addLeave(3)}>三個月後</button></>} /><DataTable headers={["申請人","假別","期間","月份","代理人","代理狀態","審核狀態","進度"]} rows={leave.map(l => [l.applicant_name,l.leave_type,l.period_text,l.month_key,l.delegate_name,l.delegate_status,l.approval_status,progress(l.progress)])}/></>; }
function Schedule({ schedule, shiftSwaps, addShiftSwap, seedMonthSchedule, selectedMonth, setSelectedMonth }) {
  const totals = {}; schedule.forEach(s => totals[s.staff_name] = (totals[s.staff_name] || 0) + Number(s.hours || 0));
  return <>
    <PageTitle title="月排班與調班" desc="實務以月為單位排班；支援整月排班、月工時統計與調班申請流程。" actions={<><select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}>{nextMonthOptions().map(m=><option key={m}>{m}</option>)}</select><button className="primary" onClick={seedMonthSchedule}>產生整月排班</button><button className="secondary" onClick={addShiftSwap}>新增調班申請</button></>} />
    <div className="split"><Card title={`${selectedMonth} 月排班`}><DataTable compact headers={["日期","人員","組別","班別","時數"]} rows={schedule.map(s => [s.work_date,s.staff_name,s.group_name,s.shift_name,s.hours])}/></Card><Card title="工時統計與公平性提示"><DataTable compact headers={["人員","月工時","提示"]} rows={Object.entries(totals).map(([name,h]) => [name,`${h} 小時`,h>180?"偏高，建議調整":h<120?"偏低，可評估補班":"正常"])}/></Card></div>
    <div className="card"><h3>調班申請</h3><p className="muted">正式版應串接：申請人 → 對方同意 → 主管核准 → 月排班自動更新 → 稽核留痕。</p><DataTable compact headers={["申請人","對象","日期","原班別","欲換班別","狀態","原因"]} rows={(shiftSwaps||[]).map(s=>[s.requester_name,s.target_name,s.request_date,s.original_shift,s.requested_shift,s.status,s.reason])}/></div>
  </>;
}
function Announcements({ announcements, reads, profile, addAnnouncement, readAnnouncement }) { return <><PageTitle title="公告與簽收" desc="公告可以要求簽收；簽收後會寫入公告簽收紀錄與稽核紀錄。" actions={<button className="primary" onClick={addAnnouncement}>新增公告</button>} />{announcements.map(a => { const read = reads.some(r => r.announcement_id === a.id && r.user_id === profile.id); return <div className={`ann ${read ? "" : "unread"}`} key={a.id}><span className="badge">{a.scope}</span> {a.required_read && <span className="badge red">需簽收</span>}<h3>{a.title}</h3><p>{a.content}</p><button className="secondary" onClick={() => readAnnouncement(a)}>{read ? "已簽收" : "簽收公告"}</button></div>})}</>; }
function Audit({ audit }) { const [q, setQ] = useState(""); const rows = filterRows(audit, q, ["actor_email","action","module","detail","clinic"]).slice(0,250); return <><PageTitle title="數位足跡稽核" desc="後台默默記錄，管理者可依人員、時間、模組、動作搜尋。" /><input className="wide" value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋帳號、模組、動作、時間..." /><DataTable headers={["時間","操作者","角色","院區","模組","動作","目標","細節"]} rows={rows.map(a => [new Date(a.created_at).toLocaleString("zh-TW"),a.actor_email,a.actor_role,a.clinic,a.module,a.action,a.target_type,a.detail])}/></>; }
function Settings({ generateFake }) { return <><PageTitle title="Demo 管理設定" desc="最高系統管理員可以重置或追加雲端假資料，方便多人訓練與反覆測試。" /><div className="grid three"><button className="primary big" onClick={() => generateFake(20,true)}>重置 20 筆雲端假資料</button><button className="primary big" onClick={() => generateFake(50,true)}>重置 50 筆雲端假資料</button><button className="secondary big" onClick={() => generateFake(20,false)}>追加 20 筆雲端假資料</button></div></>; }
function AIHelper({ profile, clinic, patients, tasks, announcements, schedule, leave, aiLogs, logAudit, loadAll }) {
  const [out, setOut] = useState("尚未產生。");
  const [loading, setLoading] = useState(false);
  async function callAI() {
    setLoading(true);
    setOut("OpenAI 行政助理產生中...");
    const payload = {
      clinic, role: roles[profile.role],
      taskSummary: tasks.map(t=>({title:t.title, priority:t.priority, status:t.status, group:t.group_name})).slice(0,50),
      patientFlowSummary: patients.map(p=>({status:p.current_status, risk:p.risk_level, home:p.home_status, garment:p.garment_status})).slice(0,80),
      scheduleSummary: schedule.map(s=>({date:s.work_date, staff:s.staff_name, shift:s.shift_name, hours:s.hours})).slice(0,120),
      leaveSummary: leave.map(l=>({applicant:l.applicant_name, period:l.period_text, delegate:l.delegate_name, approval:l.approval_status})).slice(0,50),
      announcementSummary: announcements.map(a=>({title:a.title, required:a.required_read})).slice(0,20)
    };
    const { data, error } = await supabase.functions.invoke("ai-admin-assistant", { body: payload });
    if (error) {
      const fallback = `OpenAI Edge Function 尚未設定或呼叫失敗。\n\n錯誤：${error.message}\n\n請確認：\n1. 已部署 Supabase Edge Function。\n2. 已設定 OPENAI_API_KEY。\n3. 已在 Supabase Functions Secrets 設定 OPENAI_MODEL 或使用預設模型。\n\n目前仍可使用 Demo 的任務、公告、排班與流程功能。`;
      setOut(fallback);
    } else {
      setOut(data.output_text || "沒有取得內容。");
      await supabase.from("ai_usage_logs").insert({
        user_id: profile.id, user_email: profile.email, clinic, prompt_type: "行政交班摘要",
        input_summary: JSON.stringify(payload).slice(0, 6000),
        output_text: data.output_text,
        model: data.model
      });
      await logAudit("OpenAI 行政摘要", "AI", "ai_usage_logs", data.model);
      loadAll();
    }
    setLoading(false);
  }
  function fallbackAI() {
    const text = `【本機行政交班摘要｜未呼叫 OpenAI】\n1. 目前雲端假患者資料 ${patients.length} 筆。\n2. 未完成任務 ${tasks.filter(t => t.status !== "已完成").length} 筆，其中高優先 ${tasks.filter(t => t.priority === "高").length} 筆。\n3. 本月排班資料 ${schedule.length} 筆，請檢查高工時與請假代理衝突。\n4. 請假代理 ${leave.length} 筆，需追蹤代理同意與主管核准。\n5. 本內容僅為行政流程輔助，不涉及醫療診斷或治療決策。`;
    setOut(text);
  }
  return <><PageTitle title="OpenAI 行政助理" desc="正式接入 OpenAI API，但金鑰放在 Supabase Edge Function Secret，不暴露在前端。" actions={<><button className="primary" disabled={loading} onClick={callAI}>{loading?"產生中...":"呼叫 OpenAI 產生建議"}</button><button className="secondary" onClick={fallbackAI}>本機摘要備援</button></>} /><pre className="aiout">{out}</pre><Card title="最近 AI 使用紀錄"><DataTable compact headers={["時間","使用者","模型","輸出摘要"]} rows={aiLogs.map(l=>[new Date(l.created_at).toLocaleString("zh-TW"),l.user_email,l.model,String(l.output_text||"").slice(0,80)+"..."])} /></Card></>;
}
function Card({ title, children }) { return <div className="card"><h3>{title}</h3>{children}</div>; }
function TaskLine({ task }) { return <div className="taskLine"><span className={`badge ${task.priority==="高"?"red":task.priority==="中"?"yellow":"gray"}`}>{task.priority}</span><b>{task.title}</b><small>{task.group_name}｜{task.status}</small></div>; }
function DataTable({ headers, rows, compact }) { return <div className={`tableWrap ${compact ? "compact" : ""}`}><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i) => <tr key={i}>{r.map((c,j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>; }
function badge(text, tone="gray") { return <span className={`badge ${tone}`}>{text}</span>; }
function progress(v) { return <><div className="progress"><span style={{ width: `${v || 0}%` }} /></div><small>{v || 0}%</small></>; }
function filterRows(rows, q, fields) { const s = String(q || "").trim().toLowerCase(); if (!s) return rows || []; return (rows || []).filter(r => fields.some(f => String(r[f] || "").toLowerCase().includes(s))); }

createRoot(document.getElementById("root")).render(<App />);
