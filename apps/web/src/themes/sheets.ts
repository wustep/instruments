// The themes' sheets: all four in the page's one stylesheet, each scoped to its theme as it is built
// (vite.config.ts `themeScope`: every rule of a file under themes/<id>/ applies only under
// <html data-theme="<id>">, at the specificity it was written with). So a change of theme asks for
// nothing and waits for nothing, and the first paint is already the device's theme.
// (Their typefaces are declared here too; a browser fetches only the ones the page sets type in.)
import './base.css';
import './night-bench/styles.css';
import './night-bench/panel.css';
import './night-bench/vector.css';
import './evening-hall/styles.css';
import './evening-hall/panel.css';
import './evening-hall/vector.css';
import './day-studio/styles.css';
import './day-studio/panel.css';
import './day-studio/vector.css';
import './night-gallery/styles.css';
import './night-gallery/panel.css';
import './night-gallery/vector.css';
