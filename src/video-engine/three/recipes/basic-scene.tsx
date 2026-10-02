import React from 'react'
import { useCurrentFrame } from 'remotion'
import { z } from 'zod'
import { createThreeRecipe, type SceneDescriptor } from '../types'

export const basicScene = createThreeRecipe({
  id: 'basic-scene', version: '1.0.0', paramsSchema: z.object({ color: z.string().default('#4a9eff') }),
  describe: ({ frame, params }): SceneDescriptor => ({
    recipeId: 'basic-scene', recipeVersion: '1.0.0', frame, camera: { position: [0, 0, 5] },
    objectTransforms: [{ id: 'box', position: [0, 0, 0] }], geometryParams: { kind: 'box' },
    materialParams: { color: params.color }, lightParams: {}, seed: 0,
  }),
  build: ({ params }) => {
    const frame = useCurrentFrame()
    return (
      <group>
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 3, 3]} intensity={0.9} />
        <mesh rotation={[0, frame * 0.02, 0]}>
          <boxGeometry args={[1.6, 1.6, 1.6]} />
          <meshStandardMaterial color={params.color} />
        </mesh>
      </group>
    )
  },
})
