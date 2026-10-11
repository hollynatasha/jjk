// Teach-mode prompts: twelve views per sign and eight neutral poses.

export const SLOT_VIEWS = [
  { id: 'center', short: 'C1', label: 'Face the camera' },
  { id: 'center', short: 'C2', label: 'Face the camera, a slightly different spot' },
  { id: 'center', short: 'C3', label: 'Face the camera, hands a little higher' },
  { id: 'left', short: 'L1', label: 'Turn a little to your left' },
  { id: 'left', short: 'L2', label: 'Turn a little to your left again' },
  { id: 'left', short: 'L3', label: 'Turn left, hands a little lower' },
  { id: 'right', short: 'R1', label: 'Turn a little to your right' },
  { id: 'right', short: 'R2', label: 'Turn a little to your right again' },
  { id: 'right', short: 'R3', label: 'Turn right, hands a little lower' },
  { id: 'near', short: 'N', label: 'Lean in a little (closer)' },
  { id: 'far', short: 'F', label: 'Lean back a little (farther)' },
  { id: 'mid', short: 'M', label: 'Halfway between near and far' },
];

export const NEG_PROMPTS = [
  { id: 'open-palm', text: 'Open palm, one hand', hands: 1 },
  { id: 'fist', text: 'Make a fist, one hand', hands: 1 },
  { id: 'peace', text: 'Peace sign or point, one hand', hands: 1 },
  { id: 'wave', text: 'Wave hello, then hold it still', hands: 1 },
  { id: 'relaxed', text: 'Both hands relaxed at chest height', hands: 2 },
  { id: 'palms', text: 'Both palms open, apart', hands: 2 },
  { id: 'clap', text: 'Palms together, like a quiet clap', hands: 2 },
  { id: 'fists', text: 'Two fists', hands: 2 },
];
