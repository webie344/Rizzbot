
// assetManifest.js
// Categorized list of Downtown City assets.
// Missing files are silently skipped by the loader — no crashes.

export const CITY_BASE = './city/';

export const BUILDINGS = [
  'Building_Small_1.gltf',
  'Building_Medium_2_001.gltf',
  'Building_Large_2.gltf',
];

export const STREETS = [
  'Street_2Lane.gltf',
  'Street_4Lane.gltf',
  'Street_2Lane_noSidewalk.gltf',
  'Street_4Lane_noSidewalk.gltf',
  'Street_Curve_2Lane.gltf',
  'Street_Curve_2Lane_Curb.gltf',
  'Street_Curve_4Lane_Short.gltf',
  'Street_Curve_4Lane_Short_Curb.gltf',
  'Street_TIntersection.gltf',
];

export const SIDEWALKS = [
  'Sidewalk_NoCurb_3m.gltf',
  'Sidewalk_Corner_Flat_3m.gltf',
  'Sidewalk_Corner_Flat_3m_Stripe.gltf',
  'Sidewalk_Corner_Round_3m.gltf',
  'Sidewalk_Corner_Round_3m_Stripe.gltf',
  'Sidewalk_Planner.gltf',
];

export const DECALS = [
  'Decal_Crosswalk.gltf',
  'Decal_Crosswalk_Wide.gltf',
  'Decal_BrokenLine_Straight.gltf',
  'Decal_DoubleYellow_Straight.gltf',
  'Decal_Stop.gltf',
  'Decal_Slow.gltf',
  'Decal_Only.gltf',
  'Decal_Bikelane.gltf',
  'Decal_ArrowTurnRight.gltf',
];

export const PROPS = [
  'Prop_Bollard.gltf',
  'Prop_Drain.gltf',
  'Prop_ManholeCover.gltf',
  'Prop_Planter_Single.gltf',
];

// Everything preloaded at startup. Order matters a little for progress UX.
export const PRELOAD = [
  ...BUILDINGS,
  ...STREETS,
  ...SIDEWALKS,
  ...DECALS,
  ...PROPS,
];
