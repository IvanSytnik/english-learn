/** localStorage key holding an explicit `'light' | 'dark'` choice; absent = follow the OS. */
export const THEME_STORAGE_KEY = 'theme';

/**
 * Runs inline in <head> before first paint (app/layout.tsx): applies a stored
 * choice as `data-theme` on <html>, which tokens.css honours over the OS
 * preference. Anything else — no value, a stale value, storage blocked — leaves
 * the attribute off. Kept as a string so the layout can inline it unchanged.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
