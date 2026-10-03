import './project' // side-effect: register backends, then compile the fixture (one place)
import { registerRoot } from 'remotion'
import { RemotionRoot } from './Root'

registerRoot(RemotionRoot)
