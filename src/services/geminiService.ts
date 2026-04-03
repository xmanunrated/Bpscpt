
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";

export const getGeminiResponse = async (
  fileData: { type: string, data: string, name: string, extractedText?: string } | null, 
  promptText: string, 
  customApiKey?: string,
  sourceUrl?: string
) => {
  const key = customApiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API key is not configured. Please check your environment variables or admin settings.");
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
      if (fileData.extractedText) {
        parts.push({ text: `Extracted Text from PDF (for reference):\n\n${fileData.extractedText}` });
      }
    } else {
      parts.push({ text: `BPSC PT Question Paper Content:\n\n${fileData.data}` });
    }
  }
  
  if (sourceUrl) {
    parts.push({ text: `Please analyze the content from this URL: ${sourceUrl}` });
  }

  parts.push({ text: promptText });

  let text = "";
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ parts }],
        config: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          systemInstruction: "You are a BPSC PT exam expert. Return ONLY valid JSON. No markdown, no backticks, no explanation.",
          responseMimeType: "application/json",
          tools: sourceUrl ? [{ urlContext: {} }] : undefined,
        },
      });

      text = response.text || "";
      if (!text) throw new Error("No response from Gemini");
      break;
    } catch (error: any) {
      attempts++;
      console.error(`Gemini API Attempt ${attempts} failed:`, error);
      
      const isTransient = 
        error.message?.includes("Rpc failed") || 
        error.message?.includes("xhr error") ||
        error.message?.includes("500") ||
        error.message?.includes("503") ||
        error.message?.includes("deadline exceeded");

      if (isTransient && attempts < maxAttempts) {
        const delay = Math.pow(2, attempts) * 1000;
        console.log(`Retrying Gemini API in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("invalid API key")) {
        throw new Error("Invalid Gemini API key. Please check your configuration in the settings menu.");
      }
      if (error.message?.includes("429") || error.message?.includes("quota") || error.message?.includes("Rate limit")) {
        throw new Error("Gemini API rate limit exceeded. Please wait a moment and try again.");
      }
      if (error.message?.includes("safety")) {
        throw new Error("The request was blocked by AI safety filters. Please try a different prompt or file.");
      }
      throw error;
    }
  }
  
  try {
    let cleaned = text.trim();
    if (cleaned.includes("```")) {
      cleaned = cleaned.replace(/```json|```/g, "").trim();
    }
    
    const repairJSON = (text: string) => {
      let repaired = text.trim();
      try { return JSON.parse(repaired); } catch (e) {}

      const arraysToRepair = ['"topics": [', '"questions": [', '"surprises": [', '"confirmed": [', '"missed": ['];
      for (const arrayKey of arraysToRepair) {
        if (repaired.includes(arrayKey) && !repaired.endsWith(']}')) {
          repaired = repaired.replace(/,\s*$/, "");
          const openBraces = (repaired.match(/\{/g) || []).length;
          const closeBraces = (repaired.match(/\}/g) || []).length;
          for (let i = 0; i < openBraces - closeBraces; i++) {
            repaired += "}";
          }
          repaired += "]}";
          try { return JSON.parse(repaired); } catch (e) {}
        }
      }
      return null;
    };

    const repaired = repairJSON(cleaned);
    if (repaired) return repaired;
    
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON from Gemini:", text);
    throw new Error("Invalid JSON response from AI. The response might have been too long. Please try again.");
  }
};

export const getGeminiTextResponse = async (promptText: string, customApiKey?: string) => {
  const key = customApiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API key is not configured.");
  const ai = new GoogleGenAI({ apiKey: key });
  
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ parts: [{ text: promptText }] }],
        config: {
          temperature: 0.7,
          maxOutputTokens: 2000,
        },
      });

      return response.text || "No response from AI.";
    } catch (error: any) {
      attempts++;
      console.error(`Gemini Text API Attempt ${attempts} failed:`, error);

      const isTransient = 
        error.message?.includes("Rpc failed") || 
        error.message?.includes("xhr error") ||
        error.message?.includes("500") ||
        error.message?.includes("503") ||
        error.message?.includes("deadline exceeded");

      if (isTransient && attempts < maxAttempts) {
        const delay = Math.pow(2, attempts) * 1000;
        console.log(`Retrying Gemini Text API in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  return "No response from AI after multiple attempts.";
};
