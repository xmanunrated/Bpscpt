import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

export const getGeminiResponse = async (apiKey: string, fileData: { type: string, data: string, name: string } | null, promptText: string) => {
  const ai = new GoogleGenAI({ apiKey });
  
  const parts: any[] = [];
  if (fileData) {
    if (fileData.type === "pdf") {
      parts.push({
        inlineData: {
          mimeType: "application/pdf",
          data: fileData.data
        }
      });
    } else {
      parts.push({ text: `BPSC PT Question Paper Content:\n\n${fileData.data}` });
    }
  }
  parts.push({ text: promptText });

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [{ parts }],
    config: {
      temperature: 0.3,
      maxOutputTokens: 4000,
      systemInstruction: "You are a BPSC PT exam expert. Return ONLY valid JSON. No markdown, no backticks, no explanation.",
      responseMimeType: "application/json"
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.error("Failed to parse JSON from Gemini:", text);
    throw new Error("Invalid JSON response from AI");
  }
};
