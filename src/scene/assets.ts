// Artes da cena.
//
// Os PNGs vêm de src/assets/scene, gerados por scripts/build-scene-assets.mjs
// a partir de src/assets/svg em um tamanho adequado à tela. As artes originais
// têm 1254 px e somam mais de 12 MB, o que atrasava a abertura do recife.
import coralBrainHealthy from '../assets/scene/coral-brain-healthy.png';
import coralBranchingBleached from '../assets/scene/coral-branching-bleached.png';
import coralBranchingHealthy from '../assets/scene/coral-branching-healthy.png';
import coralBranchingPaleTips from '../assets/scene/coral-branching-pale-tips.png';
import coralBranchingPartiallyBleached from '../assets/scene/coral-branching-partially-bleached.png';
import reefRocksSand from '../assets/scene/reef-rocks-sand.png';
import seaweedGreen from '../assets/scene/seaweed-green.png';
import fishBlueTangHealthy from '../assets/scene/fish-blue-tang-healthy.png';
import fishBlueTangStressed from '../assets/scene/fish-blue-tang-stressed.png';
import fishParrotfishHealthy from '../assets/scene/fish-parrotfish-healthy.png';
import fishParrotfishStressed from '../assets/scene/fish-parrotfish-stressed.png';
import fishSergeantMajorHealthy from '../assets/scene/fish-sergeant-major-healthy.png';
import fishSergeantMajorStressed from '../assets/scene/fish-sergeant-major-stressed.png';
import jellyfishMoon from '../assets/svg/fauna/jellyfish-moon.svg';
import squidCaribbeanReef from '../assets/svg/fauna/squid-caribbean-reef.svg';
import microplasticsMixed from '../assets/scene/microplastics-mixed.png';

export const MARINE_ASSET_URLS = {
  coralBrainHealthy,
  coralBranchingBleached,
  coralBranchingHealthy,
  coralBranchingPaleTips,
  coralBranchingPartiallyBleached,
  reefRocksSand,
  seaweedGreen,
  fishBlueTangHealthy,
  fishBlueTangStressed,
  fishParrotfishHealthy,
  fishParrotfishStressed,
  fishSergeantMajorHealthy,
  fishSergeantMajorStressed,
  jellyfishMoon,
  squidCaribbeanReef,
  microplasticsMixed,
} as const;

export type MarineAssetKey = keyof typeof MARINE_ASSET_URLS;
