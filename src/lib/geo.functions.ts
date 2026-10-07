import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type RawCountry = { isoCode: string; name: string; flag: string; phonecode: string };
type RawState = { isoCode: string; name: string; countryCode: string };

export const listCountries = createServerFn({ method: "GET" }).handler(async () => {
  const list = (await import("country-state-city/lib/assets/country.json")).default as RawCountry[];
  return list.map((c) => ({ code: c.isoCode, name: c.name, flag: c.flag, phone: c.phonecode }));
});

export const listStates = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ country: z.string().length(2) }).parse(d))
  .handler(async ({ data }) => {
    const list = (await import("country-state-city/lib/assets/state.json")).default as RawState[];
    return list
      .filter((s) => s.countryCode === data.country)
      .map((s) => ({ code: s.isoCode, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
