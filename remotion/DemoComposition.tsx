import React from 'react'
import { staticFile } from 'remotion'
import { ProjectVideo, type ProjectVideoProps } from '@/video-engine/runtime'
import { demoProject } from './project'

/** Fixture default when no --props; render-side audio adapter resolves repo-relative artifact paths. */
export const DemoComposition: React.FC<ProjectVideoProps> = (props) => {
  // `--props` hands Remotion the nested render-props artifact
  // ({ header…, payload: { scenes, timeline, voice, audioSrcBySceneId } });
  // flat props (fixture defaultProps, plain test props) have no payload key.
  const p = ((props as { payload?: ProjectVideoProps }).payload) ?? props
  return (
    <ProjectVideo
      scenes={p.scenes ?? demoProject.compiledScenes}
      timeline={p.timeline ?? demoProject.timeline}
      voice={p.voice ?? null}
      audioSrcBySceneId={p.audioSrcBySceneId}
      resolveAudioSrc={staticFile}
    />
  )
}
