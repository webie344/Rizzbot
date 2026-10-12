// assetLoader.js
// Loads .gltf + .bin pairs. Missing files are silently skipped.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CITY_BASE } from './assetManifest.js';

export class AssetLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map();      // filename -> THREE.Group (source template)
    this.failed = new Set();     // filenames that 404'd
    this.loading = 0;
    this.loadedCount = 0;
    this.onProgress = null;      // (loaded, total, name) => void
  }

  async load(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    if (this.failed.has(name)) return null;

    return new Promise((resolve) => {
      this.loader.load(
        CITY_BASE + name,
        (gltf) => {
          gltf.scene.traverse((n) => {
            if (n.isMesh) {
              n.castShadow = true;
              n.receiveShadow = true;
              if (n.material) {
                const mats = Array.isArray(n.material) ? n.material : [n.material];
                mats.forEach((m) => {
                  if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
                  m.side = THREE.FrontSide;
                });
              }
            }
          });
          this.cache.set(name, gltf.scene);
          this.loadedCount++;
          if (this.onProgress) this.onProgress(this.loadedCount, this.loading, name);
          resolve(gltf.scene);
        },
        undefined,
        () => {
          this.failed.add(name);
          this.loadedCount++;
          if (this.onProgress) this.onProgress(this.loadedCount, this.loading, name);
          resolve(null);
        }
      );
    });
  }

  async loadAll(names, concurrency = 6) {
    const list = [...new Set(names)].filter((n) => n && !this.failed.has(n));
    this.loading = list.length;
    this.loadedCount = 0;

    let i = 0;
    const workers = new Array(Math.min(concurrency, list.length)).fill(0).map(async () => {
      while (i < list.length) {
        const name = list[i++];
        await this.load(name);
      }
    });
    await Promise.all(workers);

    console.log(
      `[AssetLoader] loaded ${this.cache.size} models, ${this.failed.size} missing`
    );
  }

  get(name) {
    return this.cache.get(name) || null;
  }

  clone(name) {
    const src = this.get(name);
    if (!src) return null;
    return src.clone(true);
  }

  pickRandom(list) {
    const valid = list.filter((n) => this.cache.has(n));
    if (!valid.length) return null;
    return valid[Math.floor(Math.random() * valid.length)];
  }
}

