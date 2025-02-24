import React, { useEffect, useState } from "react";
import { getCountryIso2ByName } from "../utils/countryLookup"; // Assuming utility function to get iso2
import { CountryFlagProps } from "../types/CountryFlagProps";
import LoadingSpinner from "./LoadingSpinner";

export const CountryFlag: React.FC<CountryFlagProps> = ({
    countryName,
    flagsBaseUrl = "https://default-flags.com", // Default base URL
    width = 30,
    height = "auto",
    altText,
    className,
    style,
    styleOverride,
    showCountryName = false,
    showFlagWithDetails = false,
    borderStyle = "none",
    borderRadius = "0",
    boxShadow = "none",
    animateOnLoad = false,
    hoverEffect = "none",
    backupUrls = [],
    preferLocalStorage = true,
    iconMode = false,
    countryStyle, // This is now correctly used
    multiSelectMode = false,
    groupFlagsByRegion = null,
    onLoad,
    onError,
    showTooltip = false,
    tooltipContent,
    isDropdown = false,
    dropdownOptions = [],
}) => {
    const [flagUrl, setFlagUrl] = useState<string | null>(null);
    const [countryData, setCountryData] = useState<any>(null); // For extra details (e.g., capital, population)
    const [flagLoaded, setFlagLoaded] = useState(false); // Flag loading state
    const iso2 = getCountryIso2ByName(countryName);

    // Fetch the flag URL and country details
    const fetchFlagUrl = async () => {
        if (!iso2) return;

        try {
            const response = await fetch(
                `${flagsBaseUrl}/api/getFlag?country=${iso2}`
            );
            const data = await response.json();
            setFlagUrl(data.secureUrl);
            setCountryData(data.countryDetails || null); // Assuming countryDetails are part of the response
            setFlagLoaded(true);
            onLoad?.(); // Call onLoad callback if provided
        } catch (error) {
            console.error("Error fetching flag:", error);
            onError?.(); // Call onError callback if provided
            handleFallback(); // Fallback to backup URLs
        }
    };

    const checkLocalStorage = () => {
        const storedFlagUrl = iso2 && localStorage.getItem(iso2);
        if (preferLocalStorage && storedFlagUrl) {
            setFlagUrl(storedFlagUrl); // Only set if there is a valid string in localStorage
        } else {
            fetchFlagUrl(); // Fetch the flag if it's not in localStorage or not preferred
        }
    };

    useEffect(() => {
        if (iso2) {
            checkLocalStorage();
        }
    }, [iso2, preferLocalStorage]);

    if (!flagLoaded) {
        return <LoadingSpinner />; // Display a loading spinner while flag is being fetched
      }
      

    // Handle fallback to backup URLs if the fetch fails
    const handleFallback = async () => {
        for (let url of backupUrls) {
            try {
                const response = await fetch(`${url}/api/getFlag?country=${iso2}`);
                const data = await response.json();
                setFlagUrl(data.secureUrl);
                setFlagLoaded(true);
                return;
            } catch (error) {
                continue; // Try the next URL in the list
            }
        }
    };

    // Handle hover effect
    const handleHover = (e: React.MouseEvent) => {
        const target = e.currentTarget as HTMLElement;
        if (hoverEffect === "zoom") target.style.transform = "scale(1.1)";
        else if (hoverEffect === "rotate") target.style.transform = "rotate(15deg)";
        else if (hoverEffect === "bounce")
            target.style.animation = "bounce 1s infinite";
    };

    const handleHoverEnd = (e: React.MouseEvent) => {
        const target = e.currentTarget as HTMLElement;
        target.style.transform = "none";
        target.style.animation = "none";
    };

    // Handle multiSelectMode: rendering multiple flags
    const handleMultiSelectFlags = () => {
        if (multiSelectMode && Array.isArray(countryName)) {
            return countryName.map((country) => (
                <CountryFlag
                    key={country}
                    countryName={country}
                    {...{
                        showCountryName,
                        width,
                        height,
                        showFlagWithDetails,
                        iconMode,
                        borderStyle,
                        borderRadius,
                        boxShadow,
                        styleOverride,
                    }}
                />
            ));
        }
        return null;
    };

    // Render dropdown options if required
    const renderDropdown = () => {
        if (isDropdown) {
            return (
                <select>
                    {dropdownOptions.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            );
        }
        return null;
    };

    // Render Tooltip
    const renderTooltip = () => {
        if (showTooltip && tooltipContent) {
            return <div className="tooltip">{tooltipContent(countryName)}</div>;
        }
        return null;
    };

    // Dynamic styles for flag when iconMode is enabled
    const flagStyle = {
        width: iconMode ? 20 : width, // Smaller size when iconMode is true
        height: iconMode ? 20 : height,
        borderStyle,
        borderRadius,
        boxShadow,
        ...style,
        ...styleOverride,
        ...countryStyle?.(countryName), // Apply country-specific styles
    };

    // Flag render with animation if needed
    const flagWithAnimation = animateOnLoad ? (
        <img
            src={flagUrl || ""}
            alt={altText || `${countryName} flag`}
            className={className}
            style={{
                ...flagStyle,
                opacity: flagLoaded ? 1 : 0,
                transition: "opacity 0.5s ease",
            }}
            onLoad={() => setFlagLoaded(true)}
            onError={handleFallback}
        />
    ) : (
        <img
            src={flagUrl || ""}
            alt={altText || `${countryName} flag`}
            className={className}
            style={flagStyle}
            onError={handleFallback}
        />
    );

    // Group flags by region if groupFlagsByRegion is provided
    const renderGroupedFlags = () => {
        if (groupFlagsByRegion) {
            return Object.keys(groupFlagsByRegion).map((region) => (
                <div key={region}>
                    <h3>{region}</h3>
                    <div>
                        {groupFlagsByRegion &&
                            region &&
                            groupFlagsByRegion[region]?.map((country) => (
                                <CountryFlag
                                    key={country}
                                    countryName={country}
                                    {...{
                                        showCountryName,
                                        width,
                                        height,
                                        showFlagWithDetails,
                                        iconMode,
                                        borderStyle,
                                        borderRadius,
                                        boxShadow,
                                        styleOverride,
                                        region,
                                    }}
                                />
                            ))}
                    </div>
                </div>
            ));
        }
        return null;
    };

    return (
        <div
            className={`${className} country-flag-container`}
            style={flagStyle}
            onMouseEnter={handleHover}
            onMouseLeave={handleHoverEnd}
        >
            {renderTooltip()}
            {handleMultiSelectFlags()}
            {renderGroupedFlags()}
            {showFlagWithDetails ? (
                <div>
                    {flagWithAnimation}
                    {countryData && (
                        <div>
                            <p>Capital: {countryData.capital}</p>
                            <p>Population: {countryData.population}</p>
                        </div>
                    )}
                </div>
            ) : (
                flagWithAnimation
            )}
            {showCountryName && <span>{countryName}</span>}
            {renderDropdown()}
        </div>
    );
};
