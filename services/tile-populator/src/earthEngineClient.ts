import ee from "@google/earthengine"

type TileTriplet = [number, number, number]

type EeMaps = {
  date: number
  landcoverUrlFormat: string
  waterTemperatureUrlFormat: string
  waterVelocityUrlFormat: string
}

const CACHE_WINDOW_MS = 10 * 60 * 1000

let cachedMaps: EeMaps | null = null
let cachedLandcoverMap: { date: number; landcoverUrlFormat: string } | null = null

function mapToUrlFormat(map: { urlFormat?: string } | null | undefined) {
  const urlFormat = map?.urlFormat?.trim()
  if (!urlFormat) {
    throw new Error("Earth Engine map is missing urlFormat")
  }

  return urlFormat
}

function mapCallback(resolve: (urlFormat: string) => void, reject: (reason?: unknown) => void) {
  return (map: { urlFormat?: string } | null | undefined, error?: unknown) => {
    if (error) {
      reject(error)
      return
    }

    try {
      resolve(mapToUrlFormat(map))
    } catch (callbackError) {
      reject(callbackError)
    }
  }
}

function getLandcoverMap() {
  return new Promise<string>((resolve, reject) => {
    const dynamicWorld = ee
      .ImageCollection("GOOGLE/DYNAMICWORLD/V1")
      .filterDate("2023-01-01", "2023-08-20")

    dynamicWorld.select("label").getMap(
      {
        min: 0,
        max: 8,
        palette: [
          "#419BDF",
          "#397D49",
          "#88B053",
          "#7A87C6",
          "#E49635",
          "#DFC35A",
          "#C4281B",
          "#A59B8F",
          "#B39FE1",
        ],
      },
      mapCallback(resolve, reject)
    )
  })
}

function getWaterTemperatureMap() {
  return new Promise<string>((resolve, reject) => {
    const salinity = ee
      .ImageCollection("HYCOM/sea_temp_salinity")
      .filter(ee.Filter.date("2018-08-01", "2018-08-15"))

    salinity
      .select("water_temp_0")
      .map((image: unknown) => ee.Image(image).multiply(0.001).add(20))
      .mean()
      .getMap(
        {
          min: -2,
          max: 34,
          palette: ["000000", "005aff", "43c8c8", "fff700", "ff0000"],
        },
        mapCallback(resolve, reject)
      )
  })
}

function getWaterVelocityMap() {
  return new Promise<string>((resolve, reject) => {
    const velocity = ee.Image("HYCOM/sea_water_velocity/2014040700").divide(1000)

    velocity
      .select("velocity_u_0")
      .hypot(velocity.select("velocity_v_0"))
      .getMap(
        { min: 0, max: 1 },
        mapCallback(resolve, reject)
      )
  })
}

async function authenticate(credentials: Record<string, unknown>) {
  await new Promise<void>((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(credentials, resolve, reject)
  })

  await new Promise<void>((resolve, reject) => {
    ee.initialize(null, null, resolve, reject)
  })
}

export async function getLandcoverUrlFormat(credentials: Record<string, unknown>) {
  if (cachedLandcoverMap && Date.now() - cachedLandcoverMap.date < CACHE_WINDOW_MS) {
    return cachedLandcoverMap.landcoverUrlFormat
  }

  await authenticate(credentials)

  const landcoverUrlFormat = await getLandcoverMap()
  cachedLandcoverMap = {
    date: Date.now(),
    landcoverUrlFormat,
  }

  return landcoverUrlFormat
}

export async function getEeMaps(credentials: Record<string, unknown>) {
  if (cachedMaps && Date.now() - cachedMaps.date < CACHE_WINDOW_MS) {
    return cachedMaps
  }

  await authenticate(credentials)

  const [landcoverUrlFormat, waterTemperatureUrlFormat, waterVelocityUrlFormat] = await Promise.all([
    getLandcoverMap(),
    getWaterTemperatureMap(),
    getWaterVelocityMap(),
  ])

  cachedMaps = {
    date: Date.now(),
    landcoverUrlFormat,
    waterTemperatureUrlFormat,
    waterVelocityUrlFormat,
  }

  return cachedMaps
}

export async function downloadEarthEngineTile(urlFormat: string, tile: TileTriplet) {
  const [x, y, z] = tile
  const url = urlFormat.replace("{x}", String(x)).replace("{y}", String(y)).replace("{z}", String(z))

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download Earth Engine tile ${z}/${x}/${y}: ${response.status}`)
  }

  return Buffer.from(await response.arrayBuffer())
}
