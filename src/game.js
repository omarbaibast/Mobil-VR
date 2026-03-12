import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// --- Configuration ---
const MOVE_SPEED = 0.15;
const ROTATION_SPEED = 0.03;
const BULLET_SPEED = 1.2;
const ENEMY_SPEED = 0.04;

const keys = {};
window.addEventListener('keydown', (e) => keys[e.code] = true);
window.addEventListener('keyup', (e) => keys[e.code] = false);

document.getElementById('overlay').addEventListener('click', () => {
    document.getElementById('overlay').style.display = 'none';
    // Resume audio context if any, or just ensure focus
});

let score = 0;
const bullets = [];
const enemies = [];
let lastShotTime = 0;
const shootCooldown = 150; 

const loader = new GLTFLoader();
let enemyModel = null;
let gunModel = null;
const mixers = []; // For animations
const clock = new THREE.Clock();

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Realistic Skybox
const textureLoader = new THREE.TextureLoader();
textureLoader.load('https://threejs.org/examples/textures/2294472375_b4a848c635_c.jpg', 
    (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
        scene.environment = texture;
    },
    undefined,
    (err) => console.error('Sky texture failed to load:', err)
);

scene.fog = new THREE.FogExp2(0x80a0e0, 0.01);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 3); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// Add VR Button
document.body.appendChild(VRButton.createButton(renderer));

// --- Player Group (Crucial for VR Movement) ---
// In VR, the camera is controlled by the headset. 
// To move the user, we move a parent group.
const playerGroup = new THREE.Group();
playerGroup.add(camera);
scene.add(playerGroup);

// --- Environment ---
// Sky (Simple gradient-like effect using a large sphere)
const skyGeo = new THREE.SphereGeometry(500, 32, 32);
const skyMat = new THREE.MeshBasicMaterial({
    color: 0x80a0e0,
    side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// Floor (Realistic Grass/Dirt)
const floorGeometry = new THREE.PlaneGeometry(500, 500);
const floorBase = textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
floorBase.wrapS = floorBase.wrapT = THREE.RepeatWrapping;
floorBase.repeat.set(100, 100);
const floorMaterial = new THREE.MeshStandardMaterial({ 
    map: floorBase,
    roughness: 0.8,
    metalness: 0.1
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Grid helper
const grid = new THREE.GridHelper(200, 40, 0x00ff00, 0x444444);
grid.material.opacity = 0.3;
grid.material.transparent = true;
scene.add(grid);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.camera.left = -50;
directionalLight.shadow.camera.right = 50;
directionalLight.shadow.camera.top = 50;
directionalLight.shadow.camera.bottom = -50;
scene.add(directionalLight);

// Some objects to look at
for (let i = 0; i < 100; i++) {
    const h = Math.random() * 5 + 1;
    const geometry = new THREE.BoxGeometry(1, h, 1);
    const material = new THREE.MeshStandardMaterial({ 
        color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5) 
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.x = (Math.random() - 0.5) * 80;
    cube.position.z = (Math.random() - 0.5) * 80;
    cube.position.y = h / 2;
    cube.castShadow = true;
    cube.receiveShadow = true;
    scene.add(cube);
}

let enemyAnimations = [];

// --- Load Realistic Assets ---
loader.load('https://threejs.org/examples/models/gltf/Soldier.glb', 
    (gltf) => {
        enemyModel = gltf.scene;
        enemyAnimations = gltf.animations;
        enemyModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        // Pre-warm spawning
        for(let i=0; i<5; i++) createEnemy();
    },
    undefined,
    (err) => {
        console.error('Soldier model failed to load:', err);
        // Fallback to a simple box if model fails
        enemyModel = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
        box.position.y = 1;
        enemyModel.add(box);
        for(let i=0; i<5; i++) createEnemy();
    }
);

// Simple Gun Placeholder (until we load a model or use a better primitive)
const gunGroup = new THREE.Group();
const gunBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.15, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 })
);
gunBody.position.set(0.2, -0.2, -0.5);
gunGroup.add(gunBody);
camera.add(gunGroup);

function createEnemy() {
    if (!enemyModel) return;

    const group = enemyModel.clone();
    let mixer = null;
    
    if (enemyAnimations && enemyAnimations.length > 1) {
        mixer = new THREE.AnimationMixer(group);
        const action = mixer.clipAction(enemyAnimations[1]); // Walk
        action.play();
        mixers.push(mixer);
    }

    // Random position
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 20;
    group.position.set(
        playerGroup.position.x + Math.cos(angle) * dist,
        0,
        playerGroup.position.z + Math.sin(angle) * dist
    );
    group.scale.set(1.5, 1.5, 1.5);
    
    scene.add(group);
    enemies.push({ 
        mesh: group, 
        mixer: mixer,
        health: 1
    });
}

function shoot() {
    const now = Date.now();
    if (now - lastShotTime < shootCooldown) return;
    lastShotTime = now;

    const bulletGeo = new THREE.SphereGeometry(0.1);
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);
    
    // Start at camera position
    const startPos = new THREE.Vector3();
    camera.getWorldPosition(startPos);
    bullet.position.copy(startPos);
    
    // Get direction from camera
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    bullets.push({ mesh: bullet, dir: direction });
    scene.add(bullet);
}

function updateGame() {
    const delta = clock.getDelta();
    
    // Update Animations
    for (const mixer of mixers) {
        mixer.update(delta);
    }

    // Update Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.mesh.position.addScaledVector(b.dir, BULLET_SPEED);
        
        if (b.mesh.position.distanceTo(playerGroup.position) > 150) {
            scene.remove(b.mesh);
            bullets.splice(i, 1);
            continue;
        }
        
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (b.mesh.position.distanceTo(e.mesh.position) < 1.5) {
                scene.remove(e.mesh);
                enemies.splice(j, 1);
                scene.remove(b.mesh);
                bullets.splice(i, 1);
                
                score += 10;
                const scoreEl = document.getElementById('score-board');
                if (scoreEl) scoreEl.innerText = `Score: ${score}`;
                break;
            }
        }
    }
    
    // Update Enemies
    for (const e of enemies) {
        const dir = new THREE.Vector3().subVectors(playerGroup.position, e.mesh.position).normalize();
        e.mesh.position.addScaledVector(dir, ENEMY_SPEED);
        e.mesh.lookAt(playerGroup.position.x, 0, playerGroup.position.z);
    }
    
    // Spawn enemies
    if (enemies.length < 15 && Math.random() < 0.015) {
        createEnemy();
    }
}

// --- Gamepad Handling ---
let gamepad = null;

window.addEventListener("gamepadconnected", (e) => {
    console.log("Gamepad connected:", e.gamepad.id);
    gamepad = e.gamepad;
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.innerText = "Controller: Connected (" + e.gamepad.id.substring(0, 15) + "...)";
});

window.addEventListener("gamepaddisconnected", (e) => {
    console.log("Gamepad disconnected");
    gamepad = null;
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.innerText = "Controller: Disconnected";
});

function updateGamepad() {
    // navigator.getGamepads() returns a snapshot. 
    // We MUST call it every frame to get updated button/axis values.
    const gamepads = (navigator.getGamepads ? navigator.getGamepads() : (navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : []));
    if (!gamepads) return;
    
    let foundGamepad = null;
    let activeCount = 0;
    
    for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (gp && gp.connected) {
            activeCount++;
            // Prioritize the first connected gamepad or one that looks like a DualShock/Xbox controller
            if (!foundGamepad) {
                foundGamepad = gp;
            } else if (gp.id.toLowerCase().includes('wireless') || gp.id.toLowerCase().includes('dualshock') || gp.id.toLowerCase().includes('xbox')) {
                foundGamepad = gp;
            }
        }
    }

    gamepad = foundGamepad;
    
    const statusEl = document.getElementById('status');
    const instructionEl = document.getElementById('instruction');
    const debugEl = document.getElementById('debug');

    if (gamepad) {
        if (statusEl) statusEl.innerText = `Controller: ${gamepad.id.substring(0, 20)}...`;
        if (instructionEl) instructionEl.style.display = 'none'; 
        
        if (debugEl) {
            const activeButtons = gamepad.buttons
                .map((b, i) => (b.pressed || b.value > 0.1) ? `<span style="color:#00ff00; font-weight:bold;">[${i}]</span>` : `[${i}]`)
                .join(' ');
            
            const activeAxes = gamepad.axes
                .map((a, i) => `<div style="display:inline-block; width:60px;">A${i}:<span style="color:${Math.abs(a) > 0.1 ? '#00ff00' : '#888'}">${a.toFixed(2)}</span></div>`)
                .join(' ');

            debugEl.innerHTML = `<div style="border-bottom:1px solid #444; margin-bottom:5px; padding-bottom:5px;">${activeAxes}</div>` +
                               `<div>${activeButtons}</div>`;
            
            // Visual pulse on any input
            const hasInput = gamepad.buttons.some(b => b.pressed || b.value > 0.1) || gamepad.axes.some(a => Math.abs(a) > 0.1);
            debugEl.style.background = hasInput ? 'rgba(0, 100, 0, 0.7)' : 'rgba(0,0,0,0.5)';
        }
    } else {
        if (statusEl) statusEl.innerText = "Controller: Searching (Press a button)...";
        if (instructionEl) instructionEl.style.display = 'block';
        if (debugEl) debugEl.innerHTML = "";
    }
}

// --- Animation Loop ---
function animate() {
    renderer.setAnimationLoop(render);
}

function render() {
    updateGamepad();
    updateGame();

    // 1. Keyboard Controls (Fallback)
    if (keys['KeyW']) playerGroup.translateZ(-MOVE_SPEED);
    if (keys['KeyS']) playerGroup.translateZ(MOVE_SPEED);
    if (keys['KeyA']) playerGroup.translateX(-MOVE_SPEED);
    if (keys['KeyD']) playerGroup.translateX(MOVE_SPEED);
    if (keys['KeyQ']) playerGroup.rotation.y += ROTATION_SPEED;
    if (keys['KeyE']) playerGroup.rotation.y -= ROTATION_SPEED;
    if (keys['Space']) shoot();

    // 2. Gamepad Controls
    if (gamepad) {
        // PS4 Controller Mapping (Standard):
        // Axes: 0: LS X, 1: LS Y, 2: RS X, 3: RS Y
        // Buttons: 7 is R2 Trigger, 9 is Options
        
        const lsX = gamepad.axes[0]; 
        const lsY = gamepad.axes[1]; 
        const rsX = (gamepad.axes.length > 2) ? gamepad.axes[2] : 0; 
        
        // Deadzone handling
        const deadzone = 0.15;
        
        // Rotation (Right Stick)
        if (Math.abs(rsX) > deadzone) {
            playerGroup.rotation.y -= rsX * ROTATION_SPEED;
        }

        // Movement (Left Stick - usually axes 0 and 1)
        if (Math.abs(lsX) > deadzone || Math.abs(lsY) > deadzone) {
            const moveDir = new THREE.Vector3();
            if (Math.abs(lsY) > deadzone) moveDir.z = lsY * MOVE_SPEED;
            if (Math.abs(lsX) > deadzone) moveDir.x = lsX * MOVE_SPEED;
            playerGroup.translateX(moveDir.x);
            playerGroup.translateZ(moveDir.z);
        }

        // Shooting (HYPER-SENSITIVE: Any button fires)
        let isShooting = false;
        for (let i = 0; i < gamepad.buttons.length; i++) {
            const btn = gamepad.buttons[i];
            if (btn && (btn.pressed || btn.value > 0.1)) {
                isShooting = true;
                break;
            }
        }
        if (isShooting) shoot();

        // Reset Position (Options/Start)
        if (gamepad.buttons[9] && gamepad.buttons[9].pressed) {
            playerGroup.position.set(0, 0, 0);
            playerGroup.rotation.set(0, 0, 0);
        }
    }

    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
