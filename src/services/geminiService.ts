import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";

export const getGeminiResponse = async (fileData: { type: string, data: string, name: string } | null, promptText: string) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API key is not configured. Please check your environment variables.");
  const ai = new GoogleGenAI({ apiKey: key });
  
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
    model: "gemini-3-flash-preview",
    contents: [{ parts }],
    config: {
      temperature: 0.3,
      maxOutputTokens: 4000,
      systemInstruction: "You are a BPSC PT exam expert. Return ONLY valid JSON. No markdown, no backticks, no explanation.",
      responseMimeType: "application/json",
      // We don't use responseSchema here because the prompt can be used for different JSON structures (predictions vs CA vs validation)
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  
  try {
    // Clean up any potential markdown formatting if the model ignored the instruction
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON from Gemini:", text);
    throw new Error("Invalid JSON response from AI. Please try again.");
  }
};

export const getGeminiTextResponse = async (promptText: string) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API key is not configured.");
  const ai = new GoogleGenAI({ apiKey: key });
  
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: promptText }] }],
    config: {
      temperature: 0.7,
      maxOutputTokens: 2000,
    },
  });

  return response.text || "No response from AI.";
};
