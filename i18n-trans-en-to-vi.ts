import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Paths to translation files
const EN_PATH = path.join(__dirname, "./en.json");
const VI_PATH = path.join(__dirname, "./vi.json");

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(
  process.env.GOOGLE_API_KEY || ""
);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  systemInstruction:
    "You are a helpful assistant that translates English to Vietnamese. Only return the Vietnamese translation, nothing else.",
  generationConfig: {
    temperature: 1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 1000,
    candidateCount: 1,
  },
});

// Function to translate text to Vietnamese using Google Generative AI
async function translateToVietnamese(text: string) {
  try {
    const prompt = `${text}`;
    const result = await model.generateContent({
      contents: [
        {
          parts: [{ text: prompt }],
          role: "user",
        },
      ],
      generationConfig: {
        ...model.generationConfig,
        responseSchema: { type: "string" as any },
        responseMimeType: "application/json",
      },
    });
    const translation = JSON.parse(result.response.text());
    console.log(`Translating: ${text} -> ${translation}`);
    return translation;
  } catch (error) {
    console.error("Translation error:", error);
    return text; // Return original text if translation fails
  }
}

// Function to deep merge objects with translation
async function deepMergeWithTranslation(target: Record<string, any>, source: Record<string, any>) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        target[key] = target[key] || {};
        await deepMergeWithTranslation(target[key], source[key]);
      } else {
        // Translate if Vietnamese translation doesn't exist
        if (!target[key]) {
          target[key] = await translateToVietnamese(source[key]);
          console.log(`Translated ${key}: ${source[key]} -> ${target[key]}`);
        }
      }
    }
  }
  return target;
}

// Function to ensure all keys from English exist in Vietnamese
async function syncTranslations() {
  try {
    // Read both files
    const enContent = JSON.parse(fs.readFileSync(EN_PATH, "utf8"));
    let viContent = {};

    // Try to read existing Vietnamese translations
    try {
      viContent = JSON.parse(fs.readFileSync(VI_PATH, "utf8"));
    } catch (error) {
      console.log("No existing Vietnamese translations found, creating new file");
    }

    // Merge English into Vietnamese, translating missing entries
    const mergedContent = await deepMergeWithTranslation(structuredClone(viContent), enContent);

    // Write the result back to vi.json with pretty formatting
    fs.writeFileSync(VI_PATH, JSON.stringify(mergedContent, null, 2), "utf8");

    console.log("✅ Translation sync completed successfully!");

    // Count total keys
    const totalKeys = JSON.stringify(enContent).match(/"[^"]+"\s*:/g)?.length || 0;
    console.log(`Total keys synchronized: ${totalKeys}`);
  } catch (error) {
    console.error("❌ Error during translation sync:", error);
    process.exit(1);
  }
}

// Run the sync
syncTranslations().catch(console.error);