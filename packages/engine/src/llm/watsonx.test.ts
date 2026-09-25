import { describe, expect, it } from "vitest";
import { extractJson, WatsonxClient } from "./watsonx.js";

function fakeFetch() {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.startsWith("https://iam.cloud.ibm.com")) {
      return Response.json({ access_token: "tok", expires_in: 3600 });
    }
    if (u.includes("/ml/v1/text/chat")) {
      return Response.json({ choices: [{ message: { content: '{"codename":"Night Owl"}' } }] });
    }
    if (u.includes("/foundation_model_specs")) {
      return Response.json({
        resources: [
          { model_id: "ibm/granite-3-3-8b-instruct", label: "granite-3-3-8b-instruct", provider: "IBM" },
          { model_id: "meta-llama/llama-3-405b-instruct", label: "llama-3-405b", provider: "Meta" },
        ],
      });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

describe("WatsonxClient", () => {
  it("exchanges the API key once and sends a chat request", async () => {
    const { impl, calls } = fakeFetch();
    const client = new WatsonxClient("key", "proj", "https://us-south.ml.cloud.ibm.com", impl);
    const out = await client.chat("ibm/granite-3-3-8b-instruct", [{ role: "user", content: "hi" }], {
      json: true,
    });
    await client.chat("ibm/granite-3-3-8b-instruct", [{ role: "user", content: "again" }]);

    expect(out).toBe('{"codename":"Night Owl"}');
    expect(calls.filter((c) => c.url.startsWith("https://iam")).length).toBe(1);
    const chat = calls.find((c) => c.url.includes("/text/chat"))!;
    const body = JSON.parse(String(chat.init?.body));
    expect(body).toMatchObject({ model_id: "ibm/granite-3-3-8b-instruct", project_id: "proj" });
    expect(body.response_format).toEqual({ type: "json_object" });
    expect((chat.init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("refuses banned models and filters them from the model list", async () => {
    const { impl } = fakeFetch();
    const client = new WatsonxClient("key", "proj", "https://us-south.ml.cloud.ibm.com", impl);
    await expect(client.chat("meta-llama/llama-3-405b-instruct", [])).rejects.toThrow(/banned/);
    const models = await client.listChatModels();
    expect(models.map((m) => m.modelId)).toEqual(["ibm/granite-3-3-8b-instruct"]);
  });
});

describe("extractJson", () => {
  it("parses bare, fenced, and prose-wrapped JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure! {"a":3} Hope it helps')).toEqual({ a: 3 });
    expect(() => extractJson("no json")).toThrow();
  });
});
