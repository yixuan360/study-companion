import OpenAI from "openai";

const clients = new Map<string, OpenAI>();

export function getOpenAIClient(config: {
  apiKey: string;
  baseURL: string;
}): OpenAI {
  const key = `${config.baseURL}:${config.apiKey}`;
  if (!clients.has(key)) {
    clients.set(
      key,
      new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      })
    );
  }
  return clients.get(key)!;
}
