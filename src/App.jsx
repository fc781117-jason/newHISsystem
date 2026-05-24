import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase, isConfigured, ADMIN_EMAIL, APP_TITLE } from "./lib/supabase";
import { clinics, groups, roles, rolePerms, statuses, taskTypes, workOrderTypes, makeFakePatient, makeFakeTask, maskPhone } from "./lib/mock";
import "./styles.css";

const priorityOrder = { "高": 1, "中": 2, "低": 3 };
const statusOrder = { "待處理": 1, "進行中": 2, "待審核": 3, "已完成": 9 };
const managerRoles = ["super_admin", "clinic_manager", "auditor"];
const isManager = (role) => managerRoles.includes(role);
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const addMonths = (date, m) => { const d = new Date(date); d.setMonth(d.getMonth() + m); return d; };
const nextMonthOptions = () => Array.from({length:4}, (_,i)=>monthKey(addMonths(new Date(), i)));
const daysInMonth = (key) => { const [y,m] = key.split("-").map(Number); return new Date(y, m, 0).getDate(); };
const ymDate = (key, day) => `${key}-${String(day).padStart(2,"0")}`;

const fieldLabel = {
  chart_no:"病歷號", name:"姓名", gender:"性別", age:"年齡", birthday:"生日", phone_masked:"電話遮罩", clinic:"院區", risk_level:"風險",
  appointment_time:"預約時間", current_status:"目前流程", doctor:"醫師", therapist:"治療師", seat_no:"座號", treatment_minutes:"治療時間",
  home_status:"居家狀態", garment_status:"製衣狀態", progress:"流程進度", note:"備註", disease:"疾病／主訴"
};
const patientFieldGroups = [
  { title: "基本資料", fields: ["chart_no", "name", "gender", "age", "birthday", "phone_masked", "clinic", "risk_level"] },
  { title: "掛號與就診", fields: ["appointment_time", "current_status", "doctor", "therapist", "seat_no", "treatment_minutes"] },
  { title: "個案照護", fields: ["home_status", "garment_status", "progress", "note"] }
];

const demoStaffSeed = [
  ["治療組", "治療師", "therapist", ["林治療師", "王治療師", "陳治療師"]],
  ["健管組", "健管師", "health_manager", ["張健管師", "許健管師", "黃健管師"]],
  ["櫃檯組", "櫃檯", "frontdesk", ["櫃檯A", "櫃檯B", "櫃檯C"]],
  ["客服組", "客服", "customer_service", ["客服A", "客服B", "客服C"]],
  ["藥局組", "藥局", "pharmacy", ["藥局A", "藥局B"]],
  ["製衣物流組", "製衣物流", "garment_staff", ["製衣A", "物流B", "製衣C"]],
  ["主管組", "主管", "clinic_manager", ["院區主管A", "營運主管B"]]
];

const defaultAnnouncement = { scope:"院區", category:"行政公告", group_name:"治療組", title:"", content:"", required_read:true };
const defaultPatientForm = { mode:"新增個案", name:"", gender:"女", age:"", birthday:"", phone_masked:"", disease:"自律神經失調", appointment_time:"09:00", doctor:"未指派", therapist:"未指派", treatment_minutes:30, risk_level:"一般", note:"" };

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState("dashboard");
  const [clinic, setClinic] = useState("台北");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [workClinicConfirmed, setWorkClinicConfirmed] = useState(false);
  const [query, setQuery] = useState("");
  const [taskViewMode, setTaskViewMode] = useState("priority");
  const [patients, setPatients] = useState([]);
  const [patientEvents, setPatientEvents] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
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
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [bootError, setBootError] = useState("");

  const can = (target) => rolePerms[profile?.role || "frontdesk"]?.includes(target);
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3200); };

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
    const channel = supabase.channel("new-his-demo-v16-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients_mock" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "patient_events" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments_mock" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcement_reads" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "demo_staff" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedules" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_swap_requests" }, loadAll)
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
    const { data: existing } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
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
    const { data, error } = await supabase.from("profiles").upsert(newProfile).select("*").single();
    if (error) setBootError(error.message);
    setProfile(data || newProfile);
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) setBootError(error.message);
  }

  async function signOut() {
    await logAudit("登出", "Auth", "session", profile?.email);
    await supabase.auth.signOut();
    setSession(null); setProfile(null);
  }

  async function loadAll() {
    if (!profile) return;
    const res = await Promise.all([
      supabase.from("patients_mock").select("*").eq("clinic", clinic).order("created_at", { ascending: false }),
      supabase.from("patient_events").select("*").eq("clinic", clinic).order("created_at", { ascending: false }).limit(500),
      supabase.from("appointments_mock").select("*").eq("clinic", clinic).order("created_at", { ascending: false }).limit(500),
      supabase.from("work_orders").select("*").eq("clinic", clinic).order("created_at", { ascending: false }).limit(500),
      supabase.from("tasks").select("*, patients_mock(name, chart_no)").eq("clinic", clinic).order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("demo_staff").select("*").order("group_name", { ascending: true }).order("full_name", { ascending: true }),
      supabase.from("announcements").select("*").or(`clinic.is.null,clinic.eq.${clinic}`).order("created_at", { ascending: false }),
      supabase.from("announcement_reads").select("*").order("read_at", { ascending: false }),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(350),
      supabase.from("leave_requests").select("*").eq("clinic", clinic).order("created_at", { ascending: false }),
      supabase.from("schedules").select("*").eq("clinic", clinic).eq("month_key", selectedMonth).order("work_date", { ascending: true }),
      supabase.from("shift_swap_requests").select("*").eq("clinic", clinic).order("created_at", { ascending: false }).limit(80),
      supabase.from("ai_usage_logs").select("*").eq("clinic", clinic).order("created_at", { ascending: false }).limit(30)
    ]);
    const [p,pe,ap,wo,t,s,ds,a,r,au,l,sc,sw,ai] = res;
    const warn = (name, result) => { if (result.error) console.warn(`${name} not ready`, result.error.message); };
    warn("patient_events", pe); warn("appointments_mock", ap); warn("work_orders", wo); warn("demo_staff", ds); warn("shift_swap_requests", sw);
    if (p.error) setBootError(p.error.message);
    setPatients(p.data || []);
    setPatientEvents(pe.error ? [] : (pe.data || []));
    setAppointments(ap.error ? [] : (ap.data || []));
    setWorkOrders(wo.error ? [] : (wo.data || []));
    setTasks(t.data || []);
    setStaff(s.data || []);
    setDemoStaff(ds.error ? [] : (ds.data || []));
    setAnnouncements(a.data || []);
    setReads(r.data || []);
    setAudit(au.data || []);
    setLeave(l.data || []);
    setSchedule(sc.data || []);
    setShiftSwaps(sw.error ? [] : (sw.data || []));
    setAiLogs(ai.data || []);
  }

  async function logAudit(action, module, targetType, detail = "") {
    if (!supabase || !session?.user) return;
    await supabase.from("audit_logs").insert({
      actor_id: session.user.id,
      actor_email: session.user.email,
      actor_role: profile?.role || "uninitialized",
      clinic,
      action,
      module,
      target_type: targetType,
      detail,
      user_agent: navigator.userAgent.slice(0, 180)
    });
  }

  async function generateDemoData(count = 20, reset = false) {
    if (reset) {
      await supabase.from("tasks").delete().eq("clinic", clinic);
      await supabase.from("patients_mock").delete().eq("clinic", clinic);
    }
    const fakePatients = Array.from({ length: count }, (_, i) => makeFakePatient(i + 1, clinic));
    const { data: inserted, error } = await supabase.from("patients_mock").insert(fakePatients).select("*");
    if (error) { flash(error.message); return; }
    const fakeTasks = inserted.flatMap((p, idx) => idx % 3 === 0 ? [makeFakeTask(p, session.user.id)] : []);
    if (fakeTasks.length) await supabase.from("tasks").insert(fakeTasks);
    await logAudit(reset ? "重置並產生示範資料" : "追加示範資料", "Demo", "patients_mock", `${count} 筆`);
    flash(`已產生 ${count} 筆示範患者`);
    loadAll();
  }

  async function createPatientFromForm(form) {
    const payload = {
      chart_no: form.chart_no || `D-${Date.now().toString().slice(-6)}`,
      name: form.name || "未命名患者",
      gender: form.gender || "未填",
      age: Number(form.age || 0) || null,
      birthday: form.birthday || null,
      phone_masked: form.phone_masked || "09**-***-***",
      clinic,
      disease: form.disease || "未分類",
      current_status: form.current_status || "已報到",
      appointment_time: form.appointment_time || "09:00",
      seat_no: form.seat_no || "-",
      therapist: form.therapist || "未指派",
      doctor: form.doctor || "未指派",
      treatment_minutes: Number(form.treatment_minutes || 30),
      home_status: form.home_status || "未諮詢",
      garment_status: form.garment_status || "無",
      risk_level: form.risk_level || "一般",
      note: form.note || "",
      created_by: session.user.id
    };
    const { data, error } = await supabase.from("patients_mock").insert(payload).select("*").single();
    if (error) { flash(error.message); return null; }
    await addPatientEvent(data.id, form.mode || "新增個案", `${form.mode || "新增個案"}：${payload.name}`, form.note || "由患者管理表單建立。", { silent: true });
    await logAudit("患者建檔", "Patient", "patients_mock", `${payload.name}｜${form.mode || "新增個案"}`);
    flash(`${form.mode || "新增個案"}已建立`);
    loadAll();
    return data;
  }

  async function addPatientEvent(patientId, eventType, title, content, options = {}) {
    const patient = patients.find(p => p.id === patientId);
    const payload = {
      patient_id: patientId,
      event_type: eventType,
      title: title || eventType,
      content: content || "",
      clinic,
      created_by: session.user.id,
      created_by_email: profile?.email || session.user.email
    };
    const { error } = await supabase.from("patient_events").insert(payload);
    if (error) { flash(error.message.includes("patient_events") ? "請先執行 supabase/v14_patch.sql 建立 patient_events" : error.message); return; }
    if (["列管事項","客服關懷","居家諮詢","複診登記"].includes(eventType)) {
      await supabase.from("tasks").insert({
        patient_id: patientId,
        title: `${eventType}：${patient?.name || "患者"}`,
        task_type: eventType,
        priority: eventType === "列管事項" ? "高" : "中",
        status: "待處理",
        clinic,
        group_name: eventType === "客服關懷" ? "客服組" : eventType === "居家諮詢" ? "健管組" : "主管組",
        owner_id: session.user.id,
        due_date: date,
        content: content || `${eventType}待處理。`
      });
    }
    if (!options.silent) flash(`${eventType}紀錄已新增`);
    await logAudit("新增患者事件", "Patient", "patient_events", `${eventType}｜${patient?.name || patientId}`);
    if (!options.silent) loadAll();
  }

  async function nextStatus(patient, finalDone = false) {
    if (patient.current_status === "已完診") return;
    const idx = statuses.indexOf(patient.current_status);
    const next = finalDone ? "已完診" : statuses[Math.min(idx + 1, statuses.length - 1)];
    await supabase.from("patients_mock").update({ current_status: next, progress: next === "已完診" ? 100 : Math.min(100, Number(patient.progress || 0) + 16) }).eq("id", patient.id);
    await supabase.from("patient_events").insert({
      patient_id: patient.id,
      event_type: finalDone ? "完診紀錄" : "流程紀錄",
      title: finalDone ? `完診：${patient.current_status}` : `完成：${patient.current_status}`,
      content: finalDone ? `患者由 ${patient.current_status} 直接結束本次就診。` : `由 ${patient.current_status} 更新為 ${next}。此紀錄用於追蹤每次治療／流程站點變化。`,
      clinic,
      created_by: session.user.id,
      created_by_email: profile?.email || session.user.email
    });
    await logAudit(finalDone ? "完診離開" : "完成流程站點", "今日流程", "patients_mock", `${patient.name}: ${patient.current_status} -> ${next}`);
    loadAll();
  }

  async function createAppointment(form) {
    const patient = patients.find(p => p.id === form.patient_id);
    const payload = {
      patient_id: form.patient_id || null,
      patient_name: patient?.name || form.patient_name || "未指定患者",
      appointment_type: form.appointment_type,
      visit_type: form.visit_type,
      appointment_date: form.appointment_date || date,
      appointment_time: form.appointment_time || "09:00",
      clinic,
      doctor: form.doctor || "未指派",
      therapist: form.therapist || "未指派",
      status: form.status || "已預約",
      cancel_reason: form.cancel_reason || "",
      note: form.note || "",
      created_by: session.user.id
    };
    const { error } = await supabase.from("appointments_mock").insert(payload);
    if (error) { flash(error.message.includes("appointments_mock") ? "請先執行 supabase/v14_patch.sql 建立 appointments_mock" : error.message); return; }
    if (form.patient_id) {
      await supabase.from("patients_mock").update({ current_status: form.status === "未預約報到" ? "已報到" : "等待看診", appointment_time: payload.appointment_time }).eq("id", form.patient_id);
      await addPatientEvent(form.patient_id, form.visit_type, `${form.visit_type}：${payload.appointment_date} ${payload.appointment_time}`, payload.note || "由掛號預約建立。", { silent: true });
    }
    await logAudit("建立掛號預約", "Registration", "appointments_mock", `${payload.patient_name}｜${payload.visit_type}`);
    flash("掛號／預約資料已建立");
    loadAll();
  }

  async function createWorkOrder(form) {
    const patient = patients.find(p => p.id === form.patient_id);
    const payload = {
      patient_id: form.patient_id || null,
      patient_name: patient?.name || form.patient_name || "未指定患者",
      order_type: form.order_type || "客服關懷",
      title: form.title || `${form.order_type}：${patient?.name || "患者"}`,
      status: form.status || "待處理",
      priority: form.priority || "中",
      clinic,
      group_name: form.group_name || "客服組",
      owner_name: form.owner_name || "未指派",
      due_date: form.due_date || date,
      content: form.content || "",
      created_by: session.user.id
    };
    const { error } = await supabase.from("work_orders").insert(payload);
    if (error) { flash(error.message.includes("work_orders") ? "請先執行 supabase/v14_patch.sql 建立 work_orders" : error.message); return; }
    await supabase.from("tasks").insert({
      patient_id: form.patient_id || null,
      title: payload.title,
      task_type: payload.order_type,
      priority: payload.priority,
      status: payload.status,
      clinic,
      group_name: payload.group_name,
      owner_id: session.user.id,
      due_date: payload.due_date,
      content: payload.content
    });
    if (form.patient_id) await addPatientEvent(form.patient_id, payload.order_type, payload.title, payload.content, { silent: true });
    await logAudit("建立照護工單", "CareOps", "work_orders", `${payload.order_type}｜${payload.patient_name}`);
    flash("照護／工單已建立");
    loadAll();
  }

  async function completeTask(task) {
    await supabase.from("tasks").update({ status: "已完成", completed_at: new Date().toISOString() }).eq("id", task.id);
    await logAudit("完成任務", "Task", "tasks", task.title);
    loadAll();
  }

  async function addTask() {
    await supabase.from("tasks").insert({
      title: "手動新增雲端任務",
      task_type: "照會聯繫",
      priority: "中",
      status: "待處理",
      clinic,
      group_name: profile?.group_name || "待設定",
      owner_id: session.user.id,
      due_date: date,
      content: "多人雲端互動測試用任務。"
    });
    await logAudit("新增任務", "Task", "tasks", "手動新增雲端任務");
    loadAll();
  }

  async function addAnnouncement(form) {
    const payload = {
      title: form.title || "未命名公告",
      content: form.content || "公告內容待補充。",
      scope: form.scope,
      clinic: form.scope === "總公司" ? null : clinic,
      group_name: form.scope === "組別" ? form.group_name : null,
      required_read: !!form.required_read,
      created_by: session.user.id
    };
    const { error } = await supabase.from("announcements").insert(payload);
    if (error) { flash(error.message); return; }
    await logAudit("新增公告", "Announcement", "announcements", `${payload.scope}:${payload.title}`);
    flash("公告已建立");
    loadAll();
  }

  async function readAnnouncement(announcement) {
    const already = reads.some(r => r.announcement_id === announcement.id && r.user_id === session.user.id);
    if (already) return;
    await supabase.from("announcement_reads").insert({ announcement_id: announcement.id, user_id: session.user.id, user_email: profile.email });
    await logAudit("公告簽收", "Announcement", "announcements", announcement.title);
    loadAll();
  }

  async function updateRole(userId, role) {
    await supabase.from("profiles").update({ role }).eq("id", userId);
    await logAudit("變更角色權限", "Staff", "profiles", `${userId} -> ${role}`);
    loadAll();
  }

  async function updateProfileField(userId, field, value) {
    await supabase.from("profiles").update({ [field]: value }).eq("id", userId);
    await logAudit("變更人員資料", "Staff", "profiles", `${userId} ${field} -> ${value}`);
    loadAll();
  }

  async function seedDemoStaff() {
    const rows = demoStaffSeed.flatMap(([groupName, title, role, names]) => names.map(name => ({ full_name: name, title, role, group_name: groupName, default_clinic: clinic, status: "active" })));
    await supabase.from("demo_staff").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error } = await supabase.from("demo_staff").insert(rows);
    if (error) { flash(error.message.includes("demo_staff") ? "請先執行 supabase/v14_patch.sql 建立 demo_staff" : error.message); return; }
    await logAudit("建立虛擬員工", "Staff", "demo_staff", `${rows.length} 筆`);
    flash("已建立各組虛擬員工");
    loadAll();
  }

  async function updateDemoStaff(id, field, value) {
    await supabase.from("demo_staff").update({ [field]: value }).eq("id", id);
    await logAudit("調整虛擬員工", "Staff", "demo_staff", `${field} -> ${value}`);
    loadAll();
  }

  async function addLeave(form) {
    const startDate = form.start_date || date;
    const endDate = form.end_date || startDate;
    const key = startDate.slice(0, 7);
    const delegateName = form.delegate_name || "未指定代理人";
    const periodText = `${startDate} ${form.start_time || "09:00"} - ${endDate} ${form.end_time || "18:00"}`;
    await supabase.from("leave_requests").insert({
      applicant_id: session.user.id,
      applicant_name: profile.full_name,
      leave_type: form.leave_type || "特休",
      request_kind: form.request_kind || "請假",
      period_text: periodText,
      start_date: startDate,
      end_date: endDate,
      start_time: form.start_time || "09:00",
      end_time: form.end_time || "18:00",
      reason: form.reason || "",
      month_key: key,
      delegate_name: delegateName,
      delegate_status: delegateName === "未指定代理人" ? "未指定" : "待代理人同意",
      approval_status: "待主管審核",
      progress: 25,
      clinic
    });
    await logAudit("新增請假／卡位／調班申請", "Leave", "leave_requests", `${profile.full_name}｜${form.request_kind || "請假"}｜${periodText}`);
    flash("申請已送出，待代理人與主管審核");
    loadAll();
  }

  async function updateLeaveRequest(row, updates, message) {
    await supabase.from("leave_requests").update(updates).eq("id", row.id);
    await logAudit(message || "更新請假代理流程", "Leave", "leave_requests", `${row.applicant_name}｜${row.period_text}`);
    loadAll();
  }

  async function approveLeave(row) {
    const start = row.start_date || String(row.period_text || "").slice(0, 10) || date;
    const key = row.month_key || start.slice(0, 7);
    await supabase.from("leave_requests").update({
      approval_status: "主管已核准",
      progress: 100,
      manager_approval_at: new Date().toISOString()
    }).eq("id", row.id);

    await supabase.from("schedules").insert({
      work_date: start,
      month_key: key,
      staff_name: row.applicant_name,
      group_name: "請假／卡位",
      shift_name: `${row.request_kind || "請假"}：${row.leave_type || ""}`,
      hours: 0,
      clinic
    });

    if (row.delegate_name && !["未指定代理人", "未指定"].includes(row.delegate_name)) {
      await supabase.from("schedules").insert({
        work_date: start,
        month_key: key,
        staff_name: row.delegate_name,
        group_name: "代理",
        shift_name: `代理：${row.applicant_name}`,
        hours: 0,
        clinic
      });
    }

    await logAudit("主管核准並寫入班表", "Leave", "leave_requests", `${row.applicant_name}｜${row.delegate_name}`);
    flash("主管已核准，並已寫入班表／代理資訊");
    loadAll();
  }

  async function seedMonthSchedule() {
    const people = demoStaff.length ? demoStaff.slice(0, 18) : staff.length ? staff.slice(0, 10) : [{ full_name: profile.full_name, group_name: profile.group_name }];
    const rows = [];
    const dim = daysInMonth(selectedMonth);
    for (let d = 1; d <= dim; d++) {
      people.forEach((p) => rows.push({
        work_date: ymDate(selectedMonth, d),
        month_key: selectedMonth,
        staff_name: p.full_name,
        group_name: p.group_name || "待設定",
        shift_name: ["早班 09:00-13:00","午班 13:00-17:00","晚班 17:00-21:00","休"][Math.floor(Math.random()*4)],
        hours: [0,4,4,8][Math.floor(Math.random()*4)],
        clinic
      }));
    }
    await supabase.from("schedules").delete().eq("clinic", clinic).eq("month_key", selectedMonth);
    await supabase.from("schedules").insert(rows);
    await logAudit("產生月排班", "Schedule", "schedules", `${clinic} ${selectedMonth}`);
    loadAll();
  }

  async function updateScheduleCell(rowId, taskGroup, taskNote) {
    await supabase.from("schedules").update({ task_group: taskGroup, task_note: taskNote }).eq("id", rowId);
    await logAudit("更新班表任務指派", "Schedule", "schedules", `${taskGroup}｜${taskNote}`);
    flash("班表任務已更新");
    loadAll();
  }

  async function addShiftSwap() {
    const people = demoStaff.length ? demoStaff : [{ full_name: profile.full_name }];
    const requester = people[Math.floor(Math.random()*people.length)]?.full_name || profile.full_name;
    const target = people[Math.floor(Math.random()*people.length)]?.full_name || "未指定";
    await supabase.from("shift_swap_requests").insert({
      requester_name: requester,
      target_name: target,
      request_date: date,
      original_shift: "早班 09:00-13:00",
      requested_shift: "晚班 17:00-21:00",
      status: "待對方同意",
      reason: "Demo 調班申請",
      clinic,
      created_by: session.user.id
    });
    await logAudit("新增調班申請", "Schedule", "shift_swap_requests", `${requester} -> ${target}`);
    loadAll();
  }

  async function updateWorkOrder(id, field, value) {
    await supabase.from("work_orders").update({ [field]: value }).eq("id", id);
    await logAudit("更新工單", "CareOps", "work_orders", `${field} -> ${value}`);
    loadAll();
  }

  function visibleTasks(allTasks) {
    if (isManager(profile?.role)) return allTasks;
    const group = profile?.group_name || "";
    return allTasks.filter(t => t.group_name === group || t.owner_id === session?.user?.id);
  }

  function sortedTasks(allTasks) {
    const base = visibleTasks(allTasks).filter(t => t.status !== "已完成");
    return [...base].sort((a,b) => {
      if (taskViewMode === "priority") return (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9);
      if (taskViewMode === "status") return (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9);
      return String(a.group_name || "").localeCompare(String(b.group_name || ""), "zh-Hant");
    });
  }

  const filteredPatients = useMemo(() => filterRows(patients, query, ["name","chart_no","disease","current_status"]), [patients, query]);
  const filteredTasks = useMemo(() => filterRows(tasks, query, ["title","task_type","status","group_name"]), [tasks, query]);

  if (!isConfigured) return <ConfigMissing />;
  if (!session) return <Login bootError={bootError} signIn={signInWithGoogle} />;
  if (!profile) return <div className="loading">正在建立 Google 帳號綁定與人員檔...</div>;
  if (!workClinicConfirmed) return <ClinicGate profile={profile} clinic={clinic} setClinic={setClinic} confirm={() => setWorkClinicConfirmed(true)} signOut={signOut} />;

  return <main className="app">
    <div className="watermark" />
    {toast && <div className="toast">{toast}</div>}
    {selectedPatient && <PatientModal patient={selectedPatient} events={patientEvents.filter(e => e.patient_id === selectedPatient.id)} onClose={() => setSelectedPatient(null)} nextStatus={nextStatus} addPatientEvent={addPatientEvent} />}
    <header className="topbar">
      <div className="brand"><button className="icon" onClick={() => setMobileOpen(!mobileOpen)}>☰</button><div><strong>{APP_TITLE}</strong><small><span className="versionBadge">V16</span> 大版整合：現場＋照護＋行政</small></div></div>
      <details className="filterPanel"><summary>搜尋與篩選 / Filter</summary><div className="filterGrid filterGridTwo">
        <label>日期 / Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>搜尋 / Search<input value={query} onChange={e => setQuery(e.target.value)} placeholder="患者、任務、公告..." /></label>
      </div></details>
      <div className="userbox"><div><strong>{profile.full_name}</strong><small>{roles[profile.role]}｜{profile.group_name || "未設定組別"}｜今日院區：{clinic}</small><small>{profile.email}</small></div><div className="userActions"><button onClick={() => setWorkClinicConfirmed(false)} className="textbtn">更換院區</button><button onClick={signOut} className="textbtn">登出</button></div></div>
    </header>

    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <MenuGroup title="今日現場 / Today Ops" items={[["dashboard","工作指揮中心"],["flow","今日流程看板"],["registration","掛號與初複診"],["patients","患者管理"]]} view={view} setView={setAuthorizedView} can={can}/>
      <MenuGroup title="個案照護 / Care" items={[["careOps","居家／製衣／客服"],["tasks","任務中心"],["ai","OpenAI 行政助理"]]} view={view} setView={setAuthorizedView} can={can}/>
      <MenuGroup title="行政營運 / Admin" items={[["reports","營運報表"],["staff","人員與權限"],["leave","請假與代理"],["schedule","月排班與調班"],["announcements","公告與簽收"],["audit","數位足跡稽核"],["moduleMap","功能整併總覽"],["settings","Demo 管理設定"]]} view={view} setView={setAuthorizedView} can={can}/>
    </aside>

    <section className="content">
      {view === "dashboard" && <Dashboard patients={filteredPatients} tasks={sortedTasks(filteredTasks)} allTasks={filteredTasks} announcements={announcements} reads={reads} profile={profile} taskViewMode={taskViewMode} setTaskViewMode={setTaskViewMode} readAnnouncement={readAnnouncement} workOrders={workOrders} appointments={appointments} leave={leave} go={setAuthorizedView}/>}
      {view === "flow" && <Flow patients={filteredPatients} nextStatus={nextStatus} openPatient={setSelectedPatient} />}
      {view === "registration" && <Registration patients={filteredPatients} appointments={appointments} createAppointment={createAppointment} />}
      {view === "patients" && <Patients patients={filteredPatients} patientEvents={patientEvents} createPatientFromForm={createPatientFromForm} addPatientEvent={addPatientEvent} openPatient={setSelectedPatient} />}
      {view === "careOps" && <CareOps patients={filteredPatients} workOrders={workOrders} createWorkOrder={createWorkOrder} updateWorkOrder={updateWorkOrder} />}
      {view === "tasks" && <Tasks tasks={filteredTasks} addTask={addTask} completeTask={completeTask} />}
      {view === "ai" && <AIHelper profile={profile} clinic={clinic} patients={patients} tasks={tasks} announcements={announcements} schedule={schedule} leave={leave} aiLogs={aiLogs} logAudit={logAudit} loadAll={loadAll}/>}
      {view === "reports" && <Reports patients={patients} tasks={tasks} workOrders={workOrders} appointments={appointments} schedule={schedule} announcements={announcements} reads={reads} />}
      {view === "staff" && <Staff staff={staff} demoStaff={demoStaff} profile={profile} updateRole={updateRole} updateProfileField={updateProfileField} seedDemoStaff={seedDemoStaff} updateDemoStaff={updateDemoStaff} />}
      {view === "leave" && <Leave leave={leave} profile={profile} demoStaff={demoStaff} staff={staff} addLeave={addLeave} updateLeaveRequest={updateLeaveRequest} approveLeave={approveLeave} />}
      {view === "schedule" && <Schedule schedule={schedule} shiftSwaps={shiftSwaps} addShiftSwap={addShiftSwap} seedMonthSchedule={seedMonthSchedule} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} profile={profile} demoStaff={demoStaff} updateScheduleCell={updateScheduleCell} />}
      {view === "announcements" && <Announcements announcements={announcements} reads={reads} profile={profile} addAnnouncement={addAnnouncement} readAnnouncement={readAnnouncement} />}
      {view === "audit" && <Audit audit={audit} />}
      {view === "moduleMap" && <ModuleMap />}
      {view === "settings" && <Settings generateDemoData={generateDemoData} seedDemoStaff={seedDemoStaff} />}
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
function Login({ bootError, signIn }) { return <div className="loginPage"><div className="loginCard"><div className="mark">HIS</div><h1>{APP_TITLE}</h1><p>多人雲端互動 Demo：Google 登入 + Supabase + OpenAI 行政助理。</p><div className="notice"><b>Demo 邊界</b><p>不使用真實病患資料。所有患者、任務、公告、排班、請假皆為示範資料。</p></div><button className="primary full" onClick={signIn}>使用 Google 登入 / Sign in with Google</button>{bootError && <p className="error">{bootError}</p>}<small>最高系統管理員信箱：{ADMIN_EMAIL}</small></div></div>; }

function ClinicGate({ profile, clinic, setClinic, confirm, signOut }) {
  const [selected, setSelected] = useState(clinic || profile.default_clinic || "台北");
  return <div className="loginPage"><div className="loginCard">
    <div className="mark">HIS</div>
    <h1>選擇今日上班院區</h1>
    <p>請先選擇今天要進入的院區，系統會依此載入該院區的預約、患者、任務、公告與排班資料。</p>
    <label className="gateLabel">今日院區 / Today Clinic
      <select value={selected} onChange={e=>setSelected(e.target.value)}>
        {clinics.map(c=><option key={c}>{c}</option>)}
      </select>
    </label>
    <div className="notice">
      <b>{profile.full_name}</b>
      <p>{roles[profile.role]}｜{profile.group_name || "未設定組別"}｜{profile.email}</p>
    </div>
    <button className="primary full" onClick={()=>{ setClinic(selected); confirm(); }}>進入 {selected} 院區</button>
    <button className="textbtn full" onClick={signOut}>登出</button>
  </div></div>;
}

function MenuGroup({ title, items, view, setView, can }) { return <details open><summary>{title}</summary>{items.map(([id,label]) => <button key={id} disabled={!can(id)} className={`nav ${view===id ? "active" : ""}`} onClick={() => setView(id)}>{label}</button>)}</details>; }
function PageTitle({ title, desc, actions }) { return <div className="pageTitle"><div><h2>{title}</h2><p>{desc}</p></div><div className="actions">{actions}</div></div>; }
function Card({ title, children }) { return <div className="card"><h3>{title}</h3>{children}</div>; }
function Metric({ title, value, tone }) { return <div className={`metric ${tone || ""}`}><span>{title}</span><strong>{value}</strong></div>; }
function badge(text, tone="gray") { return <span className={`badge ${tone}`}>{text}</span>; }
function progress(v) { return <><div className="progress"><span style={{ width: `${v || 0}%` }} /></div><small>{v || 0}%</small></>; }
function filterRows(rows, q, fields) { const s = String(q || "").trim().toLowerCase(); if (!s) return rows || []; return (rows || []).filter(r => fields.some(f => String(r[f] || "").toLowerCase().includes(s))); }
function DataTable({ headers, rows, compact }) { return <div className={`tableWrap ${compact ? "compact" : ""}`}><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i) => <tr key={i}>{r.map((c,j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>; }

function Dashboard({ patients, tasks, allTasks, announcements, reads, profile, taskViewMode, setTaskViewMode, readAnnouncement, workOrders, appointments, leave, go }) {
  const high = tasks.filter(t => t.priority === "高" && t.status !== "已完成").length;
  const unreadList = announcements.filter(a => !reads.some(r => r.announcement_id === a.id && r.user_id === profile.id));
  const pending = tasks.filter(t => t.status !== "已完成");
  const relevantLeave = isManager(profile.role) ? leave.filter(l => l.approval_status !== "主管已核准" && l.cancel_status !== "已取消") : leave.filter(l => l.applicant_name === profile.full_name || l.delegate_name === profile.full_name);
  return <>
    <PageTitle title="工作指揮中心" desc="儀表板可直接點擊，跳到對應模組；資訊只揭露與本人或主管職責相關的內容。" />
    <div className="compactMetrics clickableMetrics">
      <MetricButton title="今日患者" value={patients.length} onClick={()=>go("patients")}/>
      <MetricButton title="預約掛號" value={appointments.length} onClick={()=>go("registration")}/>
      <MetricButton title="照護工單" value={workOrders.filter(w=>w.status!=="已完成").length} onClick={()=>go("careOps")}/>
      <MetricButton title="高優先" value={high} tone="red" onClick={()=>go("tasks")}/>
      <MetricButton title="休假／代理待處理" value={relevantLeave.length} tone="yellow" onClick={()=>go("leave")}/>
      <MetricButton title="未簽收公告" value={unreadList.length} tone="yellow" onClick={()=>go("announcements")}/>
    </div>
    <div className="dashboardGrid">
      <Card title={isManager(profile.role) ? "主管待辦總覽" : `${profile.group_name || "我的組別"}待辦`}>
        {isManager(profile.role) ? <GroupPendingOverview tasks={allTasks} /> : <PersonalGroupOverview tasks={pending} profile={profile} />}
      </Card>
      <Card title="今日必辦">
        <div className="miniToolbar"><label>排序方式<select value={taskViewMode} onChange={e => setTaskViewMode(e.target.value)}><option value="priority">依高中低優先</option><option value="status">依處理狀態</option><option value="group">依組別</option></select></label></div>
        <CollapsibleTaskList tasks={pending} mode={taskViewMode} limit={2}/>
        {!pending.length && <p className="muted">目前無待辦。可到 Demo 管理設定產生示範資料。</p>}
      </Card>
      <Card title="休假／代理／審核提醒"><LeaveDashboard leave={relevantLeave} profile={profile} /></Card>
      <Card title="公告提醒"><AnnouncementPreview announcements={unreadList} readAnnouncement={readAnnouncement} /></Card>
    </div>
  </>;
}
function MetricButton({ title, value, tone, onClick }) {
  return <button className={`metric metricButton ${tone || ""}`} onClick={onClick}><span>{title}</span><strong>{value}</strong><small>點擊查看</small></button>;
}

function LeaveDashboard({ leave, profile }) {
  if (!leave.length) return <p className="muted">目前沒有與你相關的休假、代理或主管審核事項。</p>;
  const first = leave.slice(0,2), rest = leave.slice(2);
  const item = (l) => <div className="taskLine" key={l.id}>
    {badge(l.request_kind || "請假", "yellow")}
    <b>{l.applicant_name}｜{l.period_text}</b>
    <small>代理：{l.delegate_name || "未指定"}｜代理狀態：{l.delegate_status}｜主管審核：{l.approval_status}</small>
  </div>;
  return <>{first.map(item)}{rest.length>0 && <details className="innerDetails"><summary>展開其餘 {rest.length} 筆</summary>{rest.map(item)}</details>}</>;
}

function GroupPendingOverview({ tasks }) {
  const pending = tasks.filter(t => t.status !== "已完成");
  const rows = groups.map(g => ({ group:g, count: pending.filter(t=>t.group_name===g).length, high: pending.filter(t=>t.group_name===g && t.priority==="高").length })).sort((a,b)=>b.count-a.count);
  const first = rows.slice(0,2), rest = rows.slice(2);
  const render = (r) => <div className="groupStat" key={r.group}><span>{r.group}</span><strong>{r.count}</strong><small>高優先 {r.high}</small></div>;
  return <div className="groupOverview">{first.map(render)}{rest.length>0 && <details className="compactDetails"><summary>展開其餘 {rest.length} 組</summary><div className="groupOverview">{rest.map(render)}</div></details>}</div>;
}
function PersonalGroupOverview({ tasks, profile }) { const high=tasks.filter(t=>t.priority==="高").length; return <div className="groupOverview"><div className="groupStat"><span>所屬組別</span><strong>{profile.group_name || "待設定"}</strong><small>{roles[profile.role]}</small></div><div className="groupStat"><span>未完成</span><strong>{tasks.length}</strong><small>本組或指派給我</small></div><div className="groupStat"><span>高優先</span><strong>{high}</strong><small>需先處理</small></div></div>; }
function CollapsibleTaskList({ tasks, mode, limit=2 }) {
  const grouped = {};
  tasks.forEach(t => { const key = mode === "priority" ? `${t.priority || "未分級"}優先` : mode === "status" ? (t.status || "未分狀態") : (t.group_name || "未分組"); grouped[key] = grouped[key] || []; grouped[key].push(t); });
  const keys = Object.keys(grouped).sort((a,b)=> mode === "priority" ? (priorityOrder[a.replace("優先","")] || 9) - (priorityOrder[b.replace("優先","")] || 9) : a.localeCompare(b,"zh-Hant"));
  return <div className="accordionList">{keys.map(key=>{ const list=grouped[key]; const first=list.slice(0,limit), rest=list.slice(limit); return <details key={key} className="taskFold"><summary>{key}<span>{list.length}</span></summary>{first.map(t=><TaskLine key={t.id} task={t}/>)}{rest.length>0 && <details className="innerDetails"><summary>展開剩餘 {rest.length} 筆</summary>{rest.map(t=><TaskLine key={t.id} task={t}/>)}</details>}</details>})}</div>;
}
function TaskLine({ task }) { return <div className="taskLine"><span className={`badge ${task.priority==="高"?"red":task.priority==="中"?"yellow":"gray"}`}>{task.priority}</span><b>{task.title}</b><small>{task.group_name}｜{task.status}</small></div>; }
function AnnouncementPreview({ announcements, readAnnouncement }) {
  if (!announcements.length) return <p className="muted">目前沒有未簽收公告。可至「行政營運 → 公告與簽收」建立院區公告、組別公告或總公司公告。</p>;
  const first=announcements.slice(0,2), rest=announcements.slice(2);
  const item = (a) => <details className="noticeFold" key={a.id}><summary>{badge(a.scope,"yellow")}<b>{a.title}</b></summary><p>{a.content || "公告內容待補充。"}</p><button className="secondary" onClick={()=>readAnnouncement(a)}>我已閱讀並簽收</button></details>;
  return <div>{first.map(item)}{rest.length>0 && <details className="compactDetails"><summary>展開其餘 {rest.length} 則公告</summary>{rest.map(item)}</details>}</div>;
}

function Flow({ patients, nextStatus, openPatient }) { return <><PageTitle title="今日流程看板" desc="每個流程只顯示前兩位，其餘折疊；完成會留下流程紀錄，可依情況直接完診。" /><div className="kanban">{statuses.map(s => <PatientLane key={s} status={s} patients={patients.filter(p=>p.current_status===s)} nextStatus={nextStatus} openPatient={openPatient}/>)}</div></>; }
function PatientLane({ status, patients, nextStatus, openPatient }) { const first=patients.slice(0,2), rest=patients.slice(2); const card=p=><PatientCard key={p.id} p={p} nextStatus={nextStatus} openPatient={openPatient}/>; return <div className="lane"><h3>{status}<span>{patients.length}</span></h3>{first.map(card)}{rest.length>0 && <details className="innerDetails"><summary>展開其餘 {rest.length} 人</summary>{rest.map(card)}</details>}</div>; }
function PatientCard({ p, nextStatus, openPatient }) { return <div className="pCard"><button className="cardOpen" onClick={()=>openPatient(p)}><b>{p.name}</b><small>{p.chart_no}｜{p.disease}｜座號 {p.seat_no}</small><em className="tapHint">點擊查看掛號詳細資料</em></button>{p.current_status !== "已完診" && <div className="cardActions"><button className="secondary" title="完成此流程站點並留下紀錄。" onClick={() => nextStatus(p,false)}>完成</button><button className="textbtn" title="不再進入後續流程，直接完診。" onClick={() => nextStatus(p,true)}>完診</button></div>}</div>; }

function PatientModal({ patient, events = [], onClose, nextStatus, addPatientEvent }) {
  const [memo, setMemo] = useState("");
  const submitEvent = (type) => { addPatientEvent(patient.id, type, `${type}：${patient.name}`, memo || `${type}紀錄。`); setMemo(""); };
  return <div className="modalBackdrop" onClick={onClose}><div className="modalCard wideModal" onClick={e=>e.stopPropagation()}>
    <div className="modalHead"><h3>{patient.name}｜{patient.chart_no}</h3><button className="textbtn" onClick={onClose}>關閉</button></div>
    <div className="patientSections">{patientFieldGroups.map(g=><details key={g.title} open><summary>{g.title}</summary><div className="fieldGrid">{g.fields.map(f=><div className="field" key={f}><span>{fieldLabel[f]||f}</span><strong>{String(patient[f] ?? "-")}</strong></div>)}</div></details>)}</div>
    <div className="card innerCard"><h3>掛號詳細資料與紀錄新增</h3><textarea className="wideText" value={memo} onChange={e=>setMemo(e.target.value)} placeholder="可輸入初診、複診、客服關懷、列管、居家諮詢等備註。"/><div className="moduleActions">{["初診建檔","複診登記","客服關懷","居家諮詢","列管事項","備註紀錄"].map(t=><button key={t} className="secondary" onClick={()=>submitEvent(t)}>{t}</button>)}<button className="primary" onClick={()=>nextStatus(patient,false)}>完成</button><button className="secondary" onClick={()=>nextStatus(patient,true)}>直接完診</button></div></div>
    <div className="card innerCard"><h3>患者事件紀錄</h3>{!events.length && <p className="muted">尚無事件紀錄。</p>}<div className="eventTimeline">{events.slice(0,8).map(ev=><div className="eventItem" key={ev.id}>{badge(ev.event_type)}<b>{ev.title}</b><small>{new Date(ev.created_at).toLocaleString("zh-TW")}｜{ev.created_by_email || "系統"}</small><p>{ev.content}</p></div>)}</div></div>
  </div></div>;
}

function Registration({ patients, appointments, createAppointment }) {
  const [form,setForm] = useState({ patient_id:"", patient_name:"", appointment_type:"現場掛號", visit_type:"初診", appointment_date:new Date().toISOString().slice(0,10), appointment_time:"09:00", doctor:"未指派", therapist:"未指派", status:"已預約", cancel_reason:"", note:"" });
  const submit = () => createAppointment(form);
  return <><PageTitle title="掛號與初複診" desc="整合初診、複診、未預約報到、取消原因與等待看診流程。" actions={<button className="primary" onClick={submit}>建立掛號／預約</button>} />
    <Card title="掛號預約表單"><div className="patientForm">
      <label>選擇患者<select value={form.patient_id} onChange={e=>setForm({...form,patient_id:e.target.value})}><option value="">未指定／手動輸入</option>{patients.map(p=><option key={p.id} value={p.id}>{p.chart_no}｜{p.name}</option>)}</select></label>
      <label>手動姓名<input value={form.patient_name} onChange={e=>setForm({...form,patient_name:e.target.value})} placeholder="未選患者時可填"/></label>
      <label>掛號類型<select value={form.appointment_type} onChange={e=>setForm({...form,appointment_type:e.target.value})}><option>現場掛號</option><option>預約掛號</option><option>未預約報到</option><option>取消／異動</option></select></label>
      <label>就診類型<select value={form.visit_type} onChange={e=>setForm({...form,visit_type:e.target.value})}><option>初診</option><option>複診</option><option>居家諮詢</option><option>檢查</option><option>拿藥</option></select></label>
      <label>日期<input type="date" value={form.appointment_date} onChange={e=>setForm({...form,appointment_date:e.target.value})}/></label>
      <label>時間<input value={form.appointment_time} onChange={e=>setForm({...form,appointment_time:e.target.value})}/></label>
      <label>醫師<input value={form.doctor} onChange={e=>setForm({...form,doctor:e.target.value})}/></label>
      <label>治療師<input value={form.therapist} onChange={e=>setForm({...form,therapist:e.target.value})}/></label>
      <label>狀態<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>已預約</option><option>已報到</option><option>等待看診</option><option>取消</option><option>未預約報到</option></select></label>
      <label className="wideField">取消原因／備註<textarea value={form.cancel_reason || form.note} onChange={e=>setForm({...form,cancel_reason:e.target.value,note:e.target.value})}/></label>
    </div></Card>
    <Card title="掛號預約列表"><DataTable headers={["日期","時間","患者","掛號類型","就診類型","狀態","醫師","備註"]} rows={appointments.map(a=>[a.appointment_date,a.appointment_time,a.patient_name,a.appointment_type,a.visit_type,a.status,a.doctor,a.note || a.cancel_reason])}/></Card>
  </>;
}

function Patients({ patients, patientEvents, createPatientFromForm, addPatientEvent, openPatient }) {
  const [mode,setMode]=useState("新增個案");
  const [form,setForm]=useState(defaultPatientForm);
  const [pid,setPid]=useState("");
  const [recordText,setRecordText]=useState("");
  const [localSearch,setLocalSearch]=useState("");
  const filtered=patients.filter(p=>!localSearch||JSON.stringify(p).includes(localSearch));
  const selected=patients.find(p=>p.id===pid)||filtered[0];
  const submitCreate=()=>{ createPatientFromForm({...form,mode}); setForm(defaultPatientForm); };
  const submitEvent=()=>{ if(selected){ addPatientEvent(selected.id,mode,`${mode}：${selected.name}`,recordText||`${mode}紀錄。`); setRecordText(""); } };
  const count=(id)=>patientEvents.filter(e=>e.patient_id===id).length;
  return <><PageTitle title="患者管理" desc="新增個案、初診建檔、複診登記、個案查詢、列管與客服關懷已整併為可操作流程。" />
    <div className="quickActions">{["新增個案","初診建檔","複診登記","個案資訊查詢","列管事項","客服關懷"].map(m=><button key={m} className={mode===m?"primary":"secondary"} onClick={()=>setMode(m)}>{m}</button>)}</div>
    <Card title={`${mode}作業`}>{(mode==="新增個案"||mode==="初診建檔") ? <div className="patientForm">
      <label>姓名<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>性別<select value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})}><option>女</option><option>男</option><option>未填</option></select></label><label>年齡<input type="number" value={form.age} onChange={e=>setForm({...form,age:e.target.value})}/></label><label>生日<input type="date" value={form.birthday} onChange={e=>setForm({...form,birthday:e.target.value})}/></label><label>電話遮罩<input value={form.phone_masked} onChange={e=>setForm({...form,phone_masked:e.target.value})} placeholder="09**-***-***"/></label><label>疾病／主訴<input value={form.disease} onChange={e=>setForm({...form,disease:e.target.value})}/></label><label>預約時間<input value={form.appointment_time} onChange={e=>setForm({...form,appointment_time:e.target.value})}/></label><label>醫師<input value={form.doctor} onChange={e=>setForm({...form,doctor:e.target.value})}/></label><label>治療師<input value={form.therapist} onChange={e=>setForm({...form,therapist:e.target.value})}/></label><label>風險<select value={form.risk_level} onChange={e=>setForm({...form,risk_level:e.target.value})}><option>一般</option><option>高關懷</option><option>合約異常</option></select></label><label className="wideField">備註<textarea value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label><button className="primary wideField" onClick={submitCreate}>建立{mode}</button>
    </div> : <div className="patientForm"><label className="wideField">選擇患者<select value={pid} onChange={e=>setPid(e.target.value)}>{filtered.map(p=><option key={p.id} value={p.id}>{p.chart_no}｜{p.name}｜{p.current_status}</option>)}</select></label><label className="wideField">紀錄內容<textarea value={recordText} onChange={e=>setRecordText(e.target.value)}/></label><button className="primary wideField" onClick={submitEvent}>新增{mode}紀錄</button></div>}</Card>
    <Card title="個案資訊查詢"><input className="wide" value={localSearch} onChange={e=>setLocalSearch(e.target.value)} placeholder="搜尋病歷號、姓名、疾病、流程狀態..." /><DataTable headers={["病歷號","姓名","性別","年齡","電話遮罩","疾病別","狀態","事件","操作"]} rows={filtered.map(p=>[p.chart_no,p.name,p.gender,p.age,maskPhone(p.phone_masked),p.disease,p.current_status,count(p.id),<button className="secondary" onClick={()=>openPatient(p)}>查看檔案</button>])}/></Card>
  </>;
}

function CareOps({ patients, workOrders, createWorkOrder, updateWorkOrder }) {
  const [form,setForm]=useState({ patient_id:"", order_type:"客服關懷", title:"", status:"待處理", priority:"中", group_name:"客服組", owner_name:"未指派", due_date:new Date().toISOString().slice(0,10), content:"" });
  const submit=()=>createWorkOrder(form);
  const groupByType = (type) => workOrders.filter(w=>w.order_type===type);
  return <><PageTitle title="居家／製衣／客服整合" desc="V13 功能已整併：居家諮詢、居家聯繫、居家動態、保健衣劃記、製衣工單、等待寄送、客服關懷與列管追蹤。" actions={<button className="primary" onClick={submit}>建立工單</button>} />
    <Card title="建立照護／物流／客服工單"><div className="patientForm">
      <label>患者<select value={form.patient_id} onChange={e=>setForm({...form,patient_id:e.target.value})}><option value="">未指定</option>{patients.map(p=><option key={p.id} value={p.id}>{p.chart_no}｜{p.name}</option>)}</select></label>
      <label>工單類型<select value={form.order_type} onChange={e=>setForm({...form,order_type:e.target.value})}>{workOrderTypes.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>優先<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>高</option><option>中</option><option>低</option></select></label>
      <label>負責組別<select value={form.group_name} onChange={e=>setForm({...form,group_name:e.target.value})}>{groups.map(g=><option key={g}>{g}</option>)}</select></label>
      <label>負責人<input value={form.owner_name} onChange={e=>setForm({...form,owner_name:e.target.value})}/></label>
      <label>期限<input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label>
      <label className="wideField">標題<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="未填則自動帶入工單類型與患者"/></label>
      <label className="wideField">內容<textarea value={form.content} onChange={e=>setForm({...form,content:e.target.value})}/></label>
    </div></Card>
    <div className="dashboardGrid">{["居家諮詢","保健衣劃記","製衣工單","等待寄送","客服關懷","列管追蹤"].map(type=><Card key={type} title={type}><DataTable compact headers={["患者","標題","狀態","優先","組別","操作"]} rows={groupByType(type).slice(0,8).map(w=>[w.patient_name,w.title,w.status,badge(w.priority,w.priority==="高"?"red":w.priority==="中"?"yellow":"gray"),w.group_name,<select value={w.status} onChange={e=>updateWorkOrder(w.id,"status",e.target.value)}><option>待處理</option><option>進行中</option><option>待審核</option><option>已完成</option></select>])}/>{groupByType(type).length>8 && <p className="muted">僅顯示前 8 筆。</p>}</Card>)}</div>
  </>;
}

function Tasks({ tasks, addTask, completeTask }) {
  const [priority, setPriority] = useState("");
  const [type, setType] = useState("");
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("");
  const [due, setDue] = useState("");
  const filtered = tasks.filter(t =>
    (!priority || t.priority === priority) &&
    (!type || t.task_type === type) &&
    (!group || t.group_name === group) &&
    (!status || t.status === status) &&
    (!due || t.due_date === due)
  );
  return <>
    <PageTitle title="任務中心" desc="可依優先、類型、組別、狀態、到期日篩選，避免資訊過量。" actions={<button className="primary" onClick={addTask}>新增雲端任務</button>} />
    <Card title="任務篩選">
      <div className="formGrid">
        <label>優先<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="">全部</option><option>高</option><option>中</option><option>低</option></select></label>
        <label>類型<select value={type} onChange={e=>setType(e.target.value)}><option value="">全部</option>{taskTypes.map(t=><option key={t}>{t}</option>)}</select></label>
        <label>組別<select value={group} onChange={e=>setGroup(e.target.value)}><option value="">全部</option>{groups.map(g=><option key={g}>{g}</option>)}</select></label>
        <label>狀態<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">全部</option><option>待處理</option><option>進行中</option><option>待審核</option><option>已完成</option></select></label>
        <label>到期日<input type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>
        <button className="secondary" onClick={()=>{setPriority("");setType("");setGroup("");setStatus("");setDue("");}}>清除篩選</button>
      </div>
    </Card>
    <DataTable headers={["優先","任務","類型","組別","狀態","到期日","操作"]} rows={filtered.map(t=>[badge(t.priority,t.priority==="高"?"red":t.priority==="中"?"yellow":"gray"),t.title,t.task_type,t.group_name,t.status,t.due_date,<button className="secondary" onClick={()=>completeTask(t)}>完成</button>])}/>
  </>;
}

function Reports({ patients, tasks, workOrders, appointments, schedule, announcements, reads }) {
  const unfinished=tasks.filter(t=>t.status!=="已完成").length;
  const workPending=workOrders.filter(w=>w.status!=="已完成").length;
  const unread=announcements.filter(a=>!reads.some(r=>r.announcement_id===a.id)).length;
  return <><PageTitle title="營運報表" desc="V14 提供主管快速看整體量體、未完成事項、照護工單、月排班與公告簽收狀況。" />
    <div className="compactMetrics"><Metric title="患者總數" value={patients.length}/><Metric title="預約掛號" value={appointments.length}/><Metric title="未完成任務" value={unfinished} tone="yellow"/><Metric title="待處理工單" value={workPending} tone="red"/><Metric title="月排班筆數" value={schedule.length}/><Metric title="未簽收公告" value={unread} tone="yellow"/></div>
    <div className="dashboardGrid">
      <Card title="各組待辦統計"><GroupPendingOverview tasks={tasks}/></Card>
      <Card title="照護工單狀態"><DataTable compact headers={["狀態","數量"]} rows={["待處理","進行中","待審核","已完成"].map(s=>[s,workOrders.filter(w=>w.status===s).length])}/></Card>
      <Card title="報表說明"><p className="muted">此頁為主管與維運廠商討論用的營運報表雛形，後續可加入月報、院區比較、組別績效與匯出 PDF/Excel。</p></Card>
    </div>
  </>;
}

function Staff({ staff, demoStaff, profile, updateRole, updateProfileField, seedDemoStaff, updateDemoStaff }) {
  const canEdit = profile.role === "super_admin" || profile.role === "clinic_manager";
  return <><PageTitle title="人員與權限管理" desc="Google 登入帳號與虛擬員工分開管理；虛擬員工用於排班、任務分組與訓練測試。" actions={<button className="primary" onClick={seedDemoStaff}>建立各組虛擬員工</button>} />
    <Card title="Google 登入帳號"><DataTable headers={["姓名","Email","角色","組別","預設院區","狀態"]} rows={staff.map(s=>[s.full_name,s.email,canEdit?<select value={s.role} onChange={e=>updateRole(s.id,e.target.value)}>{Object.keys(roles).map(r=><option key={r} value={r}>{roles[r]}</option>)}</select>:roles[s.role],canEdit?<select value={s.group_name||"待設定"} onChange={e=>updateProfileField(s.id,"group_name",e.target.value)}><option>待設定</option>{groups.map(g=><option key={g}>{g}</option>)}</select>:s.group_name,canEdit?<select value={s.default_clinic||"台北"} onChange={e=>updateProfileField(s.id,"default_clinic",e.target.value)}>{clinics.map(c=><option key={c}>{c}</option>)}</select>:s.default_clinic,s.status])}/></Card>
    <Card title="虛擬員工"><DataTable headers={["姓名","職稱","角色","組別","預設院區","狀態"]} rows={demoStaff.map(s=>[canEdit?<input className="cellInput" value={s.full_name} onChange={e=>updateDemoStaff(s.id,"full_name",e.target.value)}/>:s.full_name,canEdit?<input className="cellInput" value={s.title||""} onChange={e=>updateDemoStaff(s.id,"title",e.target.value)}/>:s.title,canEdit?<select value={s.role} onChange={e=>updateDemoStaff(s.id,"role",e.target.value)}>{Object.keys(roles).map(r=><option key={r} value={r}>{roles[r]}</option>)}</select>:roles[s.role],canEdit?<select value={s.group_name} onChange={e=>updateDemoStaff(s.id,"group_name",e.target.value)}>{groups.map(g=><option key={g}>{g}</option>)}</select>:s.group_name,canEdit?<select value={s.default_clinic} onChange={e=>updateDemoStaff(s.id,"default_clinic",e.target.value)}>{clinics.map(c=><option key={c}>{c}</option>)}</select>:s.default_clinic,s.status])}/></Card>
  </>;
}

function Leave({ leave, profile, demoStaff, staff, addLeave, updateLeaveRequest, approveLeave }) {
  const people = [...demoStaff.map(s=>s.full_name), ...staff.map(s=>s.full_name)].filter(Boolean);
  const reasonOptions = ["個人事務", "身體不適", "家庭照顧", "教育訓練", "臨時調班", "預先卡位", "其他"];
  const [reasonPreset, setReasonPreset] = useState("個人事務");
  const [form, setForm] = useState({
    request_kind: "請假",
    leave_type: "特休",
    start_date: new Date().toISOString().slice(0,10),
    end_date: new Date().toISOString().slice(0,10),
    start_time: "09:00",
    end_time: "18:00",
    delegate_name: people[0] || "未指定代理人",
    reason: "個人事務"
  });
  const submit = () => addLeave(form);
  const canManager = isManager(profile.role);
  const relevant = canManager ? leave : leave.filter(l => l.applicant_name === profile.full_name || l.delegate_name === profile.full_name);
  return <>
    <PageTitle title="請假／卡位／代理" desc="申請人送出後，代理人同意，再由主管審核；主管也可在測試階段直接核准。" actions={<button className="primary" onClick={submit}>送出申請</button>} />
    <Card title="申請表單">
      <div className="patientForm">
        <label>申請類型<select value={form.request_kind} onChange={e=>setForm({...form,request_kind:e.target.value})}><option>請假</option><option>卡位</option><option>調班</option></select></label>
        <label>假別／事由分類<select value={form.leave_type} onChange={e=>setForm({...form,leave_type:e.target.value})}><option>特休</option><option>病假</option><option>事假</option><option>公假</option><option>補休</option><option>調班</option><option>其他</option></select></label>
        <label>指定代理人<select value={form.delegate_name} onChange={e=>setForm({...form,delegate_name:e.target.value})}><option>未指定代理人</option>{people.map(p=><option key={p}>{p}</option>)}</select></label>
        <label>開始日期<input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value,end_date:e.target.value})}/></label>
        <label>開始時間<input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/></label>
        <label>結束時間<input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})}/></label>
        <label>常見原因<select value={reasonPreset} onChange={e=>{setReasonPreset(e.target.value); setForm({...form,reason:e.target.value});}}>{reasonOptions.map(r=><option key={r}>{r}</option>)}</select></label>
        <label className="wideField">原因／備註<textarea value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="可選擇常見原因，也可自行補充。"/></label>
      </div>
    </Card>
    <Card title="我的／主管待審事項">
      <DataTable headers={["類型","申請人","假別","期間","代理人","代理狀態","主管審核","操作"]} rows={relevant.map(l=>[
        l.request_kind || "請假",
        l.applicant_name,
        l.leave_type,
        l.period_text,
        l.delegate_name,
        l.delegate_status,
        l.approval_status,
        <div className="rowActions">
          {l.delegate_name === profile.full_name && l.delegate_status !== "代理人已同意" && <button className="secondary" onClick={()=>updateLeaveRequest(l,{delegate_status:"代理人已同意",progress:60,delegate_approval_at:new Date().toISOString()},"代理人同意")}>同意代理</button>}
          {canManager && l.approval_status !== "主管已核准" && l.cancel_status !== "已取消" && <button className="primary" onClick={()=>approveLeave(l)}>主管核准</button>}
          {(canManager || l.applicant_name === profile.full_name) && l.cancel_status !== "已取消" && <button className="danger" onClick={()=>updateLeaveRequest(l,{cancel_status:"已取消",approval_status:"已取消",progress:0,cancelled_at:new Date().toISOString()},"取消申請")}>取消</button>}
        </div>
      ])}/>
    </Card>
  </>;
}

function Schedule({ schedule, shiftSwaps, addShiftSwap, seedMonthSchedule, selectedMonth, setSelectedMonth, profile, demoStaff, updateScheduleCell }) {
  const [group, setGroup] = useState(groups[0]);
  const [person, setPerson] = useState("");
  const [cell, setCell] = useState(null);
  const totals={}; schedule.forEach(s=>totals[s.staff_name]=(totals[s.staff_name]||0)+Number(s.hours||0));
  const people = [...new Set([...demoStaff.map(s=>s.full_name), ...schedule.map(s=>s.staff_name)].filter(Boolean))];
  const printableTitle = person ? `${person} 個人班表` : `${group} 組別月班表`;
  const printRoster = () => {
    document.body.classList.add("print-roster");
    setTimeout(()=>window.print(), 80);
    setTimeout(()=>document.body.classList.remove("print-roster"), 800);
  };
  return <>
    <PageTitle title="月排班與調班" desc="以組別或個人為主的月班表；點擊格子可設定當天任務指派。" actions={<><select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}>{nextMonthOptions().map(m=><option key={m}>{m}</option>)}</select><button className="primary" onClick={seedMonthSchedule}>產生整月排班</button><button className="secondary" onClick={addShiftSwap}>新增調班申請</button></>} />
    <Card title="月班表查詢與輸出">
      <div className="formGrid">
        <label>組別<select value={group} onChange={e=>{setGroup(e.target.value); setPerson("");}}>{groups.map(g=><option key={g}>{g}</option>)}</select></label>
        <label>個人班表<select value={person} onChange={e=>setPerson(e.target.value)}><option value="">依組別顯示</option>{people.map(p=><option key={p}>{p}</option>)}</select></label>
        <button className="secondary" onClick={printRoster}>輸出目前班表 PDF</button>
      </div>
      <div className="printTarget">
        <div className="printTitle"><h2>{printableTitle}</h2><p>{selectedMonth}｜{person ? "個人班表" : group}</p></div>
        <RosterGrid schedule={schedule} selectedMonth={selectedMonth} group={group} person={person} onCellClick={setCell} />
      </div>
    </Card>
    <details className="card"><summary>工時統計與公平性提示</summary><DataTable compact headers={["人員","月工時","提示"]} rows={Object.entries(totals).map(([name,h])=>[name,`${h} 小時`,h>180?"偏高，建議調整":h<120?"偏低，可評估補班":"正常"])}/></details>
    <Card title="調班申請"><DataTable compact headers={["申請人","對象","日期","原班別","欲換班別","狀態","原因"]} rows={(shiftSwaps||[]).map(s=>[s.requester_name,s.target_name,s.request_date,s.original_shift,s.requested_shift,s.status,s.reason])}/></Card>
    {cell && <RosterCellModal cell={cell} onClose={()=>setCell(null)} onSave={async (taskGroup, taskNote)=>{await updateScheduleCell(cell.row.id, taskGroup, taskNote); setCell(null);}} />}
  </>;
}

function RosterGrid({ schedule, selectedMonth, group, person, onCellClick }) {
  const dim = daysInMonth(selectedMonth);
  const days = Array.from({length: dim}, (_,i)=>i+1);
  const slots = [["早班", "早班"],["午班", "午班"],["晚班", "晚班"]];
  const rowsFor = (day, keyword) => {
    const date = ymDate(selectedMonth, day);
    return schedule
      .filter(s => s.work_date === date)
      .filter(s => person ? s.staff_name === person : s.group_name === group)
      .filter(s => String(s.shift_name || "").includes(keyword));
  };
  return <div className="rosterWrap"><table className="rosterTable"><thead><tr><th>時段</th>{days.map(d=><th key={d}>{d}</th>)}</tr></thead><tbody>{slots.map(([label,key])=><tr key={label}><th>{label}</th>{days.map(d=>{ const rows=rowsFor(d,key); return <td key={d} className={rows.length?"hasPeople":""}>{rows.map(row=><button className="nameChip" title={`${row.staff_name}｜${row.shift_name}${row.task_group ? "｜"+row.task_group : ""}`} key={`${row.id || row.staff_name}-${row.shift_name}`} onClick={()=>onCellClick({day:d,label,row})}>{String(row.staff_name || "").slice(0,1)}{row.task_group && <small>{String(row.task_group).slice(0,1)}</small>}</button>)}</td>})}</tr>)}</tbody></table></div>;
}

function RosterCellModal({ cell, onClose, onSave }) {
  const [taskGroup, setTaskGroup] = useState(cell.row.task_group || cell.row.group_name || groups[0]);
  const [taskNote, setTaskNote] = useState(cell.row.task_note || "");
  return <div className="modalBackdrop" onClick={onClose}><div className="modalCard miniModal" onClick={e=>e.stopPropagation()}>
    <div className="modalHead"><h3>設定班表任務</h3><button className="textbtn" onClick={onClose}>關閉</button></div>
    <p className="muted">{cell.row.work_date}｜{cell.label}｜{cell.row.staff_name}</p>
    <div className="patientForm">
      <label>當日任務組別<select value={taskGroup} onChange={e=>setTaskGroup(e.target.value)}>{groups.map(g=><option key={g}>{g}</option>)}</select></label>
      <label className="wideField">任務說明<textarea value={taskNote} onChange={e=>setTaskNote(e.target.value)} placeholder="例如：支援櫃檯、健管電話、製衣確認、治療區支援..."/></label>
      <button className="primary wideField" onClick={()=>onSave(taskGroup, taskNote)}>儲存任務指派</button>
    </div>
  </div></div>;
}

function Announcements({ announcements, reads, profile, addAnnouncement, readAnnouncement }) {
  const [form,setForm]=useState(defaultAnnouncement);
  const submit=()=>{ addAnnouncement(form); setForm(defaultAnnouncement); };
  return <><PageTitle title="公告與簽收" desc="可建立總公司公告、院區公告或組別公告；簽收後會留下紀錄。" />
    <Card title="新增公告"><div className="formGrid"><label>公告範圍<select value={form.scope} onChange={e=>setForm({...form,scope:e.target.value})}><option>總公司</option><option>院區</option><option>組別</option></select></label><label>分類<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option>行政公告</option><option>教育訓練</option><option>資訊安全</option><option>排班通知</option><option>緊急公告</option></select></label>{form.scope==="組別"&&<label>指定組別<select value={form.group_name} onChange={e=>setForm({...form,group_name:e.target.value})}>{groups.map(g=><option key={g}>{g}</option>)}</select></label>}<label className="wideField">標題<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label><label className="wideField">內容<textarea value={form.content} onChange={e=>setForm({...form,content:e.target.value})}/></label><label className="checkRow"><input type="checkbox" checked={form.required_read} onChange={e=>setForm({...form,required_read:e.target.checked})}/> 需要簽收</label></div><button className="primary" onClick={submit}>發布公告</button></Card>
    <Card title="公告列表">{announcements.map(a=>{ const read=reads.some(r=>r.announcement_id===a.id&&r.user_id===profile.id); return <div className={`ann ${read?"":"unread"}`} key={a.id}>{badge(a.scope)} {a.required_read&&badge("需簽收","red")}<h3>{a.title}</h3><p>{a.content}</p><button className="secondary" onClick={()=>readAnnouncement(a)}>{read?"已簽收":"簽收公告"}</button></div>})}</Card>
  </>;
}

function Audit({ audit }) {
  const [actor,setActor]=useState(""), [module,setModule]=useState(""), [action,setAction]=useState(""), [keyword,setKeyword]=useState("");
  const modules=[...new Set(audit.map(a=>a.module).filter(Boolean))], actions=[...new Set(audit.map(a=>a.action).filter(Boolean))], actors=[...new Set(audit.map(a=>a.actor_email).filter(Boolean))];
  const rows=audit.filter(a=>(!actor||a.actor_email===actor)&&(!module||a.module===module)&&(!action||a.action===action)&&(!keyword||JSON.stringify(a).includes(keyword))).slice(0,100);
  return <><PageTitle title="數位足跡稽核" desc="用下拉篩選快速查詢帳號、模組與動作。" /><div className="formGrid"><label>帳號<select value={actor} onChange={e=>setActor(e.target.value)}><option value="">全部</option>{actors.map(x=><option key={x}>{x}</option>)}</select></label><label>模組<select value={module} onChange={e=>setModule(e.target.value)}><option value="">全部</option>{modules.map(x=><option key={x}>{x}</option>)}</select></label><label>動作<select value={action} onChange={e=>setAction(e.target.value)}><option value="">全部</option>{actions.map(x=><option key={x}>{x}</option>)}</select></label><label>關鍵字<input value={keyword} onChange={e=>setKeyword(e.target.value)}/></label></div><details className="card" open><summary>稽核紀錄列表</summary><DataTable headers={["時間","操作者","角色","院區","模組","動作","目標","細節"]} rows={rows.map(a=>[new Date(a.created_at).toLocaleString("zh-TW"),a.actor_email,a.actor_role,a.clinic,a.module,a.action,a.target_type,a.detail])}/></details></>;
}

function ModuleMap() { return <><PageTitle title="功能整併總覽" desc="V14 直接展開三大業務組別測試範圍，方便不同組別進行分工測試。" /><div className="moduleGrid"><details className="moduleItem" open><summary>現場流程組</summary><p>掛號、初診、複診、等待看診、等待治療、等待檢查、開處方、拿藥、完診。</p><em>測試頁：工作指揮中心、今日流程、掛號與初複診、患者管理</em></details><details className="moduleItem" open><summary>個案照護組</summary><p>居家諮詢、居家聯繫、居家動態、保健衣劃記、製衣工單、等待寄送、客服關懷、列管追蹤。</p><em>測試頁：居家／製衣／客服、任務中心、患者檔案</em></details><details className="moduleItem" open><summary>行政營運組</summary><p>人員權限、公告簽收、月排班、請假代理、調班申請、數位足跡、營運報表、Demo 管理設定。</p><em>測試頁：營運報表、人員權限、排班、公告、稽核</em></details></div></>; }

function Settings({ generateDemoData, seedDemoStaff }) { return <><PageTitle title="Demo 管理設定" desc="最高系統管理員可以重置或追加示範資料，方便多人訓練與反覆測試。" /><div className="grid three"><button className="primary big" onClick={()=>generateDemoData(20,true)}>重置 20 筆示範患者</button><button className="primary big" onClick={()=>generateDemoData(50,true)}>重置 50 筆示範患者</button><button className="secondary big" onClick={()=>generateDemoData(20,false)}>追加 20 筆示範患者</button><button className="secondary big" onClick={seedDemoStaff}>建立各組虛擬員工</button></div></>; }

function AIHelper({ profile, clinic, patients, tasks, announcements, schedule, leave, aiLogs, logAudit, loadAll }) {
  const [out,setOut]=useState("尚未產生。"), [loading,setLoading]=useState(false);
  async function callAI(){ setLoading(true); setOut("OpenAI 行政助理產生中..."); const payload={ clinic, role:roles[profile.role], taskSummary:tasks.map(t=>({title:t.title, priority:t.priority, status:t.status, group:t.group_name})).slice(0,50), patientFlowSummary:patients.map(p=>({status:p.current_status, risk:p.risk_level, home:p.home_status, garment:p.garment_status})).slice(0,80), scheduleSummary:schedule.map(s=>({date:s.work_date, staff:s.staff_name, shift:s.shift_name, hours:s.hours})).slice(0,120), leaveSummary:leave.map(l=>({applicant:l.applicant_name, period:l.period_text, delegate:l.delegate_name, approval:l.approval_status})).slice(0,50), announcementSummary:announcements.map(a=>({title:a.title, required:a.required_read})).slice(0,20) }; const { data, error } = await supabase.functions.invoke("ai-admin-assistant", { body: payload }); if(error){setOut(`OpenAI Edge Function 呼叫失敗：${error.message}\n可先使用本機摘要備援。`);}else{setOut(data.output_text||"沒有取得內容。"); await supabase.from("ai_usage_logs").insert({user_id:profile.id,user_email:profile.email,clinic,prompt_type:"行政交班摘要",input_summary:JSON.stringify(payload).slice(0,6000),output_text:data.output_text,model:data.model}); await logAudit("OpenAI 行政摘要","AI","ai_usage_logs",data.model); loadAll();} setLoading(false);}
  function fallbackAI(){ setOut(`【本機行政交班摘要｜未呼叫 OpenAI】\n1. 目前患者資料 ${patients.length} 筆。\n2. 未完成任務 ${tasks.filter(t=>t.status!=="已完成").length} 筆，其中高優先 ${tasks.filter(t=>t.priority==="高").length} 筆。\n3. 本月排班資料 ${schedule.length} 筆，請檢查高工時與請假代理衝突。\n4. 請假代理 ${leave.length} 筆，需追蹤代理同意與主管核准。\n5. 本內容僅為行政流程輔助，不涉及醫療診斷或治療決策。`);}
  return <><PageTitle title="OpenAI 行政助理" desc="金鑰放在 Supabase Edge Function Secret，不暴露在前端。" actions={<><button className="primary" disabled={loading} onClick={callAI}>{loading?"產生中...":"呼叫 OpenAI 產生建議"}</button><button className="secondary" onClick={fallbackAI}>本機摘要備援</button></>} /><pre className="aiout">{out}</pre><Card title="最近 AI 使用紀錄"><DataTable compact headers={["時間","使用者","模型","輸出摘要"]} rows={aiLogs.map(l=>[new Date(l.created_at).toLocaleString("zh-TW"),l.user_email,l.model,String(l.output_text||"").slice(0,80)+"..."])} /></Card></>;
}

createRoot(document.getElementById("root")).render(<App />);
