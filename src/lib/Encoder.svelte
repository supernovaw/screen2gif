<script>
    import { slide } from "svelte/transition";
    import Ellipsis from "./Ellipsis.svelte";
    import { cancel, encode, getStderrLog } from "./encoder";
    import { writable } from "svelte/store";

    const formatNames = { gif: "GIF", mp4: "MP4", mkv: "MKV", webm: "WebM" };
    const formatTypes = {
        gif: "image/gif",
        mp4: "video/mp4",
        mkv: "video/x-matroska",
        webm: "video/webm",
    };

    // writable({ url: string, size: number, frameRate: number, blob: Blob })
    export let recordedVideo;
    // writable(string[])
    export let ffmpegOpts;
    // writable({ trimmedDuration: number })
    export let videoInfo;

    let selectedFormat = "gif";
    $: selectedFormatName = formatNames[selectedFormat];
    let changeSpeedChecked = false;
    let speedupFactor = 1;

    let dialogEl;

    const encodingState = writable(); // loading|encoding|success
    const progress = writable(0); // [0..1]
    let resultUrl;
    let errorMessage;
    let shownStderrLog;

    $: videoDur = $videoInfo.trimmedDuration.toFixed(2);
    $: videoDurNew = (
        typeof speedupFactor === "number" && speedupFactor > 0
            ? $videoInfo.trimmedDuration / speedupFactor
            : $videoInfo.trimmedDuration
    ).toFixed(2);

    function addSpeedOpts(opts) {
        if (
            !changeSpeedChecked ||
            speedupFactor === 1 ||
            !isFinite(speedupFactor) ||
            speedupFactor <= 0
        )
            return;

        const vf = "setpts=PTS/" + speedupFactor;

        let i = opts.indexOf("-vf");
        if (i === -1) opts.push("-vf", vf);
        else opts[i + 1] += "," + vf;
    }

    async function convert() {
        dialogEl.showModal();
        addSpeedOpts($ffmpegOpts);
        try {
            const uint8arr = await encode(
                $ffmpegOpts,
                $recordedVideo.blob,
                selectedFormat,
                (s) => ($encodingState = s),
                (p) => ($progress = p),
            );
            resultUrl = URL.createObjectURL(
                new Blob([uint8arr.buffer], {
                    type: formatTypes[selectedFormat],
                }),
            );
        } catch (e) {
            $encodingState = "error";
            errorMessage = String(e);
        }
    }

    function download() {
        const link = document.createElement("a");
        link.href = resultUrl;
        link.download = "Screen recording." + selectedFormat;
        link.click();
    }

    function closeDialog() {
        $encodingState = undefined;
        $progress = 0;
        dialogEl.close();
    }

    function cancelEncoding() {
        cancel();
        closeDialog();
    }
</script>

<svelte:window
    on:keypress={(e) => {
        if (e.code === "KeyL" && e.ctrlKey && e.shiftKey)
            shownStderrLog = getStderrLog();
    }}
/>

<div class="encoder-component">
    <div class="title">Step 3: convert and save</div>
    <div class="speed">
        <label>
            Change speed
            <input
                name="change-speed"
                type="checkbox"
                bind:checked={changeSpeedChecked}
            />
        </label>
        {#if changeSpeedChecked}
            <div in:slide={{ duration: 300 }} out:slide={{ duration: 300 }}>
                <label
                    title="To slow the video down, specify a number less than 1 (e.g. 0.8)"
                >
                    Speed up by a factor of <input
                        style="width: 4em"
                        type="number"
                        min="0.1"
                        max="10"
                        step="0.1"
                        name="speed"
                        bind:value={speedupFactor}
                    />.
                </label>
                <div>
                    {#if typeof speedupFactor !== "number" || speedupFactor === 1 || speedupFactor <= 0}
                        The length is {videoDur}s.
                    {:else}
                        The length will be
                        {speedupFactor > 1 ? "contracted" : "extended"} to {videoDurNew}s
                        (from {videoDur}s).
                    {/if}
                </div>
                <div>
                    {#if typeof speedupFactor !== "number" || speedupFactor === 1 || speedupFactor <= 0}
                        Frame rate is {$recordedVideo.frameRate} per second.
                    {:else}
                        Frame rate will be
                        {+($recordedVideo.frameRate * speedupFactor).toFixed(2)}
                        per second (instead of
                        {+$recordedVideo.frameRate.toFixed(2)}).
                    {/if}
                </div>
            </div>
        {/if}
    </div>

    <div class="bottom-controls">
        <button on:click={convert}>Convert to {selectedFormatName}</button>
        <label>
            (format:
            <select bind:value={selectedFormat} name="format">
                <option value="gif">.gif</option>
                <option value="mp4">.mp4</option>
                <option value="mkv">.mkv</option>
                <option value="webm">.webm</option>
            </select>)
        </label>
        <div style="flex: 1"></div>
        <button on:click={() => ($ffmpegOpts = undefined)}>Go Back</button>
    </div>
    {#if selectedFormat !== "gif"}
        <div
            in:slide={{ duration: 300 }}
            out:slide={{ duration: 300 }}
            style="padding-top: 1em"
        >
            Saving to other formats don't work most of the time :(
        </div>
    {/if}

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <dialog
        bind:this={dialogEl}
        on:cancel|preventDefault
        on:keydown={(e) => e.key === "Escape" && e.preventDefault()}
        style:--progress="{$progress * 100}%"
        style:--indicate-progress={$encodingState === "encoding" ? 1 : 0}
    >
        {#if $encodingState === "loading"}
            Loading<Ellipsis />
        {:else if $encodingState === "encoding"}
            Encoding<Ellipsis />
            <div style="text-align: center">
                {($progress * 100).toFixed()}%
                <br />
                <button
                    on:click={cancelEncoding}
                    style="font-size: 50%; color: #ff485b"
                >
                    Cancel
                </button>
            </div>
        {:else if $encodingState === "success"}
            {#if selectedFormat === "gif"}
                <img alt="Result" src={resultUrl} />
            {:else}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video autoplay loop controls src={resultUrl}></video>
            {/if}
            <div
                style="font-size: 50%; display: flex; justify-content: space-between; gap: 1em; flex-wrap: wrap"
            >
                <button
                    on:click={download}
                    title="You can also just drag the GIF to your desktop"
                >
                    Download
                </button>
                <button on:click={closeDialog} style="color: #ff485b">
                    Close
                </button>
            </div>
        {:else if $encodingState === "error"}
            {errorMessage}
            <div style="text-align: center; font-size: 50%">
                <button on:click={cancelEncoding}>Close</button>
            </div>
        {/if}
    </dialog>
</div>

<div style="min-width: 90vw">
    {#if shownStderrLog}
        <div class="stderr-log">{shownStderrLog}</div>
    {/if}
</div>

<style>
    .encoder-component {
        background-color: #171717;
        box-shadow: 0 2px 5px black;
        padding: 1em;
        margin: auto;
        margin-top: 1em;
        border-radius: 1em;
        max-width: 500px;
    }

    .title {
        margin-bottom: 0.5em;
        text-align: center;
    }

    select,
    input {
        font: inherit;
    }

    .speed {
        display: inline-block;
        border-radius: 0.5em;
        padding: 0.5em 0.8em;
        background-color: #111;
        box-shadow: 0 1px 3px black;
    }

    .bottom-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 1em;
        margin-top: 1em;
    }

    dialog {
        border: none;
        outline: none;
        background: linear-gradient(60deg, #4447, #37373777, #3337, #2227);
        background-color: #333a;
        max-width: 70%;
        box-sizing: border-box;
        padding: 2em;
        border-radius: 0.4em;
        box-shadow: 0 3px 10px black;
        position: relative;
        font-size: 200%;
        overflow: hidden;
    }

    dialog:before {
        content: "";
        position: absolute;
        right: 100%;
        width: 100%;
        top: 0;
        height: 100%;
        translate: var(--progress) 0;
        opacity: var(--indicate-progress);
        background-color: #00ff1a1e;
        pointer-events: none;
        transition: 0.5s ease-out translate;
        z-index: -1;
    }

    dialog::backdrop {
        backdrop-filter: contrast(1.02) blur(5px);
    }

    img,
    video {
        max-width: 100%;
        max-height: calc(80svh - 4em);
    }

    .stderr-log {
        font-family: "Inconsolata Nerd Font Mono", "SF Mono", monospace;
        white-space: pre-wrap;
        font-size: 80%;
        margin: 1.5em auto;
        width: fit-content;
    }
</style>
