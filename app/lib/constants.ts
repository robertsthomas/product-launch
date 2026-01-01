// Shared constants that can be used on both client and server

export const BRAND_VOICE_PRESETS = [
  "minimal",
  "premium", 
  "fun",
  "technical",
  "bold",
] as const;

export type BrandVoicePreset = typeof BRAND_VOICE_PRESETS[number];

// OpenAI Text Models (for content generation)
export const OPENAI_TEXT_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", description: "Most capable, best quality" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast & affordable" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", description: "High capability, balanced" },
  { id: "gpt-4", name: "GPT-4", description: "Original GPT-4" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", description: "Fastest, most affordable" },
  { id: "o1", name: "o1", description: "Advanced reasoning" },
  { id: "o1-mini", name: "o1 Mini", description: "Fast reasoning" },
  { id: "o3-mini", name: "o3 Mini", description: "Latest reasoning model" },
] as const;

// OpenAI Vision/Image Models (for alt text generation from images)
export const OPENAI_IMAGE_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", description: "Best vision capability" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast vision, affordable" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", description: "Good vision support" },
] as const;

export type OpenAITextModel = typeof OPENAI_TEXT_MODELS[number]["id"];
export type OpenAIImageModel = typeof OPENAI_IMAGE_MODELS[number]["id"];
