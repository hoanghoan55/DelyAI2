declare const brand: unique symbol
type Brand<T, B> = T & { readonly [brand]: B }

export type Seconds = Brand<number, 'Seconds'>
export type Milliseconds = Brand<number, 'Milliseconds'>
export type Frames = Brand<number, 'Frames'>

export const seconds = (n: number): Seconds => n as Seconds
export const milliseconds = (n: number): Milliseconds => n as Milliseconds
export const frames = (n: number): Frames => n as Frames
