import OpenAI from 'openai';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SafetySetting } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

export interface JsonSchemaDef {
  name: string;
  schema: Record<string, any>;
}

export interface AiCallResult {
  raw: string;
  promptTokens: number;
  completionTokens: number;
}

export type AiProviderName = 'OpenAI' | 'Gemini' | 'Anthropic';

interface CallAiJsonArgs {
  provider: AiProviderName;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: JsonSchemaDef;
}
export const callAiJson = async (args: CallAiJsonArgs): Promise<AiCallResult> => {
  switch (args.provider) {
    case 'OpenAI':
      return callOpenAiJson(args);
    case 'Gemini':
      return callGeminiJson(args);
    case 'Anthropic':
      return callAnthropicJson(args);
    default:
      throw new Error(`Unsupported AI provider: ${args.provider}`);
  }
};

const callOpenAiJson = async ({ apiKey, model, systemPrompt, userPrompt, jsonSchema }: CallAiJsonArgs): Promise<AiCallResult> => {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_schema', json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema } },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('AI returned an empty response');

  return {
    raw,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
  };
};
const toGeminiSchema = (node: any): any => {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (node && typeof node === 'object') {
    const { additionalProperties, ...rest } = node;
    return Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, toGeminiSchema(value)]));
  }
  return node;
};

const callGeminiJson = async ({ apiKey, model, systemPrompt, userPrompt, jsonSchema }: CallAiJsonArgs): Promise<AiCallResult> => {
  const client = new GoogleGenerativeAI(apiKey);
  const genModel = client.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(jsonSchema.schema),
    },
  });

  const result = await genModel.generateContent(userPrompt);
  const raw = result.response.text();
  if (!raw) throw new Error('AI returned an empty response');

  const usage = result.response.usageMetadata;
  return {
    raw,
    promptTokens: usage?.promptTokenCount ?? 0,
    completionTokens: usage?.candidatesTokenCount ?? 0,
  };
};

interface CallGeminiMultimodalArgs {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  mediaBuffer: Buffer;
  mimeType: string;
  jsonSchema: JsonSchemaDef;
  safetySettings?: SafetySetting[];
}
export const PERMISSIVE_SAFETY_SETTINGS: SafetySetting[] = [
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }));
export const callGeminiMultimodal = async ({
  apiKey, model, systemPrompt, userPrompt, mediaBuffer, mimeType, jsonSchema, safetySettings,
}: CallGeminiMultimodalArgs): Promise<AiCallResult> => {
  const client = new GoogleGenerativeAI(apiKey);
  const genModel = client.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    ...(safetySettings ? { safetySettings } : {}),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(jsonSchema.schema),
    },
  });

  const result = await genModel.generateContent([
    { text: userPrompt },
    { inlineData: { mimeType, data: mediaBuffer.toString('base64') } },
  ]);
  const blockReason = result.response.promptFeedback?.blockReason;
  if (blockReason) throw new Error(`AI_SAFETY_BLOCK:${blockReason}`);

  const raw = result.response.text();
  if (!raw) throw new Error('AI returned an empty response');

  const usage = result.response.usageMetadata;
  return {
    raw,
    promptTokens: usage?.promptTokenCount ?? 0,
    completionTokens: usage?.candidatesTokenCount ?? 0,
  };
};

const callAnthropicJson = async ({ apiKey, model, systemPrompt, userPrompt, jsonSchema }: CallAiJsonArgs): Promise<AiCallResult> => {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools: [{ name: jsonSchema.name, description: `Return the result as ${jsonSchema.name}`, input_schema: jsonSchema.schema as any }],
    tool_choice: { type: 'tool', name: jsonSchema.name },
  });

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('AI returned an empty response');

  return {
    raw: JSON.stringify(toolUse.input),
    promptTokens: message.usage?.input_tokens ?? 0,
    completionTokens: message.usage?.output_tokens ?? 0,
  };
};

interface CallAiJsonWithImageArgs {
  provider: AiProviderName;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  imageBuffer: Buffer;
  mimeType: string;
  jsonSchema: JsonSchemaDef;
}
export const callAiJsonWithImage = async (args: CallAiJsonWithImageArgs): Promise<AiCallResult> => {
  switch (args.provider) {
    case 'OpenAI':
      return callOpenAiJsonWithImage(args);
    case 'Gemini':
      return callGeminiMultimodal({
        apiKey: args.apiKey, model: args.model, systemPrompt: args.systemPrompt, userPrompt: args.userPrompt,
        mediaBuffer: args.imageBuffer, mimeType: args.mimeType, jsonSchema: args.jsonSchema,
        safetySettings: PERMISSIVE_SAFETY_SETTINGS,
      });
    case 'Anthropic':
      return callAnthropicJsonWithImage(args);
    default:
      throw new Error(`Unsupported AI provider: ${args.provider}`);
  }
};

const callOpenAiJsonWithImage = async ({ apiKey, model, systemPrompt, userPrompt, imageBuffer, mimeType, jsonSchema }: CallAiJsonWithImageArgs): Promise<AiCallResult> => {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBuffer.toString('base64')}` } },
        ],
      },
    ],
    response_format: { type: 'json_schema', json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema } },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('AI returned an empty response');

  return {
    raw,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
  };
};

const callAnthropicJsonWithImage = async ({ apiKey, model, systemPrompt, userPrompt, imageBuffer, mimeType, jsonSchema }: CallAiJsonWithImageArgs): Promise<AiCallResult> => {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType as any, data: imageBuffer.toString('base64') } },
        { type: 'text', text: userPrompt },
      ],
    }],
    tools: [{ name: jsonSchema.name, description: `Return the result as ${jsonSchema.name}`, input_schema: jsonSchema.schema as any }],
    tool_choice: { type: 'tool', name: jsonSchema.name },
  });

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('AI returned an empty response');

  return {
    raw: JSON.stringify(toolUse.input),
    promptTokens: message.usage?.input_tokens ?? 0,
    completionTokens: message.usage?.output_tokens ?? 0,
  };
};
