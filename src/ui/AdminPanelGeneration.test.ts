import { describe, expect, it } from "vitest";
import {
  buildArtistSeedPrompt,
  dataUrlToInlineDataPart,
  isGeminiSeedUnsupportedError
} from "./AdminPanel";

describe("AdminPanel generation helpers", () => {
  it("injects a stable seed consistency clause into artist prompts", () => {
    const prompt = buildArtistSeedPrompt("Top-down performer portrait", 424242);
    expect(prompt).toContain("Top-down performer portrait");
    expect(prompt).toContain("Consistency seed: 424242");
  });

  it("converts data URLs to inline_data request parts", () => {
    const part = dataUrlToInlineDataPart("data:image/png;base64,QUJDRA==");
    expect(part).toEqual({
      inline_data: {
        mime_type: "image/png",
        data: "QUJDRA=="
      }
    });
  });

  it("returns null when data URL is malformed", () => {
    expect(dataUrlToInlineDataPart("https://example.com/image.png")).toBeNull();
  });

  it("flags seed-specific schema failures for fallback retry", () => {
    expect(
      isGeminiSeedUnsupportedError(
        400,
        '{"error":{"message":"Unknown name \\"seed\\" at \\"generationConfig\\""}}'
      )
    ).toBe(true);
    expect(
      isGeminiSeedUnsupportedError(
        400,
        '{"error":{"message":"Field generationConfig.seed is not supported for this model"}}'
      )
    ).toBe(true);
  });

  it("does not flag unrelated request failures as seed-specific", () => {
    expect(
      isGeminiSeedUnsupportedError(401, '{"error":{"message":"Invalid API key"}}')
    ).toBe(false);
    expect(
      isGeminiSeedUnsupportedError(400, '{"error":{"message":"Prompt too long"}}')
    ).toBe(false);
  });
});
