import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore, collection, doc, setDoc, updateDoc, deleteDoc,
    onSnapshot, query, serverTimestamp, addDoc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { AssetLoader } from './assetLoader.js';
import { CityGenerator } from './cityGenerator.js';
import { setupSky, setupLighting, updateSun } from './lighting.js';
import * as MANIFEST from './assetManifest.js';

const firebaseConfig = {
    apiKey: "AIzaSyC9jF-ocy6HjsVzWVVlAyXW-4aIFgA79-A",
    authDomain: "crypto-6517d.firebaseapp.com",
    projectId: "crypto-6517d",
    storageBucket: "crypto-6517d.firebasestorage.app",
    messagingSenderId: "60263975159",
    appId: "1:60263975159:web:bd53dcaad86d6ed9592bf2"
};

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) { console.error('Firebase init:', e); }

const MAP_HALF = 200;
const FOG_NEAR = 200;
const FOG_FAR = 500;
const PLAYER_RADIUS = 0.4;

const NORMAL_FOV = 70;
const RIFLE_FOV = 45;
const SNIPER_FOV = 22;
const NORMAL_CAM_DIST = 3.0;
const RIFLE_CAM_DIST = 1.8;
const SNIPER_CAM_DIST = 0.15;
const ZOOM_AUTO_RESET_MS = 2000;

const ZOOM_MODE = { OFF: 'off', RIFLE: 'rifle', SNIPER: 'sniper' };

function playGunSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume().then(() => createGunSound(ctx));
        else createGunSound(ctx);
    } catch (e) {}
}
function createGunSound(ctx) {
    try {
        const t = ctx.currentTime;
        const o1 = ctx.createOscillator(), g1 = ctx.createGain();
        o1.type = 'sawtooth'; o1.frequency.value = 120;
        g1.gain.setValueAtTime(0.3, t);
        g1.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        o1.connect(g1); g1.connect(ctx.destination);
        o1.start(t); o1.stop(t + 0.2);
        const o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.type = 'triangle'; o2.frequency.value = 240;
        g2.gain.setValueAtTime(0.15, t);
        g2.gain.exponentialRampToValueAtTime(0.005, t + 0.15);
        o2.connect(g2); g2.connect(ctx.destination);
        o2.start(t); o2.stop(t + 0.15);
    } catch (e) {}
}

const SVG_ICONS = {
    punch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20h12a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-1V8a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2z"/><path d="M9 8V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3"/></svg>`,
    kick: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l6-4 6 2 4-6"/><path d="M10 16l-2-8 4-2 2 6"/><circle cx="13" cy="4" r="2"/></svg>`,
    roll: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9"/><polyline points="3 4 3 12 11 12"/></svg>`,
    wave: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11V7a1.5 1.5 0 0 1 3 0v4"/><path d="M10 11V5a1.5 1.5 0 0 1 3 0v6"/><path d="M13 11V6a1.5 1.5 0 0 1 3 0v7"/><path d="M16 11V9a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-2l-1-2"/></svg>`,
    sword: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/></svg>`,
    interact: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    shoot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>`,
    reload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    bolt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    zoom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
};

const REAL_ACTIONS = [
    { name: 'Punch_Left',   icon: 'punch',    label: 'Punch L',   desc: '40 dmg' },
    { name: 'Punch_Right',  icon: 'punch',    label: 'Punch R',   desc: '40 dmg' },
    { name: 'Kick_Left',    icon: 'kick',     label: 'Kick L',    desc: '50 dmg' },
    { name: 'Kick_Right',   icon: 'kick',     label: 'Kick R',    desc: '50 dmg' },
    { name: 'Sword_Slash',  icon: 'sword',    label: 'Sword',     desc: '75 dmg' },
    { name: 'Roll',         icon: 'roll',     label: 'Roll',      desc: 'Dodge 3s cd' },
    { name: 'Wave',         icon: 'wave',     label: 'Wave',      desc: 'Emote' },
    { name: 'Interact',     icon: 'interact', label: 'Interact',  desc: 'Pickup / Open' }
];

const MELEE = {
    Punch_Left:  { damage: 40, range: 2.2, cooldown: 500,  aimDot: 0.5 },
    Punch_Right: { damage: 40, range: 2.2, cooldown: 500,  aimDot: 0.5 },
    Kick_Left:   { damage: 50, range: 2.4, cooldown: 700,  aimDot: 0.4 },
    Kick_Right:  { damage: 50, range: 2.4, cooldown: 700,  aimDot: 0.4 },
    Sword_Slash: { damage: 75, range: 2.6, cooldown: 600,  aimDot: 0.3 }
};

class Game {
    constructor() {
        console.log('🎮 CODM-STYLE CITY WARZONE — Downtown City Edition');

        this.currentUser = null;
        this.playerId = null;
        this.playerName = 'Player_' + Math.floor(Math.random() * 10000);
        this.playerRef = null;
        this.playersCollection = null;
        this.killsCollection = null;
        this.unsubscribePlayers = null;
        this.heartbeatInterval = null;
        this.firebaseReady = false;

        this.glbBase = null;
        this.glbAnimations = {};
        this.glbLoaded = false;
        this.handBoneName = null;

        this.gunTemplate = null;
        this.gunLoaded = false;

        this.localPlayer = null;
        this.otherPlayers = new Map();
        this.lastUpdateTime = Date.now();

        this.overrideAnim = null;
        this.overrideUntil = 0;
        this.cooldowns = {};
        this.rolling = false;
        this.rollUntil = 0;
        this.rollDirection = new THREE.Vector3();

        this.zoomMode = ZOOM_MODE.OFF;
        this.lastShootTime = 0;
        this._resetZoomArmed = false;
        this.currentFov = NORMAL_FOV;
        this.currentCamDist = NORMAL_CAM_DIST;

        this.velocityY = 0;
        this.onGround = true;
        this.playerY = 0;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);

        this.camera = new THREE.PerspectiveCamera(NORMAL_FOV, window.innerWidth / window.innerHeight, 0.1, 1500);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;

        const cont = document.getElementById('gameContainer');
        if (cont) cont.appendChild(this.renderer.domElement);
        else document.body.appendChild(this.renderer.domElement);

        this.health = 100;
        this.maxHealth = 100;
        this.damagePerShot = 33;
        this.score = 0;
        this.kills = 0;
        this.ammo = 30;
        this.maxAmmo = 30;
        this.boxesCollected = 0;
        this.gameActive = false;
        this._shootFlashUntil = 0;

        this.camHeight = 2.0;
        this.camLookHeight = 1.2;

        this.playerPos = new THREE.Vector3(0, 0, 30);
        this.playerYaw = 0;
        this.lookPitch = 0;

        this.walkSpeed = 0.25;
        this.sprintMultiplier = 1.7;
        this.strafeMultiplier = 0.85;
        this.backwardMultiplier = 0.75;
        this.rollSpeed = 0.7;
        this.moveX = 0;
        this.moveY = 0;
        this.footstepTime = 0;
        this.touchSensitivity = 0.006;

        this.joystickActive = false;
        this.joystickTouchId = null;
        this.joystickMaxMove = 40;
        this.joystickThumb = document.getElementById('joystickThumb');
        this.joystickContainer = document.getElementById('joystickContainer');

        this.swipeTouchId = null;
        this.lastSwipeX = 0;
        this.lastSwipeY = 0;

        this.ammoBoxes = [];
        this.nearbyDoor = null;

        // New city system
        this.loader = new AssetLoader();
        this.city = null;
        this.sun = null;
        this._bootComplete = false;

        this.setupControls();
        this.setupMinimap();
        this.buildAnimMenu();
        this.injectSVGIcons();

        setInterval(() => this.updateCooldownUI(), 50);

        this.boot();

        this.animate();

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        window.addEventListener('beforeunload', () => this.cleanup());
    }

    // ================= BOOT / LOADING =================
    async boot() {
        const loadingEl = this.showLoadingScreen();
        try {
            this.loader.onProgress = (done, total, name) => {
                this.updateLoadingScreen(loadingEl, done, total, name);
            };

            await this.loader.loadAll(MANIFEST.PRELOAD, 6);

            setupSky(this.scene);
            const { sun } = setupLighting(this.scene);
            this.sun = sun;

            this.city = new CityGenerator(this.scene, this.loader);
            this.city.build();

            await Promise.all([
                this.loadGLB().catch(e => console.error('Soldier load failed:', e)),
                this.loadGun().catch(e => console.warn('Gun load failed:', e.message))
            ]);
            this.createLocalPlayer();
            this.setupAuthListener();

            this._bootComplete = true;
            this.hideLoadingScreen(loadingEl);
        } catch (err) {
            console.error('[boot] failed:', err);
            this.hideLoadingScreen(loadingEl);
        }
    }

    showLoadingScreen() {
        let el = document.getElementById('koLoading');
        if (!el) {
            el = document.createElement('div');
            el.id = 'koLoading';
            el.style.cssText = `
                position:fixed; inset:0; background:#0a0e1a; z-index:99999;
                display:flex; flex-direction:column; align-items:center; justify-content:center;
                color:#4aff9e; font-family:Arial,sans-serif; gap:20px;
            `;
            el.innerHTML = `
                <div style="font-size:28px; letter-spacing:4px; font-weight:bold;">LOADING CITY</div>
                <div style="width:min(80vw,420px); height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                    <div id="koLoadingBar" style="height:100%; width:0%; background:#4aff9e; transition:width 0.15s;"></div>
                </div>
                <div id="koLoadingText" style="font-size:12px; color:rgba(255,255,255,0.6); letter-spacing:1px;">Starting…</div>
            `;
            document.body.appendChild(el);
        }
        return el;
    }

    updateLoadingScreen(el, done, total, name) {
        if (!el) return;
        const bar = el.querySelector('#koLoadingBar');
        const txt = el.querySelector('#koLoadingText');
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        if (bar) bar.style.width = pct + '%';
        if (txt) txt.textContent = `${done} / ${total}  ·  ${name || ''}`;
    }

    hideLoadingScreen(el) {
        if (!el) return;
        el.style.transition = 'opacity 0.4s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 500);
    }

    // ================= SVG ICONS =================
    injectSVGIcons() {
        const map = {
            punchBtn: 'punch', kickBtn: 'kick', rollBtn: 'roll', waveBtn: 'wave',
            shootBtn: 'shoot', reloadBtn: 'reload', actionsBtn: 'bolt',
            zoomBtn: 'zoom', animMenuClose: 'close'
        };
        Object.entries(map).forEach(([id, iconKey]) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = `<span class="svg-icon">${SVG_ICONS[iconKey]}</span>`;
        });

        const zoomBtn = document.getElementById('zoomBtn');
        if (zoomBtn) {
            const handler = (e) => { e.preventDefault(); this.toggleZoom(); };
            zoomBtn.addEventListener('click', handler);
            zoomBtn.addEventListener('touchstart', handler);
        }
    }

    // ================= AUTH / LOGIN =================
    showLoginScreen() {
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'flex';
        this.bindLoginForm();
    }
    hideLoginScreen() {
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    bindLoginForm() {
        if (this._loginBound) return;
        this._loginBound = true;

        const submit = () => {
            const email = (document.getElementById('loginEmail')?.value || '').trim();
            const pass = document.getElementById('loginPassword')?.value || '';
            const errBox = document.getElementById('loginError');
            const btn = document.getElementById('loginSubmitBtn');

            if (errBox) errBox.textContent = '';
            if (!email || !pass) {
                if (errBox) errBox.textContent = 'Enter email and password';
                return;
            }
            if (btn) btn.classList.add('loading');

            signInWithEmailAndPassword(auth, email, pass)
                .then(() => {
                    if (btn) btn.classList.remove('loading');
                    this.hideLoginScreen();
                })
                .catch((error) => {
                    if (btn) btn.classList.remove('loading');
                    if (errBox) errBox.textContent = this.friendlyAuthError(error);
                });
        };

        const submitBtn = document.getElementById('loginSubmitBtn');
        if (submitBtn) submitBtn.addEventListener('click', submit);

        ['loginEmail', 'loginPassword'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        });

        const guestBtn = document.getElementById('loginGuestBtn');
        if (guestBtn) guestBtn.addEventListener('click', () => {
            this.hideLoginScreen();
            this.showNotification('Guest mode: multiplayer disabled', 'info');
        });
    }

    friendlyAuthError(error) {
        const code = error.code || '';
        if (code.includes('user-not-found')) return 'No account with that email';
        if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Wrong password';
        if (code.includes('invalid-email')) return 'Invalid email format';
        if (code.includes('too-many-requests')) return 'Too many attempts. Try later.';
        if (code.includes('network-request-failed')) return 'No internet connection';
        return 'Login failed: ' + (error.message || code);
    }

    // ================= ASSETS =================
    loadGLB() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load('Soldier.glb',
                (gltf) => {
                    this.glbBase = gltf.scene;
                    this.glbBase.traverse(n => {
                        if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false; }
                    });
                    gltf.animations.forEach(clip => { this.glbAnimations[clip.name] = clip; });
                    console.log('✅ Soldier.glb loaded. Anims:', Object.keys(this.glbAnimations).length);
                    this.glbLoaded = true;
                    resolve();
                },
                undefined,
                (err) => { console.error('Soldier.glb load failed:', err); reject(err); }
            );
        });
    }

    loadGun() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load('Rifle.glb',
                (gltf) => {
                    this.gunTemplate = gltf.scene;
                    this.gunTemplate.traverse(n => {
                        if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false; }
                    });

                    let maxScale = 1;
                    this.gunTemplate.traverse((n) => {
                        if (n.scale) {
                            const s = Math.max(Math.abs(n.scale.x), Math.abs(n.scale.y), Math.abs(n.scale.z));
                            if (s > maxScale) maxScale = s;
                        }
                    });
                    this.gunTemplate.traverse((n) => {
                        if (n.scale) {
                            n.scale.set(n.scale.x / maxScale, n.scale.y / maxScale, n.scale.z / maxScale);
                        }
                    });
                    this.gunTemplate.scale.set(1, 1, 1);

                    const rawBox = new THREE.Box3().setFromObject(this.gunTemplate);
                    const rawSize = rawBox.getSize(new THREE.Vector3());
                    const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z);

                    const TARGET_LENGTH = 0.9;
                    if (maxDim > 0) {
                        const targetScale = TARGET_LENGTH / maxDim;
                        this.gunTemplate.scale.setScalar(targetScale);
                    }

                    const finalBox = new THREE.Box3().setFromObject(this.gunTemplate);
                    const center = finalBox.getCenter(new THREE.Vector3());
                    this.gunTemplate.position.sub(center);

                    console.log('✅ Rifle.glb loaded');
                    this.gunLoaded = true;
                    resolve();
                },
                undefined,
                (err) => { console.warn('Rifle.glb not found or failed:', err.message); reject(err); }
            );
        });
    }

    createInstance() {
        if (!this.glbLoaded) return null;
        const model = SkeletonUtils.clone(this.glbBase);
        model.rotation.y = Math.PI;
        const group = new THREE.Group();
        group.add(model);
        model.scale.setScalar(1.163);

        const handBone = model.getObjectByName('WristR')
            || model.getObjectByName('wristR')
            || model.getObjectByName('Wrist_R')
            || (() => {
                let found = null;
                model.traverse((node) => {
                    if (node.isBone && !found) {
                        const name = node.name.toLowerCase();
                        if (name === 'wristr' || name === 'righthand' || name === 'right_hand' || name === 'hand_r') {
                            found = node;
                        }
                    }
                });
                return found;
            })();

        if (handBone) {
            if (!this.handBoneName) console.log('✅ Hand bone:', handBone.name);
            this.handBoneName = handBone.name;

            let gun;
            if (this.gunLoaded && this.gunTemplate) {
                gun = SkeletonUtils.clone(this.gunTemplate);
                gun.position.set(0, 0.05, 0.05);
                gun.rotation.set(0, 0, 0);
            } else {
                gun = this.createProceduralGun();
                gun.position.set(0, 0.05, 0.05);
                gun.scale.setScalar(0.5);
            }
            handBone.add(gun);
        }

        const mixer = new THREE.AnimationMixer(model);
        const actions = {};
        for (const [name, clip] of Object.entries(this.glbAnimations)) {
            actions[name] = mixer.clipAction(clip);
        }

        return { group, model, mixer, actions, currentActionName: null, isDead: false, deathPlayedAt: 0 };
    }

    createProceduralGun() {
        const gun = new THREE.Group();
        const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.8 });
        const darkGrey = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), black);
        barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, 0.2); barrel.castShadow = true;
        gun.add(barrel);

        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.3), black);
        slide.position.set(0, 0.03, 0.1); slide.castShadow = true;
        gun.add(slide);

        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.1), darkGrey);
        grip.position.set(0, -0.08, -0.02); grip.rotation.x = 0.25; grip.castShadow = true;
        gun.add(grip);

        return gun;
    }

    createLocalPlayer() {
        const inst = this.createInstance();
        if (!inst) return;
        this.localPlayer = inst;
        this.localPlayer.group.position.copy(this.playerPos);
        this.scene.add(this.localPlayer.group);
        this.playAnim(this.localPlayer, 'Idle_Gun');
    }

    playAnim(p, name, opts = {}) {
        if (!p || !p.actions || !p.actions[name]) return;
        if (p.currentActionName === name) return;
        const { loop = true, fade = 0.2, clamp = false } = opts;
        const next = p.actions[name];
        if (p.currentActionName && p.actions[p.currentActionName]) {
            p.actions[p.currentActionName].fadeOut(fade);
        }
        next.reset();
        next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        next.clampWhenFinished = clamp;
        next.fadeIn(fade).play();
        p.currentActionName = name;
    }

    toggleZoom() {
        if (this.zoomMode === ZOOM_MODE.OFF) this.zoomMode = ZOOM_MODE.RIFLE;
        else if (this.zoomMode === ZOOM_MODE.RIFLE) this.zoomMode = ZOOM_MODE.SNIPER;
        else this.zoomMode = ZOOM_MODE.OFF;
        this.applyZoomClasses();
    }

    applyZoomClasses() {
        const zoomBtn = document.getElementById('zoomBtn');
        const scope = document.getElementById('scopeOverlay');
        const crosshair = document.getElementById('crosshair');
        const player = this.localPlayer?.group;

        if (zoomBtn) {
            zoomBtn.classList.remove('active', 'sniper');
            if (this.zoomMode === ZOOM_MODE.RIFLE) zoomBtn.classList.add('active');
            if (this.zoomMode === ZOOM_MODE.SNIPER) zoomBtn.classList.add('sniper');
        }
        if (scope) scope.classList.toggle('visible', this.zoomMode === ZOOM_MODE.SNIPER);
        if (crosshair) crosshair.style.opacity = this.zoomMode === ZOOM_MODE.SNIPER ? '0' : '1';
        if (player) player.visible = this.zoomMode !== ZOOM_MODE.SNIPER;
    }

    // ================= COLLISION =================
    isFree(x, z, feetY, headY) {
        // New city collisions
        if (this.city && !this.city.isFree(x, z, PLAYER_RADIUS)) return false;
        return true;
    }

    getGroundY(x, z, currentY) {
        return 0;
    }

    // ================= CONTROLS =================
    setupControls() {
        const swipeZone = document.getElementById('viewSwipeZone');
        const joy = document.getElementById('joystickContainer');
        if (!joy || !swipeZone) return;

        joy.addEventListener('touchstart', e => {
            e.preventDefault();
            if (!this.gameActive) return;
            if (this.joystickTouchId === null) {
                this.joystickTouchId = e.touches[0].identifier;
                this.joystickActive = true;
                this.updateJoystick(e.touches[0]);
            }
        });
        joy.addEventListener('touchmove', e => {
            e.preventDefault();
            if (!this.gameActive || !this.joystickActive) return;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === this.joystickTouchId) { this.updateJoystick(e.touches[i]); break; }
            }
        });
        joy.addEventListener('touchend', e => {
            e.preventDefault();
            this.joystickActive = false;
            this.joystickTouchId = null;
            this.moveX = this.moveY = 0;
            if (this.joystickThumb) this.joystickThumb.style.transform = 'translate(0px,0px)';
            const s = document.getElementById('movementSpeed'); if (s) s.textContent = '0';
        });

        swipeZone.addEventListener('touchstart', e => {
            e.preventDefault();
            if (!this.gameActive) return;
            if (this.swipeTouchId === null) {
                this.swipeTouchId = e.touches[0].identifier;
                this.lastSwipeX = e.touches[0].clientX;
                this.lastSwipeY = e.touches[0].clientY;
            }
        });
        swipeZone.addEventListener('touchmove', e => {
            e.preventDefault();
            if (!this.gameActive) return;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === this.swipeTouchId) {
                    const t = e.touches[i];
                    const sens = this.zoomMode !== ZOOM_MODE.OFF ? this.touchSensitivity * 0.4 : this.touchSensitivity;
                    this.playerYaw -= (t.clientX - this.lastSwipeX) * sens;
                    this.lookPitch -= (t.clientY - this.lastSwipeY) * sens;
                    this.lookPitch = Math.max(-0.5, Math.min(0.6, this.lookPitch));
                    this.lastSwipeX = t.clientX;
                    this.lastSwipeY = t.clientY;
                    break;
                }
            }
        });
        swipeZone.addEventListener('touchend', e => { e.preventDefault(); this.swipeTouchId = null; });

        const shootBtn = document.getElementById('shootBtn');
        const shootHandler = (e) => {
            if (e) e.preventDefault();
            if (!this.gameActive) return;
            this.shoot();
            playGunSound();
        };
        if (shootBtn) {
            shootBtn.addEventListener('touchstart', shootHandler);
            shootBtn.addEventListener('click', shootHandler);
        }

        const reloadBtn = document.getElementById('reloadBtn');
        if (reloadBtn) {
            const h = (e) => { e.preventDefault(); this.reload(); };
            reloadBtn.addEventListener('touchstart', h);
            reloadBtn.addEventListener('click', h);
        }

        const bindAction = (id, action) => {
            const el = document.getElementById(id);
            if (!el) return;
            const h = (e) => { e.preventDefault(); this.triggerAction(action); };
            el.addEventListener('touchstart', h);
            el.addEventListener('click', h);
        };
        bindAction('punchBtn', 'Punch_Left');
        bindAction('kickBtn', 'Kick_Left');
        bindAction('rollBtn', 'Roll');
        bindAction('waveBtn', 'Wave');

        const actionsBtn = document.getElementById('actionsBtn');
        if (actionsBtn) {
            const h = (e) => { e.preventDefault(); this.openAnimMenu(); };
            actionsBtn.addEventListener('click', h);
            actionsBtn.addEventListener('touchstart', h);
        }
        const closeBtn = document.getElementById('animMenuClose');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeAnimMenu());
        const menuBg = document.getElementById('animMenu');
        if (menuBg) menuBg.addEventListener('click', e => { if (e.target === menuBg) this.closeAnimMenu(); });

        const startBtn = document.getElementById('startBtn');
        if (startBtn) startBtn.addEventListener('click', () => {
            const i = document.getElementById('instructions');
            if (i) i.style.display = 'none';
            this.startGame();
        });
        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) restartBtn.addEventListener('click', () => this.restart());
    }

    updateJoystick(touch) {
        if (!this.joystickContainer || !this.joystickThumb) return;
        const r = this.joystickContainer.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let dx = touch.clientX - cx, dy = touch.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > this.joystickMaxMove) {
            dx = (dx / dist) * this.joystickMaxMove;
            dy = (dy / dist) * this.joystickMaxMove;
        }
        this.joystickThumb.style.transform = `translate(${dx}px,${dy}px)`;
        this.moveX = dx / this.joystickMaxMove;
        this.moveY = -dy / this.joystickMaxMove;
        const sp = Math.hypot(this.moveX, this.moveY);
        const e = document.getElementById('movementSpeed');
        if (e) e.textContent = sp.toFixed(1);
    }

    // ================= MINIMAP =================
    setupMinimap() {
        const c = document.getElementById('minimapCanvas');
        if (c) this.minimapCtx = c.getContext('2d');
    }

    updateMinimap() {
        if (!this.minimapCtx) return;
        const canvas = document.getElementById('minimapCanvas');
        if (!canvas) return;
        const ctx = this.minimapCtx;
        const scale = canvas.width / (MAP_HALF * 2);
        const toMap = (x, z) => ({ x: (x + MAP_HALF) * scale, y: (z + MAP_HALF) * scale });

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (this.city) {
            ctx.fillStyle = '#8B4513';
            this.city.buildings.forEach(b => {
                const p = toMap(b.mesh.position.x, b.mesh.position.z);
                ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
            });
        }

        this.otherPlayers.forEach(p => {
            const m = toMap(p.group.position.x, p.group.position.z);
            if (m.x > 0 && m.x < canvas.width && m.y > 0 && m.y < canvas.height) {
                ctx.fillStyle = '#ff4444';
                ctx.beginPath(); ctx.arc(m.x, m.y, 4, 0, Math.PI * 2); ctx.fill();
            }
        });
        const me = toMap(this.playerPos.x, this.playerPos.z);
        ctx.fillStyle = '#44ff44';
        ctx.beginPath(); ctx.arc(me.x, me.y, 5, 0, Math.PI * 2); ctx.fill();
    }

    // ================= GAME FLOW =================
    startGame() {
        this.gameActive = true;
        this.health = 100;
        this.score = 0;
        this.kills = 0;
        this.ammo = 30;
        this.boxesCollected = 0;
        this.playerPos.set(0, 0, 30);
        this.playerYaw = 0;
        this.lookPitch = 0;
        this.playerY = 0;
        this.velocityY = 0;
        this.onGround = true;
        this.cooldowns = {};
        this.zoomMode = ZOOM_MODE.OFF;
        this._resetZoomArmed = false;
        this.applyZoomClasses();

        if (this.firebaseReady && this.playerRef) {
            updateDoc(this.playerRef, {
                health: this.health, ammo: this.ammo, kills: this.kills, alive: true,
                position: { x: this.playerPos.x, y: 1, z: this.playerPos.z }
            }).catch(() => {});
        }
        this.updateUI();
        this.showNotification(`Online: ${this.otherPlayers.size + 1}`, 'info');
    }

    shoot() {
        if (!this.gameActive || this.ammo <= 0) return;
        this.ammo--;
        this.updateUI();
        this._shootFlashUntil = Date.now() + 250;
        this.lastShootTime = Date.now();
        this._resetZoomArmed = true;

        if (this.localPlayer) this.playOverride('Gun_Shoot', 300);
        if (this.firebaseReady && this.playerRef) {
            updateDoc(this.playerRef, { ammo: this.ammo }).catch(() => {});
        }

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const origin = raycaster.ray.origin.clone();
        const direction = raycaster.ray.direction.clone();
        const rayLen = 200;

        for (let i = this.ammoBoxes.length - 1; i >= 0; i--) {
            const b = this.ammoBoxes[i];
            const to = b.position.clone().sub(origin);
            if (direction.angleTo(to) < 0.15 && to.length() < rayLen) {
                const gained = b.userData.ammo || 10;
                this.ammo = Math.min(this.maxAmmo, this.ammo + gained);
                this.boxesCollected++;
                this.scene.remove(b);
                this.ammoBoxes.splice(i, 1);
                this.updateUI();
                this.showNotification(`+${gained} Ammo`, 'success');
                if (this.firebaseReady && this.playerRef) updateDoc(this.playerRef, { ammo: this.ammo }).catch(() => {});
                return;
            }
        }

        for (const [pid, p] of this.otherPlayers) {
            if (!p.group || p.isDead) continue;
            const target = p.group.position.clone();
            target.y += 0.9;
            const to = target.sub(origin);
            if (direction.angleTo(to) < 0.15 && to.length() < rayLen) {
                this.registerHit(pid, this.damagePerShot);
                break;
            }
        }
    }

    async registerHit(targetId, damage) {
        try {
            if (!this.firebaseReady || !this.playerId || !targetId || !db) return;
            await setDoc(doc(collection(db, 'game_hits')), {
                shooterId: this.playerId, shooterName: this.playerName,
                targetId, damage, timestamp: serverTimestamp()
            });
        } catch (e) {}
    }

    takeDamage(amount, attackerId, attackerName) {
        if (!this.gameActive || this.health <= 0) return;
        if (this.rolling && Date.now() < this.rollUntil) return;

        this.health = Math.max(0, this.health - amount);
        this.lastDamagedBy = { id: attackerId, name: attackerName };
        this.updateUI();

        const v = document.getElementById('damageVignette');
        if (v) { v.classList.add('active'); setTimeout(() => v.classList.remove('active'), 250); }

        if (this.localPlayer && this.health > 0) this.playOverride('HitRecieve', 400);
        if (this.firebaseReady && this.playerRef) updateDoc(this.playerRef, { health: this.health }).catch(() => {});
        if (this.health <= 0) this.die();
    }

    async die() {
        this.gameActive = false;
        if (this.localPlayer) this.playAnim(this.localPlayer, 'Death', { loop: false, clamp: true, fade: 0.1 });

        if (this.lastDamagedBy && this.firebaseReady && db) {
            try {
                await addDoc(collection(db, 'game_kills'), {
                    killerId: this.lastDamagedBy.id, killerName: this.lastDamagedBy.name,
                    victimId: this.playerId, victimName: this.playerName,
                    weapon: 'Rifle', timestamp: serverTimestamp()
                });
                await updateDoc(doc(this.playersCollection, this.lastDamagedBy.id), { kills: increment(1) });
                await this.recordWin(this.lastDamagedBy.id, this.lastDamagedBy.name);
            } catch (e) {}
            this.spawnAmmoBoxOnDeath(this.playerPos, 20);
        }

        if (this.firebaseReady && this.playerRef) {
            await updateDoc(this.playerRef, { alive: false, health: 0 }).catch(() => {});
        }
        const ov = document.getElementById('gameOverlay');
        const fs = document.getElementById('finalScore');
        if (ov && fs) {
            fs.textContent = `Kills: ${this.kills}  Score: ${this.score}  Boxes: ${this.boxesCollected}`;
            ov.style.display = 'flex';
        }
        await this.recordDeath(this.playerId, this.playerName);
    }

    async recordWin(pid, pn) {
        if (!this.firebaseReady || !db) return;
        try {
            const today = new Date().toISOString().split('T')[0];
            await setDoc(doc(db, 'game_daily_wins', today, 'players', pid), {
                playerId: pid, playerName: pn, wins: increment(1), lastWin: serverTimestamp()
            }, { merge: true });
            await setDoc(doc(db, 'game_alltime_wins', pid), {
                playerId: pid, playerName: pn, wins: increment(1), lastWin: serverTimestamp()
            }, { merge: true });
        } catch (e) {}
    }

    async recordDeath(pid, pn) {
        if (!this.firebaseReady || !db) return;
        try {
            const today = new Date().toISOString().split('T')[0];
            await setDoc(doc(db, 'game_daily_deaths', today, 'players', pid), {
                playerId: pid, playerName: pn, deaths: increment(1), lastDeath: serverTimestamp()
            }, { merge: true });
        } catch (e) {}
    }

    reload() {
        if (this.gameActive) {
            this.ammo = this.maxAmmo;
            this.updateUI();
            if (this.firebaseReady && this.playerRef) updateDoc(this.playerRef, { ammo: this.ammo }).catch(() => {});
        }
    }

    updateUI() {
        const s = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        s('healthValue', this.health);
        s('scoreValue', this.score);
        s('ammoValue', this.ammo);
        s('killsValue', this.kills);
        const bar = document.getElementById('healthBarFill');
        if (bar) bar.style.width = Math.max(0, (this.health / this.maxHealth) * 100) + '%';
    }

    restart() {
        this.ammoBoxes.forEach(b => this.scene.remove(b));
        this.ammoBoxes = [];
        this.spawnInitialAmmoBoxes(40);
        this.health = 100; this.score = 0; this.kills = 0; this.ammo = 30; this.boxesCollected = 0;
        this.gameActive = true;
        this.playerPos.set(0, 0, 30);
        this.playerYaw = 0; this.lookPitch = 0;
        this.playerY = 0; this.velocityY = 0; this.onGround = true;
        this.cooldowns = {};
        this.zoomMode = ZOOM_MODE.OFF;
        this._resetZoomArmed = false;
        this.applyZoomClasses();

        if (this.localPlayer) this.playAnim(this.localPlayer, 'Idle_Gun', { fade: 0.1 });
        if (this.firebaseReady && this.playerRef) {
            updateDoc(this.playerRef, {
                health: this.health, ammo: this.ammo, kills: this.kills, alive: true,
                position: { x: this.playerPos.x, y: 1, z: this.playerPos.z }
            }).catch(() => {});
        }
        const d = document.getElementById('doorIndicator'); if (d) d.style.display = 'none';
        const o = document.getElementById('gameOverlay'); if (o) o.style.display = 'none';
        this.updateUI();
    }

    cleanup() {
        if (this.firebaseReady && this.playerRef) deleteDoc(this.playerRef).catch(() => {});
        if (this.unsubscribePlayers) this.unsubscribePlayers();
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.otherPlayers.forEach(p => {
            this.scene.remove(p.group);
        });
        this.otherPlayers.clear();
    }

    // ================= ACTION MENU =================
    buildAnimMenu() {
        const grid = document.getElementById('animMenuGrid');
        if (!grid) return;
        grid.innerHTML = '';
        REAL_ACTIONS.forEach(a => {
            const item = document.createElement('div');
            item.className = 'anim-item';
            item.innerHTML = `<div class="anim-icon">${SVG_ICONS[a.icon] || ''}</div><div class="anim-name">${a.label}</div><div class="anim-desc">${a.desc}</div>`;
            item.addEventListener('click', () => { this.triggerAction(a.name); this.closeAnimMenu(); });
            grid.appendChild(item);
        });
    }
    openAnimMenu() { const m = document.getElementById('animMenu'); if (m) m.classList.add('open'); }
    closeAnimMenu() { const m = document.getElementById('animMenu'); if (m) m.classList.remove('open'); }

    isOnCooldown(actionName) {
        return (this.cooldowns[actionName] || 0) > Date.now();
    }

    triggerAction(actionName) {
        if (!this.gameActive) return;
        if (this.isOnCooldown(actionName)) { this.showNotification('Cooldown', 'info'); return; }
        if (!this.localPlayer) return;

        if (MELEE[actionName]) {
            const cfg = MELEE[actionName];
            this.cooldowns[actionName] = Date.now() + cfg.cooldown;
            this.playOverride(actionName, 500);
            this.doMeleeAttack(cfg.damage, cfg.range, cfg.aimDot);
            return;
        }
        if (actionName === 'Roll') {
            this.cooldowns.Roll = Date.now() + 3000;
            this.playOverride('Roll', 700);
            this.rolling = true;
            this.rollUntil = Date.now() + 700;
            const fwd = new THREE.Vector3(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
            const right = new THREE.Vector3(Math.cos(this.playerYaw), 0, -Math.sin(this.playerYaw));
            const dir = new THREE.Vector3();
            if (Math.abs(this.moveY) > 0.05) dir.addScaledVector(fwd, this.moveY);
            if (Math.abs(this.moveX) > 0.05) dir.addScaledVector(right, this.moveX);
            if (dir.length() < 0.1) dir.copy(fwd);
            dir.normalize();
            this.rollDirection.copy(dir);
            return;
        }
        if (actionName === 'Wave') {
            this.cooldowns.Wave = Date.now() + 2000;
            this.playOverride('Wave', 1500);
            return;
        }
        if (actionName === 'Interact') {
            this.cooldowns.Interact = Date.now() + 500;
            this.playOverride('Interact', 600);
            let nearest = null, nearestDist = 3;
            this.ammoBoxes.forEach(b => {
                const d = this.playerPos.distanceTo(b.position);
                if (d < nearestDist) { nearestDist = d; nearest = b; }
            });
            if (nearest) {
                const gained = nearest.userData.ammo || 10;
                this.ammo = Math.min(this.maxAmmo, this.ammo + gained);
                this.boxesCollected++;
                this.scene.remove(nearest);
                this.ammoBoxes.splice(this.ammoBoxes.indexOf(nearest), 1);
                this.updateUI();
                this.showNotification(`+${gained} Ammo`, 'success');
                if (this.firebaseReady && this.playerRef) updateDoc(this.playerRef, { ammo: this.ammo }).catch(() => {});
                return;
            }
            this.showNotification('Nothing to interact with', 'info');
            return;
        }
    }

    playOverride(name, durationMs) {
        this.overrideAnim = name;
        this.overrideUntil = Date.now() + durationMs;
    }

    doMeleeAttack(damage, range, aimDot) {
        const fwd = new THREE.Vector3(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
        let hitAny = false;
        this.otherPlayers.forEach((p, pid) => {
            if (p.isDead) return;
            const to = p.group.position.clone().sub(this.playerPos);
            to.y = 0;
            const dist = to.length();
            if (dist > range) return;
            to.normalize();
            if (to.dot(fwd) < aimDot) return;
            this.registerHit(pid, damage);
            hitAny = true;
        });
        if (hitAny) this.spawnHitEffect();
    }

    spawnHitEffect() {
        const v = document.getElementById('damageVignette');
        if (v) {
            v.style.boxShadow = 'inset 0 0 120px rgba(255,200,50,0.5)';
            setTimeout(() => { v.style.boxShadow = ''; }, 150);
        }
    }

    updateCooldownUI() {
        const map = { punchBtn: 'Punch_Left', kickBtn: 'Kick_Left', rollBtn: 'Roll', waveBtn: 'Wave' };
        Object.entries(map).forEach(([id, action]) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            let overlay = btn.querySelector('.cooldown');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'cooldown';
                btn.appendChild(overlay);
            }
            const cfg = MELEE[action];
            const totalCd = cfg ? cfg.cooldown : (action === 'Roll' ? 3000 : 2000);
            const remaining = (this.cooldowns[action] || 0) - Date.now();
            overlay.style.height = remaining > 0 ? Math.min(100, (remaining / totalCd) * 100) + '%' : '0%';
        });
    }

    showNotification(msg, type = 'info') {
        const el = document.createElement('div');
        el.style.cssText = `position:fixed;top:80px;left:50%;transform:translateX(-50%);background:${type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : '#4444ff'};color:white;padding:10px 22px;border-radius:30px;font-family:Arial;font-size:14px;font-weight:bold;z-index:10000;box-shadow:0 4px 20px rgba(0,0,0,0.5);text-shadow:1px 1px 2px black;`;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2500);
    }

    // ================= AMMO BOXES =================
    spawnInitialAmmoBoxes(count) {
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * (MAP_HALF * 1.6);
            const z = (Math.random() - 0.5) * (MAP_HALF * 1.6);
            // Skip if inside a building
            if (this.city && !this.city.isFree(x, z, 1.5)) continue;
            this.spawnAmmoBox(x, 0.5, z, 5 + Math.floor(Math.random() * 10));
        }
    }

    spawnAmmoBox(x, y, z, ammo = 10) {
        const b = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.8, 0.8),
            new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x442200, transparent: true, opacity: 0.9 })
        );
        b.position.set(x, y, z);
        b.castShadow = true;
        b.userData = { ammo };
        this.scene.add(b);
        this.ammoBoxes.push(b);
        return b;
    }

    spawnAmmoBoxOnDeath(pos, ammo = 20) {
        this.spawnAmmoBox(pos.x, 0.5, pos.z, ammo);
    }

    // ================= AUTH LISTENER =================
    setupAuthListener() {
        if (!auth) {
            this.showNotification('Firebase not configured', 'error');
            return;
        }
        onAuthStateChanged(auth, (user) => {
            this.currentUser = user;
            if (user) {
                this.playerId = user.uid;
                try {
                    const p = localStorage.getItem('currentUserProfile');
                    if (p) { const pr = JSON.parse(p); this.playerName = pr.name || this.playerName; }
                } catch (e) {}
                this.firebaseReady = true;
                this.hideLoginScreen();
                this.setupFirebase();
                this.showNotification(`Welcome ${this.playerName}!`, 'success');
                this.spawnInitialAmmoBoxes(40);
            } else {
                this.firebaseReady = false;
                this.showLoginScreen();
            }
        }, (e) => { this.firebaseReady = false; });
    }

    setupFirebase() {
        if (!this.firebaseReady || !db) return;
        try {
            this.playersCollection = collection(db, 'game_players');
            this.killsCollection = collection(db, 'game_kills');
            this.playerRef = doc(this.playersCollection, this.playerId);

            setDoc(this.playerRef, {
                id: this.playerId, name: this.playerName,
                position: { x: this.playerPos.x, y: 1, z: this.playerPos.z },
                rotation: { y: this.playerYaw, x: this.lookPitch },
                health: this.health, ammo: this.ammo, kills: 0, alive: true,
                isShooting: false, isMoving: false,
                lastUpdate: serverTimestamp(), joinedAt: serverTimestamp()
            }).catch(() => {});

            this.unsubscribePlayers = onSnapshot(this.playersCollection, (snap) => {
                snap.docChanges().forEach(change => {
                    const data = change.doc.data();
                    if (data.id === this.playerId) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        if (data.alive) this.updateOrAddPlayer(data);
                        else this.handleOtherPlayerDeath(data.id);
                    } else if (change.type === 'removed') this.removePlayer(data.id);
                });
            }, e => {});

            this.heartbeatInterval = setInterval(() => {
                if (this.gameActive && this.playerRef && this.firebaseReady) {
                    const sp = Math.hypot(this.moveX, this.moveY);
                    updateDoc(this.playerRef, {
                        position: { x: this.playerPos.x, y: this.playerY + 1, z: this.playerPos.z },
                        rotation: { y: this.playerYaw, x: this.lookPitch },
                        health: this.health, ammo: this.ammo,
                        isMoving: sp > 0.1,
                        isShooting: this._shootFlashUntil > Date.now(),
                        lastUpdate: serverTimestamp()
                    }).catch(() => {});
                }
            }, 100);

            onSnapshot(collection(db, 'game_hits'), (snap) => {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const hit = change.doc.data();
                        if (hit.targetId === this.playerId && this.gameActive) {
                            this.takeDamage(hit.damage, hit.shooterId, hit.shooterName);
                        }
                    }
                });
            }, e => {});
        } catch (e) { this.firebaseReady = false; }
    }

    updateOrAddPlayer(data) {
        let p = this.otherPlayers.get(data.id);
        if (!p) {
            const inst = this.createInstance();
            if (!inst) return;
            inst.data = data;
            inst.targetPosition = new THREE.Vector3(data.position.x, 0, data.position.z);
            inst.targetRotation = data.rotation ? data.rotation.y : 0;
            this.scene.add(inst.group);
            this.otherPlayers.set(data.id, inst);
            p = inst;
        }
        if (data.position) p.targetPosition.set(data.position.x, 0, data.position.z);
        if (data.rotation) p.targetRotation = data.rotation.y;
        p.data = data;
    }

    handleOtherPlayerDeath(pid) {
        const p = this.otherPlayers.get(pid);
        if (!p) return;
        if (!p.isDead) {
            p.isDead = true;
            p.deathPlayedAt = Date.now();
            if (p.actions && p.actions['Death']) {
                this.playAnim(p, 'Death', { loop: false, clamp: true, fade: 0.1 });
            }
        }
    }

    removePlayer(pid) {
        const p = this.otherPlayers.get(pid);
        if (!p) return;
        this.scene.remove(p.group);
        this.otherPlayers.delete(pid);
    }

    // ================= MAIN LOOP =================
    animate() {
        requestAnimationFrame(() => this.animate());
        const now = Date.now();
        const dt = Math.min(0.1, (now - this.lastUpdateTime) / 1000);
        this.lastUpdateTime = now;

        if (this.gameActive && this._bootComplete) {
            if (this.sun) updateSun(this.sun, this.playerPos);

            if (this.zoomMode !== ZOOM_MODE.OFF
                && this._resetZoomArmed
                && now - this.lastShootTime > ZOOM_AUTO_RESET_MS) {
                this.zoomMode = ZOOM_MODE.OFF;
                this._resetZoomArmed = false;
                this.applyZoomClasses();
            }

            let targetFov = NORMAL_FOV;
            let targetDist = NORMAL_CAM_DIST;
            let camHeightNow = this.camHeight;
            let camLookHeightNow = this.camLookHeight;

            if (this.zoomMode === ZOOM_MODE.RIFLE) {
                targetFov = RIFLE_FOV;
                targetDist = RIFLE_CAM_DIST;
                camHeightNow = 1.9;
                camLookHeightNow = 1.3;
            } else if (this.zoomMode === ZOOM_MODE.SNIPER) {
                targetFov = SNIPER_FOV;
                targetDist = SNIPER_CAM_DIST;
                camHeightNow = 1.7;
                camLookHeightNow = 1.7;
            }

            this.currentFov += (targetFov - this.currentFov) * 0.15;
            this.currentCamDist += (targetDist - this.currentCamDist) * 0.15;
            this.camera.fov = this.currentFov;
            this.camera.updateProjectionMatrix();

            const forwardDir = new THREE.Vector3(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
            const rightDir = new THREE.Vector3(Math.cos(this.playerYaw), 0, -Math.sin(this.playerYaw));

            const moveDelta = new THREE.Vector3();
            const zoomSlow = this.zoomMode !== ZOOM_MODE.OFF ? 0.55 : 1.0;

            if (Math.abs(this.moveY) > 0.05) {
                const mult = this.moveY > 0 ? this.sprintMultiplier : this.backwardMultiplier;
                moveDelta.addScaledVector(forwardDir, this.moveY * this.walkSpeed * mult * zoomSlow);
            }
            if (Math.abs(this.moveX) > 0.05) {
                moveDelta.addScaledVector(rightDir, this.moveX * this.walkSpeed * this.strafeMultiplier * zoomSlow);
            }
            if (this.rolling && now < this.rollUntil) {
                moveDelta.addScaledVector(this.rollDirection, this.rollSpeed);
            } else if (this.rolling) {
                this.rolling = false;
            }

            const feetY = this.playerY;
            const headY = this.playerY + 1.7;

            const newX = this.playerPos.x + moveDelta.x;
            if (this.isFree(newX, this.playerPos.z, feetY + 0.1, headY)) {
                this.playerPos.x = newX;
            }
            const newZ = this.playerPos.z + moveDelta.z;
            if (this.isFree(this.playerPos.x, newZ, feetY + 0.1, headY)) {
                this.playerPos.z = newZ;
            }

            this.playerPos.x = Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, this.playerPos.x));
            this.playerPos.z = Math.max(-MAP_HALF + 2, Math.min(MAP_HALF - 2, this.playerPos.z));

            const groundY = this.getGroundY(this.playerPos.x, this.playerPos.z, this.playerY);
            if (this.playerY > groundY + 0.05) {
                this.velocityY -= 0.03;
                if (this.velocityY < -0.8) this.velocityY = -0.8;
                this.playerY += this.velocityY;
                this.onGround = false;
                if (this.playerY <= groundY) {
                    this.playerY = groundY;
                    this.velocityY = 0;
                    this.onGround = true;
                }
            } else {
                this.playerY = groundY;
                this.velocityY = 0;
                this.onGround = true;
            }

            const speed = moveDelta.length();
            if (this.localPlayer) {
                this.localPlayer.group.position.set(this.playerPos.x, this.playerY, this.playerPos.z);
                this.localPlayer.group.rotation.y = this.playerYaw;

                let anim;
                if (this.overrideAnim && now < this.overrideUntil) {
                    anim = this.overrideAnim;
                } else {
                    this.overrideAnim = null;
                    if (this.rolling) anim = 'Roll';
                    else if (speed > 0.03) anim = 'Run';
                    else if (this.zoomMode !== ZOOM_MODE.OFF) anim = 'Idle_Gun_Pointing';
                    else anim = 'Idle_Gun';
                }

                const isOneShot = this.overrideAnim && now < this.overrideUntil;
                this.playAnim(this.localPlayer, anim, {
                    loop: !isOneShot,
                    clamp: isOneShot,
                    fade: 0.1
                });
                this.localPlayer.mixer.update(dt);
            }

            const camPos = new THREE.Vector3(
                this.playerPos.x,
                this.playerY + camHeightNow,
                this.playerPos.z
            ).add(forwardDir.clone().multiplyScalar(-this.currentCamDist));
            this.camera.position.copy(camPos);

            const lookTarget = new THREE.Vector3(
                this.playerPos.x,
                this.playerY + camLookHeightNow,
                this.playerPos.z
            );
            lookTarget.add(forwardDir.clone().multiplyScalar(3));
            lookTarget.y += this.lookPitch * 4;
            this.camera.lookAt(lookTarget);

            this.otherPlayers.forEach((p, pid) => {
                if (p.targetPosition) p.group.position.lerp(p.targetPosition, 0.35);
                if (p.targetRotation !== undefined) {
                    let diff = p.targetRotation - p.group.rotation.y;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    p.group.rotation.y += diff * 0.25;
                }
                if (p.mixer) {
                    const d = p.data;
                    let anim = 'Idle_Gun';
                    if (p.isDead) anim = 'Death';
                    else if (d.isShooting) anim = 'Gun_Shoot';
                    else if (d.isMoving) anim = 'Run';
                    this.playAnim(p, anim, {
                        loop: anim !== 'Death' && anim !== 'Gun_Shoot',
                        clamp: anim === 'Death' || anim === 'Gun_Shoot',
                        fade: 0.15
                    });
                    p.mixer.update(dt);
                }
                if (p.isDead && now - p.deathPlayedAt > 2500) { this.removePlayer(pid); return; }
            });

            this.ammoBoxes.forEach(b => {
                b.rotation.y += 0.02;
                b.position.y = 0.5 + Math.sin(Date.now() * 0.005) * 0.15;
            });

            this.updateMinimap();
        }

        this.renderer.render(this.scene, this.camera);
    }
}

window.onload = () => {
    try { window.game = new Game(); }
    catch (e) { console.error('Game start failed:', e); }
};