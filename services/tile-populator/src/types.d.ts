/* eslint-disable @typescript-eslint/no-explicit-any */

declare module "@google/earthengine" {
  const ee: any
  export default ee
}

declare module "@mapbox/tilebelt" {
  export function getChildren(tile: [number, number, number]): [number, number, number][]
}

declare module "proj4" {
  const proj4: any
  export default proj4
}
