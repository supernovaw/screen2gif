import { FFmpeg } from "@ffmpeg/ffmpeg";
import { base } from "$app/paths";

let ffmpegState = "unloaded"; // unloaded|loading|running|standby
let ffmpeg;
let ffmpegLoadPromise;
let reportProgress;
let expectedDuration;
let stderrLog;

async function toBlobURL(url, mimeType) {
    const buf = await (await fetch(url)).arrayBuffer();
    const blob = new Blob([buf], { type: mimeType });
    return URL.createObjectURL(blob);
}

export function determineVideoContainer() {
    /* Chromium(-based): both mp4 and webm are supported, however, when using webm,
     * the <video> player fails to indicate the duration (and only shows current time)
     * until the video almost finishes playing. This prevents seeking from working
     * properly at first and is annoying. Therefore, on Chromium, use mp4.
     * 
     * Safari: only mp4 is supported
     *
     * Firefox(-based): only webm is supported, and the above issue doesn't happen. */

    if (window.safari)
        return "mp4";
    if (window.navigator.userAgent.includes(" Chrome/"))
        return "mp4";
    return "webm";
}

// Because the 30+ MB file `ffmpeg-core.wasm` doesn't get cached,
// I segment it into smaller files so that they get cached, and then I reassemble the file.
async function segmentedToBlobURL(urls, mimeType) {
    const buffers = await Promise.all(
        urls.map(url => fetch(url).then(res => res.arrayBuffer()))
    );
    const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
        combined.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
    }
    const blob = new Blob([combined], { type: mimeType });
    return URL.createObjectURL(blob);
}

// produced using /usr/bin/split; original (combined) file was `ffmpeg-core.wasm`
// SHA256 of combined file = 6a6863fa9f08ee79c47363547421e12a90624b9bbbd8c10ebf7d5967cab14649
// each piece (except trailing) is 4 MiB; full size = 32609891 B
const wasmSegments = [
    base + "/ffmpeg/ffmpeg-core_seg0.wasm",
    base + "/ffmpeg/ffmpeg-core_seg1.wasm",
    base + "/ffmpeg/ffmpeg-core_seg2.wasm",
    base + "/ffmpeg/ffmpeg-core_seg3.wasm",
    base + "/ffmpeg/ffmpeg-core_seg4.wasm",
    base + "/ffmpeg/ffmpeg-core_seg5.wasm",
    base + "/ffmpeg/ffmpeg-core_seg6.wasm",
    base + "/ffmpeg/ffmpeg-core_seg7.wasm",
];

function stderrLogHandler(message) {
    stderrLog.push(message);
    let m = message.match(/^frame=.* time=(\d\d):(\d\d):(\d\d)\.(\d\d) /);
    if (reportProgress && m) {
        const hr = +m[1] * 3600;
        const min = +m[2] * 60;
        const sec = +m[3];
        const frac = +m[4] / 100;
        const totalSec = hr + min + sec + frac;
        const progress = totalSec / expectedDuration;
        if (progress >= 0 && progress <= 1)
            reportProgress(progress);
    }
}

export async function loadFfmpeg() {
    let resolve, reject;
    ffmpegLoadPromise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });

    try {
        if (ffmpegState !== "unloaded") return;
        ffmpegState = "loading";

        ffmpeg = new FFmpeg();
        ffmpeg.on("log", ({ message }) => stderrLogHandler(message));
        await ffmpeg.load({
            coreURL: await toBlobURL(base + "/ffmpeg/ffmpeg-core.js", "text/javascript"),
            wasmURL: await segmentedToBlobURL(wasmSegments, "application/wasm"),
            workerURL: await toBlobURL(base + "/ffmpeg/ffmpeg-core.worker.js", "text/javascript"),
            classWorkerURL: base + "/ffmpeg/w/worker.js",
        });
        ffmpegState = "standby";
        resolve();
    } catch (e) {
        reportError?.(String(e));
        reject();
    }
}

export async function encode(ffmpegOpts, blob, format, reportStateCallback, reportProgressCallback, expectedDur) {
    const srcFilename = "recording." + determineVideoContainer();
    const dstFilename = "result." + format;
    const command = ["-i", srcFilename, ...ffmpegOpts, dstFilename];
    stderrLog = ["// ffmpeg " + command.join(" ")];

    expectedDuration = expectedDur;
    reportProgress = reportProgressCallback;
    reportProgressCallback(0);
    if (ffmpegState === "unloaded") {
        reportStateCallback("loading");
        await loadFfmpeg();
    } else if (ffmpegState === "loading") {
        reportStateCallback("loading");
        await ffmpegLoadPromise;
    } else if (ffmpegState === "running") {
        throw Error("double invocation of encoder");
    }
    reportStateCallback("encoding");

    try {
        ffmpegState = "running";

        // just in case
        await ffmpeg.deleteFile(srcFilename).catch(() => { });
        await ffmpeg.deleteFile(dstFilename).catch(() => { });

        ffmpeg.writeFile(srcFilename, new Uint8Array(await blob.arrayBuffer()));
        await ffmpeg.exec(command);
        const result = ffmpeg.readFile(dstFilename);

        reportStateCallback("success");
        reportProgressCallback(1);
        return result;
    } catch (e) {
        if (e.message?.startsWith("ffmpeg is not loaded,"))
            loadFfmpeg();
        throw e;
    } finally {
        if (stderrLog.at(-1)?.match(/^Aborted\(.+\)/))
            throw new Error(stderrLog.at(-1));
        if (ffmpegState !== "unloaded")
            ffmpegState = "standby";
    }
}

export function cancel() {
    ffmpeg.terminate();
    ffmpegState = "unloaded";
}

export function getStderrLog() {
    return stderrLog?.join("\n") ?? "<empty>";
}
