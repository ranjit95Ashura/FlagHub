(function (global) {
    const API_URL =
        "https://cloudflare-worker.ranjitsuryawanshi952.workers.dev/api/getFlag";

    async function fetchFlag(country) {
        if (!country) {
            console.error("Country code is required.");
            return;
        }

        try {
            const response = await fetch(
                `${API_URL}?country=${encodeURIComponent(country)}`
            );
            const data = await response.json();

            if (data.success && data.secureUrl) {
                return data.secureUrl;
            } else {
                console.error("Failed to fetch flag:", data.message);
                return null;
            }
        } catch (error) {
            console.error("Error fetching flag:", error);
            return null;
        }
    }

    global.getCountryFlag = async function (country, imgElementId) {
        const flagUrl = await fetchFlag(country);
        if (flagUrl) {
            const imgElement = document.getElementById(imgElementId);
            if (imgElement) {
                imgElement.src = flagUrl;
            } else {
                console.error(`Image element with ID '${imgElementId}' not found.`);
            }
        }
    };
})(window);
