import * as THREE from 'three';
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
    getDocs,
    where,
    Timestamp,
    increment,
    arrayUnion,
    arrayRemove,
    serverTimestamp,
    addDoc
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

// Initialize Firebase
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log('Firebase initialized for multiplayer');
} catch (error) {
    console.error('Firebase initialization error:', error);
}

// Gun sound
function playGunSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => createGunSound(audioCtx));
        } else {
            createGunSound(audioCtx);
        }
    } catch (e) {
        console.log('Audio not supported');
    }
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
        console.log('🎮 MULTIPLAYER BATTLE ROYALE - FREE FIRE STYLE');
        
        // Firebase references
        this.currentUser = null;
        this.playerId = null;
        this.playerName = 'Player_' + Math.floor(Math.random() * 10000);
        this.playerRef = null;
        this.playersCollection = null;
        this.killsCollection = null;
        this.unsubscribePlayers = null;
        this.heartbeatInterval = null;
        this.firebaseReady = false;
        
        // Player meshes dictionary
        this.otherPlayers = new Map();
        
        // Interpolation for smooth movement
        this.playerPositions = new Map();
        this.lastUpdateTime = Date.now();
        
        // Initialize ALL arrays
        this.buildings = [];
        this.doors = [];
        this.containers = []; // 100+ containers
        this.oilBunkers = []; // Oil bunkers
        this.ammoBoxes = [];
        this.bullets = [];
        this.trees = [];
        
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 80, 250); // Increased fog distance
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1.8, 15);
        this.camera.rotation.order = 'YXZ';
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.shadowMap.bias = 0.0001;
        
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.appendChild(this.renderer.domElement);
        } else {
            document.body.appendChild(this.renderer.domElement);
        }
        
        // Game state - 3-shot kill system (33 damage per shot)
        this.health = 100;
        this.maxHealth = 100;
        this.damagePerShot = 33;
        this.score = 0;
        this.kills = 0;
        this.ammo = 30;
        this.maxAmmo = 30;
        this.boxesCollected = 0;
        this.gameActive = false;
        
        // Kill feed
        this.killMessages = [];
        this.setupKillFeed();
        
        // Last damage info
        this.lastDamagedBy = null;
        this.lastDamageTime = 0;
        
        // Realistic movement
        this.moveX = 0; 
        this.moveY = 0;
        this.moveSpeed = 0.15;
        this.bobAmount = 0;
        this.bobSpeed = 0;
        this.footstepTime = 0;
        
        // Look
        this.lookYaw = 0; 
        this.lookPitch = 0;
        this.touchSensitivity = 0.006;
        
        // Building entry
        this.nearbyDoor = null;
        this.insideBuilding = false;
        this.currentBuilding = null;
        this.playerHeight = 1.8;
        
        // Joystick
        this.joystickActive = false;
        this.joystickTouchId = null;
        this.joystickMaxMove = 40;
        this.joystickThumb = document.getElementById('joystickThumb');
        this.joystickContainer = document.getElementById('joystickContainer');
        
        // Swipe
        this.swipeTouchId = null;
        this.lastSwipeX = 0; 
        this.lastSwipeY = 0;
        
        // Setup UI elements
        this.setupUIElements();
        
        // Setup everything
        this.setupLighting();
        this.setupGround();
        this.createRealisticBuildings();
        this.createContainers(120); // 120+ containers scattered
        this.createOilBunkers(15); // 15 oil bunkers
        this.createSimpleEnvironment();
        this.spawnInitialAmmoBoxes(30);
        
        this.setupControls();
        this.setupMinimap();
        
        // Door check interval
        setInterval(() => this.checkNearbyDoors(), 200);
        
        // Set up auth state listener
        this.setupAuthListener();
        
        this.animate();
        
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    setupAuthListener() {
        console.log('Setting up auth listener...');
        
        onAuthStateChanged(auth, (user) => {
            console.log('🔐 Auth state changed:', user ? 'User logged in' : 'No user');
            this.currentUser = user;
            
            if (user) {
                this.playerId = user.uid;
                
                try {
                    const userProfile = localStorage.getItem('currentUserProfile');
                    if (userProfile) {
                        const profile = JSON.parse(userProfile);
                        this.playerName = profile.name || this.playerName;
                    }
                } catch (e) {}
                
                console.log('✅ Player authenticated:', this.playerId, 'Name:', this.playerName);
                this.firebaseReady = true;
                
                this.setupFirebase();
                
                this.showNotification(`Welcome ${this.playerName}!`, 'success');
            } else {
                console.log('Playing in offline mode - no user logged in');
                this.firebaseReady = false;
                this.showNotification('Playing offline - login to play multiplayer', 'info');
            }
        }, (error) => {
            console.error('Auth error:', error);
            this.firebaseReady = false;
            this.showNotification('Auth failed - playing offline', 'error');
        });
    }
    
    setupFirebase() {
        if (!this.firebaseReady || !db) return;
        
        try {
            this.playersCollection = collection(db, 'game_players');
            this.killsCollection = collection(db, 'game_kills');
            this.playerRef = doc(this.playersCollection, this.playerId);
            
            const playerData = {
                id: this.playerId,
                name: this.playerName,
                position: {
                    x: this.camera.position.x,
                    y: this.camera.position.y,
                    z: this.camera.position.z
                },
                rotation: {
                    y: this.lookYaw,
                    x: this.lookPitch
                },
                health: this.health,
                ammo: this.ammo,
                kills: 0,
                alive: true,
                lastUpdate: serverTimestamp(),
                joinedAt: serverTimestamp()
            };
            
            setDoc(this.playerRef, playerData).catch(error => {
                console.error('Error adding player:', error);
                this.firebaseReady = false;
            });
            
            this.unsubscribePlayers = onSnapshot(this.playersCollection, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    const playerData = change.doc.data();
                    
                    if (playerData.id === this.playerId) return;
                    
                    if (change.type === 'added' || change.type === 'modified') {
                        if (playerData.alive) {
                            this.updateOrAddPlayer(playerData);
                        } else {
                            this.removePlayer(playerData.id);
                        }
                    } else if (change.type === 'removed') {
                        this.removePlayer(playerData.id);
                    }
                });
            }, (error) => {
                console.error('Player listener error:', error);
            });
            
            if (this.killsCollection) {
                const killsQuery = query(this.killsCollection, orderBy('timestamp', 'desc'), limit(20));
                onSnapshot(killsQuery, (snapshot) => {
                    snapshot.docChanges().forEach((change) => {
                        if (change.type === 'added') {
                            const killData = change.doc.data();
                            this.addKillToFeed(killData);
                        }
                    });
                }, (error) => {
                    console.error('Kill listener error:', error);
                });
            }
            
            this.heartbeatInterval = setInterval(() => {
                if (this.gameActive && this.playerId && this.playerRef && this.firebaseReady) {
                    updateDoc(this.playerRef, {
                        position: {
                            x: this.camera.position.x,
                            y: this.camera.position.y,
                            z: this.camera.position.z
                        },
                        rotation: {
                            y: this.lookYaw,
                            x: this.lookPitch
                        },
                        health: this.health,
                        ammo: this.ammo,
                        lastUpdate: serverTimestamp()
                    }).catch(error => {
                        console.error('Heartbeat error:', error);
                    });
                }
            }, 50);
            
            onSnapshot(collection(db, 'game_hits'), (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const hitData = change.doc.data();
                        if (hitData.targetId === this.playerId && this.gameActive) {
                            this.takeDamage(hitData.damage, hitData.shooterId, hitData.shooterName);
                        }
                    }
                });
            }, (error) => {
                console.log('Hit listener error:', error);
            });
            
        } catch (error) {
            console.error('Error setting up Firebase:', error);
            this.firebaseReady = false;
        }
    }
    
    setupKillFeed() {
        if (!document.getElementById('killFeed')) {
            const killFeed = document.createElement('div');
            killFeed.id = 'killFeed';
            killFeed.style.cssText = `
                position: fixed;
                top: 80px;
                right: 10px;
                width: 250px;
                z-index: 1000;
                pointer-events: none;
            `;
            document.body.appendChild(killFeed);
        }
        this.killFeedElement = document.getElementById('killFeed');
    }
    
    setupUIElements() {
        const requiredElements = ['healthValue', 'scoreValue', 'ammoValue', 'boxesValue', 'killsValue'];
        requiredElements.forEach(id => {
            if (!document.getElementById(id)) {
                const el = document.createElement('span');
                el.id = id;
                el.style.display = 'none';
                document.body.appendChild(el);
            }
        });
    }
    
    createRealisticPlayer(color = 0x3366ff, playerName = 'Player') {
        const group = new THREE.Group();
        
        // Position group on ground (y=0 is ground)
        group.position.y = 0;
        
        // === BODY (Torso) ===
        const torsoGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.0, 8);
        const torsoMat = new THREE.MeshStandardMaterial({ 
            color: color, 
            emissive: 0x111111,
            roughness: 0.6,
            metalness: 0.1
        });
        const torso = new THREE.Mesh(torsoGeo, torsoMat);
        torso.position.y = 0.9;
        torso.castShadow = true;
        torso.receiveShadow = true;
        group.add(torso);
        
        // Chest armor/vest
        const vestGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.4, 8);
        const vestMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.3 });
        const vest = new THREE.Mesh(vestGeo, vestMat);
        vest.position.y = 1.1;
        vest.castShadow = true;
        vest.receiveShadow = true;
        group.add(vest);
        
        // === HEAD ===
        const headGeo = new THREE.SphereGeometry(0.25, 16, 16);
        const headMat = new THREE.MeshStandardMaterial({ 
            color: 0xffccaa, 
            emissive: 0x221100,
            roughness: 0.3
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.7;
        head.castShadow = true;
        head.receiveShadow = true;
        group.add(head);
        
        // Hair
        const hairGeo = new THREE.SphereGeometry(0.26, 8);
        const hairMat = new THREE.MeshStandardMaterial({ color: 0x332211 });
        const hair = new THREE.Mesh(hairGeo, hairMat);
        hair.position.y = 1.85;
        hair.scale.set(1, 0.3, 1);
        hair.castShadow = true;
        group.add(hair);
        
        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.05, 8);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const pupilGeo = new THREE.SphereGeometry(0.025, 4);
        const pupilMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.1, 1.75, 0.22);
        group.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.1, 1.75, 0.22);
        group.add(rightEye);
        
        const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        leftPupil.position.set(-0.1, 1.75, 0.27);
        group.add(leftPupil);
        
        const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
        rightPupil.position.set(0.1, 1.75, 0.27);
        group.add(rightPupil);
        
        // Cap/Helmet
        const capGeo = new THREE.ConeGeometry(0.22, 0.15, 8);
        const capMat = new THREE.MeshStandardMaterial({ color: color });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = 1.92;
        cap.rotation.x = 0.1;
        cap.castShadow = true;
        group.add(cap);
        
        // Cap visor
        const visorGeo = new THREE.BoxGeometry(0.15, 0.05, 0.1);
        const visorMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 1.88, 0.15);
        visor.castShadow = true;
        group.add(visor);
        
        // === ARMS ===
        const armGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.9, 6);
        const armMat = new THREE.MeshStandardMaterial({ color: color });
        
        // Left arm
        const leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.set(-0.45, 1.2, 0);
        leftArm.rotation.z = 0.2;
        leftArm.rotation.x = 0.1;
        leftArm.castShadow = true;
        leftArm.receiveShadow = true;
        group.add(leftArm);
        
        // Right arm
        const rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.set(0.45, 1.2, 0);
        rightArm.rotation.z = -0.2;
        rightArm.rotation.x = -0.1;
        rightArm.castShadow = true;
        rightArm.receiveShadow = true;
        group.add(rightArm);
        
        // Hands
        const handGeo = new THREE.SphereGeometry(0.1, 4);
        const handMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
        
        const leftHand = new THREE.Mesh(handGeo, handMat);
        leftHand.position.set(-0.65, 0.8, 0.1);
        leftHand.castShadow = true;
        group.add(leftHand);
        
        const rightHand = new THREE.Mesh(handGeo, handMat);
        rightHand.position.set(0.65, 0.8, -0.1);
        rightHand.castShadow = true;
        group.add(rightHand);
        
        // === LEGS ===
        const legGeo = new THREE.CylinderGeometry(0.15, 0.13, 0.9, 6);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        
        // Left leg
        const leftLeg = new THREE.Mesh(legGeo, legMat);
        leftLeg.position.set(-0.15, 0.45, 0);
        leftLeg.castShadow = true;
        leftLeg.receiveShadow = true;
        group.add(leftLeg);
        
        // Right leg
        const rightLeg = new THREE.Mesh(legGeo, legMat);
        rightLeg.position.set(0.15, 0.45, 0);
        rightLeg.castShadow = true;
        rightLeg.receiveShadow = true;
        group.add(rightLeg);
        
        // Shoes
        const shoeGeo = new THREE.BoxGeometry(0.2, 0.15, 0.3);
        const shoeMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        
        const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
        leftShoe.position.set(-0.15, 0.05, 0.05);
        leftShoe.castShadow = true;
        group.add(leftShoe);
        
        const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
        rightShoe.position.set(0.15, 0.05, 0.05);
        rightShoe.castShadow = true;
        group.add(rightShoe);
        
        // === ACCESSORIES ===
        
        // Backpack
        const backpackGeo = new THREE.BoxGeometry(0.4, 0.5, 0.2);
        const backpackMat = new THREE.MeshStandardMaterial({ color: 0x884422 });
        const backpack = new THREE.Mesh(backpackGeo, backpackMat);
        backpack.position.set(0, 1.0, -0.3);
        backpack.castShadow = true;
        backpack.receiveShadow = true;
        group.add(backpack);
        
        // Weapon (rifle) on back
        const rifleGeo = new THREE.BoxGeometry(0.1, 0.1, 0.6);
        const rifleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const rifle = new THREE.Mesh(rifleGeo, rifleMat);
        rifle.position.set(0.2, 1.1, -0.2);
        rifle.rotation.y = 0.3;
        rifle.castShadow = true;
        group.add(rifle);
        
        // Magazine
        const magGeo = new THREE.BoxGeometry(0.08, 0.15, 0.08);
        const magMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
        const mag = new THREE.Mesh(magGeo, magMat);
        mag.position.set(0.2, 1.0, -0.1);
        mag.castShadow = true;
        group.add(mag);
        
        // Belt
        const beltGeo = new THREE.TorusGeometry(0.3, 0.03, 4, 16, Math.PI);
        const beltMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const belt = new THREE.Mesh(beltGeo, beltMat);
        belt.position.y = 0.7;
        belt.rotation.x = Math.PI/2;
        belt.rotation.z = Math.PI/2;
        belt.scale.set(1, 1, 0.5);
        belt.castShadow = true;
        group.add(belt);
        
        // Pouches on belt
        const pouchGeo = new THREE.BoxGeometry(0.15, 0.1, 0.1);
        const pouchMat = new THREE.MeshStandardMaterial({ color: 0x5D3A1A });
        
        const pouch1 = new THREE.Mesh(pouchGeo, pouchMat);
        pouch1.position.set(-0.2, 0.65, 0.15);
        pouch1.castShadow = true;
        group.add(pouch1);
        
        const pouch2 = new THREE.Mesh(pouchGeo, pouchMat);
        pouch2.position.set(0.2, 0.65, 0.15);
        pouch2.castShadow = true;
        group.add(pouch2);
        
        // Name tag (HTML element)
        const nameTagDiv = document.createElement('div');
        nameTagDiv.className = 'player-name-tag';
        nameTagDiv.textContent = playerName;
        nameTagDiv.style.cssText = `
            position: absolute;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-family: 'Arial', sans-serif;
            font-weight: bold;
            pointer-events: none;
            transform: translate(-50%, -50%);
            white-space: nowrap;
            border: 2px solid ${this.rgbToHex(color)};
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            z-index: 1000;
            text-shadow: 1px 1px 2px black;
        `;
        document.body.appendChild(nameTagDiv);
        
        // Health bar
        const healthBarDiv = document.createElement('div');
        healthBarDiv.className = 'player-health-bar';
        healthBarDiv.style.cssText = `
            position: absolute;
            width: 50px;
            height: 8px;
            background: rgba(0,0,0,0.7);
            border-radius: 4px;
            transform: translate(-50%, -50%);
            overflow: hidden;
            border: 1px solid white;
            z-index: 1000;
        `;
        const healthFill = document.createElement('div');
        healthFill.className = 'health-fill';
        healthFill.style.cssText = `
            height: 100%;
            width: 100%;
            background: linear-gradient(90deg, #00ff00, #33ff33);
            transition: width 0.2s;
        `;
        healthBarDiv.appendChild(healthFill);
        document.body.appendChild(healthBarDiv);
        
        return {
            mesh: group,
            nameTag: nameTagDiv,
            healthBar: healthBarDiv,
            healthFill: healthFill
        };
    }
    
    rgbToHex(color) {
        return '#' + color.toString(16).padStart(6, '0');
    }
    
    updateOrAddPlayer(playerData) {
        let playerObj = this.otherPlayers.get(playerData.id);
        
        if (!playerObj) {
            const newPlayer = this.createRealisticPlayer(
                this.getPlayerColor(playerData.id),
                playerData.name || 'Player'
            );
            
            playerObj = {
                mesh: newPlayer.mesh,
                nameTag: newPlayer.nameTag,
                healthBar: newPlayer.healthBar,
                healthFill: newPlayer.healthFill,
                data: playerData,
                targetPosition: playerData.position ? new THREE.Vector3(
                    playerData.position.x,
                    0, // Ground level - mesh already has internal Y positioning
                    playerData.position.z
                ) : new THREE.Vector3(0, 0, 0),
                targetRotation: playerData.rotation ? playerData.rotation.y : 0
            };
            
            this.scene.add(playerObj.mesh);
            this.otherPlayers.set(playerData.id, playerObj);
        }
        
        // Store target positions for smooth interpolation
        if (playerData.position) {
            playerObj.targetPosition = new THREE.Vector3(
                playerData.position.x,
                0, // Ground level - important: mesh Y is handled internally
                playerData.position.z
            );
        }
        
        if (playerData.rotation) {
            playerObj.targetRotation = playerData.rotation.y;
        }
        
        // Update health bar immediately
        if (playerData.health !== undefined) {
            const healthPercent = Math.max(0, playerData.health) / 100;
            playerObj.healthFill.style.width = `${healthPercent * 100}%`;
            
            if (healthPercent > 0.6) {
                playerObj.healthFill.style.background = 'linear-gradient(90deg, #00ff00, #33ff33)';
            } else if (healthPercent > 0.3) {
                playerObj.healthFill.style.background = 'linear-gradient(90deg, #ffff00, #ffaa00)';
            } else {
                playerObj.healthFill.style.background = 'linear-gradient(90deg, #ff0000, #ff3333)';
            }
        }
        
        playerObj.data = playerData;
    }
    
    removePlayer(playerId) {
        const playerObj = this.otherPlayers.get(playerId);
        if (playerObj) {
            this.scene.remove(playerObj.mesh);
            if (playerObj.nameTag && playerObj.nameTag.parentNode) {
                playerObj.nameTag.remove();
            }
            if (playerObj.healthBar && playerObj.healthBar.parentNode) {
                playerObj.healthBar.remove();
            }
            this.otherPlayers.delete(playerId);
        }
    }
    
    getPlayerColor(playerId) {
        let hash = 0;
        for (let i = 0; i < playerId.length; i++) {
            hash = ((hash << 5) - hash) + playerId.charCodeAt(i);
            hash |= 0;
        }
        // Bright, game-like colors
        const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff, 0xff8844, 0x8844ff, 0xff66aa, 0x66ffaa];
        return colors[Math.abs(hash) % colors.length];
    }
    
    addKillToFeed(killData) {
        const killMessage = {
            killer: killData.killerName || 'Unknown',
            victim: killData.victimName || 'Unknown',
            time: Date.now()
        };
        
        this.killMessages.unshift(killMessage);
        if (this.killMessages.length > 5) {
            this.killMessages.pop();
        }
        
        this.updateKillFeed();
        
        if (killData.victimId === this.playerId) {
            this.showNotification(`You were killed by ${killData.killerName}`, 'error');
        } else if (killData.killerId === this.playerId) {
            this.showNotification(`You killed ${killData.victimName}! +100 XP`, 'success');
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
            item.style.cssText = `
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 6px 12px;
                margin-bottom: 5px;
                border-radius: 20px;
                font-size: 13px;
                font-weight: bold;
                border-left: 4px solid #ff4444;
                animation: slideIn 0.3s ease;
                box-shadow: 0 2px 10px rgba(0,0,0,0.5);
                text-align: center;
            `;
            item.innerHTML = `<span style="color: #ffaa00;">${msg.killer}</span> 🔫 <span style="color: #ff4444;">${msg.victim}</span>`;
            this.killFeedElement.appendChild(item);
        });
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : '#4444ff'};
            color: white;
            padding: 12px 24px;
            border-radius: 30px;
            font-family: 'Arial', sans-serif;
            font-size: 16px;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            animation: fadeInOut 3s ease;
            text-shadow: 1px 1px 2px black;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0x404060);
        this.scene.add(ambient);
        
        // Main sunlight
        const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
        sun.position.set(30, 50, 30);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 150;
        sun.shadow.camera.left = -50;
        sun.shadow.camera.right = 50;
        sun.shadow.camera.top = 50;
        sun.shadow.camera.bottom = -50;
        this.scene.add(sun);
        
        // Fill light
        const fill = new THREE.DirectionalLight(0x88aacc, 0.6);
        fill.position.set(-30, 20, -40);
        this.scene.add(fill);
        
        // Point lights for ambiance
        const pointLight1 = new THREE.PointLight(0xffaa00, 0.5, 80);
        pointLight1.position.set(20, 10, 20);
        this.scene.add(pointLight1);
        
        const pointLight2 = new THREE.PointLight(0x44aaff, 0.5, 80);
        pointLight2.position.set(-20, 10, -20);
        this.scene.add(pointLight2);
        
        // Add some colored lights near containers
        for (let i = 0; i < 5; i++) {
            const color = new THREE.Color().setHSL(Math.random(), 0.8, 0.5);
            const light = new THREE.PointLight(color, 0.3, 50);
            light.position.set((Math.random()-0.5)*80, 5, (Math.random()-0.5)*80);
            this.scene.add(light);
        }
    }
    
    setupGround() {
        // Base ground
        const groundGeo = new THREE.CircleGeometry(150, 128);
        const groundMat = new THREE.MeshStandardMaterial({ 
            color: 0x3a7e3a, 
            roughness: 0.8,
            emissive: 0x112211
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // Add grass patches
        for (let i = 0; i < 200; i++) {
            const patchGeo = new THREE.CircleGeometry(0.8 + Math.random()*1.5, 5);
            const patchMat = new THREE.MeshStandardMaterial({ color: 0x4a8e4a });
            const patch = new THREE.Mesh(patchGeo, patchMat);
            patch.rotation.x = -Math.PI / 2;
            patch.position.set((Math.random()-0.5)*140, 0.01, (Math.random()-0.5)*140);
            patch.receiveShadow = true;
            this.scene.add(patch);
        }
        
        // Paths and dirt patches
        for (let i = 0; i < 50; i++) {
            const path = new THREE.Mesh(
                new THREE.PlaneGeometry(5 + Math.random()*10, 5 + Math.random()*10),
                new THREE.MeshStandardMaterial({ color: 0x6b4c3b })
            );
            path.rotation.x = -Math.PI/2;
            path.position.set((Math.random()-0.5)*120, 0.02, (Math.random()-0.5)*120);
            path.receiveShadow = true;
            this.scene.add(path);
        }
        
        // Add some rocks
        for (let i = 0; i < 30; i++) {
            const rockGeo = new THREE.DodecahedronGeometry(0.3 + Math.random()*0.5);
            const rockMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
            const rock = new THREE.Mesh(rockGeo, rockMat);
            rock.position.set((Math.random()-0.5)*120, 0.2, (Math.random()-0.5)*120);
            rock.castShadow = true;
            rock.receiveShadow = true;
            this.scene.add(rock);
        }
    }
    
    createRealisticBuildings() {
        const colors = [0x8B4513, 0x5D3A1A, 0xA0522D];
        
        const positions = [
            {x: -15, z: -15}, {x: 15, z: -15}, {x: -15, z: 15}, {x: 15, z: 15},
            {x: -25, z: 0}, {x: 25, z: 0}, {x: 0, z: -25}, {x: 0, z: 25},
            {x: -35, z: -35}, {x: 35, z: 35}, {x: -35, z: 35}, {x: 35, z: -35}
        ];
        
        positions.forEach((pos, index) => {
            const width = 8 + Math.random() * 4;
            const depth = 8 + Math.random() * 4;
            const height = 6 + Math.random() * 4;
            const color = colors[index % colors.length];
            
            this.createDetailedBuilding(pos.x, pos.z, width, depth, height, color);
        });
    }
    
    createDetailedBuilding(x, z, w, d, h, color) {
        const group = new THREE.Group();
        const wallThick = 0.5;
        
        const mainMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
        const trimMat = new THREE.MeshStandardMaterial({ color: 0x884422, roughness: 0.5 });
        
        // Back wall
        const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, wallThick),
            mainMat
        );
        backWall.position.set(0, h/2, -d/2 + wallThick/2);
        backWall.castShadow = true; 
        backWall.receiveShadow = true;
        group.add(backWall);
        
        // Left wall
        const leftWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThick, h, d),
            mainMat
        );
        leftWall.position.set(-w/2 + wallThick/2, h/2, 0);
        leftWall.castShadow = true; 
        leftWall.receiveShadow = true;
        group.add(leftWall);
        
        // Right wall
        const rightWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThick, h, d),
            mainMat
        );
        rightWall.position.set(w/2 - wallThick/2, h/2, 0);
        rightWall.castShadow = true; 
        rightWall.receiveShadow = true;
        group.add(rightWall);
        
        // Front wall with door
        const doorWidth = 2.0;
        const doorHeight = 2.5;
        
        // Left part
        const frontLeft = new THREE.Mesh(
            new THREE.BoxGeometry((w - doorWidth)/2, h, wallThick),
            mainMat
        );
        frontLeft.position.set(-(w + doorWidth)/4, h/2, d/2 - wallThick/2);
        frontLeft.castShadow = true; 
        frontLeft.receiveShadow = true;
        group.add(frontLeft);
        
        // Right part
        const frontRight = new THREE.Mesh(
            new THREE.BoxGeometry((w - doorWidth)/2, h, wallThick),
            mainMat
        );
        frontRight.position.set((w + doorWidth)/4, h/2, d/2 - wallThick/2);
        frontRight.castShadow = true; 
        frontRight.receiveShadow = true;
        group.add(frontRight);
        
        // Top part above door
        const topDoor = new THREE.Mesh(
            new THREE.BoxGeometry(doorWidth, h - doorHeight, wallThick),
            mainMat
        );
        topDoor.position.set(0, h - (h - doorHeight)/2, d/2 - wallThick/2);
        topDoor.castShadow = true; 
        topDoor.receiveShadow = true;
        group.add(topDoor);
        
        // Door frame
        const doorFrame = new THREE.Mesh(
            new THREE.BoxGeometry(doorWidth + 0.2, doorHeight + 0.2, 0.3),
            trimMat
        );
        doorFrame.position.set(0, doorHeight/2, d/2 - 0.1);
        doorFrame.castShadow = true; 
        doorFrame.receiveShadow = true;
        group.add(doorFrame);
        
        // Door
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(doorWidth - 0.2, doorHeight - 0.2, 0.2),
            new THREE.MeshStandardMaterial({ color: 0x8B5A2B })
        );
        door.position.set(0, doorHeight/2, d/2);
        door.castShadow = true; 
        door.receiveShadow = true;
        group.add(door);
        
        // Windows
        for (let i = 0; i < 4; i++) {
            const windowMat = new THREE.MeshStandardMaterial({ color: 0x87CEEB, emissive: 0x112233 });
            const windowFrame = new THREE.Mesh(
                new THREE.BoxGeometry(1.2, 1.2, 0.2),
                trimMat
            );
            windowFrame.position.set(-2 + i*1.5, 3, d/2 - 0.2);
            windowFrame.castShadow = true;
            group.add(windowFrame);
            
            const windowGlass = new THREE.Mesh(
                new THREE.BoxGeometry(1.0, 1.0, 0.1),
                windowMat
            );
            windowGlass.position.set(-2 + i*1.5, 3, d/2 - 0.1);
            windowGlass.castShadow = true;
            group.add(windowGlass);
        }
        
        // Roof
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(Math.max(w, d) * 0.7, 2.5, 4),
            new THREE.MeshStandardMaterial({ color: 0x884422 })
        );
        roof.position.set(0, h + 1.25, 0);
        roof.rotation.y = Math.PI/4;
        roof.castShadow = true; 
        roof.receiveShadow = true;
        group.add(roof);
        
        // Chimney
        const chimney = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 2.5, 0.8),
            new THREE.MeshStandardMaterial({ color: 0x8B4513 })
        );
        chimney.position.set(2, h + 1.5, 1.5);
        chimney.castShadow = true;
        group.add(chimney);
        
        // Steps
        const stepGroup = new THREE.Group();
        for (let s = 0; s < 3; s++) {
            const step = new THREE.Mesh(
                new THREE.BoxGeometry(2.2 - s*0.2, 0.2, 1.0),
                new THREE.MeshStandardMaterial({ color: 0xcccccc })
            );
            step.position.set(0, 0.1 + s * 0.3, 3.5 - s * 0.2);
            step.castShadow = true; 
            step.receiveShadow = true;
            stepGroup.add(step);
        }
        stepGroup.position.set(0, 0, 0);
        group.add(stepGroup);
        
        // Interior floor
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(w - 1.5, d - 1.5),
            new THREE.MeshStandardMaterial({ color: 0x5a3a1a, side: THREE.DoubleSide })
        );
        floor.rotation.x = -Math.PI/2;
        floor.position.set(0, 0.05, 0);
        floor.receiveShadow = true;
        group.add(floor);
        
        group.position.set(x, 0, z);
        this.scene.add(group);
        
        this.buildings.push({
            mesh: group,
            doorPos: new THREE.Vector3(x, 1.2, z + d/2),
            interior: {
                minX: x - w/2 + wallThick,
                maxX: x + w/2 - wallThick,
                minZ: z - d/2 + wallThick,
                maxZ: z + d/2 - wallThick,
                minY: 0,
                maxY: h
            }
        });
    }
    
    createContainers(count) {
        const colors = [0x3366cc, 0xcc3333, 0x33cc33, 0xcccc33, 0xcc33cc, 0x888888];
        
        for (let i = 0; i < count; i++) {
            const containerGroup = new THREE.Group();
            
            const width = 2.5 + Math.random() * 1.5;
            const height = 2.5 + Math.random() * 1;
            const depth = 6 + Math.random() * 2;
            
            const color = colors[Math.floor(Math.random() * colors.length)];
            const mainMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.6 });
            const trimMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.5 });
            
            // Main container body
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(width, height, depth),
                mainMat
            );
            body.position.y = height/2;
            body.castShadow = true;
            body.receiveShadow = true;
            containerGroup.add(body);
            
            // Corner reinforcements
            const cornerGeo = new THREE.BoxGeometry(0.2, height, 0.2);
            const positions = [
                [-width/2, height/2, -depth/2],
                [width/2, height/2, -depth/2],
                [-width/2, height/2, depth/2],
                [width/2, height/2, depth/2]
            ];
            
            positions.forEach(pos => {
                const corner = new THREE.Mesh(cornerGeo, trimMat);
                corner.position.set(pos[0], pos[1], pos[2]);
                corner.castShadow = true;
                containerGroup.add(corner);
            });
            
            // Container doors (on one side)
            const doorMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7 });
            
            for (let d = 0; d < 2; d++) {
                const door = new THREE.Mesh(
                    new THREE.BoxGeometry(width * 0.4, height * 0.8, 0.1),
                    doorMat
                );
                door.position.set((d === 0 ? -width*0.25 : width*0.25), height*0.5, depth/2 + 0.05);
                door.castShadow = true;
                containerGroup.add(door);
            }
            
            // Roof of container (if stacked)
            if (Math.random() > 0.7) {
                const roof = new THREE.Mesh(
                    new THREE.BoxGeometry(width + 0.1, 0.1, depth + 0.1),
                    new THREE.MeshStandardMaterial({ color: 0x888888 })
                );
                roof.position.y = height;
                roof.castShadow = true;
                containerGroup.add(roof);
            }
            
            // Add some containers stacked
            if (Math.random() > 0.8) {
                const secondContainer = new THREE.Mesh(
                    new THREE.BoxGeometry(width * 0.9, height * 0.9, depth * 0.9),
                    mainMat
                );
                secondContainer.position.y = height + height * 0.45;
                secondContainer.castShadow = true;
                secondContainer.receiveShadow = true;
                containerGroup.add(secondContainer);
            }
            
            // Random rotation
            containerGroup.rotation.y = Math.random() * Math.PI * 2;
            
            // Random position, avoid buildings
            let placed = false;
            let attempts = 0;
            
            while (!placed && attempts < 50) {
                const x = (Math.random() - 0.5) * 140;
                const z = (Math.random() - 0.5) * 140;
                
                // Check distance from buildings
                let tooClose = false;
                for (let b of this.buildings) {
                    if (Math.sqrt((x - b.mesh.position.x)**2 + (z - b.mesh.position.z)**2) < 10) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    containerGroup.position.set(x, 0, z);
                    placed = true;
                }
                attempts++;
            }
            
            if (placed) {
                this.scene.add(containerGroup);
                this.containers.push(containerGroup);
            }
        }
        
        console.log(`Spawned ${this.containers.length} containers`);
    }
    
    createOilBunkers(count) {
        for (let i = 0; i < count; i++) {
            const bunkerGroup = new THREE.Group();
            
            // Main tank
            const tankGeo = new THREE.CylinderGeometry(3, 3, 4, 16);
            const tankMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.6 });
            const tank = new THREE.Mesh(tankGeo, tankMat);
            tank.position.y = 2;
            tank.castShadow = true;
            tank.receiveShadow = true;
            bunkerGroup.add(tank);
            
            // Dome top
            const domeGeo = new THREE.SphereGeometry(2.8, 16, 8);
            const domeMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.7 });
            const dome = new THREE.Mesh(domeGeo, domeMat);
            dome.position.y = 4;
            dome.scale.set(1, 0.3, 1);
            dome.castShadow = true;
            dome.receiveShadow = true;
            bunkerGroup.add(dome);
            
            // Base ring
            const baseGeo = new THREE.TorusGeometry(3.2, 0.3, 8, 32);
            const baseMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.8 });
            const base = new THREE.Mesh(baseGeo, baseMat);
            base.position.y = 0.2;
            base.rotation.x = Math.PI/2;
            base.castShadow = true;
            bunkerGroup.add(base);
            
            // Walkway around
            const walkwayGeo = new THREE.TorusGeometry(3.5, 0.2, 4, 32);
            const walkwayMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
            const walkway = new THREE.Mesh(walkwayGeo, walkwayMat);
            walkway.position.y = 1.5;
            walkway.rotation.x = Math.PI/2;
            walkway.castShadow = true;
            bunkerGroup.add(walkway);
            
            // Ladder
            const ladderGeo = new THREE.BoxGeometry(0.2, 3, 0.2);
            const ladderMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
            
            for (let l = 0; l < 3; l++) {
                const ladderRung = new THREE.Mesh(ladderGeo, ladderMat);
                ladderRung.position.set(3.8, 1 + l, 0);
                ladderRung.rotation.z = 0.1;
                ladderRung.castShadow = true;
                bunkerGroup.add(ladderRung);
            }
            
            // Pipes
            const pipeGeo = new THREE.CylinderGeometry(0.3, 0.3, 2);
            const pipeMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9 });
            
            for (let p = 0; p < 4; p++) {
                const angle = (p / 4) * Math.PI * 2;
                const pipe = new THREE.Mesh(pipeGeo, pipeMat);
                pipe.position.set(Math.cos(angle) * 2.5, 3, Math.sin(angle) * 2.5);
                pipe.rotation.z = 0.2;
                pipe.rotation.x = 0.3;
                pipe.castShadow = true;
                bunkerGroup.add(pipe);
            }
            
            // Warning stripes
            const stripeGeo = new THREE.TorusGeometry(3.1, 0.1, 4, 32, Math.PI);
            const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
            const stripe = new THREE.Mesh(stripeGeo, stripeMat);
            stripe.position.y = 0.8;
            stripe.rotation.x = Math.PI/2;
            stripe.rotation.z = Math.PI/4;
            stripe.castShadow = true;
            bunkerGroup.add(stripe);
            
            // Random position, avoid buildings and containers
            let placed = false;
            let attempts = 0;
            
            while (!placed && attempts < 30) {
                const x = (Math.random() - 0.5) * 120;
                const z = (Math.random() - 0.5) * 120;
                
                let tooClose = false;
                for (let b of this.buildings) {
                    if (Math.sqrt((x - b.mesh.position.x)**2 + (z - b.mesh.position.z)**2) < 15) {
                        tooClose = true;
                        break;
                    }
                }
                for (let c of this.containers) {
                    if (c && Math.sqrt((x - c.position.x)**2 + (z - c.position.z)**2) < 10) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    bunkerGroup.position.set(x, 0, z);
                    placed = true;
                }
                attempts++;
            }
            
            if (placed) {
                this.scene.add(bunkerGroup);
                this.oilBunkers.push(bunkerGroup);
            }
        }
        
        console.log(`Spawned ${this.oilBunkers.length} oil bunkers`);
    }
    
    createSimpleEnvironment() {
        // Trees
        for (let i = 0; i < 50; i++) {
            const treeGroup = new THREE.Group();
            
            // Trunk
            const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3);
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B });
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.y = 1.5;
            trunk.castShadow = true;
            trunk.receiveShadow = true;
            treeGroup.add(trunk);
            
            // Leaves
            const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a8a2a });
            
            const leaves1 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.8, 6), leafMat);
            leaves1.position.y = 3.2;
            leaves1.castShadow = true;
            leaves1.receiveShadow = true;
            treeGroup.add(leaves1);
            
            const leaves2 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.5, 6), leafMat);
            leaves2.position.y = 4.3;
            leaves2.castShadow = true;
            leaves2.receiveShadow = true;
            treeGroup.add(leaves2);
            
            const leaves3 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 6), leafMat);
            leaves3.position.y = 5.2;
            leaves3.castShadow = true;
            leaves3.receiveShadow = true;
            treeGroup.add(leaves3);
            
            // Random position
            let placed = false;
            let attempts = 0;
            
            while (!placed && attempts < 30) {
                const x = (Math.random()-0.5)*130;
                const z = (Math.random()-0.5)*130;
                
                let tooClose = false;
                for (let b of this.buildings) {
                    if (Math.sqrt((x - b.mesh.position.x)**2 + (z - b.mesh.position.z)**2) < 8) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    treeGroup.position.set(x, 0, z);
                    placed = true;
                }
                attempts++;
            }
            
            if (placed) {
                this.scene.add(treeGroup);
                this.trees.push(treeGroup);
            }
        }
        
        // Bushes
        for (let i = 0; i < 100; i++) {
            const bushGeo = new THREE.SphereGeometry(0.5 + Math.random()*0.8, 5);
            const bushMat = new THREE.MeshStandardMaterial({ color: 0x3a8a3a });
            const bush = new THREE.Mesh(bushGeo, bushMat);
            
            let placed = false;
            let attempts = 0;
            
            while (!placed && attempts < 20) {
                const x = (Math.random()-0.5)*140;
                const z = (Math.random()-0.5)*140;
                
                bush.position.set(x, 0.3, z);
                
                let tooClose = false;
                for (let b of this.buildings) {
                    if (bush.position.distanceTo(b.mesh.position) < 6) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    placed = true;
                }
                attempts++;
            }
            
            if (placed) {
                bush.castShadow = true;
                bush.receiveShadow = true;
                this.scene.add(bush);
            }
        }
    }
    
    spawnInitialAmmoBoxes(count) {
        for (let i = 0; i < count; i++) {
            const x = (Math.random()-0.5)*100;
            const z = (Math.random()-0.5)*100;
            this.spawnAmmoBox(x, 0.5, z, 5 + Math.floor(Math.random() * 10));
        }
        console.log(`Spawned ${this.ammoBoxes.length} ammo boxes`);
    }
    
    spawnAmmoBox(x, y, z, ammoAmount = 10) {
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.8, 0.8),
            new THREE.MeshStandardMaterial({ 
                color: 0xffaa00,
                emissive: 0x442200,
                transparent: true,
                opacity: 0.9
            })
        );
        box.position.set(x, y, z);
        box.castShadow = true;
        box.receiveShadow = true;
        
        // Add ammo label
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔫', 32, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        const labelMat = new THREE.SpriteMaterial({ map: texture });
        const label = new THREE.Sprite(labelMat);
        label.scale.set(0.5, 0.5, 0.5);
        label.position.set(0, 0.6, 0);
        box.add(label);
        
        // Add ammo count
        const countCanvas = document.createElement('canvas');
        countCanvas.width = 32;
        countCanvas.height = 32;
        const countCtx = countCanvas.getContext('2d');
        countCtx.fillStyle = '#ffffff';
        countCtx.font = 'bold 16px Arial';
        countCtx.textAlign = 'center';
        countCtx.textBaseline = 'middle';
        countCtx.fillText('+' + ammoAmount, 16, 16);
        
        const countTexture = new THREE.CanvasTexture(countCanvas);
        const countMat = new THREE.SpriteMaterial({ map: countTexture });
        const countLabel = new THREE.Sprite(countMat);
        countLabel.scale.set(0.4, 0.4, 0.4);
        countLabel.position.set(0, -0.6, 0);
        box.add(countLabel);
        
        // Wireframe
        const edges = new THREE.EdgesGeometry(box.geometry);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffff00 }));
        box.add(line);
        
        box.userData = {
            ammo: ammoAmount,
            type: 'ammo'
        };
        
        this.scene.add(box);
        this.ammoBoxes.push(box);
        
        return box;
    }
    
    spawnAmmoBoxOnDeath(position, ammoAmount = 15) {
        this.spawnAmmoBox(position.x, 0.5, position.z, ammoAmount);
    }
    
    checkNearbyDoors() {
        if (!this.gameActive || this.insideBuilding || !this.buildings) return;
        
        let found = null;
        let minDist = 4.0;
        
        this.buildings.forEach(b => {
            if (b && b.doorPos) {
                const dist = this.camera.position.distanceTo(b.doorPos);
                if (dist < minDist) {
                    minDist = dist;
                    found = b;
                }
            }
        });
        
        if (found !== this.nearbyDoor) {
            this.nearbyDoor = found;
            const doorIndicator = document.getElementById('doorIndicator');
            if (doorIndicator) {
                doorIndicator.style.display = found ? 'block' : 'none';
            }
        }
    }
    
    enterBuilding(building) {
        if (!building || this.insideBuilding) return;
        
        this.insideBuilding = true;
        this.currentBuilding = building;
        
        this.camera.position.set(
            building.doorPos.x,
            1.8,
            building.doorPos.z - 3
        );
        
        const doorIndicator = document.getElementById('doorIndicator');
        if (doorIndicator) {
            doorIndicator.textContent = '🏢 INSIDE - TAP SHOOT TO EXIT';
        }
    }
    
    exitBuilding() {
        if (!this.insideBuilding) return;
        
        this.insideBuilding = false;
        
        if (this.nearbyDoor) {
            this.camera.position.set(
                this.nearbyDoor.doorPos.x,
                1.8,
                this.nearbyDoor.doorPos.z + 3
            );
        }
        
        const doorIndicator = document.getElementById('doorIndicator');
        if (doorIndicator) {
            doorIndicator.textContent = '🚪 NEAR DOOR - TAP SHOOT TO ENTER';
            doorIndicator.style.display = 'none';
        }
        this.currentBuilding = null;
    }
    
    setupControls() {
        const swipeZone = document.getElementById('viewSwipeZone');
        const joystickEl = document.getElementById('joystickContainer');
        
        if (!joystickEl || !swipeZone) {
            console.warn('Control elements not found');
            return;
        }
        
        joystickEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!this.gameActive) return;
            if (this.joystickTouchId === null) {
                this.joystickTouchId = e.touches[0].identifier;
                this.joystickActive = true;
                this.updateJoystick(e.touches[0]);
            }
        });
        
        joystickEl.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.gameActive || !this.joystickActive) return;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === this.joystickTouchId) {
                    this.updateJoystick(e.touches[i]);
                    break;
                }
            }
        });
        
        joystickEl.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.joystickActive = false;
            this.joystickTouchId = null;
            this.moveX = 0; 
            this.moveY = 0;
            this.bobSpeed = 0;
            
            const speedElement = document.getElementById('movementSpeed');
            if (speedElement) {
                speedElement.textContent = '0';
            }
            
            if (this.joystickThumb) {
                this.joystickThumb.style.transform = `translate(0px, 0px)`;
            }
        });
        
        swipeZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!this.gameActive) return;
            if (this.swipeTouchId === null) {
                this.swipeTouchId = e.touches[0].identifier;
                this.lastSwipeX = e.touches[0].clientX;
                this.lastSwipeY = e.touches[0].clientY;
            }
        });
        
        swipeZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.gameActive) return;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === this.swipeTouchId) {
                    const touch = e.touches[i];
                    const deltaX = touch.clientX - this.lastSwipeX;
                    const deltaY = touch.clientY - this.lastSwipeY;
                    
                    this.lookYaw -= deltaX * this.touchSensitivity;
                    this.lookPitch -= deltaY * this.touchSensitivity;
                    this.lookPitch = Math.max(-1.0, Math.min(1.0, this.lookPitch));
                    
                    this.lastSwipeX = touch.clientX;
                    this.lastSwipeY = touch.clientY;
                    break;
                }
            }
        });
        
        swipeZone.addEventListener('touchend', (e) => { 
            e.preventDefault(); 
            this.swipeTouchId = null; 
        });
        
        const shootBtn = document.getElementById('shootBtn');
        if (shootBtn) {
            shootBtn.addEventListener('touchstart', (e) => { 
                e.preventDefault(); 
                
                if (!this.gameActive) return;
                
                if (this.insideBuilding) {
                    this.exitBuilding();
                } else if (this.nearbyDoor) {
                    this.enterBuilding(this.nearbyDoor);
                } else {
                    this.shoot();
                    playGunSound();
                }
            });
        }
        
        const reloadBtn = document.getElementById('reloadBtn');
        if (reloadBtn) {
            reloadBtn.addEventListener('touchstart', (e) => { 
                e.preventDefault(); 
                this.reload(); 
            });
        }
        
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                const instructions = document.getElementById('instructions');
                if (instructions) {
                    instructions.style.display = 'none';
                }
                this.startGame();
            });
        }
        
        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => this.restart());
        }
    }
    
    updateJoystick(touch) {
        if (!this.joystickContainer || !this.joystickThumb) return;
        
        const rect = this.joystickContainer.getBoundingClientRect();
        const centerX = rect.left + rect.width/2;
        const centerY = rect.top + rect.height/2;
        
        let deltaX = touch.clientX - centerX;
        let deltaY = touch.clientY - centerY;
        
        const distance = Math.sqrt(deltaX*deltaX + deltaY*deltaY);
        if (distance > this.joystickMaxMove) {
            deltaX = (deltaX / distance) * this.joystickMaxMove;
            deltaY = (deltaY / distance) * this.joystickMaxMove;
        }
        
        this.joystickThumb.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        
        this.moveX = deltaX / this.joystickMaxMove;
        this.moveY = -deltaY / this.joystickMaxMove;
        
        const speed = Math.sqrt(this.moveX*this.moveX + this.moveY*this.moveY);
        const speedElement = document.getElementById('movementSpeed');
        if (speedElement) {
            speedElement.textContent = speed.toFixed(1);
        }
        this.bobSpeed = speed;
    }
    
    setupMinimap() { 
        const canvas = document.getElementById('minimapCanvas');
        if (canvas) {
            this.minimapCtx = canvas.getContext('2d'); 
        }
    }
    
    updateMinimap() {
        if (!this.minimapCtx) return;
        
        const canvas = document.getElementById('minimapCanvas');
        if (!canvas) return;
        
        const ctx = this.minimapCtx;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Grid
        ctx.strokeStyle = '#334466';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= canvas.width; i += 20) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, canvas.height);
            ctx.stroke();
        }
        for (let i = 0; i <= canvas.height; i += 20) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(canvas.width, i);
            ctx.stroke();
        }
        
        // Buildings
        ctx.fillStyle = '#8B4513';
        this.buildings.forEach(b => {
            const x = (b.mesh.position.x + 75) * 1.5;
            const z = (b.mesh.position.z + 75) * 1.5;
            if (x > 0 && x < canvas.width && z > 0 && z < canvas.height) {
                ctx.fillRect(x-4, z-4, 8, 8);
            }
        });
        
        // Containers
        ctx.fillStyle = '#3366cc';
        this.containers.forEach(c => {
            if (c) {
                const x = (c.position.x + 75) * 1.5;
                const z = (c.position.z + 75) * 1.5;
                if (x > 0 && x < canvas.width && z > 0 && z < canvas.height) {
                    ctx.fillRect(x-2, z-2, 4, 4);
                }
            }
        });
        
        // Oil Bunkers
        ctx.fillStyle = '#ffaa00';
        this.oilBunkers.forEach(b => {
            if (b) {
                const x = (b.position.x + 75) * 1.5;
                const z = (b.position.z + 75) * 1.5;
                if (x > 0 && x < canvas.width && z > 0 && z < canvas.height) {
                    ctx.beginPath();
                    ctx.arc(x, z, 5, 0, 2*Math.PI);
                    ctx.fill();
                }
            }
        });
        
        // Other players
        this.otherPlayers.forEach((player) => {
            const x = (player.mesh.position.x + 75) * 1.5;
            const z = (player.mesh.position.z + 75) * 1.5;
            if (x > 0 && x < canvas.width && z > 0 && z < canvas.height) {
                ctx.fillStyle = '#ff4444';
                ctx.beginPath();
                ctx.arc(x, z, 5, 0, 2*Math.PI);
                ctx.fill();
                
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, z);
                ctx.lineTo(
                    x + Math.sin(player.mesh.rotation.y) * 12,
                    z + Math.cos(player.mesh.rotation.y) * 12
                );
                ctx.stroke();
            }
        });
        
        // Ammo boxes
        ctx.fillStyle = '#ffaa00';
        this.ammoBoxes.forEach(box => {
            const x = (box.position.x + 75) * 1.5;
            const z = (box.position.z + 75) * 1.5;
            ctx.beginPath();
            ctx.arc(x, z, 2, 0, 2*Math.PI);
            ctx.fill();
        });
        
        // Player (center)
        ctx.fillStyle = '#44ff44';
        ctx.beginPath();
        ctx.arc(canvas.width/2, canvas.height/2, 6, 0, 2*Math.PI);
        ctx.fill();
        
        // Player direction
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(canvas.width/2, canvas.height/2);
        ctx.lineTo(
            canvas.width/2 + Math.sin(this.lookYaw) * 15,
            canvas.height/2 + Math.cos(this.lookYaw) * 15
        );
        ctx.stroke();
    }
    
    startGame() {
        this.gameActive = true;
        this.health = 100; 
        this.score = 0; 
        this.kills = 0;
        this.ammo = 30; 
        this.boxesCollected = 0;
        this.camera.position.set(0, 1.8, 15);
        
        if (this.firebaseReady && this.playerRef) {
            updateDoc(this.playerRef, {
                health: this.health,
                ammo: this.ammo,
                kills: this.kills,
                alive: true,
                position: {
                    x: this.camera.position.x,
                    y: this.camera.position.y,
                    z: this.camera.position.z
                }
            }).catch(console.error);
        }
        
        this.updateUI();
        
        this.showNotification(`Online players: ${this.otherPlayers.size + 1}`, 'info');
    }
    
    shoot() {
        if (!this.gameActive || this.ammo <= 0) return;
        this.ammo--; 
        this.updateUI();
        
        if (this.firebaseReady && this.playerRef) {
            updateDoc(this.playerRef, { ammo: this.ammo }).catch(console.error);
        }
        
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const startPos = this.camera.position.clone();
        const rayLength = 30;
        
        // Check for ammo box hits
        for (let i = this.ammoBoxes.length - 1; i >= 0; i--) {
            const box = this.ammoBoxes[i];
            const toBox = box.position.clone().sub(startPos);
            
            if (direction.angleTo(toBox) < 0.2 && toBox.length() < rayLength) {
                const ammoGained = box.userData.ammo || 10;
                this.ammo = Math.min(this.maxAmmo, this.ammo + ammoGained);
                this.boxesCollected++;
                
                this.scene.remove(box);
                this.ammoBoxes.splice(i, 1);
                
                this.updateUI();
                
                this.showNotification(`+${ammoGained} Ammo`, 'success');
                
                if (this.firebaseReady && this.playerRef) {
                    updateDoc(this.playerRef, { ammo: this.ammo }).catch(console.error);
                }
                
                return;
            }
        }
        
        // Check for player hits
        for (let [playerId, playerObj] of this.otherPlayers) {
            if (!playerObj.mesh || !playerObj.data.alive) continue;
            
            const toPlayer = playerObj.mesh.position.clone().sub(startPos);
            
            if (direction.angleTo(toPlayer) < 0.2 && toPlayer.length() < rayLength) {
                const damage = this.damagePerShot;
                
                this.registerHit(playerId, damage);
                
                this.showHitMarker();
                
                this.showNotification(`Hit ${playerObj.data.name} (${damage} DMG)`, 'info');
                
                break;
            }
        }
    }
    
    showHitMarker() {
        const marker = document.createElement('div');
        marker.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 40px;
            height: 40px;
            border: 3px solid white;
            border-radius: 50%;
            animation: hitMarker 0.2s ease-out;
            pointer-events: none;
            z-index: 9999;
        `;
        document.body.appendChild(marker);
        
        setTimeout(() => {
            marker.remove();
        }, 200);
    }
    
    async registerHit(targetId, damage) {
        try {
            if (!this.firebaseReady || !this.playerId || !targetId || !db) return;
            
            const hitRef = doc(collection(db, 'game_hits'));
            await setDoc(hitRef, {
                shooterId: this.playerId,
                shooterName: this.playerName,
                targetId: targetId,
                damage: damage,
                timestamp: serverTimestamp()
            });
            
        } catch (error) {
            console.error('Error registering hit:', error);
        }
    }
    
    takeDamage(amount, attackerId, attackerName) {
        if (!this.gameActive || this.health <= 0) return;
        
        this.health = Math.max(0, this.health - amount);
        this.lastDamagedBy = { id: attackerId, name: attackerName };
        this.lastDamageTime = Date.now();
        
        this.updateUI();
        
        document.body.style.backgroundColor = '#ff0000';
        document.body.style.transition = 'background-color 0.1s';
        setTimeout(() => {
            document.body.style.backgroundColor = '';
            document.body.style.transition = '';
        }, 100);
        
        if (this.firebaseReady && this.playerRef) {
            updateDoc(this.playerRef, { health: this.health }).catch(console.error);
        }
        
        if (this.health <= 0) {
            this.die();
        } else {
            this.showNotification(`-${amount} HP from ${attackerName}`, 'error');
        }
    }
    
    async die() {
        this.gameActive = false;
        
        if (this.lastDamagedBy && this.firebaseReady && db) {
            const killData = {
                killerId: this.lastDamagedBy.id,
                killerName: this.lastDamagedBy.name,
                victimId: this.playerId,
                victimName: this.playerName,
                weapon: 'Pistol',
                timestamp: serverTimestamp()
            };
            
            try {
                await addDoc(collection(db, 'game_kills'), killData);
                
                const killerRef = doc(this.playersCollection, this.lastDamagedBy.id);
                await updateDoc(killerRef, {
                    kills: increment(1)
                });
                
                await this.recordWin(this.lastDamagedBy.id, this.lastDamagedBy.name);
                
            } catch (error) {
                console.error('Error recording kill:', error);
            }
            
            this.spawnAmmoBoxOnDeath(this.camera.position, 20);
            
            this.showNotification(`You were killed by ${this.lastDamagedBy.name}`, 'error');
        } else {
            this.showNotification('You died!', 'error');
        }
        
        if (this.firebaseReady && this.playerRef) {
            await updateDoc(this.playerRef, {
                alive: false,
                health: 0
            }).catch(console.error);
        }
        
        const gameOverlay = document.getElementById('gameOverlay');
        const finalScore = document.getElementById('finalScore');
        
        if (gameOverlay && finalScore) {
            finalScore.textContent = `Kills: ${this.kills}  Score: ${this.score}  Boxes: ${this.boxesCollected}`;
            gameOverlay.style.display = 'flex';
        }
        
        await this.recordDeath(this.playerId, this.playerName);
    }
    
    async recordWin(playerId, playerName) {
        if (!this.firebaseReady || !db) return;
        
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const dailyWinRef = doc(db, 'game_daily_wins', today, 'players', playerId);
            await setDoc(dailyWinRef, {
                playerId: playerId,
                playerName: playerName,
                wins: increment(1),
                lastWin: serverTimestamp()
            }, { merge: true });
            
            const allTimeWinRef = doc(db, 'game_alltime_wins', playerId);
            await setDoc(allTimeWinRef, {
                playerId: playerId,
                playerName: playerName,
                wins: increment(1),
                lastWin: serverTimestamp()
            }, { merge: true });
            
        } catch (error) {
            console.error('Error recording win:', error);
        }
    }
    
    async recordDeath(playerId, playerName) {
        if (!this.firebaseReady || !db) return;
        
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const dailyDeathRef = doc(db, 'game_daily_deaths', today, 'players', playerId);
            await setDoc(dailyDeathRef, {
                playerId: playerId,
                playerName: playerName,
                deaths: increment(1),
                lastDeath: serverTimestamp()
            }, { merge: true });
            
        } catch (error) {
            console.error('Error recording death:', error);
        }
    }
    
    reload() { 
        if (this.gameActive) { 
            this.ammo = this.maxAmmo; 
            this.updateUI();
            
            if (this.firebaseReady && this.playerRef) {
                updateDoc(this.playerRef, { ammo: this.ammo }).catch(console.error);
            }
        } 
    }
    
    updateUI() {
        const healthEl = document.getElementById('healthValue');
        const scoreEl = document.getElementById('scoreValue');
        const ammoEl = document.getElementById('ammoValue');
        const boxesEl = document.getElementById('boxesValue');
        const killsEl = document.getElementById('killsValue');
        
        if (healthEl) healthEl.textContent = this.health;
        if (scoreEl) scoreEl.textContent = this.score;
        if (ammoEl) ammoEl.textContent = this.ammo;
        if (boxesEl) boxesEl.textContent = this.boxesCollected;
        if (killsEl) killsEl.textContent = this.kills;
        
        const healthBar = document.querySelector('.health-bar-fill');
        if (healthBar) {
            healthBar.style.width = `${(this.health / this.maxHealth) * 100}%`;
        }
    }
    
    restart() {
        this.ammoBoxes.forEach(b => this.scene.remove(b));
        this.ammoBoxes = [];
        this.spawnInitialAmmoBoxes(30);
        
        this.health = 100; 
        this.score = 0; 
        this.kills = 0;
        this.ammo = 30; 
        this.boxesCollected = 0;
        this.gameActive = true;
        this.camera.position.set(0, 1.8, 15);
        this.lookYaw = 0; 
        this.lookPitch = 0;
        this.insideBuilding = false;
        this.currentBuilding = null;
        this.nearbyDoor = null;
        
        if (this.firebaseReady && this.playerRef) {
            updateDoc(this.playerRef, {
                health: this.health,
                ammo: this.ammo,
                kills: this.kills,
                alive: true,
                position: {
                    x: this.camera.position.x,
                    y: this.camera.position.y,
                    z: this.camera.position.z
                }
            }).catch(console.error);
        }
        
        const doorIndicator = document.getElementById('doorIndicator');
        if (doorIndicator) {
            doorIndicator.style.display = 'none';
        }
        
        const gameOverlay = document.getElementById('gameOverlay');
        if (gameOverlay) {
            gameOverlay.style.display = 'none';
        }
        
        this.updateUI();
    }
    
    cleanup() {
        if (this.firebaseReady && this.playerRef) {
            deleteDoc(this.playerRef).catch(console.error);
        }
        
        if (this.unsubscribePlayers) {
            this.unsubscribePlayers();
        }
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.otherPlayers.forEach((playerObj) => {
            this.scene.remove(playerObj.mesh);
            if (playerObj.nameTag && playerObj.nameTag.parentNode) {
                playerObj.nameTag.remove();
            }
            if (playerObj.healthBar && playerObj.healthBar.parentNode) {
                playerObj.healthBar.remove();
            }
        });
        this.otherPlayers.clear();
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const now = Date.now();
        const deltaTime = Math.min(100, now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;
        
        if (this.gameActive) {
            this.camera.rotation.y = this.lookYaw;
            this.camera.rotation.x = this.lookPitch;
            
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            forward.y = 0; 
            forward.normalize();
            
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
            right.y = 0; 
            right.normalize();
            
            const moveDelta = new THREE.Vector3(0, 0, 0);
            if (Math.abs(this.moveY) > 0.05) moveDelta.addScaledVector(forward, this.moveY * this.moveSpeed);
            if (Math.abs(this.moveX) > 0.05) moveDelta.addScaledVector(right, this.moveX * this.moveSpeed);
            
            if (moveDelta.length() > 0.01) {
                this.footstepTime += 0.15;
                this.bobAmount = Math.sin(this.footstepTime) * 0.02;
            } else {
                this.bobAmount *= 0.9;
            }
            
            this.camera.position.add(moveDelta);
            this.camera.position.y = 1.8 + Math.abs(this.bobAmount);
            
            this.camera.position.x = Math.max(-60, Math.min(60, this.camera.position.x));
            this.camera.position.z = Math.max(-60, Math.min(60, this.camera.position.z));
            
            if (this.insideBuilding && this.currentBuilding) {
                const inter = this.currentBuilding.interior;
                this.camera.position.x = Math.max(inter.minX + 0.5, Math.min(inter.maxX - 0.5, this.camera.position.x));
                this.camera.position.z = Math.max(inter.minZ + 0.5, Math.min(inter.maxZ - 0.5, this.camera.position.z));
            }
            
            // Smoothly interpolate other players
            this.otherPlayers.forEach((playerObj) => {
                if (playerObj.targetPosition) {
                    playerObj.mesh.position.lerp(playerObj.targetPosition, 0.3);
                }
                
                if (playerObj.targetRotation !== undefined) {
                    const rotDiff = playerObj.targetRotation - playerObj.mesh.rotation.y;
                    playerObj.mesh.rotation.y += rotDiff * 0.3;
                }
                
                // Update name tags and health bars
                if (playerObj.nameTag && playerObj.mesh) {
                    const vector = playerObj.mesh.position.clone();
                    vector.y += 2.2;
                    vector.project(this.camera);
                    
                    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
                    const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
                    
                    if (vector.z < 1) {
                        playerObj.nameTag.style.display = 'block';
                        playerObj.nameTag.style.left = x + 'px';
                        playerObj.nameTag.style.top = y + 'px';
                        
                        if (playerObj.healthBar) {
                            playerObj.healthBar.style.display = 'block';
                            playerObj.healthBar.style.left = x + 'px';
                            playerObj.healthBar.style.top = (y + 20) + 'px';
                        }
                    } else {
                        playerObj.nameTag.style.display = 'none';
                        if (playerObj.healthBar) playerObj.healthBar.style.display = 'none';
                    }
                }
            });
            
            // Animate ammo boxes
            this.ammoBoxes.forEach(box => {
                box.rotation.y += 0.02;
                box.position.y = 0.5 + Math.sin(Date.now() * 0.005) * 0.15;
            });
            
            this.updateMinimap();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

window.onload = () => { 
    try {
        const game = new Game();
        window.game = game;
    } catch (error) {
        console.error('Failed to start game:', error);
    }
};

// Animation styles
if (!document.getElementById('game-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'game-animation-styles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            10% { opacity: 1; transform: translateX(-50%) translateY(0); }
            90% { opacity: 1; transform: translateX(-50%) translateY(0); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        }
        @keyframes hitMarker {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}