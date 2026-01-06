
import { GoogleGenAI, Type } from "@google/genai";
import { AudioAnalysis } from "../types";

export const analyzeAudio = async (audioBase64: string, mimeType: string): Promise<AudioAnalysis> => {
  // Always use a new instance with the direct process.env.API_KEY to avoid stale closures
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: audioBase64,
              mimeType: mimeType
            }
          },
          {
            text: "Analyze the mood, energy, and musical characteristics of this audio. Return a JSON object describing the mood, energy level (0-1), a suggested color palette (at least 3 hex codes), a short artistic description, and a visual theme keyword."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mood: { type: Type.STRING },
            colors: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            energy: { type: Type.NUMBER },
            description: { type: Type.STRING },
            visualTheme: { type: Type.STRING }
          },
          required: ["mood", "colors", "energy", "description", "visualTheme"]
        }
      }
    });

    // Use response.text property directly
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    // Fallback default analysis
    return {
      mood: "Unknown",
      colors: ["#3b82f6", "#8b5cf6", "#ec4899"],
      energy: 0.5,
      description: "Unable to analyze audio features. Using default visuals.",
      visualTheme: "Generic"
    };
  }
};
