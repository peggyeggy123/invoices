export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '伺服器未設定 GEMINI_API_KEY 環境變數，請至 Vercel Settings 設定' });
  }

  try {
    const { base64Data, mimeType } = req.body;
    const promptText = `請分析這張發票或收據，提取以下欄位。請僅輸出標準 JSON 格式（不要包含任何 markdown 或文字）：
{
  "date": "發票日期",
  "invNum": "發票號碼",
  "item": "品名",
  "qty": 1,
  "unitPrice": 0,
  "amount": 未稅金額,
  "tax": 營業稅額,
  "total": 總金額,
  "vendor": "廠商名稱"
}`;

    // 步驟 1: 動態向 Google 查詢此 API Key 目前所有可用的模型
    const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listModelsUrl);
    if (!listRes.ok) {
      const errData = await listRes.json().catch(() => ({}));
      throw new Error(`無法取得模型清單: ${errData.error?.message || listRes.statusText}，請檢查 API Key 是否正確。`);
    }

    const listData = await listRes.json();
    const availableModels = listData.models || [];
    
    // 找出支援 generateContent 的模型（優先選擇名稱含有 flash 或 pro 的模型）
    const validModel = availableModels.find(m => 
      m.supportedGenerationMethods && 
      m.supportedGenerationMethods.includes('generateContent') &&
      !m.name.includes('embedding') &&
      !m.name.includes('imagen')
    );

    if (!validModel) {
      throw new Error("此 API Key 目前沒有可用於生成內容的 Gemini 模型。");
    }

    // 格式範例: "models/gemini-3.5-flash" ➔ 取出 "gemini-3.5-flash"
    const targetModelName = validModel.name.replace('models/', '');

    // 步驟 2: 使用動態取得的最佳模型名稱發送辨識請求
    const payload = {
      contents: [{
        parts: [
          { text: promptText },
          { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Data } }
        ]
      }]
    };

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModelName}:generateContent?key=${apiKey}`;
    const response = await fetch(generateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`[使用模型 ${targetModelName} 辨識失敗]: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      rawText = rawText.substring(jsonStart, jsonEnd + 1);
    }

    return res.status(200).json(JSON.parse(rawText));

  } catch (err) {
    return res.status(500).json({ error: err.message || "AI 辨識失敗" });
  }
}
