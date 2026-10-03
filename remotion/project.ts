import { registerBackends } from '@/video-engine/runtime'
import { buildFixtureProject } from '@/ai/project'

// Registration must precede the fixture's compile step: the Scene Compiler
// resolves compositions/recipes through the registry, so an unregistered build
// throws `CompilerError: Unknown composition "hero"` (exactly the Task 14 bug).
//
// Both statements live in THIS module, in order. That makes the ordering a
// property of the module, not a coincidence of ESM import order in whichever
// file happens to consume `demoProject` — the fragility the Task 14 defect had.
registerBackends()

export const demoProject = buildFixtureProject()
