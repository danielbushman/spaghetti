/**
 * Console entry (plan §7 T9). Mounts the shell into `#app`; everything else
 * — booting the run, starting the clock, the router — happens in App.svelte
 * on mount so a test can import the store modules without a DOM.
 */
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
