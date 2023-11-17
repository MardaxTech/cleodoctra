<script lang="ts">
	import { onMount } from "svelte";

    let mounted = false;

    onMount(() => {
        mounted = true;
    });
</script>


<slot></slot>
{#if mounted}
    <footer>
        <p>© {new Date().getFullYear()} <a href="https://www.microbitdesign.com/">Microbitdesign</a> - Build by <a href="https://mardax.tech/redirect?project=cleodoctra&origin={window.location.href}">MardaxTech</a></p>
    </footer>
{/if}


<style lang="scss">
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap');

    footer {
		font-weight: 300;
		color: #fff;
		text-align: center;
		background-color: #404040;
		padding: 1.5rem 0;
		width: 100%;

		a {
			color: #fff;
			text-decoration: none;
			font-weight: 400;
			font-style: italic;
		}
	}

    @media screen and (max-width: 200px) {
        footer {
            min-width: 200px;
        }
    }

    :global(html) {
        scroll-behavior: smooth;
    }

    :global(body) {
        margin: 0;
    }

    :global(#wrapper) {
        height: fit-content;
        min-height: 100vh;
    }

    :global(p),
    :global(h1),
    :global(h2),
    :global(h3),
    :global(h4),
    :global(h5),
    :global(h6),
    :global(span),
    :global(a),
    :global(button),
    :global(input),
    :global(textarea),
    :global(select),
    :global(footer) {
        font-family: 'Poppins', sans-serif !important;
    }
</style>