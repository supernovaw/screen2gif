<script>
    import { tick } from "svelte";
    import { fade } from "svelte/transition";
    import { determineVideoContainer } from "./encoder";

    // writable({ url: string, size: number, frameRate: number, preliminaryDuration: number, blob: Blob })
    export let recordedVideo;

    let isRecording;
    let recordingError;
    let stop;

    let isPaused;
    let pause;
    let resume;
    // if recording, it is the start timestamp; if paused/stopped, it is recorded duration
    // if resumed, it is the start timestamp + time elapsed while paused (all in milliseconds)
    let recordTime;
    let tickerIntervalId;
    let stopwatchString = "";

    function shareScreen() {
        if (isRecording) return;
        recordingError = undefined;
        window.navigator.mediaDevices
            .getDisplayMedia({ audio: false })
            .then(recordScreen)
            .catch((e) => (recordingError = e.message));
    }

    function recordScreen(stream) {
        const recorder = new MediaRecorder(stream, {
            mimeType: "video/" + determineVideoContainer(),
        });
        recorder.start();
        isRecording = true;
        isPaused = false;
        stop = () => recorder.requestData();
        const { frameRate } = stream.getVideoTracks()[0].getSettings();
        recordTime = +new Date();

        pause = () => {
            if (isPaused) return;
            recorder.pause();
            isPaused = true;
            recordTime = +new Date() - recordTime;
            stopStopwatchTicker();
        };
        resume = () => {
            if (!isPaused) return;
            recorder.resume();
            isPaused = false;
            recordTime = +new Date() - recordTime;
            startStopwatchTicker();
        };
        stopwatchString = "";
        startStopwatchTicker();

        recorder.onstop = () => {
            isRecording = false;
            stop = pause = resume = undefined;
            recordTime = +new Date() - recordTime;
            stopStopwatchTicker();
        };
        recorder.ondataavailable = ({ data }) => {
            // when finished recording
            const elapsedMs =
                !isRecording || isPaused
                    ? recordTime
                    : +new Date() - recordTime;
            const preliminaryDuration = elapsedMs / 1000;

            $recordedVideo = {
                url: URL.createObjectURL(data),
                size: data.size,
                frameRate,
                preliminaryDuration,
                blob: data,
            };
        };
    }

    function startStopwatchTicker() {
        if (tickerIntervalId) clearInterval(tickerIntervalId);
        tickerIntervalId = setInterval(stopwatchTick, 20);
    }

    function stopStopwatchTicker() {
        clearInterval(tickerIntervalId);
        tickerIntervalId = undefined;
    }

    function stopwatchTick() {
        const elapsedMs =
            !isRecording || isPaused ? recordTime : +new Date() - recordTime;
        const elapsedS = elapsedMs / 1000;

        const minutes = String(Math.floor(elapsedS / 60));
        const seconds = String(Math.floor(elapsedS) % 60).padStart(2, "0");
        const fraction = String(Math.floor((elapsedS % 1) * 10));

        stopwatchString = `${minutes}:${seconds}.${fraction}`;
    }
</script>

<div class="recorder-component">
    <div style="margin-bottom: 1em">Step 1: record your screen</div>

    {#if !isRecording}
        <button on:click={shareScreen}>Record</button>
    {:else}
        <button on:click={stop}>Stop Recording</button>
        {#if !isPaused}
            <button on:click={pause}>Pause</button>
        {:else}
            <button on:click={resume}>Resume</button>
        {/if}
        <div class="stopwatch">
            {stopwatchString}
        </div>
    {/if}

    {#if recordingError}
        <div
            class="error"
            in:fade={{ duration: 100 }}
            out:fade={{ duration: 100 }}
        >
            Error: {recordingError}
        </div>
    {/if}
</div>

<style>
    .recorder-component {
        background-color: #171717;
        box-shadow: 0 2px 5px black;
        padding: 3em;
        border-radius: 1em;
        text-align: center;
    }

    .stopwatch {
        display: inline-block;
        min-width: 4em;
        text-align: start;
        margin-inline-start: 1em;
        user-select: none;
        cursor: normal;
    }

    .error {
        display: inline-block;
        margin-inline-start: 1em;
    }
</style>
