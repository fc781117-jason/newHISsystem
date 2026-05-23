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
const managerRoles = ["super_admin", "clinic_manager", "auditor"];
const isManagerRole = (role) => managerRoles.includes(role);
const priorityOrder = { "高": 1, "中": 2, "低": 3 };
const statusOrder = { "待處理": 1, "進行中": 2, "待審核": 3, "已完成": 9 };
const defaultAnnouncement = { scope: "院區", category: "行政公告", title: "", content: "", required_read: true, group_name: "" };

const legacyModules = [
  { title: "今日現場流程", purpose: "把等待看板、等待看診、等待治療、等待檢查、等待開處方、等待拿藥、初診、複診整併成同一條就診事件流程。", old: ["等待看板", "等待看診", "等待治療", "等待檢查", "等待開處方", "等待拿藥", "初診", "複診"], next: "今日流程看板、患者管理、任務中心" },
  { title: "患者與個案管理", purpose: "補回原系統的新增個案、個案查詢、初診建檔、複診登記、列管、高關懷與客服關懷等入口。", old: ["新增個案", "個案資訊查詢", "初診", "複診", "列管事項", "客服管理", "工作聯繫"], next: "患者主檔、個案流程、客服關懷、列管任務" },
  { title: "居家、保健衣、製衣物流", purpose: "把居家諮詢、居家聯繫、居家動態表、製衣、寄送、未完成事項改成可追蹤工單與任務。", old: ["等待居家諮詢", "居家聯繫", "居家動態表", "居家總覽", "居家未完成", "居家製衣", "保健衣未完成", "保健衣製衣", "等待寄送", "製衣前確認"], next: "居家服務狀態、製衣物流工單、跨組別待辦" },
  { title: "醫事、藥局、統計與公告", purpose: "把醫事管理、藥局管理、統計管理、公告、人事系統整併為行政營運中心。", old: ["醫事管理", "藥局管理", "統計管理", "公告", "專案系統", "人事系統"], next: "公告簽收、月排班、請假代理、人員權限、數位足跡、統計報表" }
];

const patientFieldGroups = [
  { title: "基本資料", fields: ["chart_no", "name", "gender", "age", "birthday", "phone_masked", "clinic", "risk_level"] },
  { title: "就診流程", fields: ["appointment_time", "current_status", "doctor", "therapist", "seat_no", "treatment_minutes"] },
  { title: "居家與製衣", fields: ["home_status", "garment_status", "progress", "note"] }
];
const fieldLabel = { chart_no:"病歷號", name:"姓名", gender:"性別", age:"年齡", birthday:"生日", phone_masked:"電話遮罩", clinic:"院區", risk_level:"風險", appointment_time:"預約時間", current_status:"目前流程", doctor:"醫師", therapist:"治療師", seat_no:"座號", treatment_minutes:"治療時間", home_status:"居家狀態", garment_status:"製衣狀態", progress:"流程進度", note:"備註" };

const demoStaffSeed = [
  ["治療組", "治療師", "therapist", ["林治療師", "王治療師", "陳治療師"]],
  ["健管組", "健管師", "health_manager", ["張健管師", "許健管師", "黃健管師"]],
  ["櫃檯組", "櫃檯", "frontdesk", ["櫃檯A", "櫃檯B", "櫃檯C"]],
  ["客服組", "客服", "customer_service", ["客服A", "客服B", "客服C"]],
  ["藥局組", "藥局", "pharmacy", ["藥局A", "藥局B"]],
  ["製衣物流組", "製衣物流", "garment_staff", ["製衣A", "物流B", "製衣C"]],
  ["主管組", "主管", "clinic_manager", ["院區主管A", "營運主管B"]]
];

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState("dashboard");
  const [clinic, setClinic] = useState("台北");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [query, setQuery] = useState("");
  const [taskViewMode, setTaskViewMode] = useState("priority");
  const [patients, setPatients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [demoStaff, setDemoStaff] = useState([]);
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
  const [selectedPatient, setSelectedPatient] = useState(null);

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
    const channel = supabase.channel("new-his-demo-v10-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients_mock" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcement_reads" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedules" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_swap_requests" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "demo_staff" }, loadAll)
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
      id: user.id, email,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || email?.split("@")[0] || "Demo User",
      role: isAdmin ? "super_admin" : "frontdesk", group_name: isAdmin ? "主管組" : "待設定", default_clinic: "台北", status: "active"
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
      supabase.from("demo_staff").select("*").order("group_name", { ascending: true }).order("full_name", { ascending: true }),
      supabase.from("announcements").select("*").or(`clinic.is.null,clinic.eq.${clinic}`).order("created_at", { ascending: false }),
      supabase.from("announcement_reads").select("*").order("read_at", { ascending: false }),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("leave_requests").select("*").eq("clinic", clinic).order("created_at", { ascending: false }),
      supabase.from("schedules").select("*").eq("clinic", clinic).eq("month_key", selectedMonth).order("work_date", { ascending: true }),
      supabase.from("shift_swap_requests").select("*").eq("clinic", clinic).order("created_at", { ascending: false }).limit(50),
      supabase.from("ai_usage_logs").select("*").eq("clinic", clinic).order("created_at", { ascending: false }).limit(30)
    ]);
    const [p,t,s,ds,a,r,au,l,sc,sw,ai] = res;
    if (p.error) setBootError(p.error.message);
    if (ds.error) console.warn("demo_staff table not ready. Please run supabase/v10_patch.sql", ds.error.message);
    setPatients(p.data || []); setTasks(t.data || []); setStaff(s.data || []); setDemoStaff(ds.error ? [] : (ds.data || []));
    setAnnouncements(a.data || []); setReads(r.data || []); setAudit(au.data || []); setLeave(l.data || []);
    setSchedule(sc.data || []); setShiftSwaps(sw.data || []); setAiLogs(ai.data || []);
  }

  async function logAudit(action, module, targetType, detail = "") {
    if (!supabase || !session?.user) return;
    await supabase.from("audit_logs").insert({ actor_id: session.user.id, actor_email: session.user.email, actor_role: profile?.role || "uninitialized", clinic, action, module, target_type: targetType, detail, user_agent: navigator.userAgent.slice(0, 180) });
  }

  async function generateDemoData(count = 20, reset = false) {
    if (reset) { await supabase.from("tasks").delete().eq("clinic", clinic); await supabase.from("patients_mock").delete().eq("clinic", clinic); }
    const demoPatients = Array.from({ length: count }, (_, i) => makeFakePatient(i + 1, clinic));
    const { data: inserted, error } = await supabase.from("patients_mock").insert(demoPatients).select("*");
    if (error) { flash(error.message); return; }
    const demoTasks = inserted.flatMap((p, idx) => idx % 3 === 0 ? [makeFakeTask(p, session.user.id)] : []);
    if (demoTasks.length) await supabase.from("tasks").insert(demoTasks);
    await logAudit(reset ? "重置並產生示範資料" : "追加示範資料", "Demo", "patients_mock", `${count} 筆`);
    flash(`已產生 ${count} 筆示範患者資料`); loadAll();
  }

  async function addOnePatient() {
    const p = makeFakePatient(patients.length + 1, clinic);
    const { error } = await supabase.from("patients_mock").insert({ ...p, created_by: session.user.id });
    if (error) flash(error.message); else flash("已新增一筆示範患者");
    await logAudit("新增示範患者", "Patient", "patients_mock", p.name); loadAll();
  }

  async function nextStatus(patient) {
    const idx = statuses.indexOf(patient.current_status);
    const next = statuses[Math.min(idx + 1, statuses.length - 1)];
    await supabase.from("patients_mock").update({ current_status: next, progress: Math.min(100, Number(patient.progress || 0) + 16) }).eq("id", patient.id);
    await logAudit("流程狀態更新", "今日流程", "patients_mock", `${patient.name}: ${patient.current_status} -> ${next}`); loadAll();
  }

  async function completeTask(task) {
    await supabase.from("tasks").update({ status: "已完成", completed_at: new Date().toISOString() }).eq("id", task.id);
    await logAudit("完成任務", "Task", "tasks", task.title); loadAll();
  }
  async function addTask() {
    await supabase.from("tasks").insert({ title: "手動新增雲端任務", task_type: "照會聯繫", priority: "中", status: "待處理", clinic, group_name: profile?.group_name || "待設定", owner_id: session.user.id, due_date: date, content: "多人雲端互動測試用任務。" });
    await logAudit("新增任務", "Task", "tasks", "手動新增雲端任務"); loadAll();
  }

  async function addLeave(monthOffset = 0) {
    const base = addMonths(new Date(), monthOffset);
    const key = monthKey(base); const start = `${key}-15`;
    await supabase.from("leave_requests").insert({ applicant_id: session.user.id, applicant_name: profile.full_name, leave_type: "特休", period_text: `${start} 09:00-18:00`, start_date: start, end_date: start, month_key: key, delegate_name: "請指定代理人", delegate_status: "待同意", approval_status: "待審核", progress: 25, clinic });
    await logAudit("新增三個月內請假卡位", "Leave", "leave_requests", `${profile.full_name} ${key}`); loadAll();
  }

  async function seedMonthSchedule() {
    const people = demoStaff.length ? demoStaff.slice(0, 16) : staff.length ? staff.slice(0, 10) : [{ full_name: profile.full_name, group_name: profile.group_name }];
    const rows = []; const dim = daysInMonth(selectedMonth);
    for (let d = 1; d <= dim; d++) {
      people.forEach((p) => rows.push({ work_date: ymDate(selectedMonth, d), month_key: selectedMonth, staff_name: p.full_name, group_name: p.group_name || "待設定", shift_name: ["早班 09:00-13:00","午班 13:00-17:00","晚班 17:00-21:00","休"][Math.floor(Math.random()*4)], hours: [0,4,4,8][Math.floor(Math.random()*4)], clinic }));
    }
    await supabase.from("schedules").delete().eq("clinic", clinic).eq("month_key", selectedMonth);
    await supabase.from("schedules").insert(rows);
    await logAudit("產生月排班", "Schedule", "schedules", `${clinic} ${selectedMonth}`); loadAll();
  }
  async function addShiftSwap() {
    const requester = profile.full_name; const target = demoStaff.find(s => s.full_name !== requester)?.full_name || staff.find(s => s.full_name !== requester)?.full_name || "待指定同仁";
    await supabase.from("shift_swap_requests").insert({ requester_id: session.user.id, requester_name: requester, target_name: target, request_date: date, original_shift: "早班 09:00-13:00", requested_shift: "午班 13:00-17:00", reason: "Demo 調班測試：需與代理或請假卡位一起檢查衝突。", status: "待對方同意", clinic });
    await logAudit("新增調班申請", "Schedule", "shift_swap_requests", `${requester} -> ${target}`); loadAll();
  }

  async function addAnnouncement(form) {
    const payload = { title: form.title || "未命名公告", content: form.content || "公告內容待補充。", scope: form.scope, clinic: form.scope === "總公司" ? null : clinic, group_name: form.scope === "組別" ? form.group_name : null, required_read: !!form.required_read, created_by: session.user.id };
    const { error } = await supabase.from("announcements").insert(payload);
    if (error) { flash(error.message); return; }
    await logAudit("新增公告", "Announcement", "announcements", `${payload.scope}:${payload.title}`); flash("公告已建立"); loadAll();
  }
  async function readAnnouncement(announcement) {
    const already = reads.some(r => r.announcement_id === announcement.id && r.user_id === session.user.id);
    if (already) return;
    await supabase.from("announcement_reads").insert({ announcement_id: announcement.id, user_id: session.user.id, user_email: profile.email });
    await logAudit("公告簽收", "Announcement", "announcements", announcement.title); loadAll();
  }

  async function updateRole(userId, role) { await supabase.from("profiles").update({ role }).eq("id", userId); await logAudit("變更角色權限", "Staff", "profiles", `${userId} -> ${role}`); loadAll(); }
  async function updateProfileField(userId, field, value) { await supabase.from("profiles").update({ [field]: value }).eq("id", userId); await logAudit("變更人員資料", "Staff", "profiles", `${userId} ${field} -> ${value}`); loadAll(); }
  async function seedDemoStaff() {
    const rows = demoStaffSeed.flatMap(([groupName, title, role, names]) => names.map(name => ({ full_name: name, title, role, group_name: groupName, default_clinic: clinic, status: "active" })));
    await supabase.from("demo_staff").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error } = await supabase.from("demo_staff").insert(rows);
    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("demo_staff") || msg.includes("schema cache")) {
        flash("尚未建立 demo_staff 資料表，請先到 Supabase 執行 supabase/v10_patch.sql");
      } else {
        flash(msg);
      }
    } else {
      flash("已建立各組虛擬員工");
    }
    await logAudit("建立虛擬員工", "Staff", "demo_staff", `${rows.length} 筆`); loadAll();
  }
  async function updateDemoStaff(id, field, value) { await supabase.from("demo_staff").update({ [field]: value }).eq("id", id); await logAudit("調整虛擬員工", "Staff", "demo_staff", `${field} -> ${value}`); loadAll(); }

  function visibleTasksForProfile(allTasks) { if (isManagerRole(profile?.role)) return allTasks; const group = profile?.group_name || ""; return allTasks.filter(t => t.group_name === group || t.owner_id === session?.user?.id); }
  function sortedTasksForDashboard(allTasks) {
    const base = visibleTasksForProfile(allTasks).filter(t => t.status !== "已完成");
    return [...base].sort((a,b) => taskViewMode === "priority" ? (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9) : taskViewMode === "status" ? (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9) : String(a.group_name || "").localeCompare(String(b.group_name || ""), "zh-Hant"));
  }

  const filteredPatients = useMemo(() => filterRows(patients, query, ["name","chart_no","disease","current_status"]), [patients, query]);
  const filteredTasks = useMemo(() => filterRows(tasks, query, ["title","task_type","status","group_name"]), [tasks, query]);

  if (!isConfigured) return <ConfigMissing />;
  if (!session) return <Login bootError={bootError} signIn={signInWithGoogle} />;
  if (!profile) return <div className="loading">正在建立 Google 帳號綁定與人員檔...</div>;

  return <main className="app">
    <div className="watermark" />{toast && <div className="toast">{toast}</div>}
    {selectedPatient && <PatientModal patient={selectedPatient} onClose={() => setSelectedPatient(null)} nextStatus={nextStatus} />}
    <header className="topbar">
      <div className="brand"><button className="icon" onClick={() => setMobileOpen(!mobileOpen)}>☰</button><div><strong>{APP_TITLE}</strong><small><span className="versionBadge">V10</span> 雲端多人互動 Demo｜Google + Supabase + OpenAI Edge Function</small></div></div>
      <details className="filterPanel"><summary>搜尋與篩選 / Filter</summary><div className="filterGrid"><label>院區 / Clinic<select value={clinic} onChange={e => setClinic(e.target.value)}>{clinics.map(c => <option key={c}>{c}</option>)}</select></label><label>日期 / Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>搜尋 / Search<input value={query} onChange={e => setQuery(e.target.value)} placeholder="患者、任務、公告..." /></label></div></details>
      <div className="userbox"><div><strong>{profile.full_name}</strong><small>{roles[profile.role]}｜{profile.group_name || "未設定組別"}</small><small>{profile.email}｜預設院區 {profile.default_clinic || clinic}</small></div><button onClick={signOut} className="textbtn">登出</button></div>
    </header>
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <MenuGroup title="今日現場 / Today Ops" items={[["dashboard","工作指揮中心"],["flow","今日流程看板"],["patients","患者管理"]]} view={view} setView={setAuthorizedView} can={can}/>
      <MenuGroup title="個案照護 / Care" items={[["tasks","任務中心"],["ai","OpenAI 行政助理"]]} view={view} setView={setAuthorizedView} can={can}/>
      <MenuGroup title="行政營運 / Admin" items={[["moduleMap","功能整併總覽"],["staff","人員與權限"],["leave","請假與代理"],["schedule","月排班與調班"],["announcements","公告與簽收"],["audit","數位足跡稽核"],["settings","Demo 管理設定"]]} view={view} setView={setAuthorizedView} can={can}/>
    </aside>
    <section className="content">
      {view === "dashboard" && <Dashboard patients={filteredPatients} tasks={sortedTasksForDashboard(filteredTasks)} allTasks={filteredTasks} announcements={announcements} reads={reads} profile={profile} taskViewMode={taskViewMode} setTaskViewMode={setTaskViewMode} readAnnouncement={readAnnouncement} />}
      {view === "flow" && <Flow patients={filteredPatients} nextStatus={nextStatus} openPatient={setSelectedPatient} />}
      {view === "patients" && <Patients patients={filteredPatients} addOnePatient={addOnePatient} openPatient={setSelectedPatient} />}
      {view === "tasks" && <Tasks tasks={filteredTasks} addTask={addTask} completeTask={completeTask} />}
      {view === "moduleMap" && <ModuleMap />}
      {view === "staff" && <Staff staff={staff} demoStaff={demoStaff} profile={profile} updateRole={updateRole} updateProfileField={updateProfileField} seedDemoStaff={seedDemoStaff} updateDemoStaff={updateDemoStaff} />}
      {view === "leave" && <Leave leave={leave} addLeave={addLeave} />}
      {view === "schedule" && <Schedule schedule={schedule} shiftSwaps={shiftSwaps} addShiftSwap={addShiftSwap} seedMonthSchedule={seedMonthSchedule} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />}
      {view === "announcements" && <Announcements announcements={announcements} reads={reads} profile={profile} addAnnouncement={addAnnouncement} readAnnouncement={readAnnouncement} />}
      {view === "audit" && <Audit audit={audit} />}
      {view === "settings" && <Settings generateDemoData={generateDemoData} seedDemoStaff={seedDemoStaff} />}
      {view === "ai" && <AIHelper profile={profile} clinic={clinic} patients={patients} tasks={tasks} announcements={announcements} schedule={schedule} leave={leave} aiLogs={aiLogs} logAudit={logAudit} loadAll={loadAll}/>}      
    </section>
  </main>;

  function setAuthorizedView(target) {
    if (!can(target)) { flash("此角色目前無權限開啟此模組"); return; }
    setView(target);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelector(".content")?.scrollTo?.({ top: 0, behavior: "smooth" });
    logAudit("開啟模組", "Navigation", target, "");
  }
}

function ConfigMissing() { return <div className="loginPage"><div className="loginCard"><h1>尚未設定 Supabase 環境變數</h1><p>請依照 <code>.env.example</code> 建立 <code>.env.local</code>，並設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。</p></div></div>; }
function Login({ bootError, signIn }) { return <div className="loginPage"><div className="loginCard"><div className="mark">NRS</div><h1>{APP_TITLE}</h1><p>多人雲端互動 Demo：真 Google 登入 + Supabase 資料庫 + OpenAI 行政助理。</p><div className="notice"><b>Demo 邊界</b><p>不使用真實病患資料。所有患者、任務、公告、排班、請假皆為測試資料。</p></div><button className="primary full" onClick={signIn}>使用 Google 登入 / Sign in with Google</button>{bootError && <p className="error">{bootError}</p>}<small>最高系統管理員信箱：{ADMIN_EMAIL}</small></div></div>; }
function MenuGroup({ title, items, view, setView, can }) { return <details open><summary>{title}</summary>{items.map(([id,label]) => <button key={id} disabled={!can(id)} className={`nav ${view===id ? "active" : ""}`} onClick={() => setView(id)}>{label}</button>)}</details>; }
function PageTitle({ title, desc, actions }) { return <div className="pageTitle"><div><h2>{title}</h2><p>{desc}</p></div><div className="actions">{actions}</div></div>; }
function Card({ title, children }) { return <div className="card"><h3>{title}</h3>{children}</div>; }
function Metric({ title, value, tone }) { return <div className={`metric ${tone || ""}`}><span>{title}</span><strong>{value}</strong></div>; }

function Dashboard({ patients, tasks, allTasks, announcements, reads, profile, taskViewMode, setTaskViewMode, readAnnouncement }) {
  const high = tasks.filter(t => t.priority === "高" && t.status !== "已完成").length;
  const unreadList = announcements.filter(a => !reads.some(r => r.announcement_id === a.id && r.user_id === profile.id));
  const visiblePending = tasks.filter(t => t.status !== "已完成");
  return <><PageTitle title="工作指揮中心" desc="首頁只保留重點：患者數、待辦、公告、主管總覽；大量內容改為折疊展開。" />
    <div className="compactMetrics"><Metric title="今日患者" value={patients.length}/><Metric title="待辦事項" value={visiblePending.length}/><Metric title="高優先" value={high} tone="red"/><Metric title="未簽收公告" value={unreadList.length} tone="yellow"/></div>
    <div className="dashboardGrid">
      <Card title={isManagerRole(profile.role) ? "主管待辦總覽" : `${profile.group_name || "我的組別"}待辦`}>{isManagerRole(profile.role) ? <GroupPendingOverview tasks={allTasks} /> : <PersonalGroupOverview tasks={visiblePending} profile={profile} />}</Card>
      <Card title="今日必辦"><div className="miniToolbar"><label>排序方式<select value={taskViewMode} onChange={e => setTaskViewMode(e.target.value)}><option value="priority">依高中低優先</option><option value="status">依處理狀態</option><option value="group">依組別</option></select></label></div><CollapsibleTaskList tasks={visiblePending} mode={taskViewMode} limit={2} />{!visiblePending.length && <p className="muted">目前無待辦。請到「Demo 管理設定」產生示範資料。</p>}</Card>
      <Card title="公告提醒"><AnnouncementPreview announcements={unreadList} reads={reads} profile={profile} readAnnouncement={readAnnouncement} /></Card>
    </div>
  </>;
}
function AnnouncementPreview({ announcements, readAnnouncement }) {
  if (!announcements.length) return <p className="muted">目前沒有未簽收公告。可至「行政營運 → 公告與簽收」建立院區公告、組別公告或總公司公告。</p>;
  const first = announcements.slice(0,2), rest = announcements.slice(2);
  const item = (a) => <details className="noticeFold" key={a.id}>
    <summary><span className="badge yellow">{a.scope}</span><b>{a.title}</b></summary>
    <p>{a.content || "公告內容待補充。"}</p>
    <button className="secondary" onClick={() => readAnnouncement(a)}>我已閱讀並簽收</button>
  </details>;
  return <div className="announcementPreview">
    {first.map(item)}
    {rest.length > 0 && <details className="compactDetails"><summary>展開其餘 {rest.length} 則公告</summary>{rest.map(item)}</details>}
  </div>;
}
function GroupPendingOverview({ tasks }) {
  const pending = tasks.filter(t => t.status !== "已完成");
  const rows = groups.map(g => { const list = pending.filter(t => t.group_name === g); return { group:g, count:list.length, high:list.filter(t => t.priority === "高").length }; }).sort((a,b)=>b.count-a.count || b.high-a.high);
  const first = rows.slice(0,2), rest = rows.slice(2);
  const render = r => <div className="groupStat" key={r.group}><span>{r.group}</span><strong>{r.count}</strong><small>高優先 {r.high}</small></div>;
  return <><div className="groupOverview">{first.map(render)}</div>{rest.length>0 && <details className="compactDetails"><summary>展開其他組別</summary><div className="groupOverview">{rest.map(render)}</div></details>}</>;
}
function PersonalGroupOverview({ tasks, profile }) { const pending = tasks.filter(t => t.status !== "已完成"); const high = pending.filter(t => t.priority === "高").length; return <div className="groupOverview"><div className="groupStat"><span>所屬組別</span><strong>{profile.group_name || "待設定"}</strong><small>{roles[profile.role]}</small></div><div className="groupStat"><span>未完成</span><strong>{pending.length}</strong><small>本組或指派給我</small></div><div className="groupStat"><span>高優先</span><strong>{high}</strong><small>需先處理</small></div></div>; }
function CollapsibleTaskList({ tasks, mode, limit=2 }) {
  const grouped = {};
  tasks.forEach(t => {
    const key = mode === "priority" ? `${t.priority || "未分級"}優先` : mode === "status" ? (t.status || "未分狀態") : (t.group_name || "未分組");
    grouped[key] = grouped[key] || [];
    grouped[key].push(t);
  });
  const keys = Object.keys(grouped).sort((a,b)=> mode === "priority" ? (priorityOrder[a.replace("優先","")] || 9) - (priorityOrder[b.replace("優先","")] || 9) : a.localeCompare(b,"zh-Hant"));
  return <div className="accordionList">{keys.map((key)=>{
    const list=grouped[key]; const first=list.slice(0,limit); const rest=list.slice(limit);
    return <details key={key} className="taskFold"><summary>{key}<span>{list.length}</span></summary>{first.map(t=><TaskLine key={t.id} task={t}/>)}{rest.length>0 && <details className="innerDetails"><summary>展開剩餘 {rest.length} 筆</summary>{rest.map(t=><TaskLine key={t.id} task={t}/>)}</details>}</details>
  })}</div>;
}
function TaskLine({ task }) { return <div className="taskLine"><span className={`badge ${task.priority==="高"?"red":task.priority==="中"?"yellow":"gray"}`}>{task.priority}</span><b>{task.title}</b><small>{task.group_name}｜{task.status}</small></div>; }

function Flow({ patients, nextStatus, openPatient }) { return <><PageTitle title="今日流程看板" desc="每個流程只顯示前兩位，其餘折疊；「完成本站 → 下一步」代表該站人員完成處理後推進流程狀態。" /><div className="kanban">{statuses.map(s => <PatientLane key={s} status={s} patients={patients.filter(p=>p.current_status===s)} nextStatus={nextStatus} openPatient={openPatient}/>)}</div></>; }
function PatientLane({ status, patients, nextStatus, openPatient }) { const first=patients.slice(0,2), rest=patients.slice(2); const card=p=><PatientCard key={p.id} p={p} nextStatus={nextStatus} openPatient={openPatient}/>; return <div className="lane"><h3>{status}<span>{patients.length}</span></h3>{first.map(card)}{rest.length>0 && <details className="innerDetails"><summary>展開其餘 {rest.length} 人</summary>{rest.map(card)}</details>}</div>; }
function PatientCard({ p, nextStatus, openPatient }) { return <div className="pCard"><button className="cardOpen" onClick={()=>openPatient(p)}><b>{p.name}</b><small>{p.chart_no}｜{p.disease}｜座號 {p.seat_no}</small><em className="tapHint">點擊查看掛號詳細資料</em></button><div className="cardActions"><button className="secondary" title="各站人員完成本站工作後，手動推進到下一個流程狀態。" onClick={() => nextStatus(p)}>完成本站 → 下一步</button></div></div>; }
function PatientModal({ patient, onClose, nextStatus }) { return <div className="modalBackdrop" onClick={onClose}><div className="modalCard" onClick={e=>e.stopPropagation()}><div className="modalHead"><h3>{patient.name}｜{patient.chart_no}</h3><button className="textbtn" onClick={onClose}>關閉</button></div><div className="patientSections">{patientFieldGroups.map(g=><details key={g.title} open><summary>{g.title}</summary><div className="fieldGrid">{g.fields.map(f=><div className="field" key={f}><span>{fieldLabel[f]||f}</span><strong>{String(patient[f] ?? "-")}</strong></div>)}</div></details>)}</div><div className="moduleActions"><button className="secondary">初診建檔</button><button className="secondary">複診登記</button><button className="secondary">客服關懷</button><button className="secondary">居家諮詢</button><button className="secondary">列管事項</button><button className="primary" onClick={()=>nextStatus(patient)}>完成本站 → 下一步</button></div><p className="muted">以上為示範欄位與入口，後續可依原系統細化成正式表單。</p></div></div>; }

function Patients({ patients, addOnePatient, openPatient }) { return <><PageTitle title="患者管理" desc="整併新增個案、個案查詢、初診、複診、列管、客服關懷與現場流程入口。" actions={<button className="primary" onClick={addOnePatient}>新增示範患者</button>} /><div className="quickActions"><button className="secondary">新增個案</button><button className="secondary">初診建檔</button><button className="secondary">複診登記</button><button className="secondary">個案資訊查詢</button><button className="secondary">列管事項</button><button className="secondary">客服關懷</button></div><DataTable headers={["病歷號","姓名","性別","年齡","電話遮罩","疾病別","狀態","居家","製衣","操作"]} rows={patients.map(p => [p.chart_no,p.name,p.gender,p.age,maskPhone(p.phone_masked),p.disease,p.current_status,p.home_status,p.garment_status,<button className="secondary" onClick={()=>openPatient(p)}>查看檔案</button>])}/><div className="card"><h3>欄位分層</h3><ModuleSummary compact /></div></>; }
function Tasks({ tasks, addTask, completeTask }) { return <><PageTitle title="任務中心" desc="照會、交接、關懷、列管、製衣、寄送等統一任務化。" actions={<button className="primary" onClick={addTask}>新增雲端任務</button>} /><DataTable headers={["優先","任務","類型","組別","狀態","到期日","操作"]} rows={tasks.map(t => [badge(t.priority,t.priority==="高"?"red":t.priority==="中"?"yellow":"gray"),t.title,t.task_type,t.group_name,t.status,t.due_date,<button className="secondary" onClick={() => completeTask(t)}>完成</button>])}/></>; }

function ModuleSummary({ compact=false }) { const items = compact ? legacyModules.slice(0,2) : legacyModules; return <div className="moduleGrid">{items.map(m => <details className="moduleItem" key={m.title}><summary>{m.title}</summary><p>{m.purpose}</p><small>原功能：{m.old.join("、")}</small><em>新版承接：{m.next}</em></details>)}</div>; }
function ModuleMap() { return <><PageTitle title="功能整併總覽" desc="依原系統模組重新歸類，避免功能遺漏；採折疊式呈現，減少頁面重量。" /><div className="card moduleBlock"><ModuleSummary /></div><div className="card"><h3>第三層功能規劃</h3><div className="moduleGrid"><details className="moduleItem"><summary>患者管理第三層</summary><p>新增個案、初診、複診、個案查詢、患者檔案、列管、高關懷、客服紀錄。</p></details><details className="moduleItem"><summary>現場流程第三層</summary><p>等待看板、等待看診、等待治療、等待檢查、等待開處方、等待拿藥、完診。</p></details><details className="moduleItem"><summary>居家與製衣第三層</summary><p>居家諮詢、居家聯繫、居家動態表、保健衣劃記、製衣工單、等待寄送。</p></details><details className="moduleItem"><summary>行政營運第三層</summary><p>人員權限、公告簽收、月排班、請假代理、調班申請、數位足跡、統計報表。</p></details></div></div></>; }

function Staff({ staff, demoStaff, profile, updateRole, updateProfileField, seedDemoStaff, updateDemoStaff }) { const canEdit = profile.role === "super_admin" || profile.role === "clinic_manager"; return <><PageTitle title="人員與權限管理" desc="Google 登入帳號與虛擬員工分開管理；虛擬員工用於排班、任務分組與訓練測試。" actions={<button className="primary" onClick={seedDemoStaff}>建立各組虛擬員工</button>} /><Card title="Google 登入帳號"><DataTable headers={["姓名","Email","角色","組別","預設院區","狀態"]} rows={staff.map(s => [s.full_name,s.email,canEdit ? <select value={s.role} onChange={e => updateRole(s.id,e.target.value)}>{Object.keys(roles).map(r => <option key={r} value={r}>{roles[r]}</option>)}</select> : (roles[s.role]||s.role),canEdit ? <select value={s.group_name || "待設定"} onChange={e => updateProfileField(s.id,"group_name",e.target.value)}><option value="待設定">待設定</option>{groups.map(g => <option key={g} value={g}>{g}</option>)}</select> : (s.group_name || "待設定"),canEdit ? <select value={s.default_clinic || "台北"} onChange={e => updateProfileField(s.id,"default_clinic",e.target.value)}>{clinics.map(c => <option key={c} value={c}>{c}</option>)}</select> : (s.default_clinic || "台北"),s.status])}/></Card><Card title="虛擬員工"><DataTable headers={["姓名","職稱","角色","組別","預設院區","狀態"]} rows={demoStaff.map(s => [canEdit ? <input className="cellInput" value={s.full_name} onChange={e=>updateDemoStaff(s.id,"full_name",e.target.value)} /> : s.full_name,canEdit ? <input className="cellInput" value={s.title||""} onChange={e=>updateDemoStaff(s.id,"title",e.target.value)} /> : s.title,canEdit ? <select value={s.role} onChange={e => updateDemoStaff(s.id,"role",e.target.value)}>{Object.keys(roles).map(r => <option key={r} value={r}>{roles[r]}</option>)}</select> : roles[s.role],canEdit ? <select value={s.group_name} onChange={e=>updateDemoStaff(s.id,"group_name",e.target.value)}>{groups.map(g=><option key={g}>{g}</option>)}</select> : s.group_name,canEdit ? <select value={s.default_clinic} onChange={e=>updateDemoStaff(s.id,"default_clinic",e.target.value)}>{clinics.map(c=><option key={c}>{c}</option>)}</select> : s.default_clinic,s.status])}/></Card></>; }
function Leave({ leave, addLeave }) { return <><PageTitle title="請假與代理" desc="可預先建立未來三個月內的假單卡位；正式版再加入代理人同意與主管核准。" actions={<><button className="secondary" onClick={() => addLeave(0)}>本月卡位</button><button className="secondary" onClick={() => addLeave(1)}>下月卡位</button><button className="secondary" onClick={() => addLeave(2)}>二個月後</button><button className="primary" onClick={() => addLeave(3)}>三個月後</button></>} /><DataTable headers={["申請人","假別","期間","月份","代理人","代理狀態","審核狀態","進度"]} rows={leave.map(l => [l.applicant_name,l.leave_type,l.period_text,l.month_key,l.delegate_name,l.delegate_status,l.approval_status,progress(l.progress)])}/></>; }
function Schedule({ schedule, shiftSwaps, addShiftSwap, seedMonthSchedule, selectedMonth, setSelectedMonth }) { const totals = {}; schedule.forEach(s => totals[s.staff_name] = (totals[s.staff_name] || 0) + Number(s.hours || 0)); return <><PageTitle title="月排班與調班" desc="實務以月為單位排班；支援整月排班、月工時統計與調班申請流程。" actions={<><select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}>{nextMonthOptions().map(m=><option key={m}>{m}</option>)}</select><button className="primary" onClick={seedMonthSchedule}>產生整月排班</button><button className="secondary" onClick={addShiftSwap}>新增調班申請</button></>} /><div className="split"><Card title={`${selectedMonth} 月排班`}><DataTable compact headers={["日期","人員","組別","班別","時數"]} rows={schedule.map(s => [s.work_date,s.staff_name,s.group_name,s.shift_name,s.hours])}/></Card><Card title="工時統計與公平性提示"><DataTable compact headers={["人員","月工時","提示"]} rows={Object.entries(totals).map(([name,h]) => [name,`${h} 小時`,h>180?"偏高，建議調整":h<120?"偏低，可評估補班":"正常"])}/></Card></div><div className="card"><h3>調班申請</h3><p className="muted">正式版應串接：申請人 → 對方同意 → 主管核准 → 月排班自動更新 → 稽核留痕。</p><DataTable compact headers={["申請人","對象","日期","原班別","欲換班別","狀態","原因"]} rows={(shiftSwaps||[]).map(s=>[s.requester_name,s.target_name,s.request_date,s.original_shift,s.requested_shift,s.status,s.reason])}/></div></>; }

function Announcements({ announcements, reads, profile, addAnnouncement, readAnnouncement }) { const [form,setForm]=useState(defaultAnnouncement); const submit=()=>{ addAnnouncement(form); setForm(defaultAnnouncement); }; return <><PageTitle title="公告與簽收" desc="可建立總公司公告、院區公告或組別公告；簽收後會留下紀錄。" /><Card title="新增公告"><div className="formGrid"><label>公告範圍<select value={form.scope} onChange={e=>setForm({...form,scope:e.target.value})}><option>總公司</option><option>院區</option><option>組別</option></select></label><label>分類<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option>行政公告</option><option>教育訓練</option><option>資訊安全</option><option>排班通知</option><option>緊急公告</option></select></label>{form.scope==="組別" && <label>指定組別<select value={form.group_name} onChange={e=>setForm({...form,group_name:e.target.value})}>{groups.map(g=><option key={g}>{g}</option>)}</select></label>}<label className="wideField">標題<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="請輸入公告標題" /></label><label className="wideField">內容<textarea value={form.content} onChange={e=>setForm({...form,content:e.target.value})} placeholder="請輸入公告內容" /></label><label className="checkRow"><input type="checkbox" checked={form.required_read} onChange={e=>setForm({...form,required_read:e.target.checked})}/> 需要簽收</label></div><button className="primary" onClick={submit}>發布公告</button></Card><Card title="公告列表">{announcements.map(a => { const read = reads.some(r => r.announcement_id === a.id && r.user_id === profile.id); return <div className={`ann ${read ? "" : "unread"}`} key={a.id}><span className="badge">{a.scope}</span> {a.required_read && <span className="badge red">需簽收</span>}<h3>{a.title}</h3><p>{a.content}</p><button className="secondary" onClick={() => readAnnouncement(a)}>{read ? "已簽收" : "簽收公告"}</button></div>})}</Card></>; }
function Audit({ audit }) { const [actor,setActor]=useState(""), [module,setModule]=useState(""), [action,setAction]=useState(""), [keyword,setKeyword]=useState(""); const modules=[...new Set(audit.map(a=>a.module).filter(Boolean))]; const actions=[...new Set(audit.map(a=>a.action).filter(Boolean))]; const actors=[...new Set(audit.map(a=>a.actor_email).filter(Boolean))]; const rows=audit.filter(a=>(!actor||a.actor_email===actor)&&(!module||a.module===module)&&(!action||a.action===action)&&(!keyword||JSON.stringify(a).includes(keyword))).slice(0,80); return <><PageTitle title="數位足跡稽核" desc="用下拉篩選快速查詢帳號、模組與動作；大量紀錄以折疊呈現。" /><div className="filterGrid auditFilters"><label>帳號<select value={actor} onChange={e=>setActor(e.target.value)}><option value="">全部</option>{actors.map(x=><option key={x}>{x}</option>)}</select></label><label>模組<select value={module} onChange={e=>setModule(e.target.value)}><option value="">全部</option>{modules.map(x=><option key={x}>{x}</option>)}</select></label><label>動作<select value={action} onChange={e=>setAction(e.target.value)}><option value="">全部</option>{actions.map(x=><option key={x}>{x}</option>)}</select></label><label>關鍵字<input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="細節、院區、目標..." /></label></div><details className="compactDetails" open><summary>顯示稽核紀錄 {rows.length} 筆</summary><DataTable headers={["時間","操作者","角色","院區","模組","動作","目標","細節"]} rows={rows.map(a => [new Date(a.created_at).toLocaleString("zh-TW"),a.actor_email,a.actor_role,a.clinic,a.module,a.action,a.target_type,a.detail])}/></details></>; }
function Settings({ generateDemoData, seedDemoStaff }) { return <><PageTitle title="Demo 管理設定" desc="最高系統管理員可以重置或追加示範資料，方便多人訓練與反覆測試。" /><div className="grid three"><button className="primary big" onClick={() => generateDemoData(20,true)}>重置 20 筆示範患者</button><button className="primary big" onClick={() => generateDemoData(50,true)}>重置 50 筆示範患者</button><button className="secondary big" onClick={() => generateDemoData(20,false)}>追加 20 筆示範患者</button><button className="secondary big" onClick={seedDemoStaff}>建立各組虛擬員工</button></div></>; }
function AIHelper({ profile, clinic, patients, tasks, announcements, schedule, leave, aiLogs, logAudit, loadAll }) { const [out,setOut]=useState("尚未產生。"); const [loading,setLoading]=useState(false); async function callAI(){ setLoading(true); setOut("OpenAI 行政助理產生中..."); const payload={ clinic, role:roles[profile.role], taskSummary:tasks.map(t=>({title:t.title, priority:t.priority, status:t.status, group:t.group_name})).slice(0,50), patientFlowSummary:patients.map(p=>({status:p.current_status, risk:p.risk_level, home:p.home_status, garment:p.garment_status})).slice(0,80), scheduleSummary:schedule.map(s=>({date:s.work_date, staff:s.staff_name, shift:s.shift_name, hours:s.hours})).slice(0,120), leaveSummary:leave.map(l=>({applicant:l.applicant_name, period:l.period_text, delegate:l.delegate_name, approval:l.approval_status})).slice(0,50), announcementSummary:announcements.map(a=>({title:a.title, required:a.required_read})).slice(0,20) }; const { data, error } = await supabase.functions.invoke("ai-admin-assistant", { body: payload }); if(error){setOut(`OpenAI Edge Function 呼叫失敗：${error.message}\n可先使用本機摘要備援。`);}else{setOut(data.output_text||"沒有取得內容。"); await supabase.from("ai_usage_logs").insert({user_id:profile.id,user_email:profile.email,clinic,prompt_type:"行政交班摘要",input_summary:JSON.stringify(payload).slice(0,6000),output_text:data.output_text,model:data.model}); await logAudit("OpenAI 行政摘要","AI","ai_usage_logs",data.model); loadAll();} setLoading(false);} function fallbackAI(){ setOut(`【本機行政交班摘要｜未呼叫 OpenAI】\n1. 目前患者資料 ${patients.length} 筆。\n2. 未完成任務 ${tasks.filter(t=>t.status!=="已完成").length} 筆，其中高優先 ${tasks.filter(t=>t.priority==="高").length} 筆。\n3. 本月排班資料 ${schedule.length} 筆，請檢查高工時與請假代理衝突。\n4. 請假代理 ${leave.length} 筆，需追蹤代理同意與主管核准。\n5. 本內容僅為行政流程輔助，不涉及醫療診斷或治療決策。`);} return <><PageTitle title="OpenAI 行政助理" desc="正式接入 OpenAI API，但金鑰放在 Supabase Edge Function Secret，不暴露在前端。" actions={<><button className="primary" disabled={loading} onClick={callAI}>{loading?"產生中...":"呼叫 OpenAI 產生建議"}</button><button className="secondary" onClick={fallbackAI}>本機摘要備援</button></>} /><pre className="aiout">{out}</pre><Card title="最近 AI 使用紀錄"><DataTable compact headers={["時間","使用者","模型","輸出摘要"]} rows={aiLogs.map(l=>[new Date(l.created_at).toLocaleString("zh-TW"),l.user_email,l.model,String(l.output_text||"").slice(0,80)+"..."])} /></Card></>; }
function DataTable({ headers, rows, compact }) { return <div className={`tableWrap ${compact ? "compact" : ""}`}><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i) => <tr key={i}>{r.map((c,j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>; }
function badge(text, tone="gray") { return <span className={`badge ${tone}`}>{text}</span>; }
function progress(v) { return <><div className="progress"><span style={{ width: `${v || 0}%` }} /></div><small>{v || 0}%</small></>; }
function filterRows(rows, q, fields) { const s = String(q || "").trim().toLowerCase(); if (!s) return rows || []; return (rows || []).filter(r => fields.some(f => String(r[f] || "").toLowerCase().includes(s))); }

createRoot(document.getElementById("root")).render(<App />);
