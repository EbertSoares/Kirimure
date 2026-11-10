import { describe, expect, it } from 'vitest';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/FBX';
// @ts-expect-error módulo nativo do Node utilizado apenas em tempo de teste
import * as fs from 'node:fs';

describe('Inspeção do modelo FBX do Barco', () => {
  it('carrega o FBX com sucesso e valida dimensões e materiais PBR', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const fbxData = fs.readFileSync('public/models/boat/Fishing_Ship_Asset.fbx');
    const base64 = fbxData.toString('base64');
    const container = await SceneLoader.LoadAssetContainerAsync('data:;base64,', base64, scene, null, '.fbx');

    expect(container.meshes.length).toBeGreaterThanOrEqual(1);
    expect(container.materials.length).toBe(4);

    const mesh = container.meshes[0];
    const targetLength = 4.4;
    const fbxLength = 8.4782; // meters

    const root = new TransformNode('barco-raiz', scene);
    const fbxRoot = container.transformNodes[0];
    expect(fbxRoot).toBeDefined();
    fbxRoot.parent = root;

    // Converte de cm para metros e escala para o comprimento de projeto (4.4m), mantendo Z negativo para preservar winding
    const scaleFactor = (targetLength / fbxLength) * 0.01;
    fbxRoot.scaling.set(scaleFactor, scaleFactor, -scaleFactor);
    // Compensa o centro de gravidade e alinha perfeitamente em X, Y e Z
    fbxRoot.position.set(-0.5285, 0.12, -0.914);

    root.computeWorldMatrix(true);
    mesh.computeWorldMatrix(true);

    const wb = mesh.getBoundingInfo().boundingBox;
    const lengthZ = wb.maximumWorld.z - wb.minimumWorld.z;
    const widthX = wb.maximumWorld.x - wb.minimumWorld.x;
    const heightY = wb.maximumWorld.y - wb.minimumWorld.y;

    expect(lengthZ).toBeCloseTo(4.4, 1);
    expect(widthX).toBeCloseTo(2.19, 1);
    expect(heightY).toBeCloseTo(3.21, 1);

    // Valida simetria lateral (centro de X em 0.0)
    const centerX = (wb.maximumWorld.x + wb.minimumWorld.x) * 0.5;
    expect(Math.abs(centerX)).toBeLessThan(0.05);
  });
});
