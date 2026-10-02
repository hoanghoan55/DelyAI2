import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { z } from 'zod'
import { createThreeRecipe, type SceneDescriptor } from '../types'

/**
 * A camera-flythrough motion provided as a visual recipe: the geometry is a
 * simple field and the movement is the camera. (Motion recipes in Task 11
 * transform layers; this recipe bakes the camera move into the scene.)
 */
export const cameraRig = createThreeRecipe({
  id: 'camera', version: '1.0.0', paramsSchema: z.object({ color: z.string().default('#9dd0ff') }),
  describe: ({ frame, params }): SceneDescriptor => ({
    recipeId: 'camera', recipeVersion: '1.0.0', frame, camera: { position: [0, 0, 8 - frame * 0.02] },
    objectTransforms: [{ id: 'ring', position: [0, 0, 0] }], geometryParams: { kind: 'torus' },
    materialParams: { color: params.color }, lightParams: {}, seed: 0,
  }),
  build: ({ params }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const z = Math.max(2, 8 - (frame / fps) * 0.6)
    return (
      <group>
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 4, 4]} intensity={0.9} />
        <group position={[0, 0, z - 8]}>
          <mesh position={[0, 0, z]}>
            <torusGeometry args={[1.4, 0.35, 16, 64]} />
            <meshStandardMaterial color={params.color} />
          </mesh>
        </group>
      </group>
    )
  },
})
