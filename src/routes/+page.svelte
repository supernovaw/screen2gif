<script>
    import Editor from "$lib/Editor.svelte";
    import Encoder from "$lib/Encoder.svelte";
    import Recorder from "$lib/Recorder.svelte";
    import { tick } from "svelte";
    import { writable } from "svelte/store";
    import { slide } from "svelte/transition";

    // undefined | { url: string, size: number, frameRate: number, preliminaryDuration: number, blob: Blob }
    const recordedVideo = writable(undefined);
    // undefined | string[]
    const ffmpegOpts = writable(undefined);
    // undefined | { trimmedDuration: number }
    const videoInfo = writable(undefined);
</script>

<main>
    {#if !$recordedVideo}
        <div in:slide={{ duration: 300 }} out:slide={{ duration: 300 }}>
            <Recorder {recordedVideo} />
        </div>
    {:else if !$ffmpegOpts}
        <div in:slide={{ duration: 300 }} out:slide={{ duration: 300 }}>
            {#key $recordedVideo.url}
                <Editor {recordedVideo} {ffmpegOpts} {videoInfo} />
            {/key}
        </div>
    {:else}
        <div in:slide={{ duration: 300 }} out:slide={{ duration: 300 }}>
            <Encoder {recordedVideo} {ffmpegOpts} {videoInfo} />
        </div>
    {/if}
</main>

<style>
    main {
        max-width: 800px;
        margin: auto;
        padding: 20px;
        box-sizing: border-box;
        min-height: 100svh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
</style>
