export interface PerchanceResponse {
  success: boolean;
  generator: string;
  list: string;
  results: string[];
  availableLists?: string[];
  error?: string;
}

export async function generateFromPerchance(
  generatorName: string,
  listName: string = "output",
  count: number = 1
): Promise<PerchanceResponse> {
  try {
    const res = await fetch("/api/perchance/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generatorName, listName, count })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to fetch from Perchance generator");
    }

    return data;
  } catch (err: any) {
    return {
      success: false,
      generator: generatorName,
      list: listName,
      results: [],
      error: err?.message || "Failed to connect to Perchance API"
    };
  }
}

export async function inspectPerchanceGenerator(
  generatorName: string
): Promise<{ success: boolean; availableLists: string[]; sampleOutput: string; error?: string }> {
  try {
    const res = await fetch("/api/perchance/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generatorName })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to inspect Perchance generator");
    }

    return {
      success: true,
      availableLists: data.availableLists || [],
      sampleOutput: data.sampleOutput || ""
    };
  } catch (err: any) {
    return {
      success: false,
      availableLists: [],
      sampleOutput: "",
      error: err?.message || "Failed to inspect generator"
    };
  }
}
