export const clinics = ["台北", "板橋", "中壢", "新竹", "台中", "台南", "高雄", "羅東"];
export const groups = ["治療組", "健管組", "櫃檯組", "客服組", "藥局組", "製衣物流組", "主管組"];
export const roles = {
  super_admin: "最高系統管理員 / Super Admin",
  clinic_manager: "院區主管 / Clinic Manager",
  doctor: "醫師 / Doctor",
  therapist: "治療師 / Therapist",
  health_manager: "健管師 / Health Manager",
  frontdesk: "櫃檯 / Front Desk",
  customer_service: "客服 / Customer Service",
  pharmacy: "藥局 / Pharmacy",
  garment_staff: "製衣物流 / Garment & Logistics",
  auditor: "稽核者 / Auditor"
};

export const rolePerms = {
  super_admin: ["dashboard","flow","registration","patients","careOps","tasks","ai","reports","staff","leave","schedule","announcements","audit","moduleMap","settings"],
  clinic_manager: ["dashboard","flow","registration","patients","careOps","tasks","ai","reports","staff","leave","schedule","announcements","audit","moduleMap","settings"],
  doctor: ["dashboard","flow","registration","patients","tasks","announcements","ai","reports"],
  therapist: ["dashboard","flow","patients","careOps","tasks","leave","schedule","announcements","ai"],
  health_manager: ["dashboard","flow","registration","patients","careOps","tasks","leave","schedule","announcements","ai"],
  frontdesk: ["dashboard","flow","registration","patients","tasks","leave","schedule","announcements"],
  customer_service: ["dashboard","patients","careOps","tasks","announcements","ai"],
  pharmacy: ["dashboard","flow","registration","tasks","announcements"],
  garment_staff: ["dashboard","careOps","tasks","announcements","schedule"],
  auditor: ["dashboard","reports","audit","announcements","moduleMap"]
};

export const statuses = ["已報到", "等待看診", "等待治療", "治療中", "等待檢查", "等待開處方", "等待拿藥", "等待居家諮詢", "已完診"];
export const taskTypes = ["照會聯繫", "待填治療次數", "關懷追蹤", "居家聯繫", "製衣確認", "待寄送", "合約異常", "公告簽收", "初診建檔", "複診登記"];
export const workOrderTypes = ["居家諮詢", "居家聯繫", "居家動態", "保健衣劃記", "製衣工單", "等待寄送", "客服關懷", "列管追蹤"];
const lastNames = ["林","陳","王","張","李","黃","吳","劉","蔡","楊","許","鄭","謝","郭","洪"];
const firstNames = ["家安","心怡","柏宇","雅婷","冠廷","雨柔","志明","佳蓉","承翰","品萱","俊豪","宜庭","可欣","書瑋","宥辰"];
const diseases = ["自律神經失調", "睡眠障礙", "頭暈耳鳴", "慢性疲勞", "焦慮症狀", "胃食道逆流", "心悸胸悶", "肩頸痠痛"];
const phones = ["0912-000-101","0922-000-202","0933-000-303","0955-000-505","0966-000-606"];
const therapists = ["林治療師", "王治療師", "陳治療師", "張治療師", "未指派"];
const doctors = ["林醫師", "黃醫師", "院長診", "未指派"];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pad = (n) => String(n).padStart(2, "0");
const fakeName = () => rand(lastNames) + rand(firstNames);

export function makeFakePatient(index, clinic) {
  const age = 18 + Math.floor(Math.random() * 58);
  return {
    chart_no: `D-${10000 + index + Math.floor(Math.random() * 8000)}`,
    name: fakeName(),
    gender: Math.random() > 0.5 ? "女" : "男",
    age,
    birthday: `${2026 - age}-${pad(1 + Math.floor(Math.random() * 12))}-${pad(1 + Math.floor(Math.random() * 28))}`,
    phone_masked: rand(phones),
    clinic,
    disease: rand(diseases),
    current_status: rand(statuses),
    appointment_time: `${pad(9 + Math.floor(Math.random() * 8))}:${Math.random() > 0.5 ? "00" : "30"}`,
    seat_no: Math.random() > 0.35 ? String(1 + Math.floor(Math.random() * 18)) : "-",
    therapist: rand(therapists),
    doctor: rand(doctors),
    treatment_minutes: rand([20,30,40,60]),
    home_status: rand(["未諮詢","待諮詢","使用中","待歸還","已結案"]),
    garment_status: rand(["無","待劃記","製作中","待寄送","已交付"]),
    risk_level: rand(["一般","一般","一般","高關懷","合約異常"]),
    progress: Math.floor(Math.random() * 100),
    note: rand(["需追蹤睡眠", "今日完成示範治療", "待確認居家意願", "注意情緒狀態", "一般流程測試資料"])
  };
}

export function makeFakeTask(patient, userId) {
  const type = rand(taskTypes);
  return {
    patient_id: patient.id,
    title: `${type}：${patient.name}`,
    task_type: type,
    priority: rand(["高","中","低"]),
    status: rand(["待處理","進行中","待審核"]),
    clinic: patient.clinic,
    group_name: rand(groups),
    owner_id: userId,
    due_date: new Date().toISOString().slice(0, 10),
    content: "由系統產生的示範任務，僅供訓練與流程測試。"
  };
}

export function maskPhone(phone) {
  return String(phone || "").replace(/(\d{4})-\d{3}-(\d{3})/, "$1-***-$2");
}
