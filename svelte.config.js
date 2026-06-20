import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Plain Svelte 5 (NOT SvelteKit). Only compilerOptions + preprocess here.
export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true
  }
};
