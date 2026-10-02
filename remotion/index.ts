import './register' // side-effect: registerAll() the engine before root
import { registerRoot } from 'remotion'
import { RemotionRoot } from './Root'

registerRoot(RemotionRoot)
