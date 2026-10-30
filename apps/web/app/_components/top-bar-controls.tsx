import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';

/** Language and theme, the same in every top bar (landing, dashboard, words, settings). */
export function TopBarControls() {
  return (
    <div className="flex items-center gap-1" data-top-bar-controls="">
      <LocaleSwitcher />
      <ThemeToggle />
    </div>
  );
}
