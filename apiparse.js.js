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

    const payload = {
      contents: [{
        parts: [
          { text: promptText },
          { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Data } }
        ]
      }]
    };

    // 採用 Google API 官方最新正式發布模型
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Google API 回傳錯誤 (${response.status}): ${errData.error?.message || response.statusText}`);
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
