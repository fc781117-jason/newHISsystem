import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import OpenAI from "npm:openai@4.86.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "OPENAI_API_KEY 尚未設定。請到 Supabase Edge Function Secrets 設定。"
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const {
      clinic = "未指定院區",
      role = "未指定角色",
      taskSummary = [],
      patientFlowSummary = [],
      scheduleSummary = [],
      leaveSummary = [],
      announcementSummary = []
    } = body;

    const client = new OpenAI({ apiKey });

    const prompt = `
你是診所營運流程整合系統的「行政流程 AI 助理」。
請只針對行政流程、任務排序、交班摘要、排班風險、公告簽收、待辦優先順序提供建議。
不得提供醫療診斷、治療建議、用藥建議或個案醫療判斷。

請用繁體中文輸出，格式如下：
1. 今日重點摘要
2. 高優先待辦
3. 排班與代理提醒
4. 公告與簽收提醒
5. 建議分工
6. 風險提醒
7. 不涉及醫療判斷聲明

院區：${clinic}
使用者角色：${role}

任務摘要：
${JSON.stringify(taskSummary).slice(0, 4000)}

流程摘要：
${JSON.stringify(patientFlowSummary).slice(0, 4000)}

月排班摘要：
${JSON.stringify(scheduleSummary).slice(0, 3000)}

請假代理摘要：
${JSON.stringify(leaveSummary).slice(0, 3000)}

公告摘要：
${JSON.stringify(announcementSummary).slice(0, 2000)}
`;

    const response = await client.responses.create({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5.4-mini",
      input: prompt
    });

    return new Response(JSON.stringify({
      output_text: response.output_text,
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5.4-mini"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
