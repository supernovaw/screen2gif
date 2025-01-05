<script module>
    import { writable } from "svelte/store";
    import PausePlayIcon from "./PausePlayIcon.svelte";

    const persistentStore = writable({
        cropMode: false,
        crop: { x: 0, y: 0, w: 1, h: 1 },
        trimStartFraction: 0,
        trimEndFraction: 1,
        videoDuration: undefined,
        resumePlayback: 0,
    });
</script>

<script>
    // writable({ url: string, size: number, frameRate: number, preliminaryDuration: number, blob: Blob })
    export let recordedVideo;
    // writable(string[])
    export let ffmpegOpts;
    // { trimmedDuration: number }
    export let videoInfo;

    const minAllowedCropFraction = 0.01; // 1% the width/height of video
    const minAllowedTrimTime = 0.05; // 50ms

    $persistentStore.videoDuration ||= $recordedVideo.preliminaryDuration;
    let duration = $persistentStore.videoDuration;
    $: duration = $persistentStore.videoDuration;
    $: videoInfoString = formatVideoInfo($recordedVideo.frameRate, duration);

    let videoEl;
    let currentTime = $persistentStore.resumePlayback;
    let paused = !!currentTime;

    let cropX = $persistentStore.crop.x,
        cropY = $persistentStore.crop.y,
        cropW = $persistentStore.crop.w,
        cropH = $persistentStore.crop.h; // all within [0..1]
    let draggedCropAnchor; // tl|tr|bl|br|center
    let anchorDragStartPageX, anchorDragStartPageY; // in px
    let anchorDragStartVideoX,
        anchorDragStartVideoY,
        anchorDragStartVideoW,
        anchorDragStartVideoH; // in fractions ([0..1])
    let noEffectiveCrop =
        cropX === 0 && cropY === 0 && cropW === 1 && cropH === 1;

    let trimStart = $persistentStore.trimStartFraction * duration,
        trimEnd = $persistentStore.trimEndFraction * duration;
    $: $persistentStore.trimStartFraction = trimStart / duration;
    $: $persistentStore.trimEndFraction = trimEnd / duration;

    function onDurationChange() {
        if (!isFinite(videoEl.duration)) return;
        const updateTrimEnd = trimEnd === duration;
        duration = $persistentStore.duration = videoEl.duration;
        if (updateTrimEnd) trimEnd = duration;
    }

    function formatVideoInfo(fps, duration) {
        const fmtDuration = duration
            ? `${duration.toFixed(2)} seconds`
            : undefined;
        const fmtFps = fps ? fps + " frames/second" : undefined;
        return [fmtDuration, fmtFps].filter((s) => s).join(", ");
    }

    function getCropAnchorCorner(e) {
        const cl = e.target.classList;
        if (cl.contains("frame") || cl.contains("crop-interface-container"))
            return "center";

        if (!cl.contains("crop-anchor")) return;
        if (cl.contains("tl")) return "tl";
        else if (cl.contains("tr")) return "tr";
        else if (cl.contains("bl")) return "bl";
        else if (cl.contains("br")) return "br";
    }

    function onCropAnchorMouseDown(e) {
        if (e.button !== 0) return; // only left button
        const corner = getCropAnchorCorner(e);
        if (!corner) return;
        e.preventDefault();
        draggedCropAnchor = corner;

        anchorDragStartPageX = e.pageX;
        anchorDragStartPageY = e.pageY;
        anchorDragStartVideoX = cropX + (corner[1] === "r" ? cropW : 0);
        anchorDragStartVideoY = cropY + (corner[0] === "b" ? cropH : 0);
        anchorDragStartVideoW = cropW;
        anchorDragStartVideoH = cropH;
    }

    function onCropAnchorMouseMove(e) {
        if (e.buttons === 0) return;
        if (!draggedCropAnchor) return;

        let dx = (e.pageX - anchorDragStartPageX) / videoEl.clientWidth;
        let dy = (e.pageY - anchorDragStartPageY) / videoEl.clientHeight;

        // X component
        if (draggedCropAnchor === "center") {
            dx = Math.max(dx, -anchorDragStartVideoX);
            dx = Math.min(
                dx,
                1 - anchorDragStartVideoX - anchorDragStartVideoW,
            );
            cropX = anchorDragStartVideoX + dx;
        } else if (draggedCropAnchor[1] === "l") {
            // left side
            dx = Math.max(dx, -anchorDragStartVideoX);
            dx = Math.min(dx, anchorDragStartVideoW - minAllowedCropFraction);
            cropX = anchorDragStartVideoX + dx;
            cropW = anchorDragStartVideoW - dx;
        } else {
            // right side
            dx = Math.max(dx, minAllowedCropFraction - anchorDragStartVideoW);
            dx = Math.min(dx, 1 - anchorDragStartVideoX);
            cropW = anchorDragStartVideoX + dx - cropX;
        }

        // Y component
        if (draggedCropAnchor === "center") {
            dy = Math.max(dy, -anchorDragStartVideoY);
            dy = Math.min(
                dy,
                1 - anchorDragStartVideoY - anchorDragStartVideoH,
            );
            cropY = anchorDragStartVideoY + dy;
        } else if (draggedCropAnchor[0] === "t") {
            // top side
            dy = Math.max(dy, -anchorDragStartVideoY);
            dy = Math.min(dy, anchorDragStartVideoH - minAllowedCropFraction);
            cropY = anchorDragStartVideoY + dy;
            cropH = anchorDragStartVideoH - dy;
        } else {
            // bottom side
            dy = Math.max(dy, minAllowedCropFraction - anchorDragStartVideoH);
            dy = Math.min(dy, 1 - anchorDragStartVideoY);
            cropH = anchorDragStartVideoY + dy - cropY;
        }

        noEffectiveCrop =
            cropX === 0 && cropY === 0 && cropW === 1 && cropH === 1;

        $persistentStore.crop = { x: cropX, y: cropY, w: cropW, h: cropH };
    }

    function onCropAnchorMouseUp(e) {
        if (draggedCropAnchor) draggedCropAnchor = undefined;
    }

    function seek(dt) {
        videoEl.currentTime += dt;
    }

    function seekf(dt) {
        // seek frames
        videoEl.currentTime += dt / $recordedVideo.frameRate;
    }

    function setTrimStart() {
        trimStart = currentTime;
        if (trimStart > trimEnd - minAllowedTrimTime) trimEnd = duration;
    }

    function setTrimEnd() {
        trimEnd = currentTime;
        if (trimEnd < trimStart + minAllowedTrimTime) trimStart = 0;
    }

    function confirmCropAndTrim() {
        const opts = [];

        if (!noEffectiveCrop) {
            const vw = videoEl.videoWidth;
            const vh = videoEl.videoHeight;

            const x = Math.min(Math.max(0, Math.round(cropX * vw)), vw);
            const y = Math.min(Math.max(0, Math.round(cropY * vh)), vh);

            const w = Math.min(vw - x, Math.round(cropW * vw));
            const h = Math.min(vh - y, Math.round(cropH * vh));

            opts.push("-vf", `crop=${w}:${h}:${x}:${y}`);
        }

        if (trimStart > 0) opts.push("-ss", trimStart.toFixed(4));
        if (trimEnd < duration) opts.push("-to", trimEnd.toFixed(4));
        const trimmedDuration = trimEnd - trimStart;

        $ffmpegOpts = opts;
        $videoInfo = { trimmedDuration };

        $persistentStore.resumePlayback = videoEl.currentTime;
    }
</script>

<svelte:document
    on:mousemove={onCropAnchorMouseMove}
    on:mouseup={onCropAnchorMouseUp}
/>

<div class="editor-component">
    <div style="margin-bottom: 1em">
        Step 2: crop and trim the recording
        <button
            style="margin-inline-start: 1em; color: #ff485b"
            on:click={() => ($recordedVideo = undefined)}
        >
            Discard Recording
        </button>
    </div>
    <p>{videoInfoString}</p>
    <p>
        <label>
            <input
                name="crop-mode"
                type="checkbox"
                bind:checked={$persistentStore.cropMode}
            />
            Crop Mode
        </label>
    </p>

    <div class="video-container">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
            controls
            loop
            bind:currentTime
            bind:paused
            bind:this={videoEl}
            src={$recordedVideo.url}
            on:durationchange={onDurationChange}
        ></video>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="crop-interface-container"
            class:crop-mode-enabled={$persistentStore.cropMode}
            on:mousedown={onCropAnchorMouseDown}
            style:--crop-x="{cropX * 100}%"
            style:--crop-y="{cropY * 100}%"
            style:--crop-width="{cropW * 100}%"
            style:--crop-height="{cropH * 100}%"
            style:cursor={draggedCropAnchor ? "grabbing" : "grab"}
        >
            <div class="frame"></div>
            <div class="crop-anchor tl"></div>
            <div class="crop-anchor tr"></div>
            <div class="crop-anchor bl"></div>
            <div class="crop-anchor br"></div>
            <div class="outline" class:hide={noEffectiveCrop}></div>
        </div>
    </div>
    <div class="time-indicator">
        {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
    </div>
    <div class="seek-controls">
        <button on:click={() => seek(-1)}>◀<br />1 second</button>
        <button on:click={() => seekf(-1)}>◀<br />1 frame</button>
        <button
            on:click={() => (paused = !paused)}
            class="pause-play"
            aria-label={paused ? "Play" : "Pause"}
        >
            <PausePlayIcon {paused} />
        </button>
        <button on:click={() => seekf(1)}>▶<br />1 frame</button>
        <button on:click={() => seek(1)}>▶<br />1 second</button>
    </div>
    <div
        class="trim-controls"
        style:--trim-start="{$persistentStore.trimStartFraction * 100}%"
        style:--trim-end="{$persistentStore.trimEndFraction * 100}%"
        style:--current-time="{(currentTime / duration) * 100}%"
    >
        <button on:click={setTrimStart}>Set Trim Start</button>
        <button on:click={setTrimEnd}>Set Trim End</button>
        <div>
            Trim: from {trimStart.toFixed(2)}s until {trimEnd.toFixed(2)}s
            <br />
            Trimmed length: {(trimEnd - trimStart).toFixed(2)}s (original
            length: {duration.toFixed(2)}s)
        </div>
    </div>
    <button class="confirm" on:click={confirmCropAndTrim}>
        Confirm Crop and Trim
    </button>
</div>

<style>
    .editor-component {
        background-color: #171717;
        box-shadow: 0 2px 5px black;
        padding: 1em;
        border-radius: 1em;
        text-align: center;
        width: 600px;
        max-width: calc(95vw - 4em);
    }

    .video-container {
        position: relative;
    }

    .crop-interface-container {
        position: absolute;
        inset: 0;
        --crop-anchors-size: 50px;
    }

    .crop-interface-container:not(.crop-mode-enabled) {
        pointer-events: none;
    }

    .crop-interface-container:not(.crop-mode-enabled) .frame,
    .crop-interface-container:not(.crop-mode-enabled) .crop-anchor,
    .crop-interface-container.crop-mode-enabled .outline {
        display: none;
    }

    .crop-interface-container .frame {
        background-color: #000c;
        position: absolute;
        inset: 0;
        clip-path: polygon(
            0% 0%,
            0% 100%,
            var(--crop-x) 100%,
            var(--crop-x) var(--crop-y),
            calc(var(--crop-x) + var(--crop-width)) var(--crop-y),
            calc(var(--crop-x) + var(--crop-width))
                calc(var(--crop-y) + var(--crop-height)),
            var(--crop-x) calc(var(--crop-y) + var(--crop-height)),
            var(--crop-x) 100%,
            100% 100%,
            100% 0%
        );
    }

    .crop-anchor {
        position: absolute;
        width: var(--crop-anchors-size);
        height: var(--crop-anchors-size);
    }

    .crop-anchor:after {
        clip-path: polygon(30% 0, 30% 70%, 100% 70%, 100% 100%, 0 100%, 0 0);
        content: "";
        display: block;
        width: 100%;
        height: 100%;
        background-color: #ccc;
    }

    .crop-anchor.tl {
        left: calc(var(--crop-x) - var(--crop-anchors-size));
        top: calc(var(--crop-y) - var(--crop-anchors-size));
        rotate: -90deg;
        cursor: nwse-resize;
    }

    .crop-anchor.tr {
        left: calc(var(--crop-x) + var(--crop-width));
        top: calc(var(--crop-y) - var(--crop-anchors-size));
        cursor: nesw-resize;
    }

    .crop-anchor.bl {
        left: calc(var(--crop-x) - var(--crop-anchors-size));
        top: calc(var(--crop-y) + var(--crop-height));
        rotate: 180deg;
        cursor: nesw-resize;
    }

    .crop-anchor.br {
        left: calc(var(--crop-x) + var(--crop-width));
        top: calc(var(--crop-y) + var(--crop-height));
        rotate: 90deg;
        cursor: nwse-resize;
    }

    .crop-interface-container .outline {
        position: absolute;
        left: var(--crop-x);
        top: var(--crop-y);
        width: var(--crop-width);
        height: var(--crop-height);
        outline: 2px solid #fff7;
        box-shadow: 0 0 5px 2px black;
        border-radius: 1px;
        pointer-events: none;
    }

    .crop-interface-container .outline.hide {
        visibility: hidden;
    }

    video {
        display: block;
        width: 100%;
    }

    .time-indicator {
        text-align: end;
        margin: auto;
        margin-top: 2em;
        width: fit-content;
        min-width: 10em;
        padding-right: 4em;
    }

    .seek-controls {
        padding: 1em;
        display: flex;
        justify-content: center;
        gap: 0.5em;
        flex-wrap: wrap;
    }

    .seek-controls button {
        font-size: 80%;
    }

    .seek-controls .pause-play {
        font-size: 120%;
        border-radius: calc(0.4em / 1.2);
        padding: 0 0.7em;
    }

    .trim-controls {
        padding: 1em;
        background-color: #0c0c0c;
        border-top-left-radius: 0.5em;
        border-top-right-radius: 0.5em;
        border-bottom-left-radius: 1.5px;
        border-bottom-right-radius: 1.5px;
        position: relative;
    }

    .trim-controls:before {
        content: "";
        display: block;
        position: absolute;
        background-color: #0ec329;
        bottom: 0;
        height: 4px;
        border-radius: 1.5px;
        left: var(--trim-start);
        right: calc(100% - var(--trim-end));
    }

    .trim-controls:after {
        content: "";
        display: block;
        position: absolute;
        background-color: #fff;
        clip-path: polygon(0 0, 100% 0, 50% 100%);
        bottom: 2px;
        height: 8px;
        width: 9px;
        translate: -50% 0;
        left: var(--current-time);
    }

    .trim-controls div {
        margin-top: 1em;
    }

    button.confirm {
        margin-top: 1em;
    }
</style>
