import lookup from 'country-code-lookup';

/**
 * Returns ISO Alpha-2 code for a given country name
 * @param countryName - Name of the country (e.g., 'United States', 'Japan')
 * @returns ISO Alpha-2 country code (e.g., 'US', 'JP') or null if not found
 */
export const getCountryIso2ByName = (countryName: string): string | null => {
  if (!countryName) return null;

  const formattedName = countryName.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const countryInfo = lookup.byCountry(formattedName);

  return countryInfo ? countryInfo.iso2 : null;
};
