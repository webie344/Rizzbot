import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'https://unpkg.com/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth, 
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    limit,
    serverTimestamp,
    addDoc,
    increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase configuration
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
    console.log('Firebase initialized');
} catch (error) {
    console.error('Firebase init error:', error);
}

// ============ GUN SOUND ============
function playGunSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => createGunSound(audioCtx));
        } else {
            createGunSound(audioCtx);
        }
    } catch (e) {}
}

function createGunSound(ctx) {
    try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 120;
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
        
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.value = 240;
        gain2.gain.setValueAtTime(0.15, now);
        gain2.gain.exponentialRampToValueAtTime(0.005, now + 0.15);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now);
        osc2.stop(now + 0.15);
    } catch (e) {}
}

class Game {
    constructor() {
        console.log('🎮 CODM-STYLE GLB MULTIPLAYER - STARTING');

        // Firebase
        this.currentUser = null;
        this.playerId = null;
        this.playerName = 'Player_' + Math.floor(Math.random() * 10000);
        this.playerRef = null;
        this.playersCollection = null;
        this.killsCollection = null;
        this.unsubscribePlayers = null;
        this.heartbeatInterval = null;
        this.firebaseReady = false;

        // GLB model
        this.glbBase = null;           // Loaded template
        this.glbAnimations = {};       // { name: AnimationClip }
        this.glbLoaded = false;
        this.glbLoading = false;
        this.otherPlayers = new Map(); // playerId -> { group, mixer, actions, current, nameTag, healthBar, healthFill, data, targetPosition, targetRotation, isShooting, deathPlayed }

        this.lastUpdateTime = Date.now();

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 80, 250);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1.8, 15);
        this.camera.rotation.order = 'YXZ';

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) gameContainer.appendChild(this.renderer.domElement);
        else document.body.appendChild(this.renderer.domElement);

        // Game state
        this.health = 100;
        this.maxHealth = 100;
        this.damagePerShot = 33;
        this.score = 0;
        this.kills = 0;
        this.ammo = 30;
        this.maxAmmo = 30;
        this.boxesCollected = 0;
        this.gameActive = false;

        this.killMessages = [];
        this.setupKillFeed();

        this.lastDamagedBy = null;
        this.lastDamageTime = 0;

        this.moveX = 0;
        this.moveY = 0;
        this.moveSpeed = 0.15;
        this.bobAmount = 0;
        this.footstepTime = 0;

        this.lookYaw = 0;
        this.lookPitch = 0;
        this.touchSensitivity = 0.006;

        this.nearbyDoor = null;
        this.insideBuilding = false;
        this.currentBuilding = null;

        this.joystickActive = false;
        this.joystickTouchId = null;
        this.joystickMaxMove = 40;
        this.joystickThumb = document.getElementById('joystickThumb');
        this.joystickContainer = document.getElementById('joystickContainer');

        this.swipeTouchId = null;
        this.lastSwipeX = 0;
        this.lastSwipeY = 0;

        // Arrays
        this.buildings = [];
        this.containers = [];
        this.oilBunkers = [];
        this.ammoBoxes = [];
        this.trees = [];

        this.setupUIElements();
        this.setupLighting();
        this.setupGround();
        this.createRealisticBuildings();
        this.createContainers(120);
        this.createOilBunkers(15);
        this.createSimpleEnvironment();
        this.spawnInitialAmmoBoxes(30);
        this.setupControls();
        this.setupMinimap();

        setInterval(() => this.checkNearbyDoors(), 200);

        // Load GLB FIRST, then auth
        this.loadGLB().then(() => {
            this.setupAuthListener();
        }).catch(err => {
            console.error('GLB failed, using fallback boxes:', err);
            this.glbLoaded = false;
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

    // ============ LOAD GLB ============
    loadGLB() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            console.log('Loading Soldier.glb...');
            this.glbLoading = true;

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

                    console.log('✅ Soldier.glb loaded. Animations:', Object.keys(this.glbAnimations));
                    this.glbLoaded = true;
                    this.glbLoading = false;
                    resolve();
                },
                undefined,
                (err) => {
                    console.error('GLB load error:', err);
                    this.glbLoading = false;
                    reject(err);
                }
            );
        });
    }

    // ============ CREATE PLAYER INSTANCE ============
    createPlayerInstance() {
        if (!this.glbLoaded) return null;

        // Clone properly (bones + skinning)
        const model = SkeletonUtils.clone(this.glbBase);

        // Rotate 180° because model faces +Z (runs toward camera by default).
        // After rotating, it faces -Z which is "forward" in Three.js.
        model.rotation.y = Math.PI;

        // Wrap so we can move the group independently of animation
        const group = new THREE.Group();
        group.add(model);

        // Scale: our camera is at y=1.8, so player should be ~1.8 tall.
        // Auto-fit to a target height of 1.8 units.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        if (size.y > 0) {
            const scale = 1.8 / size.y;
            model.scale.setScalar(scale);
            // After scaling, recompute box to sit on ground
            const box2 = new THREE.Box3().setFromObject(model);
            model.position.y -= box2.min.y;
        }

        // Mixer and actions
        const mixer = new THREE.AnimationMixer(model);
        const actions = {};
        for (const [name, clip] of Object.entries(this.glbAnimations)) {
            const action = mixer.clipAction(clip);
            actions[name] = action;
        }

        // Name tag (HTML)
        const nameTag = document.createElement('div');
        nameTag.style.cssText = `
            position: absolute;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 3px 10px;
            border-radius: 14px;
            font-size: 12px;
            font-family: Arial, sans-serif;
            font-weight: bold;
            pointer-events: none;
            transform: translate(-50%, -50%);
            white-space: nowrap;
            border: 2px solid #ffaa00;
            z-index: 1000;
            text-shadow: 1px 1px 2px black;
            display: none;
        `;
        document.body.appendChild(nameTag);

        // Health bar (HTML)
        const healthBar = document.createElement('div');
        healthBar.style.cssText = `
            position: absolute;
            width: 50px;
            height: 6px;
            background: rgba(0,0,0,0.7);
            border-radius: 3px;
            transform: translate(-50%, -50%);
            overflow: hidden;
            border: 1px solid white;
            z-index: 1000;
            display: none;
        `;
        const healthFill = document.createElement('div');
        healthFill.style.cssText = `height:100%;width:100%;background:#00ff00;transition:width 0.2s;`;
        healthBar.appendChild(healthFill);
        document.body.appendChild(healthBar);

        return {
            group,
            model,
            mixer,
            actions,
            currentActionName: null,
            nameTag,
            healthBar,
            healthFill,
            isDead: false,
            deathPlayedAt: 0
        };
    }

    // ============ FALLBACK BOX PLAYER (if GLB fails) ============
    createFallbackPlayer(color) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 1.2, 0.4),
            new THREE.MeshStandardMaterial({ color })
        );
        body.position.y = 0.9;
        body.castShadow = true;
        group.add(body);
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.35, 0.35),
            new THREE.MeshStandardMaterial({ color: 0xffccaa })
        );
        head.position.y = 1.7;
        head.castShadow = true;
        group.add(head);

        const nameTag = document.createElement('div');
        nameTag.style.cssText = `position:absolute;background:rgba(0,0,0,0.8);color:white;padding:3px 10px;border-radius:14px;font-size:12px;font-weight:bold;pointer-events:none;transform:translate(-50%,-50%);border:2px solid #ffaa00;z-index:1000;display:none;`;
        document.body.appendChild(nameTag);

        const healthBar = document.createElement('div');
        healthBar.style.cssText = `position:absolute;width:50px;height:6px;background:rgba(0,0,0,0.7);border-radius:3px;transform:translate(-50%,-50%);overflow:hidden;border:1px solid white;z-index:1000;display:none;`;
        const healthFill = document.createElement('div');
        healthFill.style.cssText = `height:100%;width:100%;background:#00ff00;`;
        healthBar.appendChild(healthFill);
        document.body.appendChild(healthBar);

        return { group, model: null, mixer: null, actions: {}, currentActionName: null, nameTag, healthBar, healthFill, isDead: false, deathPlayedAt: 0 };
    }

    // ============ PLAY ANIMATION (with crossfade) ============
    playAnim(playerObj, name, opts = {}) {
        if (!playerObj || !playerObj.actions) return;
        const { loop = true, fade = 0.2, clamp = false } = opts;
        if (playerObj.currentActionName === name) return;

        const nextAction = playerObj.actions[name];
        if (!nextAction) return;

        // Stop previous
        if (playerObj.currentActionName && playerObj.actions[playerObj.currentActionName]) {
            playerObj.actions[playerObj.currentActionName].fadeOut(fade);
        }

        nextAction.reset();
        nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        nextAction.clampWhenFinished = clamp;
        nextAction.fadeIn(fade).play();
        playerObj.currentActionName = name;
    }

    // ============ CHOOSE ANIMATION BASED ON STATE ============
    chooseAnimation(playerObj, { isMoving, isRunning, isShooting, isDead }) {
        if (isDead) return 'Death';
        if (isShooting) return 'Gun_Shoot';
        if (isMoving && isRunning) return 'Run';
        if (isMoving) return 'Walk';
        return 'Idle_Gun';
    }

    // ============ AUTH ============
    setupAuthListener() {
        console.log('Auth listener setting up...');
        onAuthStateChanged(auth, (user) => {
            console.log('🔐 Auth state:', user ? 'logged in' : 'no user');
            this.currentUser = user;

            if (user) {
                this.playerId = user.uid;
                try {
                    const p = localStorage.getItem('currentUserProfile');
                    if (p) {
                        const profile = JSON.parse(p);
                        this.playerName = profile.name || this.playerName;
                    }
                } catch (e) {}
                console.log('✅ Player:', this.playerId, this.playerName);
                this.firebaseReady = true;
                this.setupFirebase();
                this.showNotification(`Welcome ${this.playerName}!`, 'success');
            } else {
                this.firebaseReady = false;
                this.showNotification('Offline - log in to play multiplayer', 'info');
            }
        }, (err) => {
            console.error('Auth error:', err);
            this.firebaseReady = false;
        });
    }

    // ============ FIREBASE ============
    setupFirebase() {
        if (!this.firebaseReady || !db) return;
        try {
            this.playersCollection = collection(db, 'game_players');
            this.killsCollection = collection(db, 'game_kills');
            this.playerRef = doc(this.playersCollection, this.playerId);

            setDoc(this.playerRef, {
                id: this.playerId,
                name: this.playerName,
                position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
                rotation: { y: this.lookYaw, x: this.lookPitch },
                health: this.health,
                ammo: this.ammo,
                kills: 0,
                alive: true,
                isShooting: false,
                isMoving: false,
                lastUpdate: serverTimestamp(),
                joinedAt: serverTimestamp()
            }).catch(console.error);

            this.unsubscribePlayers = onSnapshot(this.playersCollection, (snap) => {
                snap.docChanges().forEach(change => {
                    const data = change.doc.data();
                    if (data.id === this.playerId) return;

                    if (change.type === 'added' || change.type === 'modified') {
                        if (data.alive) this.updateOrAddPlayer(data);
                        else this.handlePlayerDeath(data.id);
                    } else if (change.type === 'removed') {
                        this.removePlayer(data.id);
                    }
                });
            }, err => console.error('Player listener:', err));

            if (this.killsCollection) {
                const q = query(this.killsCollection, orderBy('timestamp', 'desc'), limit(20));
                onSnapshot(q, (snap) => {
                    snap.docChanges().forEach(change => {
                        if (change.type === 'added') this.addKillToFeed(change.doc.data());
                    });
                }, err => console.error('Kill listener:', err));
            }

            this.heartbeatInterval = setInterval(() => {
                if (this.gameActive && this.playerRef && this.firebaseReady) {
                    const speed = Math.sqrt(this.moveX * this.moveX + this.moveY * this.moveY);
                    updateDoc(this.playerRef, {
                        position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
                        rotation: { y: this.lookYaw, x: this.lookPitch },
                        health: this.health,
                        ammo: this.ammo,
                        isMoving: speed > 0.1,
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
            }, err => console.log('Hit listener:', err));

        } catch (err) {
            console.error('Firebase setup error:', err);
            this.firebaseReady = false;
        }
    }

    // ============ ADD / UPDATE PLAYER ============
    updateOrAddPlayer(data) {
        let p = this.otherPlayers.get(data.id);

        if (!p) {
            const instance = this.glbLoaded
                ? this.createPlayerInstance()
                : this.createFallbackPlayer(this.getPlayerColor(data.id));

            if (!instance) return;

            instance.data = data;
            instance.targetPosition = new THREE.Vector3(
                data.position.x, data.position.y, data.position.z
            );
            instance.targetRotation = data.rotation ? data.rotation.y : 0;

            this.scene.add(instance.group);
            this.otherPlayers.set(data.id, instance);
            p = instance;
        }

        // Update target position (interpolated in animate loop)
        if (data.position) {
            p.targetPosition.set(data.position.x, data.position.y, data.position.z);
        }
        if (data.rotation) {
            // Add PI because our group is rotated - but wait, we rotated the MODEL not the group.
            // The group rotation should match the game's rotation (yaw).
            // We already set model.rotation.y = Math.PI so the visible facing is corrected.
            // The group.y matches the firebase yaw.
            p.targetRotation = data.rotation.y;
        }

        if (data.health !== undefined) {
            const hp = Math.max(0, data.health) / 100;
            p.healthFill.style.width = `${hp * 100}%`;
            p.healthFill.style.background = hp > 0.6 ? '#00ff00' : hp > 0.3 ? '#ffff00' : '#ff0000';
        }

        p.data = data;
    }

    handlePlayerDeath(playerId) {
        const p = this.otherPlayers.get(playerId);
        if (!p) return;

        if (!p.isDead) {
            p.isDead = true;
            p.deathPlayedAt = Date.now();
            if (p.actions && p.actions['Death']) {
                this.playAnim(p, 'Death', { loop: false, clamp: true, fade: 0.1 });
            }
        }

        // Remove after death animation plays
        if (Date.now() - p.deathPlayedAt > 2500) {
            this.removePlayer(playerId);
        }
    }

    removePlayer(playerId) {
        const p = this.otherPlayers.get(playerId);
        if (!p) return;
        this.scene.remove(p.group);
        if (p.nameTag && p.nameTag.parentNode) p.nameTag.remove();
        if (p.healthBar && p.healthBar.parentNode) p.healthBar.remove();
        this.otherPlayers.delete(playerId);
    }

    getPlayerColor(playerId) {
        let hash = 0;
        for (let i = 0; i < playerId.length; i++) {
            hash = ((hash << 5) - hash) + playerId.charCodeAt(i);
            hash |= 0;
        }
        const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff, 0xff8844, 0x8844ff];
        return colors[Math.abs(hash) % colors.length];
    }

    // ============ UI ============
    setupKillFeed() {
        if (!document.getElementById('killFeed')) {
            const el = document.createElement('div');
            el.id = 'killFeed';
            el.style.cssText = `position:fixed;top:80px;right:10px;width:250px;z-index:1000;pointer-events:none;`;
            document.body.appendChild(el);
        }
        this.killFeedElement = document.getElementById('killFeed');
    }

    setupUIElements() {
        ['healthValue', 'scoreValue', 'ammoValue', 'boxesValue', 'killsValue'].forEach(id => {
            if (!document.getElementById(id)) {
                const el = document.createElement('span');
                el.id = id;
                el.style.display = 'none';
                document.body.appendChild(el);
            }
        });
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
            this.kills++;
            this.score += 100;
            this.updateUI();
        }
    }

    updateKillFeed() {
        if (!this.killFeedElement) return;
        this.killFeedElement.innerHTML = '';
        this.killMessages.forEach(msg => {
            const item = document.createElement('div');
            item.style.cssText = `background:rgba(0,0,0,0.8);color:white;padding:5px 10px;margin-bottom:4px;border-radius:16px;font-size:12px;font-weight:bold;border-left:3px solid #ff4444;text-align:center;`;
            item.innerHTML = `<span style="color:#ffaa00">${msg.killer}</span> 🔫 <span style="color:#ff4444">${msg.victim}</span>`;
            this.killFeedElement.appendChild(item);
        });
    }

    showNotification(message, type = 'info') {
        const el = document.createElement('div');
        el.style.cssText = `
            position:fixed;top:20px;left:50%;transform:translateX(-50%);
            background:${type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : '#4444ff'};
            color:white;padding:10px 22px;border-radius:30px;font-family:Arial;font-size:14px;font-weight:bold;
            z-index:10000;box-shadow:0 4px 20px rgba(0,0,0,0.5);text-shadow:1px 1px 2px black;
        `;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }

    // ============ SCENE SETUP ============
    setupLighting() {
        this.scene.add(new THREE.AmbientLight(0x404060));
        const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
        sun.position.set(30, 50, 30);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -60;
        sun.shadow.camera.right = 60;
        sun.shadow.camera.top = 60;
        sun.shadow.camera.bottom = -60;
        this.scene.add(sun);
        const fill = new THREE.DirectionalLight(0x88aacc, 0.6);
        fill.position.set(-30, 20, -40);
        this.scene.add(fill);
    }

    setupGround() {
        const ground = new THREE.Mesh(
            new THREE.CircleGeometry(150, 128),
            new THREE.MeshStandardMaterial({ color: 0x3a7e3a, roughness: 0.8 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        for (let i = 0; i < 200; i++) {
            const patch = new THREE.Mesh(
                new THREE.CircleGeometry(0.8 + Math.random() * 1.5, 5),
                new THREE.MeshStandardMaterial({ color: 0x4a8e4a })
            );
            patch.rotation.x = -Math.PI / 2;
            patch.position.set((Math.random() - 0.5) * 140, 0.01, (Math.random() - 0.5) * 140);
            patch.receiveShadow = true;
            this.scene.add(patch);
        }
    }

    createRealisticBuildings() {
        const colors = [0x8B4513, 0x5D3A1A, 0xA0522D];
        const positions = [
            { x: -15, z: -15 }, { x: 15, z: -15 }, { x: -15, z: 15 }, { x: 15, z: 15 },
            { x: -25, z: 0 }, { x: 25, z: 0 }, { x: 0, z: -25 }, { x: 0, z: 25 },
            { x: -35, z: -35 }, { x: 35, z: 35 }, { x: -35, z: 35 }, { x: 35, z: -35 }
        ];
        positions.forEach((pos, i) => {
            this.createDetailedBuilding(pos.x, pos.z, 8 + Math.random() * 4, 8 + Math.random() * 4, 6 + Math.random() * 4, colors[i % colors.length]);
        });
    }

    createDetailedBuilding(x, z, w, d, h, color) {
        const group = new THREE.Group();
        const wt = 0.5;
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        const trim = new THREE.MeshStandardMaterial({ color: 0x884422 });

        // Walls
        const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, wt), mat);
        back.position.set(0, h / 2, -d / 2 + wt / 2);
        back.castShadow = back.receiveShadow = true;
        group.add(back);

        const left = new THREE.Mesh(new THREE.BoxGeometry(wt, h, d), mat);
        left.position.set(-w / 2 + wt / 2, h / 2, 0);
        left.castShadow = left.receiveShadow = true;
        group.add(left);

        const right = new THREE.Mesh(new THREE.BoxGeometry(wt, h, d), mat);
        right.position.set(w / 2 - wt / 2, h / 2, 0);
        right.castShadow = right.receiveShadow = true;
        group.add(right);

        const dw = 2.0, dh = 2.5;
        const fl = new THREE.Mesh(new THREE.BoxGeometry((w - dw) / 2, h, wt), mat);
        fl.position.set(-(w + dw) / 4, h / 2, d / 2 - wt / 2);
        fl.castShadow = fl.receiveShadow = true;
        group.add(fl);

        const fr = new THREE.Mesh(new THREE.BoxGeometry((w - dw) / 2, h, wt), mat);
        fr.position.set((w + dw) / 4, h / 2, d / 2 - wt / 2);
        fr.castShadow = fr.receiveShadow = true;
        group.add(fr);

        const top = new THREE.Mesh(new THREE.BoxGeometry(dw, h - dh, wt), mat);
        top.position.set(0, h - (h - dh) / 2, d / 2 - wt / 2);
        top.castShadow = top.receiveShadow = true;
        group.add(top);

        const frame = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.2, dh + 0.2, 0.3), trim);
        frame.position.set(0, dh / 2, d / 2 - 0.1);
        group.add(frame);

        const door = new THREE.Mesh(new THREE.BoxGeometry(dw - 0.2, dh - 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x8B5A2B }));
        door.position.set(0, dh / 2, d / 2);
        door.castShadow = door.receiveShadow = true;
        group.add(door);

        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.7, 2.5, 4), new THREE.MeshStandardMaterial({ color: 0x884422 }));
        roof.position.set(0, h + 1.25, 0);
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = roof.receiveShadow = true;
        group.add(roof);

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(w - 1.5, d - 1.5),
            new THREE.MeshStandardMaterial({ color: 0x5a3a1a, side: THREE.DoubleSide })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0.05, 0);
        floor.receiveShadow = true;
        group.add(floor);

        group.position.set(x, 0, z);
        this.scene.add(group);

        this.buildings.push({
            mesh: group,
            doorPos: new THREE.Vector3(x, 1.2, z + d / 2),
            interior: {
                minX: x - w / 2 + wt, maxX: x + w / 2 - wt,
                minZ: z - d / 2 + wt, maxZ: z + d / 2 - wt,
                minY: 0, maxY: h
            }
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
            const trim = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5 });

            const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            body.position.y = h / 2;
            body.castShadow = body.receiveShadow = true;
            g.add(body);

            const cornerGeo = new THREE.BoxGeometry(0.2, h, 0.2);
            [[-w / 2, h / 2, -d / 2], [w / 2, h / 2, -d / 2], [-w / 2, h / 2, d / 2], [w / 2, h / 2, d / 2]].forEach(pos => {
                const c = new THREE.Mesh(cornerGeo, trim);
                c.position.set(pos[0], pos[1], pos[2]);
                c.castShadow = true;
                g.add(c);
            });

            g.rotation.y = Math.random() * Math.PI * 2;

            let placed = false, attempts = 0;
            while (!placed && attempts < 50) {
                const x = (Math.random() - 0.5) * 140;
                const z = (Math.random() - 0.5) * 140;
                let tooClose = false;
                for (const b of this.buildings) {
                    if (Math.hypot(x - b.mesh.position.x, z - b.mesh.position.z) < 10) { tooClose = true; break; }
                }
                if (!tooClose) { g.position.set(x, 0, z); placed = true; }
                attempts++;
            }
            if (placed) { this.scene.add(g); this.containers.push(g); }
        }
        console.log(`✅ Spawned ${this.containers.length} containers`);
    }

    createOilBunkers(count) {
        for (let i = 0; i < count; i++) {
            const g = new THREE.Group();
            const tank = new THREE.Mesh(
                new THREE.CylinderGeometry(3, 3, 4, 16),
                new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 })
            );
            tank.position.y = 2;
            tank.castShadow = tank.receiveShadow = true;
            g.add(tank);

            const dome = new THREE.Mesh(
                new THREE.SphereGeometry(2.8, 16, 8),
                new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.7, roughness: 0.3 })
            );
            dome.position.y = 4;
            dome.scale.set(1, 0.3, 1);
            dome.castShadow = true;
            g.add(dome);

            const base = new THREE.Mesh(
                new THREE.TorusGeometry(3.2, 0.3, 8, 32),
                new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.8 })
            );
            base.position.y = 0.2;
            base.rotation.x = Math.PI / 2;
            g.add(base);

            let placed = false, attempts = 0;
            while (!placed && attempts < 30) {
                const x = (Math.random() - 0.5) * 120;
                const z = (Math.random() - 0.5) * 120;
                let tooClose = false;
                for (const b of this.buildings) {
                    if (Math.hypot(x - b.mesh.position.x, z - b.mesh.position.z) < 15) { tooClose = true; break; }
                }
                for (const c of this.containers) {
                    if (Math.hypot(x - c.position.x, z - c.position.z) < 10) { tooClose = true; break; }
                }
                if (!tooClose) { g.position.set(x, 0, z); placed = true; }
                attempts++;
            }
            if (placed) { this.scene.add(g); this.oilBunkers.push(g); }
        }
        console.log(`✅ Spawned ${this.oilBunkers.length} oil bunkers`);
    }

    createSimpleEnvironment() {
        for (let i = 0; i < 50; i++) {
            const g = new THREE.Group();
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5, 0.7, 3),
                new THREE.MeshStandardMaterial({ color: 0x8B5A2B })
            );
            trunk.position.y = 1.5;
            trunk.castShadow = true;
            g.add(trunk);

            const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a8a2a });
            for (let l = 0; l < 3; l++) {
                const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.5 - l * 0.3, 1.8 - l * 0.3, 6), leafMat);
                leaf.position.y = 3.2 + l * 1.0;
                leaf.castShadow = true;
                g.add(leaf);
            }

            let placed = false, attempts = 0;
            while (!placed && attempts < 30) {
                const x = (Math.random() - 0.5) * 130;
                const z = (Math.random() - 0.5) * 130;
                let tooClose = false;
                for (const b of this.buildings) {
                    if (Math.hypot(x - b.mesh.position.x, z - b.mesh.position.z) < 8) { tooClose = true; break; }
                }
                if (!tooClose) { g.position.set(x, 0, z); placed = true; }
                attempts++;
            }
            if (placed) { this.scene.add(g); this.trees.push(g); }
        }
    }

    // ============ AMMO BOXES ============
    spawnInitialAmmoBoxes(count) {
        for (let i = 0; i < count; i++) {
            this.spawnAmmoBox(
                (Math.random() - 0.5) * 100, 0.5, (Math.random() - 0.5) * 100,
                5 + Math.floor(Math.random() * 10)
            );
        }
    }

    spawnAmmoBox(x, y, z, ammo = 10) {
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.8, 0.8),
            new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x442200, transparent: true, opacity: 0.9 })
        );
        box.position.set(x, y, z);
        box.castShadow = true;

        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔫', 32, 32);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
        sprite.scale.set(0.5, 0.5, 0.5);
        sprite.position.y = 0.6;
        box.add(sprite);

        box.userData = { ammo, type: 'ammo' };
        this.scene.add(box);
        this.ammoBoxes.push(box);
        return box;
    }

    spawnAmmoBoxOnDeath(pos, ammo = 15) {
        this.spawnAmmoBox(pos.x, 0.5, pos.z, ammo);
    }

    // ============ DOORS ============
    checkNearbyDoors() {
        if (!this.gameActive || this.insideBuilding) return;
        let found = null, minDist = 4;
        this.buildings.forEach(b => {
            const d = this.camera.position.distanceTo(b.doorPos);
            if (d < minDist) { minDist = d; found = b; }
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
        this.camera.position.set(b.doorPos.x, 1.8, b.doorPos.z - 3);
        const el = document.getElementById('doorIndicator');
        if (el) el.textContent = '🏢 INSIDE - TAP SHOOT TO EXIT';
    }

    exitBuilding() {
        if (!this.insideBuilding) return;
        this.insideBuilding = false;
        if (this.nearbyDoor) this.camera.position.set(this.nearbyDoor.doorPos.x, 1.8, this.nearbyDoor.doorPos.z + 3);
        const el = document.getElementById('doorIndicator');
        if (el) el.style.display = 'none';
        this.currentBuilding = null;
    }

    // ============ CONTROLS ============
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
            const sp = document.getElementById('movementSpeed');
            if (sp) sp.textContent = '0';
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
                    this.lookYaw -= (t.clientX - this.lastSwipeX) * this.touchSensitivity;
                    this.lookPitch -= (t.clientY - this.lastSwipeY) * this.touchSensitivity;
                    this.lookPitch = Math.max(-1.0, Math.min(1.0, this.lookPitch));
                    this.lastSwipeX = t.clientX;
                    this.lastSwipeY = t.clientY;
                    break;
                }
            }
        });

        swipeZone.addEventListener('touchend', e => { e.preventDefault(); this.swipeTouchId = null; });

        const shootBtn = document.getElementById('shootBtn');
        if (shootBtn) {
            shootBtn.addEventListener('touchstart', e => {
                e.preventDefault();
                if (!this.gameActive) return;
                if (this.insideBuilding) this.exitBuilding();
                else if (this.nearbyDoor) this.enterBuilding(this.nearbyDoor);
                else { this.shoot(); playGunSound(); }
            });
        }

        const reloadBtn = document.getElementById('reloadBtn');
        if (reloadBtn) reloadBtn.addEventListener('touchstart', e => { e.preventDefault(); this.reload(); });

        const startBtn = document.getElementById('startBtn');
        if (startBtn) startBtn.addEventListener('click', () => {
            const ins = document.getElementById('instructions');
            if (ins) ins.style.display = 'none';
            this.startGame();
        });

        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) restartBtn.addEventListener('click', () => this.restart());
    }

    updateJoystick(touch) {
        if (!this.joystickContainer || !this.joystickThumb) return;
        const rect = this.joystickContainer.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = touch.clientX - cx;
        let dy = touch.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > this.joystickMaxMove) {
            dx = (dx / dist) * this.joystickMaxMove;
            dy = (dy / dist) * this.joystickMaxMove;
        }
        this.joystickThumb.style.transform = `translate(${dx}px,${dy}px)`;
        this.moveX = dx / this.joystickMaxMove;
        this.moveY = -dy / this.joystickMaxMove;
        const speed = Math.hypot(this.moveX, this.moveY);
        const el = document.getElementById('movementSpeed');
        if (el) el.textContent = speed.toFixed(1);
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
            if (x > 0 && x < canvas.width && z > 0 && z < canvas.height) ctx.fillRect(x - 4, z - 4, 8, 8);
        });

        ctx.fillStyle = '#3366cc';
        this.containers.forEach(c => {
            const x = (c.position.x + 75) * 1.5;
            const z = (c.position.z + 75) * 1.5;
            if (x > 0 && x < canvas.width && z > 0 && z < canvas.height) ctx.fillRect(x - 2, z - 2, 4, 4);
        });

        ctx.fillStyle = '#ffaa00';
        this.oilBunkers.forEach(b => {
            const x = (b.position.x + 75) * 1.5;
            const z = (b.position.z + 75) * 1.5;
            if (x > 0 && x < canvas.width && z > 0 && z < canvas.height) {
                ctx.beginPath(); ctx.arc(x, z, 5, 0, 2 * Math.PI); ctx.fill();
            }
        });

        this.otherPlayers.forEach(p => {
            const x = (p.group.position.x + 75) * 1.5;
            const z = (p.group.position.z + 75) * 1.5;
            if (x > 0 && x < canvas.width && z > 0 && z < canvas.height) {
                ctx.fillStyle = '#ff4444';
                ctx.beginPath(); ctx.arc(x, z, 5, 0, 2 * Math.PI); ctx.fill();
            }
        });

        ctx.fillStyle = '#44ff44';
        ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 6, 0, 2 * Math.PI); ctx.fill();
    }

    // ============ GAME FLOW ============
    startGame() {
        this.gameActive = true;
        this.health = 100;
        this.score = 0;
        this.kills = 0;
        this.ammo = 30;
        this.boxesCollected = 0;
        this.camera.position.set(0, 1.8, 15);
        this._shootFlashUntil = 0;

        if (this.firebaseReady && this.playerRef) {
            updateDoc(this.playerRef, {
                health: this.health, ammo: this.ammo, kills: this.kills, alive: true,
                position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z }
            }).catch(console.error);
        }
        this.updateUI();
        this.showNotification(`Online: ${this.otherPlayers.size + 1}`, 'info');
    }

    shoot() {
        if (!this.gameActive || this.ammo <= 0) return;
        this.ammo--;
        this.updateUI();
        this._shootFlashUntil = Date.now() + 200;

        if (this.firebaseReady && this.playerRef) {
            updateDoc(this.playerRef, { ammo: this.ammo }).catch(() => {});
        }

        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const startPos = this.camera.position.clone();
        const rayLen = 30;

        // Hit ammo box
        for (let i = this.ammoBoxes.length - 1; i >= 0; i--) {
            const b = this.ammoBoxes[i];
            const to = b.position.clone().sub(startPos);
            if (direction.angleTo(to) < 0.2 && to.length() < rayLen) {
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

        // Hit player
        for (const [pid, p] of this.otherPlayers) {
            if (!p.group || p.isDead) continue;
            const to = p.group.position.clone().sub(startPos);
            if (direction.angleTo(to) < 0.2 && to.length() < rayLen) {
                this.registerHit(pid, this.damagePerShot);
                this.showHitMarker();
                this.showNotification(`Hit ${p.data.name}`, 'info');
                break;
            }
        }
    }

    showHitMarker() {
        const m = document.createElement('div');
        m.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;border:3px solid white;border-radius:50%;pointer-events:none;z-index:9999;animation:hitMarker 0.2s ease-out;`;
        document.body.appendChild(m);
        setTimeout(() => m.remove(), 200);
    }

    async registerHit(targetId, damage) {
        try {
            if (!this.firebaseReady || !this.playerId || !targetId || !db) return;
            await setDoc(doc(collection(db, 'game_hits')), {
                shooterId: this.playerId,
                shooterName: this.playerName,
                targetId,
                damage,
                timestamp: serverTimestamp()
            });
        } catch (e) { console.error('Hit reg error:', e); }
    }

    takeDamage(amount, attackerId, attackerName) {
        if (!this.gameActive || this.health <= 0) return;
        this.health = Math.max(0, this.health - amount);
        this.lastDamagedBy = { id: attackerId, name: attackerName };
        this.updateUI();
        document.body.style.backgroundColor = '#ff0000';
        setTimeout(() => { document.body.style.backgroundColor = ''; }, 100);

        if (this.firebaseReady && this.playerRef) updateDoc(this.playerRef, { health: this.health }).catch(() => {});

        if (this.health <= 0) this.die();
        else this.showNotification(`-${amount} HP`, 'error');
    }

    async die() {
        this.gameActive = false;
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
            } catch (e) { console.error('Kill rec error:', e); }
            this.spawnAmmoBoxOnDeath(this.camera.position, 20);
            this.showNotification(`Killed by ${this.lastDamagedBy.name}`, 'error');
        } else this.showNotification('You died', 'error');

        if (this.firebaseReady && this.playerRef) {
            await updateDoc(this.playerRef, { alive: false, health: 0 }).catch(() => {});
        }

        const overlay = document.getElementById('gameOverlay');
        const fs = document.getElementById('finalScore');
        if (overlay && fs) {
            fs.textContent = `Kills: ${this.kills}  Score: ${this.score}  Boxes: ${this.boxesCollected}`;
            overlay.style.display = 'flex';
        }
        await this.recordDeath(this.playerId, this.playerName);
    }

    async recordWin(pid, pname) {
        if (!this.firebaseReady || !db) return;
        try {
            const today = new Date().toISOString().split('T')[0];
            await setDoc(doc(db, 'game_daily_wins', today, 'players', pid), {
                playerId: pid, playerName: pname, wins: increment(1), lastWin: serverTimestamp()
            }, { merge: true });
            await setDoc(doc(db, 'game_alltime_wins', pid), {
                playerId: pid, playerName: pname, wins: increment(1), lastWin: serverTimestamp()
            }, { merge: true });
        } catch (e) {}
    }

    async recordDeath(pid, pname) {
        if (!this.firebaseReady || !db) return;
        try {
            const today = new Date().toISOString().split('T')[0];
            await setDoc(doc(db, 'game_daily_deaths', today, 'players', pid), {
                playerId: pid, playerName: pname, deaths: increment(1), lastDeath: serverTimestamp()
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
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        set('healthValue', this.health);
        set('scoreValue', this.score);
        set('ammoValue', this.ammo);
        set('boxesValue', this.boxesCollected);
        set('killsValue', this.kills);
    }

    restart() {
        this.ammoBoxes.forEach(b => this.scene.remove(b));
        this.ammoBoxes = [];
        this.spawnInitialAmmoBoxes(30);
        this.health = 100; this.score = 0; this.kills = 0; this.ammo = 30; this.boxesCollected = 0;
        this.gameActive = true;
        this.camera.position.set(0, 1.8, 15);
        this.lookYaw = 0; this.lookPitch = 0;
        this.insideBuilding = false; this.currentBuilding = null; this.nearbyDoor = null;

        if (this.firebaseReady && this.playerRef) {
            updateDoc(this.playerRef, {
                health: this.health, ammo: this.ammo, kills: this.kills, alive: true,
                position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z }
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

    // ============ MAIN LOOP ============
    animate() {
        requestAnimationFrame(() => this.animate());
        const now = Date.now();
        const dt = Math.min(0.1, (now - this.lastUpdateTime) / 1000);
        this.lastUpdateTime = now;

        if (this.gameActive) {
            this.camera.rotation.y = this.lookYaw;
            this.camera.rotation.x = this.lookPitch;

            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            forward.y = 0; forward.normalize();
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
            right.y = 0; right.normalize();

            const moveDelta = new THREE.Vector3();
            if (Math.abs(this.moveY) > 0.05) moveDelta.addScaledVector(forward, this.moveY * this.moveSpeed);
            if (Math.abs(this.moveX) > 0.05) moveDelta.addScaledVector(right, this.moveX * this.moveSpeed);

            if (moveDelta.length() > 0.01) {
                this.footstepTime += 0.15;
                this.bobAmount = Math.sin(this.footstepTime) * 0.02;
            } else this.bobAmount *= 0.9;

            this.camera.position.add(moveDelta);
            this.camera.position.y = 1.8 + Math.abs(this.bobAmount);
            this.camera.position.x = Math.max(-60, Math.min(60, this.camera.position.x));
            this.camera.position.z = Math.max(-60, Math.min(60, this.camera.position.z));

            if (this.insideBuilding && this.currentBuilding) {
                const i = this.currentBuilding.interior;
                this.camera.position.x = Math.max(i.minX + 0.5, Math.min(i.maxX - 0.5, this.camera.position.x));
                this.camera.position.z = Math.max(i.minZ + 0.5, Math.min(i.maxZ - 0.5, this.camera.position.z));
            }

            // Update other players
            const mySpeed = Math.hypot(this.moveX, this.moveY);
            this.otherPlayers.forEach((p, pid) => {
                // Interpolate position
                if (p.targetPosition) p.group.position.lerp(p.targetPosition, 0.35);

                // Interpolate rotation
                if (p.targetRotation !== undefined) {
                    let diff = p.targetRotation - p.group.rotation.y;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    p.group.rotation.y += diff * 0.25;
                }

                // Animation state
                if (p.mixer) {
                    const d = p.data;
                    const isMoving = d.isMoving || false;
                    const isShooting = d.isShooting || false;
                    const anim = this.chooseAnimation(p, {
                        isMoving,
                        isRunning: isMoving,
                        isShooting,
                        isDead: p.isDead
                    });
                    this.playAnim(p, anim, { loop: anim !== 'Death', clamp: anim === 'Death', fade: 0.2 });
                    p.mixer.update(dt);
                }

                // Death removal
                if (p.isDead && now - p.deathPlayedAt > 2500) {
                    this.removePlayer(pid);
                    return;
                }

                // Name tag / health bar position
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

            // Animate ammo boxes
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
    try {
        window.game = new Game();
    } catch (e) {
        console.error('Game start failed:', e);
    }
};

// Styles
if (!document.getElementById('game-anim-styles')) {
    const s = document.createElement('style');
    s.id = 'game-anim-styles';
    s.textContent = `
        @keyframes hitMarker { 0% { transform: translate(-50%,-50%) scale(0.5); opacity:1; } 100% { transform: translate(-50%,-50%) scale(2); opacity:0; } }
    `;
    document.head.appendChild(s);
}

