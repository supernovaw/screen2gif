<script>
    export let paused;
</script>

<div class:paused></div>

<style>
    div {
        height: 1em;
        aspect-ratio: 4 / 5;
        position: relative;
    }

    div:before,
    div:after {
        content: "";
        background-color: white;
        position: absolute;
        inset: 0;
        transition: clip-path 0.1s ease-in;
    }

    div:before {
        clip-path: polygon(0 0, 30% 0, 30% 100%, 0% 100%);
    }

    div:after {
        clip-path: polygon(70% 0, 100% 0, 100% 100%, 70% 100%);
    }

    div.paused:before {
        clip-path: polygon(0 0, 52% 26%, 52% 74%, 0 100%);
    }

    div.paused:after {
        clip-path: polygon(48% 24%, 100% 50%, 100% 50%, 48% 76%);
    }
</style>
