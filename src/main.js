import './style.scss'
import gsap from 'gsap';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.querySelector("#experience-canvas");
const loadingScreen = document.querySelector("#loading-screen");
const loadingBarFill = document.querySelector("#loading-bar-fill");
const loadingPercent = document.querySelector("#loading-percent");
const webpageOverlay = document.querySelector("#webpage-overlay");
const webpageContent = document.querySelector(".webpage-content");
const bottomPanelOverlay = document.querySelector("#bottom-panel-overlay");
const bottomPanelContent = document.querySelector(".bottom-panel-content");
const bottomPanelHeading = document.querySelector("#bottom-panel-heading");
const sceneExitButton = document.querySelector("#scene-exit");
const webpageCloseButton = document.querySelector("#webpage-close");
const webpageHeading = document.querySelector("#webpage-heading");
const sceneLabel = document.querySelector("#scene-label");
const sceneLabelTitle = document.querySelector("#scene-label-title");
const sceneLabelDate = document.querySelector("#scene-label-date");
const sceneLabelClient = document.querySelector("#scene-label-client");
const interactionCounterValue = document.querySelector("#interaction-counter-value");
const switchingScenesOverlay = document.querySelector("#switching-scenes");
const menuToggle = document.querySelector("#menu-toggle");
const siteMenu = document.querySelector("#site-menu");
const siteMenuLinks = document.querySelectorAll("[data-menu-link]");
let isWebpageOpen = false;
let isBottomPanelOpen = false;
let isMenuOpen = false;
// Distinct groupKeys clicked at least once - the numerator for the top-left
// counter. A Set (not a running tally) so re-clicking the same prop doesn't
// push the count past its total, which is displayed as "found/total". Only
// groupKeys with a scenes[] entry count (see the click listener below) -
// those are the only clicks that actually move the camera anywhere.
const discoveredGroupKeys = new Set();
let typewriterTimer = null;
let webpageRevealTimer = null;
let webpageDiveTween = null;
// Delays stripping the 'about-page'/'full-page' variant classes on close
// until their own close transition has actually finished playing - see
// closeWebpage. Removing them immediately would snap the panel back to the
// plain drawer's geometry/transform mid-transition instead of letting it
// play its own close animation out.
let webpageCloseCleanupTimer = null;
const preWebpageCameraPosition = new THREE.Vector3();
let bottomPanelRevealTimer = null;
let bottomPanelDiveTween = null;
const preBottomPanelCameraPosition = new THREE.Vector3();
// 0 = peeking at its resting height, 1 = fully grown to fill the screen.
// Chases bottomPanelExpandTarget every frame (see the render loop) rather
// than jumping straight to it on each wheel tick, so growing it feels like
// a damped drag instead of a stepped, clunky snap on every scroll event.
let bottomPanelExpandProgress = 0;

// What bottomPanelExpandProgress is currently chasing - set directly by the
// wheel listener further down, in step with how far the user has scrolled.
let bottomPanelExpandTarget = 0;

// Captured once from the static markup so openWebpage() can fall back to the
// original placeholder heading/copy whenever it's opened without explicit
// content (e.g. the 3D zoom-into-key path).
const defaultWebpageHeading = document.querySelector("#webpage-heading").dataset.text
    || document.querySelector("#webpage-heading").textContent;
const defaultWebpageParagraphs = Array.from(document.querySelectorAll('#webpage-overlay p.reveal'))
    .map((p) => p.textContent);

// The groupKey/stage that, once reached (camera settled on its final zoom
// stage), automatically opens the 2D webpage side panel.
const webpageGroupKey = '1';
const webpageStageIndex = 1;

// Same idea as webpageGroupKey/webpageStageIndex above, but for interact_2's
// bottom panel - it doesn't open automatically on arrival, though: see the
// wheel listener further down, which opens it once the user scrolls down
// while settled on this stage.
const bottomPanelGroupKey = '2';
const bottomPanelStageIndex = 1;

// Types the heading out character by character, like it's being typed on a
// typewriter, matching the "paper rising out of the keyboard" transition.
function playTypewriter(el, text) {
    clearTimeout(typewriterTimer);
    el.textContent = '';
    el.classList.add('typing');

    let i = 0;
    const step = () => {
        el.textContent = text.slice(0, i);
        i += 1;

        if (i <= text.length) {
            typewriterTimer = setTimeout(step, 32);
        } else {
            el.classList.remove('typing');
        }
    };
    step();
}
const sizes ={
    width:window.innerWidth,
    height:window.innerHeight,
};

// loader
const loadingManager = new THREE.LoadingManager();

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
    const percent = Math.round((itemsLoaded / itemsTotal) * 100);
    loadingBarFill.style.width = `${percent}%`;
    loadingPercent.textContent = `${percent}%`;
};

loadingManager.onLoad = () => {
    loadingScreen.classList.add('hidden');
    // Let the loading screen's own fade (see #loading-screen.hidden in
    // style.scss) clear before the wave plays, so it reads as the scene
    // waking up rather than something rippling behind the overlay.
    setTimeout(playIntroWave, 700);
};

const textureLoader = new THREE.TextureLoader(loadingManager);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');

const textureMap = {
    campground: "/textures/room/texture_set_campground.webp",
    cottage: "/textures/room/texture_set_cottage.webp",
    desktop_room: "/textures/room/texture_set_desktop_room.webp",
    key3_characters: "/textures/room/texture_set_key3_characters.webp",
    keyswitch_home_campground: "/textures/room/texture_set_keyswitch_home_campground.webp",
    mechanical_creature: "/textures/room/texture_set_mechanical_creature.webp",
    scene: "/textures/room/texture_set_scene.webp",
    watch: "/textures/room/texture_set_watch.webp",
};

const loadedTextures = {

};

Object.entries(textureMap).forEach(([key, value]) => {
    const texture = textureLoader.load(value);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    loadedTextures[key] = texture;
});

const gltfLoader = new GLTFLoader(loadingManager);
gltfLoader.setDRACOLoader(dracoLoader);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const interactiveMeshes = [];
let hoveredMesh = null;
let lastHoveredGroupKey = null;

// Background music + a short blip on hovering any interact_* prop. On by
// default - toggled off/on by clicking interact_volume like any other key
// (see the groupKey === 'volume' special-case in the click listener below)
// rather than a separate DOM control. Drop the actual files into
// public/audio/ (see the README there); until then play() just rejects
// quietly, so the toggle is a harmless no-op.
const backgroundMusic = new Audio('/audio/background-music.mp3');
backgroundMusic.loop = true;
backgroundMusic.volume = 0.6;

// Swapped in for backgroundMusic while zoomed into the campground diorama
// (see the "esc" scene's onEnter/onExit below), then swapped back out on exit.
const forestSound = new Audio('/audio/forest_sound.mp3');
forestSound.loop = true;
forestSound.volume = 0.6;

let currentMusicTrack = backgroundMusic;

// Pauses whichever track is currently playing and starts `track` in its
// place (only if sound is currently enabled) - used to switch the ambient
// music per-scene rather than always looping backgroundMusic.
function switchMusicTrack(track) {
    if (currentMusicTrack === track) return;

    currentMusicTrack.pause();
    currentMusicTrack = track;
    if (isSoundEnabled) currentMusicTrack.play().catch(() => {});
}

const hoverSound = new Audio('/audio/hover1.mp3');
hoverSound.volume = 0.7;

function playHoverSound() {
    hoverSound.currentTime = 0;
    hoverSound.play().catch(() => {});
}

// Only these groupKeys play the hover blip - the rest of interactiveMeshes
// (diorama props revealed inside a zoomed-in scene, character pieces, etc.)
// stay silent on hover.
const hoverSoundGroupKeys = new Set([
    '1', '2', '3', 'about', 'me', 'z', 'x', 'c', 'home', 'f12', 'light', 'esc',
    'control_creature', 'capslock', 'shift', 'control', 'windows', 'alt', 'volume',
    'up', 'down', 'left', 'right',
]);

let isSoundEnabled = true;

function setSoundEnabled(enabled) {
    isSoundEnabled = enabled;

    if (enabled) {
        currentMusicTrack.play().catch(() => {});
    } else {
        currentMusicTrack.pause();
    }
}

setSoundEnabled(true);

// Browsers block audio-with-sound until a user gesture unlocks the page, so
// the play() call above likely just rejected - retry once on the very first
// pointerdown/keydown anywhere, since by then a real gesture has happened.
function unlockBackgroundMusicOnFirstGesture() {
    if (isSoundEnabled && currentMusicTrack.paused) currentMusicTrack.play().catch(() => {});
}
window.addEventListener('pointerdown', unlockBackgroundMusicOnFirstGesture, { once: true });
window.addEventListener('keydown', unlockBackgroundMusicOnFirstGesture, { once: true });

// The standalone campground diorama - hidden until interact_esc is clicked
// (see the "esc" scene's onEnter/onExit below), unlike the rest of the props
// which stay visible in the overview at all times.
let campgroundGroup = null;

// Pairs up a keycap with its "_letter(s)" companion mesh even though the
// two don't share a naming prefix, e.g. "transparent_interact_1" and
// "interact_1_letters" both normalize to "1". Some meshes carry extra
// prefixes before "interact_" too, e.g. "scene_interact_f12" -> "f12" and
// "keyswitch_home_campground_interact_skytower" -> "skytower".
const getInteractGroupKey = (name) => name
    .split('interact_')
    .pop()
    .replace(/_letters?$/, '');

// Decorative props that share the keyboard scene with real keycaps but
// aren't themselves keys, so they should expand on hover, not press down.
const nonKeycapGroupKeys = new Set(['contact', 'giraffebig', 'giraffesmall', 'duck']);

// This same set also grows in from scale 0 during the intro wave (see
// playIntroWave), rather than just the small hover pop every other prop
// gets - see revealingGroupKeys below, which the render loop's ambient
// hover-scale lerp defers to while a group's reveal tween is in flight.
const revealingGroupKeys = new Set();

// These groups share an identical stage[0] zoom (same position/lookAt), so once
// zoomed into that shared shot, clicking any of the others should carry on into
// its own stage[1] instead of requiring the exact same key that was first clicked.
const sharedFirstStageGroupKeys = new Set(['1', '2', '3']);

let isAnimatingCamera = false;
let cameraTween = null;
// True only during the glide back to the pre-zoom overview (not while
// diving into or advancing through a scene's staged shots, which should
// play out uninterrupted). Lets a grab-the-camera pointerdown cut that
// glide short instead of forcing a multi-second wait before input works.
let isExitingToOverview = false;

let isContactZoomedIn = false;
let zoomedGroupKey = null;
let zoomedTargetKey = null;
let zoomStageIndex = 0;
let zoomedLiftsMesh = false;
// True only for scenes flagged freeCamera below (currently just the
// campground) - lets the camera keep orbiting once fully zoomed in instead
// of staying locked to the stage's fixed shot like every other scene.
let zoomedFreeCamera = false;
const preZoomCameraPosition = new THREE.Vector3();
const preZoomCameraTarget = new THREE.Vector3();

const panCenter = new THREE.Vector3(0.723, 1.018, 0.155);
const maxPanDistance = 6;
const minPanY = 0.5;
const maxPanY = 15;

// Keyed by mesh groupKey (i.e. the button's name with the "interact_" prefix
// stripped) so each scene is named after the button that opens it.
const scenes = {
    contact: {
        liftMesh: true,
        stages: [
            {
                position: new THREE.Vector3(2.055, 1.550, -0.206),
                lookAt: new THREE.Vector3(2.051, 1.447, -0.542),
            },
        ],
    },
    duck: {
        liftMesh: false,
        label: { title: 'Duck Model', date: '7 April 2023', client: 'bazarnov3d' },
        stages: [
            {
                position: new THREE.Vector3(3.720, 1.733, -0.633),
                lookAt: new THREE.Vector3(4.133, 0.966, -1.952),
            },
        ],
    },
    about: {
        liftMesh: false,
        // "ABOUT" and "ME" are two separate keycaps that share the same shot,
        // so either one dives into the same About page once the camera lands
        // (see onArrive below, and the openAboutWebpage() it points to).
        onArrive: openAboutWebpage,
        stages: [
            {
                position: new THREE.Vector3(-1.527, 2.819, 0.647),
                lookAt: new THREE.Vector3(-1.527, 0.904, 0.607),
            },
        ],
    },
    me: {
        liftMesh: false,
        onArrive: openAboutWebpage,
        stages: [
            {
                position: new THREE.Vector3(-1.527, 2.819, 0.647),
                lookAt: new THREE.Vector3(-1.527, 0.904, 0.607),
            },
        ],
    },
    f12: {
        liftMesh: false,
        // interact_skytower isn't part of this scene's own button group, but
        // should stay hoverable/interactive while this scene is zoomed in.
        extraInteractiveGroupKeys: ['skytower'],
        stages: [
            {
                position: new THREE.Vector3(2.083, 1.481, -0.085),
                lookAt: new THREE.Vector3(2.669, 1.154, -0.742),
            },
        ],
    },
    home: {
        liftMesh: false,
        label: { title: 'The Start of the Journey', date: '17 September 2022', client: 'Polygon Runway' },
        stages: [
            {
                position: new THREE.Vector3(4.641, 1.415, -0.229),
                lookAt: new THREE.Vector3(4.453, 1.057, -0.398),
            },
        ],
    },
    // interact_control (the plain Ctrl key) intentionally has no scene entry
    // here - handleInteraction no-ops for any groupKey without one, so it
    // still presses down like a key on hover but clicking it goes nowhere,
    // unlike interact_control_creature below.
    control_creature: {
        liftMesh: false,
        label: { title: 'Mechanical Creature', date: '2 July 2023', client: 'Polyford' },
        stages: [
            {
                position: new THREE.Vector3(3.179, 1.298, 1.674),
                lookAt: new THREE.Vector3(2.525, -0.977, 0.527),
            },
        ],
    },
    hitbox: {
        liftMesh: false,
        label: { title: 'Cottage', date: '6 July 2026' },
        // The key3 character diorama isn't part of this scene's own button
        // group, but should stay hoverable/interactive while this scene is
        // zoomed in (same pattern as f12's extraInteractiveGroupKeys below).
        extraInteractiveGroupKeys: Array.from({ length: 10 }, (_, i) => `character${i + 1}`),
        stages: [
            {
                position: new THREE.Vector3(2.287, 2.043, 1.335),
                lookAt: new THREE.Vector3(1.215, 0.207, 0.235),
            },
        ],
    },
    1: {
        liftMesh: false,
        label: { title: 'Desktop Room', date: '20 January 2025' },
        stages: [
            {
                position: new THREE.Vector3(-2.788, 2.091, 0.038),
                lookAt: new THREE.Vector3(-2.787, 1.203, -0.309),
            },
            {
                position: new THREE.Vector3(-3.697, 1.153, -0.171),
                lookAt: new THREE.Vector3(-3.484, 0.849, -0.378),
            },
        ],
    },
    2: {
        liftMesh: false,
        label: { title: 'Elements', date: '7 April 2025' },
        stages: [
            {
                position: new THREE.Vector3(-2.788, 2.091, 0.038),
                lookAt: new THREE.Vector3(-2.787, 1.203, -0.309),
            },
            {
                position: new THREE.Vector3(-3.064, 1.014, -0.225),
                lookAt: new THREE.Vector3(-2.914, 0.738, -0.419),
            },
        ],
    },
    3: {
        liftMesh: false,
        stages: [
            {
                position: new THREE.Vector3(-2.788, 2.091, 0.038),
                lookAt: new THREE.Vector3(-2.787, 1.203, -0.309),
            },
            {
                position: new THREE.Vector3(-2.531, 1.296, -0.167),
                lookAt: new THREE.Vector3(-2.355, 0.723, -0.485),
            },
        ],
    },
    light: {
        liftMesh: false,
        stages: [
            {
                position: new THREE.Vector3(8.607, 8.217, 10.468),
                lookAt: new THREE.Vector3(2.736, -0.412, 0.498),
            },
        ],
    },
    esc: {
        liftMesh: false,
        // The campground diorama is a separate glb, loaded hidden - reveal it
        // only while zoomed into this key rather than leaving it visible in
        // the overview like the rest of the props. Also swaps the ambient
        // music to forestSound for the duration, back to backgroundMusic on exit.
        onEnter: () => {
            if (campgroundGroup) campgroundGroup.visible = true;
            switchMusicTrack(forestSound);
        },
        onExit: () => {
            if (campgroundGroup) campgroundGroup.visible = false;
            switchMusicTrack(backgroundMusic);
        },
        // Covers the camera's glide across the room with the switching_scenes
        // graphic (see handleInteraction's initial-zoom branch), since this
        // reframe crosses much more distance than a same-desk key zoom.
        transitionOverlay: true,
        // The campground is its own little diorama rather than a fixed shot
        // of a keycap, so once the camera arrives it's freed to orbit around
        // it (see animateCameraTo's onComplete) instead of staying locked -
        // leaving is via #scene-exit or Escape rather than an outside click.
        freeCamera: true,
        // Orbiting is bounded relative to the arrival shot below (see
        // applyFreeCameraBounds) rather than left wide open like the
        // overview - panning off is disabled outright, rotation is capped to
        // a swing around the diorama, and zoom only allows a slight push in.
        freeCameraBounds: {
            azimuthSpreadRad: THREE.MathUtils.degToRad(30),
            polarSpreadRad: THREE.MathUtils.degToRad(10),
            zoomInFactor: 0.75,
        },
        stages: [
            {
                position: new THREE.Vector3(-10.126, 1.123, -3.042),
                lookAt: new THREE.Vector3(-9.178, 0.139, -4.010),
            },
        ],
    },
};

// "about" and "me" are two separate keycaps that both land on the same About
// page (see their scenes entries above, which share the same stage and
// onArrive: openAboutWebpage) - fold "me" into "about" so they tally as one
// find instead of two, both for the total below and in the click listener.
const countedInteractionGroupKey = (groupKey) => (groupKey === 'me' ? 'about' : groupKey);

// Total number of camera-moving interactions - one per distinct scenes[]
// entry (after the about/me merge above), since that object doubles as
// "every groupKey a click can actually zoom into" (see the `if (scene)`
// check in handleInteraction). Known synchronously, so the top-left counter
// can show its real denominator before the model loads.
const totalInteractionCount = new Set(Object.keys(scenes).map(countedInteractionGroupKey)).size;
interactionCounterValue.textContent = `${discoveredGroupKeys.size}/${totalInteractionCount}`;

const environmentMap = new THREE.CubeTextureLoader(loadingManager)
    .setPath('/textures/skybox/')
    .load([
        'px.webp', 'nx.webp', 'py.webp', 'ny.webp', 'pz.webp', 'nz.webp'

    ]);

gltfLoader.load("/models/portfolio_project_model_v11_compressed.glb", (glb) => {
    glb.scene.traverse((child) => {
        if (!child.isMesh) return;

        // Superseded by the dedicated campground_compressed.glb (loaded
        // below, gated on the esc key) - hide this low-detail placeholder so
        // the two don't overlap.
        if (child.name === "keyswitch_home_campground_Campground") {
            child.visible = false;
        }

        if (child.name.includes("interact")) {
            child.userData.initialScale = child.scale.clone();
            child.userData.initialPosition = child.position.clone();
            child.userData.groupKey = getInteractGroupKey(child.name);
            // Only meshes directly under the keyboard scene (not diorama
            // objects nested inside a zoomed-in key, and not the non-keycap
            // decorative props called out in nonKeycapGroupKeys) are real keycaps.
            child.userData.isKeyboardKey = /^(scene_)?interact_/.test(
                child.name.replace(/^transparent_/, '')
            ) && !nonKeycapGroupKeys.has(child.userData.groupKey);

            interactiveMeshes.push(child);
        }

        // Invisible click target for the "hitbox" scene - raycasting still
        // hits meshes with visible = false, so this stays clickable without
        // rendering anything.
        if (child.name === "hitbox") {
            child.visible = false;
            child.userData.initialScale = child.scale.clone();
            child.userData.initialPosition = child.position.clone();
            child.userData.groupKey = "hitbox";
            child.userData.isKeyboardKey = false;

            interactiveMeshes.push(child);
        }

        if (child.name.includes("transparent")) {
            child.material = new THREE.MeshPhysicalMaterial({
                color: 0xffffff,
                transmission: 1,
                opacity: 1,
                metalness: 0,
                roughness: 0,
                ior: 1.5,
                thickness: 0.01,
                specularIntensity: 1,
                envMap: environmentMap,
                envMapIntensity: 1,
            });
            return;
        }

        Object.keys(loadedTextures).forEach((key) => {
            if (child.name.includes(key)) {
                const material = new THREE.MeshBasicMaterial({
                    map: loadedTextures[key]
                });
                child.material = material;

                if (child.material.map) {
                    child.material.map.minFilter = THREE.LinearMipmapLinearFilter;
                }
            }
        });
    });

    scene.add(glb.scene);
    glb.scene.updateMatrixWorld(true);

    interactiveMeshes.forEach((mesh) => {
        const worldSize = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
        const liftAmount = Math.max(worldSize.x, worldSize.y, worldSize.z, 0.02) * 0.2;
        const pressAmount = liftAmount * 0.5;

        const liftedWorldPos = mesh.getWorldPosition(new THREE.Vector3());
        liftedWorldPos.y += liftAmount;
        mesh.userData.liftedPosition = mesh.parent.worldToLocal(liftedWorldPos);

        const pressedWorldPos = mesh.getWorldPosition(new THREE.Vector3());
        pressedWorldPos.y -= pressAmount;
        mesh.userData.pressedPosition = mesh.parent.worldToLocal(pressedWorldPos);

        // The giraffes, contact and duck grow in from nothing as part of the
        // intro wave (see playIntroWave) instead of the small hover pop every
        // other prop gets - start collapsed and flagged as "revealing" here,
        // before the first frame ever renders them, so there's no flash of
        // them at full size before the wave reaches them.
        if (nonKeycapGroupKeys.has(mesh.userData.groupKey)) {
            mesh.scale.setScalar(0);
            revealingGroupKeys.add(mesh.userData.groupKey);
        }
    });

    camera.position.set(0.723, 12.210, 0.834);
    controls.target.set(0.723, 1.018, 0.155);
    controls.update();
});

// Standalone campground diorama - modeled/exported separately from the main
// scene file, so it needs its own position/scale to line up where the old
// inline placeholder used to sit near the esc key. Starts hidden; the "esc"
// scene above toggles campgroundGroup.visible on enter/exit.
gltfLoader.load("/models/campground_v2_compressed.glb", (glb) => {
    campgroundGroup = glb.scene;

    campgroundGroup.traverse((child) => {
        if (!child.isMesh) return;

        child.material = new THREE.MeshBasicMaterial({ map: loadedTextures.campground });
        child.material.map.minFilter = THREE.LinearMipmapLinearFilter;
    });

    // Pulled well back (-5, 0, -2.5) from the esc key's own position so the
    // diorama sits as its own isolated scene instead of crowding the keyboard.
    campgroundGroup.position.set(-9.53, 0.56, -3.63);
    campgroundGroup.visible = false;

    scene.add(campgroundGroup);
});

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera( 45, sizes.width / sizes.height, 0.1, 1000 );

camera.position.z = 5;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(3, 5, 2);
scene.add(directionalLight);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize( sizes.width, sizes.height );
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

// Shared with resetFreeCameraBounds below, which restores this exact value
// once a free-camera scene (the campground) is left.
const overviewMinDistance = 1;

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.rotateSpeed = 0.4;
controls.zoomSpeed = 0.7;
controls.panSpeed = 0.8;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = overviewMinDistance;
controls.maxDistance = 15;

controls.addEventListener('end', () => {
    const p = camera.position;
    const t = controls.target;
    console.log(`camera.position.set(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)});`);
    console.log(`controls.target.set(${t.x.toFixed(3)}, ${t.y.toFixed(3)}, ${t.z.toFixed(3)});`);
});

//event listeners
window.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
});

// Animates camera.position and controls.target together over a fixed
// duration/easing. Killing/restarting from the camera's current (possibly
// mid-tween) position means rapid re-clicks - e.g. a double-click - redirect
// smoothly instead of the previous frame-by-frame lerp letting one
// in-flight target silently get swapped for another.
function animateCameraTo(position, lookAt, { duration = 1.2, ease = 'expo.out', onComplete } = {}) {
    cameraTween?.kill();

    isAnimatingCamera = true;
    controls.enabled = false;
    // Any fresh tween supersedes the "exiting" grab-to-interrupt state; the
    // exit block below re-flags itself right after starting its own tween.
    isExitingToOverview = false;

    const from = {
        px: camera.position.x, py: camera.position.y, pz: camera.position.z,
        tx: controls.target.x, ty: controls.target.y, tz: controls.target.z,
    };

    cameraTween = gsap.to(from, {
        px: position.x, py: position.y, pz: position.z,
        tx: lookAt.x, ty: lookAt.y, tz: lookAt.z,
        duration,
        ease,
        onUpdate: () => {
            camera.position.set(from.px, from.py, from.pz);
            controls.target.set(from.tx, from.ty, from.tz);
        },
        onComplete: () => {
            isAnimatingCamera = false;
            // Run the caller's onComplete first so it can flip isContactZoomedIn
            // (e.g. the exit-to-overview tween below) before we decide whether
            // to re-enable controls - otherwise this would lock controls back
            // out using the stale, still-zoomed-in flag.
            onComplete?.();
            // Stay locked out while zoomed into a scene; only free the
            // camera once the tween lands back on the pre-zoom overview -
            // except free-camera scenes (the campground), which unlock as
            // soon as they've arrived rather than waiting for an exit.
            controls.enabled = !isContactZoomedIn || zoomedFreeCamera;
        },
    });
}

// #switching-scenes fades in/out over 0.5s (its own CSS transition) - a
// pending move/hide is tracked below so it can be cancelled if the user
// grabs the camera mid-exit (see interruptExitToOverview).
const switchingScenesFadeMs = 500;
const switchingScenesHoldMs = 550;
let switchingScenesStartTimeout = null;
let switchingScenesHideTimeout = null;

function showSwitchingScenes() {
    switchingScenesOverlay.classList.add('visible');
}

function hideSwitchingScenes() {
    clearTimeout(switchingScenesStartTimeout);
    clearTimeout(switchingScenesHideTimeout);
    switchingScenesStartTimeout = null;
    switchingScenesHideTimeout = null;
    switchingScenesOverlay.classList.remove('visible');
}

// Same signature as animateCameraTo, but for scenes flagged transitionOverlay
// (currently just "esc" -> campground): waits for #switching-scenes to be
// fully opaque (plus a short hold) before actually moving the camera, so the
// glide across the room never peeks through the still-fading overlay, then
// holds again once arrived before revealing the destination - reads as a
// deliberate scene change rather than a flash-cut.
function animateCameraBehindOverlay(position, lookAt, { onComplete, ...options } = {}) {
    showSwitchingScenes();
    switchingScenesStartTimeout = setTimeout(() => {
        switchingScenesStartTimeout = null;
        animateCameraTo(position, lookAt, {
            ...options,
            onComplete: () => {
                onComplete?.();
                switchingScenesHideTimeout = setTimeout(hideSwitchingScenes, switchingScenesHoldMs);
            },
        });
    }, switchingScenesFadeMs + switchingScenesHoldMs);
}

// Free-camera scenes (currently just the campground) let OrbitControls stay
// enabled once zoomed in (see animateCameraTo's onComplete), but the shared
// instance is also used for the overview - so its rotate/zoom/pan limits are
// tightened on arrival and put back on exit rather than left wide open.
// Bounds are derived from the stage's own arrival position/target (rather
// than hand-picked world angles) so they stay in sync if that shot is ever
// retuned.
function applyFreeCameraBounds(bounds) {
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);

    controls.enablePan = false;
    controls.minAzimuthAngle = spherical.theta - bounds.azimuthSpreadRad;
    controls.maxAzimuthAngle = spherical.theta + bounds.azimuthSpreadRad;
    controls.minPolarAngle = Math.max(0.05, spherical.phi - bounds.polarSpreadRad);
    controls.maxPolarAngle = Math.min(Math.PI / 2 - 0.05, spherical.phi + bounds.polarSpreadRad);
    controls.maxDistance = spherical.radius;
    controls.minDistance = spherical.radius * bounds.zoomInFactor;
}

function resetFreeCameraBounds() {
    controls.enablePan = true;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = overviewMinDistance;
    controls.maxDistance = 15;
}

function finishExitingToOverview() {
    scenes[zoomedGroupKey]?.onExit?.();
    if (zoomedFreeCamera) resetFreeCameraBounds();
    isContactZoomedIn = false;
    zoomedGroupKey = null;
    zoomStageIndex = 0;
    zoomedLiftsMesh = false;
    zoomedFreeCamera = false;
    isExitingToOverview = false;
}

// Leaves whichever scene is currently zoomed in and glides the camera back
// to the pre-zoom overview. Shared by handleInteraction's "click on empty
// space" fallback and #scene-exit's click handler below - free-camera
// scenes (the campground) skip that empty-click fallback entirely (an
// outside click there is just orbiting), so the button is their only way
// back in besides Escape.
function exitZoomedScene(onComplete) {
    sceneExitButton.classList.remove('visible');

    if (zoomedLiftsMesh) {
        interactiveMeshes
            .filter((mesh) => mesh.userData.groupKey === zoomedGroupKey)
            .forEach((mesh) => {
                gsap.to(mesh.position, {
                    x: mesh.userData.initialPosition.x,
                    y: mesh.userData.initialPosition.y,
                    z: mesh.userData.initialPosition.z,
                    duration: 0.2,
                    ease: 'back.out(2)',
                    overwrite: true,
                });
            });
    }

    // Covers the glide back out the same way the zoom-in does (see
    // handleInteraction's initial-zoom branch) - the exit crosses the
    // same long distance across the room, just in reverse.
    const exitingTransitionOverlay = scenes[zoomedGroupKey]?.transitionOverlay;
    const finish = () => {
        finishExitingToOverview();
        onComplete?.();
    };

    // Don't clear the zoomed-in state until the tween actually lands back
    // on the overview. Clearing it up front let raycasting immediately
    // treat every interactable as fair game again mid-flight - clicking
    // one there re-captured preZoomCameraPosition from the camera's
    // current in-transit (not yet arrived) position, corrupting the
    // "original" spot that later exits would return to.
    if (exitingTransitionOverlay) {
        animateCameraBehindOverlay(preZoomCameraPosition, preZoomCameraTarget, { duration: 2.2, onComplete: finish });
    } else {
        animateCameraTo(preZoomCameraPosition, preZoomCameraTarget, { duration: 2.2, onComplete: finish });
    }
    // Set after the call: animateCameraTo clears this flag itself at its
    // top (any fresh tween supersedes a prior exit-in-progress), so it
    // must only be (re)armed once *this* exit tween is the active one.
    isExitingToOverview = true;
}

// Grabbing (or scrolling to zoom) the camera while it's gliding back to the
// overview hands control back immediately instead of eating the input for
// the rest of the tween - killing the tween leaves the camera wherever it
// was interrupted, which reads as "I took control" rather than a forced
// wait. Scoped to only the exit glide: staged shots (entering/advancing)
// are meant to play out. Also cancels/hides a still-pending switching-scenes
// overlay (see animateCameraBehindOverlay) - otherwise a grab during the
// pre-move hold would kill a tween that never started, leaving the overlay
// stuck on screen since its own onComplete would never fire.
function interruptExitToOverview() {
    if (!isExitingToOverview) return;
    cameraTween?.kill();
    isAnimatingCamera = false;
    finishExitingToOverview();
    hideSwitchingScenes();
    controls.enabled = true;
}
canvas.addEventListener('pointerdown', interruptExitToOverview);
canvas.addEventListener('wheel', interruptExitToOverview, { passive: true });

// Drives both mouse clicks and keyboard shortcuts (1/2/3) through the same
// zoom/lift/advance logic, keyed on the group that was interacted with
// rather than the hovered mesh itself, so a keypress can act exactly like
// clicking its corresponding interact_<n> mesh.
function handleInteraction(targetGroupKey) {
    if (isWebpageOpen || isMenuOpen || isBottomPanelOpen) return;

    if (isContactZoomedIn) {
        const stillOnSameObject = targetGroupKey !== null && targetGroupKey === zoomedGroupKey;
        const canSwitchSharedGroup = targetGroupKey !== null
            && !stillOnSameObject
            && zoomStageIndex === 0
            && sharedFirstStageGroupKeys.has(zoomedGroupKey)
            && sharedFirstStageGroupKeys.has(targetGroupKey);

        const nextTargetGroupKey = canSwitchSharedGroup ? targetGroupKey : zoomedGroupKey;
        const targetScene = scenes[nextTargetGroupKey];
        const nextStage = targetScene?.stages[zoomStageIndex + 1];

        if ((stillOnSameObject || canSwitchSharedGroup) && nextStage) {
            zoomedGroupKey = nextTargetGroupKey;
            zoomStageIndex += 1;

            const opensWebpage = zoomedGroupKey === webpageGroupKey && zoomStageIndex === webpageStageIndex;
            const opensBottomPanel = zoomedGroupKey === bottomPanelGroupKey && zoomStageIndex === bottomPanelStageIndex;
            const onStageArrived = opensWebpage
                ? openWebpage
                : opensBottomPanel ? openInteract2BottomPanel : undefined;
            animateCameraTo(nextStage.position, nextStage.lookAt, onStageArrived ? { onComplete: onStageArrived } : undefined);
            return;
        }

        // Clicking outside any interactive mesh, or re-clicking the same key
        // once there's no further stage to advance to (e.g. interact_1/2/3's
        // own stage[1] shot), steps back to the previous stage instead of
        // exiting all the way out to the pre-zoom view.
        if (zoomStageIndex > 0 && (targetGroupKey === null || (stillOnSameObject && !nextStage))) {
            const previousStage = scenes[zoomedGroupKey].stages[zoomStageIndex - 1];
            zoomStageIndex -= 1;
            animateCameraTo(previousStage.position, previousStage.lookAt);
            return;
        }

        exitZoomedScene();
        return;
    }

    if (targetGroupKey === null) return;

    const scene = scenes[targetGroupKey];

    if (scene) {
        const { liftMesh, stages } = scene;
        const firstStage = stages[0];

        preZoomCameraPosition.copy(camera.position);
        preZoomCameraTarget.copy(controls.target);

        if (liftMesh) {
            interactiveMeshes
                .filter((mesh) => mesh.userData.groupKey === targetGroupKey)
                .forEach((mesh) => {
                    gsap.to(mesh.position, {
                        x: mesh.userData.liftedPosition.x,
                        y: mesh.userData.liftedPosition.y,
                        z: mesh.userData.liftedPosition.z,
                        duration: 0.4,
                        ease: 'back.out(2)',
                        overwrite: true,
                    });
                });
        }

        isContactZoomedIn = true;
        zoomedGroupKey = targetGroupKey;
        zoomStageIndex = 0;
        zoomedLiftsMesh = liftMesh;
        zoomedFreeCamera = !!scene.freeCamera;
        scene.onEnter?.();

        sceneExitButton.classList.toggle('visible', zoomedFreeCamera);

        const onArrived = () => {
            if (zoomedFreeCamera) applyFreeCameraBounds(scene.freeCameraBounds);
            // Only fires for single-stage scenes (e.g. about/me) - their one
            // stage is also their final destination, unlike multi-stage
            // scenes (e.g. "1") where stage[0] is just the shared overview
            // shot on the way in.
            if (stages.length === 1) scene.onArrive?.();
        };

        if (scene.transitionOverlay) {
            animateCameraBehindOverlay(firstStage.position, firstStage.lookAt, { onComplete: onArrived });
        } else {
            animateCameraTo(firstStage.position, firstStage.lookAt, { onComplete: onArrived });
        }
    }
}

window.addEventListener('click', (event) => {
    // Checked against isWebpageOpen's value from *before* this click is
    // processed, so the very click that opens the panel (isWebpageOpen still
    // false here) never immediately closes itself further down.
    if (isWebpageOpen && !webpageContent.contains(event.target)) {
        closeWebpage();
        return;
    }

    // Same click-outside-closes pattern as the side panel above - the bottom
    // panel only ever opens via scroll (see the wheel listener below), so
    // there's no risk of the opening click racing this check the way the
    // side panel's did.
    if (isBottomPanelOpen && !bottomPanelContent.contains(event.target)) {
        closeBottomPanel();
        return;
    }

    const groupKey = hoveredMesh ? hoveredMesh.userData.groupKey : null;

    // First click on any prop that actually has a scene (i.e. really zooms the
    // camera somewhere) counts it as "found" for the top-left counter - keys
    // like interact_volume or the plain Ctrl key don't move the camera at all
    // (see the `if (scene)` check in handleInteraction), so they don't count.
    const countedGroupKey = countedInteractionGroupKey(groupKey);
    if (groupKey !== null && scenes[groupKey] && !discoveredGroupKeys.has(countedGroupKey)) {
        discoveredGroupKeys.add(countedGroupKey);
        interactionCounterValue.textContent = `${discoveredGroupKeys.size}/${totalInteractionCount}`;
    }

    // interact_volume mutes/unmutes instead of zooming into a scene - same
    // isWebpageOpen/isMenuOpen guard handleInteraction applies to every other
    // key, so it's a no-op while either is open rather than toggling behind them.
    if (groupKey === 'volume') {
        if (!isWebpageOpen && !isMenuOpen && !isBottomPanelOpen) setSoundEnabled(!isSoundEnabled);
        return;
    }

    // Free-camera scenes (the campground) let you orbit around once zoomed
    // in, so a plain click on empty space is just orbiting - dragging still
    // fires a click on release - not "click outside to leave". #scene-exit
    // (or Escape) is the way out instead.
    if (groupKey === null && zoomedFreeCamera) return;

    handleInteraction(groupKey);
});

// The 19 project stills dropped into public/images (image_1.webp ... image_19.webp),
// grouped into rows in the same reading order as the reference layout: one
// full-width image, a row of 2, one full-width, three rows of 3, a row of 2,
// one full-width, a row of 2, one full-width. `image` is the filename
// number. The filenames aren't in this order on disk, so the grouping below
// was matched by hand against the reference screenshot rather than just
// counting up from 1.
//
// Unlike a fixed-column grid, each row is laid out at runtime (see
// layoutProjectsGallery) by that row's own images' *real* aspect ratios -
// they're all different sizes, so a uniform grid would either stretch or
// crop most of them. Instead every image in a row is scaled to a shared row
// height so the row's width comes out even, the same "justified" technique
// photo-gallery grids use - nothing gets cropped, and images keep their own
// proportions.
const projectGalleryRows = [
    [3],
    [7, 5],
    [2],
    [12, 9, 8],
    [17, 16, 18],
    [13, 15, 4],
    [10, 11],
    [14],
    [19, 6],
    [1],
];

function buildProjectsGallery() {
    const gallery = document.createElement('div');
    gallery.className = 'projects-gallery reveal';

    projectGalleryRows.forEach((imageNumbers) => {
        const row = document.createElement('div');
        row.className = 'projects-gallery-row';

        imageNumbers.forEach((imageNumber) => {
            const tile = document.createElement('div');
            tile.className = 'projects-gallery-tile';

            const img = document.createElement('img');
            img.src = `/images/image_${imageNumber}.webp`;
            img.alt = `Project still ${imageNumber}`;
            tile.appendChild(img);

            row.appendChild(tile);
        });

        gallery.appendChild(row);
    });

    return gallery;
}

// Justified-gallery sizing: for each row, scale every image so they all
// share one row height and their widths sum to the row's full width - the
// same math a "justified" photo grid uses (e.g. Flickr's), which is why
// three squarish images and three wide ones can share a row without any of
// them stretching, cropping, or leaving gaps. Capped at maxRowHeight so a
// row with only one or two images (e.g. the full-width ones) doesn't blow up
// past a sane height on wide viewports.
const projectsGalleryGap = 16;
const projectsGalleryMaxRowHeight = 460;

function layoutProjectsGallery() {
    const gallery = webpageContent.querySelector('.projects-gallery');
    if (!gallery) return;

    gallery.querySelectorAll('.projects-gallery-row').forEach((row) => {
        const tiles = Array.from(row.querySelectorAll('.projects-gallery-tile'));
        const images = tiles.map((tile) => tile.querySelector('img'));
        if (images.some((img) => !img.naturalWidth)) return;

        const ratios = images.map((img) => img.naturalWidth / img.naturalHeight);
        const rowWidth = row.clientWidth;

        // Below this width, sharing one row height across 2-3 images would
        // squeeze them illegibly small - stack each at its own full width
        // instead (still sized by its own ratio, so still uncropped).
        if (rowWidth < 480) {
            tiles.forEach((tile, i) => {
                tile.style.width = '100%';
                tile.style.height = `${rowWidth / ratios[i]}px`;
            });
            return;
        }

        const totalGap = projectsGalleryGap * (tiles.length - 1);
        const naturalRowHeight = (rowWidth - totalGap) / ratios.reduce((sum, ratio) => sum + ratio, 0);
        // A single-image "row" is a full-width banner by design - it should
        // always reach the row's full width (so its edges line up with the
        // multi-image rows above/below), so only multi-image rows get
        // capped to stop them ballooning too tall on wide viewports.
        const rowHeight = tiles.length === 1
            ? naturalRowHeight
            : Math.min(naturalRowHeight, projectsGalleryMaxRowHeight);

        tiles.forEach((tile, i) => {
            tile.style.width = `${ratios[i] * rowHeight}px`;
            tile.style.height = `${rowHeight}px`;
        });
    });
}

function layoutProjectsGalleryOnceLoaded(gallery) {
    layoutProjectsGallery();

    gallery.querySelectorAll('img').forEach((img) => {
        if (img.complete) return;
        img.addEventListener('load', layoutProjectsGallery, { once: true });
    });
}

window.addEventListener('resize', () => {
    if (webpageContent.querySelector('.projects-gallery')) layoutProjectsGallery();
});

function openWebpage({ heading, paragraphs } = {}) {
    isWebpageOpen = true;
    // A reopen within closeWebpage's cleanup delay would otherwise still
    // fire and rip 'about-mode'/'full-page' back off this freshly-opened
    // page - see closeWebpage.
    clearTimeout(webpageCloseCleanupTimer);
    webpageContent.style.removeProperty('opacity');
    webpageOverlay.classList.add('open');
    webpageOverlay.classList.remove('about-mode');
    webpageContent.classList.remove('revealed', 'full-page', 'about-page');
    webpageContent.scrollTop = 0;
    controls.enabled = false;

    // A small extra push toward the key, as if the camera dives through it
    // just as the panel slides in alongside it.
    preWebpageCameraPosition.copy(camera.position);
    const diveTarget = camera.position.clone().lerp(controls.target, 0.14);
    webpageDiveTween?.kill();
    webpageDiveTween = gsap.to(camera.position, {
        x: diveTarget.x,
        y: diveTarget.y,
        z: diveTarget.z,
        duration: 1.1,
        ease: 'power2.out',
    });

    // Undo whatever the Projects page (see openProjectsWebpage below) left
    // behind - it has its own root and doesn't touch #webpage-heading or
    // this paragraph-rebuilding path at all, so this is just cleanup for
    // whenever the panel is reopened via the default 3D zoom-into-key path
    // right after Projects was showing.
    webpageContent.querySelectorAll('#projects-root').forEach((el) => el.remove());
    webpageHeading.style.removeProperty('display');

    webpageContent.querySelectorAll('p.reveal').forEach((p) => p.remove());
    (paragraphs || defaultWebpageParagraphs).forEach((text) => {
        const p = document.createElement('p');
        p.className = 'reveal';
        p.textContent = text;
        webpageContent.appendChild(p);
    });

    const headingText = heading || defaultWebpageHeading;
    webpageHeading.dataset.text = headingText;
    playTypewriter(webpageHeading, headingText);
    clearTimeout(webpageRevealTimer);
    webpageRevealTimer = setTimeout(() => webpageContent.classList.add('revealed'), 450);
}

// The Projects nav link's destination - deliberately built as its own root
// (#projects-root, injected fresh below) rather than sharing openWebpage's
// #webpage-heading/paragraph-rebuilding path used by individual project
// pages: it doesn't have per-project text, just a fixed intro and the image
// gallery, so it reads as its own page rather than another instance of the
// drawer template.
function openProjectsWebpage() {
    if (isWebpageOpen || isAnimatingCamera) return;

    const open = () => {
        isWebpageOpen = true;
        // A reopen within closeWebpage's cleanup delay would otherwise still
        // fire and rip 'full-page'/'projects-open' back off this
        // freshly-opened page - see closeWebpage.
        clearTimeout(webpageCloseCleanupTimer);
        webpageContent.style.removeProperty('opacity');
        webpageOverlay.classList.add('open');
        webpageContent.classList.remove('revealed');
        webpageContent.classList.add('full-page');
        webpageContent.scrollTop = 0;
        controls.enabled = false;
        document.body.classList.add('projects-open');

        preWebpageCameraPosition.copy(camera.position);
        const diveTarget = camera.position.clone().lerp(controls.target, 0.14);
        webpageDiveTween?.kill();
        webpageDiveTween = gsap.to(camera.position, {
            x: diveTarget.x,
            y: diveTarget.y,
            z: diveTarget.z,
            duration: 1.1,
            ease: 'power2.out',
        });

        // Hide (don't touch the text of) the shared heading and clear any
        // leftover paragraphs from a previous single-project open, then
        // build this page's own root fresh.
        webpageHeading.style.display = 'none';
        webpageContent.querySelectorAll('p.reveal, #projects-root').forEach((el) => el.remove());

        const root = document.createElement('div');
        root.id = 'projects-root';

        const heading = document.createElement('h1');
        heading.id = 'projects-heading';
        root.appendChild(heading);

        const intro = document.createElement('p');
        intro.className = 'reveal';
        intro.textContent = 'A collection of all projects over 5 years...';
        root.appendChild(intro);

        const galleryEl = buildProjectsGallery();
        root.appendChild(galleryEl);

        webpageContent.appendChild(root);
        layoutProjectsGalleryOnceLoaded(galleryEl);

        playTypewriter(heading, 'PROJECTS');
        clearTimeout(webpageRevealTimer);
        webpageRevealTimer = setTimeout(() => webpageContent.classList.add('revealed'), 450);
    };

    // Glide back to the overview first if a scene is currently zoomed in,
    // then open once the camera has actually landed there.
    if (isContactZoomedIn) {
        exitZoomedScene(open);
    } else {
        open();
    }
}

// Shared by the "about"/"me" keycaps (see their onArrive above) and the
// About nav link below - both route into the same page. Unlike every other
// page (a drawer that slides in over the still-moving scene, via
// openWebpage's shared camera-dive/slide plumbing), About is a centered card
// that pops in over a static, blurred backdrop - see .about-mode/.about-page
// in style.scss - so it gets its own open flow here rather than reusing
// openWebpage() and patching the result, which fought with it: adding
// .about-page and .open in the same tick meant the card's pop transition had
// no closed (scale(0.85)) state to actually animate from, so it interpolated
// straight from the drawer's own translateX(100%) instead - a hybrid
// slide-then-pop. Forcing a reflow between the two fixes that.
function openAboutWebpage() {
    isWebpageOpen = true;
    controls.enabled = false;

    // A reopen within closeWebpage's cleanup delay would otherwise still
    // fire and rip 'about-mode'/'about-page' back off this freshly-opened
    // page - see closeWebpage.
    clearTimeout(webpageCloseCleanupTimer);
    webpageContent.style.removeProperty('opacity');

    // Guards against a still-running dive-back tween from whatever page was
    // just closed (see closeWebpage) - without this the blurred backdrop
    // could keep panning behind the card for the tail of that tween.
    webpageDiveTween?.kill();
    preWebpageCameraPosition.copy(camera.position);

    webpageOverlay.classList.add('about-mode');
    webpageContent.classList.remove('revealed', 'full-page');
    webpageContent.classList.add('about-page');
    webpageContent.scrollTop = 0;

    webpageContent.querySelectorAll('#projects-root').forEach((el) => el.remove());
    webpageContent.querySelectorAll('p.reveal').forEach((p) => p.remove());
    webpageHeading.style.removeProperty('display');

    const paragraph = document.createElement('p');
    paragraph.className = 'reveal';
    paragraph.textContent = "Bonjour! 你好! Hello! I'm zxc, a self taught 3D designer building at the intersection of design, engineering and sustainability. I enjoy taking my combination of technical and creative skills to explore how objects are constructed in 3D.";
    webpageContent.appendChild(paragraph);

    const headingText = 'ABOUT ME';
    webpageHeading.dataset.text = headingText;

    // Flush the styles above - card is now .about-page but not yet .open, so
    // this paints its closed state (scale(0.85), opacity 0) for a frame
    // before .open flips it to scale(1) below, giving the transition a real
    // starting point instead of jumping in from the drawer's own transform.
    void webpageContent.offsetWidth;

    webpageOverlay.classList.add('open');
    document.body.classList.add('about-open');

    playTypewriter(webpageHeading, headingText);
    clearTimeout(webpageRevealTimer);
    webpageRevealTimer = setTimeout(() => webpageContent.classList.add('revealed'), 450);
}

// Same entry point as the 3D "about"/"me" keycaps, but reachable straight
// from the nav without needing to find them on the desk first.
function openAboutWebpageFromMenu() {
    if (isWebpageOpen || isAnimatingCamera) return;

    if (isContactZoomedIn) {
        exitZoomedScene(openAboutWebpage);
    } else {
        openAboutWebpage();
    }
}

function closeWebpage() {
    isWebpageOpen = false;
    webpageOverlay.classList.remove('open');
    webpageContent.classList.remove('revealed');
    controls.enabled = true;

    clearTimeout(typewriterTimer);
    clearTimeout(webpageRevealTimer);
    webpageDiveTween?.kill();
    webpageDiveTween = gsap.to(camera.position, {
        x: preWebpageCameraPosition.x,
        y: preWebpageCameraPosition.y,
        z: preWebpageCameraPosition.z,
        duration: 0.8,
        ease: 'power2.inOut',
    });

    // Removing 'open' above already plays each variant's own close animation
    // (the drawer slides out via its transform, About's card pops back down
    // via its own) - stripping the variant classes themselves has to wait
    // until that's finished, or the panel would snap straight to the plain
    // drawer's geometry/transform mid-transition instead.
    clearTimeout(webpageCloseCleanupTimer);
    webpageCloseCleanupTimer = setTimeout(() => {
        // About's own fade-out (.about-page's opacity transition, driven by
        // .open above) has already finished by now, but the plain drawer
        // rule these classes fall back to doesn't declare an opacity at all
        // - so removing them would otherwise snap opacity straight back to
        // its implicit 1 for a frame, right as top/left/right/bottom/width
        // *also* jump straight to the drawer's own geometry (not animatable
        // either). That flashes the old card, now in the drawer's position,
        // right before its slide-out transform even starts - the "trace"
        // sliding off to the side. Pinning opacity at 0 through the swap
        // avoids that; every open function clears this again on its way in.
        if (webpageContent.classList.contains('about-page')) {
            webpageContent.style.opacity = '0';
        }

        webpageOverlay.classList.remove('about-mode');
        webpageContent.classList.remove('about-page', 'full-page');
        document.body.classList.remove('projects-open', 'about-open');
    }, 600);
}

// interact_2's bottom panel - same reveal choreography as openWebpage above,
// including the same subtle camera dive push as the panel slides in. Opens
// automatically on arrival (see the onStageArrived wiring in
// handleInteraction), same as the side panel does for interact_1 - starts
// peeking up from the bottom edge rather than filling the screen right away
// (see setBottomPanelExpandProgress and the wheel listener below, which grow
// it in step with how far the user actually scrolls).
function openBottomPanel({ heading, buildBody }) {
    isBottomPanelOpen = true;
    bottomPanelOverlay.classList.add('open');
    bottomPanelContent.classList.remove('revealed');
    setBottomPanelExpandProgress(0);
    bottomPanelExpandTarget = 0;
    controls.enabled = false;

    preBottomPanelCameraPosition.copy(camera.position);
    const diveTarget = camera.position.clone().lerp(controls.target, 0.14);
    bottomPanelDiveTween?.kill();
    bottomPanelDiveTween = gsap.to(camera.position, {
        x: diveTarget.x,
        y: diveTarget.y,
        z: diveTarget.z,
        duration: 1.1,
        ease: 'power2.out',
    });

    bottomPanelContent.querySelectorAll('.reveal').forEach((el) => el.remove());
    buildBody(bottomPanelContent);

    bottomPanelHeading.dataset.text = heading;
    playTypewriter(bottomPanelHeading, heading);
    clearTimeout(bottomPanelRevealTimer);
    bottomPanelRevealTimer = setTimeout(() => bottomPanelContent.classList.add('revealed'), 450);
}

// The content half of openBottomPanel - kept separate so handleInteraction
// can pass it as a plain onArrived callback (same shape as openWebpage).
function openInteract2BottomPanel() {
    const { title } = scenes[bottomPanelGroupKey].label;
    openBottomPanel({ heading: title, buildBody: buildExplodedWatchCaseStudy });
}

// Case-study body for the Exploded Watch project - adapted from the
// standalone exploded-watch.html/.css reference page: a title/date cover,
// an absolutely-positioned collage of desk/café/wireframe shots plus the
// skills list and concept copy, then a full-bleed final render, inside the
// bottom panel's own scroll and restyled with this site's fonts/colors in
// place of the reference's own. The reference's full-bleed cover photo was
// dropped (see the cover below) since it wasn't actually part of this 3D
// scene. Every position in style.scss's .case-study-elements-* rules is
// copied straight from the reference's percentages, so the collage reads as
// the same composition, just scaled to the panel's column instead of a full
// page.
function buildExplodedWatchCaseStudy(container) {
    // Shared by the desk/café/detail shots below (not the wireframe or the
    // cover/final renders, which each have their own bespoke markup) -
    // .case-study-media (style.scss) is the reference's .elements__image
    // wrapper/hover-zoom pattern, modifierClass is one of its --desk/--cafe/
    // --detail equivalents.
    const media = (modifierClass, file, alt) => {
        const fig = document.createElement('figure');
        fig.className = `case-study-media ${modifierClass}`;
        const img = document.createElement('img');
        img.src = `/images/${file}`;
        img.alt = alt;
        img.loading = 'lazy';
        fig.appendChild(img);
        return fig;
    };

    const caseStudy = document.createElement('div');
    caseStudy.className = 'case-study reveal';

    // Cover - just the project title/date, no photo: the reference's own
    // cover shot wasn't actually part of this 3D scene, so it read as a
    // random stock photo bolted onto the top of the case study rather than
    // something that belonged to it.
    const cover = document.createElement('div');
    cover.className = 'case-study-cover';
    const coverTitle = document.createElement('p');
    coverTitle.className = 'case-study-cover-title';
    coverTitle.textContent = 'Exploded Watch';
    const coverDate = document.createElement('p');
    coverDate.className = 'case-study-cover-date';
    coverDate.textContent = scenes[bottomPanelGroupKey].label.date;
    cover.append(coverTitle, coverDate);

    const hint = document.createElement('p');
    hint.className = 'case-study-hint';
    hint.textContent = 'Scroll down to see more, or scroll back up to return to the scene.';

    // Elements - the collaged desk/café/wireframe composition, positioned
    // to match the reference design's .elements section exactly.
    const elements = document.createElement('div');
    elements.className = 'case-study-elements';

    // bottomPanelHeading (declared near the top of this file) is moved in
    // here rather than left where it sits in index.html, so its typewriter
    // reveal plays as the big "ELEMENTS" headline pinned to this section's
    // top-left corner, same as the reference's own .elements h2. Typewriter
    // targets the same node wherever it's parented, so playTypewriter in
    // openBottomPanel is unaffected by the move.
    elements.appendChild(bottomPanelHeading);
    elements.appendChild(media('case-study-elements-desk', 'watch_scene1.webp', "Close-up of the watch's miniature workstation"));
    elements.appendChild(media('case-study-elements-cafe', 'watch_scene3.webp', "Close-up of the watch's central café platform"));

    // Not built with the media() helper above - the reference's own
    // .elements__wireframe is a static, pre-cropped shot (object-position +
    // a fixed transform, no hover-zoom), not one of its .elements__image
    // siblings.
    const wireframe = document.createElement('figure');
    wireframe.className = 'case-study-elements-wireframe';
    const wireframeImg = document.createElement('img');
    wireframeImg.src = '/images/wireframe_watch_2.webp';
    wireframeImg.alt = 'Wireframe view of the exploded watch model';
    wireframeImg.loading = 'lazy';
    wireframe.appendChild(wireframeImg);
    elements.appendChild(wireframe);

    const skills = document.createElement('ul');
    skills.className = 'case-study-elements-skills';
    [
        'Hard-surface modelling',
        'Prop and asset creation',
        'Lighting',
        'Developing concepts from sketches and references',
        'Scene organisation',
        'Animation',
        'UV mapping',
        'Texture baking',
        'Rendering',
        'Compositing and post-production',
    ].forEach((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        skills.appendChild(li);
    });
    elements.appendChild(skills);

    const conceptCopy = document.createElement('p');
    conceptCopy.className = 'case-study-elements-concept';
    conceptCopy.textContent = "Juxtaposing the intricate rhythm of a watch's mechanical movements with the warmth and vitality of everyday life.";
    elements.appendChild(conceptCopy);

    // watch_scene4 (the finished watch case, shot square-on) now fills the
    // large detail slot; watch_scene2 (the conveyor/gear close-up that used
    // to sit there) moved to its own smaller spot instead, overlapping the
    // wireframe's base mechanism and detail's top-left corner the same way
    // the heading overlaps the wireframe above.
    elements.appendChild(media('case-study-elements-detail', 'watch_scene4.webp', 'Top-down view of the finished watch case'));
    elements.appendChild(media('case-study-elements-gears', 'watch_scene2.webp', "Close-up of the watch's conveyor and gear details"));

    // Not built with media() either, for the same reason as the wireframe -
    // the reference's .final-render isn't one of its .elements__image
    // siblings, so it never gets their hover-zoom.
    const finalRender = document.createElement('figure');
    finalRender.className = 'case-study-final';
    const finalImg = document.createElement('img');
    finalImg.src = '/images/image_3.webp';
    finalImg.alt = 'Final rendered view of the exploded watch';
    finalImg.loading = 'lazy';
    finalRender.appendChild(finalImg);

    caseStudy.append(cover, hint, elements, finalRender);
    container.appendChild(caseStudy);
}

function closeBottomPanel() {
    isBottomPanelOpen = false;
    bottomPanelOverlay.classList.remove('open');
    bottomPanelContent.classList.remove('revealed');
    controls.enabled = true;

    clearTimeout(typewriterTimer);
    clearTimeout(bottomPanelRevealTimer);
    bottomPanelDiveTween?.kill();
    bottomPanelDiveTween = gsap.to(camera.position, {
        x: preBottomPanelCameraPosition.x,
        y: preBottomPanelCameraPosition.y,
        z: preBottomPanelCameraPosition.z,
        duration: 0.8,
        ease: 'power2.inOut',
    });
}

function setBottomPanelExpandProgress(progress) {
    bottomPanelExpandProgress = THREE.MathUtils.clamp(progress, 0, 1);
    const peekHeight = Math.min(360, window.innerHeight * 0.7);
    const height = THREE.MathUtils.lerp(peekHeight, window.innerHeight, bottomPanelExpandProgress);
    bottomPanelContent.style.height = `${height}px`;

    // Only let the content scroll natively once the panel is fully expanded
    // (see the .expanded CSS rule) - otherwise the same wheel gesture that's
    // still growing the panel toward full height would also scroll its
    // content, so it'd land already scrolled partway down instead of at the
    // top. Reset scrollTop on the way back down through this boundary too,
    // so a partial scroll left over from this pass doesn't carry into the
    // next time the panel is fully expanded.
    // >= 0.999 rather than === 1: the render loop's damping only chases
    // progress to within 0.0005 of the target before it stops updating, so
    // progress settles just under 1 and never lands on it exactly.
    const wasExpanded = bottomPanelContent.classList.contains('expanded');
    const isExpanded = bottomPanelExpandProgress >= 0.999;
    if (isExpanded !== wasExpanded) {
        bottomPanelContent.classList.toggle('expanded', isExpanded);
        if (!isExpanded) bottomPanelContent.scrollTop = 0;
    }
}

// How much wheel travel (in px of deltaY) it takes to sweep all the way
// from peeking to filling the screen.
const bottomPanelScrollThrow = 700;

// How quickly the panel's displayed height catches up to
// bottomPanelExpandTarget in the render loop - an exponential decay rate
// (per second, not per frame) rather than a flat per-frame lerp factor, so
// the chase converges at the same real-world speed regardless of display
// refresh rate instead of visibly speeding up on 120Hz/144Hz screens and
// dragging on slower ones - see the render loop below.
const bottomPanelExpandDecay = 12;

window.addEventListener('wheel', (event) => {
    if (isBottomPanelOpen) {
        const nextTarget = bottomPanelExpandTarget + event.deltaY / bottomPanelScrollThrow;

        // Only close once already resting at the peek (target 0) and still
        // scrolling up from there - clamping at 0 first rather than closing
        // the instant the sum dips below it means a trackpad's inertial
        // "coast to a stop" (which often dips slightly negative right as the
        // user lifts their fingers) doesn't slam the panel shut on a gesture
        // that only ever meant to reach the peek.
        if (nextTarget <= 0) {
            if (bottomPanelExpandTarget <= 0) {
                closeBottomPanel();
            } else {
                bottomPanelExpandTarget = 0;
            }
            return;
        }

        // The render loop eases bottomPanelExpandProgress toward this every
        // frame (see bottomPanelExpandDecay above) instead of the height
        // jumping straight to it on every wheel tick.
        bottomPanelExpandTarget = Math.min(nextTarget, 1);
        return;
    }

    // The panel was scrolled shut above while still zoomed into its scene -
    // scrolling back down from here re-opens it (the reverse of scrolling up
    // to exit) instead of leaving a fresh click on the key as the only way
    // back in.
    if (
        event.deltaY > 0
        && isContactZoomedIn
        && zoomedGroupKey === bottomPanelGroupKey
        && !isAnimatingCamera
        && !isMenuOpen
    ) {
        openInteract2BottomPanel();
    }
}, { passive: true });

sceneExitButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!isContactZoomedIn) return;
    exitZoomedScene();
});

webpageCloseButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!isWebpageOpen) return;
    closeWebpage();
});

function openMenu() {
    isMenuOpen = true;
    siteMenu.classList.add('open');
    siteMenu.setAttribute('aria-hidden', 'false');
    menuToggle.classList.add('open');
    menuToggle.setAttribute('aria-label', 'Close menu');
    menuToggle.setAttribute('aria-expanded', 'true');
}

function closeMenu() {
    isMenuOpen = false;
    siteMenu.classList.remove('open');
    siteMenu.setAttribute('aria-hidden', 'true');
    menuToggle.classList.remove('open');
    menuToggle.setAttribute('aria-label', 'Open menu');
    menuToggle.setAttribute('aria-expanded', 'false');
}

menuToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    isMenuOpen ? closeMenu() : openMenu();
});

siteMenuLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();

        if (link.dataset.menuLink === 'projects') openProjectsWebpage();
        if (link.dataset.menuLink === 'about') openAboutWebpageFromMenu();
    });
});

// Escape either closes the menu (if it's open) or plays the interact_esc
// scene, same as clicking the esc keycap - never both off one keypress, so
// the menu-open check has to run first and short-circuit.
window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    if (isMenuOpen) {
        closeMenu();
        return;
    }

    if (isWebpageOpen) {
        closeWebpage();
        return;
    }

    if (isBottomPanelOpen) {
        closeBottomPanel();
        return;
    }

    handleInteraction('esc');
});

// No backdrop element behind the dropdown text, so closing on an outside
// click is handled by hand: bail if the click landed on the toggle or menu
// itself (those already close/act via their own listeners above).
window.addEventListener('click', (event) => {
    if (!isMenuOpen) return;
    if (menuToggle.contains(event.target) || siteMenu.contains(event.target)) return;
    closeMenu();
});

const keyPressGroupMap = {
    z: 'z',
    x: 'x',
    c: 'c',
    1: '1',
    2: '2',
    3: '3',
    escape: 'esc',
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
};
const keyboardPressedGroups = new Set();

// Filled in briefly by playIntroWave below to reuse the exact same
// hover/press feel driven by isHovered further down in render(), rather than
// hand-rolling a separate tween that could fight with that per-frame lerp.
const waveActiveGroupKeys = new Set();

window.addEventListener('keydown', (event) => {
    const groupKey = keyPressGroupMap[event.key.toLowerCase()];
    if (groupKey) keyboardPressedGroups.add(groupKey);
});

window.addEventListener('keyup', (event) => {
    const groupKey = keyPressGroupMap[event.key.toLowerCase()];
    if (groupKey) keyboardPressedGroups.delete(groupKey);
});

window.addEventListener('keydown', (event) => {
    if (!['1', '2', '3'].includes(event.key)) return;
    handleInteraction(event.key);
});

// Once the scene has fully loaded (see loadingManager.onLoad above), every
// interactable plays its own press/pop reaction in turn, ordered left to
// right across the desk - a Mexican wave to show off what's clickable.
function playIntroWave() {
    const groupKeys = [...new Set(interactiveMeshes.map((mesh) => mesh.userData.groupKey))]
        .filter((groupKey) => groupKey !== 'hitbox');

    const groups = groupKeys.map((groupKey) => {
        const meshes = interactiveMeshes.filter((mesh) => mesh.userData.groupKey === groupKey);
        const avgX = meshes.reduce((sum, mesh) => sum + mesh.getWorldPosition(new THREE.Vector3()).x, 0) / meshes.length;
        return { groupKey, avgX };
    });

    groups.sort((a, b) => a.avgX - b.avgX);

    // Stagger between keys shrinks as there are more of them, so the ripple
    // covers roughly the same ~1.8s whether it's a handful of props or a
    // whole keyboard's worth of keys, clamped so neither extreme looks off.
    const stagger = THREE.MathUtils.clamp(1800 / Math.max(groups.length - 1, 1), 25, 80);
    const pressHoldMs = 180;

    groups.forEach(({ groupKey }, i) => {
        setTimeout(() => {
            if (nonKeycapGroupKeys.has(groupKey)) {
                interactiveMeshes
                    .filter((mesh) => mesh.userData.groupKey === groupKey)
                    .forEach((mesh) => {
                        gsap.to(mesh.scale, {
                            x: mesh.userData.initialScale.x,
                            y: mesh.userData.initialScale.y,
                            z: mesh.userData.initialScale.z,
                            duration: 0.5,
                            ease: 'back.out(2)',
                            onComplete: () => revealingGroupKeys.delete(groupKey),
                        });
                    });
                return;
            }

            waveActiveGroupKeys.add(groupKey);
            setTimeout(() => waveActiveGroupKeys.delete(groupKey), pressHoldMs);
        }, i * stagger);
    });
}

window.addEventListener('resize', () => {
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;

    // Update camera
    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();

    //update renderer
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
})

function animate() {}

// Tracked across frames so the render loop's bottom-panel easing below can
// work out actual elapsed time instead of assuming a fixed frame duration.
let lastFrameTimestamp = performance.now();

const render = () => {
    controls.update();

    const now = performance.now();
    // Clamped so a frame after the tab was backgrounded/throttled doesn't
    // read as one huge elapsed step - the exponential decay below already
    // handles a large delta gracefully (it just snaps closer to the target),
    // but there's no reason to feed it more than this.
    const deltaSeconds = Math.min((now - lastFrameTimestamp) / 1000, 0.1);
    lastFrameTimestamp = now;

    // Ease the bottom panel's displayed height toward wherever the wheel
    // listener has last moved bottomPanelExpandTarget, rather than snapping
    // straight to it - smooths out the per-tick jumps a mouse wheel (or a
    // choppy trackpad) would otherwise produce. An exponential decay over
    // actual elapsed time (see bottomPanelExpandDecay) rather than a flat
    // per-frame lerp, so the motion is exactly as fluid at 30fps as 144fps.
    if (isBottomPanelOpen && Math.abs(bottomPanelExpandTarget - bottomPanelExpandProgress) > 0.0005) {
        setBottomPanelExpandProgress(
            bottomPanelExpandProgress
                + (bottomPanelExpandTarget - bottomPanelExpandProgress) * (1 - Math.exp(-bottomPanelExpandDecay * deltaSeconds))
        );
    }

    // Only show once the final stage is reached (e.g. interact_1's second
    // click), not on the shared overview stage[0] shot. Also drops as soon as
    // the exit-to-overview glide starts (rather than waiting for it to land)
    // so the label's fade-out plays alongside the camera pulling back instead
    // of lingering at full opacity until the camera has already arrived.
    const zoomedScene = isContactZoomedIn ? scenes[zoomedGroupKey] : null;
    const isOnFinalStage = !!zoomedScene
        && zoomStageIndex === zoomedScene.stages.length - 1
        && !isExitingToOverview;
    const activeLabel = isOnFinalStage ? zoomedScene.label : null;
    if (activeLabel) {
        sceneLabelTitle.textContent = activeLabel.title;
        sceneLabelDate.textContent = activeLabel.date;
        sceneLabelClient.textContent = activeLabel.client || '';
    }
    sceneLabel.classList.toggle('visible', !!activeLabel && !isWebpageOpen && !isMenuOpen && !isBottomPanelOpen);

    if (!isAnimatingCamera && !isContactZoomedIn) {
        const panOffset = controls.target.clone().sub(panCenter);

        // if (panOffset.length() > maxPanDistance) {
        //     panOffset.setLength(maxPanDistance);

        //     const clampedTarget = panCenter.clone().add(panOffset);
        //     const correction = clampedTarget.clone().sub(controls.target);

        //     controls.target.copy(clampedTarget);
        //     camera.position.add(correction);
        // }

        // camera.position.y = THREE.MathUtils.clamp(camera.position.y, minPanY, maxPanY);
    }

    // The 3D scene sits behind every overlay (webpage panel, Projects page,
    // bottom panel, menu) but pointermove is a window-level listener, so the
    // raycaster would otherwise keep hovering/popping/sounding props right
    // underneath whatever's actually covering the screen. Suspend hover
    // detection entirely while any of those are open instead.
    const isSceneObscured = isWebpageOpen || isBottomPanelOpen || isMenuOpen;

    if (isSceneObscured) {
        hoveredMesh = null;
        lastHoveredGroupKey = null;
        canvas.style.cursor = 'default';
    } else {
        raycaster.setFromCamera(pointer, camera);
        const activeScene = isContactZoomedIn ? scenes[zoomedGroupKey] : null;
        const canHoverSharedGroups = isContactZoomedIn
            && zoomStageIndex === 0
            && sharedFirstStageGroupKeys.has(zoomedGroupKey);
        const raycastableMeshes = isContactZoomedIn
            ? interactiveMeshes.filter((mesh) =>
                mesh.userData.groupKey === zoomedGroupKey ||
                activeScene?.extraInteractiveGroupKeys?.includes(mesh.userData.groupKey) ||
                (canHoverSharedGroups && sharedFirstStageGroupKeys.has(mesh.userData.groupKey)))
            : interactiveMeshes;
        const intersections = raycaster.intersectObjects(raycastableMeshes);
        hoveredMesh = intersections.length > 0 ? intersections[0].object : null;
        canvas.style.cursor = hoveredMesh ? 'pointer' : 'default';

        // Fires once per hover (on the group changing), not every frame the
        // pointer sits still over the same prop, and only for the whitelisted
        // groupKeys in hoverSoundGroupKeys.
        const hoveredGroupKey = hoveredMesh?.userData.groupKey ?? null;
        if (isSoundEnabled
            && hoveredGroupKey
            && hoveredGroupKey !== lastHoveredGroupKey
            && hoverSoundGroupKeys.has(hoveredGroupKey)) {
            playHoverSound();
        }
        lastHoveredGroupKey = hoveredGroupKey;
    }

    interactiveMeshes.forEach((mesh) => {
        const isHovered = (hoveredMesh !== null && mesh.userData.groupKey === hoveredMesh.userData.groupKey)
            || waveActiveGroupKeys.has(mesh.userData.groupKey);

        if (!mesh.userData.isKeyboardKey) {
            // Owned by playIntroWave's scale-from-0 reveal tween until it
            // completes - left alone here so the two don't fight over scale.
            if (revealingGroupKeys.has(mesh.userData.groupKey)) return;

            // Character diorama pieces get a bigger hover pop than other props.
            const hoverScale = /^character\d+$/.test(mesh.userData.groupKey) ? 1.35 : 1.15;
            const targetScale = mesh.userData.initialScale
                .clone()
                .multiplyScalar(isHovered ? hoverScale : 1);
            mesh.scale.lerp(targetScale, 0.15);
            return;
        }

        // Skip meshes mid zoom-lift/return or currently lifted while zoomed in;
        // their position is owned by the gsap tween in the click handler.
        if (isAnimatingCamera || mesh.userData.groupKey === zoomedGroupKey) return;

        const isKeyboardPressed = keyboardPressedGroups.has(mesh.userData.groupKey);
        const targetPosition = (isHovered || isKeyboardPressed) ? mesh.userData.pressedPosition : mesh.userData.initialPosition;
        mesh.position.lerp(targetPosition, 0.35);
    });

    renderer.render(scene, camera);
    window.requestAnimationFrame(render);
};

render();

window.__testHooks = {
    handleInteraction,
    camera,
    controls,
    state: () => ({ isContactZoomedIn, zoomedGroupKey, zoomStageIndex, isAnimatingCamera, isExitingToOverview, zoomedFreeCamera }),
    waveActiveGroupKeys: () => Array.from(waveActiveGroupKeys),
    groupScale: (groupKey) => {
        const mesh = interactiveMeshes.find((m) => m.userData.groupKey === groupKey);
        return mesh ? mesh.scale.x : null;
    },
    playIntroWave,
    groupWorldX: () => {
        const byKey = {};
        interactiveMeshes.forEach((mesh) => {
            const key = mesh.userData.groupKey;
            (byKey[key] ??= []).push(mesh.getWorldPosition(new THREE.Vector3()).x);
        });
        return Object.fromEntries(
            Object.entries(byKey).map(([key, xs]) => [key, xs.reduce((a, b) => a + b, 0) / xs.length])
        );
    },
    hoveredGroupKey: () => hoveredMesh?.userData.groupKey ?? null,
    campgroundGroup: () => campgroundGroup,
    campgroundBox: () => {
        if (!campgroundGroup) return null;
        const box = new THREE.Box3().setFromObject(campgroundGroup);
        return { min: box.min.toArray(), max: box.max.toArray() };
    },
};
