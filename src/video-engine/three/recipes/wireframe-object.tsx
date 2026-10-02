import React from 'react'
import { useCurrentFrame } from 'remotion'
import { z } from 'zod'
import { createThreeRecipe, type SceneDescriptor } from '../types'

export const wireframeObject = createThreeRecipe({
  id: 'wireframe-object', version: '1.0.0',
  paramsSchema: z.object({ color: z.string().default('#ff8a3d'), kind: z.enum(['icosahedron', 'torus', 'box']).default('icosahedron') }),
  describe: ({ frame, params }): SceneDescriptor => ({
    recipeId: 'wireframe-object', recipeVersion: '1.0.0', frame, camera: { position: [0, 0, 5] },
    objectTransforms: [{ id: 'wire', position: [0, 0, 0] }], geometryParams: { kind: params.kind },
    materialParams: { color: params.color }, lightParams: {}, seed: 0,
  }),
  build: ({ params }) => {
    const frame = useCurrentFrame()
    const geometry = params.kind === 'icosahedron'
      ? <icosahedronGeometry args={[1.6, 1]} />
      : params.kind === 'torus'
        ? <torusGeometry args={[1.2, 0.4, 16, 48]} />
        : <boxGeometry args={[2, 2, 2]} />
    return (
      <group>
        <ambientLight intensity={0.6} />
        <mesh rotation={[frame * 0.01, frame * 0.015, 0]}>
          {geometry}
          <meshBasicMaterial color={params.color} wireframe />
        </mesh>
      </group>
    )
  },
})
