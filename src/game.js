import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// --- Configuration ---
const MOVE_SPEED = 0.1;
const ROTATION_SPEED = 0.03;

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x80a0e0);
scene.fog = new THREE.Fog(0x80a0e0, 0, 50);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 3); // Standard human height

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

// Floor
const floorGeometry = new THREE.PlaneGeometry(200, 200);
const floorMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x222222,
    roughness: 0.8,
    metalness: 0.2
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
    const gamepads = navigator.getGamepads();
    if (!gamepads) return;
    
    let foundGamepad = null;
    let debugText = "Detected Gamepads:<br>";
    
    for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (gp) {
            debugText += `[${i}] ${gp.id.substring(0, 20)}...<br>`;
            debugText += `Axes: ${gp.axes.map(a => a.toFixed(2)).join(', ')}<br>`;
            
            // Prioritize a "Standard" mapping or something that looks like a PS4 controller
            // PS4 controllers often have "Wireless Controller" or "DualShock" in the ID
            if (!foundGamepad || gp.id.toLowerCase().includes('wireless') || gp.id.toLowerCase().includes('dualshock')) {
                foundGamepad = gp;
            }
        }
    }
    
    const debugEl = document.getElementById('debug');
    if (debugEl) {
        if (foundGamepad) {
            debugEl.innerHTML = debugText;
        } else {
            debugEl.innerHTML = "No gamepads detected. Press a button on your controller.";
        }
    }

    gamepad = foundGamepad;
    
    const statusEl = document.getElementById('status');
    if (statusEl) {
        if (gamepad) {
            statusEl.innerText = "Controller: Connected (" + gamepad.id.substring(0, 15) + "...)";
        } else {
            statusEl.innerText = "Controller: Disconnected";
        }
    }
}

// --- Animation Loop ---
function animate() {
    renderer.setAnimationLoop(render);
}

function render() {
    updateGamepad();

    if (gamepad) {
        // PS4 Controller Mapping (Standard):
        // Axes: 0: LS X, 1: LS Y, 2: RS X, 3: RS Y
        // Buttons: 9 is Options
        
        const lsX = gamepad.axes[0]; 
        const lsY = gamepad.axes[1]; 
        const rsX = gamepad.axes[2]; 
        
        // Deadzone handling
        const deadzone = 0.15;
        
        // 1. Rotation (Right Stick)
        if (Math.abs(rsX) > deadzone) {
            playerGroup.rotation.y -= rsX * ROTATION_SPEED;
        }

        // 2. Movement (Left Stick)
        if (Math.abs(lsX) > deadzone || Math.abs(lsY) > deadzone) {
            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            direction.y = 0; 
            direction.normalize();

            const sideDirection = new THREE.Vector3();
            sideDirection.crossVectors(camera.up, direction).normalize();

            if (Math.abs(lsY) > deadzone) {
                playerGroup.position.addScaledVector(direction, -lsY * MOVE_SPEED);
            }
            
            if (Math.abs(lsX) > deadzone) {
                playerGroup.position.addScaledVector(sideDirection, lsX * MOVE_SPEED);
            }
        }

        // 3. Reset Position (Options Button)
        if (gamepad.buttons[9].pressed) {
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
