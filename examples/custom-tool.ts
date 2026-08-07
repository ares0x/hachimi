/**
 * Example: Creating a custom tool for Hachimi
 *
 * This demonstrates how to add a custom tool that can be called by the agent.
 */

import type { Tool } from "@hachimi/core";

export const weatherTool: Tool = {
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "City name (e.g., 'Shenzhen', 'Tokyo')",
      },
    },
    required: ["city"],
  },
  permission: "safe",
  async execute(params) {
    const city = params.city as string;
    // In production, call a real weather API here
    return {
      content: `Weather for ${city}: 22°C, partly cloudy`,
      data: { city, temp: 22, condition: "partly cloudy" },
    };
  },
};

// Register in your capability source:
// const source: CapabilitySource<Tool> = {
//   id: "custom-weather",
//   fetch: async () => [weatherTool],
// };
