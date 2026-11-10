import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Material } from '@babylonjs/core/Materials/material';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Scene } from '@babylonjs/core/scene';
import { WaterMaterial } from '@babylonjs/materials/water/waterMaterial';
import type { DioramaFrame } from './framing';
import type { SceneQualityProfile } from './quality';
import { clamp, mix } from './procedural';
import { configureOceanSpectrum, getOceanFftAtlas, sampleOcean, stepOceanSpectrum, type WaveSample } from './waves';
import type { VisualState } from './visualState';

/**
 * Plano de corte frontal (split-level / meio-a-meio): a superfície recua de
 * Z_START até o horizonte, enquanto abaixo de Z_START a câmera enxerga
 * diretamente a coluna d'água azul e o recife sem distorção de RTT.
 */
const Z_START = 21.5;
const Z_END = 555;

/**
 * Plano-criança da câmera para o véu óptico da metade submersa.
 */
const VEIL_DISTANCE = 0.9;

export type OceanDebugMode =
  | 'none'
  | 'wireframe'
  | 'normals'
  | 'height'
  | 'foam';

export interface BoatWakeState {
  x: number;
  z: number;
  yaw: number;
  slam: number;
  hullLength: number;
  hullBeam: number;
}

/**
 * Substitui o fragment shader padrão do WaterMaterial pelo modelo óptico físico
 * completo adaptado de `noniv/web-ocean` (`deepsea/js/shaders.js:580-775`):
 *  - Banco analítico de 14 trens de ondas capilares alinhadas ao vento com
 *    rajadas ("cat's-paws") em espaço de mundo (`vPositionW.xz`);
 *  - Rede de espuma filamentar advectada por curl (`foamLace`) + Jacobiano FFT
 *    (`vColor.r`) + energia de choque de ondas (`vColor.g`) + esteira Kelvin do
 *    barco (`vColor.b`);
 *  - Fresnel dielétrico exato da interface ar-água (n1 = 1.0, n2 = 1.333, F0 = 0.02);
 *  - Microfacetas GGX de duplo lóbulo (disco solar + trilha de glitter);
 *  - Absorção espectral de Beer-Lambert T(lambda, d) = exp(-sigma(lambda) * d)
 *    e espalhamento múltiplo (`ambientInscatter`) + SSS turquesa nas cristas;
 *  - Modos de diagnóstico técnico integrados via `vColor.a` (normais, altura/FFT, espuma/Jacobiano).
 */
function installDeepseaWaterShader(): void {
  ShaderStore.ShadersStore['waterPixelShader'] = `#ifdef LOGARITHMICDEPTH
#extension GL_EXT_frag_depth : enable
#endif
precision highp float;
uniform vec4 vEyePosition;
uniform vec4 vDiffuseColor;
#ifdef SPECULARTERM
uniform vec4 vSpecularColor;
#endif
varying vec3 vPositionW;
#ifdef NORMAL
varying vec3 vNormalW;
#endif
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
varying vec4 vColor;
#endif
#include<helperFunctions>
#include<imageProcessingDeclaration>
#include<imageProcessingFunctions>
#include<__decl__lightFragment>[0..maxSimultaneousLights]
#include<lightsFragmentFunctions>
#include<shadowsFragmentFunctions>
#ifdef BUMP
varying vec2 vNormalUV;
#ifdef BUMPSUPERIMPOSE
varying vec2 vNormalUV2;
#endif
uniform sampler2D normalSampler;
uniform vec2 vNormalInfos;
#endif
uniform sampler2D refractionSampler;
uniform sampler2D reflectionSampler;
const float LOG2 = 1.442695;
uniform vec3 cameraPosition;
uniform vec4 waterColor;
uniform float colorBlendFactor;
uniform vec4 waterColor2;
uniform float colorBlendFactor2;
uniform float bumpHeight;
uniform float time;
varying vec3 vRefractionMapTexCoord;
varying vec3 vReflectionMapTexCoord;
#include<clipPlaneFragmentDeclaration>
#include<logDepthDeclaration>
#include<fogFragmentDeclaration>
#if defined(CLUSTLIGHT_BATCH) && CLUSTLIGHT_BATCH>0
varying float vViewDepth;
#endif

// Funções de ruído, ondulação capilar de 14 ondas, renda de espuma advectada por curl
// e distribuição microfacetada GGX portadas de deepsea/js/shaders.js
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v;
}

// Distribuição normal GGX / Trowbridge-Reitz com sombreamento de Smith (deepsea/js/shaders.js:584)
float ggxSpecular(vec3 N, vec3 V, vec3 L, float roughness) {
  vec3 H = normalize(V + L);
  float a = roughness * roughness;
  float a2 = a * a;
  float nh = max(dot(N, H), 0.0);
  float nv = max(dot(N, V), 1e-4);
  float nl = max(dot(N, L), 0.0);
  if (nl <= 0.0) return 0.0;
  float d = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * d * d + 1e-7);
  float k = (roughness + 1.0);
  k = (k * k) * 0.125;
  float G = (nv / (nv * (1.0 - k) + k)) * (nl / (nl * (1.0 - k) + k));
  return D * G / max(4.0 * nv, 1e-4);
}

// Fresnel dielétrico exato não-polarizado para ar-água (n1 = 1.0, n2 = 1.333)
float exactWaterFresnel(float cosThetaI) {
  float c = clamp(cosThetaI, 0.0, 1.0);
  float sin2ThetaT = (1.0 - c * c) / (1.333 * 1.333);
  if (sin2ThetaT >= 1.0) return 1.0;
  float cosThetaT = sqrt(max(0.0, 1.0 - sin2ThetaT));
  float Rs = (c - 1.333 * cosThetaT) / max(c + 1.333 * cosThetaT, 1e-4);
  float Rp = (1.333 * c - cosThetaT) / max(1.333 * c + cosThetaT, 1e-4);
  return clamp(0.5 * (Rs * Rs + Rp * Rp), 0.02, 1.0);
}

// Banco analítico de ondas capilares e gravidade curtas com rajadas "cat's-paws" (deepsea/js/shaders.js:600)
vec2 capillarySlope(vec2 xz, float t) {
  vec2 w = normalize(vec2(0.82, 0.57));
  vec2 p = vec2(-w.y, w.x);
  vec2 s = vec2(0.0);

  // Rajadas de vento modulando a rugosidade capilar localmente
  float gust = smoothstep(0.28, 0.76, fbm3(xz * 0.045 - w * t * 0.18));

  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float k = 1.35 * pow(1.42, fi);
    float h = float(i * 7 + 3);
    float ang = (fract(sin(h * 12.9898) * 43758.5453) - 0.5) * 1.45;
    vec2 d = normalize(w * cos(ang) + p * sin(ang));
    float om = sqrt(9.81 * k + 0.000074 * k * k * k);
    float ph = dot(d, xz) * k - om * t + h * 2.1;
    float a = (0.011 / pow(k, 0.88)) * (0.45 + 0.55 * gust);
    s += d * (a * k * (cos(ph) - 0.34 * sin(2.0 * ph)));
  }
  return s;
}

// Rede celular de espuma filamentar advectada por curl (deepsea/js/shaders.js:634)
float foamLacePattern(vec2 xz, float t) {
  vec2 w = vec2(vnoise(xz * 0.35 + t * 0.07), vnoise(xz * 0.35 + 19.3 - t * 0.06));
  vec2 p = xz * 1.45 + (w - 0.5) * 2.6;
  float r1 = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
  float r2 = 1.0 - abs(vnoise(p * 2.3 - t * 0.11) * 2.0 - 1.0);
  float r3 = vnoise(p * 4.7 + t * 0.15);
  return clamp(pow(r1 * 0.58 + r2 * 0.42, 2.2) * (0.55 + 0.45 * r3) * 1.65, 0.0, 1.0);
}

#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
  vec3 viewDirectionW = normalize(vEyePosition.xyz - vPositionW);
  float alpha = vDiffuseColor.a;

  float distZ = max(0.0, vPositionW.z - 21.5);
  float nearFactor = 1.0 - smoothstep(21.5, 145.0, vPositionW.z);
  float midFactor = 1.0 - smoothstep(21.5, 270.0, vPositionW.z);
  float horizonFactor = smoothstep(95.0, 460.0, vPositionW.z);

#ifdef BUMP
  vec2 worldXZ = vPositionW.xz;
  vec2 uvCascadeA = worldXZ * vec2(0.095, 0.115) + vec2(0.052, 0.036) * time;
  vec2 uvCascadeB = worldXZ * vec2(0.112, 0.128) + vec2(-0.048, 0.042) * time;
  vec2 uvCascadeC = worldXZ * vec2(0.24, 0.28) + vec2(0.085, -0.072) * time;
  vec2 uvCascadeD = worldXZ * vec2(0.44, 0.48) + vec2(-0.11, -0.092) * time;

  vec4 nA = texture2D(normalSampler, uvCascadeA);
  vec4 nB = texture2D(normalSampler, uvCascadeB);
  vec4 nC = texture2D(normalSampler, uvCascadeC);
  vec4 nD = texture2D(normalSampler, uvCascadeD);

  vec4 baseColor =
    nA * 0.34 +
    nB * 0.32 +
    nC * (0.21 * (0.35 + 0.65 * midFactor)) +
    nD * (0.13 * nearFactor);
  vec3 bumpSample = baseColor.rgb;
  float microCollision = clamp((nA.b - 0.72) * (nB.b - 0.72) * 16.0 + (nC.b - 0.74) * 1.2, 0.0, 1.0);
#else
  vec3 bumpSample = vec3(0.5, 0.5, 1.0);
  float microCollision = 0.0;
#endif

  // Inclinação capilar analítica de 10 ondas + mapa espectral normalSampler
  vec2 capSlope = capillarySlope(vPositionW.xz, time) * mix(0.28, 1.0, midFactor);

#ifdef NORMAL
  vec2 perturbation = bumpHeight * (bumpSample.rg - 0.5) * mix(0.38, 0.92, midFactor) + capSlope * 0.55;
  // Normal 3D contínua e arredondada (sem nunca usar dFdx/dFdy que facetam a malha)
  vec3 normalW = normalize(vNormalW + vec3(perturbation.x * 5.8, 0.0, perturbation.y * 5.8));
  if (normalW.y < 0.12) { normalW.y = abs(normalW.y) + 0.12; normalW = normalize(normalW); }
#else
  vec3 normalW = vec3(0.0, 1.0, 0.0);
  vec2 perturbation = vec2(0.0, 0.0);
#endif

  float vertexFoam = 0.0;
  float vertexBreaker = 0.0;
  float vertexWake = 0.0;
  float debugFlag = 1.0;
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
  vertexFoam = vColor.r;
  vertexBreaker = vColor.g;
  vertexWake = vColor.b;
  debugFlag = vColor.a;
#endif

  // Modos de diagnóstico técnico (Seção 13):
  // 0.2 = Normais da superfície; 0.4 = Altura/Deslocamento FFT; 0.6 = Mapa de Espuma/Jacobiano
  if (debugFlag < 0.85) {
    if (debugFlag < 0.3) {
      gl_FragColor = vec4(normalW * 0.5 + 0.5, 1.0);
      return;
    } else if (debugFlag < 0.5) {
      float hNorm = clamp((vPositionW.y + 0.65) / 1.3, 0.0, 1.0);
      vec3 heat = mix(vec3(0.04, 0.18, 0.58), vec3(0.08, 0.88, 0.92), smoothstep(0.0, 0.6, hNorm));
      heat = mix(heat, vec3(1.0, 0.92, 0.28), smoothstep(0.55, 1.0, hNorm));
      gl_FragColor = vec4(heat, 1.0);
      return;
    } else {
      float fMap = clamp(vertexFoam + vertexBreaker * 0.8 + vertexWake, 0.0, 1.0);
      vec3 foamDiag = mix(vec3(0.05, 0.12, 0.24), vec3(0.12, 0.95, 0.68), fMap);
      foamDiag = mix(foamDiag, vec3(1.0, 0.25, 0.45), clamp(vertexBreaker, 0.0, 1.0));
      gl_FragColor = vec4(foamDiag, 1.0);
      return;
    }
  }

  vec3 diffuseBase = vec3(0.0, 0.0, 0.0);
  lightingInfo info;
  float shadow = 1.0;
  float aggShadow = 0.0;
  float numLights = 0.0;
#ifdef SPECULARTERM
  float glossiness = vSpecularColor.a;
  vec3 specularBase = vec3(0.0, 0.0, 0.0);
  vec3 specularColor = vSpecularColor.rgb;
#else
  float glossiness = 0.0;
  vec3 specularBase = vec3(0.0, 0.0, 0.0);
  vec3 specularColor = vec3(0.0, 0.0, 0.0);
#endif
#include<lightFragment>[0..maxSimultaneousLights]

  // Fresnel dielétrico exato (n1 = 1.0, n2 = 1.333) com compensação de rugosidade distante
  float NoV = clamp(dot(normalW, viewDirectionW), 0.0, 1.0);
  float fresnel = exactWaterFresnel(NoV);
  float reflectionWeight = clamp(fresnel * mix(0.9, 0.42, horizonFactor), 0.03, 0.55);

#ifdef REFLECTION
  vec2 refrUV = clamp(vRefractionMapTexCoord.xy / vRefractionMapTexCoord.z + perturbation * 0.34 * nearFactor, 0.002, 0.998);
  vec4 refractiveColor = texture2D(refractionSampler, refrUV);
#ifdef IS_REFRACTION_LINEAR
  refractiveColor.rgb = toGammaSpace(refractiveColor.rgb);
#endif
  vec2 reflUV = clamp(vec2(
    vReflectionMapTexCoord.x / vReflectionMapTexCoord.z + perturbation.x * 0.24,
    vReflectionMapTexCoord.y / vReflectionMapTexCoord.z + perturbation.y * 0.44
  ), 0.002, 0.998);
  vec4 reflectiveColor = texture2D(reflectionSampler, reflUV);
#ifdef IS_REFLECTION_LINEAR
  reflectiveColor.rgb = toGammaSpace(reflectiveColor.rgb);
#endif
#else
  vec4 refractiveColor = waterColor2;
  vec4 reflectiveColor = waterColor;
#endif

  // Modelo Óptico de Beer-Lambert + Espalhamento Múltiplo (deepsea/js/shaders.js:698-724):
  // Coeficiente de atenuação espectral dependente do comprimento de onda:
  // Vermelho (650nm) atenua rapidamente; Verde (530nm) e Azul (460nm) penetram na coluna d'água.
  vec3 sigmaExtinction = vec3(0.36, 0.072, 0.028) * mix(0.85, 1.65, clamp(colorBlendFactor - 0.45, 0.0, 1.0));
  float opticalPath = (2.8 + distZ * 0.065) / max(NoV, 0.22);
  vec3 transmittance = exp(-sigmaExtinction * opticalPath);

  vec3 shallowTurquoise = waterColor2.rgb * vec3(1.1, 1.22, 1.18) + vec3(0.04, 0.19, 0.22);
  vec3 midOceanBlue = mix(waterColor2.rgb, waterColor.rgb, 0.48) + vec3(0.02, 0.11, 0.18);
  vec3 deepHorizonBlue = waterColor.rgb * vec3(0.96, 1.1, 1.2) + vec3(0.012, 0.055, 0.12);

  // Espalhamento volumétrico interno da coluna d'água (single + multiple in-scattering)
  vec3 inscatterColor = mix(shallowTurquoise, midOceanBlue, smoothstep(21.5, 96.0, vPositionW.z));
  inscatterColor = mix(inscatterColor, deepHorizonBlue, smoothstep(85.0, 275.0, vPositionW.z));

  float refrLum = dot(refractiveColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 bottomRefraction = mix(shallowTurquoise, refractiveColor.rgb, clamp(refrLum * 1.4, 0.22, 0.82));
  vec3 transmitted = bottomRefraction * transmittance + inscatterColor * (vec3(1.0) - transmittance);

  // Sombreamento tridimensional arredondado entre encosta iluminada e cava da onda
  vec3 sunDir = normalize(vec3(0.28, 0.68, 0.68));
  float sunSlope = clamp(dot(normalW, sunDir), 0.0, 1.0);
  float frontSlope = clamp(-normalW.z * 1.15 + abs(normalW.x) * 0.35, -0.3, 1.0);
  float troughShade = clamp((vPositionW.y + 0.45) / 0.95, 0.0, 1.0);
  vec3 troughTint = mix(vec3(0.62, 0.76, 0.88), vec3(1.05, 1.09, 1.08), troughShade);
  transmitted *= troughTint * (0.78 + 0.32 * sunSlope) * (1.0 - 0.15 * max(0.0, frontSlope));

  // Subsurface Scattering (SSS) turquesa-esmeralda quando a luz atravessa as cristas arredondadas
  float crestHeight = clamp((vPositionW.y + 0.08) * 1.4, 0.0, 1.0);
  float crestSteepness = clamp(1.0 - normalW.y, 0.0, 1.0);
  float backLit = pow(clamp(dot(viewDirectionW, -vec3(sunDir.x, -sunDir.y * 0.35, sunDir.z)), 0.0, 1.0), 2.0);
  float sssFactor = (crestHeight * (0.36 + 0.64 * smoothstep(0.02, 0.28, crestSteepness)) + vertexBreaker * 0.42) * (0.45 + 0.55 * midFactor) * (0.68 + 0.32 * backLit);
  vec3 sssColor = vec3(0.05, 0.86, 0.84) * sssFactor * 0.88;

  // Reflexo do céu e das montanhas modulado pelo Fresnel físico. No horizonte,
  // a silhueta da serra é diluída em azul atmosférico antes de entrar na cor.
  vec3 softReflection = mix(reflectiveColor.rgb, vec3(0.4, 0.61, 0.76), horizonFactor * 0.7);
  vec3 skyReflect = mix(softReflection, mix(shallowTurquoise, softReflection, 0.75), 0.22);
  vec3 oceanCol = mix(transmitted + sssColor, skyReflect, reflectionWeight);

  // Espuma física advectada por curl (foamLacePattern) + Jacobiano FFT + colisão + esteira Kelvin do barco
  float lace = foamLacePattern(vPositionW.xz, time);
  float capillaryLace = smoothstep(0.58, 0.9, bumpSample.b);
  float combinedLace = mix(capillaryLace, lace, 0.65);

  float breakerCrest = clamp(
    vertexBreaker * 1.15 + vertexFoam * 0.82 + vertexWake * 1.25 + microCollision * 0.32 * midFactor,
    0.0,
    1.0
  );
  float foamBody = smoothstep(0.16, 0.64, breakerCrest) * (0.52 + 0.48 * combinedLace);
  float foamTrail = smoothstep(0.06, 0.44, vertexFoam + vertexWake * 0.85) * combinedLace * 0.56;
  float foamMask = clamp((foamBody + foamTrail) * (1.0 - horizonFactor * 0.78), 0.0, 0.94);

  // Pluma de bolhas submersas azul-turquesa sob a espuma recém-quebrada (deepsea/js/shaders.js:731)
  float submergedBubbleMask = clamp((breakerCrest - foamMask * 0.6) * (0.4 + 0.6 * combinedLace) * (1.0 - horizonFactor), 0.0, 0.52);
  oceanCol = mix(oceanCol, vec3(0.26, 0.86, 0.92), submergedBubbleMask);

  vec3 foamColor = vec3(0.96, 0.99, 1.0) * (0.84 + 0.16 * sunSlope);
  oceanCol = mix(oceanCol, foamColor, foamMask);

  // Microfacetas GGX de duplo lóbulo: disco solar estreito + trilha de glitter capilar
  float sunGlint = ggxSpecular(normalW, viewDirectionW, sunDir, mix(0.032, 0.085, horizonFactor));
  float glitterPath = ggxSpecular(normalW, viewDirectionW, sunDir, mix(0.13, 0.22, horizonFactor));
  vec3 ggxSun = vec3(1.0, 0.96, 0.86) * (min(sunGlint, 12.0) * 0.18 + glitterPath * 0.24) * fresnel;
  vec3 finalSpecular = (specularBase * specularColor * 0.32 + ggxSun) * (1.0 - foamMask * 0.72);

  // Perspectiva aérea: bruma clara que casa a água com o céu e enfraquece a
  // mancha escura do reflexo da serra no horizonte.
  vec3 horizonHaze = mix(deepHorizonBlue + vec3(0.1, 0.26, 0.38), vec3(0.46, 0.65, 0.79), 0.66);
  oceanCol = mix(oceanCol, horizonHaze, horizonFactor * 0.7);

  vec4 color = vec4(clamp(oceanCol, 0.0, 1.0) + finalSpecular, alpha);
#include<logDepthFragment>
#include<fogFragment>
#ifdef IMAGEPROCESSINGPOSTPROCESS
  color.rgb = pow(max(color.rgb, vec3(0.0)), vec3(0.84));
  color.rgb = toLinearSpace(color.rgb);
#elif defined(IMAGEPROCESSING)
  color.rgb = pow(max(color.rgb, vec3(0.0)), vec3(0.84));
  color.rgb = toLinearSpace(color.rgb);
  color = applyImageProcessing(color);
#endif
  gl_FragColor = color;
#define CUSTOM_FRAGMENT_MAIN_END
}`;
}

/**
 * Shaders dedicados da interface óptica ar-água (`frente-onda-corte`):
 * Em vez de uma faixa grossa ou artificial, renderiza o menisco físico fino e
 * orgânico de uma cúpula subaquática (split-level dome port) com:
 *  - Topo (`v = 0`) colado sem fresta aos vértices arredondados da superfície FFT;
 *  - Reflexão interna total (TIR, ângulo crítico 48.6°) prateada-turquesa na borda da lâmina;
 *  - Espuma celular `foamLace` restrita às cristas em colisão;
 *  - Dissolução óptica suave e imediata para nunca obstruir a visão subaquática.
 */
function installMeniscusCrossSectionShader(): void {
  ShaderStore.ShadersStore['waterMeniscusVertexShader'] = `precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 worldViewProjection;
uniform mat4 world;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying vec4 vColor;
void main(void) {
  vec4 worldPos = world * vec4(position, 1.0);
  vPositionW = worldPos.xyz;
  vNormalW = normalize(mat3(world) * normal);
  vUV = uv;
  vColor = color;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

  ShaderStore.ShadersStore['waterMeniscusPixelShader'] = `precision highp float;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying vec4 vColor;
uniform sampler2D normalSampler;
uniform float time;
uniform vec3 cameraPosition;
uniform vec3 tintColor;
uniform float waterClarity;
uniform float pollutionFactor;
#include<helperFunctions>
#include<imageProcessingDeclaration>
#include<imageProcessingFunctions>
void main(void) {
  float v = clamp(vUV.y, 0.0, 1.0);
  float foamEnergy = clamp(vColor.r, 0.0, 1.0);
  float breakerEnergy = clamp(vColor.g, 0.0, 1.0);
  float crestLift = clamp(vColor.b, 0.0, 1.0);

  vec2 sliceUV1 = vec2(vPositionW.x * 0.22 + time * 0.075, v * 0.8 - time * 0.11);
  vec2 sliceUV2 = vec2(vPositionW.x * 0.29 - time * 0.065, v * 0.9 + time * 0.09);
  vec4 n1 = texture2D(normalSampler, sliceUV1);
  vec4 n2 = texture2D(normalSampler, sliceUV2);
  vec3 microNormal = normalize(vec3(
    (n1.r + n2.r - 1.0) * 0.65,
    (n1.g + n2.g - 1.0) * 0.45,
    -1.0
  ));
  float lace = smoothstep(0.56, 0.88, 0.52 * n1.b + 0.48 * n2.b);

  vec3 viewDir = normalize(cameraPosition - vPositionW);
  vec3 N = normalize(vNormalW + vec3(microNormal.x * 0.3, microNormal.y * 0.22, 0.0));
  vec3 sunDir = normalize(vec3(0.28, 0.72, 0.64));

  // Transição óptica cristalina da lâmina d'água (reflexão interna total + refração de Snell)
  vec3 topAqua = vec3(0.22, 0.86, 0.95);
  vec3 midTurquoise = vec3(0.06, 0.62, 0.84);
  vec3 deepAzure = vec3(0.03, 0.42, 0.72);
  vec3 sliceBody = mix(topAqua, midTurquoise, smoothstep(0.04, 0.48, v));
  sliceBody = mix(sliceBody, deepAzure, smoothstep(0.45, 0.96, v));

  // Fio refrativo de menisco (reflexão interna total suave na interface ar-água)
  float rimCenter = 0.09 + 0.02 * (n1.r - 0.5);
  float meniscusRim = exp(-pow((v - rimCenter) / 0.085, 2.0));
  float slopeHighlight = clamp(0.55 + 0.45 * dot(N, sunDir), 0.0, 1.0);
  vec3 rimColor = mix(vec3(0.45, 0.92, 0.98), vec3(0.90, 0.98, 1.0), slopeHighlight * 0.72);
  sliceBody = mix(sliceBody, rimColor, meniscusRim * 0.68);

  // Espuma orgânica de colisão restrita ao lábio superior quando ondas se encontram
  float waveCollisionFoam = clamp(foamEnergy * 0.65 + breakerEnergy * 0.88, 0.0, 1.0);
  float foamThickness = 0.12 + waveCollisionFoam * 0.24;
  float foamLip = (1.0 - smoothstep(0.02, foamThickness, v)) * (0.48 + 0.52 * lace);
  float totalFoam = clamp(foamLip * waveCollisionFoam * 0.88, 0.0, 0.9);
  vec3 foamWhite = vec3(0.95, 0.99, 1.0) * (0.86 + 0.14 * slopeHighlight);
  sliceBody = mix(sliceBody, foamWhite, totalFoam);

  // Brilho especular GGX/Blinn na lente molhada
  vec3 halfVec = normalize(sunDir + viewDir);
  float spec = pow(max(dot(N, halfVec), 0.0), 110.0) * 0.58 * (1.0 - smoothstep(0.0, 0.38, v));
  sliceBody += vec3(0.96, 0.99, 1.0) * spec * (0.5 + 0.5 * crestLift);

  sliceBody *= tintColor;
  sliceBody = mix(sliceBody, vec3(0.12, 0.34, 0.42), pollutionFactor * 0.45);

  // Perfil de opacidade orgânico e sedoso: funde perfeitamente com a superfície no topo
  // e dissolve rapidamente na água abaixo sem formar faixa pesada na tela.
  float topEdgeBlend = smoothstep(0.0, 0.04, v);
  float bottomFade = pow(1.0 - smoothstep(0.18, 0.98, v), 1.55);
  float bodyAlpha = (0.38 + 0.28 * meniscusRim + 0.24 * totalFoam) * bottomFade * mix(0.82, 1.0, topEdgeBlend);
  float finalAlpha = clamp(bodyAlpha, 0.0, 0.76);

  vec4 color = vec4(clamp(sliceBody, 0.0, 1.0), finalAlpha);
#ifdef IMAGEPROCESSINGPOSTPROCESS
  color.rgb = pow(max(color.rgb, vec3(0.0)), vec3(0.84));
  color.rgb = toLinearSpace(color.rgb);
#elif defined(IMAGEPROCESSING)
  color.rgb = pow(max(color.rgb, vec3(0.0)), vec3(0.84));
  color.rgb = toLinearSpace(color.rgb);
  color = applyImageProcessing(color);
#endif
  gl_FragColor = color;
}`;
}

/**
 * Shaders WGSL da superfície oceânica (WebGPU).
 *
 * O deslocamento vertical, as normais e a energia de quebra/espuma são
 * reconstruídos diretamente no vertex shader a partir do atlas FFT RGBA
 * (`R = altura`, `G = inclinação X`, `B = inclinação Z`, `A = Jacobiano`).
 * O JavaScript deixa de reescrever ~36 mil vértices por quadro; a física do
 * barco e dos efeitos continua usando o mesmo espectro na CPU.
 *
 * O fragment shader faz a óptica completa: Fresnel dielétrico, Beer-Lambert,
 * espalhamento interno, SSS turquesa nas cristas, glints GGX de duplo lóbulo,
 * espuma filamentar advectada e whitecaps nas cristas comprimidas.
 */
function installDeepseaWaterShaderWGSL(): void {
  ShaderStore.ShadersStoreWGSL['waterVertexShader'] = `attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;

uniform world: mat4x4f;
uniform view: mat4x4f;
uniform viewProjection: mat4x4f;
uniform reflectionViewProjection: mat4x4f;
uniform waveSpeed: f32;
uniform waveHeight: f32;
uniform waveLength: f32;
uniform waveCount: f32;
uniform windForce: f32;
uniform windDirection: vec2f;

var normalSamplerSampler: sampler;
var normalSampler: texture_2d<f32>;

varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vFoam: f32;
varying vHeight: f32;
varying vWake: f32;
varying vRefractionMapTexCoord: vec3f;
varying vReflectionMapTexCoord: vec3f;

struct FftTap {
  h: f32,
  sx: f32,
  sz: f32,
  j: f32,
};

fn wrapIndex(v: i32, n: i32) -> i32 {
  var r = v % n;
  if (r < 0) { r = r + n; }
  return r;
}

// Amostragem bilinear periódica do atlas FFT. Barata no vertex e suficiente
// para uma malha já densa; o filtro de Nyquist por cascata evita aliasing.
fn sampleFft(pos: vec2f, layer: i32, length: f32, dims: vec2i) -> FftTap {
  let n = f32(dims.x);
  let g = pos * (n / length);
  let bx = i32(floor(g.x));
  let bz = i32(floor(g.y));
  let ux = g.x - floor(g.x);
  let uz = g.y - floor(g.y);
  let x0 = wrapIndex(bx, dims.x);
  let x1 = wrapIndex(bx + 1, dims.x);
  let y0 = wrapIndex(bz, dims.x) + layer * dims.x;
  let y1 = wrapIndex(bz + 1, dims.x) + layer * dims.x;
  let s00 = textureLoad(normalSampler, vec2i(x0, y0), 0);
  let s10 = textureLoad(normalSampler, vec2i(x1, y0), 0);
  let s01 = textureLoad(normalSampler, vec2i(x0, y1), 0);
  let s11 = textureLoad(normalSampler, vec2i(x1, y1), 0);
  let w00 = (1.0 - ux) * (1.0 - uz);
  let w10 = ux * (1.0 - uz);
  let w01 = (1.0 - ux) * uz;
  let w11 = ux * uz;
  var out: FftTap;
  out.h = s00.r * w00 + s10.r * w10 + s01.r * w01 + s11.r * w11;
  out.sx = s00.g * w00 + s10.g * w10 + s01.g * w01 + s11.g * w11;
  out.sz = s00.b * w00 + s10.b * w10 + s01.b * w01 + s11.b * w11;
  out.j = s00.a * w00 + s10.a * w10 + s01.a * w01 + s11.a * w11;
  return out;
}

fn cascadeLength(index: i32) -> f32 {
  if (index == 0) { return 156.0; }
  if (index == 1) { return 39.0; }
  return 9.7;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let finalWorld = uniforms.world;
  let base = (finalWorld * vec4f(vertexInputs.position, 1.0)).xyz;
  let t = uniforms.waveSpeed;
  let dims = vec2i(textureDimensions(normalSampler));
  let layerCount = dims.y / dims.x;
  // A malha é frustum-adaptativa; estima o espaçamento local para aplicar o
  // mesmo filtro de Nyquist que a CPU usa (evita aliasing de cascatas curtas).
  let spacing = 0.24 + max(0.0, base.z - 21.5) * 0.0055;

  var height = 0.0;
  var slopeX = 0.0;
  var slopeZ = 0.0;
  var jac = 0.0;
  var dispX = 0.0;
  var dispZ = 0.0;

  for (var i: i32 = 0; i < 3; i = i + 1) {
    if (i < layerCount) {
      let len = cascadeLength(i);
      let charLambda = len / 8.0;
      let gain = smoothstep(spacing * 1.35, spacing * 3.4, charLambda);
      let tap = sampleFft(base.xz, i, len, dims);
      height += tap.h * gain;
      slopeX += tap.sx * gain;
      slopeZ += tap.sz * gain;
      jac += (tap.j - 1.0) * gain;
      let kRep = 6.2831853 / charLambda;
      dispX += 0.26 * tap.sx * gain / kRep;
      dispZ += 0.26 * tap.sz * gain / kRep;
    }
  }

  // Uma única swell longa analítica complementa a cascata FFT de 156 m,
  // garantindo rolos largos e legíveis sem o custo de quatro senoides.
  let swellGate = smoothstep(spacing * 1.4, spacing * 3.2, 22.0);
  let swellK = 6.2831853 / 22.0;
  let swellDir = vec2f(0.84, 0.5426);
  let swellPhase = swellK * dot(swellDir, base.xz) - 1.6737 * t + 0.35;
  let swellSin = sin(swellPhase);
  let swellCos = cos(swellPhase);
  let swellAmp = 0.2 * swellGate;

  height += swellAmp * swellSin;
  slopeX += swellAmp * swellK * swellDir.x * swellCos;
  slopeZ += swellAmp * swellK * swellDir.y * swellCos;
  dispX += 0.28 * swellAmp * swellDir.x * swellCos;
  dispZ += 0.28 * swellAmp * swellDir.y * swellCos;

  let jacobian = clamp(1.0 + jac - 0.26 * swellAmp * swellK * swellSin, 0.18, 1.85);

  // Normal analítica arredondada n = normalize(-dh/dx, 1, -dh/dz).
  let nLen = inverseSqrt(slopeX * slopeX + 1.0 + slopeZ * slopeZ);
  let normalW = vec3f(-slopeX * nLen, nLen, -slopeZ * nLen);

  let worldPos = vec3f(base.x + dispX, height, base.z + dispZ);

  // Esteira Kelvin do barco (mesma formulação do passe CPU anterior).
  let boatX = uniforms.windDirection.x;
  let boatZ = uniforms.windDirection.y;
  let yaw = uniforms.waveHeight;
  let halfL = max(2.5, uniforms.waveCount * 0.5);
  let halfB = max(1.2, uniforms.waveLength * 0.5);
  let slam = uniforms.windForce;
  var wake = 0.0;
  let dxB = worldPos.x - boatX;
  let dzB = worldPos.z - boatZ;
  if (abs(dxB) < 22.0 && abs(dzB) < 22.0) {
    let cy = cos(yaw);
    let sy = sin(yaw);
    let localLong = dxB * sy + dzB * cy;
    let localLat = dxB * cy - dzB * sy;
    let ellipDist = sqrt((localLong / halfL) * (localLong / halfL) + (localLat / halfB) * (localLat / halfB));
    let collarDelta = (ellipDist - 1.02) / 0.28;
    let collar = exp(-collarDelta * collarDelta) * (0.45 + 0.55 * slam);
    var kelvin = 0.0;
    if (localLong < halfL * 0.35 && localLong > -halfL * 2.6) {
      let wakeDist = max(0.0, halfL * 0.35 - localLong);
      let armOffset = wakeDist * 0.34;
      let armDist = abs(abs(localLat) - armOffset - halfB * 0.35);
      let decay = exp(-wakeDist / (halfL * 1.65));
      let armDelta = armDist / 0.65;
      kelvin = exp(-armDelta * armDelta) * decay * 0.65;
    }
    wake = clamp(collar + kelvin, 0.0, 1.0);
  }

  // Whitecaps: compressão Jacobiana + crista alta + esteira do barco.
  let crestLift = clamp(height / 0.55, 0.0, 1.0);
  let compression = clamp((1.06 - jacobian) / 0.42, 0.0, 1.0);
  let foam = clamp(compression * (0.7 + 0.9 * crestLift) + crestLift * 0.22, 0.0, 1.0);

  vertexOutputs.vPositionW = worldPos;
  vertexOutputs.vNormalW = normalW;
  vertexOutputs.vFoam = foam;
  vertexOutputs.vHeight = height;
  vertexOutputs.vWake = wake;

  let clip = uniforms.viewProjection * vec4f(worldPos, 1.0);
  vertexOutputs.position = clip;
  vertexOutputs.vRefractionMapTexCoord = vec3f(
    0.5 * (clip.w + clip.x),
    0.5 * (clip.w + clip.y),
    clip.w
  );
  let refl = uniforms.reflectionViewProjection * vec4f(worldPos, 1.0);
  vertexOutputs.vReflectionMapTexCoord = vec3f(
    0.5 * (refl.w + refl.x),
    0.5 * (refl.w + refl.y),
    refl.w
  );
}`;

  ShaderStore.ShadersStoreWGSL['waterPixelShader'] = `uniform vEyePosition: vec4f;
uniform vDiffuseColor: vec4f;
uniform vSpecularColor: vec4f;
uniform waterColor: vec4f;
uniform waterColor2: vec4f;
uniform colorBlendFactor: f32;
uniform colorBlendFactor2: f32;
uniform bumpHeight: f32;
uniform waveSpeed: f32;

varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vFoam: f32;
varying vHeight: f32;
varying vWake: f32;
varying vRefractionMapTexCoord: vec3f;
varying vReflectionMapTexCoord: vec3f;

var refractionSamplerSampler: sampler;
var refractionSampler: texture_2d<f32>;
var reflectionSamplerSampler: sampler;
var reflectionSampler: texture_2d<f32>;

// Fresnel de Schlick para água (n = 1.333): barato e visualmente equivalente
// ao Fresnel dielétrico exato para ângulos de câmera de diorama.
fn waterFresnel(cosTheta: f32) -> f32 {
  let c = clamp(cosTheta, 0.0, 1.0);
  return clamp(0.02 + 0.98 * pow(1.0 - c, 5.0), 0.02, 1.0);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let debugFlag = uniforms.bumpHeight;
  let t = uniforms.waveSpeed;
  let world = fragmentInputs.vPositionW;
  let viewDir = normalize(uniforms.vEyePosition.xyz - world);
  let horizon = smoothstep(110.0, 430.0, world.z);

  // Achata a normal no horizonte: elimina cintilação de FFT distante.
  var normalW = normalize(mix(fragmentInputs.vNormalW, vec3f(0.0, 1.0, 0.0), horizon * 0.75));

  if (debugFlag < 0.95) {
    // Modos de diagnóstico (normais / altura FFT / espuma). Sem 'return':
    // o processador WGSL do Babylon anexa o retorno de FragmentOutputs.
    if (debugFlag < 0.3) {
      fragmentOutputs.color = vec4f(normalW * 0.5 + vec3f(0.5), 1.0);
    } else if (debugFlag < 0.5) {
      let h = clamp(fragmentInputs.vHeight * 0.7 + 0.5, 0.0, 1.0);
      fragmentOutputs.color = vec4f(h, h * 0.62, 0.92 - h * 0.7, 1.0);
    } else {
      fragmentOutputs.color = vec4f(fragmentInputs.vFoam, fragmentInputs.vWake, 0.15, 1.0);
    }
  } else {
    let noV = clamp(dot(normalW, viewDir), 0.0, 1.0);
    let fresnel = waterFresnel(noV);
    let nearFactor = 1.0 - smoothstep(21.5, 160.0, world.z);

    let refrUV = clamp(fragmentInputs.vRefractionMapTexCoord.xy / max(fragmentInputs.vRefractionMapTexCoord.z, 1e-4) + normalW.xz * (0.045 * nearFactor), vec2f(0.002), vec2f(0.998));
    let reflUV = clamp(fragmentInputs.vReflectionMapTexCoord.xy / max(fragmentInputs.vReflectionMapTexCoord.z, 1e-4) + normalW.xz * 0.09, vec2f(0.002), vec2f(0.998));
    let refr = textureSample(refractionSampler, refractionSamplerSampler, refrUV);
    let refl = textureSample(reflectionSampler, reflectionSamplerSampler, reflUV);

    // A reflexão do RTT carrega a silhueta da serra; vista de rasante, ela
    // vira uma mancha escura sobre a água. Antes de aplicar Fresnel, diluímos
    // essa silhueta em azul atmosférico — a montanha continua insinuada, mas
    // sem parecer uma sombra sólida projetada na baía.
    let horizonFade = smoothstep(70.0, 300.0, world.z);
    let softRefl = mix(refl.rgb, vec3f(0.4, 0.61, 0.76), horizonFade * 0.72);

    // Corpo d'água: espalhamento simples por distância + turbidez/clareza.
    let turbidity = clamp(uniforms.colorBlendFactor, 0.0, 1.0);
    let clarity = clamp(uniforms.colorBlendFactor2, 0.0, 1.0);
    let inscatter = mix(uniforms.waterColor2.rgb, uniforms.waterColor.rgb, smoothstep(14.0, 210.0, world.z));
    let murk = 1.0 - exp(-max(0.0, world.z - 21.5) * (0.012 + turbidity * 0.022 + (1.0 - clarity) * 0.012));
    var color = mix(inscatter, refr.rgb * vec3f(0.62, 0.92, 1.0), (1.0 - murk) * (0.38 + clarity * 0.32));

    // Reflexo do céu/recife com Fresnel: no horizonte o peso cai para 0.5
    // (não 1.35), o que também enfraquece a sombra da montanha.
    let reflectionWeight = clamp(fresnel * mix(1.15, 0.42, horizon), 0.02, 0.5);
    color = mix(color, softRefl * vec3f(1.02, 1.06, 1.1), reflectionWeight);

    // SSS barato nas cristas.
    let crest = smoothstep(0.14, 0.6, fragmentInputs.vHeight);
    color += vec3f(0.01, 0.15, 0.13) * crest * (1.0 - horizon);

    // Glint solar Blinn-Phong (substitui o GGX de duplo lóbulo).
    let sunDir = normalize(vec3f(0.28, 0.68, 0.68));
    let halfDir = normalize(sunDir + viewDir);
    let spec = pow(max(dot(normalW, halfDir), 0.0), 220.0);
    color += vec3f(1.0, 0.95, 0.86) * spec * fresnel * 1.6;

    // Espuma: quebra de crista (vFoam) + esteira Kelvin (vWake), com
    // rompimento barato em duas senoides em vez de FBM/renda filamentar.
    let breakup = 0.62 + 0.38 * sin(world.x * 1.9 + t * 0.8) * sin(world.z * 2.3 - t * 0.55);
    let foamMask = clamp((fragmentInputs.vFoam * 1.45 + fragmentInputs.vWake * 1.05) * breakup, 0.0, 0.95);
    color = mix(color, vec3f(0.95, 0.985, 1.0), foamMask);
    color += vec3f(1.0, 0.95, 0.86) * spec * (1.0 - foamMask) * 0.45;

    // Perspectiva aérea no horizonte: a água dissolve numa bruma clara que
    // casa com o céu, em vez de manter a mancha escura do reflexo da serra.
    let hazeColor = mix(vec3f(0.3, 0.5, 0.66), vec3f(0.48, 0.66, 0.8), horizon);
    color = mix(color, hazeColor, smoothstep(90.0, 420.0, world.z) * 0.88);

    // Punch de gamma + espaço linear, coerente com ACES/bloom do pipeline.
    let punched = pow(clamp(color, vec3f(0.0), vec3f(8.0)), vec3f(0.84));
    fragmentOutputs.color = vec4f(pow(punched, vec3f(2.2)), 1.0);
  }
}`;
}

/**
 * Mapa de normais procedural multiescala + máscara de renda de espuma no canal B.
 */
function createWaterNormalTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const texture = new DynamicTexture('agua-normais-procedurais', { width: size, height: size }, scene, true);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;

  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const image = context.createImageData(size, size);
  const heights = new Float32Array(size * size);
  const laceField = new Float32Array(size * size);

  const waves: ReadonlyArray<readonly [number, number, number, number]> = [
    [2, 1, 1.08, 0.3],
    [-2, 3, 0.92, 1.1],
    [4, -2, 0.68, 2.4],
    [-3, -5, 0.54, 0.7],
    [-5, 3, 0.42, 3.8],
    [7, 4, 0.32, 1.9],
    [6, -7, 0.26, 4.6],
    [-8, 5, 0.21, 2.8],
    [11, -6, 0.16, 0.4],
    [-9, -10, 0.13, 5.2],
    [-13, 8, 0.1, 1.5],
    [15, 11, 0.08, 3.3],
  ];

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      let height = 0;
      let ridge = 0;
      for (const [fx, fy, amplitude, phase] of waves) {
        const theta = (u * fx + v * fy) * Math.PI * 2 + phase;
        const w = Math.sin(theta) + 0.28 * Math.cos(2 * theta + 0.5);
        height += w * amplitude;
        ridge += (1 - Math.abs(Math.sin(theta * 0.5))) * amplitude * 0.4;
      }
      heights[y * size + x] = height;
      laceField[y * size + x] = ridge;
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const up = (y - 1 + size) % size;
      const down = (y + 1) % size;
      const dx = heights[y * size + right] - heights[y * size + left];
      const dy = heights[down * size + x] - heights[up * size + x];
      const lace = clamp(laceField[y * size + x] * 0.44, 0, 1);
      const index = (y * size + x) * 4;
      image.data[index] = Math.round(clamp(128 + dx * 44, 0, 255));
      image.data[index + 1] = Math.round(clamp(128 + dy * 44, 0, 255));
      image.data[index + 2] = Math.round(clamp(182 + lace * 73, 180, 255));
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  texture.update(false);
  texture.uScale = 54;
  texture.vScale = 34;
  return texture;
}

/**
 * Malha oceânica frustum-adaptativa de altíssima densidade:
 *  - Em Z = Z_START (21.5m), concentra todos os vértices na largura visível da
 *    câmera (±38m -> 1 vértice a cada ~24cm!), eliminando 100% das ondas triangulares;
 *  - Abre suavemente em leque até ±615m no horizonte (Z = 555m).
 */
function gridZ(t: number): number {
  return Z_START + (Z_END - Z_START) * Math.pow(t, 1.42);
}

function halfWidthAtZ(z: number): number {
  return 38.0 + (z - Z_START) * 1.08;
}

function gridX(s: number, z: number): number {
  const sign = s < 0 ? -1 : 1;
  // Concentra suavemente mais resolução no centro do quadro onde ondas e barco estão
  const shaped = 0.72 * Math.abs(s) + 0.28 * Math.pow(Math.abs(s), 1.35);
  return sign * shaped * halfWidthAtZ(z);
}

export interface WaterSystem {
  readonly mesh: Mesh;
  readonly material: WaterMaterial;
  addRenderable(mesh: AbstractMesh): void;
  /** Reflexo apenas: céu e nuvens não devem entrar na refração subaquática. */
  addReflectionRenderable(mesh: AbstractMesh): void;
  /** Reposiciona o véu subaquático quando a câmera muda de perfil. */
  layout(frame: DioramaFrame): void;
  /** Atualiza estado da esteira Kelvin do barco na superfície oceânica. */
  setBoatWakeState(wake: BoatWakeState): void;
  /** Profundidade da câmera (m): ajusta o véu e a extinção subaquática. */
  setCameraDepth(depth: number): void;
  /** Alterna modo de visualização de diagnóstico técnico (Seção 13). */
  setDebugMode(mode: OceanDebugMode): void;
  getDebugMode(): OceanDebugMode;
  update(seconds: number, visual: VisualState): void;
  dispose(): void;
}

export function createWaterSystem(scene: Scene, quality: SceneQualityProfile): WaterSystem {
  // A síntese espectral precisa existir antes da textura de atlas: o perfil do
  // dispositivo define resolução e número de cascatas do FFT.
  configureOceanSpectrum(quality.fftSize, quality.fftCascades);
  installDeepseaWaterShader();
  installMeniscusCrossSectionShader();
  // Em WebGPU o deslocamento/normais da superfície saem da CPU e vão para o
  // vertex shader (atlas FFT em textura). O caminho GLSL/CPU permanece como
  // fallback fiel para WebGL2.
  const gpuSurface = scene.getEngine().isWebGPU;
  if (gpuSurface) {
    installDeepseaWaterShaderWGSL();
  }

  const columns = quality.waterSegmentsX;
  const rows = quality.waterSegmentsZ;
  const vertexCount = (columns + 1) * (rows + 1);
  const basePositions = new Float32Array(vertexCount * 3);
  const vertexSpacings = new Float32Array(vertexCount);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  for (let row = 0; row <= rows; row += 1) {
    const t = row / rows;
    const z = gridZ(t);
    const nextZ = gridZ(Math.min(1, (row + 1) / rows));
    const dz = Math.max(0.18, Math.abs(nextZ - z));

    for (let column = 0; column <= columns; column += 1) {
      const s = (column / columns) * 2 - 1;
      const x = gridX(s, z);
      const nextS = (Math.min(columns, column + 1) / columns) * 2 - 1;
      const dx = Math.max(0.18, Math.abs(gridX(nextS, z) - x));

      const index = row * (columns + 1) + column;
      basePositions[index * 3] = x;
      basePositions[index * 3 + 1] = 0;
      basePositions[index * 3 + 2] = z;
      vertexSpacings[index] = Math.max(dx, dz * 0.65);

      positions[index * 3] = x;
      positions[index * 3 + 1] = 0;
      positions[index * 3 + 2] = z;
      normals[index * 3] = 0;
      normals[index * 3 + 1] = 1;
      normals[index * 3 + 2] = 0;
      colors[index * 4] = 0;
      colors[index * 4 + 1] = 0;
      colors[index * 4 + 2] = 0;
      colors[index * 4 + 3] = 1;
      uvs[index * 2] = column / columns;
      uvs[index * 2 + 1] = t;
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const mesh = new Mesh('superficie-oceano-gerstner', scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.colors = colors;
  vertexData.uvs = uvs;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, true);
  mesh.hasVertexAlpha = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;
  mesh.receiveShadows = false;

  const normalTexture = createWaterNormalTexture(scene);

  // Atlas FFT empilhado (até 3 cascatas): R=altura, G=slopeX, B=slopeZ,
  // A=Jacobiano. Atualizado por upload de um Float32Array por quadro.
  const atlasWidth = quality.fftSize;
  const atlasHeight = quality.fftSize * quality.fftCascades;
  const oceanFftTexture = gpuSurface
    ? RawTexture.CreateRGBATexture(
        new Float32Array(atlasWidth * atlasHeight * 4),
        atlasWidth,
        atlasHeight,
        scene,
        false,
        false,
        Texture.NEAREST_SAMPLINGMODE,
        Constants.TEXTURETYPE_FLOAT,
      )
    : null;
  if (oceanFftTexture) {
    oceanFftTexture.name = 'atlas-fft-oceano';
    oceanFftTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    oceanFftTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
  }

  const renderTargetSize = new Vector2(quality.waterRenderTargetSize, quality.waterRenderTargetSize);
  const material = new WaterMaterial('agua-gerstner-material', scene, renderTargetSize);
  material.bumpTexture = gpuSurface && oceanFftTexture ? oceanFftTexture : normalTexture;
  material.bumpSuperimpose = !gpuSurface;
  material.bumpAffectsReflection = !gpuSurface;
  material.waveHeight = 0;
  material.waveLength = 0.1;
  material.windForce = 6.4;
  material.windDirection = new Vector2(0.82, 0.57);
  material.bumpHeight = 0.78;
  material.waterColor = new Color3(0.025, 0.36, 0.72);
  material.waterColor2 = new Color3(0.07, 0.68, 0.88);
  material.colorBlendFactor = 0.54;
  material.colorBlendFactor2 = 0.46;
  material.specularColor = new Color3(0.95, 0.98, 1.0);
  material.specularPower = 230;
  material.fresnelSeparate = true;
  material.alpha = 1;
  material.backFaceCulling = false;
  mesh.material = material;

  // ── Seção transversal 3D fina e orgânica da linha d'água (`frente-onda-corte`) ──
  const meniscusColumns = 224;
  const MENISCUS_ROWS = 6;
  const MENISCUS_V_FRACTIONS = [0.0, 0.12, 0.28, 0.48, 0.72, 1.0] as const;
  const meniscusVertexCount = (meniscusColumns + 1) * MENISCUS_ROWS;
  const meniscusPositions = new Float32Array(meniscusVertexCount * 3);
  const meniscusNormals = new Float32Array(meniscusVertexCount * 3);
  const meniscusColors = new Float32Array(meniscusVertexCount * 4);
  const meniscusUvs = new Float32Array(meniscusVertexCount * 2);
  const meniscusIndices: number[] = [];
  const meniscusSpanX = 36;
  // Espessura delicada de menisco real de dome port (~22cm), nunca uma parede grossa
  const meniscusBaseDepth = 0.22;

  for (let col = 0; col <= meniscusColumns; col += 1) {
    const u = col / meniscusColumns;
    const x = (u * 2 - 1) * meniscusSpanX;
    for (let r = 0; r < MENISCUS_ROWS; r += 1) {
      const v = MENISCUS_V_FRACTIONS[r];
      const idx = col * MENISCUS_ROWS + r;
      meniscusPositions[idx * 3] = x;
      meniscusPositions[idx * 3 + 1] = -v * meniscusBaseDepth;
      meniscusPositions[idx * 3 + 2] = Z_START;

      meniscusNormals[idx * 3] = 0;
      meniscusNormals[idx * 3 + 1] = 0.25 * (1 - v);
      meniscusNormals[idx * 3 + 2] = -0.97;

      meniscusColors[idx * 4] = 0;
      meniscusColors[idx * 4 + 1] = 0;
      meniscusColors[idx * 4 + 2] = 0.5;
      meniscusColors[idx * 4 + 3] = 1;

      meniscusUvs[idx * 2] = u * 6;
      meniscusUvs[idx * 2 + 1] = v;
    }

    if (col < meniscusColumns) {
      for (let r = 0; r < MENISCUS_ROWS - 1; r += 1) {
        const a = col * MENISCUS_ROWS + r;
        const b = a + 1;
        const c = (col + 1) * MENISCUS_ROWS + r;
        const d = c + 1;
        meniscusIndices.push(a, b, c, b, d, c);
      }
    }
  }

  const meniscusMesh = new Mesh('frente-onda-corte', scene);
  const meniscusData = new VertexData();
  meniscusData.positions = meniscusPositions;
  meniscusData.normals = meniscusNormals;
  meniscusData.colors = meniscusColors;
  meniscusData.uvs = meniscusUvs;
  meniscusData.indices = meniscusIndices;
  meniscusData.applyToMesh(meniscusMesh, true);
  meniscusMesh.hasVertexAlpha = false;
  meniscusMesh.alwaysSelectAsActiveMesh = true;
  meniscusMesh.isPickable = false;
  meniscusMesh.applyFog = false;
  meniscusMesh.renderingGroupId = 2;

  const meniscusMaterial = new ShaderMaterial(
    'frente-onda-material',
    scene,
    {
      vertex: 'waterMeniscus',
      fragment: 'waterMeniscus',
    },
    {
      attributes: ['position', 'normal', 'uv', 'color'],
      uniforms: [
        'world',
        'worldViewProjection',
        'time',
        'cameraPosition',
        'tintColor',
        'waterClarity',
        'pollutionFactor',
      ],
      samplers: ['normalSampler'],
      needAlphaBlending: true,
    },
  );
  meniscusMaterial.setTexture('normalSampler', normalTexture);
  meniscusMaterial.setFloat('time', 0);
  meniscusMaterial.setVector3('cameraPosition', scene.activeCamera?.position ?? new Vector3(0, -1.35, 0));
  meniscusMaterial.setColor3('tintColor', new Color3(1, 1, 1));
  meniscusMaterial.setFloat('waterClarity', 0.85);
  meniscusMaterial.setFloat('pollutionFactor', 0);
  meniscusMaterial.backFaceCulling = false;
  meniscusMaterial.disableDepthWrite = true;
  meniscusMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;
  meniscusMesh.material = meniscusMaterial;

  const meniscusTint = new Color3(1, 1, 1);

  // ── Véu óptico subaquático (extinção Beer-Lambert azul profundo -> turquesa claro) ─
  const VEIL_ROWS = 8;
  const veilPositions = new Float32Array(VEIL_ROWS * 2 * 3);
  const veilColors = new Float32Array(VEIL_ROWS * 2 * 4);
  const veilIndices: number[] = [];
  for (let row = 0; row < VEIL_ROWS - 1; row += 1) {
    const a = row * 2;
    veilIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const veilMesh = new Mesh('veu-submarino-azul', scene);
  const veilData = new VertexData();
  veilData.positions = veilPositions;
  veilData.colors = veilColors;
  veilData.indices = veilIndices;
  veilData.applyToMesh(veilMesh, true);
  veilMesh.parent = scene.activeCamera;
  veilMesh.hasVertexAlpha = true;
  veilMesh.alwaysSelectAsActiveMesh = true;
  veilMesh.isPickable = false;
  veilMesh.applyFog = false;
  veilMesh.renderingGroupId = 3;

  const veilMaterial = new StandardMaterial('veu-submarino-material', scene);
  veilMaterial.emissiveColor = new Color3(1, 1, 1);
  veilMaterial.diffuseColor = Color3.Black();
  veilMaterial.specularColor = Color3.Black();
  veilMaterial.ambientColor = Color3.Black();
  veilMaterial.disableLighting = true;
  veilMaterial.backFaceCulling = false;
  veilMaterial.fogEnabled = false;
  veilMaterial.disableDepthWrite = true;
  veilMaterial.alpha = 1;
  veilMesh.material = veilMaterial;

  let currentFrame: DioramaFrame | null = null;
  let cameraDepth = 0;
  let debugMode: OceanDebugMode = 'none';
  let boatWake: BoatWakeState = {
    x: -10,
    z: 38,
    yaw: 1.22,
    slam: 0.3,
    hullLength: 14.5,
    hullBeam: 5.2,
  };

  const updateVeilVertices = (frame: DioramaFrame, visual?: VisualState): void => {
    const horizon = frame.horizonScreenY;
    const under = clamp(cameraDepth / 1.4);
    const murk = visual ? clamp(visual.turbidity * 0.45 + visual.sewage * 0.35 + visual.oil * 0.25) : 0;
    const depthAbs = clamp(cameraDepth / 12);

    const deepR = mix(mix(0.028, 0.07, murk), 0.008, depthAbs);
    const deepG = mix(mix(0.27, 0.27, murk), 0.12, depthAbs);
    const deepB = mix(mix(0.6, 0.46, murk), 0.29, depthAbs);

    const nearR = mix(mix(0.1, 0.15, murk), 0.02, depthAbs);
    const nearG = mix(mix(0.52, 0.46, murk), 0.24, depthAbs);
    const nearB = mix(mix(0.78, 0.62, murk), 0.43, depthAbs);

    // Acima da água o véu começa no horizonte. Ao submergir, o horizonte real
    // sai do quadro e o véu passa a cobrir a tela inteira, com alfa crescente
    // rumo ao fundo — a leitura de extinção da luz na coluna d'água.
    const startV = mix(horizon, 0, under);
    const startAlpha = under * 0.14;
    const endAlpha = mix(0.2, 0.34, under);

    const rowsConfig = [
      { v: 0, r: deepR, g: deepG, b: deepB, alpha: 0 },
      { v: startV, r: deepR, g: deepG, b: deepB, alpha: startAlpha },
      { v: startV + (1 - startV) * 0.18, r: deepR, g: deepG, b: deepB, alpha: mix(startAlpha, endAlpha, 0.3) },
      { v: startV + (1 - startV) * 0.38, r: mix(deepR, nearR, 0.5), g: mix(deepG, nearG, 0.5), b: mix(deepB, nearB, 0.5), alpha: mix(startAlpha, endAlpha, 0.55) },
      { v: startV + (1 - startV) * 0.6, r: nearR, g: nearG, b: nearB, alpha: mix(startAlpha, endAlpha, 0.78) },
      { v: startV + (1 - startV) * 0.8, r: nearR, g: nearG, b: nearB, alpha: mix(startAlpha, endAlpha, 0.9) },
      { v: 1, r: nearR, g: nearG, b: nearB, alpha: endAlpha },
      { v: 1, r: nearR, g: nearG, b: nearB, alpha: endAlpha },
    ];
    const halfHeight = VEIL_DISTANCE * frame.tanHalfFov;
    const halfWidth = halfHeight * frame.aspect;
    for (let row = 0; row < VEIL_ROWS; row += 1) {
      const entry = rowsConfig[row];
      const ndcY = 1 - 2 * entry.v;
      const y = (ndcY - frame.shift) * halfHeight;
      for (let col = 0; col < 2; col += 1) {
        const vertex = row * 2 + col;
        veilPositions[vertex * 3] = col === 0 ? -halfWidth : halfWidth;
        veilPositions[vertex * 3 + 1] = y;
        veilPositions[vertex * 3 + 2] = VEIL_DISTANCE;
        veilColors[vertex * 4] = entry.r;
        veilColors[vertex * 4 + 1] = entry.g;
        veilColors[vertex * 4 + 2] = entry.b;
        veilColors[vertex * 4 + 3] = entry.alpha;
      }
    }
    veilMesh.updateVerticesData(VertexBuffer.PositionKind, veilPositions, false, false);
    veilMesh.updateVerticesData(VertexBuffer.ColorKind, veilColors, false, false);
    veilMesh.refreshBoundingInfo();
  };

  const renderables = new Set<AbstractMesh>();
  const scratchSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    slopeX: 0,
    slopeZ: 0,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    jacobian: 1,
    foam: 0,
    breaker: 0,
  };

  return {
    mesh,
    material,

    addRenderable(target: AbstractMesh): void {
      if (target === mesh || target === meniscusMesh || renderables.has(target)) return;
      renderables.add(target);
      material.addToRenderList(target);
    },

    addReflectionRenderable(target: AbstractMesh): void {
      if (target === mesh || target === meniscusMesh) return;
      const reflection = material.reflectionTexture;
      if (!reflection?.renderList || reflection.renderList.includes(target)) return;
      reflection.renderList.push(target);
    },

    layout(frame: DioramaFrame): void {
      currentFrame = frame;
      updateVeilVertices(frame);
    },

    setBoatWakeState(wake: BoatWakeState): void {
      boatWake = wake;
    },

    setCameraDepth(depth: number): void {
      cameraDepth = Math.max(0, depth);
    },

    setDebugMode(mode: OceanDebugMode): void {
      debugMode = mode;
      material.wireframe = mode === 'wireframe';
    },

    getDebugMode(): OceanDebugMode {
      return debugMode;
    },

    update(seconds: number, visual: VisualState): void {
      const gpuAtlas = gpuSurface && oceanFftTexture;

      if (gpuAtlas && oceanFftTexture) {
        // Caminho WebGPU: um único upload de 64x192 RGBA float32 por quadro.
        // Toda a reconstrução de altura/normais/espuma acontece na GPU.
        const atlas = getOceanFftAtlas(seconds);
        oceanFftTexture.update(atlas.data);

        material.waveSpeed = seconds;
        material.windDirection.set(boatWake.x, boatWake.z);
        material.waveHeight = boatWake.yaw;
        material.waveCount = boatWake.hullLength;
        material.waveLength = boatWake.hullBeam;
        material.windForce = boatWake.slam;
        material.bumpHeight =
          debugMode === 'normals'
            ? 0.1
            : debugMode === 'height'
              ? 0.4
              : debugMode === 'foam'
                ? 0.7
                : 1.0;
      } else {
        stepOceanSpectrum(seconds);
      }

      if (!gpuAtlas) {
        const debugAlpha =
          debugMode === 'normals'
            ? 0.2
            : debugMode === 'height'
              ? 0.4
              : debugMode === 'foam'
                ? 0.6
                : 1.0;

        const wakeCos = Math.cos(boatWake.yaw);
        const wakeSin = Math.sin(boatWake.yaw);
        const halfL = Math.max(2.5, boatWake.hullLength * 0.5);
        const halfB = Math.max(1.2, boatWake.hullBeam * 0.5);

        for (let index = 0; index < vertexCount; index += 1) {
          const baseX = basePositions[index * 3];
          const baseZ = basePositions[index * 3 + 2];
          const sp = vertexSpacings[index];
          const sample = sampleOcean(baseX, baseZ, seconds, sp, scratchSample);

          const worldX = baseX + sample.displacementX;
          const worldZ = baseZ + sample.displacementZ;

          positions[index * 3] = worldX;
          positions[index * 3 + 1] = sample.height;
          positions[index * 3 + 2] = worldZ;
          normals[index * 3] = sample.normalX;
          normals[index * 3 + 1] = sample.normalY;
          normals[index * 3 + 2] = sample.normalZ;

          // Anel de espuma na linha d'água e esteira Kelvin ao redor do casco.
          let hullWakeFoam = 0;
          const dxB = worldX - boatWake.x;
          const dzB = worldZ - boatWake.z;
          if (Math.abs(dxB) < 22 && Math.abs(dzB) < 22) {
            const localLong = dxB * wakeSin + dzB * wakeCos;
            const localLat = dxB * wakeCos - dzB * wakeSin;
            const ellipDist = Math.hypot(localLong / halfL, localLat / halfB);
            const collar = Math.exp(-Math.pow((ellipDist - 1.02) / 0.28, 2)) * (0.45 + 0.55 * boatWake.slam);
            let kelvinV = 0;
            if (localLong < halfL * 0.35 && localLong > -halfL * 2.6) {
              const wakeDist = Math.max(0, halfL * 0.35 - localLong);
              const armOffset = wakeDist * 0.34;
              const armDist = Math.abs(Math.abs(localLat) - armOffset - halfB * 0.35);
              const decay = Math.exp(-wakeDist / (halfL * 1.65));
              kelvinV = Math.exp(-Math.pow(armDist / 0.65, 2)) * decay * 0.65;
            }
            hullWakeFoam = clamp(collar + kelvinV, 0, 1);
          }

          colors[index * 4] = sample.foam;
          colors[index * 4 + 1] = sample.breaker;
          colors[index * 4 + 2] = hullWakeFoam;
          colors[index * 4 + 3] = debugAlpha;
        }

        mesh.updateVerticesData(VertexBuffer.PositionKind, positions, false, false);
        mesh.updateVerticesData(VertexBuffer.NormalKind, normals, false, false);
        mesh.updateVerticesData(VertexBuffer.ColorKind, colors, false, false);
      }

      // Atualiza o menisco frontal (`frente-onda-corte`):
      // O topo (r = 0) usa o mesmo espaçamento de Nyquist da linha frontal da superfície
      // para casar 100% sem frestas e com curvatura 100% arredondada.
      const frontSpacing = 0.24;
      for (let col = 0; col <= meniscusColumns; col += 1) {
        const u = col / meniscusColumns;
        const baseX = (u * 2 - 1) * meniscusSpanX;
        const sample = sampleOcean(baseX, Z_START, seconds, frontSpacing, scratchSample);

        const capillary =
          Math.sin(baseX * 0.95 - seconds * 2.4) * 0.012 +
          Math.cos(baseX * 1.65 + seconds * 2.9) * 0.008;
        const sliceThickness =
          meniscusBaseDepth + sample.breaker * 0.09 + Math.max(0, sample.height) * 0.06;
        const crestNormalized = clamp((sample.height + 0.45) / 0.95, 0, 1);

        for (let r = 0; r < MENISCUS_ROWS; r += 1) {
          const v = MENISCUS_V_FRACTIONS[r];
          const idx = col * MENISCUS_ROWS + r;
          const orbitalAtten = Math.exp(-v * 1.45);
          const meniscusCurveZ = Math.sin(v * Math.PI) * 0.045;

          meniscusPositions[idx * 3] = baseX + sample.displacementX * orbitalAtten;
          meniscusPositions[idx * 3 + 1] =
            sample.height + (1 - v) * 0.018 + capillary * (1 - v * 0.65) - v * sliceThickness;
          meniscusPositions[idx * 3 + 2] =
            Z_START + sample.displacementZ * orbitalAtten - meniscusCurveZ;

          const ny = mix(sample.normalY * 0.72, -0.1, v);
          const nx = sample.normalX * (1 - v * 0.5);
          const nz = -Math.sqrt(Math.max(0.1, 1 - nx * nx - ny * ny));
          meniscusNormals[idx * 3] = nx;
          meniscusNormals[idx * 3 + 1] = ny;
          meniscusNormals[idx * 3 + 2] = nz;

          meniscusColors[idx * 4] = sample.foam;
          meniscusColors[idx * 4 + 1] = sample.breaker;
          meniscusColors[idx * 4 + 2] = crestNormalized;
          meniscusColors[idx * 4 + 3] = 1;
        }
      }
      meniscusMesh.updateVerticesData(VertexBuffer.PositionKind, meniscusPositions, false, false);
      meniscusMesh.updateVerticesData(VertexBuffer.NormalKind, meniscusNormals, false, false);
      meniscusMesh.updateVerticesData(VertexBuffer.ColorKind, meniscusColors, false, false);

      const clarity = visual.waterClarity;
      const turbidity = visual.turbidity;
      const sewage = visual.sewage;
      const oil = visual.oil;

      const deepR = 0.024 + turbidity * 0.08 + sewage * 0.05 + oil * 0.02;
      const deepG = 0.35 - turbidity * 0.04 + sewage * 0.03 - oil * 0.1;
      const deepB = 0.72 - turbidity * 0.14 - sewage * 0.14 - oil * 0.18;
      material.waterColor.set(
        clamp(deepR, 0, 1),
        clamp(deepG, 0.12, 0.82),
        clamp(deepB, 0.18, 0.92),
      );

      const nearR = 0.065 + turbidity * 0.09 + sewage * 0.06;
      const nearG = 0.68 - turbidity * 0.08 + sewage * 0.02 - oil * 0.16;
      const nearB = 0.88 - turbidity * 0.16 - sewage * 0.15 - oil * 0.22;
      material.waterColor2.set(
        clamp(nearR, 0, 1),
        clamp(nearG, 0.18, 0.9),
        clamp(nearB, 0.24, 0.96),
      );

      if (gpuAtlas) {
        // Semântica GPU: colorBlendFactor = turbidez; colorBlendFactor2 = clareza.
        material.colorBlendFactor = clamp(turbidity * 0.85 + sewage * 0.45 + oil * 0.25, 0, 1);
        material.colorBlendFactor2 = clamp(clarity, 0, 1);
      } else {
        material.colorBlendFactor = clamp(
          0.52 + turbidity * 0.18 + sewage * 0.12 + oil * 0.08,
          0.46,
          0.82,
        );
      }
      material.specularPower = 200 + clarity * 80;

      if (currentFrame) {
        updateVeilVertices(currentFrame, visual);
      }
      veilMaterial.alpha = clamp(0.88 + clarity * 0.12, 0.8, 1);

      meniscusTint.set(
        clamp(1.0 - oil * 0.32, 0.5, 1),
        clamp(1.0 - turbidity * 0.14 - oil * 0.35, 0.5, 1),
        clamp(1.0 - turbidity * 0.22 - sewage * 0.18 - oil * 0.38, 0.45, 1),
      );
      meniscusMaterial.setFloat('time', seconds);
      if (scene.activeCamera) {
        meniscusMaterial.setVector3('cameraPosition', scene.activeCamera.position);
      }
      meniscusMaterial.setColor3('tintColor', meniscusTint);
      meniscusMaterial.setFloat('waterClarity', clarity);
      meniscusMaterial.setFloat('pollutionFactor', clamp(turbidity * 0.45 + sewage * 0.35 + oil * 0.4, 0, 1));
    },

    dispose(): void {
      veilMaterial.dispose();
      veilMesh.dispose();
      meniscusMaterial.dispose();
      meniscusMesh.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
