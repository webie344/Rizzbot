// lighting.js
// Procedural sky + sun + ambient. No HDRI, no assets needed.

import * as THREE from 'three';

export function setupSky(scene) {
  const skyGeo = new THREE.SphereGeometry(900, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor:    { value: new THREE.Color(0x2a6fb8) },
      bottomColor: { value: new THREE.Color(0xcfd9dc) },
      offset:      { value: 60.0 },
      exponent:    { value: 0.7 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float t = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  scene.fog = new THREE.Fog(0xb8c4c9, 150, 520);
  scene.background = null;
  return sky;
}

export function setupLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x4a463a, 0.55));

  const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
  sun.position.set(120, 180, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  const d = 140;
  sun.shadow.camera.left   = -d;
  sun.shadow.camera.right  =  d;
  sun.shadow.camera.top    =  d;
  sun.shadow.camera.bottom = -d;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0x8fb8e0, 0.45);
  fill.position.set(-100, 60, -80);
  scene.add(fill);

  return { sun, fill };
}

export function updateSun(sun, playerPos) {
  sun.position.set(playerPos.x + 120, playerPos.y + 180, playerPos.z + 90);
  sun.target.position.set(playerPos.x, playerPos.y, playerPos.z);
  sun.target.updateMatrixWorld();
}

