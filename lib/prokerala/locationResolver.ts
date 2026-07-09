export type ResolvedLocation = {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  timezoneOffset: string;
  timezoneId?: string;
};

type CityLocation = {
  name: string;
  state?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezoneOffset: string;
  timezoneId?: string;
};

const indianCities: CityLocation[] = [
  { name: "Agartala", state: "Tripura", latitude: 23.8315, longitude: 91.2868, timezoneOffset: "+05:30" },
  { name: "Delhi", state: "Delhi", latitude: 28.6139, longitude: 77.209, timezoneOffset: "+05:30" },
  { name: "Mumbai", state: "Maharashtra", latitude: 19.076, longitude: 72.8777, timezoneOffset: "+05:30" },
  { name: "Kolkata", state: "West Bengal", latitude: 22.5726, longitude: 88.3639, timezoneOffset: "+05:30" },
  { name: "Bengaluru", state: "Karnataka", latitude: 12.9716, longitude: 77.5946, timezoneOffset: "+05:30" },
  { name: "Chennai", state: "Tamil Nadu", latitude: 13.0827, longitude: 80.2707, timezoneOffset: "+05:30" },
  { name: "Hyderabad", state: "Telangana", latitude: 17.385, longitude: 78.4867, timezoneOffset: "+05:30" },
  { name: "Pune", state: "Maharashtra", latitude: 18.5204, longitude: 73.8567, timezoneOffset: "+05:30" },
  { name: "Jaipur", state: "Rajasthan", latitude: 26.9124, longitude: 75.7873, timezoneOffset: "+05:30" },
  { name: "Ahmedabad", state: "Gujarat", latitude: 23.0225, longitude: 72.5714, timezoneOffset: "+05:30" },
  { name: "Lucknow", state: "Uttar Pradesh", latitude: 26.8467, longitude: 80.9462, timezoneOffset: "+05:30" },
  { name: "Guwahati", state: "Assam", latitude: 26.1445, longitude: 91.7362, timezoneOffset: "+05:30" },
  { name: "Noida", state: "Uttar Pradesh", latitude: 28.5355, longitude: 77.391, timezoneOffset: "+05:30" },
  { name: "Gurugram", state: "Haryana", latitude: 28.4595, longitude: 77.0266, timezoneOffset: "+05:30" },
  { name: "Chandigarh", state: "Chandigarh", latitude: 30.7333, longitude: 76.7794, timezoneOffset: "+05:30" },
  { name: "Nainital", state: "Uttarakhand", latitude: 29.3919, longitude: 79.4542, timezoneOffset: "+05:30" },
  { name: "Bhopal", state: "Madhya Pradesh", latitude: 23.2599, longitude: 77.4126, timezoneOffset: "+05:30" },
  { name: "Indore", state: "Madhya Pradesh", latitude: 22.7196, longitude: 75.8577, timezoneOffset: "+05:30" },
  { name: "Patna", state: "Bihar", latitude: 25.5941, longitude: 85.1376, timezoneOffset: "+05:30" },
  { name: "Bhubaneswar", state: "Odisha", latitude: 20.2961, longitude: 85.8245, timezoneOffset: "+05:30" },
  { name: "Kochi", state: "Kerala", latitude: 9.9312, longitude: 76.2673, timezoneOffset: "+05:30" },
  { name: "Thiruvananthapuram", state: "Kerala", latitude: 8.5241, longitude: 76.9366, timezoneOffset: "+05:30" },
  { name: "Surat", state: "Gujarat", latitude: 21.1702, longitude: 72.8311, timezoneOffset: "+05:30" },
  { name: "Vadodara", state: "Gujarat", latitude: 22.3072, longitude: 73.1812, timezoneOffset: "+05:30" },
];

const aliases: Record<string, string> = {
  bangalore: "Bengaluru",
  gurgaon: "Gurugram",
  "new delhi": "Delhi",
  calcutta: "Kolkata",
  trivandrum: "Thiruvananthapuram",
  cochin: "Kochi",
};

function normalizePlace(place: string) {
  return place
    .toLowerCase()
    .replace(/\bnot\s+[a-z][a-z\s,.'-]*/g, " ")
    .replace(/[^a-z\s,.-]/g, " ")
    .replace(/\s*,+\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/,+/g, ",")
    .replace(/^[,\s.-]+|[,\s.-]+$/g, "")
    .trim();
}

function withIndiaFallback(place: string) {
  const normalizedPlace = normalizePlace(place);

  if (!normalizedPlace) return [];
  if (/\b(india|bharat)\b/.test(normalizedPlace)) return [normalizedPlace];

  return [normalizedPlace, normalizePlace(`${normalizedPlace}, India`)];
}

function toResolvedLocation(city: CityLocation): ResolvedLocation {
  const country = city.country || "India";
  const displayName = [city.name, city.state, country]
    .filter(Boolean)
    .join(", ");

  return {
    name: city.name,
    displayName,
    latitude: city.latitude,
    longitude: city.longitude,
    timezoneOffset: city.timezoneOffset,
    timezoneId: city.timezoneId || "Asia/Kolkata",
  };
}

export function resolveBirthPlace(place: string): ResolvedLocation | null {
  const candidates = withIndiaFallback(place);
  const aliasTarget = candidates.map((candidate) => aliases[candidate]).find(Boolean);

  if (aliasTarget) {
    const city = indianCities.find((item) => item.name === aliasTarget);

    return city ? toResolvedLocation(city) : null;
  }

  const city = indianCities.find((item) => {
    const searchableCity = normalizePlace(
      [item.name, item.state, item.country || "India"].filter(Boolean).join(", ")
    );
    const normalizedCity = normalizePlace(item.name);

    return candidates.some((normalizedPlace) => {
      if (!normalizedPlace) return false;

      const firstSegment = normalizedPlace.split(",")[0]?.trim();

      return (
        normalizedPlace === normalizedCity ||
        normalizedPlace === searchableCity ||
        normalizedPlace.includes(searchableCity) ||
        searchableCity.includes(normalizedPlace) ||
        Boolean(firstSegment && firstSegment === normalizedCity)
      );
    });
  });

  return city ? toResolvedLocation(city) : null;
}

export function findBirthPlaceSuggestions(place: string) {
  const candidates = withIndiaFallback(place);

  return indianCities
    .filter((city) => {
      const normalizedCity = normalizePlace(city.name);

      return candidates.some((candidate) => {
        const firstSegment = candidate.split(",")[0]?.trim();

        return (
          normalizedCity.startsWith(firstSegment || candidate) ||
          normalizedCity.includes(candidate)
        );
      });
    })
    .slice(0, 3)
    .map(toResolvedLocation);
}

export function getUnknownBirthPlaceResponse() {
  return "Please share your birth city with state and country so I can locate it correctly.";
}
