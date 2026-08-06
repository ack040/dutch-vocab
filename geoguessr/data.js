/* GeoGuessr Tells Trainer — data
 *
 * A "tell" is a meta clue that helps you pin down a country/region in a
 * street-view guessing game: which side people drive on, the shape of the
 * bollards, the colour of the licence plates, the script on the signs, and so
 * on. This file is the whole knowledge base — no network, works offline.
 *
 * Each country lists its tells keyed by category. A value is either a single
 * string or an array of strings (each becomes its own bullet). Keep tells
 * short, concrete and visually checkable — the kind of thing you can actually
 * spot in a panorama.
 */

// Display order + icon/label for every tell category.
const GG_CATEGORIES = [
  { id: "drive",   label: "Driving side",       icon: "🚗" },
  { id: "lang",    label: "Language & script",  icon: "🔤" },
  { id: "plate",   label: "Licence plates",     icon: "🔖" },
  { id: "bollard", label: "Bollards",           icon: "🚧" },
  { id: "lines",   label: "Road markings",      icon: "🛣️" },
  { id: "signs",   label: "Road signs",         icon: "🚸" },
  { id: "poles",   label: "Utility poles",      icon: "💡" },
  { id: "arch",    label: "Architecture",       icon: "🏠" },
  { id: "land",    label: "Landscape & nature", icon: "⛰️" },
  { id: "car",     label: "Google car / camera",icon: "📷" },
  { id: "misc",    label: "Other giveaways",    icon: "🔍" },
];

const GG_CAT_MAP = Object.fromEntries(GG_CATEGORIES.map((c) => [c.id, c]));

// Broad regions used for filtering and for picking believable quiz distractors.
const GG_REGIONS = [
  "Western Europe",
  "Northern Europe",
  "Southern Europe",
  "Eastern Europe",
  "East Asia",
  "Southeast Asia",
  "South Asia",
  "Oceania",
  "North America",
  "Latin America",
  "Africa",
  "Middle East",
];

const GG_COUNTRIES = [
  {
    name: "Netherlands", flag: "🇳🇱", region: "Western Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "Dutch, and .nl domains on vans and billboards.",
      plate: "Yellow plates front AND back — one of the clearest EU tells.",
      lines: "Red-asphalt cycle paths run beside almost every road.",
      poles: "Utilities are mostly buried; you rarely see wooden poles.",
      arch: "Neat brick row houses with stepped/gabled facades.",
      land: "Extremely flat — canals, drainage ditches, polders, wind turbines.",
      misc: "White-on-blue ANWB direction signs; famously tidy streets.",
    },
  },
  {
    name: "Belgium", flag: "🇧🇪", region: "Western Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "Dutch in the north (Flanders), French in the south (Wallonia), German in the far east.",
      plate: "Dark red characters on a white plate.",
      poles: "Street lamps bolted to house facades and strung across streets on wires — very Belgian.",
      lines: 'Concrete-slab motorways that go "thunk-thunk"; roads often look worn.',
      arch: "Ribbon development — houses strung continuously along roads; mixed, busy streetscapes.",
      misc: "Looks 'messier' than the tidy Netherlands; orange-lit motorways at night.",
    },
  },
  {
    name: "Germany", flag: "🇩🇪", region: "Western Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "German; .de domains.",
      plate: "White plate, black text, blue EU strip with a 'D'.",
      bollard: "White bollard with a small black/grey reflector cap.",
      signs: "Yellow diamond priority-road sign is everywhere.",
      arch: "Half-timbered (Fachwerk) houses in old towns; tidy modern suburbs.",
      misc: "Autobahn stretches with no general speed limit; red-and-white kerbstones.",
    },
  },
  {
    name: "France", flag: "🇫🇷", region: "Western Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "French; .fr domains.",
      plate: "White plate, EU strip with 'F', a region number on the right edge.",
      bollard: "Bollards often carry a red reflective band.",
      signs: "'Toutes directions' signs; yellow diamond priority signs; La Poste yellow.",
      arch: "Stone/beige houses with window shutters (volets); terracotta roofs in the south.",
      land: "Avenues of plane trees along rural roads.",
    },
  },
  {
    name: "Spain", flag: "🇪🇸", region: "Southern Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "Spanish (also Catalan, Basque, Galician regionally); .es domains.",
      plate: "White plate, blue EU strip with 'E' — no region letters since 2000.",
      signs: "Stone kilometre posts; town-entry signs white with a red border.",
      arch: "White or terracotta houses, flat roofs in the south, apartment blocks.",
      land: "Dry ochre/red soil, olive groves and vineyards, mountainous interior.",
    },
  },
  {
    name: "Portugal", flag: "🇵🇹", region: "Southern Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "Portuguese (lots of ã/õ nasal spellings); .pt domains.",
      plate: "Yellow strip on the RIGHT of the plate (date) plus the EU strip with 'P'.",
      arch: "Azulejo tiled facades; black-and-white patterned 'calçada' cobble pavements.",
      land: "Eucalyptus and cork-oak; bright Atlantic light.",
    },
  },
  {
    name: "Italy", flag: "🇮🇹", region: "Southern Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "Italian; .it domains.",
      plate: "White plate with blue strips on BOTH sides — province code on the right.",
      signs: "Street names on marble/stone plaques mounted on buildings.",
      arch: "Ochre and pastel plaster, green shutters, terracotta roofs.",
      land: "Cypress rows in Tuscany; Alps in the north; olive and vine country.",
      poles: "Overhead wires get common in the south.",
    },
  },
  {
    name: "United Kingdom", flag: "🇬🇧", region: "Western Europe",
    tells: {
      drive: "Drives on the LEFT.",
      lang: "English; .co.uk / .uk domains.",
      plate: "Front plate white, rear plate yellow.",
      lines: "Double yellow lines along kerbs mean no parking.",
      signs: "Transport typeface; distances and speeds in MILES.",
      arch: "Brick terraced houses, hedgerows, endless roundabouts.",
      misc: "National speed limit shown by a white circle with a black diagonal.",
    },
  },
  {
    name: "Ireland", flag: "🇮🇪", region: "Western Europe",
    tells: {
      drive: "Drives on the LEFT.",
      lang: "Bilingual English + Irish (Gaeilge) on signs.",
      plate: "County name in Irish across the top; blue EU strip with 'IRL'.",
      signs: "Yellow diamond warning signs (like the US) — NOT the UK's white triangles.",
      arch: "Green fields split by hedges and stone walls; bungalows.",
      misc: "Speeds/distances in KM — the quickest way to split Ireland from the UK.",
    },
  },
  {
    name: "Sweden", flag: "🇸🇪", region: "Northern Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "Swedish (å, ä, ö); .se domains.",
      plate: "White plate, blue EU strip with 'S' and a small Swedish flag.",
      arch: "Red 'Falu' wooden houses with white trim.",
      land: "Endless pine and birch forest; long straight roads.",
      misc: "Reflector snow poles along road edges.",
    },
  },
  {
    name: "Norway", flag: "🇳🇴", region: "Northern Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "Norwegian; .no domains.",
      plate: "White plate, EU strip with 'N'.",
      arch: "Wooden houses, often dark-red or white; occasional grass roofs.",
      land: "Fjords, steep mountains, tunnels everywhere.",
      misc: "Yellow-and-black hazard posts; toll (bomstasjon) gantries over roads.",
    },
  },
  {
    name: "Finland", flag: "🇫🇮", region: "Northern Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "Finnish (double letters aa/kk/ää); some Swedish on signs; .fi domains.",
      plate: "White plate, EU strip with 'FIN'.",
      land: "Flat, dense birch/pine forest and lakes; very few hills.",
      misc: "Reindeer warning signs and snow stakes in the north.",
    },
  },
  {
    name: "Denmark", flag: "🇩🇰", region: "Northern Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "Danish (æ, ø, å); .dk domains.",
      plate: "Plate has a RED border plus the EU strip with 'DK'.",
      land: "Flat farmland, wind turbines, no mountains at all.",
      arch: "Brick houses; huge numbers of cyclists.",
    },
  },
  {
    name: "Poland", flag: "🇵🇱", region: "Eastern Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "Polish (ł, ż, ś, cz, sz); .pl domains.",
      plate: "White plate, blue EU strip with 'PL', black text.",
      poles: "Concrete utility poles are common.",
      arch: "Communist-era blocks mixed with new pastel houses.",
      misc: "Roadside Catholic shrines and crosses.",
    },
  },
  {
    name: "Czechia", flag: "🇨🇿", region: "Eastern Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "Czech (háček accents: č, š, ž, ř); .cz domains.",
      plate: "White plate, EU strip with 'CZ'.",
      poles: "Concrete poles; older overhead wiring.",
      arch: "Baroque/pastel town squares; rolling wooded hills.",
    },
  },
  {
    name: "Russia", flag: "🇷🇺", region: "Eastern Europe",
    tells: {
      drive: "Drives on the right.",
      lang: "Russian — CYRILLIC script.",
      plate: "White plate, black text, region code and a Russian flag on the right.",
      arch: "Soviet-era apartment blocks, wooden dachas, plenty of Ladas.",
      land: "Birch forest and huge open plains.",
      misc: "Blue direction signs in Cyrillic.",
    },
  },
  {
    name: "Turkey", flag: "🇹🇷", region: "Middle East",
    tells: {
      drive: "Drives on the right.",
      lang: "Turkish — Latin script with ı, ş, ğ, ç.",
      plate: "White plate, blue strip on the LEFT with 'TR' and a red crescent; province number.",
      misc: "Turkish flags absolutely everywhere; blue direction signs.",
      land: "Dry plateau and mountains; minarets on every skyline.",
    },
  },
  {
    name: "Japan", flag: "🇯🇵", region: "East Asia",
    tells: {
      drive: "Drives on the LEFT.",
      lang: "Japanese — kanji, hiragana and katakana together.",
      plate: "Number plates: white for private cars, YELLOW for small 'kei' cars.",
      poles: "Dense forests of utility poles with tangled overhead wires.",
      signs: "Blue direction signs with Japanese + English; narrow streets.",
      misc: "Vending machines on quiet streets; red-and-white snow poles up north.",
    },
  },
  {
    name: "South Korea", flag: "🇰🇷", region: "East Asia",
    tells: {
      drive: "Drives on the right.",
      lang: "Korean — Hangul (circles and boxes, very distinct from Japanese/Chinese).",
      plate: "White plates with Hangul; some older green plates.",
      arch: "Tall apartment complexes with GIANT painted building numbers; neon signage.",
      land: "Mountainous, lots of tunnels.",
      misc: "Green/blue direction signs in Hangul + English.",
    },
  },
  {
    name: "Taiwan", flag: "🇹🇼", region: "East Asia",
    tells: {
      drive: "Drives on the right.",
      lang: "Traditional Chinese characters (more strokes than mainland's simplified).",
      poles: "Heavy overhead wiring; scooters everywhere.",
      misc: "Blue-and-white street signs with romanised names; betel-nut stands; humid green hills.",
    },
  },
  {
    name: "Thailand", flag: "🇹🇭", region: "Southeast Asia",
    tells: {
      drive: "Drives on the LEFT.",
      lang: "Thai script — curly, full of little loops.",
      plate: "Bright, colourful plates with the province name in Thai.",
      misc: "Royal portraits and yellow flags; Buddhist temples (wat); warm colour cast.",
      land: "Tropical — rice paddies and palms.",
    },
  },
  {
    name: "Indonesia", flag: "🇮🇩", region: "Southeast Asia",
    tells: {
      drive: "Drives on the LEFT.",
      lang: "Indonesian — Latin script, no accents.",
      plate: "Older plates are BLACK with white text — very distinctive.",
      poles: "Concrete poles with heavy overhead wiring.",
      misc: "Mosques, red-and-white flags, swarms of motorbikes; lush tropical green.",
    },
  },
  {
    name: "Malaysia", flag: "🇲🇾", region: "Southeast Asia",
    tells: {
      drive: "Drives on the LEFT.",
      lang: "Malay (Latin script); also Chinese and Tamil shop signage.",
      plate: "Black plates with white text.",
      land: "Endless palm-oil plantations; tropical and humid.",
      misc: "Mosques and multi-ethnic signage.",
    },
  },
  {
    name: "Philippines", flag: "🇵🇭", region: "Southeast Asia",
    tells: {
      drive: "Drives on the right.",
      lang: "Filipino + English — a lot of signage is in English.",
      misc: "Jeepneys, tricycles, and a basketball court in every barangay.",
      poles: "Tangled overhead wires; tropical vegetation.",
    },
  },
  {
    name: "India", flag: "🇮🇳", region: "South Asia",
    tells: {
      drive: "Drives on the LEFT.",
      lang: "Hindi (Devanagari) + English, plus many regional scripts.",
      plate: "Yellow plates for commercial vehicles, white for private.",
      misc: "Auto-rickshaws, brightly painted 'Horn OK Please' trucks, roaming cows.",
      arch: "Dense, colourful, dusty streetscapes.",
    },
  },
  {
    name: "Australia", flag: "🇦🇺", region: "Oceania",
    tells: {
      drive: "Drives on the LEFT.",
      lang: "English; .com.au domains.",
      plate: "State-based plates, often with a slogan.",
      signs: "Yellow diamond kangaroo warning signs; distances in KM.",
      land: "Red outback soil, gum (eucalyptus) trees, dry yellow grass.",
      car: "The camera car is right-hand drive; wide, empty roads.",
    },
  },
  {
    name: "New Zealand", flag: "🇳🇿", region: "Oceania",
    tells: {
      drive: "Drives on the LEFT.",
      lang: "English + Māori place names; .co.nz domains.",
      land: "Green rolling hills, huge numbers of sheep, dramatic mountains.",
      signs: "Yellow diamond warnings; one-lane bridge signs.",
      misc: "Volcanic terrain; far fewer billboards than Australia.",
    },
  },
  {
    name: "United States", flag: "🇺🇸", region: "North America",
    tells: {
      drive: "Drives on the right.",
      lang: "English; .com everywhere.",
      plate: "Colourful state plates; many states need no FRONT plate.",
      signs: "Yellow diamond warnings, green highway shields; distances in MILES.",
      poles: "Wooden utility poles line almost every road.",
      misc: "Wide roads and shoulders, fire hydrants, flags, strip malls.",
    },
  },
  {
    name: "Canada", flag: "🇨🇦", region: "North America",
    tells: {
      drive: "Drives on the right.",
      lang: "English; French in Québec, with bilingual signage.",
      plate: "Province plates — Québec reads 'Je me souviens'.",
      signs: "Distances in KM (the US uses miles); French signage in Québec.",
      land: "Boreal forest, maple trees, big open highways.",
      misc: "French + km speeds is the fastest tell to separate it from the US.",
    },
  },
  {
    name: "Mexico", flag: "🇲🇽", region: "Latin America",
    tells: {
      drive: "Drives on the right.",
      lang: "Spanish; .mx domains.",
      misc: "'Topes' (speed bump) and 'Vado' signs; OXXO convenience stores.",
      poles: "Concrete/wood poles with heavy wiring.",
      land: "Dry, mountainous, colourful painted buildings.",
    },
  },
  {
    name: "Brazil", flag: "🇧🇷", region: "Latin America",
    tells: {
      drive: "Drives on the right.",
      lang: "Brazilian Portuguese.",
      plate: "Mercosur plates — grey with a blue strip and a small Brazil flag.",
      poles: "Lots of overhead wires.",
      land: "Red soil, tropical green, hillside favelas.",
      misc: "Red-and-white painted kerbs; speed bumps (lombada).",
    },
  },
  {
    name: "Argentina", flag: "🇦🇷", region: "Latin America",
    tells: {
      drive: "Drives on the right.",
      lang: "Spanish; .ar domains.",
      plate: "Mercosur plates with a blue strip and 'AR'.",
      land: "Flat pampas grassland; the Andes rise in the west.",
      misc: "Rows of poplar windbreaks along fields.",
    },
  },
  {
    name: "Chile", flag: "🇨🇱", region: "Latin America",
    tells: {
      drive: "Drives on the right.",
      lang: "Spanish; .cl domains.",
      plate: "Mercosur plates with 'CL'.",
      land: "Long and narrow — Andes to the east, Pacific to the west; desert north, forest south.",
      misc: "Yellow diamond signs; steep terrain gradients.",
    },
  },
  {
    name: "Colombia", flag: "🇨🇴", region: "Latin America",
    tells: {
      drive: "Drives on the right.",
      lang: "Spanish; .co domains.",
      plate: "Yellow plates for private cars.",
      land: "Steep green mountains, coffee country.",
      misc: "Swarms of motorbikes; colourful towns.",
    },
  },
  {
    name: "South Africa", flag: "🇿🇦", region: "Africa",
    tells: {
      drive: "Drives on the LEFT.",
      lang: "English + Afrikaans and other official languages on signage.",
      plate: "Province-coded plates (e.g. 'GP' for Gauteng).",
      land: "Savanna, dry grass, distinctive reddish soil.",
      misc: "Informal settlements; right-hand-drive camera car.",
    },
  },
  {
    name: "Kenya", flag: "🇰🇪", region: "Africa",
    tells: {
      drive: "Drives on the LEFT.",
      lang: "English + Swahili.",
      land: "Red soil, savanna, acacia trees; equator signs.",
      misc: "Brightly decorated 'matatu' minibuses.",
    },
  },
  {
    name: "Ghana", flag: "🇬🇭", region: "Africa",
    tells: {
      drive: "Drives on the right.",
      lang: "English; Twi and other local languages spoken.",
      misc: "Roadside stalls, painted religious slogans on shops, red-orange laterite soil.",
      poles: "Concrete poles with overhead wiring; tropical vegetation.",
    },
  },
  {
    name: "Nigeria", flag: "🇳🇬", region: "Africa",
    tells: {
      drive: "Drives on the right.",
      lang: "English; Yoruba, Hausa and Igbo spoken.",
      misc: "Busy markets, yellow 'danfo' minibuses in Lagos, painted shop signage.",
      land: "Red-orange soil; tropical to savanna vegetation.",
    },
  },
];

// Freeze so quiz logic can't accidentally mutate the source of truth.
GG_COUNTRIES.forEach((c) => {
  c.id = c.name.toLowerCase().replace(/[^a-z]+/g, "-");
});
