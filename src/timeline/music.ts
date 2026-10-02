export type MusicSection = { id: string; startBeat: number; endBeat: number; energy: number }
export type MusicEvent = { atBeat: number; kind: string; payload: Record<string, unknown> }
export type MusicTimeline = { bpm: number; sections: MusicSection[]; events: MusicEvent[] }
