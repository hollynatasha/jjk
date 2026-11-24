import React from 'react';
import { Composition } from 'remotion';
import { UnlimitedVoid } from './UnlimitedVoid';
import { MalevolentShrine } from './MalevolentShrine';
import { ChimeraShadowGarden } from './ChimeraShadowGarden';

// One composition per domain background. 7.5 s at 30 fps is the cast length the
// app plays them against; 1280x720 matches the landscape stage.
export const FPS = 30;
export const SECONDS = 7.5;

export const Root: React.FC = () => (
  <>
    <Composition
      id="UnlimitedVoid"
      component={UnlimitedVoid}
      durationInFrames={Math.round(FPS * SECONDS)}
      fps={FPS}
      width={1280}
      height={720}
    />
    <Composition
      id="MalevolentShrine"
      component={MalevolentShrine}
      durationInFrames={Math.round(FPS * SECONDS)}
      fps={FPS}
      width={1280}
      height={720}
    />
    <Composition
      id="ChimeraShadowGarden"
      component={ChimeraShadowGarden}
      durationInFrames={Math.round(FPS * SECONDS)}
      fps={FPS}
      width={1280}
      height={720}
    />
  </>
);
