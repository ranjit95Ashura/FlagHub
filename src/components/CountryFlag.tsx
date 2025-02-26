import React, { useEffect, useState } from "react";
import { getCountryIso2ByName } from "../utils/countryLookup";
import { CountryFlagProps } from "../types/CountryFlagProps";
import LoadingSpinner from "./LoadingSpinner";

export const CountryFlag: React.FC<CountryFlagProps> = ({
    countryName,
    flagsBaseUrl = "https://default-flags.com",
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
    countryStyle,
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
    const [countryData, setCountryData] = useState<any>(null);
    const [flagLoaded, setFlagLoaded] = useState(false);
    const [iso2, setIso2] = useState<string | null>(null); // Store iso2 in state

    useEffect(() => {
        const calculatedIso2 = getCountryIso2ByName(countryName);
        setIso2(calculatedIso2); // Update iso2 when countryName changes
    }, [countryName]); // Recalculate iso2 on countryName change

    useEffect(() => {
        if (iso2) {
            checkLocalStorage();
        }
    }, [iso2, preferLocalStorage]);

    const checkLocalStorage = () => {
        const storedFlagUrl = iso2 && localStorage.getItem(iso2);
        if (preferLocalStorage && storedFlagUrl) {
            setFlagUrl(storedFlagUrl);
        } else {
            fetchFlagUrl();
        }
    };

    const fetchFlagUrl = async () => {
        if (!iso2) return;

        try {
            const response = await fetch(
                `${flagsBaseUrl}/api/getFlag?country=${iso2}`
            );
            const data = await response.json();
            setFlagUrl(data.secureUrl);
            setCountryData(data.countryDetails || null);
            setFlagLoaded(true);
            onLoad?.();
        } catch (error) {
            console.error("Error fetching flag:", error);
            onError?.();
            handleFallback();
        }
    };

    const handleFallback = async () => {
        for (const url of backupUrls) {
            // Use const for loop variable
            try {
                const response = await fetch(`${url}/api/getFlag?country=${iso2}`);
                const data = await response.json();
                setFlagUrl(data.secureUrl);
                setFlagLoaded(true);
                return;
            } catch (error) {
                console.error(`Error fetching flag from ${url}:`, error); // Include URL in error message
                continue;
            }
        }
        if (!flagLoaded && onError) {
            //Call onError if all backup urls have failed
            onError();
        }
    };

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

    const flagStyle = {
        width: iconMode ? 20 : width,
        height: iconMode ? 20 : height,
        borderStyle,
        borderRadius,
        boxShadow,
        ...style,
        ...styleOverride,
        ...countryStyle?.(countryName),
    };

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

    if (!flagLoaded) {
        return <LoadingSpinner />;
    }

    //MultiSelect and Grouped Flags Optimization: Moved logic to parent component
    if (multiSelectMode || groupFlagsByRegion) return null; // Component renders nothing when in these modes

    const renderTooltip = () => {
        if (showTooltip && tooltipContent) {
            return <div className="tooltip">{tooltipContent(countryName)}</div>;
        }
        return null;
    };

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

    return (
        <div
            className={`${className} country-flag-container`}
            style={flagStyle}
            onMouseEnter={handleHover}
            onMouseLeave={handleHoverEnd}
        >
            {renderTooltip()}
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
