import type { Config } from "../config.js";

// watsonx.ai client for brief generation (PROJECT.md 9.8). Chat API with an IBM Granite model.
// Credentials come only from the environment (.env). Never log the API key or the access token.

const IAM_URL = "https://iam.cloud.ibm.com/identity/token";
const API_VERSION = "2024-10-08";

/** Models the hackathon says must not be used (they can hurt judging). */
export const BANNED_MODELS = new Set([
  "meta-llama/llama-3-405b-instruct",
  "llama-3-405b-instruct",
  "mistralai/mistral-medium-2505",
  "mistral-medium-2505",
  "mistralai/mistral-small-3-1-24b-instruct-2503",
  "mistral-small-3-1-24b-instruct-2503",
]);

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}

export interface ModelInfo {
  modelId: string;
  label: string;
  provider: string;
}

export class WatsonxClient {
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly apiKey: string,
    private readonly projectId: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromConfig(config: Config, fetchImpl?: typeof fetch): WatsonxClient {
    const { apiKey, projectId, url } = config.watsonx;
    if (!apiKey || !projectId) {
      throw new Error("watsonx is not configured: set WATSONX_API_KEY and WATSONX_PROJECT_ID in .env");
    }
    return new WatsonxClient(apiKey, projectId, url.replace(/\/+$/, ""), fetchImpl);
  }

  /** IAM access token, cached until one minute before it expires. */
  async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const res = await this.fetchImpl(IAM_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "urn:ibm:params:oauth:grant-type:apikey",
        apikey: this.apiKey,
      }).toString(),
    });
    if (!res.ok) throw new Error(`IBM Cloud IAM token request failed (${res.status}); check WATSONX_API_KEY`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
    return body.access_token;
  }

  /** Chat completion. Returns the assistant message text. */
  async chat(modelId: string, messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    if (BANNED_MODELS.has(modelId)) throw new Error(`model ${modelId} is banned by the hackathon rules`);
    const token = await this.accessToken();
    const payload: Record<string, unknown> = {
      model_id: modelId,
      project_id: this.projectId,
      messages,
      max_tokens: options.maxTokens ?? 1200,
      temperature: options.temperature ?? 0.2,
    };
    if (options.json) payload.response_format = { type: "json_object" };

    const res = await this.fetchImpl(`${this.baseUrl}/ml/v1/text/chat?version=${API_VERSION}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`watsonx chat failed (${res.status}): ${detail}`);
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("watsonx chat returned no message content");
    return content;
  }

  /** Chat-capable foundation models available to this account. */
  async listChatModels(): Promise<ModelInfo[]> {
    const url = `${this.baseUrl}/ml/v1/foundation_model_specs?version=${API_VERSION}&filters=function_text_chat&limit=200`;
    const res = await this.fetchImpl(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`watsonx model list failed (${res.status})`);
    const body = (await res.json()) as {
      resources?: { model_id: string; label?: string; provider?: string }[];
    };
    return (body.resources ?? [])
      .filter((m) => !BANNED_MODELS.has(m.model_id))
      .map((m) => ({ modelId: m.model_id, label: m.label ?? m.model_id, provider: m.provider ?? "" }));
  }
}

/** Extracts a JSON object from model output that may be wrapped in prose or a code fence. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(candidate.slice(start, end + 1));
}
