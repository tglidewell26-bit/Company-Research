import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const TERRITORY_BOUNDS = {
  lat_min: 37.35,
  lat_max: 37.81,
  lon_min: -122.55,
  lon_max: -121.85,
};

async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lon: number } | null> {
  const url = "https://nominatim.openstreetmap.org/search";
  const params = new URLSearchParams({
    q: address,
    format: "json",
    limit: "1",
  });

  try {
    const response = await fetch(`${url}?${params}`, {
      headers: {
        "User-Agent": "TerritoryIntelligenceBot/1.0",
      },
    });
    const data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function inTerritory(lat: number, lon: number): boolean {
  return (
    lat >= TERRITORY_BOUNDS.lat_min &&
    lat <= TERRITORY_BOUNDS.lat_max &&
    lon >= TERRITORY_BOUNDS.lon_min &&
    lon <= TERRITORY_BOUNDS.lon_max
  );
}

export const geocodeAndValidateTerritoryTool = createTool({
  id: "geocode-and-validate-territory",
  description:
    "Geocodes a company address using OpenStreetMap Nominatim and checks if it falls within the San Francisco to Mountain View territory bounding box.",

  inputSchema: z.object({
    companies: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
        address: z.string().optional(),
      }),
    ),
  }),

  outputSchema: z.object({
    validCompanies: z.array(
      z.object({
        name: z.string(),
        website: z.string(),
        address: z.string(),
        lat: z.number(),
        lon: z.number(),
        inTerritory: z.boolean(),
      }),
    ),
    outOfTerritoryCount: z.number(),
    geocodeFailCount: z.number(),
  }),

  execute: async (inputData, context) => {
    const logger = context?.mastra?.getLogger();
    logger?.info(
      `🗺️ [geocoder] Geocoding ${inputData.companies.length} companies`,
    );

    const results = [];
    let outOfTerritoryCount = 0;
    let geocodeFailCount = 0;

    for (const company of inputData.companies) {
      const address =
        company.address || `${company.name}, San Francisco Bay Area, CA`;

      await new Promise((r) => setTimeout(r, 600));

      let coords = await geocodeAddress(address);

      if (!coords && company.address) {
        const cityMatch = company.address.match(
          /(?:San Francisco|South San Francisco|Daly City|Brisbane|San Bruno|Millbrae|Burlingame|San Mateo|Foster City|Belmont|San Carlos|Redwood City|Menlo Park|Palo Alto|Mountain View|Sunnyvale)/i,
        );
        if (cityMatch) {
          logger?.info(
            `🗺️ [geocoder] ${company.name} - retrying with city: ${cityMatch[0]}, CA`,
          );
          await new Promise((r) => setTimeout(r, 1100));
          coords = await geocodeAddress(`${cityMatch[0]}, CA`);
        }
      }

      if (!coords) {
        geocodeFailCount++;
        logger?.info(
          `❌ [geocoder] ${company.name} - geocoding failed for: ${address}`,
        );
        continue;
      }

      const isInTerritory = inTerritory(coords.lat, coords.lon);
      if (!isInTerritory) {
        outOfTerritoryCount++;
        logger?.info(
          `📍 [geocoder] ${company.name} - out of territory: lat=${coords.lat}, lon=${coords.lon}`,
        );
      } else {
        logger?.info(
          `✅ [geocoder] ${company.name} - in territory: lat=${coords.lat}, lon=${coords.lon}`,
        );
      }

      results.push({
        name: company.name,
        website: company.website,
        address,
        lat: coords.lat,
        lon: coords.lon,
        inTerritory: isInTerritory,
      });
    }

    logger?.info(
      `🗺️ [geocoder] Complete: ${results.filter((r) => r.inTerritory).length} in territory, ${outOfTerritoryCount} out, ${geocodeFailCount} failed`,
    );

    return {
      validCompanies: results,
      outOfTerritoryCount,
      geocodeFailCount,
    };
  },
});
