import React from "react";
const lookup = require("country-code-lookup");

const formatCountryName = (name) => {
  if (typeof name !== "string") return ""; // Handle non-string inputs
  return name
    .toLowerCase() // Convert to lowercase first
    .replace(/\b\w/g, (c) => c.toUpperCase()); // Convert to title case
};

const CountryFlag = ({ countryName }) => {
  function importAll(r) {
    let images = {};
    r.keys().forEach((item, index) => {
      images[item.replace("./", "")] = r(item);
    });
    return images;
  }

  const images = importAll(
    require.context("../../../Images/Flags/", false, /\.(png|jpe?g|svg)$/)
  );

  // Format the countryName to ensure consistent capitalization
  const formattedCountryName = formatCountryName(countryName);

  // Get the abbreviation based on the formattedCountryName or default to "US" for United States
  const countryInfo = lookup.byCountry(formattedCountryName);
  const abbreviation = countryInfo ? countryInfo.iso2 : "US";
  const flagSrc = images[`${abbreviation}.svg`];

  return (
    <div>
      {flagSrc ? (
        <img
          src={flagSrc}
          alt={formattedCountryName}
          style={{ marginRight: "4px", marginTop: "4px" }}
          width={"30px"}
          height={"auto"}
        />
      ) : (
        <span>No flag found for {formattedCountryName}</span>
      )}
    </div>
  );
};

export default CountryFlag; 
