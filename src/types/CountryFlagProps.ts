export interface CountryFlagProps {
  countryName: string;
  flagsBaseUrl?: string; 
  width?: number | string;
  height?: number | string; 
  altText?: string;
  className?: string; // Additional CSS class names
  style?: React.CSSProperties; // Custom styles applied directly to the flag
  styleOverride?: React.CSSProperties; // Full style object override
  showCountryName?: boolean; // Optionally show country name next to flag
  showFlagWithDetails?: boolean; // Flag + additional metadata (like capital, population)
  borderStyle?: string; // Custom border style (e.g., 'solid', 'dashed')
  borderRadius?: string | number; // Rounded corners (e.g., '50%' for circular)
  boxShadow?: string; // Shadow effects around the flag (e.g., '0 0 10px rgba(0,0,0,0.3)')
  animateOnLoad?: boolean; // Apply animation when the flag image loads (e.g., fade-in)
  hoverEffect?: "zoom" | "rotate" | "bounce"; // Hover effect on the flag (e.g., zoom)
  backupUrls?: string[]; // Fallback URLs to try if the main URL fails
  preferLocalStorage?: boolean; // Use local storage first for faster flag fetching
  iconMode?: boolean; // Flag rendered as a small icon instead of full image
  countryStyle?: (country: string) => React.CSSProperties; // Dynamic styles based on the country
  multiSelectMode?: boolean; // Enable multiple flag selections (e.g., in a list or settings page)
  groupFlagsByRegion?: GroupFlagsByRegion; // Predefined flag regions (e.g., all African countries)
  region?: string;
  onLoad?: () => void; // Callback when the flag image loads successfully
  onError?: () => void; // Callback when the flag image fails to load
  showTooltip?: boolean; // Display a tooltip on hover
  tooltipContent?: (country: string) => string; // Dynamic tooltip content (e.g., population, region)
  isDropdown?: boolean; // Flag as part of a dropdown selector
  dropdownOptions?: string[]; // List of countries for the dropdown
}


interface GroupFlagsByRegion {
  [region: string]: string[]; // assuming the countries are represented by their names (or ISO codes)
}
