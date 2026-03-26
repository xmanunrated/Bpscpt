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
      maxOutputTokens: 8192,
      systemInstruction: "You are a BPSC PT exam expert. Return ONLY valid JSON. No markdown, no backticks, no explanation.",
      responseMimeType: "application/json",
      // We don't use responseSchema here because the prompt can be used for different JSON structures (predictions vs CA vs validation)
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  
  try {
    // Clean up any potential markdown formatting if the model ignored the instruction
    let cleaned = text.trim();
    if (cleaned.includes("```")) {
      cleaned = cleaned.replace(/```json|```/g, "").trim();
    }
    
    // Attempt to fix common truncation issues if it's almost valid
    // This is a simple heuristic: if it ends with a comma or a partial object, we try to close it.
    // However, for complex JSON, it's better to just fail and ask for a retry with more tokens.
    
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON from Gemini:", text);
    
    // Fallback: if it's truncated, try a very basic repair for the most common case (truncated array of objects)
    try {
      if (text.includes('"topics": [') && !text.includes(']')) {
        let repaired = text.trim();
        // Remove trailing comma if exists
        repaired = repaired.replace(/,\s*$/, "");
        // Close the current object if it's open
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        for (let i = 0; i < openBraces - closeBraces; i++) {
          repaired += "}";
        }
        // Close topics array and root object
        repaired += "]}";
        return JSON.parse(repaired);
      }
    } catch (innerError) {
      console.error("Repair failed:", innerError);
    }

    throw new Error("Invalid JSON response from AI. The response might have been too long. Please try again.");
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
