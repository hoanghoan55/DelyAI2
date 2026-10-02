import React from 'react'
import { Composition } from 'remotion'
import { DemoComposition } from './DemoComposition'

export const RemotionRoot: React.FC = () => (
  <Composition id="DeLyDemo" component={DemoComposition} durationInFrames={900} fps={30} width={1920} height={1080} />
)
