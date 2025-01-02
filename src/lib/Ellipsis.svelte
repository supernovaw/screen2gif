<span class="s1">.</span><span class="s2">.</span><span class="s3">.</span>

<style>
    @keyframes k1 {
        0% { opacity: 0 }
        25% { opacity: 1 }
        75% { opacity: 1 }
        100% { opacity: 0 }
    }

    @keyframes k2 {
        0% { opacity: 0 }
        25% { opacity: 0 }
        50% { opacity: 1 }
        75% { opacity: 1 }
        100% { opacity: 0 }
    }

    @keyframes k3 {
        0% { opacity: 0 }
        50% { opacity: 0 }
        75% { opacity: 1 }
        100% { opacity: 0 }
    }

    .s1 { animation: 1s linear 0s infinite running k1 }
    .s2 { animation: 1s linear 0s infinite running k2 }
    .s3 { animation: 1s linear 0s infinite running k3 }
    span { user-select: none }
</style>
