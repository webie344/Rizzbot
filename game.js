import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore, collection, doc, setDoc, updateDoc, deleteDoc,
    onSnapshot, query, orderBy, limit, serverTimestamp, addDoc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// ============ REAL ACTIONS CATALOG ============
// Only actions with real gameplay. Everything else is auto.
const REAL_ACTIONS = [
    { name: 'Punch_Left',   icon: '👊', label: 'Punch L',   desc: '40 dmg' },
    { name: 'Punch_Right',  icon: '✊', label: 'Punch R',   desc: '40 dmg' },
    { name: 'Kick_Left',    icon: '🦶', label: 'Kick L',    desc: '50 dmg' },
    { name: 'Kick_Right',   icon: '🦵', label: 'Kick R',    desc: '50 dmg' },
    { name: 'Sword_Slash',  icon: '🗡️', label: 'Sword',     desc: '75 dmg' },
    { name: 'Roll',         icon: '🌀', label: 'Roll',      desc: 'Dodge 3s cd' },
    { name: 'Wave',         icon: '👋', label: 'Wave',      desc: 'Emote' },
    { name: 'Interact',     icon: '🤝', label: 'Interact',  desc: 'Pickup / Open' }
];

// Melee damage & cooldowns
const MELEE = {
    Punch_Left:  { damage: 40, range: 2.2, cooldown: 500,  aimDot: 0.5 },
    Punch_Right: { damage: 40, range: 2.2, cooldown: 500,  aimDot: 0.5 },
    Kick_Left:   { damage: 50, range: 2.4, cooldown: 700,  aimDot: 0.4 },
    Kick_Right:  { damage: 50, range: 2.4, cooldown: 700,  aimDot: 0.4 },
    Sword_Slash: { damage: 75, range: 2.6, cooldown: 600,  aimDot: 0.3 }
};

class Game {
    constructor() {
        console.log('🎮 CODM-STYLE - FULL ACTIONS');

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

        this.localPlayer = null;
        this.otherPlayers = new Map();
        this.lastUpdateTime = Date.now();

        // One-shot animation override
        this.overrideAnim = null;
        this.overrideUntil = 0;

        // Cooldowns (timestamp when allowed again)
        this.cooldowns = {};
        // Roll dodge state
        this.rolling = false;
        this.rollUntil = 0;
        this.rollDirection = new THREE.Vector3();

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 80, 250);

        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

        this.camDist = 6.5;
        this.camHeight = 3.2;
        this.camLookHeight = 1.1;

        this.playerPos = new THREE.Vector3(0, 0, 15);
        this.playerYaw = 0;
        this.lookPitch = 0;

        this.moveX = 0;
        this.moveY = 0;
        this.moveSpeed = 0.14;
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

        this.buildings = [];
        this.containers = [];
        this.oilBunkers = [];
        this.ammoBoxes = [];
        this.trees = [];
        this.nearbyDoor = null;
        this.insideBuilding = false;
        this.currentBuilding = null;

        this.killMessages = [];
        this.setupKillFeed();
        this.setupLighting();
        this.setupGround();
        this.createRealisticBuildings();
        this.createContainers(120);
        this.createOilBunkers(15);
        this.createSimpleEnvironment();
        this.spawnInitialAmmoBoxes(30);
        this.setupControls();
        this.setupMinimap();
        this.buildAnimMenu();

        setInterval(() => this.checkNearbyDoors(), 200);
        // Cooldown ticker for UI
        setInterval(() => this.updateCooldownUI(), 50);

        this.loadGLB().then(() => {
            this.createLocalPlayer();
            this.setupAuthListener();
        }).catch(err => {
            console.error('GLB failed:', err);
            this.setupAuthListener();
        });

        this.animate();

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        window.addEventListener('beforeunload', () => this.cleanup());
    }

    // ============ GLB ============
    loadGLB() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load('Soldier.glb',
                (gltf) => {
                    this.glbBase = gltf.scene;
                    this.glbBase.traverse(n => {
                        if (n.isMesh) {
                            n.castShadow = true;
                            n.receiveShadow = true;
                            n.frustumCulled = false;
                        }
                    });
                    gltf.animations.forEach(clip => {
                        this.glbAnimations[clip.name] = clip;
                    });
                    console.log('✅ GLB loaded. Anims:', Object.keys(this.glbAnimations).length);
                    this.glbLoaded = true;
                    resolve();
                },
                undefined,
                (err) => { console.error('GLB load failed:', err); reject(err); }
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

        const mixer = new THREE.AnimationMixer(model);
        const actions = {};
        for (const [name, clip] of Object.entries(this.glbAnimations)) {
            actions[name] = mixer.clipAction(clip);
        }

        const nameTag = document.createElement('div');
        nameTag.style.cssText = `position:absolute;background:rgba(0,0,0,0.8);color:white;padding:3px 10px;border-radius:14px;font-size:12px;font-family:Arial;font-weight:bold;pointer-events:none;transform:translate(-50%,-50%);white-space:nowrap;border:2px solid #ffaa00;z-index:1000;display:none;text-shadow:1px 1px 2px black;`;
        document.body.appendChild(nameTag);

        const healthBar = document.createElement('div');
        healthBar.style.cssText = `position:absolute;width:50px;height:6px;background:rgba(0,0,0,0.7);border-radius:3px;transform:translate(-50%,-50%);overflow:hidden;border:1px solid white;z-index:1000;display:none;`;
        const healthFill = document.createElement('div');
        healthFill.style.cssText = `height:100%;width:100%;background:#00ff00;transition:width 0.2s;`;
        healthBar.appendChild(healthFill);
        document.body.appendChild(healthBar);

        return { group, model, mixer, actions, currentActionName: null, nameTag, healthBar, healthFill, isDead: false, deathPlayedAt: 0 };
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

    // ============ ACTION SYSTEM ============
    isOnCooldown(actionName) {
        return (this.cooldowns[actionName] || 0) > Date.now();
    }

    triggerAction(actionName) {
        if (!this.gameActive) return;
        if (this.isOnCooldown(actionName)) {
            this.showNotification('Cooldown', 'info');
            return;
        }
        if (!this.localPlayer) return;

        // === Melee attacks ===
        if (MELEE[actionName]) {
            const cfg = MELEE[actionName];
            this.cooldowns[actionName] = Date.now() + cfg.cooldown;
            this.playOverride(actionName, 500);
            this.doMeleeAttack(cfg.damage, cfg.range, cfg.aimDot);
            return;
        }

        // === Roll (dodge) ===
        if (actionName === 'Roll') {
            this.cooldowns.Roll = Date.now() + 3000;
            this.playOverride('Roll', 700);
            this.rolling = true;
            this.rollUntil = Date.now() + 700;
            // Roll in current movement direction, or forward if not moving
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

        // === Wave (emote) ===
        if (actionName === 'Wave') {
            this.cooldowns.Wave = Date.now() + 2000;
            this.playOverride('Wave', 1500);
            return;
        }

        // === Interact (pickup / door) ===
        if (actionName === 'Interact') {
            this.cooldowns.Interact = Date.now() + 500;
            this.playOverride('Interact', 600);

            // Priority 1: ammo box within 3m
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
            // Priority 2: door in range
            if (this.nearbyDoor) {
                this.enterBuilding(this.nearbyDoor);
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
        // Find all players in range + in front
        const fwd = new THREE.Vector3(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
        let hitAny = false;

        this.otherPlayers.forEach((p, pid) => {
            if (p.isDead) return;
            const to = p.group.position.clone().sub(this.playerPos);
            to.y = 0;
            const dist = to.length();
            if (dist > range) return;
            to.normalize();
            const dot = to.dot(fwd);
            if (dot < aimDot) return; // not in front

            this.registerHit(pid, damage);
            hitAny = true;
            this.showNotification(`Hit ${p.data.name} -${damage}`, 'success');
        });

        if (hitAny) {
            this.spawnHitEffect();
        } else {
            this.showNotification('Missed', 'info');
        }
    }

    spawnHitEffect() {
        // Flash screen slightly
        const v = document.getElementById('damageVignette');
        if (v) {
            v.style.boxShadow = 'inset 0 0 120px rgba(255,200,50,0.5)';
            setTimeout(() => { v.style.boxShadow = ''; }, 150);
        }
    }

    updateCooldownUI() {
        // Update cooldown overlays on all action buttons
        const map = {
            punchBtn: 'Punch_Left',
            kickBtn: 'Kick_Left',
            rollBtn: 'Roll',
            waveBtn: 'Wave'
        };
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
            if (remaining > 0) {
                overlay.style.height = Math.min(100, (remaining / totalCd) * 100) + '%';
            } else {
                overlay.style.height = '0%';
            }
        });
    }

    // ============ UI ============
    setupKillFeed() {
        if (!document.getElementById('killFeed')) {
            const el = document.createElement('div');
            el.id = 'killFeed';
            el.style.cssText = `position:fixed;top:220px;right:15px;width:250px;z-index:1000;pointer-events:none;`;
            document.body.appendChild(el);
        }
        this.killFeedElement = document.getElementById('killFeed');
    }

    addKillToFeed(killData) {
        this.killMessages.unshift({
            killer: killData.killerName || 'Unknown',
            victim: killData.victimName || 'Unknown'
        });
        if (this.killMessages.length > 5) this.killMessages.pop();
        this.updateKillFeed();
        if (killData.victimId === this.playerId) {
            this.showNotification(`Killed by ${killData.killerName}`, 'error');
        } else if (killData.killerId === this.playerId) {
            this.showNotification(`You killed ${killData.victimName}!`, 'success');
            this.kills++; this.score += 100; this.updateUI();
        }
    }

    updateKillFeed() {
        if (!this.killFeedElement) return;
        this.killFeedElement.innerHTML = '';
        this.killMessages.forEach(m => {
            const d = document.createElement('div');
            d.style.cssText = `background:rgba(0,0,0,0.8);color:white;padding:5px 10px;margin-bottom:4px;border-radius:16px;font-size:12px;font-weight:bold;border-left:3px solid #ff4444;text-align:center;`;
            d.innerHTML = `<span style="color:#ffaa00">${m.killer}</span> 🔫 <span style="color:#ff4444">${m.victim}</span>`;
            this.killFeedElement.appendChild(d);
        });
    }

    showNotification(msg, type = 'info') {
        const el = document.createElement('div');
        el.style.cssText = `
            position:fixed;top:80px;left:50%;transform:translateX(-50%);
            background:${type==='error'?'#ff4444':type==='success'?'#44ff44':'#4444ff'};
            color:white;padding:10px 22px;border-radius:30px;font-family:Arial;font-size:14px;font-weight:bold;
            z-index:10000;box-shadow:0 4px 20px rgba(0,0,0,0.5);text-shadow:1px 1px 2px black;
            animation:notifFade 2.5s ease;
        `;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2500);
    }

    // ============ ACTIONS MENU ============
    buildAnimMenu() {
        const grid = document.getElementById('animMenuGrid');
        if (!grid) return;
        grid.innerHTML = '';
        REAL_ACTIONS.forEach(a => {
            const item = document.createElement('div');
            item.className = 'anim-item';
            item.innerHTML = `
                <div class="anim-icon">${a.icon}</div>
                <div class="anim-name">${a.label}</div>
                <div class="anim-desc">${a.desc}</div>
            `;
            item.addEventListener('click', () => {
                this.triggerAction(a.name);
                this.closeAnimMenu();
            });
            grid.appendChild(item);
        });
    }

    openAnimMenu() {
        const m = document.getElementById('animMenu');
        if (m) m.classList.add('open');
    }

    closeAnimMenu() {
        const m = document.getElementById('animMenu');
        if (m) m.classList.remove('open');
    }

    // ============ SCENE ============
    setupLighting() {
        this.scene.add(new THREE.AmbientLight(0x606080, 0.8));
        const sun = new THREE.DirectionalLight(0xffeedd, 1.4);
        sun.position.set(30, 50, 30);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
        sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
        this.scene.add(sun);
        const fill = new THREE.DirectionalLight(0x88aacc, 0.8);
        fill.position.set(-30, 20, -40);
        this.scene.add(fill);
    }

    setupGround() {
        const g = new THREE.Mesh(
            new THREE.CircleGeometry(150, 128),
            new THREE.MeshStandardMaterial({ color: 0x3a7e3a, roughness: 0.8 })
        );
        g.rotation.x = -Math.PI / 2;
        g.receiveShadow = true;
        this.scene.add(g);
        for (let i = 0; i < 200; i++) {
            const p = new THREE.Mesh(
                new THREE.CircleGeometry(0.8 + Math.random() * 1.5, 5),
                new THREE.MeshStandardMaterial({ color: 0x4a8e4a })
            );
            p.rotation.x = -Math.PI / 2;
            p.position.set((Math.random()-0.5)*140, 0.01, (Math.random()-0.5)*140);
            p.receiveShadow = true;
            this.scene.add(p);
        }
    }

    createRealisticBuildings() {
        const colors = [0x8B4513, 0x5D3A1A, 0xA0522D];
        const pos = [
            {x:-15,z:-15},{x:15,z:-15},{x:-15,z:15},{x:15,z:15},
            {x:-25,z:0},{x:25,z:0},{x:0,z:-25},{x:0,z:25},
            {x:-35,z:-35},{x:35,z:35},{x:-35,z:35},{x:35,z:-35}
        ];
        pos.forEach((p, i) => this.createDetailedBuilding(
            p.x, p.z, 8 + Math.random()*4, 8 + Math.random()*4, 6 + Math.random()*4, colors[i % 3]
        ));
    }

    createDetailedBuilding(x, z, w, d, h, color) {
        const g = new THREE.Group();
        const wt = 0.5;
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        const trim = new THREE.MeshStandardMaterial({ color: 0x884422 });

        const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, wt), mat);
        back.position.set(0, h/2, -d/2 + wt/2);
        back.castShadow = back.receiveShadow = true; g.add(back);

        const left = new THREE.Mesh(new THREE.BoxGeometry(wt, h, d), mat);
        left.position.set(-w/2 + wt/2, h/2, 0);
        left.castShadow = left.receiveShadow = true; g.add(left);

        const right = new THREE.Mesh(new THREE.BoxGeometry(wt, h, d), mat);
        right.position.set(w/2 - wt/2, h/2, 0);
        right.castShadow = right.receiveShadow = true; g.add(right);

        const dw = 2.0, dh = 2.5;
        const fl = new THREE.Mesh(new THREE.BoxGeometry((w - dw)/2, h, wt), mat);
        fl.position.set(-(w + dw)/4, h/2, d/2 - wt/2);
        fl.castShadow = fl.receiveShadow = true; g.add(fl);

        const fr = new THREE.Mesh(new THREE.BoxGeometry((w - dw)/2, h, wt), mat);
        fr.position.set((w + dw)/4, h/2, d/2 - wt/2);
        fr.castShadow = fr.receiveShadow = true; g.add(fr);

        const top = new THREE.Mesh(new THREE.BoxGeometry(dw, h - dh, wt), mat);
        top.position.set(0, h - (h - dh)/2, d/2 - wt/2);
        top.castShadow = top.receiveShadow = true; g.add(top);

        const frame = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.2, dh + 0.2, 0.3), trim);
        frame.position.set(0, dh/2, d/2 - 0.1); g.add(frame);

        const door = new THREE.Mesh(new THREE.BoxGeometry(dw - 0.2, dh - 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x8B5A2B }));
        door.position.set(0, dh/2, d/2);
        door.castShadow = door.receiveShadow = true; g.add(door);

        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.7, 2.5, 4), new THREE.MeshStandardMaterial({ color: 0x884422 }));
        roof.position.set(0, h + 1.25, 0);
        roof.rotation.y = Math.PI/4;
        roof.castShadow = roof.receiveShadow = true; g.add(roof);

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(w - 1.5, d - 1.5),
            new THREE.MeshStandardMaterial({ color: 0x5a3a1a, side: THREE.DoubleSide })
        );
        floor.rotation.x = -Math.PI/2;
        floor.position.set(0, 0.05, 0);
        floor.receiveShadow = true; g.add(floor);

        g.position.set(x, 0, z);
        this.scene.add(g);

        this.buildings.push({
            mesh: g,
            doorPos: new THREE.Vector3(x, 1.2, z + d/2),
            interior: { minX: x - w/2 + wt, maxX: x + w/2 - wt, minZ: z - d/2 + wt, maxZ: z + d/2 - wt }
        });
    }

    createContainers(count) {
        const colors = [0x3366cc, 0xcc3333, 0x33cc33, 0xcccc33, 0xcc33cc, 0x888888];
        for (let i = 0; i < count; i++) {
            const g = new THREE.Group();
            const w = 2.5 + Math.random() * 1.5;
            const h = 2.5 + Math.random() * 1;
            const d = 6 + Math.random() * 2;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            body.position.y = h/2;
            body.castShadow = body.receiveShadow = true; g.add(body);

            const trim = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5 });
            [[-w/2,h/2,-d/2],[w/2,h/2,-d/2],[-w/2,h/2,d/2],[w/2,h/2,d/2]].forEach(p => {
                const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, 0.2), trim);
                c.position.set(p[0], p[1], p[2]); c.castShadow = true; g.add(c);
            });
            g.rotation.y = Math.random() * Math.PI * 2;

            let placed = false, att = 0;
            while (!placed && att < 50) {
                const x = (Math.random()-0.5)*140, z = (Math.random()-0.5)*140;
                let close = false;
                for (const b of this.buildings) if (Math.hypot(x-b.mesh.position.x, z-b.mesh.position.z) < 10) { close = true; break; }
                if (!close) { g.position.set(x, 0, z); placed = true; }
                att++;
            }
            if (placed) { this.scene.add(g); this.containers.push(g); }
        }
    }

    createOilBunkers(count) {
        for (let i = 0; i < count; i++) {
            const g = new THREE.Group();
            const tank = new THREE.Mesh(
                new THREE.CylinderGeometry(3, 3, 4, 16),
                new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 })
            );
            tank.position.y = 2;
            tank.castShadow = tank.receiveShadow = true; g.add(tank);
            const dome = new THREE.Mesh(
                new THREE.SphereGeometry(2.8, 16, 8),
                new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.7, roughness: 0.3 })
            );
            dome.position.y = 4;
            dome.scale.set(1, 0.3, 1);
            dome.castShadow = true; g.add(dome);

            let placed = false, att = 0;
            while (!placed && att < 30) {
                const x = (Math.random()-0.5)*120, z = (Math.random()-0.5)*120;
                let close = false;
                for (const b of this.buildings) if (Math.hypot(x-b.mesh.position.x, z-b.mesh.position.z) < 15) { close = true; break; }
                for (const c of this.containers) if (Math.hypot(x-c.position.x, z-c.position.z) < 10) { close = true; break; }
                if (!close) { g.position.set(x, 0, z); placed = true; }
                att++;
            }
            if (placed) { this.scene.add(g); this.oilBunkers.push(g); }
        }
    }

    createSimpleEnvironment() {
        for (let i = 0; i < 50; i++) {
            const g = new THREE.Group();
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5, 0.7, 3),
                new THREE.MeshStandardMaterial({ color: 0x8B5A2B })
            );
            trunk.position.y = 1.5; trunk.castShadow = true; g.add(trunk);
            const lm = new THREE.MeshStandardMaterial({ color: 0x2a8a2a });
            for (let l = 0; l < 3; l++) {
                const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.5 - l*0.3, 1.8 - l*0.3, 6), lm);
                leaf.position.y = 3.2 + l*1.0;
                leaf.castShadow = true; g.add(leaf);
            }
            let placed = false, att = 0;
            while (!placed && att < 30) {
                const x = (Math.random()-0.5)*130, z = (Math.random()-0.5)*130;
                let close = false;
                for (const b of this.buildings) if (Math.hypot(x-b.mesh.position.x, z-b.mesh.position.z) < 8) { close = true; break; }
                if (!close) { g.position.set(x, 0, z); placed = true; }
                att++;
            }
            if (placed) { this.scene.add(g); this.trees.push(g); }
        }
    }

    spawnInitialAmmoBoxes(count) {
        for (let i = 0; i < count; i++) {
            this.spawnAmmoBox((Math.random()-0.5)*100, 0.5, (Math.random()-0.5)*100, 5 + Math.floor(Math.random()*10));
        }
    }

    spawnAmmoBox(x, y, z, ammo = 10) {
        const b = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.8, 0.8),
            new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x442200, transparent: true, opacity: 0.9 })
        );
        b.position.set(x, y, z);
        b.castShadow = true;
        const cv = document.createElement('canvas');
        cv.width = cv.height = 64;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔫', 32, 32);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv) }));
        spr.scale.set(0.5, 0.5, 0.5);
        spr.position.y = 0.6;
        b.add(spr);
        b.userData = { ammo };
        this.scene.add(b);
        this.ammoBoxes.push(b);
        return b;
    }

    spawnAmmoBoxOnDeath(pos, ammo = 15) {
        this.spawnAmmoBox(pos.x, 0.5, pos.z, ammo);
    }

    checkNearbyDoors() {
        if (!this.gameActive || this.insideBuilding) return;
        let found = null, minD = 4;
        this.buildings.forEach(b => {
            const d = this.playerPos.distanceTo(b.doorPos);
            if (d < minD) { minD = d; found = b; }
        });
        if (found !== this.nearbyDoor) {
            this.nearbyDoor = found;
            const el = document.getElementById('doorIndicator');
            if (el) el.style.display = found ? 'block' : 'none';
        }
    }

    enterBuilding(b) {
        if (!b || this.insideBuilding) return;
        this.insideBuilding = true;
        this.currentBuilding = b;
        this.playerPos.set(b.doorPos.x, 0, b.doorPos.z - 3);
        const el = document.getElementById('doorIndicator');
        if (el) el.textContent = '🚪 INSIDE - TAP SHOOT TO EXIT';
    }

    exitBuilding() {
        if (!this.insideBuilding) return;
        this.insideBuilding = false;
        if (this.nearbyDoor) this.playerPos.set(this.nearbyDoor.doorPos.x, 0, this.nearbyDoor.doorPos.z + 3);
        const el = document.getElementById('doorIndicator');
        if (el) el.style.display = 'none';
        this.currentBuilding = null;
    }

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
                    this.playerYaw -= (t.clientX - this.lastSwipeX) * this.touchSensitivity;
                    this.lookPitch -= (t.clientY - this.lastSwipeY) * this.touchSensitivity;
                    this.lookPitch = Math.max(-0.5, Math.min(0.6, this.lookPitch));
                    this.lastSwipeX = t.clientX;
                    this.lastSwipeY = t.clientY;
                    break;
                }
            }
        });
        swipeZone.addEventListener('touchend', e => { e.preventDefault(); this.swipeTouchId = null; });

        const shootBtn = document.getElementById('shootBtn');
        if (shootBtn) shootBtn.addEventListener('touchstart', e => {
            e.preventDefault();
            if (!this.gameActive) return;
            if (this.insideBuilding) this.exitBuilding();
            else { this.shoot(); playGunSound(); }
        });
        if (shootBtn) shootBtn.addEventListener('click', e => {
            e.preventDefault();
            if (!this.gameActive) return;
            if (this.insideBuilding) this.exitBuilding();
            else { this.shoot(); playGunSound(); }
        });

        const reloadBtn = document.getElementById('reloadBtn');
        if (reloadBtn) reloadBtn.addEventListener('touchstart', e => { e.preventDefault(); this.reload(); });
        if (reloadBtn) reloadBtn.addEventListener('click', e => { e.preventDefault(); this.reload(); });

        // Quick action buttons
        const bindAction = (id, action) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('touchstart', e => { e.preventDefault(); this.triggerAction(action); });
            el.addEventListener('click', e => { e.preventDefault(); this.triggerAction(action); });
        };
        bindAction('punchBtn', 'Punch_Left');
        bindAction('kickBtn', 'Kick_Left');
        bindAction('rollBtn', 'Roll');
        bindAction('waveBtn', 'Wave');

        // Actions menu
        const actionsBtn = document.getElementById('actionsBtn');
        if (actionsBtn) actionsBtn.addEventListener('click', e => { e.preventDefault(); this.openAnimMenu(); });
        const closeBtn = document.getElementById('animMenuClose');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeAnimMenu());
        const menuBg = document.getElementById('animMenu');
        if (menuBg) menuBg.addEventListener('click', e => { if (e.target === menuBg) this.closeAnimMenu(); });

        // Start / restart
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
        const cx = r.left + r.width/2, cy = r.top + r.height/2;
        let dx = touch.clientX - cx, dy = touch.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > this.joystickMaxMove) {
            dx = (dx/dist) * this.joystickMaxMove;
            dy = (dy/dist) * this.joystickMaxMove;
        }
        this.joystickThumb.style.transform = `translate(${dx}px,${dy}px)`;
        this.moveX = dx / this.joystickMaxMove;
        this.moveY = -dy / this.joystickMaxMove;
        const sp = Math.hypot(this.moveX, this.moveY);
        const e = document.getElementById('movementSpeed');
        if (e) e.textContent = sp.toFixed(1);
    }

    setupMinimap() {
        const c = document.getElementById('minimapCanvas');
        if (c) this.minimapCtx = c.getContext('2d');
    }

    updateMinimap() {
        if (!this.minimapCtx) return;
        const canvas = document.getElementById('minimapCanvas');
        if (!canvas) return;
        const ctx = this.minimapCtx;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#8B4513';
        this.buildings.forEach(b => {
            const x = (b.mesh.position.x + 75) * 1.5;
            const z = (b.mesh.position.z + 75) * 1.5;
            if (x > 0 && x < canvas.width && z > 0 && z < canvas.height) ctx.fillRect(x-4, z-4, 8, 8);
        });
        ctx.fillStyle = '#3366cc';
        this.containers.forEach(c => {
            const x = (c.position.x + 75) * 1.5;
            const z = (c.position.z + 75) * 1.5;
            if (x > 0 && x < canvas.width && z > 0 && z < canvas.height) ctx.fillRect(x-2, z-2, 4, 4);
        });
        ctx.fillStyle = '#ffaa00';
        this.oilBunkers.forEach(b => {
            const x = (b.position.x + 75) * 1.5;
            const z = (b.position.z + 75) * 1.5;
            if (x > 0 && x < canvas.width && z > 0 && z < canvas.height) {
                ctx.beginPath(); ctx.arc(x, z, 5, 0, 2*Math.PI); ctx.fill();
            }
        });
        this.otherPlayers.forEach(p => {
            const x = (p.group.position.x + 75) * 1.5;
            const z = (p.group.position.z + 75) * 1.5;
            if (x > 0 && x < canvas.width && z > 0 && z < canvas.height) {
                ctx.fillStyle = '#ff4444';
                ctx.beginPath(); ctx.arc(x, z, 5, 0, 2*Math.PI); ctx.fill();
            }
        });
        const meX = (this.playerPos.x + 75) * 1.5;
        const meZ = (this.playerPos.z + 75) * 1.5;
        ctx.fillStyle = '#44ff44';
        ctx.beginPath(); ctx.arc(meX, meZ, 6, 0, 2*Math.PI); ctx.fill();
    }

    startGame() {
        this.gameActive = true;
        this.health = 100;
        this.score = 0;
        this.kills = 0;
        this.ammo = 30;
        this.boxesCollected = 0;
        this.playerPos.set(0, 0, 15);
        this.playerYaw = 0;
        this.lookPitch = 0;
        this.cooldowns = {};

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

        if (this.localPlayer) {
            this.playOverride('Gun_Shoot', 300);
        }
        if (this.firebaseReady && this.playerRef) {
            updateDoc(this.playerRef, { ammo: this.ammo }).catch(() => {});
        }

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const origin = raycaster.ray.origin.clone();
        const direction = raycaster.ray.direction.clone();
        const rayLen = 40;

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
                this.showNotification(`Hit ${p.data.name}`, 'info');
                break;
            }
        }
    }

    async registerHit(targetId, damage) {
        try {
            if (!this.firebaseReady || !this.playerId || !targetId || !db) return;
            await setDoc(doc(collection(db, 'game_hits')), {
                shooterId: this.playerId,
                shooterName: this.playerName,
                targetId, damage,
                timestamp: serverTimestamp()
            });
        } catch (e) {}
    }

    takeDamage(amount, attackerId, attackerName) {
        if (!this.gameActive || this.health <= 0) return;
        // Roll invulnerability
        if (this.rolling && Date.now() < this.rollUntil) return;

        this.health = Math.max(0, this.health - amount);
        this.lastDamagedBy = { id: attackerId, name: attackerName };
        this.updateUI();

        const v = document.getElementById('damageVignette');
        if (v) {
            v.classList.add('active');
            setTimeout(() => v.classList.remove('active'), 250);
        }

        if (this.localPlayer && this.health > 0) {
            this.playOverride('HitRecieve', 400);
        }
        if (this.firebaseReady && this.playerRef) updateDoc(this.playerRef, { health: this.health }).catch(() => {});
        if (this.health <= 0) this.die();
        else this.showNotification(`-${amount} HP`, 'error');
    }

    async die() {
        this.gameActive = false;
        if (this.localPlayer) {
            this.playAnim(this.localPlayer, 'Death', { loop: false, clamp: true, fade: 0.1 });
        }
        if (this.lastDamagedBy && this.firebaseReady && db) {
            try {
                await addDoc(collection(db, 'game_kills'), {
                    killerId: this.lastDamagedBy.id,
                    killerName: this.lastDamagedBy.name,
                    victimId: this.playerId,
                    victimName: this.playerName,
                    weapon: 'Pistol',
                    timestamp: serverTimestamp()
                });
                await updateDoc(doc(this.playersCollection, this.lastDamagedBy.id), { kills: increment(1) });
                await this.recordWin(this.lastDamagedBy.id, this.lastDamagedBy.name);
            } catch (e) {}
            this.spawnAmmoBoxOnDeath(this.playerPos, 20);
            this.showNotification(`Killed by ${this.lastDamagedBy.name}`, 'error');
        } else this.showNotification('You died', 'error');

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
        this.spawnInitialAmmoBoxes(30);
        this.health = 100; this.score = 0; this.kills = 0; this.ammo = 30; this.boxesCollected = 0;
        this.gameActive = true;
        this.playerPos.set(0, 0, 15);
        this.playerYaw = 0; this.lookPitch = 0;
        this.insideBuilding = false; this.currentBuilding = null; this.nearbyDoor = null;
        this.cooldowns = {};

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
            if (p.nameTag && p.nameTag.parentNode) p.nameTag.remove();
            if (p.healthBar && p.healthBar.parentNode) p.healthBar.remove();
        });
        this.otherPlayers.clear();
    }

    setupAuthListener() {
        onAuthStateChanged(auth, (user) => {
            this.currentUser = user;
            if (user) {
                this.playerId = user.uid;
                try {
                    const p = localStorage.getItem('currentUserProfile');
                    if (p) { const pr = JSON.parse(p); this.playerName = pr.name || this.playerName; }
                } catch (e) {}
                this.firebaseReady = true;
                this.setupFirebase();
                this.showNotification(`Welcome ${this.playerName}!`, 'success');
            } else {
                this.firebaseReady = false;
                this.showNotification('Offline - log in for multiplayer', 'info');
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

            if (this.killsCollection) {
                onSnapshot(query(this.killsCollection, orderBy('timestamp', 'desc'), limit(20)), (snap) => {
                    snap.docChanges().forEach(change => {
                        if (change.type === 'added') this.addKillToFeed(change.doc.data());
                    });
                }, e => {});
            }

            this.heartbeatInterval = setInterval(() => {
                if (this.gameActive && this.playerRef && this.firebaseReady) {
                    const sp = Math.hypot(this.moveX, this.moveY);
                    updateDoc(this.playerRef, {
                        position: { x: this.playerPos.x, y: 1, z: this.playerPos.z },
                        rotation: { y: this.playerYaw, x: this.lookPitch },
                        health: this.health, ammo: this.ammo,
                        isMoving: sp > 0.1,
                        isShooting: this._shootFlashUntil > Date.now(),
                        lastUpdate: serverTimestamp()
                    }).catch(() => {});
                }
            }, 50);

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
        if (data.health !== undefined) {
            const hp = Math.max(0, data.health) / 100;
            p.healthFill.style.width = `${hp * 100}%`;
            p.healthFill.style.background = hp > 0.6 ? '#00ff00' : hp > 0.3 ? '#ffff00' : '#ff0000';
        }
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
        if (p.nameTag && p.nameTag.parentNode) p.nameTag.remove();
        if (p.healthBar && p.healthBar.parentNode) p.healthBar.remove();
        this.otherPlayers.delete(pid);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const now = Date.now();
        const dt = Math.min(0.1, (now - this.lastUpdateTime) / 1000);
        this.lastUpdateTime = now;

        if (this.gameActive) {
            const forwardDir = new THREE.Vector3(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
            const rightDir = new THREE.Vector3(Math.cos(this.playerYaw), 0, -Math.sin(this.playerYaw));

            const moveDelta = new THREE.Vector3();
            if (Math.abs(this.moveY) > 0.05) moveDelta.addScaledVector(forwardDir, this.moveY * this.moveSpeed);
            if (Math.abs(this.moveX) > 0.05) moveDelta.addScaledVector(rightDir, this.moveX * this.moveSpeed);

            // Roll dodge movement
            if (this.rolling && now < this.rollUntil) {
                moveDelta.addScaledVector(this.rollDirection, 0.4);
            } else if (this.rolling) {
                this.rolling = false;
            }

            const speed = moveDelta.length();
            if (speed > 0.001) {
                this.playerPos.add(moveDelta);
                this.footstepTime += 0.2;
            }

            this.playerPos.x = Math.max(-60, Math.min(60, this.playerPos.x));
            this.playerPos.z = Math.max(-60, Math.min(60, this.playerPos.z));

            if (this.insideBuilding && this.currentBuilding) {
                const i = this.currentBuilding.interior;
                this.playerPos.x = Math.max(i.minX + 0.6, Math.min(i.maxX - 0.6, this.playerPos.x));
                this.playerPos.z = Math.max(i.minZ + 0.6, Math.min(i.maxZ - 0.6, this.playerPos.z));
            }

            if (this.localPlayer) {
                this.localPlayer.group.position.copy(this.playerPos);
                this.localPlayer.group.rotation.y = this.playerYaw;

                let anim;
                if (this.overrideAnim && now < this.overrideUntil) {
                    anim = this.overrideAnim;
                } else {
                    this.overrideAnim = null;
                    if (this.rolling) anim = 'Roll';
                    else if (speed > 0.02) anim = 'Run';
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

            const camPos = this.playerPos.clone().add(forwardDir.clone().multiplyScalar(-this.camDist));
            camPos.y = this.playerPos.y + this.camHeight;
            this.camera.position.copy(camPos);

            const lookTarget = this.playerPos.clone();
            lookTarget.y += this.camLookHeight;
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
                    const isMoving = d.isMoving || false;
                    const isShooting = d.isShooting || false;
                    let anim = 'Idle_Gun';
                    if (p.isDead) anim = 'Death';
                    else if (isShooting) anim = 'Gun_Shoot';
                    else if (isMoving) anim = 'Run';
                    this.playAnim(p, anim, {
                        loop: anim !== 'Death' && anim !== 'Gun_Shoot',
                        clamp: anim === 'Death' || anim === 'Gun_Shoot',
                        fade: 0.15
                    });
                    p.mixer.update(dt);
                }
                if (p.isDead && now - p.deathPlayedAt > 2500) { this.removePlayer(pid); return; }

                if (p.nameTag && p.group) {
                    const v = p.group.position.clone();
                    v.y += 2.0;
                    v.project(this.camera);
                    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
                    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
                    if (v.z < 1 && !p.isDead) {
                        p.nameTag.textContent = p.data.name || 'Player';
                        p.nameTag.style.display = 'block';
                        p.nameTag.style.left = x + 'px';
                        p.nameTag.style.top = y + 'px';
                        p.healthBar.style.display = 'block';
                        p.healthBar.style.left = x + 'px';
                        p.healthBar.style.top = (y + 18) + 'px';
                    } else {
                        p.nameTag.style.display = 'none';
                        p.healthBar.style.display = 'none';
                    }
                }
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

if (!document.getElementById('game-anim-styles')) {
    const s = document.createElement('style');
    s.id = 'game-anim-styles';
    s.textContent = `@keyframes notifFade { 0% { opacity: 0; transform: translate(-50%, -20px); } 10% { opacity: 1; transform: translate(-50%, 0); } 90% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -20px); } }`;
    document.head.appendChild(s);
}