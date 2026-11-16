import { validateCandidates, type Candidate } from "./catalog";
export type LLMBookResult = Candidate;
export interface LLMScanResult {
  books: Candidate[];
}
export const prompt = `识别照片中真实可见的书脊，输出 JSON 对象 {"books":[...]}。每本书包含 title、author（看不清就留空）、description（只描述可见信息，不补写百科）、coverColor（六位 HEX）、row（从上到下，从1开始）、position（本层从左到右，从1开始）、confidence（high/medium/low）、bbox（可选，书脊在原图的归一化 [x,y,width,height]）。不猜测看不清的书名，不生成评分，不把装饰物识别为书。模糊的名称使用“待确认书名”并标记 low。`;
export async function scanBookshelfPhoto(
  image: string,
  base: string,
  key: string,
  model: string,
  signal: AbortSignal,
): Promise<LLMScanResult> {
  const url = new URL(base);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("接口地址必须是 http(s) URL。");
  if (!key.trim() || !model.trim())
    throw new Error("请填写 API Key 和支持图片输入的模型名称。");
  const response = await fetch(base.replace(/\/+$/, "") + "/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok)
    throw new Error(
      `识别请求失败（HTTP ${response.status}）。请检查接口、模型权限和额度。`,
    );
  const body = await response.json();
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("接口未返回可解析的识别结果。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
    );
  } catch {
    throw new Error("模型没有返回有效 JSON，请重试或换一个模型。");
  }
  return { books: validateCandidates(parsed) };
}
