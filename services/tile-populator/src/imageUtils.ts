import sharp from "sharp"

export async function stitchTileImages(images: Buffer[]) {
  const imageBuffers = await Promise.all(images.map((image) => sharp(image).png().toBuffer()))
  const metadata = await sharp(imageBuffers[0]).metadata()

  if (!metadata.width || !metadata.height || !metadata.channels) {
    throw new Error("Unable to read source tile metadata")
  }

  const channels = metadata.channels === 3 ? 3 : 4

  return sharp({
    create: {
      width: metadata.width * 2,
      height: metadata.height * 2,
      channels,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: imageBuffers[0], top: 0, left: 0 },
      { input: imageBuffers[1], top: 0, left: metadata.width },
      { input: imageBuffers[2], top: metadata.height, left: metadata.width },
      { input: imageBuffers[3], top: metadata.height, left: 0 },
    ])
    .png()
    .toBuffer()
}
