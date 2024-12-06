import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(
  process.env.GOOGLE_API_KEY || ''
);

// Initialize model with dynamic instruction
const getModel = (srcLang: string, destLang: string) => {
  return genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: `You are a helpful assistant that translates ${srcLang} to ${destLang}. Only return the ${destLang} translation, nothing else.`,
    generationConfig: {
      temperature: 1.5,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 1000,
      candidateCount: 1,
      stopSequences: [],
      responseSchema: {
        type: 'object',
        properties: { translation: { type: 'string' } },
        required: ['translation'],
      } as any,
      responseMimeType: 'application/json',
    },
  });
};

// Add sleep utility function
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Update translateText with delay
async function translateText(text: string, model: any) {
  try {
    const prompt = `${text}`;
    const result = await model.generateContent({
      contents: [
        {
          parts: [{ text: prompt }],
          role: 'user',
        },
      ],
      generationConfig: {
        ...model.generationConfig,
        responseSchema: { type: 'string' as any },
        responseMimeType: 'application/json',
      },
    });
    const translation = JSON.parse(result.response.text());
    console.log(`Translating: ${text} -> ${translation}`);

    // Add delay between API calls (1 second)
    await sleep(1000);

    return translation;
  } catch (error: any) {
    if (error.toString().includes('429')) {
      console.log('Rate limit reached, waiting 5 seconds...');
      await sleep(5000); // Wait longer if we hit rate limit
      return translateText(text, model); // Retry the translation
    }
    console.error('Translation error:', error);
    return text;
  }
}

async function deepMergeWithTranslation(
  target: Record<string, any>,
  source: Record<string, any>,
  model: any
) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        target[key] = target[key] || {};
        await deepMergeWithTranslation(target[key], source[key], model);
      } else {
        // Translate if translation doesn't exist
        if (!target[key]) {
          target[key] = await translateText(source[key], model);
          console.log(`Translated ${key}: ${source[key]} -> ${target[key]}`);
        }
      }
    }
  }
  return target;
}

async function syncTranslations(
  srcLang: string,
  destLang: string,
  srcPath: string,
  destPath: string
) {
  if (!srcLang || !destLang || !srcPath || !destPath) {
    console.error('❌ Missing required parameters!');
    console.log(
      'Usage: ts-node scripts/sync-translation.ts <srcLang> <destLang> <srcPath> <destPath>'
    );
    console.log(
      'Example: ts-node scripts/sync-translation.ts en vi ./locales/en.json ./locales/vi.json'
    );
    process.exit(1);
  }

  try {
    const model = getModel(srcLang, destLang);
    const srcContent = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    let destContent = {};

    try {
      destContent = JSON.parse(fs.readFileSync(destPath, 'utf8'));
    } catch (error) {
      console.log(
        `No existing ${destLang} translations found, creating new file`
      );
    }

    const mergedContent = await deepMergeWithTranslation(
      structuredClone(destContent),
      srcContent,
      model
    );

    fs.writeFileSync(destPath, JSON.stringify(mergedContent, null, 2), 'utf8');

    console.log('✅ Translation sync completed successfully!');

    // Count total keys
    const totalKeys =
      JSON.stringify(srcContent).match(/"[^"]+"\s*:/g)?.length || 0;
    console.log(`Total keys synchronized: ${totalKeys}`);
  } catch (error) {
    console.error('❌ Error during translation sync:', error);
    process.exit(1);
  }
}

// Run with required parameters
syncTranslations(
  process.argv[2], // source language
  process.argv[3], // destination language
  process.argv[4], // source path
  process.argv[5] // destination path
).catch(console.error);