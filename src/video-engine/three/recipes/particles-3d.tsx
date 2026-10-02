import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { z } from 'zod'
import type { SeededRandom } from '@/shared'
import { createThreeRecipe, type SceneDescriptor } from '../types'

const schema = z.object({ count: z.number().int().positive().default(300), color: z.string().default('#7cc4ff') })
type P = z.infer<typeof schema>

function points(params: P, rng: SeededRandom): [number, number, number][] {
  return Array.from({ length: params.count }, () => [
    (rng.next() - 0.5) * 8, (rng.next() - 0.5) * 8, (rng.next() - 0.5) * 8,
  ])
}

export const particles3d = createThreeRecipe({
  id: 'particles-3d', version: '1.0.0', paramsSchema: schema,
  describe: ({ frame, params, rng }): SceneDescriptor => ({
    recipeId: 'particles-3d', recipeVersion: '1.0.0', frame, camera: { position: [0, 0, 8] },
    objectTransforms: points(params, rng).map((p, i) => ({ id: `p${i}`, position: p })),
    geometryParams: { count: params.count }, materialParams: { color: params.color }, lightParams: {}, seed: 0,
  }),
  build: ({ params, rng }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const pts = React.useMemo(() => points(params, rng), [params, rng])
    return (
      <group rotation={[0, (frame / fps) * 0.2, 0]}>
        <ambientLight intensity={0.6} />
        {pts.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshStandardMaterial color={params.color} />
          </mesh>
        ))}
      </group>
    )
  },
})
