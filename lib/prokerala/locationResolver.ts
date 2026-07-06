export type ResolvedLocation = {
  name: string;
  latitude: number;
  longitude: number;
  timezoneOffset: string;
};

const indianCities: ResolvedLocation[] = [
  { name: "Agartala", latitude: 23.8315, longitude: 91.2868, timezoneOffset: "+05:30" },
  { name: "Delhi", latitude: 28.6139, longitude: 77.209, timezoneOffset: "+05:30" },
  { name: "Mumbai", latitude: 19.076, longitude: 72.8777, timezoneOffset: "+05:30" },
  { name: "Kolkata", latitude: 22.5726, longitude: 88.3639, timezoneOffset: "+05:30" },
  { name: "Bengaluru", latitude: 12.9716, longitude: 77.5946, timezoneOffset: "+05:30" },
  { name: "Chennai", latitude: 13.0827, longitude: 80.2707, timezoneOffset: "+05:30" },
  { name: "Hyderabad", latitude: 17.385, longitude: 78.4867, timezoneOffset: "+05:30" },
  { name: "Pune", latitude: 18.5204, longitude: 73.8567, timezoneOffset: "+05:30" },
  { name: "Jaipur", latitude: 26.9124, longitude: 75.7873, timezoneOffset: "+05:30" },
  { name: "Ahmedabad", latitude: 23.0225, longitude: 72.5714, timezoneOffset: "+05:30" },
  { name: "Lucknow", latitude: 26.8467, longitude: 80.9462, timezoneOffset: "+05:30" },
  { name: "Guwahati", latitude: 26.1445, longitude: 91.7362, timezoneOffset: "+05:30" },
  { name: "Noida", latitude: 28.5355, longitude: 77.391, timezoneOffset: "+05:30" },
  { name: "Gurugram", latitude: 28.4595, longitude: 77.0266, timezoneOffset: "+05:30" },
  { name: "Chandigarh", latitude: 30.7333, longitude: 76.7794, timezoneOffset: "+05:30" },
  { name: "Bhopal", latitude: 23.2599, longitude: 77.4126, timezoneOffset: "+05:30" },
  { name: "Indore", latitude: 22.7196, longitude: 75.8577, timezoneOffset: "+05:30" },
  { name: "Patna", latitude: 25.5941, longitude: 85.1376, timezoneOffset: "+05:30" },
  { name: "Bhubaneswar", latitude: 20.2961, longitude: 85.8245, timezoneOffset: "+05:30" },
  { name: "Kochi", latitude: 9.9312, longitude: 76.2673, timezoneOffset: "+05:30" },
  { name: "Thiruvananthapuram", latitude: 8.5241, longitude: 76.9366, timezoneOffset: "+05:30" },
  { name: "Surat", latitude: 21.1702, longitude: 72.8311, timezoneOffset: "+05:30" },
  { name: "Vadodara", latitude: 22.3072, longitude: 73.1812, timezoneOffset: "+05:30" },
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
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveBirthPlace(place: string): ResolvedLocation | null {
  const normalizedPlace = normalizePlace(place);
  const aliasTarget = aliases[normalizedPlace];

  if (aliasTarget) {
    return (
      indianCities.find((city) => city.name === aliasTarget) || null
    );
  }

  return (
    indianCities.find((city) => {
      const normalizedCity = normalizePlace(city.name);

      return (
        normalizedPlace === normalizedCity ||
        normalizedPlace.includes(normalizedCity) ||
        normalizedCity.includes(normalizedPlace)
      );
    }) || null
  );
}

export function getUnknownBirthPlaceResponse() {
  return "Please share your birth city with state and country so I can locate it correctly.";
}
