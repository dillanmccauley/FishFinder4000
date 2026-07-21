import type { Species } from '../types';

export const SPECIES: Species[] = [
  {
    id: 'red-drum',
    name: 'Sciaenops ocellatus',
    commonName: 'Red Drum (Redfish)',
    monthlyAvailability: [55, 50, 65, 75, 80, 85, 70, 75, 90, 95, 80, 65],
    preferredWaterTempF: [60, 85],
    depthRangeFt: [0, 100],
    clarityPreference: 45, // lateral line + sight — adapts to murky
    topLures: ['Gold spoon', 'DOA shrimp (glow)', 'Gulp! Swimming mullet', 'Topwater plug'],
    topRigs: ['Free-line live shrimp', 'Carolina rig w/ cut mullet', 'Popping cork + jig'],
    peakTidePhase: 'incoming',
  },
  {
    id: 'spotted-seatrout',
    name: 'Cynoscion nebulosus',
    commonName: 'Spotted Seatrout',
    monthlyAvailability: [60, 55, 65, 75, 85, 80, 70, 75, 85, 90, 80, 70],
    preferredWaterTempF: [58, 82],
    depthRangeFt: [0, 50],
    clarityPreference: 70, // primary sight-hunter on grass flats
    topLures: ['MirrOlure 52M', 'Gulp! Shrimp (pink)', 'Zara Spook Jr.', 'D.O.A. Terror Eyz'],
    topRigs: ['Popping cork + jig', 'Weedless gold spoon', 'Free-line shrimp'],
    peakTidePhase: 'outgoing',
  },
  {
    id: 'flounder',
    name: 'Paralichthys dentatus',
    commonName: 'Southern Flounder',
    monthlyAvailability: [40, 40, 50, 65, 75, 70, 60, 65, 80, 85, 75, 55],
    preferredWaterTempF: [55, 78],
    depthRangeFt: [0, 200],
    clarityPreference: 30, // ambush predator — works fine in murky water
    topLures: ['Gulp! Grub (white)', 'Berkley Powerbait mullet', 'Speck rig'],
    topRigs: ['Knocker rig w/ live finger mullet', 'Jig head w/ Gulp!', '3-way bottom rig'],
    peakTidePhase: 'outgoing',
  },
  {
    id: 'snook',
    name: 'Centropomus undecimalis',
    commonName: 'Common Snook',
    monthlyAvailability: [30, 30, 50, 70, 90, 95, 90, 90, 85, 70, 45, 35],
    preferredWaterTempF: [68, 90],
    depthRangeFt: [0, 25],
    clarityPreference: 40, // ambush/structure fish — finds fish by sound/lateral line too
    topLures: ['DOA Lures Baitbuster', 'Live pilchard', 'Zara Spook', 'Bucktail jig'],
    topRigs: ['Free-line live pilchard', 'Pinfish under float', 'Weighted Bucktail'],
    peakTidePhase: 'outgoing',
  },
  {
    id: 'sheepshead',
    name: 'Archosargus probatocephalus',
    commonName: 'Sheepshead',
    monthlyAvailability: [80, 85, 80, 65, 55, 45, 40, 45, 55, 65, 75, 80],
    preferredWaterTempF: [55, 80],
    depthRangeFt: [0, 60],
    clarityPreference: 20, // structure/feel feeder — barely affected by turbidity
    topLures: ['Fiddler crab', 'Barnacles', 'Sand flea'],
    topRigs: ['Knocker rig w/ fiddler crab', 'Float rig near pilings', 'Dropper loop w/ shrimp'],
    peakTidePhase: 'incoming',
  },
  {
    id: 'spanish-mackerel',
    name: 'Scomberomorus maculatus',
    commonName: 'Spanish Mackerel',
    monthlyAvailability: [25, 30, 55, 75, 85, 80, 70, 75, 80, 70, 50, 30],
    preferredWaterTempF: [68, 85],
    depthRangeFt: [5, 150],
    clarityPreference: 85, // fast-moving sight predator — severely reduced in murky water
    topLures: ['Clark spoon (1/2oz)', 'Drone spoon', 'Gotcha plug', 'Small Rapala'],
    topRigs: ['Trolling w/ steel leader', 'Casting spoon', 'Live bait under kite'],
    peakTidePhase: 'any',
  },
  {
    id: 'black-drum',
    name: 'Pogonias cromis',
    commonName: 'Black Drum',
    monthlyAvailability: [70, 75, 80, 75, 65, 55, 50, 55, 65, 70, 75, 70],
    preferredWaterTempF: [55, 82],
    depthRangeFt: [0, 80],
    clarityPreference: 20, // bottom feeder with barbels — hunts by taste/feel
    topLures: ['Shrimp (live or fresh)', 'Crab (blue or fiddler)', 'Sand flea'],
    topRigs: ['Bottom rig w/ crab', 'Fish-finder rig w/ shrimp', 'Carolina rig'],
    peakTidePhase: 'incoming',
  },
  {
    id: 'tarpon',
    name: 'Megalops atlanticus',
    commonName: 'Tarpon',
    monthlyAvailability: [20, 20, 35, 60, 85, 95, 95, 90, 70, 45, 25, 20],
    preferredWaterTempF: [74, 90],
    depthRangeFt: [0, 100],
    clarityPreference: 55, // sight + lateral line — moderate clarity preference
    topLures: ['Live mullet', 'Live crab', 'Boca Grande pass crab', 'Swimbaits 8"'],
    topRigs: ['Free-line live bait', 'Crab on circle hook', 'Streamer fly (fly rod)'],
    peakTidePhase: 'outgoing',
  },
  {
    id: 'pompano',
    name: 'Trachinotus carolinus',
    commonName: 'Florida Pompano',
    monthlyAvailability: [10, 10, 20, 40, 70, 85, 90, 90, 85, 60, 25, 10],
    preferredWaterTempF: [65, 85],
    depthRangeFt: [1, 30],
    clarityPreference: 60, // sight-feeds on crustaceans in the surf wash
    topLures: ['Sand flea', 'Fresh shrimp', 'Pompano jig (banana)', 'Fishbites'],
    topRigs: ['Double-drop pompano rig', 'Carolina rig w/ sand flea', 'Small jig hopped in surf'],
    peakTidePhase: 'incoming',
  },
  {
    id: 'whiting',
    name: 'Menticirrhus americanus',
    commonName: 'Whiting (Sea Mullet)',
    monthlyAvailability: [40, 45, 65, 80, 85, 75, 65, 65, 75, 85, 75, 55],
    preferredWaterTempF: [55, 80],
    depthRangeFt: [2, 40],
    clarityPreference: 25, // bottom feeder with chin barbel — hunts by feel
    topLures: ['Fresh shrimp', 'Bloodworms', 'Fishbites bloodworm', 'Squid strip'],
    topRigs: ['Two-hook bottom rig', 'Fish-finder rig', 'Small Carolina rig'],
    peakTidePhase: 'incoming',
  },
  // Northeast species
  {
    id: 'striped-bass',
    name: 'Morone saxatilis',
    commonName: 'Striped Bass',
    monthlyAvailability: [30, 30, 55, 80, 90, 75, 60, 65, 85, 85, 65, 35],
    preferredWaterTempF: [48, 72],
    depthRangeFt: [0, 200],
    clarityPreference: 50, // strong lateral line — hunts well in moderate turbidity
    topLures: ['Bunker chunk', 'Super Strike Eel', 'Bomber Long-A', 'Big Popa Popper'],
    topRigs: ['Live eel free-line', 'Chunk bunker on bottom', 'Trolling umbrella rig'],
    peakTidePhase: 'incoming',
  },
  {
    id: 'bluefish',
    name: 'Pomatomus saltatrix',
    commonName: 'Bluefish',
    monthlyAvailability: [15, 15, 30, 60, 80, 85, 85, 80, 75, 55, 25, 15],
    preferredWaterTempF: [58, 80],
    depthRangeFt: [0, 200],
    clarityPreference: 65, // aggressive sight-feeder when chasing bait
    topLures: ['Metal jig (3oz)', 'Popper', 'Tube lure', 'Bucktail jig'],
    topRigs: ['Wire leader w/ bunker strip', 'Top-water popper', 'Trolling tube+worm'],
    peakTidePhase: 'outgoing',
  },
  {
    id: 'black-sea-bass',
    name: 'Centropristis striata',
    commonName: 'Black Sea Bass',
    monthlyAvailability: [20, 20, 40, 70, 85, 80, 75, 80, 85, 75, 55, 25],
    preferredWaterTempF: [50, 74],
    depthRangeFt: [20, 400],
    clarityPreference: 40, // structure fish — bottom feeding, moderate clarity need
    topLures: ['Squid strip', 'Clam belly', 'Asian shore crab'],
    topRigs: ['High-low rig w/ squid', 'Dropper loop w/ clam', 'Jig head + bait'],
    peakTidePhase: 'low',
  },
  {
    id: 'tautog',
    name: 'Tautoga onitis',
    commonName: 'Tautog (Blackfish)',
    monthlyAvailability: [20, 25, 65, 85, 80, 45, 35, 40, 75, 85, 70, 30],
    preferredWaterTempF: [48, 68],
    depthRangeFt: [10, 300],
    clarityPreference: 35, // feels/crushes structure prey — not sight dependent
    topLures: ['Green crab (whole)', 'Fiddler crab', 'Asian shore crab'],
    topRigs: ['Knocker rig w/ green crab', 'Hi-low near structure', 'Single hook bottom rig'],
    peakTidePhase: 'high',
  },
  {
    id: 'weakfish',
    name: 'Cynoscion regalis',
    commonName: 'Weakfish (Sea Trout)',
    monthlyAvailability: [15, 15, 40, 75, 85, 80, 70, 65, 75, 70, 40, 15],
    preferredWaterTempF: [55, 78],
    depthRangeFt: [0, 100],
    clarityPreference: 60, // sight-feeder, especially active at night — moderate clarity need
    topLures: ['Bucktail jig', 'Soft plastic shrimp', 'MirrOlure'],
    topRigs: ['Jig w/ worm trailer', 'Nightcrawler under float', 'Bucktail + teaser'],
    peakTidePhase: 'incoming',
  },
];

export const SPECIES_MAP = new Map(SPECIES.map(s => [s.id, s]));
