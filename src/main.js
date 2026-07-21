import './style.scss'
import gsap from 'gsap';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { inject } from "@vercel/analytics";

inject();

import { injectSpeedInsights } from '@vercel/speed-insights';

injectSpeedInsights();

// The imported stylesheet is ready before module evaluation reaches this
// line, so it is now safe to reveal the loading interface without a flash of
// raw HTML.
document.documentElement.classList.add('app-ready');
// Keep the critical loading-only guard through two complete paint
// opportunities. This prevents any raw interface nodes from sharing the
// first frame with the styled loading screen.
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        document.documentElement.classList.remove('startup-loading');
    });
});

const canvas = document.querySelector("#experience-canvas");
const loadingScreen = document.querySelector("#loading-screen");
const loadingBarFill = document.querySelector("#loading-bar-fill");
const loadingPercent = document.querySelector("#loading-percent");
const enterGate = document.querySelector("#enter-gate");
const enterGateEnterButton = document.querySelector("#enter-gate-enter");
const enterGatePortfolioButton = document.querySelector("#enter-gate-portfolio");
const enterGateMuteButton = document.querySelector("#enter-gate-mute");
const webpageOverlay = document.querySelector("#webpage-overlay");
const webpageContent = document.querySelector(".webpage-content");
const sceneExitButton = document.querySelector("#scene-exit");
const webpageCloseButton = document.querySelector("#webpage-close");
const webpageHeading = document.querySelector("#webpage-heading");
const sceneLabel = document.querySelector("#scene-label");
const sceneLabelTitle = document.querySelector("#scene-label-title");
const sceneLabelDate = document.querySelector("#scene-label-date");
const contactLinkedIn = document.querySelector("#contact-linkedin");
const interactionCounterValue = document.querySelector("#interaction-counter-value");
const navigationInstructions = document.querySelector("#navigation-instructions");
const switchingScenesOverlay = document.querySelector("#switching-scenes");
const switchingScenesFact = document.querySelector("#switching-scenes-fact");
const galleryTableHint = document.querySelector("#gallery-table-hint");
const lastInteractionHint = document.querySelector("#last-interaction-hint");
const galleryProjectsDisplay = document.querySelector("#gallery-projects-display");
const galleryProjectsHeader = document.querySelector(".gallery-projects-header");
const galleryProjectsFooter = document.querySelector(".gallery-projects-footer");
const galleryProjectsTitle = document.querySelector("#gallery-projects-title");
const galleryProjectsMeta = document.querySelector("#gallery-projects-meta");
const galleryProjectsTrack = document.querySelector("#gallery-projects-track");
const galleryProjectsPrevButton = document.querySelector("#gallery-projects-prev");
const galleryProjectsNextButton = document.querySelector("#gallery-projects-next");
const galleryProjectsCategoryValue = document.querySelector("#gallery-projects-category");
const galleryProjectsRoleValue = document.querySelector("#gallery-projects-role");
const galleryProjectsIndexValue = document.querySelector("#gallery-projects-index");
const galleryProjectsOpenButton = document.querySelector("#gallery-projects-open");
const menuToggle = document.querySelector("#menu-toggle");
const siteMenu = document.querySelector("#site-menu");
const siteMenuLinks = document.querySelectorAll("[data-menu-link]");
let isWebpageOpen = false;
let isMenuOpen = false;
// True from page load until the gate is dismissed (see hideEnterGate) -
// checked alongside isWebpageOpen/isMenuOpen wherever the
// 3D scene needs to ignore clicks/hover happening underneath it.
let isEnterGateOpen = true;
let assetsReady = false;
// Distinct groupKeys clicked at least once - the numerator for the top-left
// counter. A Set (not a running tally) so re-clicking the same prop doesn't
// push the count past its total, which is displayed as "found/total". Only
// groupKeys with a scenes[] entry count (see the click listener below) -
// those are the only clicks that actually move the camera anywhere.
const discoveredGroupKeys = new Set();
let typewriterTimer = null;
let webpageRevealTimer = null;
let webpageDiveTween = null;
let aboutOpenTimer = null;
let navigationIdleTimer = null;
// Delays stripping the 'about-page'/'full-page' variant classes on close
// until their own close transition has actually finished playing - see
// closeWebpage. Removing them immediately would snap the panel back to the
// plain drawer's geometry/transform mid-transition instead of letting it
// play its own close animation out.
let webpageCloseCleanupTimer = null;
const preWebpageCameraPosition = new THREE.Vector3();
// Same idea again, but for interact_3: once its only stage is reached (the
// shared overview shot it has in common with '1'/'2'), clicking interact_3 a
// second time doesn't step back out - it swaps the whole scene into the
// gallery's own standalone diorama instead (see enterGallery further down).
const galleryGroupKey = '3';
const galleryStageIndex = 0;

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
    assetsReady = true;
    loadingScreen.classList.add('hidden');
    if (getRouteFromLocation()) {
        ensureIntroPropsVisible();
        isEnterGateOpen = false;
        enterGate.classList.remove('visible');
        requestAnimationFrame(routeFromHash);
        return;
    }
    // Straight in, no fade - 'no-transition' suppresses #enter-gate's own
    // opacity transition (style.scss) for this one appearance only. Forcing
    // a layout read between adding and removing it is what makes the browser
    // actually commit the transition-less state first, rather than
    // coalescing both class changes into one frame and still transitioning.
    enterGate.classList.add('no-transition', 'visible');
    void enterGate.offsetWidth;
    enterGate.classList.remove('no-transition');
};

// Dismisses the gate and reveals the scene behind it (the keyboard desk) by
// playing the intro wave - delayed to match #enter-gate's own opacity
// transition (style.scss) so the wave only plays once the gate has actually
// faded out.
function hideEnterGate() {
    isEnterGateOpen = false;
    enterGate.classList.remove('visible');
    navigationInstructions.classList.add('visible');
    setTimeout(playIntroWave, 600);
}

// Enter and Portfolio both just dismiss the gate into the same scene -
// Portfolio doesn't jump to the Projects page.
enterGateEnterButton.addEventListener('click', hideEnterGate);
enterGatePortfolioButton.addEventListener('click', hideEnterGate);

// "enter without music" needs to win the race against the page-wide
// pointerdown listener (see unlockBackgroundMusicOnFirstGesture further
// down) that unlocks currentMusicTrack on the very first gesture anywhere -
// since that pointerdown bubbles up from this button too. Setting
// isMusicEnabled here, on pointerdown rather than click, runs before that
// bubbled listener fires.
enterGateMuteButton.addEventListener('pointerdown', () => setMusicEnabled(false));
enterGateMuteButton.addEventListener('click', hideEnterGate);
contactLinkedIn.addEventListener('pointerdown', (event) => event.stopPropagation());
contactLinkedIn.addEventListener('click', (event) => event.stopPropagation());

function showContactLinkedIn() {
    contactLinkedIn.classList.add('visible');
}

function hideContactLinkedIn() {
    contactLinkedIn.classList.remove('visible');
}

const textureLoader = new THREE.TextureLoader(loadingManager);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');

const textureMap = {
    campground: "/textures/room/texture_set_campground.webp",
    cottage: "/textures/room/texture_set_cottage.webp",
    desktop_room: "/textures/room/texture_set_desktop_room.webp",
    gallery: "/textures/room/texture_set_gallery.webp",
    key3_characters: "/textures/room/texture_set_key3_characters.webp",
    keyswitch_home_campground: "/textures/room/texture_set_keyswitch_home_campground.webp",
    mechanical_creature: "/textures/room/texture_set_mechanical_creature.webp",
    scene: "/textures/room/texture_set_scene.webp",
    watch: "/textures/room/texture_set_watch.webp",
};

// These assets belong to standalone scenes and are fetched only when the
// visitor opens them, keeping roughly 1.9 MB plus model decode work out of
// the initial loading path.
const deferredTextureKeys = new Set(['campground', 'gallery']);

const loadedTextures = {

};

Object.entries(textureMap).forEach(([key, value]) => {
    if (deferredTextureKeys.has(key)) return;
    const texture = textureLoader.load(value);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    loadedTextures[key] = texture;
});

const sharedTextureMaterials = Object.fromEntries(
    Object.entries(loadedTextures).map(([key, texture]) => [
        key,
        new THREE.MeshBasicMaterial({ map: texture }),
    ]),
);

const gltfLoader = new GLTFLoader(loadingManager);
gltfLoader.setDRACOLoader(dracoLoader);
const deferredTextureLoader = new THREE.TextureLoader();
const deferredGltfLoader = new GLTFLoader();
deferredGltfLoader.setDRACOLoader(dracoLoader);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const interactiveMeshes = [];
let hoveredMesh = null;
let lastHoveredGroupKey = null;
let raycastDirty = true;
let hudPositionDirty = true;
const hoverRaycastHits = [];
let renderedSceneLabel = null;
let renderedSceneLabelVisible = false;

// Background music + a short blip on hovering any interact_* prop. On by
// default - toggled off/on by clicking interact_volume like any other key
// (see the groupKey === 'volume' special-case in the click listener below)
// rather than a separate DOM control. Drop the actual files into
// public/audio/ (see the README there); until then play() just rejects
// quietly, so the toggle is a harmless no-op.
const backgroundMusic = new Audio();
backgroundMusic.preload = 'none';
backgroundMusic.src = '/audio/background-music.mp3';
backgroundMusic.loop = true;
backgroundMusic.volume = 0.6;

// Swapped in for backgroundMusic while zoomed into the campground diorama
// (see the "esc" scene's onEnter/onExit below), then swapped back out on exit.
const forestSound = new Audio();
forestSound.preload = 'none';
forestSound.src = '/audio/forest_sound.mp3';
forestSound.loop = true;
forestSound.volume = 0.6;

let currentMusicTrack = backgroundMusic;

// Pauses whichever track is currently playing and starts `track` in its
// place (only if music is currently enabled) - used to switch the ambient
// music per-scene rather than always looping backgroundMusic.
function switchMusicTrack(track) {
    if (currentMusicTrack === track) return;

    currentMusicTrack.pause();
    currentMusicTrack = track;
    if (isMusicEnabled && hasUnlockedAudio) currentMusicTrack.play().catch(() => {});
}

const hoverSound = new Audio();
hoverSound.preload = 'none';
hoverSound.src = '/audio/hover1.mp3';
hoverSound.volume = 0.7;

function playHoverSound() {
    hoverSound.currentTime = 0;
    hoverSound.play().catch(() => {});
}

const stickerPlaceSound = new Audio();
stickerPlaceSound.preload = 'none';
stickerPlaceSound.src = '/audio/hover2.mp3';
stickerPlaceSound.volume = 0.7;

function playStickerPlaceSound() {
    stickerPlaceSound.currentTime = 0;
    stickerPlaceSound.play().catch(() => {});
}

// Only these groupKeys play the hover blip - the rest of interactiveMeshes
// (diorama props revealed inside a zoomed-in scene, character pieces, etc.)
// stay silent on hover.
const hoverSoundGroupKeys = new Set([
    '1', '2', '3', 'about', 'me', 'z', 'x', 'c', 'home', 'f12', 'light', 'esc',
    'control_creature', 'capslock', 'shift', 'control', 'windows', 'alt', 'volume',
    'up', 'down', 'left', 'right',
]);

let isMusicEnabled = true;
let hasUnlockedAudio = false;

function setMusicEnabled(enabled) {
    isMusicEnabled = enabled;

    if (enabled && hasUnlockedAudio) {
        currentMusicTrack.play().catch(() => {});
    } else {
        currentMusicTrack.pause();
    }
}

function toggleMusic() {
    setMusicEnabled(!isMusicEnabled);
}

setMusicEnabled(true);

// Support physical media controls even when they are handled by the browser
// rather than delivered as an ordinary KeyboardEvent.
if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => setMusicEnabled(true));
    navigator.mediaSession.setActionHandler('pause', () => setMusicEnabled(false));
}

window.addEventListener('keydown', (event) => {
    if (event.key !== 'MediaPlayPause' || event.repeat) return;
    event.preventDefault();
    toggleMusic();
});

// Browsers block audio-with-sound until a user gesture unlocks the page, so
// the play() call above likely just rejected - retry once on the very first
// pointerdown/keydown anywhere, since by then a real gesture has happened.
function unlockBackgroundMusicOnFirstGesture() {
    hasUnlockedAudio = true;
    if (isMusicEnabled && currentMusicTrack.paused) currentMusicTrack.play().catch(() => {});
}
window.addEventListener('pointerdown', unlockBackgroundMusicOnFirstGesture, { once: true });
window.addEventListener('keydown', unlockBackgroundMusicOnFirstGesture, { once: true });

// The standalone campground diorama - hidden until interact_esc is clicked
// (see the "esc" scene's onEnter/onExit below), unlike the rest of the props
// which stay visible in the overview at all times.
let campgroundGroup = null;

// The standalone gallery diorama - same hidden-until-entered pattern as
// campgroundGroup above, but toggled by interact_3's expanded view instead
// (see enterGallery further down), which also hides mainModelGroup for the
// duration so the gallery reads as its own space rather than something
// tucked into a corner of the desk.
let galleryGroup = null;
let campgroundReadyPromise = null;
let galleryReadyPromise = null;

// The root of the main desk/keyboard scene (set once the primary GLB below
// finishes loading) - hidden while inside interact_3's gallery scene.
let mainModelGroup = null;

// The desk/floor plane (captured during the main GLB traverse below) that
// click-to-place stickers land on. Named "scene_mat" in the source file -
// the large flat mesh underneath everything else in the room. DecalGeometry
// clips against this mesh's own triangles (rather than assuming a flat
// plane), so a sticker would still conform to any bump/curve in this
// surface's own geometry if it had one.
let stickerTargetMesh = null;

// scene_scene is a separate mesh that sits over/around scene_mat (same desk
// area, different surface) - without checking it too, a raycast aimed at
// scene_mat would still register a hit even when scene_scene is the thing
// actually facing the camera there, letting you "click through" it to place
// a sticker on scene_mat behind/under it. Captured alongside stickerTargetMesh
// during the main GLB traverse below.
let stickerOccluderMesh = null;

// True only when the nearest thing the raycaster hits is scene_mat itself -
// i.e. scene_scene isn't in the way at this point. Used for both the actual
// placement click and the hover cursor check, so the two stay consistent.
function raycastStickerTargetHit() {
    if (!stickerTargetMesh) return null;
    const candidates = stickerOccluderMesh ? [stickerTargetMesh, stickerOccluderMesh] : [stickerTargetMesh];
    const intersections = raycaster.intersectObjects(candidates, false);
    const nearest = intersections[0];
    return nearest && nearest.object === stickerTargetMesh ? nearest : null;
}

// The five regular sticker designs (public/stickers/sticker_1.webp ..
// sticker_5.webp) - one is picked at random per placement in placeSticker
// below.
const stickerTextures = [1, 2, 3, 4, 5].map((n) => {
    const texture = textureLoader.load(`/stickers/sticker_${n}.webp`);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
});

// sticker_6 is a reward design, kept out of the random stickerTextures pool
// above - it's forced (once, oversized) as the very next sticker placed
// after every interaction has been found, see the click handler below.
const stickerBonusTexture = textureLoader.load('/stickers/sticker_6.webp');
stickerBonusTexture.colorSpace = THREE.SRGBColorSpace;
const stickerBonusSizeMultiplier = 1.5;
let bonusStickerAvailable = false;
let bonusStickerSpawned = false;

// depthWrite: false + polygonOffset keep the decal from z-fighting with the
// surface it's projected onto - the standard settings for THREE.DecalGeometry
// (see the three.js webgl_decals example).
const stickerDecalMaterial = new THREE.MeshBasicMaterial({
    // Overwritten per-placement with a random pick from stickerTextures
    // (see placeSticker) - set here only so the material has a valid map
    // before the first sticker is ever placed.
    map: stickerTextures[0],
    // Dims the (unlit) decal down from the texture's raw colors so stickers
    // don't read as blown-out under the scene's lighting.
    color: 0x9f9f9f,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
});

// Reused every placement purely to turn a hit point + surface normal into the
// euler angles DecalGeometry wants, rather than allocating one per click.
const stickerOrientationHelper = new THREE.Object3D();
const stickerLookTarget = new THREE.Vector3();
const stickerSurfaceNormal = new THREE.Vector3();
const stickerNormalMatrix = new THREE.Matrix3();
const stickerSize = new THREE.Vector3(1, 1, 1);

// Placement animation ("peeling" the sticker down onto the surface) and
// lifetime - how long it stays before fading back out on its own.
const stickerPeelInDuration = 0.45;
const stickerPeelLiftDistance = 0.06;
const stickerPeelStartScale = 1.35;
const stickerLifetimeSeconds = 6;
const stickerFadeOutDuration = 0.6;

// Brief cooldown after each placement so a single click (or an accidental
// double-click) can't stamp down a cluster of overlapping stickers at once.
const stickerPlacementCooldownMs = 400;
let stickerCooldownUntil = 0;

// Every decal clones stickerDecalMaterial's base polygonOffsetFactor, so two
// stickers landing near the same spot (increasingly likely as they pile up)
// would otherwise sit at the exact same depth-buffer offset and z-fight with
// each other rather than just the desk surface. Each placement nudges its
// own offset further from the surface than the last (and bumps renderOrder
// to match), so overlapping stickers always resolve to a stable draw order
// instead of flickering.
let stickerPlacementCounter = 0;

// Projects a flat decal onto stickerTargetMesh at the raycast hit point,
// oriented to the surface normal there. DecalGeometry bakes its vertices in
// world space (it clips against the mesh's world-space triangles), so the
// decal is added straight to `scene` rather than parented under
// stickerTargetMesh - that mesh carries a heavily non-uniform world scale
// (baked in from the source file), and Object3D.attach() can't decompose the
// shear that combination produces into a valid local transform. Adding
// directly to the scene sidesteps that entirely; the mesh is static at
// runtime so there's no "stays put if the mesh moves" tradeoff to worry about.
function placeSticker(intersection, { forcedTexture = null, sizeMultiplier = 1, noFade = false } = {}) {
    playStickerPlaceSound();

    const targetMesh = intersection.object;

    // A plain transformDirection(matrixWorld) only gives the correct normal
    // for pure rotation/uniform-scale matrices - under stickerTargetMesh's
    // non-uniform scale it comes out skewed enough to flip decals away from
    // the camera. The inverse-transpose ("normal matrix") is what correctly
    // carries a normal through non-uniform scale.
    stickerNormalMatrix.getNormalMatrix(targetMesh.matrixWorld);
    stickerSurfaceNormal.copy(intersection.face.normal)
        .applyMatrix3(stickerNormalMatrix)
        .normalize();

    stickerOrientationHelper.position.copy(intersection.point);
    stickerLookTarget.copy(intersection.point).add(stickerSurfaceNormal);
    stickerOrientationHelper.lookAt(stickerLookTarget);
    // Spin the decal randomly around the surface normal so repeated stickers
    // don't all land facing the same way.
    stickerOrientationHelper.rotateZ(Math.random() * Math.PI * 2);

    const decalSize = sizeMultiplier === 1 ? stickerSize : stickerSize.clone().multiplyScalar(sizeMultiplier);
    const geometry = new DecalGeometry(targetMesh, intersection.point, stickerOrientationHelper.rotation, decalSize);
    // Re-center the (world-space-baked) geometry on the hit point, so the
    // mesh's own position/scale - animated below for the peel-in - transform
    // around the sticker's own center instead of the scene origin.
    geometry.translate(-intersection.point.x, -intersection.point.y, -intersection.point.z);

    // Cloned per placement (rather than sharing stickerDecalMaterial) so each
    // sticker's fade-in/fade-out opacity tween is independent of every other
    // one currently on screen.
    const material = stickerDecalMaterial.clone();
    material.map = forcedTexture || stickerTextures[Math.floor(Math.random() * stickerTextures.length)];
    material.opacity = 0;
    // Stagger each placement's offset (wrapped so it stays bounded across a
    // long session) so stickers landing near the same spot don't share a
    // depth-buffer offset with each other - see stickerPlacementCounter above.
    material.polygonOffsetFactor -= stickerPlacementCounter % 20;

    const decal = new THREE.Mesh(geometry, material);
    decal.position.copy(intersection.point).addScaledVector(stickerSurfaceNormal, stickerPeelLiftDistance);
    decal.scale.setScalar(stickerPeelStartScale);
    decal.renderOrder = stickerPlacementCounter;
    stickerPlacementCounter += 1;
    scene.add(decal);

    // "Peeling" placement: starts lifted slightly off the surface (along its
    // own normal) and a touch oversized, then settles flush and fades in -
    // reads as pressing/smoothing a sticker down rather than it just popping
    // into existence.
    gsap.to(decal.position, {
        x: intersection.point.x, y: intersection.point.y, z: intersection.point.z,
        duration: stickerPeelInDuration, ease: 'back.out(1.7)',
    });
    gsap.to(decal.scale, { x: 1, y: 1, z: 1, duration: stickerPeelInDuration, ease: 'back.out(1.7)' });
    gsap.to(material, { opacity: 1, duration: stickerPeelInDuration * 0.6, ease: 'power1.out' });

    // Auto-disappear after a while, fading out before actually being removed
    // - skipped for the reward sticker_6 placement (noFade: true), which
    // sticks around permanently instead.
    if (!noFade) {
        gsap.to(material, {
            opacity: 0,
            duration: stickerFadeOutDuration,
            delay: stickerLifetimeSeconds,
            ease: 'power1.in',
            onComplete: () => {
                scene.remove(decal);
                geometry.dispose();
                material.dispose();
            },
        });
    }
}

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

// Direct URL routes skip the enter gate and therefore skip playIntroWave().
// These decorative props begin at scale zero specifically for that wave, so
// routed entry (and any gallery return) must explicitly restore them.
function ensureIntroPropsVisible() {
    interactiveMeshes
        .filter((mesh) => nonKeycapGroupKeys.has(mesh.userData.groupKey))
        .forEach((mesh) => {
            gsap.killTweensOf(mesh.scale);
            if (mesh.userData.initialScale) mesh.scale.copy(mesh.userData.initialScale);
        });
    nonKeycapGroupKeys.forEach((groupKey) => revealingGroupKeys.delete(groupKey));
}

// These groups share an identical stage[0] zoom (same position/lookAt), so once
// zoomed into that shared shot, clicking any of the others should carry on into
// its own stage[1] instead of requiring the exact same key that was first clicked.
// "3" shares this same stage[0] too, but it has no stage[1] of its own - a
// second click once already on it (whether it got there via '1', '2', or '3'
// itself) goes straight to enterGallery instead of advancing a further stage
// (see galleryGroupKey/galleryStageIndex and scenes['3'] below).
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
let zoomStageIndex = 0;
let zoomedLiftsMesh = false;
// True only for scenes flagged freeCamera below (currently just the
// campground) - lets the camera keep orbiting once fully zoomed in instead
// of staying locked to the stage's fixed shot like every other scene.
let zoomedFreeCamera = false;
const preZoomCameraPosition = new THREE.Vector3();
const preZoomCameraTarget = new THREE.Vector3();
const defaultCameraPosition = new THREE.Vector3(0.723, 12.210, 0.834);
const defaultCameraTarget = new THREE.Vector3(0.723, 1.018, 0.155);

const panCenter = new THREE.Vector3(0.723, 1.018, 0.155);
const renderPanOffset = new THREE.Vector3();
const renderClampedTarget = new THREE.Vector3();
const renderPanCorrection = new THREE.Vector3();
const renderTargetScale = new THREE.Vector3();
const maxPanDistance = 6;
const minPanY = 0.5;
const maxPanY = 15;

// Keyed by mesh groupKey (i.e. the button's name with the "interact_" prefix
// stripped) so each scene is named after the button that opens it.
const scenes = {
    contact: {
        liftMesh: true,
        onArrive: showContactLinkedIn,
        onExit: hideContactLinkedIn,
        stages: [
            {
                position: new THREE.Vector3(2.055, 1.550, -0.206),
                lookAt: new THREE.Vector3(2.051, 1.447, -0.542),
            },
        ],
    },
    duck: {
        liftMesh: false,
        label: { title: 'Knife Duck', date: '7 April 2023', client: 'bazarnov3d' },
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
        onArrive: scheduleAboutWebpage,
        stages: [
            {
                position: new THREE.Vector3(-1.527, 2.819, 0.647),
                lookAt: new THREE.Vector3(-1.527, 0.904, 0.607),
            },
        ],
    },
    me: {
        liftMesh: false,
        onArrive: scheduleAboutWebpage,
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
        label: { title: 'Cottagecore', date: '6 July 2026' },
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
        label: { title: 'Watch Diorama', date: '7 April 2025' },
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
        // Shares its only stage with '1'/'2' (see sharedFirstStageGroupKeys) -
        // the actual switch into the gallery's standalone diorama happens as
        // soon as the user clicks interact_3 a second time from there (see
        // galleryGroupKey/galleryStageIndex and enterGallery further down),
        // with no separate single-key zoom stage in between.
        // interact_table lives in the gallery's own diorama (a separate glb,
        // not this scene's own button group - same pattern as f12/hitbox's
        // own extraInteractiveGroupKeys above) - stays hoverable/clickable
        // for as long as zoomedGroupKey is '3', which covers the whole
        // gallery visit (see enterGalleryTable further down).
        extraInteractiveGroupKeys: ['table'],
        stages: [
            {
                position: new THREE.Vector3(-2.788, 2.091, 0.038),
                lookAt: new THREE.Vector3(-2.787, 1.203, -0.309),
            },
        ],
    },
    light: {
        liftMesh: false,
        // Single-stage scene with nothing further to click through, so once
        // the camera lands it just sits there idle - ease it into a slow
        // orbit around the lookAt point (the light fixture) instead, and
        // stop as soon as the scene is left.
        onArrive: () => { controls.autoRotate = true; },
        onExit: () => { controls.autoRotate = false; },
        stages: [
            {
                position: new THREE.Vector3(8.607, 8.217, 10.468),
                lookAt: new THREE.Vector3(2.736, -0.412, 0.498),
            },
        ],
    },
    esc: {
        liftMesh: false,
        prepare: ensureCampgroundReady,
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

const sceneRouteMap = {
    contact: 'contact',
    duck: 'duck',
    about: 'about',
    skytower: 'f12',
    home: 'home',
    'mechanical-creature': 'control_creature',
    cottage: 'hitbox',
    'desktop-room': '1',
    elements: '2',
    gallery: '3',
    light: 'light',
    campground: 'esc',
};

const sceneSlugByGroupKey = Object.fromEntries(
    Object.entries(sceneRouteMap).map(([slug, groupKey]) => [groupKey, slug]),
);

function getRouteFromLocation() {
    const projectPathMatch = location.pathname.match(/\/project-([^/]+)\/?$/);
    if (projectPathMatch) return { type: 'project', slug: projectPathMatch[1] };

    const legacyScenePathMatch = location.pathname.match(/\/scene-([^/]+)\/?$/);
    if (legacyScenePathMatch && sceneRouteMap[legacyScenePathMatch[1]]) {
        return { type: 'scene', slug: legacyScenePathMatch[1], legacy: true };
    }

    const scenePathMatch = location.pathname.match(/\/([^/]+)\/?$/);
    if (scenePathMatch && sceneRouteMap[scenePathMatch[1]]) {
        return { type: 'scene', slug: scenePathMatch[1] };
    }

    const hashMatch = location.hash.match(/^#(project|scene)-(.+)$/);
    return hashMatch ? { type: hashMatch[1], slug: hashMatch[2] } : null;
}

function getRouteBasePath() {
    const route = getRouteFromLocation();
    if (!route) return location.pathname;
    const suffix = route.type === 'project'
        ? `project-${route.slug}`
        : route.legacy ? `scene-${route.slug}` : route.slug;
    return location.pathname.replace(new RegExp(`${suffix}/?$`), '');
}

function routeUrl(type, slug) {
    const base = getRouteBasePath();
    if (!slug) return base;
    return type === 'scene' ? `${base}${slug}` : `${base}project-${slug}`;
}

function replaceRoute(type, slug) {
    history.replaceState(null, '', `${routeUrl(type, slug)}${location.search}`);
}

function setSceneRoute(groupKey) {
    const slug = sceneSlugByGroupKey[groupKey];
    if (slug) replaceRoute('scene', slug);
}

// Total number of camera-moving interactions - one per distinct scenes[]
// entry (after the about/me merge above), since that object doubles as
// "every groupKey a click can actually zoom into" (see the `if (scene)`
// check in handleInteraction). Known synchronously, so the top-left counter
// can show its real denominator before the model loads.
const totalInteractionCount = new Set(Object.keys(scenes).map(countedInteractionGroupKey)).size;
const interactionCounterLabel = document.querySelector('.interaction-counter-label');

function updateInteractionCounter() {
    interactionCounterValue.textContent = `${discoveredGroupKeys.size}/${totalInteractionCount}`;
    interactionCounterValue.style.fontSize = '';
    hudPositionDirty = true;

    requestAnimationFrame(() => {
        const labelWidth = interactionCounterLabel.getBoundingClientRect().width;
        const valueWidth = interactionCounterValue.getBoundingClientRect().width;
        const baseFontSize = Number.parseFloat(getComputedStyle(interactionCounterValue).fontSize);
        if (labelWidth > 0 && valueWidth > 0 && Number.isFinite(baseFontSize)) {
            interactionCounterValue.style.fontSize = `${baseFontSize * (labelWidth / valueWidth)}px`;
        }
    });
}

updateInteractionCounter();
document.fonts?.ready.then(updateInteractionCounter);

const environmentMap = new THREE.CubeTextureLoader(loadingManager)
    .setPath('/textures/skybox/')
    .load([
        'px.webp', 'nx.webp', 'py.webp', 'ny.webp', 'pz.webp', 'nz.webp'

    ]);

const sharedTransparentMaterial = new THREE.MeshPhysicalMaterial({
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

gltfLoader.load("/models/portfolio_project_model_v15_compressed.glb", (glb) => {
    glb.scene.traverse((child) => {
        if (!child.isMesh) return;

        // Superseded by the dedicated campground_compressed.glb (loaded
        // below, gated on the esc key) - hide this low-detail placeholder so
        // the two don't overlap.
        if (child.name === "keyswitch_home_campground_Campground") {
            child.visible = false;
        }

        if (child.name === "scene_mat") {
            stickerTargetMesh = child;
        }

        if (child.name === "scene_scene") {
            stickerOccluderMesh = child;
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
            child.material = sharedTransparentMaterial;
            return;
        }

        Object.keys(loadedTextures).forEach((key) => {
            if (child.name.includes(key)) {
                child.material = sharedTextureMaterials[key];

                if (child.material.map) {
                    child.material.map.minFilter = THREE.LinearMipmapLinearFilter;
                }
            }
        });
    });

    mainModelGroup = glb.scene;
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

    camera.position.copy(defaultCameraPosition);
    controls.target.copy(defaultCameraTarget);
    controls.update();
});

// Standalone campground diorama - loaded only when interact_esc is opened.
function ensureCampgroundReady() {
    if (campgroundGroup) return Promise.resolve(campgroundGroup);
    if (campgroundReadyPromise) return campgroundReadyPromise;

    campgroundReadyPromise = Promise.all([
        deferredTextureLoader.loadAsync(textureMap.campground),
        deferredGltfLoader.loadAsync('/models/campground_v2_compressed.glb'),
    ]).then(([texture, glb]) => {
        texture.flipY = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        loadedTextures.campground = texture;

        const material = new THREE.MeshBasicMaterial({ map: texture });
        campgroundGroup = glb.scene;
        campgroundGroup.traverse((child) => {
            if (child.isMesh) child.material = material;
        });

        campgroundGroup.position.set(-9.53, 0.56, -3.63);
        campgroundGroup.visible = isContactZoomedIn && zoomedGroupKey === 'esc';
        scene.add(campgroundGroup);
        return campgroundGroup;
    }).catch((error) => {
        campgroundReadyPromise = null;
        throw error;
    });

    return campgroundReadyPromise;
}

// Standalone gallery diorama - likewise loaded on its first visit.
function ensureGalleryReady() {
    if (galleryGroup) return Promise.resolve(galleryGroup);
    if (galleryReadyPromise) return galleryReadyPromise;

    galleryReadyPromise = Promise.all([
        deferredTextureLoader.loadAsync(textureMap.gallery),
        deferredGltfLoader.loadAsync('/models/gallery_v3_compressed.glb'),
    ]).then(([texture, glb]) => {
        texture.flipY = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        loadedTextures.gallery = texture;

        const material = new THREE.MeshBasicMaterial({ map: texture });
        galleryGroup = glb.scene;
        galleryGroup.traverse((child) => {
            if (!child.isMesh) return;
            child.material = material;

            if (child.name.includes('interact')) {
                child.userData.initialScale = child.scale.clone();
                child.userData.initialPosition = child.position.clone();
                child.userData.groupKey = getInteractGroupKey(child.name);
                child.userData.isKeyboardKey = false;
                interactiveMeshes.push(child);
            }
        });

        galleryGroup.position.set(0, 0, 0);
        galleryGroup.visible = false;
        scene.add(galleryGroup);
        return galleryGroup;
    }).catch((error) => {
        galleryReadyPromise = null;
        throw error;
    });

    return galleryReadyPromise;
}

const scene = new THREE.Scene();
window.__debugScene = scene;

const camera = new THREE.PerspectiveCamera( 45, sizes.width / sizes.height, 0.1, 1000 );

camera.position.z = 5;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(3, 5, 2);
scene.add(directionalLight);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize( sizes.width, sizes.height );
const maxPixelRatio = 1.5;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));

document.body.appendChild( renderer.domElement );

// Shared with resetFreeCameraBounds below, which restores this exact value
// once a free-camera scene (the campground) is left.
const overviewMinDistance = 1;

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.rotateSpeed = 0.25;
controls.zoomSpeed = 0.45;
controls.panSpeed = 0.5;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = overviewMinDistance;
controls.maxDistance = 15;
// Slow idle orbit used by scenes that flag onArrive/onExit with
// controls.autoRotate (currently just "light") - autoRotate spins around
// controls.target regardless of controls.enabled, since OrbitControls only
// gates it on its own drag state, not the enabled flag (see its update()).
controls.autoRotateSpeed = 0.6;

controls.addEventListener('end', () => {
    const p = camera.position;
    const t = controls.target;
    console.log(`camera.position.set(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)});`);
    console.log(`controls.target.set(${t.x.toFixed(3)}, ${t.y.toFixed(3)}, ${t.z.toFixed(3)});`);
    scheduleNavigationInstructions();
});

function hideNavigationInstructions() {
    clearTimeout(navigationIdleTimer);
    navigationIdleTimer = null;
    navigationInstructions.classList.remove('visible');
}

function scheduleNavigationInstructions() {
    clearTimeout(navigationIdleTimer);
    navigationIdleTimer = setTimeout(() => {
        navigationIdleTimer = null;
        if (
            !isContactZoomedIn
            && !isAnimatingCamera
            && !isWebpageOpen
            && !isMenuOpen
            && !isEnterGateOpen
        ) {
            navigationInstructions.classList.add('visible');
        }
    }, 5000);
}

// Hide immediately on every new orbit/pan/zoom gesture. The matching `end`
// listener above starts a fresh five-second idle countdown.
controls.addEventListener('start', () => {
    hideNavigationInstructions();
});

controls.addEventListener('change', () => {
    raycastDirty = true;
    hudPositionDirty = true;
});

//event listeners
window.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycastDirty = true;
});

// Animates camera.position and controls.target together over a fixed
// duration/easing. Killing/restarting from the camera's current (possibly
// mid-tween) position means rapid re-clicks - e.g. a double-click - redirect
// smoothly instead of the previous frame-by-frame lerp letting one
// in-flight target silently get swapped for another.
function animateCameraTo(position, lookAt, { duration = 1.15, ease = 'sine.inOut', onComplete } = {}) {
    cameraTween?.kill();
    hideNavigationInstructions();

    isAnimatingCamera = true;
    controls.enabled = false;
    const restoreDamping = controls.enableDamping;
    // OrbitControls keeps an internal spherical/damping state. If that state
    // is left behind while GSAP moves position/target directly, its next
    // update performs a visible final "correction", especially after the user
    // entered About from an angled overview. Keep it synchronized throughout
    // the tween without allowing residual damping to steer the camera.
    controls.enableDamping = false;
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
            controls.update();
        },
        onComplete: () => {
            camera.position.copy(position);
            controls.target.copy(lookAt);
            controls.update();
            controls.enableDamping = restoreDamping;
            isAnimatingCamera = false;
            // Run the caller's onComplete first so it can flip isContactZoomedIn
            // (e.g. the exit-to-overview tween below) before we decide whether
            // to re-enable controls - otherwise this would lock controls back
            // out using the stale, still-zoomed-in flag.
            onComplete?.();
            if (!isContactZoomedIn) scheduleNavigationInstructions();
            // Stay locked out while zoomed into a scene; only free the
            // camera once the tween lands back on the pre-zoom overview -
            // except free-camera scenes (the campground), which unlock as
            // soon as they've arrived rather than waiting for an exit.
            controls.enabled = !isContactZoomedIn || zoomedFreeCamera;
        },
        onInterrupt: () => {
            controls.enableDamping = restoreDamping;
        },
    });
}

// #switching-scenes fades in/out over 0.5s (its own CSS transition) - a
// pending move/hide is tracked below so it can be cancelled if the user
// grabs the camera mid-exit (see interruptExitToOverview).
const switchingScenesFadeMs = 500;
const switchingScenesHoldMs = 550;
const sceneExitDuration = 1.15;
const stageBackDuration = 1.15;
const galleryTableExitDuration = 1.15;
const webpageExitDurationMs = 1000;
let switchingScenesStartTimeout = null;
let switchingScenesHideTimeout = null;
let previousAnimalFactIndex = -1;
const animalFacts = [
    'Sea otters sometimes hold hands while sleeping so they do not drift apart.',
    'Cows can form close friendships and may become stressed when separated.',
    'Penguins often take turns keeping their eggs warm.',
    'Rats make tiny chirping sounds when they are tickled.',
    'Elephants comfort one another with gentle touches and soft sounds.',
    'Dolphins use unique signature whistles a little like names.',
    'Prairie dogs greet family members with a nuzzle that looks like a kiss.',
    'Baby puffins are called pufflings.',
    'Cats sometimes give slow blinks as a sign of trust.',
    'Red pandas wrap their fluffy tails around themselves to keep warm.',
    'Ducklings can communicate with one another before they hatch.',
    'Squirrels sometimes adopt orphaned babies from their extended family.',
];

function showSwitchingScenes() {
    let factIndex;
    do {
        factIndex = Math.floor(Math.random() * animalFacts.length);
    } while (factIndex === previousAnimalFactIndex && animalFacts.length > 1);
    previousAnimalFactIndex = factIndex;
    switchingScenesFact.textContent = `Fact: ${animalFacts[factIndex].replace(/\.$/, '')}`;
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
function animateCameraBehindOverlay(position, lookAt, { onCovered, onComplete, ...options } = {}) {
    showSwitchingScenes();
    switchingScenesStartTimeout = setTimeout(() => {
        switchingScenesStartTimeout = null;
        Promise.resolve(onCovered?.()).catch((error) => {
            // A failed precompile should not leave the user trapped behind
            // the switching screen; the destination can still render using
            // the browser's normal lazy compilation path.
            console.warn('Scene preparation did not complete cleanly:', error);
        }).then(() => {
            animateCameraTo(position, lookAt, {
                ...options,
                onComplete: () => {
                    onComplete?.();
                    switchingScenesHideTimeout = setTimeout(hideSwitchingScenes, switchingScenesHoldMs);
                },
            });
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

// True only once interact_3's expanded view has actually been clicked
// through into the gallery diorama (see enterGallery below) - not just while
// zoomed into the keycap itself. Lets finishExitingToOverview/exitZoomedScene
// know to undo the mainModelGroup/galleryGroup swap and treat the exit glide
// as a full scene change, without scenes['3'] needing its own onExit/
// transitionOverlay that would also fire for a plain keycap zoom-out.
let isGalleryEntered = false;

// Keeps the gallery camera centred on the room instead of allowing it to
// pan through walls or orbit around behind the diorama.
const galleryCameraBounds = {
    azimuthSpreadRad: THREE.MathUtils.degToRad(55),
    polarSpreadRad: THREE.MathUtils.degToRad(22),
    zoomInFactor: 0.55,
};

function showGalleryTableHint() {
    if (
        !isGalleryEntered
        || !galleryGroup?.visible
        || isGalleryTableZoomedIn
        || isWebpageOpen
    ) return;
    galleryTableHint.classList.add('visible');
    hudPositionDirty = true;
}

function hideGalleryTableHint() {
    galleryTableHint.classList.remove('visible');
    galleryTableHint.style.visibility = '';
}

const galleryHintBounds = new THREE.Box3();
const galleryHintAnchor = new THREE.Vector3();
const galleryHintSize = new THREE.Vector3();

function updateGalleryTableHintPosition() {
    if (!galleryTableHint.classList.contains('visible')) return;
    if (
        !isGalleryEntered
        || !galleryGroup?.visible
        || isGalleryTableZoomedIn
        || isWebpageOpen
    ) {
        hideGalleryTableHint();
        return;
    }
    if (!hudPositionDirty) return;

    const tableMeshes = interactiveMeshes.filter(
        (mesh) => mesh.userData.groupKey === 'table' && mesh.visible,
    );
    if (!tableMeshes.length) {
        galleryTableHint.style.visibility = 'hidden';
        return;
    }

    galleryHintBounds.makeEmpty();
    tableMeshes.forEach((mesh) => galleryHintBounds.expandByObject(mesh));
    galleryHintBounds.getCenter(galleryHintAnchor);
    galleryHintBounds.getSize(galleryHintSize);

    // Lift the anchor above the table's world-space bounding box, then
    // project it through the live camera into screen coordinates.
    galleryHintAnchor.y = galleryHintBounds.max.y + galleryHintSize.y * 1.15;
    galleryHintAnchor.project(camera);

    const isOnScreen =
        galleryHintAnchor.z >= -1
        && galleryHintAnchor.z <= 1
        && Math.abs(galleryHintAnchor.x) <= 1.1
        && Math.abs(galleryHintAnchor.y) <= 1.1;

    galleryTableHint.style.visibility = isOnScreen ? 'visible' : 'hidden';
    if (!isOnScreen) return;

    galleryTableHint.style.left = `${(galleryHintAnchor.x * 0.5 + 0.5) * sizes.width}px`;
    galleryTableHint.style.top = `${(-galleryHintAnchor.y * 0.5 + 0.5) * sizes.height}px`;
}

const lastInteractionBounds = new THREE.Box3();
const lastInteractionAnchor = new THREE.Vector3();
const lastInteractionSize = new THREE.Vector3();

function updateLastInteractionHintPosition() {
    const canShow =
        discoveredGroupKeys.size === totalInteractionCount - 1
        && !isContactZoomedIn
        && !isAnimatingCamera
        && !isWebpageOpen
        && !isMenuOpen
        && !isEnterGateOpen;

    if (!canShow) {
        if (lastInteractionHint.classList.contains('visible')) {
            lastInteractionHint.classList.remove('visible');
            lastInteractionHint.style.visibility = '';
        }
        return;
    }

    if (!hudPositionDirty && lastInteractionHint.classList.contains('visible')) return;

    const remainingGroupKey = [...new Set(Object.keys(scenes).map(countedInteractionGroupKey))]
        .find((groupKey) => !discoveredGroupKeys.has(groupKey));
    const remainingMeshes = interactiveMeshes.filter((mesh) =>
        countedInteractionGroupKey(mesh.userData.groupKey) === remainingGroupKey
        && mesh.visible,
    );

    if (!remainingMeshes.length) {
        lastInteractionHint.classList.remove('visible');
        return;
    }

    lastInteractionBounds.makeEmpty();
    remainingMeshes.forEach((mesh) => lastInteractionBounds.expandByObject(mesh));
    lastInteractionBounds.getCenter(lastInteractionAnchor);
    lastInteractionBounds.getSize(lastInteractionSize);
    lastInteractionAnchor.y = lastInteractionBounds.max.y + Math.max(lastInteractionSize.y, 0.08) * 1.4;
    lastInteractionAnchor.project(camera);

    const isOnScreen =
        lastInteractionAnchor.z >= -1
        && lastInteractionAnchor.z <= 1
        && Math.abs(lastInteractionAnchor.x) <= 1.05
        && Math.abs(lastInteractionAnchor.y) <= 1.05;

    lastInteractionHint.classList.add('visible');
    lastInteractionHint.style.visibility = isOnScreen ? 'visible' : 'hidden';
    if (!isOnScreen) return;

    lastInteractionHint.style.left = `${(lastInteractionAnchor.x * 0.5 + 0.5) * sizes.width}px`;
    lastInteractionHint.style.top = `${(-lastInteractionAnchor.y * 0.5 + 0.5) * sizes.height}px`;
}

// Clicking interact_3 again once already on its shared stage[0] shot (see
// galleryGroupKey/galleryStageIndex) swaps the whole scene into the
// gallery's standalone diorama - same transitionOverlay-covered glide +
// freeCamera handoff a fresh freeCamera scene entry gets (see
// handleInteraction's initial-zoom branch), just triggered from a second
// click already zoomed onto the shared shot instead of from the overview.
// onComplete: fires once the camera lands on the gallery's overview shot -
// openGalleryFromMenu below chains straight into enterGalleryTable so
// clicking "Projects" ends up exactly where clicking interact_table would,
// instead of stopping one click short at the bare diorama.
function enterGallery(onComplete) {
    isGalleryEntered = true;
    zoomedFreeCamera = true;
    sceneExitButton.classList.add('visible');

    animateCameraBehindOverlay(
        new THREE.Vector3(-0.200, 0.354, 0.800),
        new THREE.Vector3(0.141, 0.100, -0.306),
        {
            onCovered: async () => {
                // Do not expose the scene swap, model completion, or the
                // first material/shader compile before the transition is
                // fully opaque.
                await ensureGalleryReady();
                if (mainModelGroup) mainModelGroup.visible = false;
                galleryGroup.visible = true;
                await renderer.compileAsync(scene, camera);
            },
            onComplete: () => {
                applyFreeCameraBounds(galleryCameraBounds);
                showGalleryTableHint();
                onComplete?.();
            },
        },
    );
}

// True once interact_table has been clicked and the camera has zoomed in on
// it - only then does showGalleryProjectsDisplay actually get called (see
// handleInteraction's 'table' branch below). Reset alongside
// hideGalleryProjectsDisplay in exitZoomedScene so leaving and re-entering
// the gallery requires clicking the table again.
let isGalleryTableZoomedIn = false;

// Where the camera was, within the gallery diorama, right before dollying in
// on the table - captured so the "X" shortcut below can dolly back out to
// that exact free-roam spot instead of snapping to the fixed gallery-entry
// shot (the camera is freeCamera the whole time it's in the gallery, so the
// user may well have orbited/panned before ever clicking the table).
const preTableCameraPosition = new THREE.Vector3();
const preTableCameraTarget = new THREE.Vector3();

// Dollies in on a hand-placed shot of interact_table - only reveals the
// carousel once that lands, the same "arrive, then open" beat interact_1/2's
// own webpage panel uses on their final stage.
function enterGalleryTable() {
    if (isGalleryTableZoomedIn) return;
    isGalleryTableZoomedIn = true;
    hideGalleryTableHint();
    // The one genuine "fresh start" for the carousel - reset here rather
    // than in showGalleryProjectsDisplay itself, since that's also called to
    // resurface the carousel after closing a project's detail page (see
    // closeWebpage), which should land back on whichever project was open,
    // not snap back to the first one.
    galleryDisplayIndex = 0;

    preTableCameraPosition.copy(camera.position);
    preTableCameraTarget.copy(controls.target);

    animateCameraTo(
        new THREE.Vector3(-0.113, 0.224, 0.583),
        new THREE.Vector3(0.168, 0.174, -0.376),
        { onComplete: showGalleryProjectsDisplay },
    );
}

// Reverses enterGalleryTable - hides the floating carousel and dollies back
// out to wherever the camera was in the gallery before it zoomed in on the
// table, without leaving the gallery diorama itself (see exitZoomedScene for
// that further step, chained after this by the "X" shortcut below on a
// second press).
function exitGalleryTable() {
    if (!isGalleryTableZoomedIn || isAnimatingCamera) return;
    isGalleryTableZoomedIn = false;
    hideGalleryProjectsDisplay();
    animateCameraTo(preTableCameraPosition, preTableCameraTarget, {
        duration: galleryTableExitDuration,
        ease: 'sine.inOut',
        onComplete: showGalleryTableHint,
    });
}

function finishExitingToOverview() {
    scenes[zoomedGroupKey]?.onExit?.();
    if (isGalleryEntered) {
        ensureIntroPropsVisible();
        if (mainModelGroup) mainModelGroup.visible = true;
        if (galleryGroup) galleryGroup.visible = false;
        isGalleryEntered = false;
    }
    if (zoomedFreeCamera) resetFreeCameraBounds();
    isContactZoomedIn = false;
    zoomedGroupKey = null;
    zoomStageIndex = 0;
    zoomedLiftsMesh = false;
    zoomedFreeCamera = false;
    isExitingToOverview = false;
    if (getRouteFromLocation()?.type === 'scene') replaceRoute();
}

// Leaves whichever scene is currently zoomed in and glides the camera back
// to the pre-zoom overview. Shared by handleInteraction's "click on empty
// space" fallback and #scene-exit's click handler below - free-camera
// scenes (the campground) skip that empty-click fallback entirely (an
// outside click there is just orbiting), so the button is their only way
// back in besides Escape.
function exitZoomedScene(onComplete) {
    if (!isContactZoomedIn || isAnimatingCamera) return;
    if (zoomedGroupKey === 'contact') hideContactLinkedIn();
    if (zoomedGroupKey === 'about' || zoomedGroupKey === 'me') {
        clearTimeout(aboutOpenTimer);
        aboutOpenTimer = null;
    }
    sceneExitButton.classList.remove('visible');
    if (isGalleryEntered) {
        hideGalleryTableHint();
        hideGalleryProjectsDisplay();
        isGalleryTableZoomedIn = false;
    }

    // Free-camera scenes constrain OrbitControls around their own arrival
    // angle. Release those constraints before animating home; otherwise each
    // controls.update() during the tween clamps the default overview vector
    // back toward the campground/gallery angle.
    if (zoomedFreeCamera) resetFreeCameraBounds();

    if (zoomedLiftsMesh) {
        interactiveMeshes
            .filter((mesh) => mesh.userData.groupKey === zoomedGroupKey)
            .forEach((mesh) => {
                gsap.to(mesh.position, {
                    x: mesh.userData.initialPosition.x,
                    y: mesh.userData.initialPosition.y,
                    z: mesh.userData.initialPosition.z,
                    duration: 1,
                    ease: 'power2.out',
                    overwrite: true,
                });
            });
    }

    // Covers the glide back out the same way the zoom-in does (see
    // handleInteraction's initial-zoom branch) - the exit crosses the
    // same long distance across the room, just in reverse. isGalleryEntered
    // covers interact_3 specifically: its scene entry itself is a plain
    // (non-overlay) keycap zoom, so only the exit out of the gallery diorama
    // reached via enterGallery needs the overlay, not exiting from the
    // keycap zoom before ever reaching it.
    const exitingTransitionOverlay = isGalleryEntered || scenes[zoomedGroupKey]?.transitionOverlay;
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
        // A full scene swap always returns to the canonical home view. The
        // pre-entry camera may have been heavily orbited or panned, making
        // the main scene reappear from a disorienting angle.
        animateCameraBehindOverlay(defaultCameraPosition, defaultCameraTarget, {
            duration: sceneExitDuration,
            ease: 'sine.inOut',
            onComplete: finish,
        });
    } else {
        animateCameraTo(preZoomCameraPosition, preZoomCameraTarget, {
            duration: sceneExitDuration,
            ease: 'sine.inOut',
            onComplete: finish,
        });
    }
    // Set after the call: animateCameraTo clears this flag itself at its
    // top (any fresh tween supersedes a prior exit-in-progress), so it
    // must only be (re)armed once *this* exit tween is the active one.
    isExitingToOverview = true;
}

// Drives both mouse clicks and keyboard shortcuts (1/2/3) through the same
// zoom/lift/advance logic, keyed on the group that was interacted with
// rather than the hovered mesh itself, so a keypress can act exactly like
// clicking its corresponding interact_<n> mesh.
function handleInteraction(targetGroupKey) {
    if (isWebpageOpen || isMenuOpen || isAnimatingCamera || isExitingToOverview) return;

    // interact_table only exists (and is only raycastable) once inside the
    // gallery diorama - handled here rather than falling into the desk
    // keyboard's own zoom/advance state machine below, since it's a further
    // dolly-in on top of the gallery's existing freeCamera shot, not a fresh
    // scenes[] entry (see enterGalleryTable above).
    if (targetGroupKey === 'table' && isGalleryEntered && !isGalleryTableZoomedIn) {
        enterGalleryTable();
        return;
    }

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
            animateCameraTo(nextStage.position, nextStage.lookAt);
            return;
        }

        // Re-clicking interact_3 once already settled on its shared stage[0]
        // shot - whether it got there via '1', '2', or '3' itself - doesn't
        // step back out or advance a further camera stage: it swaps the whole
        // scene into the gallery diorama instead. Guarded on !isGalleryEntered
        // so a second re-click (or pressing "3" again) once already inside the
        // gallery falls through to the toggle-exit below instead of trying to
        // enter it twice.
        if ((stillOnSameObject || canSwitchSharedGroup) && !nextStage && !isGalleryEntered
            && nextTargetGroupKey === galleryGroupKey && zoomStageIndex === galleryStageIndex) {
            zoomedGroupKey = nextTargetGroupKey;
            enterGallery();
            return;
        }

        // Clicking outside any interactive mesh, or re-clicking the same key
        // once there's no further stage to advance to (e.g. interact_1/2's
        // own stage[1] shot), steps back to the previous stage instead of
        // exiting all the way out to the pre-zoom view. Skipped while
        // isGalleryEntered - re-triggering interact_3 (only reachable via the
        // keyboard shortcut, since the keycap mesh itself is hidden by then)
        // should toggle-exit the gallery like Escape does for the campground,
        // not step the camera back onto a now-hidden desk shot.
        if (zoomStageIndex > 0 && !isGalleryEntered && (targetGroupKey === null || (stillOnSameObject && !nextStage))) {
            const previousStage = scenes[zoomedGroupKey].stages[zoomStageIndex - 1];
            zoomStageIndex -= 1;
            animateCameraTo(previousStage.position, previousStage.lookAt, {
                duration: stageBackDuration,
                ease: 'sine.inOut',
            });
            return;
        }

        exitZoomedScene();
        return;
    }

    if (targetGroupKey === null) return;

    const scene = scenes[targetGroupKey];

    if (scene) {
        setSceneRoute(targetGroupKey);
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
                        duration: 1,
                        ease: 'power2.out',
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
            // A freeCamera scene with no freeCameraBounds (e.g. the gallery,
            // meant to be freely explorable, or while a shot is still being
            // tuned) is left fully unrestricted - same rotate/pan/zoom range
            // as the overview - rather than requiring bounds. Checked via
            // scene.freeCameraBounds itself, not just zoomedFreeCamera: this
            // closure reads the live (mutable) zoomedFreeCamera binding, not
            // a snapshot from whenever it was created, so it can still fire
            // after a *later* click has flipped zoomedFreeCamera true for a
            // different reason - e.g. interact_3's own second click swapping
            // into the gallery (see enterGallery) before this same-key first
            // click's own tween has finished arriving. Without this check
            // that race called applyFreeCameraBounds(undefined), which set
            // controls.enablePan = false (its first line) right before
            // throwing on the bounds it never got - silently killing panning
            // in the gallery on essentially every visit.
            if (zoomedFreeCamera && scene.freeCameraBounds) applyFreeCameraBounds(scene.freeCameraBounds);
            // Only fires for single-stage scenes (e.g. about/me) - their one
            // stage is also their final destination, unlike multi-stage
            // scenes (e.g. "1") where stage[0] is just the shared overview
            // shot on the way in.
            if (stages.length === 1) scene.onArrive?.();
        };

        if (scene.transitionOverlay) {
            animateCameraBehindOverlay(firstStage.position, firstStage.lookAt, {
                onCovered: scene.prepare,
                onComplete: onArrived,
            });
        } else {
            animateCameraTo(firstStage.position, firstStage.lookAt, { onComplete: onArrived });
        }
    }
}

window.addEventListener('click', (event) => {
    // The enter gate sits on top of the whole scene (see #enter-gate in
    // style.scss) but this listener is window-level, so without this guard
    // a click anywhere on the gate - not just its buttons - would still
    // reach whatever key/sticker surface happens to be underneath it.
    if (isEnterGateOpen) return;

    // Checked against isWebpageOpen's value from *before* this click is
    // processed, so the very click that opens the panel (isWebpageOpen still
    // false here) never immediately closes itself further down.
    if (isWebpageOpen && !webpageContent.contains(event.target)) {
        const closingAboutPage = webpageContent.classList.contains('about-page');
        closeWebpage();
        if (closingAboutPage && isContactZoomedIn) exitZoomedScene();
        return;
    }

    // Same click-outside-closes pattern as the side panel above - the bottom
    // panel only ever opens via scroll (see the wheel listener below), so
    // there's no risk of the opening click racing this check the way the
    // side panel's did.
    const groupKey = hoveredMesh ? hoveredMesh.userData.groupKey : null;

    // First click on any prop that actually has a scene (i.e. really zooms the
    // camera somewhere) counts it as "found" for the top-left counter - keys
    // like interact_volume or the plain Ctrl key don't move the camera at all
    // (see the `if (scene)` check in handleInteraction), so they don't count.
    const countedGroupKey = countedInteractionGroupKey(groupKey);
    if (groupKey !== null && scenes[groupKey] && !discoveredGroupKeys.has(countedGroupKey)) {
        discoveredGroupKeys.add(countedGroupKey);
        updateInteractionCounter();

        if (discoveredGroupKeys.size === totalInteractionCount) {
            bonusStickerAvailable = true;
            interactionCounterValue.classList.add('complete');
        }
    }

    // interact_volume mutes/unmutes instead of zooming into a scene - same
    // isWebpageOpen/isMenuOpen guard handleInteraction applies to every other
    // key, so it's a no-op while either is open rather than toggling behind them.
    if (groupKey === 'volume') {
        if (!isWebpageOpen && !isMenuOpen) toggleMusic();
        return;
    }

    // Free-camera scenes (the campground) let you orbit around once zoomed
    // in, so a plain click on empty space is just orbiting - dragging still
    // fires a click on release - not "click outside to leave". #scene-exit
    // (or Escape) is the way out instead.
    if (groupKey === null && zoomedFreeCamera) return;

    // A plain click that didn't land on any interactive key normally does
    // nothing in the overview (handleInteraction(null) below is a no-op
    // there), so stamping a sticker down on the bare desk/floor can't steal
    // a click meant for anything else.
    if (groupKey === null && !isContactZoomedIn && !isWebpageOpen && !isMenuOpen
        && stickerTargetMesh && Date.now() >= stickerCooldownUntil) {
        raycaster.setFromCamera(pointer, camera);
        const stickerHit = raycastStickerTargetHit();
        if (stickerHit) {
            if (bonusStickerAvailable && !bonusStickerSpawned) {
                bonusStickerSpawned = true;
                interactionCounterValue.classList.remove('complete');
                interactionCounterValue.classList.add('reward-claimed');
                placeSticker(stickerHit, {
                    forcedTexture: stickerBonusTexture,
                    sizeMultiplier: stickerBonusSizeMultiplier,
                    noFade: true,
                });
            } else {
                placeSticker(stickerHit);
            }
            stickerCooldownUntil = Date.now() + stickerPlacementCooldownMs;
            return;
        }
    }

    handleInteraction(groupKey);
});

// Some meshes use the interact_ prefix so they can share the keyboard hover
// animation, but intentionally have no click action (for example Control and
// Alt). Only show the hand cursor for groups the click handler can activate.
function isClickableInteraction(groupKey) {
    if (!groupKey) return false;
    if (groupKey === 'volume') return true;
    if (groupKey === 'table') {
        return isGalleryEntered && !isGalleryTableZoomedIn;
    }
    return Boolean(scenes[groupKey]);
}

// Project data shared by the gallery carousel and the full-page project
// detail interface. The five entries with a
// groupKey carry real title/date/(client) metadata already established in
// `scenes` above - their "VIEW IN 3D" button drops the camera straight into
// that actual keycap scene. Every other field (category/role/description)
// below is this session's best reading of what each render depicts, not
// confirmed copy - swap in the real thing whenever you have it.
const projectsData = [
    { key: 'watch-diorama', title: 'Watch Diorama', image: '/images/image_3.webp', date: '7 April 2025', category: '—', role: 'Modelling', description: 'Using 3D environments to explode a watch and contrast its mechanical structure with the warmth of a miniature cafe and workstation', groupKey: '2' },
    { key: 'desktop-room', title: 'Desktop Room', image: '/images/image_2.webp', date: '20 January 2025', category: 'Andrew Woan', role: 'Modelling', description: 'The dream room with all creative power, warm and ambient lighting', groupKey: '1' },
    { key: 'cottagecore', title: 'Cottagecore', image: '/images/image_1.webp', date: '6 July 2026', category: '—', role: 'Modelling', description: 'A whimsical miniature village built between oversized keyboard keys', groupKey: 'hitbox' },
    { key: 'knife-duck', title: 'Knife Duck', image: '/images/image_5.webp', date: '7 April 2023', category: 'bazarnov3d', role: 'Sculpting', description: 'Run!', groupKey: 'duck' },
    { key: 'fractal-cubes', title: 'Fractal Cubes', image: '/images/image_12.webp', date: '23 March 2023', category: '—', role: 'Geometry Nodes', description: 'Experimentation with fractals, emissive textures and mathematical calculations using geometry nodes' },
    { key: 'cinematic-rain', title: 'Cinematic Rain', image: '/images/image_9.webp', date: '19 April 2023', category: '—', role: 'Realism', description: 'How do we hide 2D planes inside 3D environments? Raindrops made from 2D planes' },
    { key: 'gilded-fractal', title: 'Gilded Fractal', image: '/images/image_7.webp', date: '22 April 2023', category: '—', role: 'Geometry Nodes', description: 'Inverted faces could be gold!' },
    { key: 'dispersed-glass', title: 'Dispersed Glass', image: '/images/image_8.webp', date: '10 May 2023', category: 'atti', role: 'Geometry Nodes', description: 'An abstract material study using sweeping curved forms, translucent surfaces and reflections to create a futuristic tunnel-like composition' },
    { key: 'kauri-dieback-project', title: 'Kauri Dieback Project', image: '/images/image_17.webp', date: '21 October 2022', category: '—', role: 'Modelling', description: 'Ideation for a project using 3D modelling' },
    { key: 'wheres-my-cat', title: "Where's my Cat?", image: '/images/image_4.webp', date: '3 September 2024', category: 'The Goose Tavern', role: 'Grease Pencil', description: 'The name says it all' },
    { key: 'music-living-room', title: 'Music Living Room', image: '/images/image_11.webp', date: '29 December 2023', category: '—', role: 'Animation', description: 'Experimenting with low and high poly meshes to create a cohesive scene and learning about proportions' },
    { key: 'hillside-bloom', title: 'Hillside Bloom', image: '/images/image_10.webp', date: '19 December 2024', category: 'CG Geek', role: 'Realism', description: 'Learning about realism and modelling trees, including add-ons and the manual creation of textures' },
    { key: 'mechanical-creature', title: 'Mechanical Creature', image: '/images/image_14.webp', date: '2 July 2023', category: 'Polyford', role: 'Rigging', description: 'A rigged robotic spider concept built from articulated limbs, mechanical joints and cables to explore complex movement and animation', groupKey: 'control_creature' },
    { key: 'chunky-giraffe', title: 'Chunky Giraffe', image: '/images/image_6.webp', date: '6 April 2023', category: 'Gabbit', role: 'Sculpting', description: 'A 3D model of a giraffe capable of being 3D printed' },
    { key: 'animation-study', title: 'Animation Study', image: '/images/image_16.webp', date: '12 October 2022', category: 'Polygon Runaway', role: 'Animation', description: 'A stylised botanical study focused on natural branching patterns, leaf variation and a clean minimalist presentation' },
    { key: 'keyswitch-study', title: 'Keyswitch Study', image: '/images/image_13.webp', date: '3 March 2024', category: '—', role: 'Modelling', description: 'An experiment in turning objects in my room into digital 3D models' },
    { key: 'sailboat', title: 'Sailboat', image: '/images/image_15.webp', date: '5 January 2023', category: 'Polygon Runaway', role: 'Texturing', description: 'A stylised sailboat scene combining simplified modelling with a glossy sculpted water surface and soft studio lighting' },
    { key: 'the-start-of-the-journey', title: 'The Start of the Journey', image: '/images/image_19.webp', date: '17 September 2022', category: 'Polygon Runaway', role: 'Modelling', description: 'Discovered the power of 3D modelling through modelling a miniature house after a sequence of failed projects', groupKey: 'home' },
];

const projectIndexLabel = (project) => String(projectsData.indexOf(project) + 1).padStart(2, '0');

const legacyProjectRouteAliases = {
    elements: 'watch-diorama',
    'fractal-study': 'gilded-fractal',
    'duck-model': 'knife-duck',
    dewdrops: 'cinematic-rain',
    'ribbon-study': 'dispersed-glass',
    'garden-bench': 'kauri-dieback-project',
    'cat-in-a-bag': 'wheres-my-cat',
    'living-room': 'music-living-room',
    giraffe: 'chunky-giraffe',
    'leaf-study': 'animation-study',
    'little-house': 'the-start-of-the-journey',
    cottage: 'cottagecore',
};

function routeFromHash() {
    if (!assetsReady) return;

    const route = getRouteFromLocation();
    const projectKey = route?.type === 'project' ? route.slug : null;
    if (projectKey) {
        const resolvedKey = legacyProjectRouteAliases[projectKey] || projectKey;
        openProjectDetailPage(projectsData.find((project) => project.key === resolvedKey));
        return;
    }

    const sceneSlug = route?.type === 'scene' ? route.slug : null;
    const groupKey = sceneRouteMap[sceneSlug];
    if (!groupKey) return;

    if (groupKey === galleryGroupKey) {
        openGalleryFromMenu();
        return;
    }

    handleInteraction(groupKey);

    // Desktop Room and Elements have a shared establishing shot followed by
    // their actual detail shot. A direct route should land at the destination,
    // not stop at that intermediate camera position.
    if (scenes[groupKey]?.stages.length > 1) {
        const advanceWhenSettled = () => {
            if (isAnimatingCamera) {
                setTimeout(advanceWhenSettled, 50);
                return;
            }
            handleInteraction(groupKey);
        };
        setTimeout(advanceWhenSettled, 50);
    }
}

window.addEventListener('hashchange', () => {
    if (assetsReady) location.reload();
});
window.addEventListener('popstate', () => {
    if (assetsReady) location.reload();
});

let projectsDetailViewEl = null;
// Built fresh per showProjectDetail call and positioned directly inside the
// full-page panel so it shares that panel's bottom-slide animation.
let projectsDetailNavEl = null;

function discardProjectDetailInterface() {
    projectsDetailNavEl?.remove();
    projectsDetailNavEl = null;
    projectsDetailViewEl = null;
    webpageContent.querySelectorAll('#projects-root').forEach((el) => el.remove());
}

// Rebuilds the detail view from scratch for `project` - simpler than diffing
// the previous project's markup back out, and this view is never large
// enough for that to matter. The corner nav strip (bottom-right) lists every
// project so any one of them is always one click away, same as the
// reference layout.
function showProjectDetail(project) {
    if (!projectsDetailViewEl) return;

    // Keeps the gallery carousel (see galleryDisplayIndex) in step with
    // whichever project this page is actually showing - otherwise switching
    // projects here via the corner nav strip, then backing out to the
    // gallery (see the "Back to gallery" button), would resurface the
    // carousel on the project it had before, not the one just viewed.
    galleryDisplayIndex = projectsData.indexOf(project);

    const renderDetail = () => {
        projectsDetailViewEl.scrollTop = 0;
        projectsDetailViewEl.innerHTML = '';

        const info = document.createElement('div');
        info.className = 'projects-detail-info';

        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'projects-detail-back';
        back.textContent = '‹ Back to gallery';
        back.addEventListener('click', () => closeWebpage());

        const indexEl = document.createElement('p');
        indexEl.className = 'projects-detail-index';
        indexEl.textContent = projectIndexLabel(project);

        const title = document.createElement('h2');
        title.className = 'projects-detail-title';
        title.textContent = project.title;

        const desc = document.createElement('p');
        desc.className = 'projects-detail-desc';
        desc.textContent = project.description;

        const meta = document.createElement('div');
        meta.className = 'projects-detail-meta';
        const metaField = (label, value) => {
            const field = document.createElement('div');
            field.className = 'projects-detail-meta-field';
            const l = document.createElement('p');
            l.className = 'projects-detail-meta-label';
            l.textContent = label;
            const v = document.createElement('p');
            v.className = 'projects-detail-meta-value';
            v.textContent = value;
            field.append(l, v);
            return field;
        };
        meta.appendChild(metaField('INSPIRATION', project.category));
        meta.appendChild(metaField('MAIN SKILLS', project.role));
        if (project.date) meta.appendChild(metaField('DATE', project.date));

        info.append(back, indexEl, title, desc, meta);

        if (project.groupKey) {
            const cta = document.createElement('button');
            cta.type = 'button';
            cta.className = 'projects-detail-cta';
            cta.textContent = 'VIEW IN 3D';
            // Closes the project page and, once its bottom-slide has settled,
            // drops straight into this project's actual keycap scene - the
            // same zoom handleInteraction fires from an ordinary key click.
            // Opened from inside the gallery diorama, "where it
            // was" is the gallery itself (see openProjectDetailPage's
            // isGalleryEntered branch) - a real scene switch, unlike the
            // plain reopen-the-gallery close below, so this leaves it
            // properly (exitZoomedScene) before zooming into the new one.
            cta.addEventListener('click', () => {
                const cameFromGallery = isGalleryEntered;
                const openProjectIn3D = () => {
                    handleInteraction(project.groupKey);
                    // Project-page entry is a deliberate jump into a scene,
                    // so its exit should always return home rather than to
                    // the gallery/transitional camera captured above.
                    preZoomCameraPosition.copy(defaultCameraPosition);
                    preZoomCameraTarget.copy(defaultCameraTarget);
                };
                closeWebpage({ restoreGallery: !cameFromGallery });
                setTimeout(() => {
                    if (cameFromGallery) {
                        exitZoomedScene(openProjectIn3D);
                    } else {
                        openProjectIn3D();
                    }
                }, 850);
            });
            info.appendChild(cta);
        }

        const media = document.createElement('div');
        media.className = 'projects-detail-media';
        const mediaImg = document.createElement('img');
        mediaImg.src = project.image;
        mediaImg.alt = project.title;
        media.appendChild(mediaImg);

        projectsDetailViewEl.append(info, media);

        projectsDetailNavEl?.remove();
        const nav = document.createElement('div');
        nav.className = 'projects-detail-nav';
        projectsData.forEach((p) => {
            const thumb = document.createElement('a');
            thumb.href = routeUrl('project', p.key);
            thumb.className = 'projects-detail-nav-thumb';
            thumb.classList.toggle('active', p.key === project.key);
            thumb.setAttribute('aria-label', `View project: ${p.title}`);
            if (p.key === project.key) thumb.setAttribute('aria-current', 'page');
            const thumbImg = document.createElement('img');
            thumbImg.src = p.image;
            thumbImg.alt = '';
            thumbImg.loading = 'lazy';
            const thumbLabel = document.createElement('span');
            thumbLabel.className = 'projects-detail-nav-label';
            thumbLabel.textContent = `${projectIndexLabel(p)}  ${p.title}`;
            thumb.append(thumbImg, thumbLabel);
            thumb.addEventListener('click', (event) => {
                event.preventDefault();
                // showProjectDetail replaces this nav element immediately;
                // stop here so the detached click target cannot reach the
                // window-level "outside the page" close handler afterward.
                event.stopPropagation();
                if (dragMoved || p.key === project.key) return;
                showProjectDetail(p);
            });
            nav.appendChild(thumb);
        });

        // Click-and-drag horizontal scroll: overflow-x: auto alone only responds
        // to a scrollbar drag or a horizontal wheel/trackpad gesture, not a
        // plain mouse click-and-drag, and the scrollbar itself is hidden (see
        // style.scss). Mouse-only - touchscreens already pan an overflow-x:auto
        // strip natively, and layering this on top of that would double-handle
        // the same gesture.
        let dragStartX = 0;
        let dragStartScroll = 0;
        let dragMoved = false;
        let dragging = false;

        nav.addEventListener('pointerdown', (event) => {
            if (event.pointerType !== 'mouse') return;
            dragging = true;
            dragMoved = false;
            dragStartX = event.clientX;
            dragStartScroll = nav.scrollLeft;
            nav.classList.add('dragging');
        });

        nav.addEventListener('pointermove', (event) => {
            if (!dragging) return;
            const dx = event.clientX - dragStartX;
            if (Math.abs(dx) > 4 && !dragMoved) {
                dragMoved = true;
                // Capturing only after the drag threshold keeps ordinary
                // clicks targeted at the project link beneath the pointer.
                nav.setPointerCapture(event.pointerId);
            }
            nav.scrollLeft = dragStartScroll - dx;
        });

        const endDrag = (event) => {
            if (nav.hasPointerCapture(event.pointerId)) {
                nav.releasePointerCapture(event.pointerId);
            }
            dragging = false;
            nav.classList.remove('dragging');
        };
        nav.addEventListener('pointerup', endDrag);
        nav.addEventListener('pointercancel', endDrag);

        // A drag that actually moved the strip shouldn't also register as a
        // click on whichever thumb the cursor lands on - capture phase so this
        // runs before that thumb's own (bubble-phase) click listener above.
        nav.addEventListener('click', (event) => {
            if (dragMoved) {
                event.stopPropagation();
                event.preventDefault();
            }
        }, true);

        // Dragging over an <img> would otherwise kick off the browser's native
        // "drag this image" gesture instead of scrolling the strip.
        nav.addEventListener('dragstart', (event) => event.preventDefault());

        // Keep the strip outside the detail grid, but inside the full-page
        // panel. It can stay pinned to that viewport-sized panel while moving
        // in and out as part of the exact same transform.
        webpageContent.appendChild(nav);
        projectsDetailNavEl = nav;
        // Centre the active item by moving only this horizontal strip.
        // scrollIntoView() may also scroll transformed ancestors/the viewport,
        // which makes the full-page entrance appear to jump.
        const activeThumb = nav.querySelector('.active');
        if (activeThumb) {
            nav.scrollLeft = activeThumb.offsetLeft
                - ((nav.clientWidth - activeThumb.clientWidth) / 2);
        }
    };

    renderDetail();
}

// Opens the selected project directly in the current full-page detail
// interface. The legacy Projects index no longer sits underneath it.
function openProjectDetailPage(project) {
    if (!project || isWebpageOpen || isAnimatingCamera) return;
    replaceRoute('project', project.key);

    const open = () => {
        isWebpageOpen = true;
        // A reopen within closeWebpage's cleanup delay would otherwise still
        // fire and rip 'full-page'/'projects-open' back off this
        // freshly-opened page - see closeWebpage.
        clearTimeout(webpageCloseCleanupTimer);
        discardProjectDetailInterface();
        webpageContent.style.removeProperty('opacity');
        webpageContent.classList.remove('revealed');
        webpageContent.classList.add('full-page', 'preparing-project-slide');
        webpageContent.scrollTop = 0;
        controls.enabled = false;
        document.body.classList.add('projects-open');

        // The project page now has one motion only: the panel's bottom-slide.
        // Keep the camera fixed instead of layering the old drawer's camera
        // dive underneath it.
        preWebpageCameraPosition.copy(camera.position);
        webpageDiveTween?.kill();
        webpageDiveTween = null;

        // Hide (don't touch the text of) the shared heading and clear any
        // leftover paragraphs from a previous single-project open, then
        // build this page's own root fresh.
        webpageHeading.style.display = 'none';
        webpageContent.querySelectorAll('p.reveal').forEach((el) => el.remove());

        const root = document.createElement('div');
        root.id = 'projects-root';

        projectsDetailViewEl = document.createElement('div');
        projectsDetailViewEl.className = 'projects-detail-view';
        root.appendChild(projectsDetailViewEl);

        webpageContent.appendChild(root);
        showProjectDetail(project);

        // Paint the full-page panel at translateY(100%) with transitions
        // suppressed. Then arm its vertical transition from that settled
        // position before .open moves it to zero.
        void webpageContent.offsetHeight;
        webpageContent.classList.remove('preparing-project-slide');
        void webpageContent.offsetHeight;
        requestAnimationFrame(() => webpageOverlay.classList.add('open'));

        clearTimeout(webpageRevealTimer);
    };

    // Opened from inside the gallery diorama (see openGalleryProject) - the
    // camera is already parked somewhere worth staying on, so this opens
    // right on top of it instead of gliding all the way back out to the
    // pre-gallery overview first (see closeWebpage's matching restore, and
    // the "VIEW IN 3D" cta below which does still leave the gallery, just
    // once it actually needs to jump to a different scene).
    if (isGalleryEntered) {
        hideGalleryProjectsDisplay();
        open();
        return;
    }

    // Otherwise, glide back to the overview first if a scene is currently
    // zoomed in, then open once the camera has actually landed there.
    if (isContactZoomedIn) {
        exitZoomedScene(open);
    } else {
        open();
    }
}

// Floating project display shown while inside the gallery diorama (see
// enterGallery/exitZoomedScene above) - a fanned carousel of the same
// projectsData used by the Projects page, framed like it's sitting on the
// gallery's round table. Only a window of 5 entries (active +/- 2) is ever
// in the DOM at once and rebuilt on every step, rather than laying out all
// of projectsData and translating a track - simpler to keep correct across
// the wraparound than fighting a single continuous strip.
let galleryDisplayIndex = 0;

function galleryProjectAt(offset) {
    const len = projectsData.length;
    return projectsData[((galleryDisplayIndex + offset) % len + len) % len];
}

// Opens straight into a project's detail view - shares openProjectDetailPage's
// own exit-the-gallery-first handling (see isContactZoomedIn there), so a
// card click reads as one continuous move: out of the diorama, into the page.
function openGalleryProject(project) {
    openProjectDetailPage(project);
}

const GALLERY_SLIDE_MS = 400;
const GALLERY_SLIDE_DISTANCE = 40;
const GALLERY_CARD_ENTER_DISTANCE = 60;

// Guards a step's text crossfade against being clobbered by a faster-firing
// later step (e.g. the user clicking Next twice in quick succession) - only
// the most recently scheduled swap is allowed to actually apply, so an
// earlier one landing late can't swap stale text back in.
let galleryStepToken = 0;

// Cards are kept as persistent DOM nodes, keyed by project.key, and updated
// in place on every step rather than torn down and rebuilt - that's what
// lets the FLIP animation below move/resize the *same* element instead of
// hard-cutting to a freshly built one. distanceClassName below controls
// their resting size/opacity per slot (see .gallery-projects-card--active/
// --near/--far in style.scss).
const galleryCardEls = new Map();

function distanceClassName(distance) {
    return distance === 0 ? 'active' : distance === 1 ? 'near' : 'far';
}

function buildGalleryCard(project) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'gallery-projects-card';

    const img = document.createElement('img');
    img.src = project.image;
    img.alt = project.title;
    img.loading = 'lazy';

    card.append(img);
    return card;
}

// Rebuilds the 5-card window (active +/- 2) around the current
// galleryDisplayIndex. When animate is false (first open) cards just render
// at rest. When animate is true (stepping), this plays a FLIP transition:
// cards that persist across the step are moved/resized in place rather than
// replaced, so the carousel reads as one continuous shuffle - the same
// "distance-from-active eases together" feel the per-card transitions in
// style.scss were written for, but which never got to play out while every
// step wiped and rebuilt the DOM from scratch.
function renderGalleryProjectsCards(animate, direction) {
    const offsets = [-2, -1, 0, 1, 2];
    const windowProjects = offsets.map((offset) => galleryProjectAt(offset));
    const windowKeys = new Set(windowProjects.map((project) => project.key));

    const oldRects = animate
        ? new Map([...galleryCardEls].map(([key, el]) => [key, el.getBoundingClientRect()]))
        : null;

    // Cards that fell out of the window this step: detach them from the flex
    // flow at their last on-screen spot (so pulling them out doesn't jump
    // the cards that remain) and let them slide/fade away independently.
    galleryCardEls.forEach((el, key) => {
        if (windowKeys.has(key)) return;
        galleryCardEls.delete(key);
        if (!animate) { el.remove(); return; }

        const rect = el.getBoundingClientRect();
        el.style.position = 'fixed';
        el.style.margin = '0';
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
        el.style.opacity = '0';
        el.style.transform = `translateX(${direction * GALLERY_CARD_ENTER_DISTANCE}px)`;
        setTimeout(() => el.remove(), GALLERY_SLIDE_MS);
    });

    offsets.forEach((offset, i) => {
        const project = windowProjects[i];
        const distance = Math.abs(offset);
        let card = galleryCardEls.get(project.key);
        const isNew = !card;

        if (isNew) {
            card = buildGalleryCard(project);
            galleryCardEls.set(project.key, card);
        }

        card.className = `gallery-projects-card gallery-projects-card--${distanceClassName(distance)}`;
        // The active (center) card opens straight into that project; a side
        // card instead just re-centers the carousel onto it, same as clicking
        // a non-active thumb in the Projects page's own corner nav.
        card.onclick = (event) => {
            event.stopPropagation();
            if (offset === 0) {
                openGalleryProject(project);
            } else {
                stepGalleryDisplay(offset);
            }
        };

        galleryProjectsTrack.appendChild(card);

        if (isNew && animate) {
            card.style.transition = 'none';
            card.style.opacity = '0';
            card.style.transform = `translateX(${direction * GALLERY_CARD_ENTER_DISTANCE}px)`;
        }
    });

    if (!animate) return;

    // FLIP: pin every persisted card back to the exact screen position/size
    // it had before this step (translate + scale, from rect centers so it
    // works regardless of transform-origin), then release it into the
    // card's own transition in the same tick - it's why the resize and the
    // reposition read as one continuous motion instead of two separate ones.
    galleryCardEls.forEach((el, key) => {
        const oldRect = oldRects.get(key);
        if (!oldRect) return;

        const newRect = el.getBoundingClientRect();
        const dx = (oldRect.left + oldRect.width / 2) - (newRect.left + newRect.width / 2);
        const dy = (oldRect.top + oldRect.height / 2) - (newRect.top + newRect.height / 2);
        const scaleX = oldRect.width / newRect.width;
        const scaleY = oldRect.height / newRect.height;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(scaleX - 1) < 0.01 && Math.abs(scaleY - 1) < 0.01) return;

        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
    });

    // Force layout so the instant "from" transforms above are actually
    // painted before the transition re-enables below - otherwise the browser
    // coalesces both style changes into one and there's nothing to animate
    // from.
    void galleryProjectsTrack.offsetHeight;

    galleryCardEls.forEach((el) => {
        el.style.transition = '';
        el.style.transform = '';
        el.style.opacity = '';
    });
}

function renderGalleryProjectsText() {
    const active = galleryProjectAt(0);

    galleryProjectsTitle.textContent = active.title;
    galleryProjectsMeta.textContent = active.date || '';
    galleryProjectsCategoryValue.textContent = active.category;
    galleryProjectsRoleValue.textContent = active.role;
    galleryProjectsIndexValue.textContent = `${projectIndexLabel(active)} / ${String(projectsData.length).padStart(2, '0')}`;
}

function renderGalleryProjectsDisplay() {
    renderGalleryProjectsText();
    renderGalleryProjectsCards(false, 1);
}

function stepGalleryDisplay(delta) {
    const len = projectsData.length;
    galleryDisplayIndex = ((galleryDisplayIndex + delta) % len + len) % len;

    const token = ++galleryStepToken;
    const sign = delta > 0 ? 1 : -1;

    // Cards animate immediately via the FLIP pass above - a continuous
    // shuffle, not a rebuild, so it doesn't need to wait on the text below.
    renderGalleryProjectsCards(true, sign);

    // Header/footer text can't be FLIP'd (it's just different words), so it
    // keeps the old fade-out -> swap -> fade-in pattern: the text only
    // changes while it's invisible, so the change itself is never seen -
    // just the fade around it. The nav arrows themselves stay put so they
    // don't move out from under the cursor mid-click.
    const textTargets = [galleryProjectsHeader, galleryProjectsFooter];

    textTargets.forEach((el) => {
        el.style.transition = `transform ${GALLERY_SLIDE_MS}ms ease, opacity ${GALLERY_SLIDE_MS}ms ease`;
        el.style.transform = `translateX(${-sign * GALLERY_SLIDE_DISTANCE}px)`;
        el.style.opacity = '0';
    });

    setTimeout(() => {
        if (token !== galleryStepToken) return;
        renderGalleryProjectsText();

        textTargets.forEach((el) => {
            el.style.transition = 'none';
            el.style.transform = `translateX(${sign * GALLERY_SLIDE_DISTANCE}px)`;
        });
        // Force layout so the instant "from" styles above are actually
        // painted before the transition re-enables below - otherwise the
        // browser coalesces both style changes into one and there's nothing
        // to animate from.
        void galleryProjectsFooter.offsetHeight;
        textTargets.forEach((el) => {
            el.style.transition = `transform ${GALLERY_SLIDE_MS}ms ease, opacity ${GALLERY_SLIDE_MS}ms ease`;
            el.style.transform = '';
            el.style.opacity = '';
        });
    }, GALLERY_SLIDE_MS);
}

function showGalleryProjectsDisplay() {
    galleryProjectsTrack.innerHTML = '';
    galleryCardEls.clear();
    renderGalleryProjectsDisplay();
    galleryProjectsDisplay.classList.add('visible');
}

function hideGalleryProjectsDisplay() {
    galleryProjectsDisplay.classList.remove('visible');
}

galleryProjectsPrevButton.addEventListener('click', (event) => {
    event.stopPropagation();
    stepGalleryDisplay(-1);
});
galleryProjectsNextButton.addEventListener('click', (event) => {
    event.stopPropagation();
    stepGalleryDisplay(1);
});
galleryProjectsOpenButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openGalleryProject(galleryProjectAt(0));
});

// The gallery HUD fills the viewport, so any non-control click dismisses it
// and returns to the free-roam gallery. Buttons/cards keep their own actions.
galleryProjectsDisplay.addEventListener('click', (event) => {
    if (event.target.closest('button, a')) return;
    exitGalleryTable();
});

// Shared by the "about"/"me" keycaps (see their onArrive above) and the
// About nav link below - both route into the same page. Unlike every other
// page (a drawer that slides in over the still-moving scene, via
// openWebpage's shared camera-dive/slide plumbing), About is a centered card
// that fades in over a static, blurred backdrop - see .about-mode/.about-page
// in style.scss - so it gets its own open flow here rather than reusing
// openWebpage() and patching the result, which fought with it: adding
// .about-page and .open in the same tick meant the card's fade transition had
// no closed (opacity: 0) state to actually animate from, so it interpolated
// straight from the drawer's own translateX(100%) instead - a hybrid
// slide-then-fade. Forcing a reflow between the two fixes that.
function scheduleAboutWebpage() {
    clearTimeout(aboutOpenTimer);
    aboutOpenTimer = setTimeout(() => {
        aboutOpenTimer = null;
        if (
            isContactZoomedIn
            && !isExitingToOverview
            && (zoomedGroupKey === 'about' || zoomedGroupKey === 'me')
        ) {
            openAboutWebpage();
        }
    }, 500);
}

function openAboutWebpage() {
    isWebpageOpen = true;
    controls.enabled = false;

    // A reopen within closeWebpage's cleanup delay would otherwise still
    // fire and rip 'about-mode'/'about-page' back off this freshly-opened
    // page - see closeWebpage.
    clearTimeout(webpageCloseCleanupTimer);
    discardProjectDetailInterface();
    webpageContent.classList.remove('full-page');
    document.body.classList.remove('projects-open');
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
    paragraph.textContent = "i'm jerry, a self taught 3d designer building at the intersection of design, engineering and sustainability. i enjoy taking my combination of technical and creative skills to explore 3d environments in blender!";
    webpageContent.appendChild(paragraph);

    const headingText = 'about me';
    webpageHeading.dataset.text = headingText;

    // Flush the styles above - card is now .about-page but not yet .open, so
    // this paints its closed state (opacity: 0) for a frame before .open
    // flips it to opacity: 1 below, giving the transition a real starting
    // point instead of jumping in from the drawer's own transform.
    void webpageContent.offsetWidth;

    webpageOverlay.classList.add('open');
    document.body.classList.add('about-open');

    playTypewriter(webpageHeading, headingText);
    clearTimeout(webpageRevealTimer);
    // Begin the copy reveal with the card itself instead of waiting until
    // the card animation is almost finished.
    webpageRevealTimer = setTimeout(() => webpageContent.classList.add('revealed'), 50);
}

// Same entry point as the 3D "about"/"me" keycaps, but reachable straight
// from the nav without needing to find them on the desk first - routed
// through handleInteraction so it plays out identically to actually
// clicking that keycap (camera flies to it, *then* the page opens via the
// scene's own onArrive: openAboutWebpage in `scenes` above) instead of just
// snapping the page open with no camera movement.
function openAboutWebpageFromMenu() {
    if (isWebpageOpen || isAnimatingCamera) return;

    if (isContactZoomedIn) {
        exitZoomedScene(() => handleInteraction('about'));
    } else {
        handleInteraction('about');
    }
}

// Same idea as openAboutWebpageFromMenu above, but for the "contact" keycap -
// no onArrive of its own, so this just flies the camera to it exactly as
// clicking interact_contact would.
function openContactFromMenu() {
    if (isWebpageOpen || isAnimatingCamera) return;

    if (isContactZoomedIn) {
        exitZoomedScene(() => handleInteraction('contact'));
    } else {
        handleInteraction('contact');
    }
}

// Same idea as openAboutWebpageFromMenu/openContactFromMenu above, but for
// "Projects" - flies straight into the key-3 gallery diorama and on through
// to interact_table (the same two clicks interact_3's keycap, then the table
// itself, would take) instead of snapping the old flat Projects page open
// with no camera movement. Individual detail pages are reached through the
// gallery's active card (see openGalleryProject).
function openGalleryFromMenu() {
    if (isWebpageOpen || isAnimatingCamera) return;

    const enter = () => {
        setSceneRoute(galleryGroupKey);
        preZoomCameraPosition.copy(camera.position);
        preZoomCameraTarget.copy(controls.target);
        isContactZoomedIn = true;
        zoomedGroupKey = galleryGroupKey;
        zoomStageIndex = galleryStageIndex;
        zoomedLiftsMesh = false;
        enterGallery(enterGalleryTable);
    };

    if (isContactZoomedIn) {
        exitZoomedScene(enter);
    } else {
        enter();
    }
}

// restoreGallery: false skips resurfacing the gallery's floating carousel
// below - only passed by the "VIEW IN 3D" cta (see showProjectDetail), which
// is about to leave the gallery itself right after this call and would
// otherwise flash the carousel back in for a moment first.
function closeWebpage({ restoreGallery = true } = {}) {
    const closingProjectDetail = webpageContent.classList.contains('full-page');
    const closingAboutPage = webpageContent.classList.contains('about-page');
    const restoreGalleryAfterProjectSlide =
        closingProjectDetail && isGalleryEntered && restoreGallery;
    if (closingProjectDetail && getRouteFromLocation()?.type === 'project') {
        if (isGalleryEntered) replaceRoute('scene', 'gallery');
        else replaceRoute();
    }

    isWebpageOpen = false;
    webpageOverlay.classList.remove('open');
    webpageContent.classList.remove('revealed');
    controls.enabled = true;

    // Opened straight on top of the gallery diorama rather than after
    // leaving it (see openProjectDetailPage's isGalleryEntered branch) - still
    // zoomed in there underneath the whole time this was open, so closing
    // just resurfaces its floating carousel instead of exiting any scene.
    if (isGalleryEntered && restoreGallery && !closingProjectDetail) {
        showGalleryProjectsDisplay();
    }

    clearTimeout(typewriterTimer);
    clearTimeout(webpageRevealTimer);
    webpageDiveTween?.kill();

    // Project details and About never move the camera when their overlays
    // open. About also starts exitZoomedScene when its card is dismissed, so
    // running this legacy drawer-return tween at the same time would make two
    // GSAP tweens fight over camera.position and leave it at a skewed angle.
    if (closingProjectDetail || closingAboutPage) {
        webpageDiveTween = null;
    } else {
        webpageDiveTween = gsap.to(camera.position, {
            x: preWebpageCameraPosition.x,
            y: preWebpageCameraPosition.y,
            z: preWebpageCameraPosition.z,
            duration: 1.15,
            ease: 'sine.inOut',
        });
    }

    // Removing 'open' above already plays each variant's own close animation
    // (the drawer slides out via its transform, About's card fades back out
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
        if (
            webpageContent.classList.contains('about-page')
            || closingProjectDetail
        ) {
            webpageContent.style.opacity = '0';
        }

        webpageOverlay.classList.remove('about-mode');
        // A project closes vertically. Suppress transitions while removing
        // full-page so the shared element cannot then animate toward the
        // default drawer's translateX(100%) resting state.
        if (closingProjectDetail) {
            webpageContent.classList.add('preparing-project-slide');
            void webpageContent.offsetHeight;
        }
        webpageContent.classList.remove('about-page', 'full-page', 'preparing-project-slide');
        document.body.classList.remove('projects-open', 'about-open');

        if (closingProjectDetail) {
            discardProjectDetailInterface();
            // Keep the scene underneath visually still until the project
            // panel has completely cleared the viewport.
            if (restoreGalleryAfterProjectSlide) showGalleryProjectsDisplay();
        }
    }, webpageExitDurationMs + 50);
}

sceneExitButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!isContactZoomedIn) return;

    // The table carousel is one level inside the gallery. Back out to the
    // free-roam gallery first instead of having the visible X skip straight
    // past it to the main scene.
    if (isGalleryTableZoomedIn) {
        exitGalleryTable();
    } else {
        exitZoomedScene();
    }
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

// Tab previously moved focus onto the hidden menu controls and exposed the
// right-side drawer even though the user had not clicked the menu button.
// This portfolio uses the rendered keyboard as part of the scene, so keep the
// physical Tab key from activating that browser-focus path.
window.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    if (isMenuOpen) closeMenu();
    menuToggle.blur();
}, { capture: true });

siteMenuLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();

        if (link.dataset.menuLink === 'projects') openGalleryFromMenu();
        if (link.dataset.menuLink === 'about') openAboutWebpageFromMenu();
        if (link.dataset.menuLink === 'contact') openContactFromMenu();
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

    handleInteraction('esc');
});

// "X" is the gallery's own step-by-step back-out shortcut: the first press
// backs out of the table's floating carousel to the free-roam diorama (see
// exitGalleryTable above) without leaving the gallery itself; only once
// that's done does a second press leave the gallery entirely, via the same
// exitZoomedScene the #scene-exit button uses. event.repeat is ignored so
// holding the key down can't fire through both steps off one press.
window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'x' || event.repeat) return;
    if (isWebpageOpen || isMenuOpen || isAnimatingCamera) return;

    if (isGalleryTableZoomedIn) {
        exitGalleryTable();
    } else if (isGalleryEntered) {
        exitZoomedScene();
    }
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    raycastDirty = true;
    hudPositionDirty = true;
})

const render = () => {
    controls.update();

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
    if (activeLabel && activeLabel !== renderedSceneLabel) {
        sceneLabelTitle.textContent = activeLabel.title;
        sceneLabelDate.textContent = activeLabel.date;
        renderedSceneLabel = activeLabel;
    }
    const sceneLabelVisible = !!activeLabel && !isWebpageOpen && !isMenuOpen;
    if (sceneLabelVisible !== renderedSceneLabelVisible) {
        sceneLabel.classList.toggle('visible', sceneLabelVisible);
        renderedSceneLabelVisible = sceneLabelVisible;
    }

    if (!isAnimatingCamera && !isContactZoomedIn) {
        renderPanOffset.copy(controls.target).sub(panCenter);

        if (renderPanOffset.length() > maxPanDistance) {
            renderPanOffset.setLength(maxPanDistance);

            renderClampedTarget.copy(panCenter).add(renderPanOffset);
            renderPanCorrection.copy(renderClampedTarget).sub(controls.target);

            controls.target.copy(renderClampedTarget);
            camera.position.add(renderPanCorrection);
        }

        camera.position.y = THREE.MathUtils.clamp(camera.position.y, minPanY, maxPanY);
    }

    // The 3D scene sits behind every overlay (webpage panel, Projects page,
    // bottom panel, menu, enter gate) but pointermove is a window-level
    // listener, so the raycaster would otherwise keep hovering/popping/sounding
    // props right underneath whatever's actually covering the screen. Suspend
    // hover detection entirely while any of those are open instead.
    const isSceneObscured = isWebpageOpen || isMenuOpen || isEnterGateOpen;

    if (isSceneObscured) {
        hoveredMesh = null;
        lastHoveredGroupKey = null;
        canvas.style.cursor = 'default';
        raycastDirty = true;
    } else if (raycastDirty) {
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
        hoverRaycastHits.length = 0;
        raycaster.intersectObjects(raycastableMeshes, true, hoverRaycastHits);
        hoveredMesh = hoverRaycastHits.length > 0 ? hoverRaycastHits[0].object : null;

        // Sticker placement (see placeSticker) only applies in the plain
        // overview, on the bare desk/floor itself - crosshair hints that a
        // click there does something even though it's not an interactive key.
        const isHoveringStickerSurface = !hoveredMesh
            && !isContactZoomedIn
            && raycastStickerTargetHit() !== null;
        const hoveredGroupKey = hoveredMesh?.userData.groupKey ?? null;
        canvas.style.cursor = isClickableInteraction(hoveredGroupKey)
            ? 'pointer'
            : (isHoveringStickerSurface ? 'crosshair' : 'default');

        // Fires once per hover (on the group changing), not every frame the
        // pointer sits still over the same prop, and only for the whitelisted
        // groupKeys in hoverSoundGroupKeys.
        if (hoveredGroupKey
            && hoveredGroupKey !== lastHoveredGroupKey
            && hoverSoundGroupKeys.has(hoveredGroupKey)) {
            playHoverSound();
        }
        lastHoveredGroupKey = hoveredGroupKey;
        raycastDirty = false;
    }

    interactiveMeshes.forEach((mesh) => {
        const suppressContactHover = isContactZoomedIn
            && zoomedGroupKey === 'contact'
            && mesh.userData.groupKey === 'contact';
        const isHovered = !suppressContactHover && (
            (hoveredMesh !== null && mesh.userData.groupKey === hoveredMesh.userData.groupKey)
            || waveActiveGroupKeys.has(mesh.userData.groupKey)
        );

        if (!mesh.userData.isKeyboardKey) {
            // Owned by playIntroWave's scale-from-0 reveal tween until it
            // completes - left alone here so the two don't fight over scale.
            if (revealingGroupKeys.has(mesh.userData.groupKey)) return;

            // Character diorama pieces get a bigger hover pop than other props.
            const hoverScale = /^character\d+$/.test(mesh.userData.groupKey) ? 1.35 : 1.15;
            renderTargetScale.copy(mesh.userData.initialScale).multiplyScalar(isHovered ? hoverScale : 1);
            if (mesh.scale.distanceToSquared(renderTargetScale) > 1e-8) {
                mesh.scale.lerp(renderTargetScale, 0.15);
            }
            return;
        }

        // Skip meshes mid zoom-lift/return or currently lifted while zoomed in;
        // their position is owned by the gsap tween in the click handler.
        if (isAnimatingCamera || mesh.userData.groupKey === zoomedGroupKey) return;

        const isKeyboardPressed = keyboardPressedGroups.has(mesh.userData.groupKey);
        const targetPosition = (isHovered || isKeyboardPressed) ? mesh.userData.pressedPosition : mesh.userData.initialPosition;
        if (mesh.position.distanceToSquared(targetPosition) > 1e-8) {
            mesh.position.lerp(targetPosition, 0.35);
        }
    });

    updateGalleryTableHintPosition();
    updateLastInteractionHintPosition();
    hudPositionDirty = false;
    renderer.render(scene, camera);
    window.requestAnimationFrame(render);
};

render();

window.__testHooks = {
    handleInteraction,
    camera,
    controls,
    state: () => ({ isContactZoomedIn, zoomedGroupKey, zoomStageIndex, isAnimatingCamera, isExitingToOverview, zoomedFreeCamera, isGalleryEntered }),
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
    galleryGroup: () => galleryGroup,
    galleryBox: () => {
        if (!galleryGroup) return null;
        const box = new THREE.Box3().setFromObject(galleryGroup);
        return { min: box.min.toArray(), max: box.max.toArray() };
    },
    mainModelGroup: () => mainModelGroup,
    showGalleryProjectsDisplay,
    hideGalleryProjectsDisplay,
    stepGalleryDisplay,
};
