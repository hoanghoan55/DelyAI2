import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { Vector3 } from 'three'
import { z } from 'zod'
import type { SeededRandom } from '@/shared'
import { createThreeRecipe, type SceneDescriptor } from '../types'

const schema = z.object({
  nodes: z.number().int().positive().default(24),
  radius: z.number().default(2.6),
  color: z.string().default('#4a9eff'),
})
type P = z.infer<typeof schema>

type Node = { id: string; position: [number, number, number] }

function layout(params: P, rng: SeededRandom): Node[] {
  const out: Node[] = []
  for (let i = 0; i < params.nodes; i++) {
    const theta = rng.next() * Math.PI * 2
    const phi = Math.acos(2 * rng.next() - 1)
    const r = params.radius * (0.6 + 0.4 * rng.next())
    out.push({ id: `n${i}`, position: [r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)] })
  }
  return out
}

export const networkGraph = createThreeRecipe({
  id: 'network-graph', version: '1.0.0', paramsSchema: schema,
  describe: ({ frame, params, rng }): SceneDescriptor => ({
    recipeId: 'network-graph', recipeVersion: '1.0.0', frame,
    camera: { position: [0, 0, 6 + frame * 0.01] },
    objectTransforms: layout(params, rng),
    geometryParams: { nodes: params.nodes, radius: params.radius },
    materialParams: { color: params.color }, lightParams: { ambient: 0.4, directional: 0.9 }, seed: 0,
  }),
  build: ({ params, rng }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const nodes = React.useMemo(() => layout(params, rng), [params, rng])
    const rotY = (frame / fps) * 0.4
    return (
      <group rotation={[0, rotY, 0]}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.9} />
        {nodes.map((n) => (
          <mesh key={n.id} position={n.position}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial color={params.color} emissive={params.color} emissiveIntensity={0.35} />
          </mesh>
        ))}
        {nodes.flatMap((a, i) =>
          nodes.slice(i + 1).map((b) => {
            const d = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2])
            if (d > params.radius * 0.9) return null
            return (
              <line key={`${a.id}-${b.id}`}>
                <bufferGeometry
                  attach="geometry"
                  onUpdate={(g) =>
                    g.setFromPoints([
                      new Vector3(a.position[0], a.position[1], a.position[2]),
                      new Vector3(b.position[0], b.position[1], b.position[2]),
                    ])
                  }
                />
                <lineBasicMaterial color={params.color} transparent opacity={0.28} />
              </line>
            )
          }),
        )}
      </group>
    )
  },
})
