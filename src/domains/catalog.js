// The roster. Gesture library, matcher, animations, sounds and tests all read
// from this list.
//
// kanji/reading are the Japanese name and its romanisation. DOM only: no
// Japanese webfont is bundled, so a canvas export would risk missing glyphs.
//
// officialRef points at the TV anime site's episode page for each domain. The
// sign descriptions come from published write-ups rather than an official
// diagram, hence the split between researched and approximation per card.

export const DOMAINS = [
  {
    id: 'gojo',
    animationId: 'unlimited-void',
    kanji: '無量空処',
    reading: 'Muryōkūsho',
    character: 'Gojo',
    domainName: 'Unlimited Void',
    title: 'UNLIMITED VOID',
    hands: 1,
    accent: '#8fd3ff',
    officialRef: {
      url: 'https://jujutsukaisen.jp/episodes/07.php',
      label: 'TV anime official site, episode #7 「急襲」',
    },
    researchStatus: 'researched',
    researched:
      'Taishakuten-in (Indra seal) as described in published write-ups: right hand only, index finger raised, middle finger hooked over it.',
    approximation:
      'Camera-friendly drawing: palm toward the camera with the fingertips crossed but slightly apart, so both stay visible to the tracker.',
    wristGap: 'One hand, so no wrist gap. Keep the other hand out of frame.',
    mustSee: 'Index and middle fingertips, plus the wrist.',
    steps: [
      'Raise your right hand to chin height, palm toward the camera.',
      'Point your index finger up.',
      'Hook your middle finger over it, tips a few millimetres apart.',
      'Fold ring and pinky under your thumb.',
    ],
    friendlyNote: 'Variant: cross at the middle knuckle only, so both fingertips stay in view.',
  },
  {
    id: 'sukuna',
    animationId: 'malevolent-shrine',
    kanji: '伏魔御廚子',
    reading: 'Fukuma Mizushi',
    character: 'Sukuna',
    domainName: 'Malevolent Shrine',
    title: 'MALEVOLENT SHRINE',
    hands: 2,
    accent: '#ff5a36',
    officialRef: {
      url: 'https://jujutsukaisen.jp/episodes/41.php',
      label: 'TV anime official site, episode #41 「霹靂-弐-」',
    },
    researchStatus: 'researched',
    researched:
      'Enma-ten-in (Yama seal) as described in published write-ups: both hands together, index and pinky folded down, middle and ring fingers raised and pressed into a peak.',
    approximation:
      'Camera-friendly drawing: a finger-width gap between the palms and both hands angled toward the camera, so the tracker sees two hands instead of one lump.',
    wristGap: 'About one finger width (2 cm).',
    mustSee: 'Both wrists and the raised middle and ring fingertips.',
    steps: [
      'Bring both hands together in front of your chest.',
      'Fold your index and pinky fingers down.',
      'Raise middle and ring fingers so their tips meet in a peak.',
      'Open a small gap between your palms and tilt them toward the camera.',
    ],
    friendlyNote: 'Variant: palms 2 cm apart and turned 30° toward the lens.',
  },
  {
    id: 'megumi',
    animationId: 'chimera-shadow-garden',
    kanji: '嵌合暗翳庭',
    reading: 'Kanzen Aneitei',
    character: 'Megumi',
    domainName: 'Chimera Shadow Garden',
    title: 'CHIMERA SHADOW GARDEN',
    hands: 2,
    accent: '#5fe0c8',
    officialRef: {
      url: 'https://jujutsukaisen.jp/episodes/23.php',
      label: 'TV anime official site, episode #23 「起首雷同―弐―」',
    },
    researchStatus: 'researched',
    researched:
      'Yakushi Nyorai-in (Medicine Buddha seal) as described in published write-ups: fingers of both hands interlaced, thumbs free, middle knuckles bent so the hands form a mountain.',
    approximation:
      'Camera-friendly drawing: only the fingertips interlace and the palms stay about 5 cm apart, so each hand remains its own shape.',
    wristGap: 'About 5 cm.',
    mustSee: 'Both thumbs, both wrists and the knuckle ridge.',
    steps: [
      'Face your palms toward each other, a hand-width apart.',
      'Interlace just the fingertips, alternating left and right.',
      'Bend the middle knuckles so the hands form a peak.',
      'Point both thumbs up, side by side.',
    ],
    friendlyNote: 'Variant: fingertip-deep interlace with palms 5 cm apart.',
  },
];

export const DOMAIN_IDS = DOMAINS.map((d) => d.id);
export const domainById = (id) => DOMAINS.find((d) => d.id === id) || null;
export const DOMAIN_LABELS = Object.fromEntries(DOMAINS.map((d) => [d.id, d.character]));
