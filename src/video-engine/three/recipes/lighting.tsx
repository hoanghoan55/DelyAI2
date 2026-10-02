import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { z } from 'zod'
import { createThreeRecipe, type SceneDescriptor } from '../types'

/** Readable backdrop lighting with a slow orbiting key light. */
export const lightingRig = createThreeRecipe({
  id: 'lighting', version: '1.0.0', paramsSchema: z.object({ color: z.string().default('#ffffff') }),
  describe: ({ frame, params }): SceneDescriptor => ({
    recipeId: 'lighting', recipeVersion: '1.0.0', frame, camera: { position: [0, 0, 5] },
    objectTransforms: [{ id: 'sphere', position: [0, 0, 0] }], geometryParams: { kind: 'sphere' },
    materialParams: { color: params.color }, lightParams: { orbit: frame * 0.02 }, seed: 0,
  }),
  build: ({ params }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const angle = (frame / fps) * 0.8
    return (
      <group>
        <ambientLight intensity={0.25} />
        <directionalLight position={[Math.cos(angle) * 5, 4, Math.sin(angle) * 5]} intensity={1.1} />
        <mesh>
          <sphereGeometry args={[1.4, 48, 48]} />
          <meshStandardMaterial color={params.color} roughness={0.3} metalness={0.2} />
        </mesh>
      </group>
    )
  },
})
