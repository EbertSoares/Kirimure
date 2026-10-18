import coralBrainHealthy from '../assets/svg/coral/coral-brain-healthy.png';
import coralBranchingBleached from '../assets/svg/coral/coral-branching-bleached.png';
import coralBranchingHealthy from '../assets/svg/coral/coral-branching-healthy.png';
import coralBranchingPaleTips from '../assets/svg/coral/coral-branching-pale-tips.png';
import coralBranchingPartiallyBleached from '../assets/svg/coral/coral-branching-partially-bleached.png';
import reefRocksSand from '../assets/svg/environment/reef-rocks-sand.png';
import seaweedGreen from '../assets/svg/environment/seaweed-green.png';
import fishBlueTangHealthy from '../assets/svg/fish/fish-blue-tang-healthy.png';
import fishBlueTangStressed from '../assets/svg/fish/fish-blue-tang-stressed.png';
import fishParrotfishHealthy from '../assets/svg/fish/fish-parrotfish-healthy.png';
import fishParrotfishStressed from '../assets/svg/fish/fish-parrotfish-stressed.png';
import fishSergeantMajorHealthy from '../assets/svg/fish/fish-sergeant-major-healthy.png';
import fishSergeantMajorStressed from '../assets/svg/fish/fish-sergeant-major-stressed.png';
import jellyfishMoon from '../assets/svg/fauna/jellyfish-moon.svg';
import squidCaribbeanReef from '../assets/svg/fauna/squid-caribbean-reef.svg';
import microplasticsMixed from '../assets/svg/pollution/microplastics-particles-dark.svg';

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
