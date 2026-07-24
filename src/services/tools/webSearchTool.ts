import type { ToolDefinition, ToolResult } from "./ToolRegistry";

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description:
    "Search the web for current information. Returns relevant web results with titles, URLs, and article text.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
      numResults: {
        type: "number",
        description: "Number of results to return (default 5)",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  readOnly: true,

  async execute(): Promise<ToolResult> {
    // There is no OpenWhispr-hosted web search backend anymore, and no BYOK
    // web search provider is configured yet — the agent should fall back to
    // the same explicit-click Google search the core conversation aide uses.
    return {
      success: false,
      data: null,
      displayText: "Web search is not available. No search provider is configured.",
    };
  },
};
