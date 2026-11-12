/**
 * Layout of the environment texture atlas: every surface of the world is one tile of one 2048-wide canvas (plus
 * a matching emissive canvas), so a whole map draws with a handful of materials. Tiles repeat in the shader
 * (fract + textureGrad), so `size` is the world size in metres of one repeat. Pure: painting lives in paint.ts.
 */

export const TILE_NAMES = [
  // facades (upper floors): 2 bays × 2 floors
  'fOffice',
  'fBrick',
  'fApartment',
  'fWood',
  'fStation',
  'fWarehouse',
  'fOutpost',
  'fVirtual',
  'fRuin',
  'fBlight',
  // ground floors
  'gShop',
  'gGlass',
  'gGarage',
  'gSliding',
  'gPlain',
  // roofs
  'rConcrete',
  'rTile',
  'rMetal',
  'rVirtual',
  // ground surfaces
  'tGrass',
  'tConcrete',
  'tDirt',
  'tPlaza',
  'tDock',
  'tCrystal',
  'tVirtual',
  'tWater',
  'tAsphalt',
  'tSidewalk',
  'tCrosswalk',
  'tRail',
  // materials
  'mConcrete',
  'mBrick',
  'mSandbag',
  'mPlanks',
  'mPanel',
  'mCrystal',
  'mGrating',
  'mChainlink',
  'mMetal',
  'mRust',
  'mCrateWood',
  'mCrateMetal',
  'mCrateArk',
  'mContainer',
  'mContainerDoor',
  'mCarPaint',
  'mGlass',
  'mTire',
  'mRock',
  'mRubble',
  'mBark',
  'mLeaves',
  'mIvy',
  'mMoss',
  'mGrass',
  'mFlowers',
  'mSign0',
  'mSign1',
  'mSign2',
  'mSign3',
  'mBanner',
  'mVending',
  'mWhite',
  'mPaint',
  'mLantern',
  'mCloth',
  'mHolo',
  'mFlesh',
  'mShutter',
  // alpha-cut foliage cards and ground decals (paint-foliage.ts)
  'mLeafCard',
  'mBlossom',
  'mNeedles',
  'mDecal',
  'mPetalScatter'
] as const
export type TileName = (typeof TILE_NAMES)[number]

/** World metres per repeat [u, v] for tiles that are mapped by world size. */
export const TILE_SIZE: Partial<Record<TileName, [number, number]>> = {
  fOffice: [6, 6.4],
  fBrick: [6, 6.4],
  fApartment: [6, 6.4],
  fWood: [6, 6.4],
  fStation: [6, 6.4],
  fWarehouse: [6, 6.4],
  fOutpost: [6, 6.4],
  fVirtual: [6, 6.4],
  fRuin: [6, 6.4],
  fBlight: [6, 6.4],
  gShop: [6, 3.6],
  gGlass: [6, 3.6],
  gGarage: [6, 3.6],
  gSliding: [6, 3.6],
  gPlain: [6, 3.6],
  rConcrete: [6, 6],
  rTile: [3, 3],
  rMetal: [4, 4],
  rVirtual: [6, 6],
  tGrass: [6, 6],
  tConcrete: [5, 5],
  tDirt: [6, 6],
  tPlaza: [4, 4],
  tDock: [4, 4],
  tCrystal: [6, 6],
  tVirtual: [8, 8],
  tWater: [10, 10],
  tAsphalt: [8, 8],
  tSidewalk: [3, 3],
  tCrosswalk: [4, 4],
  tRail: [4, 4],
  mConcrete: [4, 4],
  mBrick: [3, 3],
  mSandbag: [2, 1.2],
  mPlanks: [2, 2],
  mPanel: [4, 4],
  mCrystal: [2, 2],
  mGrating: [2, 2],
  mChainlink: [2, 2],
  mMetal: [2, 2],
  mRust: [2, 2],
  mContainer: [3, 2.6],
  mRock: [3, 3],
  mRubble: [2, 2],
  mBark: [1.5, 2],
  mMoss: [2, 2],
  mWhite: [4, 4],
  mCloth: [2, 2],
  mFlesh: [3, 3],
  mShutter: [3, 3]
}

export const ATLAS_CELL = 256
export const ATLAS_PAD = 8
export const ATLAS_COLS = 8
export const ATLAS_ROWS = Math.ceil(TILE_NAMES.length / ATLAS_COLS)
export const ATLAS_WIDTH = ATLAS_COLS * ATLAS_CELL
export const ATLAS_HEIGHT = ATLAS_ROWS * ATLAS_CELL
/** Painted size of a tile inside its cell (the rest is wrapped padding). */
export const TILE_INNER = ATLAS_CELL - ATLAS_PAD * 2

export type Rect = readonly [number, number, number, number]

const RECTS = new Map<TileName, Rect>()
TILE_NAMES.forEach((name, i) => {
  const col = i % ATLAS_COLS
  const row = Math.floor(i / ATLAS_COLS)
  const x = (col * ATLAS_CELL + ATLAS_PAD) / ATLAS_WIDTH
  // Canvas rows go down; texture v goes up (flipY).
  const y = 1 - (row * ATLAS_CELL + ATLAS_PAD + TILE_INNER) / ATLAS_HEIGHT
  RECTS.set(name, [x, y, TILE_INNER / ATLAS_WIDTH, TILE_INNER / ATLAS_HEIGHT])
})

/** UV rectangle (x, y, w, h) of a tile's painted area in the atlas. */
export const tileRect = (name: TileName): Rect => RECTS.get(name)!

/** Pixel origin of a tile's painted area in the atlas canvas. */
export function tileOrigin(name: TileName): [number, number] {
  const i = TILE_NAMES.indexOf(name)
  return [(i % ATLAS_COLS) * ATLAS_CELL + ATLAS_PAD, Math.floor(i / ATLAS_COLS) * ATLAS_CELL + ATLAS_PAD]
}
