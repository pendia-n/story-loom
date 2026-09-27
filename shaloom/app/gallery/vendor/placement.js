'use strict';
const texture = require('./image');
const mat4 = require('gl-mat4');
const vec3 = require('gl-vec3');

const renderDist = 20;
const loadDist = 20;
const unloadDist = 40;
const fovxMargin = Math.PI/32;

const dynamicResPeriod = 3000;
let dynamicRes = "high";
let dynamicResTimer;

const culling = (ppos, pangle, fovx, {vseg, angle}) => {
    const sx1 = vseg[0][0] - ppos[0];
    const sy1 = vseg[0][1] - ppos[2];
    const sx2 = vseg[1][0] - ppos[0];
    const sy2 = vseg[1][1] - ppos[2];
    const angles = [angle, pangle - fovx/2 - fovxMargin + Math.PI/2, pangle + fovx/2 + fovxMargin - Math.PI/2];
    for(let a of angles) {
        const nx = Math.sin(a);
        const ny = -Math.cos(a);
        if(nx * sx1 + ny * sy1 < 0 && nx * sx2 + ny * sy2 < 0)
            return false;
    }
    return true;
};

module.exports = (regl, {placements, getAreaIndex}) => {
    //console.log(areas);
    let batch = [], shownBatch = [];
    let fetching = true;
    let initialFramesReady = false;
    const onInitialFramesLoaded = () => {
        fetching = false;
        if (initialFramesReady) return;
        initialFramesReady = true;
        window.dispatchEvent(new Event('shaloom:gallery-artwork-ready'));
    };
    const loadPainting = (p) => {
        const seg = placements[batch.length];
        // Calculate painting position, direction, normal angle and scale
        const dir = [seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]];
        const norm = [seg[1][1] - seg[0][1], seg[0][0] - seg[1][0]];
        const segLen = Math.hypot(dir[0], dir[1]);
        let globalScale = 4.5 / (3 + p.aspect); //tweaked to look good
        globalScale = Math.min(globalScale, segLen / p.aspect / 2.2); //clamp horizontal
        globalScale = Math.min(globalScale, 2 / 1.2); //clamp vertical
        const pos = [(seg[0][0] + seg[1][0]) / 2, 2.1 - globalScale, (seg[0][1] + seg[1][1]) / 2];
        const angle = Math.atan2(dir[1], dir[0]);
        const horiz = Math.abs(angle % 3) < 1 ? 1 : 0;
        const vert = 1 - horiz;
        const width = globalScale * p.aspect;
        const scale = [
            2 * width * horiz + 0.1 * vert,
            2 * globalScale,
            2 * width * vert + 0.1 * horiz];
        const text = p.textGen(width);
        const d1 = width / segLen;
        const d2 = 0.005 / Math.hypot(norm[0], norm[1]);
        // Visible painting segment for culling
        const vseg = [
            [pos[0] - dir[0] * d1 * 2, pos[2] - dir[1] * d1],
            [pos[0] + dir[0] * d1 * 2, pos[2] + dir[1] * d1]
        ];
        // Offset pos to account for painting width and depth
        pos[0] -= dir[0] * d1 + norm[0] * d2;
        pos[2] -= dir[1] * d1 + norm[1] * d2;
        // Calculate model matrix
        const model = [];
        mat4.fromTranslation(model, pos);
        mat4.scale(model, model, scale);
        mat4.rotateY(model, model, -angle);
        const textmodel = [];
        mat4.fromTranslation(textmodel, [pos[0], 1.7 - globalScale, pos[2]]);
        mat4.scale(textmodel, textmodel, [2,2,2]);
        mat4.rotateY(textmodel, textmodel, -angle);
        batch.push({ ...p, placementIndex: batch.length, vseg, angle, model, textmodel, text, width, textGen:null });
    };
    // Fetch the first textures
    texture.fetch(regl, 20, dynamicRes, loadPainting, onInitialFramesLoaded);
    return {
        update: (pos, angle, fovX) => {
            // Estimate player position index
            let index = getAreaIndex(pos[0], pos[2], 4);
            if (index === -1) return; // Out of bound => do nothing
            const playback = texture.playbackState();
            if (playback) {
                const activePainting = batch.find((painting) => painting.key === playback.key);
                if (activePainting && Math.abs(activePainting.placementIndex - index) > unloadDist) texture.stopPlayback();
            }
            // Unload far textures
            batch.slice(0, Math.max(0, index - unloadDist)).map(t => texture.unload(t));
            batch.slice(index + unloadDist).map(t => texture.unload(t));
            // Load close textures
            shownBatch = batch.slice(Math.max(0, index - renderDist), index + renderDist);
            shownBatch.map(t => texture.load(regl, t, dynamicRes));
            // Frustum / Orientation culling
            shownBatch = shownBatch.filter(t => t.tex && culling(pos, angle, fovX, t));
            texture.updateVideoTexture();
            // Fetch new textures
            if (index <= batch.length - loadDist) return;
            if (!fetching) {
                texture.fetch(regl, 10, dynamicRes, loadPainting, () => fetching = false);
                fetching = true;
            }
            // Update dynamic resolution
            dynamicRes = "low";
            if (dynamicResTimer) clearTimeout(dynamicResTimer);
            dynamicResTimer = setTimeout(() => dynamicRes = "high", dynamicResPeriod);
        },
        batch: () => shownBatch,
        pickRay: (origin, direction) => {
            let closest = null;
            for (const painting of batch) {
                const bottomLeft = vec3.transformMat4([], [0, 0, 1], painting.model);
                const bottomRight = vec3.transformMat4([], [1, 0, 1], painting.model);
                const topLeft = vec3.transformMat4([], [0, 1, 1], painting.model);
                const horizontal = vec3.sub([], bottomRight, bottomLeft);
                const vertical = vec3.sub([], topLeft, bottomLeft);
                const normal = vec3.cross([], horizontal, vertical);
                const denominator = vec3.dot(direction, normal);
                if (Math.abs(denominator) < 1e-6) continue;
                const distance = vec3.dot(vec3.sub([], bottomLeft, origin), normal) / denominator;
                if (distance <= 0 || (closest && distance >= closest.distance)) continue;
                const hit = vec3.add([], origin, vec3.scale([], direction, distance));
                const offset = vec3.sub([], hit, bottomLeft);
                const x = vec3.dot(offset, horizontal) / vec3.dot(horizontal, horizontal);
                const y = vec3.dot(offset, vertical) / vec3.dot(vertical, vertical);
                if (x < 0 || x > 1 || y < 0 || y > 1) continue;
                closest = { painting, distance };
            }
            return closest?.painting ?? null;
        },
        playMedia: (key) => {
            const painting = batch.find((item) => item.key === key);
            return painting ? texture.playMedia(painting) : Promise.resolve(false);
        },
        pauseMedia: () => texture.pauseMedia(),
        seekMedia: (time) => texture.seekMedia(time),
        playbackState: () => texture.playbackState(),
        clearMedia: () => texture.stopPlayback(),
        destroy: () => {
            if (dynamicResTimer) clearTimeout(dynamicResTimer);
            texture.stopPlayback(false);
        },
    };
};
